import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fromDbDate, toDbDate } from '../../common/dates';
import { PrismaService, type Tx } from '../../common/prisma.service';

export interface BatchRow {
  id: string;
  productId: string;
  variantId: string;
  batchNo: string | null;
  expiresOn: string;
  receivedOn: string;
  quantity: number;
  unitCost: number;
  optionValues: Record<string, string>;
}

type RawBatch = Omit<BatchRow, 'expiresOn' | 'receivedOn'> & { expiresOn: Date; receivedOn: Date };
const toRow = (r: RawBatch): BatchRow => ({ ...r, expiresOn: fromDbDate(r.expiresOn), receivedOn: fromDbDate(r.receivedOn) });

/** All queries on stock_batches and stock_writeoffs (Stage 2: batches and expiry). */
@Injectable()
export class BatchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    businessId: string,
    data: {
      productId: string;
      variantId: string;
      batchNo: string | null;
      expiresOn: string;
      quantity: number;
      unitCost: number;
      receivedOn: string;
    },
    db: Tx,
  ): Promise<string> {
    const row = await db.stockBatch.create({
      data: { ...data, businessId, expiresOn: toDbDate(data.expiresOn), receivedOn: toDbDate(data.receivedOn) },
      select: { id: true },
    });
    return row.id;
  }

  /** Batches of a product with stock left, earliest expiry first; `ids` narrows to some batches. */
  async forProduct(businessId: string, productId: string, ids?: string[]): Promise<BatchRow[]> {
    const rows = await this.prisma.$queryRaw<RawBatch[]>`
      SELECT b.id, b."productId", b."variantId", b."batchNo", b."expiresOn", b."receivedOn", b.quantity, b."unitCost", v."optionValues"
      FROM stock_batches b JOIN product_variants v ON v.id = b."variantId"
      WHERE b."businessId" = ${businessId}::uuid AND b."productId" = ${productId}::uuid
        AND ${ids ? Prisma.sql`b.id = ANY(${ids}::uuid[])` : Prisma.sql`b.quantity > 0`}
      ORDER BY b."expiresOn", v.position, b.id`;
    return rows.map(toRow);
  }

  /** Expired stock and its cost per variant of these products (batches past `today` with stock left). */
  async expiredByVariant(
    businessId: string,
    productIds: string[],
    today: string,
  ): Promise<Map<string, { quantity: number; cost: number }>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ variantId: string; quantity: number; cost: number }>>`
      SELECT "variantId", round(sum(quantity)::numeric, 3)::float8 AS quantity, round(sum(quantity * "unitCost"))::float8 AS cost
      FROM stock_batches
      WHERE "businessId" = ${businessId}::uuid AND "productId" = ANY(${productIds}::uuid[])
        AND quantity > 0 AND "expiresOn" < ${today}::date
      GROUP BY "variantId"`;
    return new Map(rows.map((r) => [r.variantId, { quantity: r.quantity, cost: r.cost }]));
  }

  /** The dashboard alert: expired batches (and their products), and batches expiring by `soon`, with cost. */
  async summary(businessId: string, today: string, soon: string) {
    const [row] = await this.prisma.$queryRaw<
      [{ expiredBatches: number; expiredProducts: number; expiredCost: number; soonBatches: number; soonCost: number }]
    >`
      SELECT count(*) FILTER (WHERE "expiresOn" < ${today}::date)::int AS "expiredBatches",
             count(DISTINCT "productId") FILTER (WHERE "expiresOn" < ${today}::date)::int AS "expiredProducts",
             coalesce(round(sum(quantity * "unitCost") FILTER (WHERE "expiresOn" < ${today}::date)), 0)::float8 AS "expiredCost",
             count(*) FILTER (WHERE "expiresOn" >= ${today}::date AND "expiresOn" <= ${soon}::date)::int AS "soonBatches",
             coalesce(round(sum(quantity * "unitCost") FILTER (WHERE "expiresOn" >= ${today}::date AND "expiresOn" <= ${soon}::date)), 0)::float8 AS "soonCost"
      FROM stock_batches
      WHERE "businessId" = ${businessId}::uuid AND quantity > 0`;
    return row;
  }

  /** Expired batches of a product with stock left, locked for the clear (`FOR UPDATE`, id order). */
  async lockExpired(businessId: string, productId: string, today: string, tx: Tx): Promise<BatchRow[]> {
    const rows = await tx.$queryRaw<RawBatch[]>`
      SELECT b.id, b."productId", b."variantId", b."batchNo", b."expiresOn", b."receivedOn", b.quantity, b."unitCost", '{}'::jsonb AS "optionValues"
      FROM stock_batches b
      WHERE b."businessId" = ${businessId}::uuid AND b."productId" = ${productId}::uuid
        AND b.quantity > 0 AND b."expiresOn" < ${today}::date
      ORDER BY b.id
      FOR UPDATE`;
    return rows.map(toRow);
  }

  /** Every batch of these variants, locked (`FOR UPDATE`, id order), for allocating or restoring an order's stock. */
  async lockForVariants(businessId: string, variantIds: string[], tx: Tx): Promise<BatchRow[]> {
    if (variantIds.length === 0) return [];
    const rows = await tx.$queryRaw<RawBatch[]>`
      SELECT b.id, b."productId", b."variantId", b."batchNo", b."expiresOn", b."receivedOn", b.quantity, b."unitCost", '{}'::jsonb AS "optionValues"
      FROM stock_batches b
      WHERE b."businessId" = ${businessId}::uuid AND b."variantId" = ANY(${variantIds}::uuid[])
      ORDER BY b.id
      FOR UPDATE`;
    return rows.map(toRow);
  }

  /** Adds each delta to its batch, in one statement, kept to 3 decimals and never below 0. */
  async adjust(deltas: Map<string, number>, tx: Tx): Promise<void> {
    const entries = [...deltas.entries()].filter(([, d]) => d !== 0);
    if (entries.length === 0) return;
    const ids = entries.map(([id]) => id);
    const amounts = entries.map(([, d]) => d);
    await tx.$executeRaw`
      UPDATE stock_batches b SET quantity = greatest(0, round((b.quantity + v.delta)::numeric, 3)::float8)
      FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${amounts}::float8[]) AS delta) v
      WHERE b.id = v.id`;
  }

  async writeOffs(
    businessId: string,
    rows: Array<{
      productId: string;
      variantId: string;
      batchId: string;
      batchNo: string | null;
      expiresOn: string;
      quantity: number;
      unitCost: number;
      cost: number;
      writtenOffOn: string;
      expenseId: string;
      createdById: string | null;
    }>,
    tx: Tx,
  ): Promise<void> {
    if (rows.length === 0) return;
    await tx.stockWriteOff.createMany({
      data: rows.map((r) => ({ ...r, businessId, expiresOn: toDbDate(r.expiresOn), writtenOffOn: toDbDate(r.writtenOffOn) })),
    });
  }
}
