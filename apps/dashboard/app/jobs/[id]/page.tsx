'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { RequireAuth } from '../../../components/RequireAuth';
import { apiRequest } from '../../../lib/api';

type JobDetailsResponse = {
  job: {
    id: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    raw_url: string;
    cleaned_url: string | null;
    platform: string | null;
    source: string;
    attempt: number;
    error_code: string | null;
    error_message: string | null;
    detection_count: number | null;
    created_at: string;
    updated_at: string;
    analysis_metadata: Record<string, unknown> | null;
  };
  detections: Array<{
    destination: string;
    landmark?: string;
    country?: string;
    confidence: number;
    evidence?: string;
  }>;
  itinerary: {
    summary_text: string;
    details_json: Record<string, unknown>;
    confirmed_at: string | null;
  } | null;
  events: Array<Record<string, unknown>>;
};

export default function JobDetailPage() {
  return (
    <AppShell>
      <RequireAuth>{(token) => <JobDetailView token={token} />}</RequireAuth>
    </AppShell>
  );
}

function JobDetailView({ token }: { token: string }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<JobDetailsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<JobDetailsResponse>(`/api/jobs/${params.id}`, token);
      setData(response);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function retryJob() {
    try {
      setRetrying(true);
      await apiRequest<{ job: { id: string } }>(`/api/jobs/${params.id}/retry`, token, {
        method: 'POST',
      });
      router.push('/');
    } catch (retryError) {
      setError((retryError as Error).message);
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return <p className="muted">Loading job...</p>;
  }

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (!data) {
    return <p className="muted">No data.</p>;
  }

  return (
    <div className="grid">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Job {data.job.id}</h2>
        <p>
          <span className={`badge ${data.job.status}`}>{data.job.status}</span>
        </p>
        <p>
          <strong>Source:</strong> {data.job.source} | <strong>Platform:</strong> {data.job.platform ?? 'n/a'} |{' '}
          <strong>Attempt:</strong> {data.job.attempt}
        </p>
        <p>
          <strong>Raw URL:</strong> {data.job.raw_url}
        </p>
        <p>
          <strong>Cleaned URL:</strong> {data.job.cleaned_url ?? 'n/a'}
        </p>
        {data.job.error_code ? (
          <p className="error">
            {data.job.error_code}: {data.job.error_message}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={() => router.push('/')}>
            Back
          </button>
          <button onClick={() => void retryJob()} disabled={retrying}>
            {retrying ? 'Retrying...' : 'Retry Job'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Detections ({data.detections.length})</h3>
        {data.detections.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Destination</th>
                <th>Landmark</th>
                <th>Country</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.detections.map((detection, index) => (
                <tr key={`${detection.destination}-${index}`}>
                  <td>{detection.destination}</td>
                  <td>{detection.landmark ?? '-'}</td>
                  <td>{detection.country ?? '-'}</td>
                  <td>{Math.round(detection.confidence * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No detections stored.</p>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Itinerary</h3>
        {data.itinerary ? (
          <>
            <pre>{data.itinerary.summary_text}</pre>
            <div style={{ marginTop: 10 }}>
              <strong>Confirmed at:</strong>{' '}
              {data.itinerary.confirmed_at ? new Date(data.itinerary.confirmed_at).toLocaleString() : 'Not confirmed'}
            </div>
            <details style={{ marginTop: 12 }}>
              <summary>Raw details JSON</summary>
              <pre>{JSON.stringify(data.itinerary.details_json, null, 2)}</pre>
            </details>
          </>
        ) : (
          <p className="muted">No itinerary yet.</p>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Event Timeline</h3>
        <pre>{JSON.stringify(data.events, null, 2)}</pre>
      </div>
    </div>
  );
}
