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

const DEFAULT_TIMEOUT_MS = 20_000;
/** Uploads, and the import validate and commit calls: a 5,000-row import can take close to 20 s. */
const LONG_TIMEOUT_MS = 60_000;

export interface ApiOptions {
  /** Defaults to 20 s. */
  timeoutMs?: number;
}

/** Calls the API through the same-origin /api proxy, sending the CSRF header on mutations. */
export async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
  { timeoutMs = DEFAULT_TIMEOUT_MS }: ApiOptions = {},
): Promise<ApiResult<T>> {
  return send<T>(`/api${path}`, timeoutMs, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'x-csrf-token': csrfToken() } : {}),
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export interface UploadOptions extends ApiOptions {
  /** Called with the share of the file sent so far (0 to 1). Needs XMLHttpRequest: fetch cannot report it. */
  onProgress?: (fraction: number) => void;
}

/**
 * POSTs one file as multipart form data (field `file`). No content-type header: the browser sets
 * it with the multipart boundary. The CSRF header is still sent. 60 s timeout unless given.
 */
export async function upload<T>(
  path: string,
  file: File,
  { timeoutMs = LONG_TIMEOUT_MS, onProgress }: UploadOptions = {},
): Promise<ApiResult<T>> {
  const form = new FormData();
  form.append('file', file);
  if (onProgress) return sendWithProgress<T>(`/api${path}`, timeoutMs, form, onProgress);
  return send<T>(`/api${path}`, timeoutMs, {
    method: 'POST',
    headers: { accept: 'application/json', 'x-csrf-token': csrfToken() },
    body: form,
  });
}

function sendWithProgress<T>(
  url: string,
  timeoutMs: number,
  form: FormData,
  onProgress: (fraction: number) => void,
): Promise<ApiResult<T>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('accept', 'application/json');
    xhr.setRequestHeader('x-csrf-token', csrfToken());
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let json: Record<string, unknown> = {};
      try {
        json = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, unknown>) : {};
      } catch {
        json = {};
      }
      resolve(toResult<T>(xhr.status, json));
    };
    xhr.onerror = () => resolve(failure('network'));
    xhr.ontimeout = () => resolve(failure('timeout'));
    xhr.send(form);
  });
}

function toResult<T>(status: number, json: Record<string, unknown>): ApiResult<T> {
  if (status === 204) return { ok: true, data: undefined as T, body: {} };
  if (status < 200 || status >= 300) {
    const error = (json.error as ApiError | undefined) ?? { code: 'error', message: `Request failed (${status}).` };
    return { ok: false, status, error };
  }
  return { ok: true, data: json.data as T, body: json };
}

function failure(code: 'network' | 'timeout'): ApiResult<never> {
  return {
    ok: false,
    status: 0,
    error: {
      code,
      message:
        code === 'timeout'
          ? 'The server took too long to answer. Try again.'
          : 'Could not reach the server. Check your connection and try again.',
    },
  };
}

async function send<T>(url: string, timeoutMs: number, init: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 204) return { ok: true, data: undefined as T, body: {} };
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return toResult<T>(res.status, json);
  } catch (e) {
    return failure(e instanceof DOMException && e.name === 'TimeoutError' ? 'timeout' : 'network');
  }
}

/** First message for a field, matching nested keys like "customer.phone". */
export function fieldError(error: ApiError | null | undefined, field: string): string | undefined {
  return error?.fields?.[field]?.[0];
}
