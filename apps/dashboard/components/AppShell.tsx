'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { clearAdminToken } from '../lib/auth';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      <header className="header">
        <div className="container nav">
          <div className="brand">Travel AI Agent Ops</div>
          <nav className="navLinks">
            <Link className="navLink" href="/" aria-current={pathname === '/' ? 'page' : undefined}>
              Jobs
            </Link>
            <Link className="navLink" href="/manual" aria-current={pathname === '/manual' ? 'page' : undefined}>
              Manual Submit
            </Link>
            <Link className="navLink" href="/users" aria-current={pathname === '/users' ? 'page' : undefined}>
              Users
            </Link>
            <button
              className="secondary"
              onClick={() => {
                clearAdminToken();
                router.replace('/login');
              }}
            >
              Logout
            </button>
          </nav>
        </div>
      </header>
      <main className="main">
        <div className="container">{children}</div>
      </main>
    </>
  );
}
