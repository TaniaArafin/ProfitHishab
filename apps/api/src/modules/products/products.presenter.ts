import { percent, variantLabel, type ProductDto, type ProductStatus, type Unit, type VariantDto, type VariantStatus } from '@ph/shared';
import type { ProductRow } from './products.repository';
import type { VariantRow } from './variants.repository';

type Option = { name: string; values: string[] };

export const productOptions = (p: { options: unknown }): Option[] => (Array.isArray(p.options) ? (p.options as Option[]) : []);

export function toVariantDto(v: VariantRow, options: ReadonlyArray<{ name: string }>): VariantDto {
  return {
    id: v.id,
    optionValues: v.optionValues,
    label: variantLabel(v.optionValues, options),
    sku: v.sku,
    sellingPrice: v.sellingPrice,
    costPrice: v.costPrice,
    stock: v.stock,
    status: v.status as VariantStatus,
  };
}

/** `variants` are this product's, in position order. */
export function toProductDto(p: ProductRow, variants: VariantRow[]): ProductDto {
  const options = productOptions(p);
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
    variants: variants.map((v) => toVariantDto(v, options)),
  };
}
