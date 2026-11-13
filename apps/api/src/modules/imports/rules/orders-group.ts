import { orderTotals, type OrderStatus, type PaymentMethod } from '@ph/shared';
import type { NormalizedRow } from './row-parse';

export interface ImportOrderGroup {
  key: string;
  rowNumbers: number[];
  phone: string;
  customerName: string | null;
  address: string | null;
  orderDate: string;
  externalRef: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  courierId: string | null;
  discount: number;
  deliveryCharge: number;
  courierCost: number | null;
  items: { sku: string | null; productName: string; quantity: number; unitPrice: number; unitCost: number | null }[];
  warnings: string[];
}

/** The first row's value that is not empty (null or ''), as sellers often fill order fields on one line only. */
function firstFilled<T>(bucket: { value: NormalizedRow }[], pick: (row: NormalizedRow) => T | null): T | null {
  for (const { value } of bucket) {
    const v = pick(value);
    if (v !== null && v !== '') return v;
  }
  return null;
}

/**
 * Groups parsed rows into orders by externalRef (no ref: one order per row). A group whose rows
 * disagree on phone, date or status is a conflict: all its row numbers are returned and it is not grouped.
 * Every other order-level field (customer, address, discount, charges, courier, payment method) comes
 * from the first row that has it.
 */
export function groupOrders(rows: { rowNumber: number; value: NormalizedRow }[]): {
  groups: ImportOrderGroup[];
  conflicts: number[];
} {
  const buckets = new Map<string, { rowNumber: number; value: NormalizedRow }[]>();
  for (const row of rows) {
    const key = row.value.externalRef ? `ref:${row.value.externalRef}` : `row:${row.rowNumber}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  const groups: ImportOrderGroup[] = [];
  const conflicts: number[] = [];
  for (const [key, bucket] of buckets) {
    const first = bucket[0].value;
    const agrees = bucket.every(
      (r) => r.value.phone === first.phone && r.value.orderDate === first.orderDate && r.value.status === first.status,
    );
    if (!agrees) {
      conflicts.push(...bucket.map((r) => r.rowNumber));
      continue;
    }
    const items = bucket.map((r) => ({
      sku: r.value.sku,
      productName: r.value.productName,
      quantity: r.value.quantity,
      unitPrice: r.value.unitPrice,
      unitCost: r.value.unitCost,
    }));
    const { subtotal } = orderTotals(
      items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, unitCost: i.unitCost ?? 0 })),
      { discount: 0, deliveryCharge: 0 },
    );
    const warnings: string[] = [];
    let discount = firstFilled(bucket, (r) => r.discount || null) ?? 0; // 0 is also an empty cell
    if (discount > subtotal) {
      discount = subtotal;
      warnings.push('discount_clamped');
    }
    groups.push({
      key,
      rowNumbers: bucket.map((r) => r.rowNumber),
      phone: first.phone,
      customerName: firstFilled(bucket, (r) => r.customerName),
      address: firstFilled(bucket, (r) => r.address),
      orderDate: first.orderDate,
      externalRef: first.externalRef,
      status: first.status,
      paymentMethod: firstFilled(bucket, (r) => r.paymentMethod) ?? 'cod',
      courierId: firstFilled(bucket, (r) => r.courierId),
      discount,
      deliveryCharge: firstFilled(bucket, (r) => r.deliveryCharge || null) ?? 0,
      courierCost: firstFilled(bucket, (r) => r.courierCost),
      items,
      warnings,
    });
  }
  return { groups, conflicts: conflicts.sort((a, b) => a - b) };
}
