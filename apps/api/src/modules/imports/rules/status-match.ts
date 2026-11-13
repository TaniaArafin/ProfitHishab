import type { OrderStatus } from '@ph/shared';

/** Guesses the order status a spreadsheet's status text stands for; null when unknown. */
export function suggestStatus(value: string): OrderStatus | null {
  const v = value.toLowerCase().trim().replace(/\s+/g, ' ');
  if (['delivered', 'paid', 'complete', 'completed', 'ডেলিভারড'].includes(v)) return 'delivered';
  if (['return', 'returned', 'rto', 'ফেরত'].includes(v)) return 'returned';
  if (v.startsWith('cancel')) return 'cancelled';
  if (['shipped', 'in transit'].includes(v)) return 'shipped';
  if (v === 'confirmed') return 'confirmed';
  if (['pending', 'new'].includes(v)) return 'new';
  return null;
}
