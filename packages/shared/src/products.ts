/**
 * Products for every business (spec 2026-11-25, Stage 1): units, business types, the
 * defaults each type starts with, and the helpers that turn options into variants.
 */

export const UNITS = ['piece', 'kg', 'gram', 'litre', 'ml', 'metre', 'pack', 'box', 'strip', 'dozen', 'pair', 'set'] as const;
export type Unit = (typeof UNITS)[number];

/** Units sold by weight, volume or length: the only ones that take decimal quantities. */
export const DECIMAL_UNITS: ReadonlySet<Unit> = new Set<Unit>(['kg', 'gram', 'litre', 'ml', 'metre']);

export const UNIT_LABELS: Record<Unit, string> = {
  piece: 'piece',
  kg: 'kg',
  gram: 'gram',
  litre: 'litre',
  ml: 'ml',
  metre: 'metre',
  pack: 'pack',
  box: 'box',
  strip: 'strip',
  dozen: 'dozen',
  pair: 'pair',
  set: 'set',
};

export function allowsDecimal(unit: Unit): boolean {
  return DECIMAL_UNITS.has(unit);
}

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value);
}

export const MAX_OPTIONS = 3;
export const MAX_OPTION_VALUES = 50;
export const MAX_VARIANTS = 250;
export const QUANTITY_DECIMALS = 3;

export const BUSINESS_TYPES = [
  'Clothing & fashion',
  'Cosmetics & beauty',
  'Food & grocery',
  'Electronics & gadgets',
  'Medical & pharmacy',
  'Home & lifestyle',
  'Other',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export interface BusinessTypeDefaults {
  unit: Unit;
  options: string[];
  attributes: string[];
  /** New products track batches and expiry dates (spec §6). */
  tracksBatches: boolean;
}

const DEFAULTS: Record<BusinessType, BusinessTypeDefaults> = {
  'Clothing & fashion': { unit: 'piece', options: ['Size', 'Colour'], attributes: ['Material', 'Fit'], tracksBatches: false },
  'Cosmetics & beauty': { unit: 'piece', options: ['Shade'], attributes: ['Skin type', 'Volume'], tracksBatches: true },
  'Food & grocery': { unit: 'kg', options: ['Pack size'], attributes: ['Origin'], tracksBatches: true },
  'Electronics & gadgets': { unit: 'piece', options: ['Storage', 'Colour'], attributes: ['Model'], tracksBatches: false },
  'Medical & pharmacy': { unit: 'strip', options: [], attributes: ['Generic name', 'Strength', 'Form'], tracksBatches: true },
  'Home & lifestyle': { unit: 'piece', options: [], attributes: [], tracksBatches: false },
  Other: { unit: 'piece', options: [], attributes: [], tracksBatches: false },
};

function isBusinessType(value: string | null | undefined): value is BusinessType {
  return !!value && (BUSINESS_TYPES as readonly string[]).includes(value);
}

/** What a new product starts with for this business type (spec section 6). Unknown → piece, nothing suggested. */
export function businessTypeDefaults(type: string | null | undefined): BusinessTypeDefaults {
  const d = isBusinessType(type) ? DEFAULTS[type] : DEFAULTS.Other;
  return { unit: d.unit, options: [...d.options], attributes: [...d.attributes], tracksBatches: d.tracksBatches };
}

const COLOURS = ['Red', 'Blue', 'Black', 'White', 'Green'];

/** Saved option lists every new seller of a type starts with (Settings → Product options). */
export const PRESET_OPTION_LISTS: Record<BusinessType, Array<{ name: string; values: string[] }>> = {
  'Clothing & fashion': [
    { name: 'Size', values: ['S', 'M', 'L', 'XL', 'XXL'] },
    { name: 'Colour', values: COLOURS },
  ],
  'Cosmetics & beauty': [{ name: 'Shade', values: [] }],
  'Food & grocery': [{ name: 'Pack size', values: ['250 g', '500 g', '1 kg', '1 litre', '5 litre'] }],
  'Electronics & gadgets': [
    { name: 'Storage', values: ['4/64', '6/128', '8/128', '8/256'] },
    { name: 'Colour', values: COLOURS },
  ],
  'Medical & pharmacy': [],
  'Home & lifestyle': [],
  Other: [],
};

export function presetOptionLists(type: string | null | undefined): Array<{ name: string; values: string[] }> {
  return isBusinessType(type) ? PRESET_OPTION_LISTS[type].map((l) => ({ name: l.name, values: [...l.values] })) : [];
}

export type OptionValues = Record<string, string>;

/** Every combination of the options' values, in option and value order. No options → one empty combination. */
export function variantCombinations(options: ReadonlyArray<{ name: string; values: readonly string[] }>): OptionValues[] {
  return options.reduce<OptionValues[]>(
    (acc, option) => acc.flatMap((combo) => option.values.map((value) => ({ ...combo, [option.name]: value }))),
    [{}],
  );
}

/** "M / Red": the values in option order. A plain product's single variant has the label "". */
export function variantLabel(optionValues: OptionValues, options: ReadonlyArray<{ name: string }>): string {
  return options
    .map((o) => optionValues[o.name])
    .filter((v): v is string => !!v)
    .join(' / ');
}

/** A stable key for a set of option values, independent of key order and letter case. */
export function optionValuesKey(optionValues: OptionValues): string {
  return Object.keys(optionValues)
    .sort()
    .map((k) => `${k.toLowerCase()}=${(optionValues[k] ?? '').toLowerCase()}`)
    .join('|');
}

const skuPart = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** KUR + {Size: XL, Colour: Sky blue} → KUR-XL-SKY-BLUE (at most 60 characters). */
export function suggestVariantSku(productSku: string, optionValues: OptionValues, options: ReadonlyArray<{ name: string }>): string {
  const parts = [productSku, ...options.map((o) => optionValues[o.name] ?? '')].map(skuPart).filter(Boolean);
  return parts.join('-').slice(0, 60).replace(/-+$/, '');
}

/** Quantities keep at most 3 decimals (2.5 kg, 0.25 litre). */
export function roundQuantity(q: number): number {
  return Math.round(q * 10 ** QUANTITY_DECIMALS) / 10 ** QUANTITY_DECIMALS;
}

export function hasAtMostDecimals(q: number, decimals = QUANTITY_DECIMALS): boolean {
  return Math.abs(q * 10 ** decimals - Math.round(q * 10 ** decimals)) < 1e-6;
}

/** A line's money in whole poisha: quantity × unit amount, rounded. The one rounding rule everywhere. */
export function lineAmount(quantity: number, unit: number): number {
  return Math.round(quantity * unit);
}

// ── Batches and expiry (Stage 2) ───────────────────────────────────────

/** Days ahead that count as "expiring soon" (dashboard alert, product filter). */
export const EXPIRY_SOON_DAYS = 30;

/** A batch is expired from the day after its expiry date (business timezone); it sells on that day. */
export function isExpired(expiresOn: string, today: string): boolean {
  return expiresOn < today;
}

export interface FefoBatch {
  id: string;
  expiresOn: string;
  quantity: number;
  unitCost: number;
}

/**
 * First expiry, first out: takes `quantity` from fresh batches (not expired, not empty), the earliest
 * expiry first, then by id. What the fresh batches cannot cover is `unallocated`.
 */
export function allocateFefo(
  batches: readonly FefoBatch[],
  quantity: number,
  today: string,
): { allocations: Array<{ batchId: string; quantity: number; unitCost: number }>; unallocated: number } {
  const fresh = batches
    .filter((b) => b.quantity > 0 && !isExpired(b.expiresOn, today))
    .sort((a, b) => (a.expiresOn === b.expiresOn ? a.id.localeCompare(b.id) : a.expiresOn.localeCompare(b.expiresOn)));
  const allocations: Array<{ batchId: string; quantity: number; unitCost: number }> = [];
  let left = roundQuantity(quantity);
  for (const b of fresh) {
    if (left <= 0) break;
    const take = roundQuantity(Math.min(left, b.quantity));
    allocations.push({ batchId: b.id, quantity: take, unitCost: b.unitCost });
    left = roundQuantity(left - take);
  }
  return { allocations, unallocated: Math.max(0, left) };
}

/** Average unit cost of a line in whole poisha: allocated batches at their cost, the rest at `fallbackCost`. */
export function fefoUnitCost(
  allocations: ReadonlyArray<{ quantity: number; unitCost: number }>,
  unallocated: number,
  fallbackCost: number,
  quantity: number,
): number {
  if (quantity <= 0) return fallbackCost;
  const total = allocations.reduce((s, a) => s + a.quantity * a.unitCost, 0) + unallocated * fallbackCost;
  return Math.round(total / quantity);
}
