import type { ProductDto, VariantDto } from '@ph/shared';

/** A plain product as the API returns it: one hidden variant with the product's SKU, price and stock. */
export function plainProduct(over: Partial<ProductDto> & { id: string; name: string }): ProductDto {
  const base = {
    sku: over.id.toUpperCase(),
    categoryId: null,
    categoryName: null,
    sellingPrice: 250000,
    costPrice: 135000,
    grossProfit: 115000,
    margin: 46,
    stock: 10,
    status: 'active' as const,
    costMissing: false,
    unit: 'piece' as const,
    brand: null,
    description: null,
    attributes: [],
    options: [],
    tracksBatches: false,
    expiredStock: 0,
    expiredCost: 0,
    ...over,
  };
  const variant: VariantDto = {
    id: `${over.id}-v`,
    optionValues: {},
    label: '',
    sku: base.sku,
    sellingPrice: base.sellingPrice,
    costPrice: base.costPrice,
    stock: base.stock,
    status: 'active',
    expiredStock: 0,
  };
  return { ...base, variants: over.variants ?? [variant] };
}

/** Cotton Kurti, Size M and XL in Red (spec 5.1). */
export const kurti: ProductDto = plainProduct({
  id: 'kurti',
  name: 'Cotton Kurti',
  sku: 'KUR',
  sellingPrice: 125000,
  costPrice: 70000,
  stock: 18,
  options: [
    { name: 'Size', values: ['M', 'XL'] },
    { name: 'Colour', values: ['Red'] },
  ],
  variants: [
    {
      id: 'kurti-m-red',
      optionValues: { Size: 'M', Colour: 'Red' },
      label: 'M / Red',
      sku: 'KUR-M-RED',
      sellingPrice: 125000,
      costPrice: 70000,
      stock: 14,
      status: 'active',
      expiredStock: 0,
    },
    {
      id: 'kurti-xl-red',
      optionValues: { Size: 'XL', Colour: 'Red' },
      label: 'XL / Red',
      sku: 'KUR-XL-RED',
      sellingPrice: 135000,
      costPrice: 76000,
      stock: 4,
      status: 'active',
      expiredStock: 0,
    },
  ],
});

/** Miniket Rice sold by kg (spec 5.3). */
export const rice: ProductDto = plainProduct({
  id: 'rice',
  name: 'Miniket Rice',
  unit: 'kg',
  sellingPrice: 7800,
  costPrice: 6600,
  stock: 250,
});
