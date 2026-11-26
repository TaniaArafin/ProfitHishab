import { createHash } from 'node:crypto';
import {
  allowsDecimal,
  hasAtMostDecimals,
  optionValuesKey,
  IMPORT_ROW_WARNINGS,
  isIsoDate,
  normalizePhone,
  toAsciiDigits,
  type ImportMapping,
  type ImportRowReason,
  type ImportTarget,
  type OrderStatus,
  type PaymentMethod,
  type Unit,
} from '@ph/shared';
import { suggestStatus } from './status-match';

export interface NormalizedRow {
  phone: string;
  customerName: string | null;
  address: string | null;
  orderDate: string;
  externalRef: string | null;
  sku: string | null;
  productName: string;
  /** {Size: "M", Colour: "Red", Variant: "…"} for the filled option cells; {} for a plain product. */
  optionValues: Record<string, string>;
  /** The row's own unit; null when the column is absent, empty or unknown. */
  unit: Unit | null;
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
  discount: number;
  deliveryCharge: number;
  courierId: string | null;
  courierCost: number | null;
  /** Null when the cell is empty, so another row of the same order can supply it (default: cash on delivery). */
  paymentMethod: PaymentMethod | null;
  status: OrderStatus;
}

export type ImportRowWarning = (typeof IMPORT_ROW_WARNINGS)[number];

export type ParsedRow = { ok: true; value: NormalizedRow; warnings: string[] } | { ok: false; reasons: ImportRowReason[] };

export interface ParseContext {
  /** Business-timezone date used when a row has none. */
  today: string;
  /** Courier name (lower case, trimmed) to courier id. */
  couriers: Map<string, string>;
  /** The unit of an existing product the row names, if any. */
  unitOf?: (ref: { sku: string | null; name: string }) => Unit | null;
  /** The unit a new product gets (the business type's default, spec §6); piece when absent. */
  defaultUnit?: Unit;
}

/** Option columns and the option name each fills on the product. */
export const OPTION_TARGETS = [
  ['size', 'Size'],
  ['colour', 'Colour'],
  ['variant', 'Variant'],
] as const satisfies ReadonlyArray<readonly [ImportTarget, string]>;

const UNIT_SPELLINGS: Record<string, Unit> = {
  piece: 'piece',
  pieces: 'piece',
  pc: 'piece',
  pcs: 'piece',
  পিস: 'piece',
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilogram: 'kg',
  কেজি: 'kg',
  g: 'gram',
  gm: 'gram',
  gms: 'gram',
  gram: 'gram',
  grams: 'gram',
  গ্রাম: 'gram',
  l: 'litre',
  ltr: 'litre',
  litre: 'litre',
  liter: 'litre',
  litres: 'litre',
  liters: 'litre',
  লিটার: 'litre',
  ml: 'ml',
  মিলি: 'ml',
  m: 'metre',
  metre: 'metre',
  meter: 'metre',
  metres: 'metre',
  meters: 'metre',
  মিটার: 'metre',
  pack: 'pack',
  packs: 'pack',
  packet: 'pack',
  প্যাকেট: 'pack',
  box: 'box',
  boxes: 'box',
  বক্স: 'box',
  strip: 'strip',
  strips: 'strip',
  পাতা: 'strip',
  dozen: 'dozen',
  ডজন: 'dozen',
  pair: 'pair',
  pairs: 'pair',
  জোড়া: 'pair',
  set: 'set',
  sets: 'set',
  সেট: 'set',
};

/** Unit cell ("KG", "pcs", "কেজি") to a unit; null when empty or unknown. */
export function parseUnit(cell: string): Unit | null {
  const v = cell.trim().toLowerCase().replace(/\.$/, '');
  return Object.hasOwn(UNIT_SPELLINGS, v) ? UNIT_SPELLINGS[v] : null;
}

/** Money columns are INT. */
const MAX_POISHA = 2_147_483_647;

/** Money cell ("৳ 1,250", "1250 Tk", "১২৫০") to integer poisha; null when empty, negative or not a number. */
export function parseAmount(cell: string): number | null {
  const text = toAsciiDigits(cell)
    .replace(/৳|bdt|taka|tk\.?/gi, '')
    .replace(/\/-$/, '')
    .replace(/[,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const poisha = Math.round(Number(text) * 100);
  return poisha <= MAX_POISHA ? poisha : null;
}

/** A number above zero with at most 3 decimals (2, 2.5, 0.25); null otherwise. Whole-number units are checked per row. */
export function parseQuantity(cell: string): number | null {
  const text = toAsciiDigits(cell).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && n <= 1_000_000 && hasAtMostDecimals(n) ? n : null;
}

function validDate(y: number, m: number, d: number): string | null {
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** Excel serial of 1970-01-01; earlier serials are treated as typos. */
const EXCEL_1970 = 25569;

/**
 * Date cell to YYYY-MM-DD. Accepts year-first y-m-d (also / and ., one separator throughout), day-first
 * d/m/y (also - and .) with a four- or two-digit year (26 is 2026), and Excel serial numbers.
 */
export function parseImportDate(cell: string): string | null {
  const text = toAsciiDigits(cell).trim();
  let m = /^(\d{4})([/\-.])(\d{1,2})\2(\d{1,2})(?:[ T].*)?$/.exec(text);
  if (m) return validDate(Number(m[1]), Number(m[3]), Number(m[4]));
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?:[ T].*)?$/.exec(text);
  if (m) return validDate(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]), Number(m[1]));
  if (/^\d{4,6}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial < EXCEL_1970 || serial > 2958465) return null;
    return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
  }
  return null;
}

const PAYMENT_SPELLINGS: Record<string, PaymentMethod> = {
  cod: 'cod',
  'cash on delivery': 'cod',
  bkash: 'bkash',
  nagad: 'nagad',
  rocket: 'rocket',
  bank: 'bank',
  cash: 'cash',
};

function paymentMethodOf(cell: string): PaymentMethod | null {
  const v = cell.toLowerCase().trim().replace(/\s+/g, ' ');
  if (v === '') return null;
  return Object.hasOwn(PAYMENT_SPELLINGS, v) ? PAYMENT_SPELLINGS[v] : 'other';
}

function statusOf(cell: string, mapping: ImportMapping): OrderStatus {
  const raw = cell.trim();
  const lower = raw.toLowerCase();
  const mapped = Object.hasOwn(mapping.statuses, raw)
    ? mapping.statuses[raw]
    : Object.entries(mapping.statuses).find(([k]) => k.trim().toLowerCase() === lower)?.[1];
  return mapped ?? suggestStatus(raw) ?? 'delivered';
}

/** Validates one spreadsheet row and turns it into a normalised order line. */
export function parseRow(raw: Record<string, string>, mapping: ImportMapping, ctx: ParseContext): ParsedRow {
  const cell = (target: ImportTarget): string => {
    const header = mapping.columns[target];
    return header === undefined ? '' : (raw[header] ?? '').trim();
  };
  const reasons: ImportRowReason[] = [];
  const warnings: string[] = [];

  const phone = normalizePhone(cell('phone'));
  if (!phone) reasons.push('phone_invalid');

  const productName = cell('product');
  if (productName === '') reasons.push('product_missing');

  const quantity = parseQuantity(cell('quantity'));
  if (quantity === null) reasons.push('quantity_invalid');

  const unitPrice = parseAmount(cell('sellingPrice'));
  if (unitPrice === null) reasons.push('price_invalid');

  const sku = cell('sku') || null;
  const unitCell = cell('unit');
  const unit = parseUnit(unitCell);
  if (unitCell !== '' && unit === null) warnings.push('unit_unknown' satisfies ImportRowWarning);
  const soldBy = unit ?? ctx.unitOf?.({ sku, name: productName }) ?? ctx.defaultUnit ?? 'piece';
  if (quantity !== null && !Number.isInteger(quantity) && !allowsDecimal(soldBy)) reasons.push('quantity_not_whole');
  const optionValues: Record<string, string> = {};
  for (const [target, name] of OPTION_TARGETS) if (cell(target)) optionValues[name] = cell(target);

  let orderDate = ctx.today;
  const dateCell = cell('orderDate');
  if (dateCell === '') {
    warnings.push('date_missing' satisfies ImportRowWarning);
  } else {
    const parsed = parseImportDate(dateCell);
    if (parsed === null) reasons.push('date_invalid');
    else orderDate = parsed;
  }

  // Optional money: empty gives the default; a filled but unreadable amount is a price problem.
  const optionalMoney = (target: ImportTarget, empty: number | null): number | null => {
    const text = cell(target);
    if (text === '') return empty;
    const amount = parseAmount(text);
    if (amount === null) {
      if (!reasons.includes('price_invalid')) reasons.push('price_invalid');
      return empty;
    }
    return amount;
  };
  const unitCost = optionalMoney('productCost', null);
  const discount = optionalMoney('discount', 0);
  const deliveryCharge = optionalMoney('deliveryCharge', 0);
  const courierCost = optionalMoney('courierCost', null);
  if (unitCost === null) warnings.push('cost_missing' satisfies ImportRowWarning);

  if (reasons.length > 0 || phone === null || quantity === null || unitPrice === null) {
    const order: ImportRowReason[] = [
      'phone_invalid',
      'product_missing',
      'quantity_invalid',
      'quantity_not_whole',
      'price_invalid',
      'date_invalid',
    ];
    return { ok: false, reasons: order.filter((r) => reasons.includes(r)) };
  }

  const courierName = cell('courier').toLowerCase();
  const statusCell = cell('status');
  return {
    ok: true,
    warnings,
    value: {
      phone,
      customerName: cell('customerName') || null,
      address: cell('address') || null,
      orderDate,
      externalRef: cell('externalRef') || null,
      sku,
      productName,
      optionValues,
      unit,
      quantity,
      unitPrice,
      unitCost,
      discount: discount ?? 0,
      deliveryCharge: deliveryCharge ?? 0,
      courierId: (courierName && ctx.couriers.get(courierName)) || null,
      courierCost,
      paymentMethod: paymentMethodOf(cell('paymentMethod')),
      // No status column: every row is delivered (FR-IMP-04).
      status: mapping.columns.status === undefined ? 'delivered' : statusOf(statusCell, mapping),
    },
  };
}

const FIELD_HINTS = {
  phone: 'Enter a number like 017XXXXXXXX',
  product: 'Enter the product name',
  quantity: 'Enter a number above 0, like 2 or 2.5',
  amount: 'Enter an amount like 1250',
  date: 'Enter a date like 2026-10-31',
} as const;

const OPTIONAL_MONEY: readonly ImportTarget[] = ['productCost', 'discount', 'deliveryCharge', 'courierCost'];

/** Which fields of a row `parseRow` refuses, with what to enter in each, so the seller can fix them in place. */
export function rowProblems(raw: Record<string, string>, mapping: ImportMapping): Partial<Record<ImportTarget, string>> {
  const cell = (target: ImportTarget): string => {
    const header = mapping.columns[target];
    return header === undefined ? '' : (raw[header] ?? '').trim();
  };
  const problems: Partial<Record<ImportTarget, string>> = {};
  if (!normalizePhone(cell('phone'))) problems.phone = FIELD_HINTS.phone;
  if (cell('product') === '') problems.product = FIELD_HINTS.product;
  if (parseQuantity(cell('quantity')) === null) problems.quantity = FIELD_HINTS.quantity;
  if (parseAmount(cell('sellingPrice')) === null) problems.sellingPrice = FIELD_HINTS.amount;
  if (cell('orderDate') !== '' && parseImportDate(cell('orderDate')) === null) problems.orderDate = FIELD_HINTS.date;
  for (const target of OPTIONAL_MONEY) {
    if (cell(target) !== '' && parseAmount(cell(target)) === null) problems[target] = FIELD_HINTS.amount;
  }
  return problems;
}

/**
 * Fingerprint of an order line, to spot a row already imported. Option values are part of it, so M and
 * L of one product on one day are different lines; a plain row hashes exactly as before variants existed.
 */
export function dedupeHash(row: NormalizedRow): string {
  const item = (row.sku || row.productName).trim().toLowerCase();
  const options = optionValuesKey(row.optionValues ?? {});
  const base = `${row.phone}|${row.orderDate}|${item}|${row.quantity}|${row.unitPrice}`;
  return createHash('sha256')
    .update(options ? `${base}|${options}` : base)
    .digest('hex');
}

/** Hint for a whole-number unit; the preview puts it on the Qty cell. */
export const WHOLE_QUANTITY_HINT = 'This product is sold whole; enter a whole number like 1 or 2';
