'use client';

import { useState, type FormEvent } from 'react';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EMPTY = { currentPassword: '', newPassword: '' };

/** FR-AUTH-09: change the password with the current one; the API logs out every other device. */
export function ChangePasswordForm() {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setDone(false);
    const res = await api('POST', '/auth/password/change', form);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setForm(EMPTY);
    setDone(true);
  }

  const field = (key: keyof typeof EMPTY, label: string, autoComplete: string, hint?: string) => {
    const message = fieldError(error, key);
    return (
      <div>
        <Label htmlFor={`pw-${key}`}>{label}</Label>
        <Input
          id={`pw-${key}`}
          type="password"
          autoComplete={autoComplete}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `pw-${key}-error` : undefined}
        />
        {hint && !message ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
        {message ? (
          <p id={`pw-${key}-error`} className="mt-1 text-sm text-loss">
            {message}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <Card className="w-full max-w-3xl">
      <form onSubmit={submit} className="flex flex-col gap-4 p-4 sm:p-5" noValidate>
        <div>
          <h2 className="font-semibold">Password</h2>
          <p className="text-sm text-ink-muted">Changing it logs you out on every other phone and computer.</p>
        </div>
        {done ? (
          <Alert variant="success" role="status">
            Password changed. Other devices were logged out.
          </Alert>
        ) : null}
        {error && !error.fields ? <Alert variant="destructive">{error.message}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {field('currentPassword', 'Current password', 'current-password')}
          {field('newPassword', 'New password', 'new-password', 'At least 8 characters.')}
        </div>
        <div>
          <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
            {pending ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
