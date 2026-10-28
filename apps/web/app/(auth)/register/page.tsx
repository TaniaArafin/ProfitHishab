import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { SignupOptionsDto } from '@ph/shared';
import { apiGet, apiGetOptional } from '@/lib/server-api';
import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage() {
  const [me, options] = await Promise.all([apiGetOptional('/auth/me'), apiGet<{ data: SignupOptionsDto }>('/auth/signup-options')]);
  if (me) redirect('/dashboard');
  return <RegisterForm otpRequired={options.data.otpRequired} trialDays={options.data.trialDays} />;
}
