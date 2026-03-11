'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminToken, setAdminToken } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = getAdminToken();
    if (token) {
      router.replace('/');
    }
  }, [router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError(null);

      if (!supabase) {
        throw new Error(
          'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in dashboard environment.',
        );
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !data.session) {
        throw new Error(signInError?.message ?? 'Failed to authenticate.');
      }

      setAdminToken(data.session.access_token);
      router.replace('/');
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="main">
      <div className="container" style={{ maxWidth: 460 }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Admin Login</h1>
          <p className="muted">Use Supabase email/password credentials with admin role.</p>
          <form onSubmit={onSubmit} className="grid">
            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </div>
    </main>
  );
}
