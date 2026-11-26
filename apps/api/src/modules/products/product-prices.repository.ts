import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fromDbDate, toDbDate } from '../../common/dates';
import { PrismaService, type Tx } from '../../common/prisma.service';

export interface PricePoint {
  sellingPrice: number;
  costPrice: number;
}

export interface PriceHistoryRow extends PricePoint {
  variantId: string;
  optionValues: Record<string, string>;
  effectiveFrom: string;
  changedAt: Date;
}

/** All queries on product_prices, the per-day price history of each variant. */
@Injectable()
export class ProductPricesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Records the price from `effectiveFrom` on; a second change on the same day replaces that day's row. */
  async record(
    businessId: string,
    productId: string,
    variantId: string,
    price: PricePoint,
    effectiveFrom: string,
    createdById: string | null,
    db: Tx = this.prisma,
  ): Promise<void> {
    const day = toDbDate(effectiveFrom);
    await db.productPrice.upsert({
      where: { variantId_effectiveFrom: { variantId, effectiveFrom: day } },
      create: { businessId, productId, variantId, effectiveFrom: day, createdById, ...price },
      update: { createdById, ...price },
    });
  }

  /**
   * The price in effect on `date` for each variant: the latest row on or before it.
   * A date before a variant's first row (an order backdated past its creation) uses the first row.
   */
  async on(businessId: string, variantIds: string[], date: string, db: Tx = this.prisma): Promise<Map<string, PricePoint>> {
    if (variantIds.length === 0) return new Map();
    const day = toDbDate(date);
    const rows = await db.$queryRaw<Array<PricePoint & { variantId: string }>>`
      SELECT DISTINCT ON ("variantId") "variantId", "sellingPrice", "costPrice"
      FROM product_prices
      WHERE "businessId" = ${businessId}::uuid AND "variantId" = ANY(${variantIds}::uuid[])
      ORDER BY "variantId",
               ("effectiveFrom" <= ${day}::date) DESC,
               CASE WHEN "effectiveFrom" <= ${day}::date THEN "effectiveFrom" END DESC NULLS LAST,
               "effectiveFrom" ASC`;
    return new Map(rows.map((r) => [r.variantId, { sellingPrice: r.sellingPrice, costPrice: r.costPrice }]));
  }

  /** First price rows of new variants, in one INSERT. */
  async recordMany(
    businessId: string,
    rows: Array<PricePoint & { productId: string; variantId: string; effectiveFrom: string }>,
    createdById: string | null,
    db: Tx,
  ): Promise<void> {
    if (rows.length === 0) return;
    await db.productPrice.createMany({
      data: rows.map((r) => ({ ...r, businessId, createdById, effectiveFrom: toDbDate(r.effectiveFrom) })),
    });
  }

  /** Every cost row of these variants, oldest first, in one query (for pricing lines on many dates). */
  async costHistory(
    businessId: string,
    variantIds: string[],
    db: Tx,
  ): Promise<Map<string, Array<{ effectiveFrom: string; costPrice: number }>>> {
    const history = new Map<string, Array<{ effectiveFrom: string; costPrice: number }>>();
    if (variantIds.length === 0) return history;
    const rows = await db.productPrice.findMany({
      where: { businessId, variantId: { in: variantIds } },
      orderBy: [{ variantId: 'asc' }, { effectiveFrom: 'asc' }],
      select: { variantId: true, effectiveFrom: true, costPrice: true },
    });
    for (const r of rows) {
      const list = history.get(r.variantId) ?? [];
      list.push({ effectiveFrom: fromDbDate(r.effectiveFrom), costPrice: r.costPrice });
      history.set(r.variantId, list);
    }
    return history;
  }

  /** Newest first, every variant of the product, each row with its variant's option values. */
  async history(businessId: string, productId: string): Promise<PriceHistoryRow[]> {
    const rows = await this.prisma.productPrice.findMany({
      where: { businessId, productId },
      orderBy: [{ effectiveFrom: Prisma.SortOrder.desc }, { variant: { position: Prisma.SortOrder.asc } }],
      select: {
        variantId: true,
        sellingPrice: true,
        costPrice: true,
        effectiveFrom: true,
        updatedAt: true,
        variant: { select: { optionValues: true } },
      },
    });
    return rows.map((r) => ({
      variantId: r.variantId,
      optionValues: (r.variant.optionValues ?? {}) as Record<string, string>,
      sellingPrice: r.sellingPrice,
      costPrice: r.costPrice,
      effectiveFrom: fromDbDate(r.effectiveFrom),
      changedAt: r.updatedAt,
    }));
  }
}
