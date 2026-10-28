'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { navigateFresh } from '@/lib/navigation';

/** FR-AUTH-06: a new password from the emailed link. Success logs out every device; the seller logs in again. */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [pending, setPending] = useState(false);

  if (!token) return <LinkProblem message="This reset link is not complete. Open it from the email again, or ask for a new one." />;
  if (error?.code === 'reset_link_invalid') return <LinkProblem message={error.message} />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value : '';
    };
    const password = text('password');
    if (password !== text('confirm')) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setPending(true);
    setError(null);
    const res = await api('POST', '/auth/password/reset', { token, password });
    if (!res.ok) {
      setError(res.error);
      setPending(false);
      return;
    }
    navigateFresh(router, '/login?reset=1');
  }

  const passwordError = fieldError(error, 'password');
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm text-ink-muted">
          After this you&apos;ll be logged out on every device. Log in again with the new password.
        </p>
      </div>
      {error && !error.fields ? <Alert variant="destructive">{error.message}</Alert> : null}
      <div>
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? 'password-error' : 'password-hint'}
        />
        {passwordError ? (
          <p className="mt-1 text-sm text-loss" id="password-error">
            {passwordError}
          </p>
        ) : (
          <p className="mt-1 text-xs text-ink-faint" id="password-hint">
            At least 8 characters.
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="confirm">Type it again</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={mismatch ? true : undefined}
          aria-describedby={mismatch ? 'confirm-error' : undefined}
        />
        {mismatch ? (
          <p className="mt-1 text-sm text-loss" id="confirm-error">
            The two passwords are different.
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Saving…' : 'Save new password'}
      </Button>
    </form>
  );
}

function LinkProblem({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">This link doesn&apos;t work</h1>
      <Alert variant="destructive">{message}</Alert>
      <Button asChild size="lg" className="w-full">
        <Link href="/forgot-password">Send a new link</Link>
      </Button>
    </div>
  );
}
