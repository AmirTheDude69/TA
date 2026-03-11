import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../lib/auth.js';
import { env } from '../lib/config.js';
import { AppError, toErrorMessage } from '../lib/errors.js';
import {
  createBotEvent,
  createJob,
  createQueuedJobWithoutUser,
  getBotEventsByJobId,
  getDetectionsByJobId,
  getItineraryByJobId,
  getJobById,
  listJobs,
  listUsers,
} from '../lib/db.js';
import { cleanAndValidateVideoUrl, verifyUrlAccessible } from '../lib/url.js';
import { processWebhookUpdate } from '../bot/telegram.js';
import { enqueueExistingJob, jobWorker } from '../worker/job-worker.js';

const createJobBodySchema = z.object({
  url: z.string().min(1),
});

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'travel-ai-agent-backend' });
});

apiRouter.post('/telegram/webhook/:secret', async (req, res) => {
  if (req.params.secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    res.status(403).json({ error: 'Invalid webhook secret' });
    return;
  }

  try {
    await processWebhookUpdate(req.body);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: toErrorMessage(error) });
  }
});

apiRouter.use(requireAdmin);

apiRouter.get('/jobs', async (req, res) => {
  try {
    const jobs = await listJobs({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      platform: typeof req.query.platform === 'string' ? req.query.platform : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
    });
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: toErrorMessage(error) });
  }
});

apiRouter.get('/jobs/:id', async (req, res) => {
  try {
    const job = await getJobById(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const [detections, itinerary, events] = await Promise.all([
      getDetectionsByJobId(job.id),
      getItineraryByJobId(job.id),
      getBotEventsByJobId(job.id),
    ]);

    res.json({
      job,
      detections,
      itinerary,
      events,
    });
  } catch (error) {
    res.status(500).json({ error: toErrorMessage(error) });
  }
});

apiRouter.post('/jobs', async (req, res) => {
  try {
    const parsed = createJobBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join(', ') });
      return;
    }

    const { cleanedUrl, platform } = cleanAndValidateVideoUrl(parsed.data.url);
    await verifyUrlAccessible(cleanedUrl);

    const job = await createQueuedJobWithoutUser({
      source: 'dashboard',
      rawUrl: parsed.data.url,
      cleanedUrl,
      platform,
    });

    await createBotEvent({
      jobId: job.id,
      eventType: 'dashboard_job_created',
      direction: 'system',
      payload: {
        source: 'dashboard',
      },
    });

    jobWorker.enqueue(job.id);
    res.status(201).json({ job });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({ error: toErrorMessage(error) });
  }
});

apiRouter.post('/jobs/:id/retry', async (req, res) => {
  try {
    const job = await getJobById(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const rawUrl = job.cleaned_url ?? job.raw_url;
    const { cleanedUrl, platform } = cleanAndValidateVideoUrl(rawUrl);
    await verifyUrlAccessible(cleanedUrl);

    const retryJob = await createJob({
      userId: job.user_id ?? undefined,
      source: 'dashboard',
      rawUrl,
      cleanedUrl,
      platform,
      chatId: job.telegram_chat_id ?? undefined,
      attempt: job.attempt + 1,
    });

    await enqueueExistingJob(retryJob.id);

    res.status(201).json({ job: retryJob });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({ error: toErrorMessage(error) });
  }
});

apiRouter.get('/users', async (_req, res) => {
  try {
    const users = await listUsers();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: toErrorMessage(error) });
  }
});
