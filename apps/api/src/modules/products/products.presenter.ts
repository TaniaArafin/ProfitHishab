import { percent, variantLabel, type ProductDto, type ProductStatus, type Unit, type VariantDto, type VariantStatus } from '@ph/shared';
import type { ProductRow } from './products.repository';
import type { VariantRow } from './variants.repository';

type Option = { name: string; values: string[] };

export const productOptions = (p: { options: unknown }): Option[] => (Array.isArray(p.options) ? (p.options as Option[]) : []);

/** Expired stock and its cost per variant id. */
export type ExpiredByVariant = ReadonlyMap<string, { quantity: number; cost: number }>;
const NONE: ExpiredByVariant = new Map();

export function toVariantDto(v: VariantRow, options: ReadonlyArray<{ name: string }>, expired: ExpiredByVariant = NONE): VariantDto {
  return {
    id: v.id,
    optionValues: v.optionValues,
    label: variantLabel(v.optionValues, options),
    sku: v.sku,
    sellingPrice: v.sellingPrice,
    costPrice: v.costPrice,
    stock: v.stock,
    status: v.status as VariantStatus,
    expiredStock: expired.get(v.id)?.quantity ?? 0,
  };
}

/** `variants` are this product's, in position order. */
export function toProductDto(p: ProductRow, variants: VariantRow[], expired: ExpiredByVariant = NONE): ProductDto {
  const options = productOptions(p);
  const mine = variants.flatMap((v) => (expired.has(v.id) ? [expired.get(v.id)!] : []));
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    categoryId: p.categoryId,
    categoryName: p.categoryName,
    sellingPrice: p.sellingPrice,
    costPrice: p.costPrice,
    grossProfit: p.sellingPrice - p.costPrice,
    margin: percent(p.sellingPrice - p.costPrice, p.sellingPrice),
    stock: p.stock,
    status: p.status as ProductStatus,
    costMissing: variants.some((v) => v.status === 'active' && v.costPrice === 0),
    unit: p.unit as Unit,
    brand: p.brand,
    description: p.description,
    attributes: Array.isArray(p.attributes) ? (p.attributes as ProductDto['attributes']) : [],
    options,
    variants: variants.map((v) => toVariantDto(v, options, expired)),
    tracksBatches: p.tracksBatches,
    expiredStock: Math.round(mine.reduce((s, e) => s + e.quantity, 0) * 1000) / 1000,
    expiredCost: mine.reduce((s, e) => s + e.cost, 0),
  };
}
