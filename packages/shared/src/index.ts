import { z } from 'zod';

export const PlatformSchema = z.enum(['tiktok', 'instagram_reel', 'douyin']);
export type Platform = z.infer<typeof PlatformSchema>;

export const JobStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const ErrorCodeSchema = z.enum([
  'INVALID_URL',
  'UNSUPPORTED_PLATFORM',
  'DOWNLOAD_FAILED',
  'VISION_FAILED',
  'NO_DESTINATION_FOUND',
  'ITINERARY_FAILED',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const DestinationDetectionSchema = z.object({
  destination: z.string().min(1),
  landmark: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1).optional(),
  sourceFrame: z.number().int().nonnegative().optional(),
});
export type DestinationDetection = z.infer<typeof DestinationDetectionSchema>;

export const ItineraryActivitySchema = z.object({
  time: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  estimatedCostUsd: z.number().nonnegative(),
});
export type ItineraryActivity = z.infer<typeof ItineraryActivitySchema>;

export const ItineraryDaySchema = z.object({
  day: z.number().int().min(1).max(3),
  theme: z.string().min(1),
  destinations: z.array(z.string().min(1)).min(1),
  activities: z.array(ItineraryActivitySchema).min(1),
  dailyCostUsd: z.number().nonnegative(),
});
export type ItineraryDay = z.infer<typeof ItineraryDaySchema>;

export const ItineraryDetailsSchema = z.object({
  cityOrRegion: z.string().min(1),
  currency: z.literal('USD'),
  totalCostMinUsd: z.number().nonnegative(),
  totalCostMaxUsd: z.number().nonnegative(),
  days: z.array(ItineraryDaySchema).length(3),
  travelTips: z.array(z.string().min(1)).min(1),
});
export type ItineraryDetails = z.infer<typeof ItineraryDetailsSchema>;

export const TelegramCallbackActionSchema = z.enum(['confirm', 'retry', 'details']);
export type TelegramCallbackAction = z.infer<typeof TelegramCallbackActionSchema>;

export const TelegramCallbackPayloadSchema = z.object({
  action: TelegramCallbackActionSchema,
  jobId: z.string().uuid(),
});
export type TelegramCallbackPayload = z.infer<typeof TelegramCallbackPayloadSchema>;

export function parseCallbackPayload(raw: string): TelegramCallbackPayload | null {
  const [action, jobId] = raw.split(':');
  const parsed = TelegramCallbackPayloadSchema.safeParse({ action, jobId });
  return parsed.success ? parsed.data : null;
}

export function buildCallbackPayload(action: TelegramCallbackAction, jobId: string): string {
  return `${action}:${jobId}`;
}

export function formatCompactItinerary(itinerary: ItineraryDetails): string {
  const header = [
    `3-Day Itinerary for ${itinerary.cityOrRegion}`,
    `Estimated total cost: $${Math.round(itinerary.totalCostMinUsd)} - $${Math.round(itinerary.totalCostMaxUsd)} USD`,
  ];

  const dayLines = itinerary.days.map((day) => {
    const topDestinations = day.destinations.slice(0, 3).join(', ');
    const topActivities = day.activities
      .slice(0, 3)
      .map((activity) => activity.title)
      .join(' | ');
    return `Day ${day.day} (${day.theme}): ${topDestinations}\nActivities: ${topActivities}\nApprox day cost: $${Math.round(day.dailyCostUsd)} USD`;
  });

  return [...header, '', ...dayLines].join('\n');
}

export function formatDetailedItinerary(itinerary: ItineraryDetails): string {
  const blocks: string[] = [
    `Detailed 3-Day Itinerary: ${itinerary.cityOrRegion}`,
    `Budget (USD): ${Math.round(itinerary.totalCostMinUsd)}-${Math.round(itinerary.totalCostMaxUsd)}`,
    '',
  ];

  for (const day of itinerary.days) {
    blocks.push(`Day ${day.day}: ${day.theme}`);
    blocks.push(`Destinations: ${day.destinations.join(', ')}`);
    for (const activity of day.activities) {
      blocks.push(
        `- ${activity.time} | ${activity.title} ($${Math.round(activity.estimatedCostUsd)}): ${activity.description}`,
      );
    }
    blocks.push(`Daily estimate: $${Math.round(day.dailyCostUsd)} USD`);
    blocks.push('');
  }

  blocks.push(`Tips: ${itinerary.travelTips.join(' | ')}`);
  return blocks.join('\n');
}

export const AdminJobViewSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
  status: JobStatusSchema,
  platform: PlatformSchema.nullable(),
  raw_url: z.string(),
  cleaned_url: z.string().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  detection_count: z.number().nullable(),
  source: z.string(),
  attempt: z.number(),
  user_id: z.string().uuid().nullable(),
});
export type AdminJobView = z.infer<typeof AdminJobViewSchema>;
