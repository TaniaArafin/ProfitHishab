import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../../common/prisma.service';

export interface VariantRow {
  id: string;
  productId: string;
  optionValues: Record<string, string>;
  position: number;
  sku: string;
  sellingPrice: number;
  costPrice: number;
  stock: number;
  status: string;
}

/** A variant with the product facts an order line snapshots. */
export interface VariantWithProduct extends VariantRow {
  productName: string;
  unit: string;
  options: Array<{ name: string; values: string[] }>;
  productStatus: string;
}

export interface VariantWrite {
  optionValues: Record<string, string>;
  position: number;
  sku: string;
  sellingPrice: number;
  costPrice: number;
  stock: number;
  status: string;
  importId?: string | null;
}

const VARIANT_SELECT = {
  id: true,
  productId: true,
  optionValues: true,
  position: true,
  sku: true,
  sellingPrice: true,
  costPrice: true,
  stock: true,
  status: true,
} satisfies Prisma.ProductVariantSelect;

const asRow = (v: Prisma.ProductVariantGetPayload<{ select: typeof VARIANT_SELECT }>): VariantRow => ({
  ...v,
  optionValues: (v.optionValues ?? {}) as Record<string, string>,
});

/** All queries on product_variants: what is sold and counted. */
@Injectable()
export class VariantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every variant of these products, in position order. */
  async forProducts(businessId: string, productIds: string[], db: Tx = this.prisma): Promise<VariantRow[]> {
    if (productIds.length === 0) return [];
    const rows = await db.productVariant.findMany({
      where: { businessId, productId: { in: productIds } },
      orderBy: [{ productId: 'asc' }, { position: 'asc' }, { id: 'asc' }],
      select: VARIANT_SELECT,
    });
    return rows.map(asRow);
  }

  /**
   * Variants by id, plus every variant of the given products, with their product's facts.
   * Ids of another business are absent.
   */
  async withProducts(businessId: string, variantIds: string[], productIds: string[], db: Tx = this.prisma): Promise<VariantWithProduct[]> {
    if (variantIds.length === 0 && productIds.length === 0) return [];
    const rows = await db.productVariant.findMany({
      where: { businessId, OR: [{ id: { in: variantIds } }, { productId: { in: productIds } }] },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { ...VARIANT_SELECT, product: { select: { name: true, unit: true, options: true, status: true } } },
    });
    return rows.map(({ product, ...v }) => ({
      ...asRow(v),
      productName: product.name,
      unit: product.unit,
      options: (product.options ?? []) as VariantWithProduct['options'],
      productStatus: product.status,
    }));
  }

  /** Variants whose SKU (trimmed, any case) is one of these lower-cased values, with their product's facts. */
  async bySkus(businessId: string, skus: string[], db: Tx): Promise<Array<VariantWithProduct & { productSku: string }>> {
    if (skus.length === 0) return [];
    const rows = await db.$queryRaw<
      Array<VariantRow & { productName: string; productSku: string; unit: string; options: unknown; productStatus: string }>
    >`
      SELECT v.id, v."productId", v."optionValues", v.position, v.sku, v."sellingPrice", v."costPrice", v.stock, v.status,
             p.name AS "productName", p.sku AS "productSku", p.unit, p.options, p.status AS "productStatus"
      FROM product_variants v JOIN products p ON p.id = v."productId"
      WHERE v."businessId" = ${businessId}::uuid AND lower(btrim(v.sku)) = ANY(${skus}::text[])
      ORDER BY (v.status = 'archived'), (p.status = 'archived'), v."createdAt", v.id`;
    return rows.map((r) => ({ ...r, options: (Array.isArray(r.options) ? r.options : []) as VariantWithProduct['options'] }));
  }

  /** New options of several products (an import that added variants), in one statement. */
  async setOptions(rows: Array<{ id: string; options: Array<{ name: string; values: string[] }> }>, db: Tx): Promise<void> {
    if (rows.length === 0) return;
    const ids = rows.map((r) => r.id);
    const options = rows.map((r) => JSON.stringify(r.options));
    await db.$executeRaw`
      UPDATE products p SET options = v.options::jsonb, "updatedAt" = now()
      FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${options}::text[]) AS options) v
      WHERE p.id = v.id`;
  }

  /**
   * Deletes the variants this import added to products it did not create, where no order line uses
   * them (run after its orders are gone). Returns the products touched.
   */
  async deleteUnusedFromImport(businessId: string, importId: string, db: Tx): Promise<string[]> {
    const rows = await db.$queryRaw<Array<{ productId: string }>>`
      DELETE FROM product_variants v
      WHERE v."businessId" = ${businessId}::uuid AND v."importId" = ${importId}::uuid
        AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i."variantId" = v.id)
      RETURNING v."productId"`;
    return [...new Set(rows.map((r) => r.productId))];
  }

  /** Which of these SKUs a product other than `exceptProductId` uses, as its own SKU or a variant's. */
  async skusTaken(businessId: string, skus: string[], exceptProductId?: string, db: Tx = this.prisma): Promise<Set<string>> {
    if (skus.length === 0) return new Set();
    const except = exceptProductId ?? '00000000-0000-0000-0000-000000000000';
    const rows = await db.$queryRaw<Array<{ sku: string }>>`
      SELECT sku FROM products WHERE "businessId" = ${businessId}::uuid AND sku = ANY(${skus}::text[]) AND id <> ${except}::uuid
      UNION
      SELECT sku FROM product_variants WHERE "businessId" = ${businessId}::uuid AND sku = ANY(${skus}::text[]) AND "productId" <> ${except}::uuid`;
    return new Set(rows.map((r) => r.sku));
  }

  /** One INSERT; returns the new ids in input order. */
  async createMany(businessId: string, productId: string, rows: VariantWrite[], db: Tx): Promise<string[]> {
    if (rows.length === 0) return [];
    const created = await db.productVariant.createManyAndReturn({
      data: rows.map((r) => ({ ...r, businessId, productId })),
      select: { id: true, sku: true },
    });
    const bySku = new Map(created.map((c) => [c.sku, c.id]));
    return rows.map((r) => bySku.get(r.sku)!);
  }

  /** Variants for many new products (an import), in one INSERT. */
  createForProducts(businessId: string, rows: Array<VariantWrite & { productId: string }>, db: Tx) {
    if (rows.length === 0) return Promise.resolve([]);
    return db.productVariant.createManyAndReturn({
      data: rows.map((r) => ({ ...r, businessId })),
      select: { id: true, productId: true, sku: true },
    });
  }

  update(variantId: string, data: Partial<VariantWrite>, db: Tx): Promise<unknown> {
    return db.productVariant.update({ where: { id: variantId }, data, select: { id: true } });
  }

  /** The ids among these that any order line uses. */
  async withOrders(variantIds: string[], db: Tx = this.prisma): Promise<Set<string>> {
    if (variantIds.length === 0) return new Set();
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT "variantId" AS id FROM order_items WHERE "variantId" = ANY(${variantIds}::uuid[])`;
    return new Set(rows.map((r) => r.id));
  }

  async archive(variantIds: string[], db: Tx): Promise<void> {
    if (variantIds.length === 0) return;
    await db.productVariant.updateMany({ where: { id: { in: variantIds } }, data: { status: 'archived' } });
  }

  async deleteMany(variantIds: string[], db: Tx): Promise<void> {
    if (variantIds.length === 0) return;
    await db.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  }

  /**
   * Adds each delta to its variant's stock in one statement, kept to 3 decimals
   * (laravel-eloquent: bulk-upsert-instead-of-loop). Returns the products touched.
   */
  async adjustStock(deltas: Map<string, number>, db: Tx): Promise<string[]> {
    const entries = [...deltas.entries()].filter(([, delta]) => delta !== 0);
    if (entries.length === 0) return [];
    const ids = entries.map(([id]) => id);
    const amounts = entries.map(([, delta]) => delta);
    const rows = await db.$queryRaw<Array<{ productId: string }>>`
      UPDATE product_variants pv SET stock = round((pv.stock + v.delta)::numeric, 3)::float8, "updatedAt" = now()
      FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${amounts}::float8[]) AS delta) v
      WHERE pv.id = v.id
      RETURNING pv."productId"`;
    return [...new Set(rows.map((r) => r.productId))];
  }

  /**
   * The product row is a summary of its variants: price and cost of the first active variant
   * (by position), stock summed over active variants. One statement for any number of products.
   */
  async refreshProductSummary(productIds: string[], db: Tx): Promise<void> {
    if (productIds.length === 0) return;
    await db.$executeRaw`
      UPDATE products p
      SET stock = s.stock, "sellingPrice" = s."sellingPrice", "costPrice" = s."costPrice", "updatedAt" = now()
      FROM (
        SELECT "productId",
               round(coalesce(sum(stock) FILTER (WHERE status = 'active'), 0)::numeric, 3)::float8 AS stock,
               (array_agg("sellingPrice" ORDER BY (status = 'archived'), position, id))[1] AS "sellingPrice",
               (array_agg("costPrice" ORDER BY (status = 'archived'), position, id))[1] AS "costPrice"
        FROM product_variants
        WHERE "productId" = ANY(${productIds}::uuid[])
        GROUP BY "productId"
      ) s
      WHERE p.id = s."productId"`;
  }
}
