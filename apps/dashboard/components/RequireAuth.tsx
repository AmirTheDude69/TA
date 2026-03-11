'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getAdminToken } from '../lib/auth';

export function RequireAuth({ children }: { children: (token: string) => ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const stored = getAdminToken();
    if (!stored) {
      router.replace('/login');
      return;
    }
    setToken(stored);
  }, [router]);

  if (!token) {
    return <p className="muted">Checking session...</p>;
  }

  return <>{children(token)}</>;
}
