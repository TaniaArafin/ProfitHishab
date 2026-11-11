'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import type { AdminResetLinkDto } from '@ph/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type ApiError } from '@/lib/client-api';
import { formatDateTime } from '../../format';

/** A one-time password link for the owner, to send by SMS or WhatsApp (works for phone-only accounts). */
export function ResetLinkButton({ businessId }: { businessId: string }) {
  const [link, setLink] = useState<AdminResetLinkDto | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    setError(null);
    setCopied(false);
    const res = await api<AdminResetLinkDto>('POST', `/admin/businesses/${businessId}/reset-link`);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLink(res.data);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert variant="destructive">{error.message}</Alert> : null}
      {link ? (
        <div>
          <Label htmlFor="reset-link">Password link</Label>
          <div className="flex gap-2">
            <Input id="reset-link" readOnly value={link.url} className="text-sm" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="secondary" size="icon" aria-label={copied ? 'Copied' : 'Copy link'} onClick={() => void copy()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-1 text-xs text-ink-faint" role="status">
            Works once, until {formatDateTime(link.expiresAt)}. Any older link has stopped working.
          </p>
        </div>
      ) : null}
      <Button type="button" variant="secondary" className="w-full sm:w-auto sm:self-start" disabled={pending} onClick={() => void create()}>
        {pending ? 'Creating…' : link ? 'Create a new link' : 'Create password link'}
      </Button>
    </div>
  );
}
