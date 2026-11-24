import type { Metadata } from 'next';
import type { Me, SignupOptionsDto } from '@ph/shared';
import { apiGet } from '@/lib/server-api';
import { AccountForm } from './AccountForm';
import { ChangePasswordForm } from './ChangePasswordForm';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountSettingsPage() {
  const [{ data: me }, { data: options }] = await Promise.all([
    apiGet<{ data: Me }>('/auth/me'),
    apiGet<{ data: SignupOptionsDto }>('/auth/signup-options'),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <AccountForm user={me.user} emailRequired={options.emailRequired} />
      <ChangePasswordForm />
    </div>
  );
}
