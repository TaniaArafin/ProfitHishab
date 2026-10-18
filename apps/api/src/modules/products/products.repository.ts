import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../../common/prisma.service';

/** Composite filter for the product list (laravel-patterns: vo-composite-filter-per-query). */
export interface ProductListFilters {
  q?: string;
  /** Matches from the search index, best first. Replaces the `q` ILIKE and orders by relevance unless `sort` is set. */
  ids?: string[];
  categoryId?: string;
  status?: string;
  costMissing?: boolean;
  sort?: string;
  page: number;
  perPage: number;
}

export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  categoryId: string | null;
  categoryName: string | null;
  sellingPrice: number;
  costPrice: number;
  stock: number;
  status: string;
}

export interface MissingCostRow {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  unitsSold: number;
  orderCount: number;
}

const MARGIN_SQL = `CASE WHEN p."sellingPrice" = 0 THEN 0 ELSE (p."sellingPrice" - p."costPrice")::float8 / p."sellingPrice" END`;

/** Sort allow-list; a leading "-" means descending (laravel-patterns: query-whitelist-sortable-columns). */
const SORTS: Record<string, string> = {
  name: 'p.name',
  sku: 'p.sku',
  price: 'p."sellingPrice"',
  cost: 'p."costPrice"',
  stock: 'p.stock',
  margin: MARGIN_SQL,
  created: 'p."createdAt"',
};

/** The fix-costs screen lists at most this many; nobody fills in more on one screen. */
const MISSING_COST_LIMIT = 500;

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async paginate(businessId: string, f: ProductListFilters): Promise<{ rows: ProductRow[]; total: number }> {
    const where: Prisma.Sql[] = [Prisma.sql`p."businessId" = ${businessId}::uuid`];
    if (f.ids) where.push(Prisma.sql`p.id = ANY(${f.ids}::uuid[])`);
    else if (f.q) where.push(Prisma.sql`(p.name ILIKE ${`%${f.q}%`} OR p.sku ILIKE ${`%${f.q}%`})`);
    if (f.categoryId) where.push(Prisma.sql`p."categoryId" = ${f.categoryId}::uuid`);
    if (f.status) where.push(Prisma.sql`p.status = ${f.status}`);
    if (f.costMissing) where.push(Prisma.sql`p."costPrice" = 0`);
    const whereSql = Prisma.join(where, ' AND ');

    const desc = f.sort?.startsWith('-') ?? false;
    const column = SORTS[f.sort?.replace(/^-/, '') ?? ''] ?? SORTS.name;
    const orderSql =
      f.ids && !f.sort
        ? Prisma.sql`array_position(${f.ids}::uuid[], p.id), p.id ASC`
        : Prisma.raw(`${column} ${desc ? 'DESC' : 'ASC'}, p.id ASC`);

    const [rows, count] = await Promise.all([
      this.prisma.$queryRaw<ProductRow[]>`
        SELECT p.id, p.name, p.sku, p."categoryId", c.name AS "categoryName",
               p."sellingPrice", p."costPrice", p.stock, p.status
        FROM products p
        LEFT JOIN categories c ON c.id = p."categoryId"
        WHERE ${whereSql}
        ORDER BY ${orderSql}
        LIMIT ${f.perPage} OFFSET ${(f.page - 1) * f.perPage}`,
      this.prisma.$queryRaw<[{ total: number }]>`SELECT count(*)::int AS total FROM products p WHERE ${whereSql}`,
    ]);
    return { rows, total: count[0].total };
  }

  /** What the search index stores per product, in id order after `afterId` (for batched reindexing). */
  searchDocs(opts: { ids?: string[]; afterId?: string; limit?: number }) {
    return this.prisma.product.findMany({
      where: { ...(opts.ids ? { id: { in: opts.ids } } : {}), ...(opts.afterId ? { id: { gt: opts.afterId } } : {}) },
      orderBy: { id: 'asc' },
      take: opts.limit,
      select: { id: true, businessId: true, name: true, sku: true, status: true },
    });
  }

  countAll(): Promise<number> {
    return this.prisma.product.count();
  }

  async findRow(businessId: string, productId: string): Promise<ProductRow | null> {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      include: { category: { select: { name: true } } },
    });
    return p ? { ...p, categoryName: p.category?.name ?? null } : null;
  }

  findManyByIds(businessId: string, ids: string[], db: Tx = this.prisma) {
    return db.product.findMany({
      where: { businessId, id: { in: ids } },
      select: { id: true, name: true, sku: true, sellingPrice: true, costPrice: true, status: true },
    });
  }

  async skuExists(businessId: string, sku: string, exceptId?: string): Promise<boolean> {
    const found = await this.prisma.product.findFirst({
      where: { businessId, sku, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    return found !== null;
  }

  /** Next free PRD-0001 style SKU. */
  async nextSku(businessId: string): Promise<string> {
    const [row] = await this.prisma.$queryRaw<[{ max: number | null }]>`
      SELECT max(substring(sku FROM 5)::int) AS max FROM products
      WHERE "businessId" = ${businessId}::uuid AND sku ~ '^PRD-[0-9]+$'`;
    return `PRD-${String((row?.max ?? 0) + 1).padStart(4, '0')}`;
  }

  create(businessId: string, data: Omit<Prisma.ProductUncheckedCreateInput, 'businessId'>, db: Tx = this.prisma) {
    return db.product.create({ data: { ...data, businessId }, select: { id: true } });
  }

  update(productId: string, data: Prisma.ProductUncheckedUpdateInput, db: Tx = this.prisma) {
    return db.product.update({ where: { id: productId }, data, select: { id: true } });
  }

  /**
   * Adds each delta to its product's stock in one statement
   * (laravel-eloquent: bulk-upsert-instead-of-loop). Deltas for the same product are summed first.
   */
  async adjustStock(deltas: Map<string, number>, db: Tx): Promise<void> {
    const entries = [...deltas.entries()].filter(([, delta]) => delta !== 0);
    if (entries.length === 0) return;
    const ids = entries.map(([id]) => id);
    const amounts = entries.map(([, delta]) => delta);
    await db.$executeRaw`
      UPDATE products p SET stock = p.stock + v.delta, "updatedAt" = now()
      FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${amounts}::int[]) AS delta) v
      WHERE p.id = v.id`;
  }

  async countOrdersWithProduct(businessId: string, productId: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<[{ count: number }]>`
      SELECT count(DISTINCT "orderId")::int AS count FROM order_items
      WHERE "businessId" = ${businessId}::uuid AND "productId" = ${productId}::uuid`;
    return row.count;
  }

  missingCost(businessId: string): Promise<MissingCostRow[]> {
    return this.prisma.$queryRaw<MissingCostRow[]>`
      SELECT p.id, p.name, p.sku, p."sellingPrice",
             coalesce(sum(oi.quantity) FILTER (WHERE o.status = 'delivered'), 0)::int AS "unitsSold",
             count(DISTINCT oi."orderId")::int AS "orderCount"
      FROM products p
      LEFT JOIN order_items oi ON oi."productId" = p.id
      LEFT JOIN orders o ON o.id = oi."orderId"
      WHERE p."businessId" = ${businessId}::uuid AND p."costPrice" = 0 AND p.status = 'active'
      GROUP BY p.id
      ORDER BY "unitsSold" DESC, p.name ASC
      LIMIT ${MISSING_COST_LIMIT}`;
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
