'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, fieldError, type ApiError } from '@/lib/client-api';

/** FR-AUTH-06. The answer never says whether the email has an account (FR-AUTH-03). */
export function ForgotPasswordForm() {
  const [error, setError] = useState<ApiError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const value = new FormData(e.currentTarget).get('email');
    const email = typeof value === 'string' ? value.trim() : '';
    const res = await api('POST', '/auth/password/forgot', { email });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
        <Alert variant="success" role="status">
          If an account uses <strong className="break-all">{sentTo}</strong>, we have sent it a link to choose a new password. The link
          works once, for 60 minutes. Look in your spam folder if it doesn&apos;t arrive in a few minutes.
        </Alert>
        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link href="/login">Back to log in</Link>
        </Button>
      </div>
    );
  }

  const emailError = fieldError(error, 'email');
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
        <p className="mt-1 text-sm text-ink-muted">Enter the email you signed up with. We&apos;ll send you a link to choose a new one.</p>
      </div>
      {error && !error.fields ? <Alert variant="destructive">{error.message}</Alert> : null}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? 'email-error' : undefined}
        />
        {emailError ? (
          <p className="mt-1 text-sm text-loss" id="email-error">
            {emailError}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        Signed up with only a phone number? Email can&apos;t reach you; contact ProfitHishab support to reset it.
      </p>
      <p className="text-center text-sm text-ink-muted">
        Remembered it?{' '}
        <Link href="/login" className="font-semibold text-ink underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
