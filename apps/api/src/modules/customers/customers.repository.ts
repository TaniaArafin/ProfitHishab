import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../../common/prisma.service';

export interface CustomerStatsRow {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  city: string | null;
  note: string | null;
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  totalSpent: number;
  lastOrderDate: Date | null;
  profitGenerated: number;
}

const SORTS: Record<string, string> = {
  name: 'c.name',
  orders: '"totalOrders"',
  delivered: '"deliveredOrders"',
  returned: '"returnedOrders"',
  spent: '"totalSpent"',
  last: '"lastOrderDate"',
};

/** Stats come from orders on every read (FR-CUST-05); nothing is stored on the customer row. */
const STATS_SELECT = Prisma.sql`
  c.id, c.name, c.phone, c.address, c.city, c.note,
  count(o.id) FILTER (WHERE o.status <> 'cancelled')::int AS "totalOrders",
  count(o.id) FILTER (WHERE o.status = 'delivered')::int AS "deliveredOrders",
  count(o.id) FILTER (WHERE o.status = 'returned')::int AS "returnedOrders",
  coalesce(sum(o.total) FILTER (WHERE o.status = 'delivered'), 0)::float8 AS "totalSpent",
  max(o."orderDate") FILTER (WHERE o.status <> 'cancelled') AS "lastOrderDate",
  (coalesce(sum(o.total - o."productCost" - o."courierCost" - o."packagingCost") FILTER (WHERE o.status = 'delivered'), 0)
   - coalesce(sum(o."courierCost" + o."packagingCost" + o."returnCost") FILTER (WHERE o.status = 'returned'), 0))::float8 AS "profitGenerated"`;

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async paginate(businessId: string, f: { q?: string; sort?: string; page: number; perPage: number }) {
    const where: Prisma.Sql[] = [Prisma.sql`c."businessId" = ${businessId}::uuid`];
    if (f.q) where.push(Prisma.sql`(c.name ILIKE ${`%${f.q}%`} OR c.phone LIKE ${`%${f.q.replace(/\D/g, '') || f.q}%`})`);
    const whereSql = Prisma.join(where, ' AND ');

    const desc = f.sort ? f.sort.startsWith('-') : true;
    const column = SORTS[f.sort?.replace(/^-/, '') ?? ''] ?? SORTS.last;
    const orderSql = Prisma.raw(`${column} ${desc ? 'DESC NULLS LAST' : 'ASC NULLS LAST'}, c.id ASC`);

    const [rows, count] = await Promise.all([
      this.prisma.$queryRaw<CustomerStatsRow[]>`
        SELECT ${STATS_SELECT}
        FROM customers c LEFT JOIN orders o ON o."customerId" = c.id
        WHERE ${whereSql}
        GROUP BY c.id
        ORDER BY ${orderSql}
        LIMIT ${f.perPage} OFFSET ${(f.page - 1) * f.perPage}`,
      this.prisma.$queryRaw<[{ total: number }]>`SELECT count(*)::int AS total FROM customers c WHERE ${whereSql}`,
    ]);
    return { rows, total: count[0].total };
  }

  async findWithStats(businessId: string, where: { id?: string; phone?: string }): Promise<CustomerStatsRow | null> {
    const filter = where.id ? Prisma.sql`c.id = ${where.id}::uuid` : Prisma.sql`c.phone = ${where.phone ?? ''}`;
    const rows = await this.prisma.$queryRaw<CustomerStatsRow[]>`
      SELECT ${STATS_SELECT}
      FROM customers c LEFT JOIN orders o ON o."customerId" = c.id
      WHERE c."businessId" = ${businessId}::uuid AND ${filter}
      GROUP BY c.id`;
    return rows[0] ?? null;
  }

  find(businessId: string, customerId: string) {
    return this.prisma.customer.findFirst({ where: { id: customerId, businessId } });
  }

  findByPhone(businessId: string, phone: string, db: Tx = this.prisma) {
    return db.customer.findUnique({ where: { businessId_phone: { businessId, phone } } });
  }

  create(businessId: string, data: Omit<Prisma.CustomerUncheckedCreateInput, 'businessId'>, db: Tx = this.prisma) {
    return db.customer.create({ data: { ...data, businessId } });
  }

  update(customerId: string, data: Prisma.CustomerUpdateInput, db: Tx = this.prisma) {
    return db.customer.update({ where: { id: customerId }, data });
  }

  /** The business's customers with these phones, in one query. */
  findByPhones(businessId: string, phones: string[], db: Tx): Promise<Array<{ id: string; phone: string; address: string | null }>> {
    if (phones.length === 0) return Promise.resolve([]);
    return db.customer.findMany({ where: { businessId, phone: { in: phones } }, select: { id: true, phone: true, address: true } });
  }

  /** One INSERT for many customers; a phone that exists by now is skipped. Returns how many were inserted. */
  async createMany(
    businessId: string,
    rows: Array<{ phone: string; name: string; address: string | null }>,
    importId: string | null,
    db: Tx,
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const { count } = await db.customer.createMany({ data: rows.map((r) => ({ ...r, businessId, importId })), skipDuplicates: true });
    return count;
  }

  /** Deletes the customers this import created that no order uses, in one statement. */
  deleteUnusedFromImport(businessId: string, importId: string, db: Tx): Promise<number> {
    return db.$executeRaw`
      DELETE FROM customers c
      WHERE c."businessId" = ${businessId}::uuid AND c."importId" = ${importId}::uuid
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o."customerId" = c.id)`;
  }

  /** Sets each customer's address where it is still empty, in one UPDATE. */
  async fillMissingAddresses(businessId: string, rows: Array<{ id: string; address: string }>, db: Tx): Promise<void> {
    if (rows.length === 0) return;
    await db.$executeRaw`
      UPDATE customers c SET address = v.address, "updatedAt" = now()
      FROM (SELECT unnest(${rows.map((r) => r.id)}::uuid[]) AS id, unnest(${rows.map((r) => r.address)}::text[]) AS address) v
      WHERE c.id = v.id AND c."businessId" = ${businessId}::uuid AND (c.address IS NULL OR c.address = '')`;
  }
}
