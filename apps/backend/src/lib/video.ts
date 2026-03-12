import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import type { Platform } from '@ta/shared';
import { env } from './config.js';
import { AppError } from './errors.js';

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function runCommand(command: string, args: string[], cwd?: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });

    child.on('error', (error) => {
      resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}` });
    });
  });
}

function looksLikeNetscapeCookies(text: string): boolean {
  return text.includes('# Netscape HTTP Cookie File') || text.split('\n').some((line) => line.split('\t').length >= 7);
}

function decodeCookies(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (looksLikeNetscapeCookies(trimmed)) {
    return trimmed;
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
    if (!decoded || !looksLikeNetscapeCookies(decoded)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function getCookiesRaw(platform?: Platform | null): string | undefined {
  if (platform === 'instagram_reel') {
    return env.INSTAGRAM_COOKIES_B64 ?? env.YTDLP_COOKIES_B64;
  }
  return env.YTDLP_COOKIES_B64;
}

async function writeCookiesFile(tempDir: string, platform?: Platform | null): Promise<string | null> {
  const raw = getCookiesRaw(platform);
  if (!raw) {
    return null;
  }

  const decoded = decodeCookies(raw);
  if (!decoded) {
    throw new AppError(
      'DOWNLOAD_FAILED',
      'Configured cookies are invalid. Use a Netscape cookie file string or its base64 value.',
    );
  }

  const cookiesPath = path.join(tempDir, 'cookies.txt');
  await fs.writeFile(cookiesPath, `${decoded}\n`, 'utf8');
  return cookiesPath;
}

function compactOutput(output: string): string {
  return output.replace(/\s+/g, ' ').trim().slice(0, 600);
}

function hasInstagramAuthError(output: string): boolean {
  const normalized = output.toLowerCase();
  return normalized.includes('[instagram]') && (normalized.includes('login required') || normalized.includes('rate-limit reached'));
}

export async function downloadVideoToTemp(
  cleanedUrl: string,
  platform?: Platform | null,
): Promise<{ tempDir: string; videoPath: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-agent-'));
  const outputTemplate = path.join(tempDir, 'video.%(ext)s');
  const cookiesPath = await writeCookiesFile(tempDir, platform);

  const args = [
    '--no-playlist',
    '--merge-output-format',
    'mp4',
    '-f',
    'mp4/bestvideo+bestaudio/best',
    '--retries',
    '2',
    '--fragment-retries',
    '2',
    '--socket-timeout',
    '30',
    '-o',
    outputTemplate,
  ];

  if (platform === 'instagram_reel') {
    args.push('--referer', 'https://www.instagram.com/');
  }

  if (cookiesPath) {
    args.push('--cookies', cookiesPath);
  }

  args.push(cleanedUrl);

  const result = await runCommand('yt-dlp', args);

  if (result.code !== 0) {
    const rawError = result.stderr || result.stdout;

    if (platform === 'instagram_reel' && hasInstagramAuthError(rawError) && !cookiesPath) {
      await fs.rm(tempDir, { recursive: true, force: true });
      throw new AppError(
        'DOWNLOAD_FAILED',
        'Instagram download requires authentication in this environment. Set INSTAGRAM_COOKIES_B64 and retry.',
      );
    }

    await fs.rm(tempDir, { recursive: true, force: true });
    throw new AppError('DOWNLOAD_FAILED', `Failed to download video: ${compactOutput(rawError)}`);
  }

  const files = await fs.readdir(tempDir);
  const videoFile = files.find((file) => /\.(mp4|webm|mkv|mov)$/i.test(file));
  if (!videoFile) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw new AppError('DOWNLOAD_FAILED', 'Video file was not found after download.');
  }

  return {
    tempDir,
    videoPath: path.join(tempDir, videoFile),
  };
}

export async function extractFrames(
  videoPath: string,
  fps: number,
  maxFrames: number,
): Promise<{ framePaths: string[]; framesDir: string }> {
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-frames-'));
  const outputPattern = path.join(framesDir, 'frame-%03d.jpg');

  const result = await runCommand('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    videoPath,
    '-vf',
    `fps=${fps}`,
    '-frames:v',
    String(maxFrames),
    outputPattern,
  ]);

  if (result.code !== 0) {
    throw new AppError('VISION_FAILED', `Failed to extract frames: ${result.stderr || result.stdout}`);
  }

  const files = (await fs.readdir(framesDir))
    .filter((name) => name.endsWith('.jpg'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(framesDir, name));

  if (files.length === 0) {
    throw new AppError('VISION_FAILED', 'No frames were extracted from the video.');
  }

  return { framePaths: files, framesDir };
}

export async function loadFramesBase64(framePaths: string[]): Promise<string[]> {
  const buffers = await Promise.all(framePaths.map((framePath) => fs.readFile(framePath)));
  return buffers.map((buffer) => buffer.toString('base64'));
}

export async function cleanupTempPaths(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(async (targetPath) => {
      if (!targetPath) {
        return;
      }
      await fs.rm(targetPath, { recursive: true, force: true });
    }),
  );
}
