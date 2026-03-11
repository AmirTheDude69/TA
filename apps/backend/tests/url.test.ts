import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanAndValidateVideoUrl, extractFirstUrl, verifyUrlAccessible } from '../src/lib/url.js';

describe('extractFirstUrl', () => {
  it('extracts first URL from text', () => {
    const url = extractFirstUrl('Check this out https://www.tiktok.com/@x/video/123 now');
    expect(url).toBe('https://www.tiktok.com/@x/video/123');
  });

  it('returns null if no URL', () => {
    expect(extractFirstUrl('no links here')).toBeNull();
  });
});

describe('cleanAndValidateVideoUrl', () => {
  it('normalizes TikTok URL by stripping query/hash', () => {
    const parsed = cleanAndValidateVideoUrl('http://www.tiktok.com/@abc/video/123?utm_source=x#frag');
    expect(parsed.platform).toBe('tiktok');
    expect(parsed.cleanedUrl).toBe('https://www.tiktok.com/@abc/video/123');
  });

  it('accepts instagram reel URL only', () => {
    const parsed = cleanAndValidateVideoUrl('https://www.instagram.com/reel/C12345/?utm=abc');
    expect(parsed.platform).toBe('instagram_reel');
    expect(parsed.cleanedUrl).toBe('https://www.instagram.com/reel/C12345/');
  });

  it('accepts douyin URL', () => {
    const parsed = cleanAndValidateVideoUrl('https://www.douyin.com/video/123?share=abc');
    expect(parsed.platform).toBe('douyin');
    expect(parsed.cleanedUrl).toBe('https://www.douyin.com/video/123');
  });

  it('throws for unsupported host', () => {
    expect(() => cleanAndValidateVideoUrl('https://youtube.com/watch?v=1')).toThrow();
  });
});

describe('verifyUrlAccessible', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes when HEAD succeeds', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('', { status: 200 }));
    await expect(verifyUrlAccessible('https://www.tiktok.com/@abc/video/123')).resolves.toBeUndefined();
  });

  it('falls back to GET when HEAD fails', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 405 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));

    await expect(verifyUrlAccessible('https://www.tiktok.com/@abc/video/123')).resolves.toBeUndefined();
  });

  it('throws when both HEAD and GET fail', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }));

    await expect(verifyUrlAccessible('https://www.tiktok.com/@abc/video/123')).rejects.toThrow();
  });
});
