'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/settings/business', label: 'Business' },
  { href: '/settings/profit', label: 'Profit defaults' },
  { href: '/settings/couriers', label: 'Couriers' },
  { href: '/settings/account', label: 'Account' },
];

/** The settings sub-pages (SRS 9). Scrolls sideways inside its own row on a phone. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 rounded-xl bg-card p-1 ring-1 ring-line/70">
        {TABS.map((tab) => {
          const current = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  current ? 'bg-brand-soft text-ink' : 'text-ink-muted hover:bg-paper hover:text-ink',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
