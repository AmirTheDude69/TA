import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
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

export async function downloadVideoToTemp(cleanedUrl: string): Promise<{ tempDir: string; videoPath: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-agent-'));
  const outputTemplate = path.join(tempDir, 'video.%(ext)s');

  const result = await runCommand('yt-dlp', ['-f', 'mp4', '--no-playlist', '-o', outputTemplate, cleanedUrl]);

  if (result.code !== 0) {
    throw new AppError('DOWNLOAD_FAILED', `Failed to download video: ${result.stderr || result.stdout}`);
  }

  const files = await fs.readdir(tempDir);
  const videoFile = files.find((file) => /\.(mp4|webm|mkv|mov)$/i.test(file));
  if (!videoFile) {
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
