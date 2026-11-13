import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fromDbDate, toDbDate } from '../../common/dates';
import { PrismaService, type Tx } from '../../common/prisma.service';

export interface PricePoint {
  sellingPrice: number;
  costPrice: number;
}

export interface PriceHistoryRow extends PricePoint {
  effectiveFrom: string;
  changedAt: Date;
}

/** All queries on product_prices, the per-day price history. */
@Injectable()
export class ProductPricesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Records the price from `effectiveFrom` on; a second change on the same day replaces that day's row. */
  async record(
    businessId: string,
    productId: string,
    price: PricePoint,
    effectiveFrom: string,
    createdById: string | null,
    db: Tx = this.prisma,
  ): Promise<void> {
    const day = toDbDate(effectiveFrom);
    await db.productPrice.upsert({
      where: { productId_effectiveFrom: { productId, effectiveFrom: day } },
      create: { businessId, productId, effectiveFrom: day, createdById, ...price },
      update: { createdById, ...price },
    });
  }

  /**
   * The price in effect on `date` for each product: the latest row on or before it.
   * A date before a product's first row (an order backdated past its creation) uses the first row.
   */
  async on(businessId: string, productIds: string[], date: string, db: Tx = this.prisma): Promise<Map<string, PricePoint>> {
    if (productIds.length === 0) return new Map();
    const day = toDbDate(date);
    const rows = await db.$queryRaw<Array<PricePoint & { productId: string }>>`
      SELECT DISTINCT ON ("productId") "productId", "sellingPrice", "costPrice"
      FROM product_prices
      WHERE "businessId" = ${businessId}::uuid AND "productId" = ANY(${productIds}::uuid[])
      ORDER BY "productId",
               ("effectiveFrom" <= ${day}::date) DESC,
               CASE WHEN "effectiveFrom" <= ${day}::date THEN "effectiveFrom" END DESC NULLS LAST,
               "effectiveFrom" ASC`;
    return new Map(rows.map((r) => [r.productId, { sellingPrice: r.sellingPrice, costPrice: r.costPrice }]));
  }

  /** First price rows of new products, in one INSERT. */
  async recordMany(
    businessId: string,
    rows: Array<PricePoint & { productId: string; effectiveFrom: string }>,
    createdById: string | null,
    db: Tx,
  ): Promise<void> {
    if (rows.length === 0) return;
    await db.productPrice.createMany({
      data: rows.map((r) => ({ ...r, businessId, createdById, effectiveFrom: toDbDate(r.effectiveFrom) })),
    });
  }

  /** Every cost row of these products, oldest first, in one query (for pricing lines on many dates). */
  async costHistory(
    businessId: string,
    productIds: string[],
    db: Tx,
  ): Promise<Map<string, Array<{ effectiveFrom: string; costPrice: number }>>> {
    const history = new Map<string, Array<{ effectiveFrom: string; costPrice: number }>>();
    if (productIds.length === 0) return history;
    const rows = await db.productPrice.findMany({
      where: { businessId, productId: { in: productIds } },
      orderBy: [{ productId: 'asc' }, { effectiveFrom: 'asc' }],
      select: { productId: true, effectiveFrom: true, costPrice: true },
    });
    for (const r of rows) {
      const list = history.get(r.productId) ?? [];
      list.push({ effectiveFrom: fromDbDate(r.effectiveFrom), costPrice: r.costPrice });
      history.set(r.productId, list);
    }
    return history;
  }

  /** Newest first. */
  async history(businessId: string, productId: string): Promise<PriceHistoryRow[]> {
    const rows = await this.prisma.productPrice.findMany({
      where: { businessId, productId },
      orderBy: { effectiveFrom: Prisma.SortOrder.desc },
      select: { sellingPrice: true, costPrice: true, effectiveFrom: true, updatedAt: true },
    });
    return rows.map((r) => ({
      sellingPrice: r.sellingPrice,
      costPrice: r.costPrice,
      effectiveFrom: fromDbDate(r.effectiveFrom),
      changedAt: r.updatedAt,
    }));
  }
}
