import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiGetOptional } from '@/lib/server-api';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  // Already logged in with a valid session: go straight in (decided on the server, SRS 3.3).
  if (await apiGetOptional('/auth/me')) redirect('/dashboard');
  const { next, reset } = await searchParams;
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  return <LoginForm next={safeNext} passwordWasReset={reset === '1'} />;
}
