import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ path: '../../.env' });
loadEnv();

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DASHBOARD_ORIGIN: z.string().url().default('http://localhost:3000'),
  PUBLIC_BACKEND_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  YTDLP_COOKIES_B64: z.string().optional(),
  INSTAGRAM_COOKIES_B64: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  QUEUE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(4000),
  VISION_FRAME_RATE: z.coerce.number().positive().default(1),
  VISION_MAX_FRAMES: z.coerce.number().int().positive().default(12),
  VISION_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.55),
  GEMINI_QUOTA_COOLDOWN_MS: z.coerce.number().int().positive().default(600000),
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
  throw new Error(`Invalid environment configuration: ${message}`);
}

export const env = parsed.data;
