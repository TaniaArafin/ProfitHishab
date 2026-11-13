import { IMPORT_TARGETS, type ImportTarget } from '@ph/shared';

/** Header texts that suggest each target, most specific first. */
export const HEADER_SYNONYMS: Record<ImportTarget, string[]> = {
  phone: ['phone', 'mobile', 'contact', 'number', 'phone number', 'ফোন', 'মোবাইল', 'নম্বর'],
  product: ['product', 'item', 'product name', 'পণ্য', 'প্রোডাক্ট'],
  quantity: ['qty', 'quantity', 'pcs', 'পরিমাণ'],
  sellingPrice: ['price', 'unit price', 'selling price', 'rate', 'দাম', 'মূল্য'],
  customerName: ['name', 'customer', 'customer name', 'নাম'],
  address: ['address', 'ঠিকানা'],
  orderDate: ['date', 'order date', 'তারিখ'],
  externalRef: ['order id', 'order no', 'order number', 'invoice', 'অর্ডার'],
  sku: ['sku', 'product code', 'code'],
  productCost: ['cost', 'buying price', 'purchase price', 'ক্রয়মূল্য'],
  discount: ['discount', 'ছাড়'],
  deliveryCharge: ['delivery charge', 'delivery', 'shipping'],
  courier: ['courier', 'কুরিয়ার'],
  courierCost: ['courier cost', 'courier charge'],
  paymentMethod: ['payment', 'payment method'],
  status: ['status', 'অবস্থা'],
};

function squash(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, '');
}

/**
 * Suggests which header fills which order field. Pass 1 takes exact matches, pass 2
 * contains-matches, so "Courier Cost" goes to courierCost, not courier. A header and
 * a target are each used at most once.
 */
export function suggestColumns(headers: string[]): Partial<Record<ImportTarget, string>> {
  const result: Partial<Record<ImportTarget, string>> = {};
  const taken = new Set<number>();
  const squashed = headers.map(squash);

  // Pass 1: exact matches, in target order then synonym order.
  for (const target of IMPORT_TARGETS) {
    for (const synonym of HEADER_SYNONYMS[target].map(squash)) {
      const index = squashed.findIndex((h, i) => h !== '' && !taken.has(i) && h === synonym);
      if (index >= 0) {
        result[target] = headers[index];
        taken.add(index);
        break;
      }
    }
  }

  // Pass 2: each free header takes the target of the longest synonym it contains (ties: target order).
  squashed.forEach((h, index) => {
    if (h === '' || taken.has(index)) return;
    let best: { target: ImportTarget; length: number } | null = null;
    for (const target of IMPORT_TARGETS) {
      if (result[target]) continue;
      for (const synonym of HEADER_SYNONYMS[target].map(squash)) {
        if (h.includes(synonym) && (!best || synonym.length > best.length)) best = { target, length: synonym.length };
      }
    }
    if (best) {
      result[best.target] = headers[index];
      taken.add(index);
    }
  });
  return result;
}
