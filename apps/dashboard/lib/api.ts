import { backendUrl } from './config';

export async function apiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: 'Request failed' }))) as { error?: string };
    throw new Error(body.error ?? 'Request failed');
  }

  return (await response.json()) as T;
}
