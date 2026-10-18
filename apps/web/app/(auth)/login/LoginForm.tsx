'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { navigateFresh } from '@/lib/navigation';

export function LoginForm({ next }: { next: string }) {
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
      {error && !error.fields ? (
        <p className="rounded-md bg-loss-soft px-3 py-2 text-sm text-loss" role="alert">
          {error.message}
        </p>
      ) : null}
      <div>
        <label className="label" htmlFor="identifier">
          Email or phone
        </label>
        <input
          id="identifier"
          name="identifier"
          className="input"
          autoComplete="username"
          placeholder="you@example.com or 017XXXXXXXX"
          required
        />
        {fieldError(error, 'identifier') ? <p className="mt-1 text-sm text-loss">{fieldError(error, 'identifier')}</p> : null}
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
        {fieldError(error, 'password') ? <p className="mt-1 text-sm text-loss">{fieldError(error, 'password')}</p> : null}
      </div>
      <button type="submit" className="btn-primary py-2.5" disabled={pending}>
        {pending ? 'Logging in…' : 'Log in'}
      </button>
      <p className="text-center text-sm text-ink-muted">
        New to ProfitHishab?{' '}
        <Link href="/register" className="font-semibold text-ink">
          Create an account
        </Link>
      </p>
    </form>
  );
}
