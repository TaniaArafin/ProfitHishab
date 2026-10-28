/** Length of the free trial. One trial per verified phone number, ever. */
export const TRIAL_DAYS = 7;

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
