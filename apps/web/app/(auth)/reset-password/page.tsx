import type { Metadata } from 'next';
import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' };

/** Opened from the emailed link (?token=…). The token is checked when the form is sent, not before. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={token ?? ''} />;
}
