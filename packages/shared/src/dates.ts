/** Dates are plain YYYY-MM-DD strings in the business timezone. */

export const DEFAULT_TIMEZONE = 'Asia/Dhaka';

export interface Period {
  from: string;
  to: string;
}

export function todayIn(timezone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive number of days in a period. */
export function daysBetween(period: Period): number {
  const a = Date.parse(`${period.from}T00:00:00Z`);
  const b = Date.parse(`${period.to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

export function monthPeriod(date: string): Period {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/** The period of equal length that ends the day before `period` starts. */
export function previousPeriod(period: Period): Period {
  const days = daysBetween(period);
  const to = addDays(period.from, -1);
  return { from: addDays(to, -(days - 1)), to };
}

export const PERIOD_PRESETS = ['this-month', 'last-month', 'last-7-days', 'last-30-days'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export function presetPeriod(preset: PeriodPreset, today: string): Period {
  switch (preset) {
    case 'this-month':
      return monthPeriod(today);
    case 'last-month':
      return monthPeriod(addDays(monthPeriod(today).from, -1));
    case 'last-7-days':
      return { from: addDays(today, -6), to: today };
    case 'last-30-days':
      return { from: addDays(today, -29), to: today };
  }
}

/**
 * Resolves `?period=` / `?from=&to=` query values to a concrete period.
 * Invalid or missing input falls back to the current month.
 */
export function resolvePeriod(
  query: { period?: string; from?: string; to?: string },
  timezone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): Period & { preset: PeriodPreset | 'custom' } {
  const today = todayIn(timezone, now);
  if (query.from && query.to && isIsoDate(query.from) && isIsoDate(query.to) && query.from <= query.to) {
    return { from: query.from, to: query.to, preset: 'custom' };
  }
  const preset = (PERIOD_PRESETS as readonly string[]).includes(query.period ?? '') ? (query.period as PeriodPreset) : 'this-month';
  return { ...presetPeriod(preset, today), preset };
}
