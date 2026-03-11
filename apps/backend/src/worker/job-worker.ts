import { formatCompactItinerary, type DestinationDetection } from '@ta/shared';
import { env } from '../lib/config.js';
import { AppError, toErrorMessage } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  createBotEvent,
  getJobById,
  insertDetections,
  listQueuedJobs,
  lockJobForProcessing,
  markJobCompleted,
  markJobFailed,
  replaceItinerary,
} from '../lib/db.js';
import { detectDestinationsFromFrames, generateThreeDayItinerary } from '../lib/gemini.js';
import { cleanupTempPaths, downloadVideoToTemp, extractFrames, loadFramesBase64 } from '../lib/video.js';
import { formatFromDetailsForCompact, sendJobCompletedMessage, sendJobFailedMessage, sendJobStartedMessage } from '../bot/telegram.js';

class JobWorker {
  private timer: NodeJS.Timeout | null = null;
  private processing = new Set<string>();
  private forcedQueue: string[] = [];

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        logger.error({ error: toErrorMessage(error) }, 'worker tick failed');
      });
    }, env.QUEUE_POLL_INTERVAL_MS);

    this.tick().catch((error) => {
      logger.error({ error: toErrorMessage(error) }, 'initial worker tick failed');
    });
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  enqueue(jobId: string): void {
    if (!this.forcedQueue.includes(jobId)) {
      this.forcedQueue.push(jobId);
    }
    void this.tick();
  }

  private async tick(): Promise<void> {
    const immediateJobs = [...this.forcedQueue];
    this.forcedQueue = [];

    for (const jobId of immediateJobs) {
      if (!this.processing.has(jobId)) {
        this.processing.add(jobId);
        void this.runJob(jobId).finally(() => this.processing.delete(jobId));
      }
    }

    const queuedJobs = await listQueuedJobs(5);
    for (const job of queuedJobs) {
      if (this.processing.has(job.id)) {
        continue;
      }
      this.processing.add(job.id);
      void this.runJob(job.id).finally(() => this.processing.delete(job.id));
    }
  }

  private async runJob(jobId: string): Promise<void> {
    const locked = await lockJobForProcessing(jobId);
    if (!locked) {
      return;
    }

    const cleanupTargets: string[] = [];

    try {
      await createBotEvent({
        jobId,
        chatId: locked.telegram_chat_id ?? undefined,
        eventType: 'job_processing_started',
        direction: 'system',
        payload: {
          attempt: locked.attempt,
          platform: locked.platform,
        },
      });

      if (locked.telegram_chat_id) {
        await sendJobStartedMessage(locked.telegram_chat_id);
      }

      const { tempDir, videoPath } = await downloadVideoToTemp(locked.cleaned_url ?? locked.raw_url);
      cleanupTargets.push(tempDir);

      const { framePaths, framesDir } = await extractFrames(
        videoPath,
        env.VISION_FRAME_RATE,
        env.VISION_MAX_FRAMES,
      );
      cleanupTargets.push(framesDir);

      const framePayloads = await loadFramesBase64(framePaths);
      const detections = await detectDestinationsFromFrames(framePayloads, env.VISION_MIN_CONFIDENCE);

      await insertDetections(jobId, detections);

      const itinerary = await generateThreeDayItinerary(detections);
      const summary = formatCompactItinerary(itinerary);
      await replaceItinerary(jobId, itinerary, summary);

      await markJobCompleted(jobId, detections.length, {
        framesProcessed: framePayloads.length,
        topDestinations: topDestinations(detections),
      });

      await createBotEvent({
        jobId,
        chatId: locked.telegram_chat_id ?? undefined,
        eventType: 'job_completed',
        direction: 'system',
        payload: {
          detections: detections.length,
          framesProcessed: framePayloads.length,
        },
      });

      if (locked.telegram_chat_id) {
        await sendJobCompletedMessage({
          chatId: locked.telegram_chat_id,
          jobId,
          itinerarySummary: formatFromDetailsForCompact(itinerary),
        });
      }
    } catch (error) {
      const appError = mapToAppError(error);
      logger.error({ jobId, code: appError.code, error: appError.message }, 'job failed');

      await markJobFailed(jobId, appError.code, appError.message);
      await createBotEvent({
        jobId,
        chatId: locked.telegram_chat_id ?? undefined,
        eventType: 'job_failed',
        direction: 'system',
        payload: {
          code: appError.code,
          message: appError.message,
        },
      });

      if (locked.telegram_chat_id) {
        await sendJobFailedMessage(
          locked.telegram_chat_id,
          `Processing failed (${appError.code}): ${appError.message}\nPlease retry with another public link.`,
        );
      }
    } finally {
      await cleanupTempPaths(cleanupTargets);
    }
  }
}

function mapToAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError('ITINERARY_FAILED', toErrorMessage(error), 500);
}

function topDestinations(detections: DestinationDetection[]): string[] {
  return detections.slice(0, 6).map((item) => item.destination);
}

export const jobWorker = new JobWorker();

export async function enqueueExistingJob(jobId: string): Promise<void> {
  const job = await getJobById(jobId);
  if (!job) {
    throw new AppError('INVALID_URL', 'Job not found for enqueue.');
  }
  jobWorker.enqueue(job.id);
}
