'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { navigateFresh } from '@/lib/navigation';

export function LoginForm({ next, passwordWasReset = false }: { next: string; passwordWasReset?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await api('POST', '/auth/login', { identifier: form.get('identifier'), password: form.get('password') });
    if (!res.ok) {
      setError(res.error);
      setPending(false);
      return;
    }
    navigateFresh(router, next);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Log in</h1>
        <p className="mt-1 text-sm text-ink-muted">Welcome back. See how your business is doing.</p>
      </div>
      {passwordWasReset && !error ? (
        <Alert variant="success" role="status">
          Password changed. Log in with your new password.
        </Alert>
      ) : null}
      {error && !error.fields ? <Alert variant="destructive">{error.message}</Alert> : null}
      <div>
        <Label htmlFor="identifier">Email or phone</Label>
        <Input id="identifier" name="identifier" autoComplete="username" placeholder="you@example.com or 017XXXXXXXX" required />
        {fieldError(error, 'identifier') ? <p className="mt-1 text-sm text-loss">{fieldError(error, 'identifier')}</p> : null}
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="mb-1.5 text-sm font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
        {fieldError(error, 'password') ? <p className="mt-1 text-sm text-loss">{fieldError(error, 'password')}</p> : null}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Logging in…' : 'Log in'}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        New to ProfitHishab?{' '}
        <Link href="/register" className="font-semibold text-ink underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
