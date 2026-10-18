'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { navigateFresh } from '@/lib/navigation';
import { SelectField } from '@/components/SelectField';

const BUSINESS_TYPES = ['Clothing & fashion', 'Cosmetics & beauty', 'Electronics & gadgets', 'Food & grocery', 'Home & lifestyle', 'Other'];

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const f = new FormData(e.currentTarget);
    const res = await api('POST', '/auth/register', {
      name: f.get('name'),
      businessName: f.get('businessName'),
      email: f.get('email'),
      phone: f.get('phone'),
      password: f.get('password'),
      businessType: f.get('businessType') || undefined,
      city: f.get('city') || undefined,
    });
    if (!res.ok) {
      setError(res.error);
      setPending(false);
      return;
    }
    navigateFresh(router, '/dashboard');
  }

  const err = (field: string) =>
    fieldError(error, field) ? (
      <p className="mt-1 text-sm text-loss" id={`${field}-error`}>
        {fieldError(error, field)}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-ink-muted">Free while we are in early access. Currency is BDT.</p>
      </div>
      {error && !error.fields ? (
        <p className="rounded-md bg-loss-soft px-3 py-2 text-sm text-loss" role="alert">
          {error.message}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input id="name" name="name" className="input" autoComplete="name" required />
          {err('name')}
        </div>
        <div>
          <label className="label" htmlFor="businessName">
            Business name
          </label>
          <input id="businessName" name="businessName" className="input" autoComplete="organization" required />
          {err('businessName')}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" />
        {err('email')}
      </div>
      <div>
        <label className="label" htmlFor="phone">
          Phone <span className="font-normal text-ink-faint">(email or phone is required)</span>
        </label>
        <input id="phone" name="phone" type="tel" className="input" autoComplete="tel" placeholder="017XXXXXXXX" />
        {err('phone')}
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required />
        <p className="mt-1 text-xs text-ink-faint">At least 8 characters.</p>
        {err('password')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="businessType">
            Business type
          </label>
          <SelectField
            id="businessType"
            name="businessType"
            placeholder="Choose…"
            options={BUSINESS_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </div>
        <div>
          <label className="label" htmlFor="city">
            City
          </label>
          <input id="city" name="city" className="input" placeholder="Dhaka" />
        </div>
      </div>
      <button type="submit" className="btn-primary py-2.5" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </button>
      <p className="text-center text-sm text-ink-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-ink">
          Log in
        </Link>
      </p>
    </form>
  );
}
