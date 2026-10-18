import { resolvePeriod } from '@ph/shared';

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Resolves the period from page search params (same rules as the API) plus a ready query string. */
export function periodFromParams(sp: SearchParams, timezone = 'Asia/Dhaka') {
  const resolved = resolvePeriod({ period: first(sp.period), from: first(sp.from), to: first(sp.to) }, timezone);
  return { ...resolved, query: `from=${resolved.from}&to=${resolved.to}` };
}

export function periodLabel(from: string, to: string): string {
  const fmt = (d: string, withYear: boolean) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  const sameMonthWhole = from.slice(0, 7) === to.slice(0, 7) && from.endsWith('-01');
  if (sameMonthWhole) {
    const last = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).getUTCDate();
    if (Number(to.slice(8)) === last) {
      return new Date(`${from}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
  }
  return `${fmt(from, from.slice(0, 4) !== to.slice(0, 4))} – ${fmt(to, true)}`;
}

/** "2026-10-01" → "1 Oct 2026". */
export function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
