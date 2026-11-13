import * as XLSX from 'xlsx';

export const TEMPLATE_HEADERS = [
  'Order ID',
  'Order date',
  'Customer name',
  'Phone',
  'Address',
  'Product',
  'SKU',
  'Quantity',
  'Selling price',
  'Product cost',
  'Discount',
  'Delivery charge',
  'Courier',
  'Courier cost',
  'Payment method',
  'Status',
] as const;

const EXAMPLE_ROWS: (string | number)[][] = [
  [
    '1001',
    '2026-11-02',
    'Rahim Uddin',
    '01712345678',
    'House 12, Road 5, Dhanmondi, Dhaka',
    'Cotton Panjabi',
    'PJ-001',
    2,
    1450,
    900,
    100,
    60,
    'Steadfast',
    55,
    'Cash on delivery',
    'Delivered',
  ],
  [
    '1002',
    '2026-11-03',
    'Nusrat Jahan',
    '01812345678',
    'Flat 3B, Mirpur 10, Dhaka',
    'Jamdani Saree',
    'SR-014',
    1,
    3200,
    2100,
    0,
    120,
    'Pathao',
    110,
    'bKash',
    'Returned',
  ],
];

/** The downloadable sample file: headers plus two realistic rows. */
export function buildTemplate(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS], ...EXAMPLE_ROWS]);
  ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Orders');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
