'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { navigateFresh } from '@/lib/navigation';
import { SelectField } from '@/components/SelectField';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneVerification } from './PhoneVerification';

const BUSINESS_TYPES = ['Clothing & fashion', 'Cosmetics & beauty', 'Electronics & gadgets', 'Food & grocery', 'Home & lifestyle', 'Other'];

/** `otpRequired` comes from the API (OTP_REQUIRED): confirm the phone by SMS, or just email/phone and password. */
export function RegisterForm({ otpRequired, trialDays }: { otpRequired: boolean; trialDays: number }) {
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
      phone: f.get('phone'),
      code: f.get('code') ?? '',
      email: f.get('email'),
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
        <p className="mt-1 text-sm text-ink-muted">{trialDays}-day free trial. No payment needed to start.</p>
      </div>
      {error && !error.fields ? <Alert variant="destructive">{error.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required />
          {err('name')}
        </div>
        <div>
          <Label htmlFor="businessName">Business name</Label>
          <Input id="businessName" name="businessName" autoComplete="organization" required />
          {err('businessName')}
        </div>
      </div>
      {otpRequired ? <PhoneVerification error={error} /> : null}
      <div>
        <Label htmlFor="email">
          Email <span className="font-normal text-ink-faint">{otpRequired ? '(optional)' : '(email or phone is required)'}</span>
        </Label>
        <Input id="email" name="email" type="email" autoComplete="email" />
        {err('email')}
      </div>
      {otpRequired ? null : (
        <div>
          <Label htmlFor="phone">Mobile number</Label>
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="017XXXXXXXX" />
          {err('phone')}
        </div>
      )}
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <p className="mt-1 text-xs text-ink-faint">At least 8 characters.</p>
        {err('password')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="businessType">Business type</Label>
          <SelectField
            id="businessType"
            name="businessType"
            placeholder="Choose…"
            options={BUSINESS_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" placeholder="Dhaka" />
        </div>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-ink underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
