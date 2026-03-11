import { AppError } from './errors.js';
import { PlatformSchema, type Platform } from '@ta/shared';

const URL_REGEX = /(https?:\/\/[^\s]+)/i;

const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com']);
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
const DOUYIN_HOSTS = new Set(['douyin.com', 'www.douyin.com', 'v.douyin.com', 'iesdouyin.com']);

export function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  return match?.[1] ?? null;
}

export function detectPlatform(inputUrl: URL): Platform {
  const host = inputUrl.hostname.toLowerCase();
  const path = inputUrl.pathname.toLowerCase();

  if (TIKTOK_HOSTS.has(host)) {
    return 'tiktok';
  }

  if (INSTAGRAM_HOSTS.has(host)) {
    if (path.includes('/reel/')) {
      return 'instagram_reel';
    }
    throw new AppError('UNSUPPORTED_PLATFORM', 'Only Instagram Reels URLs are supported.');
  }

  if (DOUYIN_HOSTS.has(host)) {
    return 'douyin';
  }

  throw new AppError('UNSUPPORTED_PLATFORM', 'Only TikTok, Instagram Reels, and Douyin URLs are supported.');
}

export function cleanAndValidateVideoUrl(rawUrl: string): { cleanedUrl: string; platform: Platform } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new AppError('INVALID_URL', 'Could not parse URL. Please send a valid TikTok/Reels/Douyin video link.');
  }

  const platform = detectPlatform(parsed);
  const host = parsed.hostname.toLowerCase();

  parsed.protocol = 'https:';
  parsed.hostname = host;
  parsed.hash = '';
  parsed.search = '';

  if (platform === 'instagram_reel' && !parsed.pathname.toLowerCase().includes('/reel/')) {
    throw new AppError('UNSUPPORTED_PLATFORM', 'Instagram URL must be a Reel link.');
  }

  const parsedPlatform = PlatformSchema.parse(platform);
  return {
    cleanedUrl: parsed.toString(),
    platform: parsedPlatform,
  };
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyUrlAccessible(cleanedUrl: string): Promise<void> {
  const headResponse = await fetchWithTimeout(
    cleanedUrl,
    {
      method: 'HEAD',
      redirect: 'follow',
    },
    12_000,
  ).catch(() => null);

  if (headResponse && headResponse.status < 400) {
    return;
  }

  const getResponse = await fetchWithTimeout(
    cleanedUrl,
    {
      method: 'GET',
      headers: { Range: 'bytes=0-0', 'User-Agent': 'Mozilla/5.0 TravelAIAgent' },
      redirect: 'follow',
    },
    15_000,
  ).catch(() => null);

  if (!getResponse || getResponse.status >= 400) {
    throw new AppError(
      'INVALID_URL',
      'The video URL is not accessible (private, region-locked, or invalid). Please send another link.',
    );
  }
}
