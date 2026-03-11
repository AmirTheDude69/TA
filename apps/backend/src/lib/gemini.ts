import { z } from 'zod';
import {
  DestinationDetectionSchema,
  ItineraryDetailsSchema,
  type DestinationDetection,
  type ItineraryDetails,
} from '@ta/shared';
import { env } from './config.js';
import { AppError, toErrorMessage } from './errors.js';

const GEMINI_VISION_MODEL = 'gemini-2.0-flash';
const GEMINI_TEXT_MODEL = 'gemini-2.0-flash';

const DetectionResponseSchema = z.object({
  detections: z.array(DestinationDetectionSchema).default([]),
});

const ItineraryResponseSchema = ItineraryDetailsSchema;

type GeminiPart =
  | {
      text: string;
    }
  | {
      inline_data: {
        mime_type: string;
        data: string;
      };
    };

const GEMINI_MAX_RETRIES = 3;
const GEMINI_VISION_MAX_FRAMES = 18;
const GEMINI_VISION_BATCH_SIZE = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateContent(model: string, parts: GeminiPart[]): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < GEMINI_MAX_RETRIES) {
        await sleep(attempt * 1500);
        continue;
      }
      const compactBody = errorBody.slice(0, 180).replace(/\s+/g, ' ').trim();
      throw new AppError(
        'VISION_FAILED',
        `Gemini request failed: ${response.status} ${response.statusText}${compactBody ? ` - ${compactBody}` : ''}`,
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')?.trim();
    if (!text) {
      throw new AppError('VISION_FAILED', 'Gemini returned an empty response.');
    }
    return text;
  }

  throw new AppError('VISION_FAILED', 'Gemini request failed after retries.');
}

function extractJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Response did not contain a JSON object.');
  }
  return raw.slice(start, end + 1);
}

function parseDetections(raw: string): DestinationDetection[] {
  const jsonText = extractJsonObject(raw);
  const parsedUnknown = JSON.parse(jsonText) as unknown;
  const parsed = DetectionResponseSchema.parse(parsedUnknown);
  return parsed.detections;
}

function parseItinerary(raw: string): ItineraryDetails {
  const jsonText = extractJsonObject(raw);
  const parsedUnknown = JSON.parse(jsonText) as unknown;
  return ItineraryResponseSchema.parse(parsedUnknown);
}

function dedupeDetections(detections: DestinationDetection[]): DestinationDetection[] {
  const map = new Map<string, DestinationDetection>();

  for (const item of detections) {
    const key = `${item.destination.toLowerCase()}|${(item.landmark ?? '').toLowerCase()}`;
    const existing = map.get(key);
    if (!existing || item.confidence > existing.confidence) {
      map.set(key, item);
    }
  }

  return [...map.values()].sort((a, b) => b.confidence - a.confidence);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sampleFrames<T>(frames: T[], maxFrames: number): T[] {
  if (frames.length <= maxFrames) {
    return frames;
  }
  if (maxFrames <= 1) {
    return [frames[0]];
  }

  const sampled: T[] = [];
  for (let index = 0; index < maxFrames; index += 1) {
    const ratio = index / (maxFrames - 1);
    const sourceIndex = Math.round(ratio * (frames.length - 1));
    sampled.push(frames[sourceIndex]);
  }
  return sampled;
}

export async function detectDestinationsFromFrames(
  framesBase64: string[],
  minConfidence: number,
): Promise<DestinationDetection[]> {
  const sampledFrames = sampleFrames(framesBase64, GEMINI_VISION_MAX_FRAMES);
  const batches = chunk(sampledFrames, GEMINI_VISION_BATCH_SIZE);
  const collected: DestinationDetection[] = [];

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];

    const prompt = [
      'Analyze the provided travel-video frames and identify real-world destinations/landmarks.',
      'Return strict JSON only in this shape: {"detections":[{"destination":"...","landmark":"...","country":"...","confidence":0.0,"evidence":"...","sourceFrame":0}]}.',
      'Rules:',
      '- confidence is 0..1',
      '- keep only travel-relevant destination/landmark entities',
      '- do not include generic objects',
      '- if unsure, return empty detections',
      `Batch index: ${index}`,
    ].join('\n');

    const parts: GeminiPart[] = [{ text: prompt }];
    batch.forEach((frame) => {
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: frame,
        },
      });
    });

    try {
      const responseText = await generateContent(GEMINI_VISION_MODEL, parts);
      const detections = parseDetections(responseText);
      for (const detection of detections) {
        if (detection.confidence >= minConfidence) {
          collected.push(detection);
        }
      }
    } catch (error) {
      throw new AppError('VISION_FAILED', `Gemini vision parsing failed: ${toErrorMessage(error)}`);
    }
  }

  const deduped = dedupeDetections(collected);
  if (deduped.length === 0) {
    throw new AppError('NO_DESTINATION_FOUND', 'No reliable destination landmarks were detected from the video frames.');
  }

  return deduped;
}

function buildFallbackItinerary(detections: DestinationDetection[]): ItineraryDetails {
  const destinations = detections.slice(0, 5).map((item) => item.destination);
  const primary = destinations[0] ?? 'Highlighted Destination';

  const days = [1, 2, 3].map((day) => ({
    day,
    theme: day === 1 ? 'Arrival & Icons' : day === 2 ? 'Culture & Food' : 'Nature & Departure',
    destinations: destinations.length ? destinations : [primary],
    activities: [
      {
        time: '09:00',
        title: day === 1 ? 'City Orientation Walk' : day === 2 ? 'Local Neighborhood Tour' : 'Scenic Viewpoint Visit',
        description: `Explore core sights around ${primary}.`,
        estimatedCostUsd: 35 + day * 5,
      },
      {
        time: '14:00',
        title: day === 1 ? 'Landmark Session' : day === 2 ? 'Street Food Crawl' : 'Museum or Gallery Stop',
        description: 'Spend the afternoon around featured places from the video.',
        estimatedCostUsd: 45 + day * 8,
      },
      {
        time: '19:00',
        title: 'Dinner and Evening Stroll',
        description: 'Relax with a local dinner spot and walk in a safe central area.',
        estimatedCostUsd: 40 + day * 7,
      },
    ],
    dailyCostUsd: 160 + day * 20,
  }));

  return {
    cityOrRegion: primary,
    currency: 'USD',
    totalCostMinUsd: 650,
    totalCostMaxUsd: 980,
    days,
    travelTips: [
      'Book local transport early for better rates.',
      'Carry offline maps and a portable charger.',
      'Reserve one flexible time block each day for discovered spots.',
    ],
  };
}

export async function generateThreeDayItinerary(
  detections: DestinationDetection[],
): Promise<ItineraryDetails> {
  const prompt = [
    'Create a practical 3-day travel itinerary from detected destinations and landmarks.',
    'Output strict JSON only matching this shape:',
    '{"cityOrRegion":"...","currency":"USD","totalCostMinUsd":0,"totalCostMaxUsd":0,"days":[{"day":1,"theme":"...","destinations":["..."],"activities":[{"time":"09:00","title":"...","description":"...","estimatedCostUsd":0}],"dailyCostUsd":0}],"travelTips":["..."]}',
    'Rules:',
    '- Exactly 3 days.',
    '- currency must be USD.',
    '- include realistic activity cost estimates.',
    '- prioritize detected destinations and landmarks.',
    `Detected landmarks: ${JSON.stringify(detections.slice(0, 12))}`,
  ].join('\n');

  try {
    const responseText = await generateContent(GEMINI_TEXT_MODEL, [{ text: prompt }]);
    return parseItinerary(responseText);
  } catch {
    return buildFallbackItinerary(detections);
  }
}
