import type { Me } from '@ph/shared';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiGet } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { data: me } = await apiGet<{ data: Me }>('/auth/me');
  return (
    <AppShell businessName={me.business.name} userName={me.user.name}>
      {children}
    </AppShell>
  );
}
