import express from 'express';
import cors from 'cors';
import { env } from './lib/config.js';
import { logger } from './lib/logger.js';
import { apiRouter } from './api/router.js';
import { registerBotHandlers } from './bot/telegram.js';
import { jobWorker } from './worker/job-worker.js';

const app = express();

app.use(
  cors({
    origin: env.DASHBOARD_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json({ limit: '20mb' }));

registerBotHandlers((jobId) => {
  jobWorker.enqueue(jobId);
});

app.use('/api', apiRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  void next;
  logger.error({ error }, 'unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(env.PORT, () => {
  logger.info(`Backend listening on port ${env.PORT}`);
});

jobWorker.start();

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  jobWorker.stop();
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
