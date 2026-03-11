import { Telegraf, Markup } from 'telegraf';
import type { Context } from 'telegraf';
import { buildCallbackPayload, formatCompactItinerary, formatDetailedItinerary, parseCallbackPayload } from '@ta/shared';
import { env } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { AppError, toErrorMessage } from '../lib/errors.js';
import {
  confirmItinerary,
  createBotEvent,
  createJob,
  getItineraryByJobId,
  getJobById,
  upsertTelegramUser,
} from '../lib/db.js';
import { cleanAndValidateVideoUrl, extractFirstUrl, verifyUrlAccessible } from '../lib/url.js';

export type QueueEnqueueFn = (jobId: string) => void;

export const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

async function sendBotMessage(ctx: Context, text: string): Promise<number | null> {
  const message = await ctx.reply(text);
  return message.message_id;
}

export function registerBotHandlers(enqueue: QueueEnqueueFn): void {
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const chatId = ctx.chat?.id;
    const tgUser = ctx.from;

    await createBotEvent({
      chatId,
      telegramUserId: tgUser?.id,
      eventType: 'incoming_text',
      direction: 'inbound',
      payload: { text },
    }).catch((error) => logger.warn({ error: toErrorMessage(error) }, 'failed to store inbound bot event'));

    if (!text) {
      await sendBotMessage(ctx, 'Please send a TikTok, Instagram Reel, or Douyin video URL.');
      return;
    }

    const extractedUrl = extractFirstUrl(text);
    if (!extractedUrl) {
      await sendBotMessage(
        ctx,
        'I could not find a URL in your message. Please send one TikTok, Instagram Reel, or Douyin video link.',
      );
      return;
    }

    try {
      const { cleanedUrl, platform } = cleanAndValidateVideoUrl(extractedUrl);
      await verifyUrlAccessible(cleanedUrl);

      const user = tgUser
        ? await upsertTelegramUser({
            telegramUserId: tgUser.id,
            username: tgUser.username,
            firstName: tgUser.first_name,
            lastName: tgUser.last_name,
          })
        : null;

      const processingMsgId = await sendBotMessage(ctx, 'URL validated. Processing started. This may take around 1-2 minutes...');

      const job = await createJob({
        userId: user?.id,
        source: 'telegram',
        rawUrl: extractedUrl,
        cleanedUrl,
        platform,
        chatId,
        messageId: processingMsgId ?? undefined,
      });

      await createBotEvent({
        jobId: job.id,
        chatId,
        telegramUserId: tgUser?.id,
        eventType: 'job_created',
        direction: 'system',
        payload: {
          rawUrl: extractedUrl,
          cleanedUrl,
          platform,
          source: 'telegram',
        },
      });

      enqueue(job.id);
    } catch (error) {
      const message =
        error instanceof AppError
          ? error.message
          : `Failed to process URL. Please retry with a public link. (${toErrorMessage(error)})`;
      await sendBotMessage(ctx, message);
    }
  });

  bot.on('callback_query', async (ctx) => {
    const callbackData = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
    const parsed = parseCallbackPayload(callbackData ?? '');

    if (!parsed) {
      await ctx.answerCbQuery('Invalid action payload');
      return;
    }

    const job = await getJobById(parsed.jobId);
    if (!job) {
      await ctx.answerCbQuery('Job not found');
      return;
    }

    switch (parsed.action) {
      case 'confirm': {
        await confirmItinerary(parsed.jobId);
        await ctx.answerCbQuery('Itinerary confirmed');
        await ctx.reply('Confirmed. Saved for your trip planning.');
        break;
      }
      case 'retry': {
        const rawUrl = job.cleaned_url ?? job.raw_url;
        try {
          const { cleanedUrl, platform } = cleanAndValidateVideoUrl(rawUrl);
          const retryJob = await createJob({
            userId: job.user_id ?? undefined,
            source: 'telegram',
            rawUrl,
            cleanedUrl,
            platform,
            chatId: job.telegram_chat_id ?? undefined,
            attempt: job.attempt + 1,
          });
          enqueue(retryJob.id);
          await ctx.answerCbQuery('Retry started');
          await ctx.reply('Retry job queued. I will send the refreshed itinerary soon.');
        } catch (error) {
          await ctx.answerCbQuery('Retry failed');
          await ctx.reply(`Retry failed: ${toErrorMessage(error)}`);
        }
        break;
      }
      case 'details': {
        const itinerary = await getItineraryByJobId(parsed.jobId);
        if (!itinerary) {
          await ctx.answerCbQuery('No itinerary found');
          return;
        }
        await ctx.answerCbQuery('Showing details');
        await ctx.reply(formatDetailedItinerary(itinerary.details_json));
        break;
      }
      default: {
        await ctx.answerCbQuery('Unsupported action');
      }
    }
  });
}

export async function sendJobCompletedMessage(params: {
  chatId: number;
  jobId: string;
  itinerarySummary: string;
}): Promise<void> {
  await bot.telegram.sendMessage(params.chatId, params.itinerarySummary, {
    reply_markup: Markup.inlineKeyboard([
      [
        Markup.button.callback('Confirm', buildCallbackPayload('confirm', params.jobId)),
        Markup.button.callback('Retry', buildCallbackPayload('retry', params.jobId)),
      ],
      [Markup.button.callback('More details', buildCallbackPayload('details', params.jobId))],
    ]).reply_markup,
  });
}

export async function sendJobFailedMessage(chatId: number, message: string): Promise<void> {
  await bot.telegram.sendMessage(chatId, message);
}

export async function sendJobStartedMessage(chatId: number): Promise<void> {
  await bot.telegram.sendMessage(chatId, 'Processing your video now. I will send your itinerary shortly.');
}

export function formatSummaryMessage(summary: string): string {
  return summary;
}

export function formatFromDetailsForCompact(itinerary: Parameters<typeof formatCompactItinerary>[0]): string {
  return formatCompactItinerary(itinerary);
}

export async function processWebhookUpdate(update: unknown): Promise<void> {
  await bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0]);
}
