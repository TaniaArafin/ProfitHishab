/**
 * All money is integer poisha (1 taka = 100 poisha). These helpers are the only
 * place taka <-> poisha conversion and display formatting happen.
 */

export function toPoisha(taka: number | string): number {
  const value = typeof taka === 'string' ? Number(taka.replace(/,/g, '').trim()) : taka;
  if (!Number.isFinite(value)) {
    throw new Error(`Not a valid amount: ${taka}`);
  }
  return Math.round(value * 100);
}

/**
 * Parses what a seller typed in a taka field ("2,500", "19.99", "") into poisha.
 * Returns null for blank, non-numeric or negative input, so a form can decide
 * whether blank means 0 or "required".
 */
export function parseTaka(input: string): number | null {
  const text = input.replace(/,/g, '').trim();
  if (text === '' || !/^\d+(\.\d{0,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

export function toTaka(poisha: number): number {
  return poisha / 100;
}

const grouping = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** ৳5,20,000 or −৳1,250.50 — South Asian digit grouping. */
export function formatTaka(poisha: number): string {
  const sign = poisha < 0 ? '−' : '';
  return `${sign}৳${grouping.format(Math.abs(poisha) / 100)}`;
}

/** Compact card form: ৳5.2L, ৳1.3Cr, ৳45K. */
export function formatTakaCompact(poisha: number): string {
  const sign = poisha < 0 ? '−' : '';
  const taka = Math.abs(poisha) / 100;
  const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
  if (taka >= 1_00_00_000) return `${sign}৳${fmt(taka / 1_00_00_000)}Cr`;
  if (taka >= 1_00_000) return `${sign}৳${fmt(taka / 1_00_000)}L`;
  if (taka >= 1_000) return `${sign}৳${fmt(taka / 1_000)}K`;
  return `${sign}৳${fmt(taka)}`;
}

/** Ratio as a percentage rounded to one decimal; 0 when the denominator is 0. */
export function percent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator * 1000) / denominator) / 10;
}
