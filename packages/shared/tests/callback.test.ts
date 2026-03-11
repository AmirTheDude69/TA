import { describe, expect, it } from 'vitest';
import { buildCallbackPayload, parseCallbackPayload } from '../src/index.js';

describe('callback payload parser', () => {
  it('parses valid payload', () => {
    const jobId = '11111111-1111-4111-8111-111111111111';
    const payload = buildCallbackPayload('confirm', jobId);
    const parsed = parseCallbackPayload(payload);

    expect(parsed?.action).toBe('confirm');
    expect(parsed?.jobId).toBe(jobId);
  });

  it('returns null for invalid payload', () => {
    expect(parseCallbackPayload('wrong')).toBeNull();
    expect(parseCallbackPayload('confirm:not-a-uuid')).toBeNull();
  });
});
