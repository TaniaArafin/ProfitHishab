import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiGetOptional } from '@/lib/server-api';
import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage() {
  if (await apiGetOptional('/auth/me')) redirect('/dashboard');
  return <RegisterForm />;
}
