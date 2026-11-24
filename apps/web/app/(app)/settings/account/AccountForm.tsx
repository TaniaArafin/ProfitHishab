'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { Me } from '@ph/shared';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { refreshData } from '@/lib/navigation';

/** FR-AUTH-09: the seller's own name, email and phone (how they log in). */
export function AccountForm({ user, emailRequired }: { user: Me['user']; emailRequired: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: user.name, email: user.email ?? '', phone: user.phone ?? '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setSaved(false);
    const res = await api('PATCH', '/auth/me', form);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setSaved(true);
    refreshData(router);
  }

  const field = (key: keyof typeof form, label: string, props: Record<string, string> = {}, note?: string) => {
    const message = fieldError(error, key);
    return (
      <div>
        <Label htmlFor={`account-${key}`}>
          {label} {note ? <span className="font-normal text-ink-faint">{note}</span> : null}
        </Label>
        <Input
          id={`account-${key}`}
          value={form[key]}
          onChange={set(key)}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `account-${key}-error` : undefined}
          {...props}
        />
        {message ? (
          <p id={`account-${key}-error`} className="mt-1 text-sm text-loss">
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
          <h2 className="font-semibold">Your account</h2>
          <p className="text-sm text-ink-muted">You log in with your email or mobile number.</p>
        </div>
        {saved ? (
          <Alert variant="success" role="status">
            Account saved.
          </Alert>
        ) : null}
        {error && !error.fields ? <Alert variant="destructive">{error.message}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {field('name', 'Your name', { autoComplete: 'name' })}
          {field('email', 'Email', { type: 'email', autoComplete: 'email' }, emailRequired ? undefined : '(optional)')}
          {field(
            'phone',
            'Mobile number',
            { type: 'tel', inputMode: 'tel', autoComplete: 'tel', placeholder: '017XXXXXXXX' },
            '(optional)',
          )}
        </div>
        <div>
          <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
            {pending ? 'Saving…' : 'Save account'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
