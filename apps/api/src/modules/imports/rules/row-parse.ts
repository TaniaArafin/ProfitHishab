import { createHash } from 'node:crypto';
import {
  IMPORT_ROW_WARNINGS,
  isIsoDate,
  normalizePhone,
  toAsciiDigits,
  type ImportMapping,
  type ImportRowReason,
  type ImportTarget,
  type OrderStatus,
  type PaymentMethod,
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

/** Whole number above zero; null otherwise. */
export function parseQuantity(cell: string): number | null {
  const text = toAsciiDigits(cell).trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
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
    const order: ImportRowReason[] = ['phone_invalid', 'product_missing', 'quantity_invalid', 'price_invalid', 'date_invalid'];
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
      sku: cell('sku') || null,
      productName,
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

/** Fingerprint of an order line, to spot a row already imported. */
export function dedupeHash(row: NormalizedRow): string {
  const item = (row.sku || row.productName).trim().toLowerCase();
  return createHash('sha256').update(`${row.phone}|${row.orderDate}|${item}|${row.quantity}|${row.unitPrice}`).digest('hex');
}
