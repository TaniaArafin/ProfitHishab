import { afterEach, describe, expect, it, vi } from 'vitest';
import { upload } from './client-api';

/** A stand-in for the browser's XMLHttpRequest: the test drives its upload progress and its answer. */
class FakeXhr {
  static last: FakeXhr;
  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  status = 0;
  responseText = '';
  timeout = 0;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
  answer(status: number, json: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(json);
    this.onload?.();
  }
}

describe('upload with progress', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports the share of the file sent, then returns the data', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    document.cookie = 'ph_csrf=tok';
    const seen: number[] = [];
    const pending = upload<{ id: string }>('/imports', new File(['x'], 'a.csv'), { onProgress: (f) => seen.push(f) });
    const xhr = FakeXhr.last;
    expect([xhr.method, xhr.url, xhr.headers['x-csrf-token']]).toEqual(['POST', '/api/imports', 'tok']);
    expect((xhr.body as FormData).get('file')).toBeInstanceOf(File);
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    xhr.answer(201, { data: { id: 'imp1' } });
    expect(await pending).toEqual({ ok: true, data: { id: 'imp1' }, body: { data: { id: 'imp1' } } });
    expect(seen).toEqual([0.25, 1]);
  });

  it('returns the API error, and a plain message on a network failure or timeout', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const failed = upload('/imports', new File(['x'], 'a.csv'), { onProgress: () => {} });
    FakeXhr.last.answer(413, { error: { code: 'import_file_too_large', message: 'The file is larger than 5 MB.' } });
    expect(await failed).toEqual({
      ok: false,
      status: 413,
      error: { code: 'import_file_too_large', message: 'The file is larger than 5 MB.' },
    });

    const offline = upload('/imports', new File(['x'], 'a.csv'), { onProgress: () => {} });
    FakeXhr.last.onerror?.();
    expect(await offline).toMatchObject({ ok: false, status: 0, error: { code: 'network' } });

    const slow = upload('/imports', new File(['x'], 'a.csv'), { onProgress: () => {} });
    FakeXhr.last.ontimeout?.();
    expect(await slow).toMatchObject({ ok: false, status: 0, error: { code: 'timeout' } });
  });
});
