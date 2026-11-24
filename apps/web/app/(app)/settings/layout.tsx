import type { ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { SettingsNav } from './SettingsNav';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Settings} title="Settings" description="Your business, order defaults, couriers and account." />
      <SettingsNav />
      {children}
    </div>
  );
}
