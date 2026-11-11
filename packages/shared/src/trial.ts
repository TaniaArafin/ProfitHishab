/** Length of the free trial. One trial per verified phone number, ever. */
export const TRIAL_DAYS = 7;

import type { AccessStatus } from './enums';

const DAY_MS = 86_400_000;

/**
 * When a new business's trial ends. A phone number that already used its trial
 * (an earlier account, since deleted) gets none: the trial is over at once.
 */
export function trialEndsAt(now: Date, phoneAlreadyUsedTrial: boolean): Date {
  return phoneAlreadyUsedTrial ? new Date(now.getTime()) : new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
}

/** Null means no time limit (early-access sellers). */
export function isTrialOver(endsAt: Date | string | null, now: Date): boolean {
  return endsAt !== null && new Date(endsAt).getTime() <= now.getTime();
}

/** Whole days left, rounded up ("1 day left" until the last minute); 0 once over; null when unlimited. */
export function trialDaysLeft(endsAt: Date | string | null, now: Date): number | null {
  if (endsAt === null) return null;
  const ms = new Date(endsAt).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}

/** Blocked wins; then no end date is unlimited; then before or after the end date. */
export function accessStatus(endsAt: Date | string | null, blockedAt: Date | string | null, now: Date): AccessStatus {
  if (blockedAt !== null) return 'blocked';
  if (endsAt === null) return 'unlimited';
  return isTrialOver(endsAt, now) ? 'ended' : 'trial';
}

/** What an admin asks for in "Change access". */
export type AccessChange = { mode: 'extend'; days: number } | { mode: 'until'; date: string } | { mode: 'unlimited' } | { mode: 'end' };

/**
 * The new end of access (null = unlimited). "Extend" adds days to whichever is later, now or the
 * current end, so extending a running trial never shortens it and an ended one restarts from today.
 * "Until" runs to the end of that day in Dhaka (UTC+6, no daylight saving).
 */
export function newAccessEnd(change: AccessChange, currentEnd: Date | null, now: Date): Date | null {
  switch (change.mode) {
    case 'extend': {
      const base = Math.max(now.getTime(), currentEnd?.getTime() ?? now.getTime());
      return new Date(base + change.days * DAY_MS);
    }
    case 'until':
      return new Date(`${change.date}T23:59:59.999+06:00`);
    case 'unlimited':
      return null;
    case 'end':
      return new Date(now.getTime());
  }
}
