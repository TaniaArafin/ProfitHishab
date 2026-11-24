'use client';

import { Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type DragEvent, type FormEvent } from 'react';
import type { ImportDto } from '@ph/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { fieldError, upload, type ApiError } from '@/lib/client-api';
import { navigateFresh } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { prepareImport } from '../[id]/checkFile';
import { ImportBusy } from '../ImportBusy';

const MAX_BYTES = 5 * 1024 * 1024;
const NEEDED = ['Phone', 'Product', 'Quantity', 'Selling price'];
const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Pick a spreadsheet, check its size here, upload it, match what we recognise, then open its preview. */
/** `onBusy`: the pop-up stays open while a file is on its way. */
export function UploadStep({ onBusy }: { onBusy?: (busy: boolean) => void } = {}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState<'upload' | 'read' | 'check' | null>(null);
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [dragging, setDragging] = useState(false);
  const tooLarge = file !== null && file.size > MAX_BYTES;

  function choose(next: File | null) {
    setFile(next);
    setError(null);
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    choose(e.dataTransfer.files[0] ?? null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || tooLarge) return;
    setPending('upload');
    onBusy?.(true);
    setUploaded(0);
    setError(null);
    const res = await upload<ImportDto>('/imports', file, {
      onProgress: (sent) => {
        setUploaded(sent);
        // Every byte is sent: the server is now reading the file.
        if (sent >= 1) setPending('read');
      },
    });
    if (!res.ok) {
      setPending(null);
      onBusy?.(false);
      setError(res.error);
      return;
    }
    setPending('check');
    await prepareImport(res.data);
    navigateFresh(router, `/imports/${res.data.id}`);
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Label
          htmlFor="import-file"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:ring-2 focus-within:ring-brand',
            dragging ? 'border-ink bg-brand-soft' : 'border-line bg-paper hover:border-ink/40',
          )}
        >
          {file ? (
            <FileSpreadsheet className="h-8 w-8 text-gain" aria-hidden />
          ) : (
            <UploadCloud className="h-8 w-8 text-ink-muted" aria-hidden />
          )}
          <span className="max-w-full truncate text-base font-semibold">
            {file ? file.name : 'Your file: drop it here or click to choose'}
          </span>
          <span className="text-sm font-normal text-ink-muted">
            {file ? `${size(file.size)} · click to choose another` : '.xlsx, .xls or .csv, up to 5 MB and 5,000 rows'}
          </span>
          <input
            id="import-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
          />
        </Label>
        {tooLarge ? <Alert variant="destructive">This file is larger than 5 MB. Split it into smaller files.</Alert> : null}
        {error ? <Alert variant="destructive">{fieldError(error, 'file') ?? error.message}</Alert> : null}
        {pending ? <ImportBusy step={pending} uploaded={uploaded} /> : null}
        <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-start" disabled={!file || tooLarge || pending !== null}>
          {pending ? 'Working…' : 'Upload and review'}
        </Button>
      </form>

      <div className="flex flex-col gap-2 border-t border-line pt-4 text-sm text-ink-muted">
        <p>Your file needs one row per order item, with these columns:</p>
        <ul className="flex flex-wrap gap-1.5">
          {NEEDED.map((name) => (
            <li key={name} className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-ink">
              {name}
            </li>
          ))}
        </ul>
        <Button asChild variant="link" className="self-start px-0">
          <a href="/api/imports/template.xlsx" download>
            <Download className="h-4 w-4" /> Download template
          </a>
        </Button>
      </div>
    </div>
  );
}
