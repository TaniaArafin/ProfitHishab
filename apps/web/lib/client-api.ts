'use client';

export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
}

export type ApiResult<T> = { ok: true; data: T; body: Record<string, unknown> } | { ok: false; status: number; error: ApiError };

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)ph_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/** Calls the API through the same-origin /api proxy, sending the CSRF header on mutations. */
export async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'x-csrf-token': csrfToken() } : {}),
        ...extraHeaders,
      },
      signal: AbortSignal.timeout(20_000),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return { ok: true, data: undefined as T, body: {} };
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const error = (json.error as ApiError | undefined) ?? { code: 'error', message: `Request failed (${res.status}).` };
      return { ok: false, status: res.status, error };
    }
    return { ok: true, data: json.data as T, body: json };
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === 'TimeoutError';
    return {
      ok: false,
      status: 0,
      error: {
        code: timedOut ? 'timeout' : 'network',
        message: timedOut
          ? 'The server took too long to answer. Try again.'
          : 'Could not reach the server. Check your connection and try again.',
      },
    };
  }
}

/** First message for a field, matching nested keys like "customer.phone". */
export function fieldError(error: ApiError | null | undefined, field: string): string | undefined {
  return error?.fields?.[field]?.[0];
}
