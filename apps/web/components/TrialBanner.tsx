'use client';

import { trialBanner } from '@ph/shared';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Shown in the last 3 days of the free trial (or paid plan) and after it. Computed from the clock during render:
 * the app layout is force-dynamic, so every navigation renders it fresh. role="status", not "alert": it is on every
 * page, so screen readers should not interrupt with it on each navigation.
 */
export function TrialBanner({ trialEndsAt, paid = false }: { trialEndsAt: string | null; paid?: boolean }) {
  const banner = trialBanner(trialEndsAt, new Date());
  if (!banner) return null;

  const what = paid ? 'plan' : 'free trial';
  const text =
    banner.kind === 'ended'
      ? `Your ${what} has ended. Your data is safe — pay to keep adding and changing orders.`
      : `Your ${what} ends in ${banner.daysLeft} ${banner.daysLeft === 1 ? 'day' : 'days'}.`;

  return (
    <Alert
      role="status"
      variant={banner.kind === 'ended' ? 'destructive' : 'warning'}
      className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
    >
      <span className="min-w-0 flex-1 basis-60 break-words">{text}</span>
      <Button asChild size="sm" className="shrink-0">
        <Link href="/billing">Pay now</Link>
      </Button>
    </Alert>
  );
}
