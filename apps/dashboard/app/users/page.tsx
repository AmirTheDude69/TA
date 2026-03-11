'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { RequireAuth } from '../../components/RequireAuth';
import { apiRequest } from '../../lib/api';

type UserRow = {
  id: string;
  telegram_user_id: number | null;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  last_seen_at: string;
  totalJobs: number;
};

export default function UsersPage() {
  return (
    <AppShell>
      <RequireAuth>{(token) => <UsersView token={token} />}</RequireAuth>
    </AppShell>
  );
}

function UsersView({ token }: { token: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const response = await apiRequest<{ users: UserRow[] }>('/api/users', token);
      setUsers(response.users);
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="grid">
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Users</h2>
        <button className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Telegram ID</th>
              <th>Username</th>
              <th>Name</th>
              <th>Total Jobs</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.telegram_user_id ?? 'n/a'}</td>
                <td>{user.telegram_username ?? '-'}</td>
                <td>{[user.first_name, user.last_name].filter(Boolean).join(' ') || '-'}</td>
                <td>{user.totalJobs}</td>
                <td className="muted">{new Date(user.last_seen_at).toLocaleString()}</td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No users yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
