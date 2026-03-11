import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Travel AI Agent Dashboard',
  description: 'Admin operations dashboard for URL Drop Travel AI Agent',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
