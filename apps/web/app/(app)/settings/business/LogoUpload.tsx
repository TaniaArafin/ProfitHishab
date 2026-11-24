'use client';

import { ImageIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';
import { api, upload } from '@/lib/client-api';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { refreshData } from '@/lib/navigation';

/** Same limit as the API (FR-BIZ-01), checked here first so a large photo is not sent for nothing. */
const MAX_BYTES = 2 * 1024 * 1024;

/** FR-BIZ-01: upload, replace or remove the business logo. */
export function LogoUpload({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // choosing the same file again still fires a change
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('The logo must be 2 MB or smaller.');
      return;
    }
    setPending(true);
    const res = await upload('/business/logo', file);
    setPending(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setError(null);
    refreshData(router);
  }

  async function remove() {
    const res = await api('DELETE', '/business/logo');
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setError(null);
    refreshData(router);
  }

  return (
    <Card className="flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-5">
      <h2 className="font-semibold">Logo</h2>
      {error ? (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        {logoUrl ? (
          // A plain img: the logo is private to the session, and next/image would fetch it without the cookie.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Business logo"
            width={64}
            height={64}
            className="h-16 w-16 rounded-xl object-contain ring-1 ring-line/70"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-paper text-ink-faint ring-1 ring-line/70">
            <ImageIcon className="h-6 w-6" aria-hidden />
          </span>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" disabled={pending}>
              <Label htmlFor="logo-file" className="cursor-pointer">
                {pending ? 'Uploading…' : logoUrl ? 'Change logo' : 'Choose image'}
              </Label>
            </Button>
            {logoUrl ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="link" className="text-loss hover:text-loss">
                    Remove logo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove the logo?</AlertDialogTitle>
                    <AlertDialogDescription>You can upload a new one at any time.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep logo</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void remove()}>Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
          <input
            id="logo-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Upload logo"
            className="sr-only"
            onChange={(e) => void choose(e)}
            disabled={pending}
          />
          <p className="text-xs text-ink-faint">PNG, JPG or WebP, up to 2 MB. Shown at 256 px.</p>
        </div>
      </div>
    </Card>
  );
}
