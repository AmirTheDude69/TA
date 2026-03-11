'use client';

import { FormEvent, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { RequireAuth } from '../../components/RequireAuth';
import { apiRequest } from '../../lib/api';

export default function ManualPage() {
  return (
    <AppShell>
      <RequireAuth>{(token) => <ManualForm token={token} />}</RequireAuth>
    </AppShell>
  );
}

function ManualForm({ token }: { token: string }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      setSubmitting(true);
      setStatus(null);
      setError(null);

      const response = await apiRequest<{ job: { id: string } }>('/api/jobs', token, {
        method: 'POST',
        body: JSON.stringify({ url }),
      });

      setStatus(`Job queued: ${response.job.id}`);
      setUrl('');
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Manual URL Submit</h2>
        <p className="muted">Submit TikTok, Instagram Reel, or Douyin links directly for processing.</p>
        <form onSubmit={onSubmit} className="grid">
          <label htmlFor="url">Video URL</label>
          <input
            id="url"
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.tiktok.com/@user/video/123..."
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit URL'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setUrl('');
                setStatus(null);
                setError(null);
              }}
            >
              Clear
            </button>
          </div>
        </form>
        {status ? <p>{status}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
