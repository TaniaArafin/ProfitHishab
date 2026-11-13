'use client';

import { Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ImportDto } from '@ph/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fieldError, upload, type ApiError } from '@/lib/client-api';
import { navigateFresh } from '@/lib/navigation';

const MAX_BYTES = 5 * 1024 * 1024;

/** Pick a spreadsheet, check its size here, upload it, then open its import wizard. */
export function UploadStep() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const tooLarge = file !== null && file.size > MAX_BYTES;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || tooLarge) return;
    setPending(true);
    setError(null);
    const res = await upload<ImportDto>('/imports', file);
    if (!res.ok) {
      setPending(false);
      setError(res.error);
      return;
    }
    navigateFresh(router, `/imports/${res.data.id}`);
  }

  return (
    <Card className="flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <div className="text-sm text-ink-muted">
        <p>
          One row per order line, with a header row on top. You need at least the phone number, product, quantity and selling price. Up to
          5,000 rows.
        </p>
        <Button asChild variant="link" className="mt-2">
          <a href="/api/imports/template.xlsx" download>
            <Download className="h-4 w-4" /> Download template
          </a>
        </Button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-file">Your file (.xlsx, .xls or .csv, up to 5 MB)</Label>
          <Input
            id="import-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        </div>
        {tooLarge ? <Alert variant="destructive">This file is larger than 5 MB. Split it into smaller files.</Alert> : null}
        {error ? <Alert variant="destructive">{fieldError(error, 'file') ?? error.message}</Alert> : null}
        <div>
          <Button type="submit" disabled={!file || tooLarge || pending}>
            {pending ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
