import { formatTaka, UNIT_LABELS, type ProductDto } from '@ph/shared';

const active = (p: ProductDto) => p.variants.filter((v) => v.status === 'active');

/** "৳1,250", or "from ৳1,250" when the variants are priced differently. */
export function priceText(p: ProductDto): string {
  const prices = active(p).map((v) => v.sellingPrice);
  if (prices.length < 2 || prices.every((x) => x === prices[0])) return formatTaka(p.sellingPrice);
  return `from ${formatTaka(Math.min(...prices))}`;
}

/** "8 variants" for a product with options; null for a plain product. */
export function variantsText(p: ProductDto): string | null {
  if (p.options.length === 0) return null;
  const n = active(p).length;
  return `${n} variant${n === 1 ? '' : 's'}`;
}

/** "14", or "247.5 kg" for any unit but piece. */
export function stockText(p: ProductDto): string {
  return p.unit === 'piece' ? String(p.stock) : `${p.stock} ${UNIT_LABELS[p.unit]}`;
}
