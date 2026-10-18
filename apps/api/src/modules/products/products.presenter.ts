import { percent, type ProductDto, type ProductStatus } from '@ph/shared';
import type { ProductRow } from './products.repository';

export function toProductDto(p: ProductRow): ProductDto {
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
    costMissing: p.costPrice === 0,
  };
}
