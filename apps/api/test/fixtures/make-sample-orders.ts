import type { ImportMapping } from '@ph/shared';
import * as XLSX from 'xlsx';

/**
 * The deterministic 237-row order sheet used by the import tests and by Phase 2 (SRS 11.1).
 *
 * Composition, in file order (data rows 2–238; row 1 is the header):
 * - 225 valid single-item orders (rows 2–226), all Delivered, dated 1–31 October 2026, one fake
 *   customer each. 180 have an Order ID (FB-10001…), 45 have none (every fifth row).
 *   Nine products repeat 25 times each, quantity 1:
 *     sales         = 25 × ৳20,800 = ৳5,20,000 (52,000,000 poisha)
 *     product cost  = 25 × ৳12,000 = ৳3,00,000 (30,000,000 poisha)
 *     courier cost  = 175 × ৳150 (Steadfast) + 50 × ৳175 (Pathao) = ৳35,000 (3,500,000 poisha)
 *   No discount and no delivery charge.
 * - 5 `duplicate_in_file` rows (rows 227–231): exact copies of five earlier rows without an Order ID.
 * - 3 `duplicate_ref` rows (rows 232–234): Order IDs in SEED_ORDER_REFS, which the test first
 *   creates as existing imported orders.
 * - 4 invalid rows (rows 235–238): a bad phone, a missing product, quantity 0, date 31/02/2026.
 */

export const SAMPLE_HEADERS = [
  'Order ID',
  'Order Date',
  'Customer Name',
  'Phone',
  'Address',
  'Product',
  'Qty',
  'Selling Price',
  'Product Cost',
  'Courier',
  'Courier Cost',
  'Payment',
  'Status',
] as const;

export const SAMPLE_MAPPING: ImportMapping = {
  columns: {
    externalRef: 'Order ID',
    orderDate: 'Order Date',
    customerName: 'Customer Name',
    phone: 'Phone',
    address: 'Address',
    product: 'Product',
    quantity: 'Qty',
    sellingPrice: 'Selling Price',
    productCost: 'Product Cost',
    courier: 'Courier',
    courierCost: 'Courier Cost',
    paymentMethod: 'Payment',
    status: 'Status',
  },
  statuses: { Delivered: 'delivered' },
};

/** Order IDs of the three orders that exist before the sample is imported. */
export const SEED_ORDER_REFS = ['FB-90001', 'FB-90002', 'FB-90003'] as const;

/** What validating the sample must give, with the valid rows' money in poisha. */
export const SAMPLE_TOTALS = {
  rows: 237,
  valid: 225,
  duplicate: 8,
  duplicateInFile: 5,
  duplicateRef: 3,
  invalid: 4,
  orders: 225,
  sales: 52_000_000,
  productCost: 30_000_000,
  courierCost: 3_500_000,
  from: '2026-10-01',
  to: '2026-10-31',
} as const;

/** Taka price and cost; prices add up to ৳20,800 and costs to ৳12,000. */
const PRODUCTS: ReadonlyArray<{ name: string; price: number; cost: number }> = [
  { name: 'Jamdani Saree', price: 4500, cost: 2600 },
  { name: 'Cotton Saree', price: 2200, cost: 1250 },
  { name: 'Panjabi', price: 1850, cost: 1050 },
  { name: 'Three-piece', price: 2600, cost: 1500 },
  { name: 'Kurti', price: 1250, cost: 700 },
  { name: 'Hijab', price: 450, cost: 250 },
  { name: 'Lungi', price: 650, cost: 380 },
  { name: 'Salwar Kameez', price: 3200, cost: 1850 },
  { name: 'Lehenga', price: 4100, cost: 2420 },
];

const FIRST = ['Nusrat', 'Farhana', 'Tanvir', 'Sadia', 'Rakib', 'Mim', 'Arif', 'Sumaiya', 'Jahid', 'Ritu', 'Imran'];
const LAST = ['Akter', 'Hossain', 'Rahman', 'Islam', 'Chowdhury', 'Begum', 'Karim'];
const AREAS = [
  'Road 7, Dhanmondi, Dhaka',
  'Sector 10, Uttara, Dhaka',
  'Mirpur 2, Dhaka',
  'Block C, Bashundhara, Dhaka',
  'Agrabad, Chattogram',
  'GEC Circle, Chattogram',
  'Halishahar, Chattogram',
];

type Cell = string | number;

function validRow(i: number): Cell[] {
  const product = PRODUCTS[i % PRODUCTS.length];
  const pathao = i % 9 >= 7; // 2 of every 9 rows: 50 of 225
  const day = String((i % 31) + 1).padStart(2, '0');
  return [
    i % 5 === 4 ? '' : `FB-${10001 + i}`,
    `${day}/10/2026`,
    `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`,
    `${i % 2 ? '018' : '017'}${55_000_000 + i * 13}`,
    `House ${(i % 40) + 1}, ${AREAS[i % AREAS.length]}`,
    product.name,
    1,
    product.price,
    product.cost,
    pathao ? 'Pathao' : 'Steadfast',
    pathao ? 175 : 150,
    i % 3 === 0 ? 'bKash' : 'COD',
    'Delivered',
  ];
}

/** A valid-looking row on its own; `patch` overrides cells by header. */
function extraRow(n: number, patch: Partial<Record<(typeof SAMPLE_HEADERS)[number], Cell>> = {}): Cell[] {
  const base: Record<(typeof SAMPLE_HEADERS)[number], Cell> = {
    'Order ID': '',
    'Order Date': '15/10/2026',
    'Customer Name': `Extra Customer ${n}`,
    Phone: `0191${String(2_000_000 + n)}`,
    Address: 'Lalbagh, Dhaka',
    Product: 'Kurti',
    Qty: 1,
    'Selling Price': 1250,
    'Product Cost': 700,
    Courier: 'Steadfast',
    'Courier Cost': 150,
    Payment: 'COD',
    Status: 'Delivered',
  };
  const row = { ...base, ...patch };
  return SAMPLE_HEADERS.map((h) => row[h]);
}

function toXlsx(rows: Cell[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...SAMPLE_HEADERS], ...rows]), 'Orders');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** The sample's data rows, for tests that want to look at cells. */
export function sampleOrderRows(): Cell[][] {
  const valid = Array.from({ length: SAMPLE_TOTALS.valid }, (_, i) => validRow(i));
  const inFile = [4, 49, 94, 139, 184].map((i) => validRow(i));
  const byRef = SEED_ORDER_REFS.map((ref, k) => extraRow(k + 1, { 'Order ID': ref }));
  const invalid = [
    extraRow(11, { Phone: '01234' }),
    extraRow(12, { Product: '' }),
    extraRow(13, { Qty: 0 }),
    extraRow(14, { 'Order Date': '31/02/2026' }),
  ];
  return [...valid, ...inFile, ...byRef, ...invalid];
}

export function makeSampleOrders(): Buffer {
  return toXlsx(sampleOrderRows());
}
