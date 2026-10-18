import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const TIMEOUT_MS = 10_000;

/**
 * GET from the API inside a server component, forwarding the visitor's cookies.
 * 401 sends them to /login; 404 renders the not-found page. Never cached.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${API_URL}/v1${path}`, {
    headers: { cookie: cookieHeader, accept: 'application/json' },
    cache: 'no-store',
    // Every outbound call has a timeout (laravel-rest-api: client-explicit-timeouts).
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) redirect('/login');
  if (res.status === 404) notFound();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `API ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

/** Like apiGet but returns null instead of redirecting when there is no valid session. */
export async function apiGetOptional<T>(path: string): Promise<T | null> {
  const store = await cookies();
  if (!store.get('ph_session')) return null;
  const res = await fetch(`${API_URL}/v1${path}`, {
    headers: { cookie: store.toString() },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.ok ? ((await res.json()) as T) : null;
}

/** Builds a query string from search params, dropping empty values. */
export function qs(params: Record<string, string | string[] | undefined>, keep?: string[]): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (keep && !keep.includes(key)) continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v) out.set(key, v);
  }
  return out.toString();
}
