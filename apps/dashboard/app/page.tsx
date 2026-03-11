'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { RequireAuth } from '../components/RequireAuth';
import { apiRequest } from '../lib/api';

type Job = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  platform: string | null;
  raw_url: string;
  cleaned_url: string | null;
  created_at: string;
  attempt: number;
  detection_count: number | null;
  error_code: string | null;
};

export default function JobsPage() {
  return (
    <AppShell>
      <RequireAuth>{(token) => <JobsView token={token} />}</RequireAuth>
    </AppShell>
  );
}

function JobsView({ token }: { token: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState('');
  const [platform, setPlatform] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (status) {
      params.set('status', status);
    }
    if (platform) {
      params.set('platform', platform);
    }
    if (search) {
      params.set('search', search);
    }
    params.set('limit', '150');
    return params.toString();
  }, [status, platform, search]);

  async function loadJobs() {
    try {
      setError(null);
      const response = await apiRequest<{ jobs: Job[] }>(`/api/jobs?${query}`, token);
      setJobs(response.jobs);
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, [query]);

  return (
    <div className="grid">
      <div className="card grid gridCols2">
        <div>
          <label htmlFor="status">Status</label>
          <select id="status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div>
          <label htmlFor="platform">Platform</label>
          <select id="platform" value={platform} onChange={(event) => setPlatform(event.target.value)}>
            <option value="">All</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram_reel">Instagram Reel</option>
            <option value="douyin">Douyin</option>
          </select>
        </div>
        <div>
          <label htmlFor="search">Search URL</label>
          <input
            id="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search raw or cleaned URL"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button onClick={() => void loadJobs()}>Refresh</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Platform</th>
              <th>URL</th>
              <th>Attempt</th>
              <th>Detections</th>
              <th>Created</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <span className={`badge ${job.status}`}>{job.status}</span>
                  {job.error_code ? <div className="error">{job.error_code}</div> : null}
                </td>
                <td>{job.platform ?? 'n/a'}</td>
                <td style={{ maxWidth: 320, overflowWrap: 'anywhere' }}>
                  {job.cleaned_url ?? job.raw_url}
                </td>
                <td>{job.attempt}</td>
                <td>{job.detection_count ?? 0}</td>
                <td className="muted">{new Date(job.created_at).toLocaleString()}</td>
                <td>
                  <Link className="navLink" href={`/jobs/${job.id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No jobs found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
