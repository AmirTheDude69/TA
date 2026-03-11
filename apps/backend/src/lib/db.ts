import type { DestinationDetection, ItineraryDetails, Platform } from '@ta/shared';
import { supabaseAdmin } from './supabase.js';
import { toErrorMessage } from './errors.js';

export type JobRow = {
  id: string;
  user_id: string | null;
  source: string;
  telegram_chat_id: number | null;
  telegram_message_id: number | null;
  raw_url: string;
  cleaned_url: string | null;
  platform: Platform | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attempt: number;
  detection_count: number | null;
  error_code: string | null;
  error_message: string | null;
  analysis_metadata: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserRow = {
  id: string;
  telegram_user_id: number | null;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

function assertData<T>(data: T | null, error: unknown): T {
  if (!data || error) {
    throw new Error(`Database error: ${toErrorMessage(error)}`);
  }
  return data;
}

export async function upsertTelegramUser(input: {
  telegramUserId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}): Promise<UserRow> {
  const payload = {
    telegram_user_id: input.telegramUserId,
    telegram_username: input.username ?? null,
    first_name: input.firstName ?? null,
    last_name: input.lastName ?? null,
    last_seen_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('users')
    .upsert(payload, { onConflict: 'telegram_user_id' })
    .select('*')
    .single();

  return assertData(data as UserRow | null, error);
}

export async function createJob(input: {
  userId?: string;
  source: 'telegram' | 'dashboard';
  rawUrl: string;
  cleanedUrl: string;
  platform: Platform;
  chatId?: number;
  messageId?: number;
  attempt?: number;
}): Promise<JobRow> {
  const { data, error } = await supabaseAdmin
    .from('url_jobs')
    .insert({
      user_id: input.userId ?? null,
      source: input.source,
      raw_url: input.rawUrl,
      cleaned_url: input.cleanedUrl,
      platform: input.platform,
      status: 'queued',
      attempt: input.attempt ?? 1,
      telegram_chat_id: input.chatId ?? null,
      telegram_message_id: input.messageId ?? null,
    })
    .select('*')
    .single();

  return assertData(data as JobRow | null, error);
}

export async function createQueuedJobWithoutUser(input: {
  source: 'dashboard';
  rawUrl: string;
  cleanedUrl: string;
  platform: Platform;
  attempt?: number;
}): Promise<JobRow> {
  return createJob({
    source: input.source,
    rawUrl: input.rawUrl,
    cleanedUrl: input.cleanedUrl,
    platform: input.platform,
    attempt: input.attempt,
  });
}

export async function listQueuedJobs(limit = 10): Promise<JobRow[]> {
  const { data, error } = await supabaseAdmin
    .from('url_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Database error listing queued jobs: ${error.message}`);
  }
  return (data as JobRow[]) ?? [];
}

export async function lockJobForProcessing(jobId: string): Promise<JobRow | null> {
  const { data, error } = await supabaseAdmin
    .from('url_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    })
    .eq('id', jobId)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Database error locking job ${jobId}: ${error.message}`);
  }
  return (data as JobRow | null) ?? null;
}

export async function markJobFailed(jobId: string, code: string, message: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('url_jobs')
    .update({
      status: 'failed',
      error_code: code,
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Database error marking job failed: ${error.message}`);
  }
}

export async function markJobCompleted(jobId: string, detectionCount: number, metadata: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin
    .from('url_jobs')
    .update({
      status: 'completed',
      detection_count: detectionCount,
      analysis_metadata: metadata,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Database error marking job completed: ${error.message}`);
  }
}

export async function listJobs(filters: {
  status?: string;
  platform?: string;
  search?: string;
  limit?: number;
}): Promise<JobRow[]> {
  let query = supabaseAdmin.from('url_jobs').select('*').order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.platform) {
    query = query.eq('platform', filters.platform);
  }
  if (filters.search) {
    query = query.or(`raw_url.ilike.%${filters.search}%,cleaned_url.ilike.%${filters.search}%`);
  }

  query = query.limit(filters.limit ?? 100);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Database error listing jobs: ${error.message}`);
  }

  return (data as JobRow[]) ?? [];
}

export async function getJobById(jobId: string): Promise<JobRow | null> {
  const { data, error } = await supabaseAdmin.from('url_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) {
    throw new Error(`Database error getting job: ${error.message}`);
  }
  return (data as JobRow | null) ?? null;
}

export async function insertDetections(jobId: string, detections: DestinationDetection[]): Promise<void> {
  if (detections.length === 0) {
    return;
  }

  const rows = detections.map((item) => ({
    job_id: jobId,
    destination: item.destination,
    landmark: item.landmark ?? null,
    country: item.country ?? null,
    confidence: item.confidence,
    evidence: item.evidence ?? null,
    source_frame: item.sourceFrame ?? null,
  }));

  const { error } = await supabaseAdmin.from('destination_detections').insert(rows);
  if (error) {
    throw new Error(`Database error inserting detections: ${error.message}`);
  }
}

export async function replaceItinerary(jobId: string, itinerary: ItineraryDetails, summaryText: string): Promise<void> {
  const { error } = await supabaseAdmin.from('itineraries').upsert(
    {
      job_id: jobId,
      summary_text: summaryText,
      details_json: itinerary,
      total_cost_min_usd: itinerary.totalCostMinUsd,
      total_cost_max_usd: itinerary.totalCostMaxUsd,
    },
    { onConflict: 'job_id' },
  );

  if (error) {
    throw new Error(`Database error upserting itinerary: ${error.message}`);
  }
}

export async function getItineraryByJobId(jobId: string): Promise<{
  summary_text: string;
  details_json: ItineraryDetails;
  confirmed_at: string | null;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('itineraries')
    .select('summary_text, details_json, confirmed_at')
    .eq('job_id', jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Database error getting itinerary: ${error.message}`);
  }

  return (data as { summary_text: string; details_json: ItineraryDetails; confirmed_at: string | null } | null) ?? null;
}

export async function confirmItinerary(jobId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('itineraries')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('job_id', jobId);
  if (error) {
    throw new Error(`Database error confirming itinerary: ${error.message}`);
  }
}

export async function createBotEvent(input: {
  jobId?: string;
  chatId?: number;
  telegramUserId?: number;
  eventType: string;
  direction: 'inbound' | 'outbound' | 'system';
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('bot_events').insert({
    job_id: input.jobId ?? null,
    telegram_chat_id: input.chatId ?? null,
    telegram_user_id: input.telegramUserId ?? null,
    event_type: input.eventType,
    direction: input.direction,
    payload_json: input.payload,
  });

  if (error) {
    throw new Error(`Database error writing bot event: ${error.message}`);
  }
}

export async function listUsers(limit = 200): Promise<(UserRow & { totalJobs: number })[]> {
  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Database error listing users: ${error.message}`);
  }

  const userRows = (users as UserRow[]) ?? [];

  const ids = userRows.map((item) => item.id);
  if (ids.length === 0) {
    return [];
  }

  const { data: jobs, error: jobsError } = await supabaseAdmin
    .from('url_jobs')
    .select('user_id')
    .in('user_id', ids);

  if (jobsError) {
    throw new Error(`Database error listing user jobs: ${jobsError.message}`);
  }

  const counts = new Map<string, number>();
  for (const row of jobs ?? []) {
    const id = (row as { user_id: string | null }).user_id;
    if (!id) {
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return userRows.map((item) => ({
    ...item,
    totalJobs: counts.get(item.id) ?? 0,
  }));
}

export async function getDetectionsByJobId(jobId: string): Promise<DestinationDetection[]> {
  const { data, error } = await supabaseAdmin
    .from('destination_detections')
    .select('destination, landmark, country, confidence, evidence, source_frame')
    .eq('job_id', jobId)
    .order('confidence', { ascending: false });

  if (error) {
    throw new Error(`Database error getting detections: ${error.message}`);
  }

  return ((data ?? []) as Array<{
    destination: string;
    landmark: string | null;
    country: string | null;
    confidence: number;
    evidence: string | null;
    source_frame: number | null;
  }>).map((row) => ({
    destination: row.destination,
    landmark: row.landmark ?? undefined,
    country: row.country ?? undefined,
    confidence: row.confidence,
    evidence: row.evidence ?? undefined,
    sourceFrame: row.source_frame ?? undefined,
  }));
}

export async function getBotEventsByJobId(jobId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabaseAdmin
    .from('bot_events')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(`Database error getting bot events: ${error.message}`);
  }
  return (data as Array<Record<string, unknown>>) ?? [];
}
