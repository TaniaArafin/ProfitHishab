import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { OrderListQuery } from '@ph/shared';
import { toDbDate } from '../../common/dates';
import { PrismaService, type Tx } from '../../common/prisma.service';

const LIST_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  courier: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  items: { orderBy: { id: 'asc' } },
  history: { orderBy: { changedAt: 'asc' } },
} satisfies Prisma.OrderInclude;

export type OrderListRow = Prisma.OrderGetPayload<{ include: typeof LIST_INCLUDE }>;
export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof DETAIL_INCLUDE }>;
export type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

export interface NewOrderItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
}

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private listWhere(businessId: string, q: Omit<OrderListQuery, 'page' | 'perPage'>): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = { businessId };
    if (q.status) where.status = q.status;
    if (q.courierId) where.courierId = q.courierId;
    if (q.paymentMethod) where.paymentMethod = q.paymentMethod;
    if (q.customerId) where.customerId = q.customerId;
    if (q.from || q.to) {
      where.orderDate = { ...(q.from ? { gte: toDbDate(q.from) } : {}), ...(q.to ? { lte: toDbDate(q.to) } : {}) };
    }
    if (q.q) {
      const term = q.q.replace(/^#/, '');
      const or: Prisma.OrderWhereInput[] = [
        { customer: { name: { contains: term, mode: 'insensitive' } } },
        { customer: { phone: { contains: term.replace(/\D/g, '') || term } } },
      ];
      if (/^\d{1,9}$/.test(term)) or.push({ orderNo: Number(term) });
      where.OR = or;
    }
    return where;
  }

  async paginate(businessId: string, query: OrderListQuery): Promise<{ rows: OrderListRow[]; total: number }> {
    const where = this.listWhere(businessId, query);
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ orderDate: 'desc' }, { orderNo: 'desc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { rows, total };
  }

  /** Counts per status for the list tabs, honouring every filter except status. */
  async statusCounts(businessId: string, query: Omit<OrderListQuery, 'page' | 'perPage'>): Promise<Record<string, number>> {
    const groups = await this.prisma.order.groupBy({
      by: ['status'],
      where: this.listWhere(businessId, { ...query, status: undefined }),
      _count: { _all: true },
    });
    return Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
  }

  findDetail(businessId: string, orderId: string): Promise<OrderDetailRow | null> {
    return this.prisma.order.findFirst({ where: { id: orderId, businessId }, include: DETAIL_INCLUDE });
  }

  findByIdempotencyKey(businessId: string, key: string) {
    return this.prisma.order.findUnique({
      where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } },
      select: { id: true, idempotencyHash: true },
    });
  }

  /**
   * Locks the business's orders with these ids until the transaction ends, in id
   * order so two bulk updates cannot deadlock (laravel-eloquent: tx-lock-for-update-on-contention).
   * Returns the ids that exist and belong to the business.
   */
  async lockForUpdate(businessId: string, orderIds: string[], db: Tx): Promise<string[]> {
    if (orderIds.length === 0) return [];
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM orders
      WHERE "businessId" = ${businessId}::uuid AND id = ANY(${orderIds}::uuid[])
      ORDER BY id
      FOR UPDATE`;
    return rows.map((r) => r.id);
  }

  findManyWithItems(businessId: string, orderIds: string[], db: Tx): Promise<OrderWithItems[]> {
    return db.order.findMany({ where: { businessId, id: { in: orderIds } }, include: { items: true }, orderBy: { orderNo: 'asc' } });
  }

  create(businessId: string, data: Omit<Prisma.OrderUncheckedCreateInput, 'businessId' | 'items'>, items: NewOrderItem[], db: Tx) {
    return db.order.create({
      data: { ...data, businessId, items: { create: items.map((i) => ({ ...i, businessId })) } },
      select: { id: true },
    });
  }

  update(orderId: string, data: Prisma.OrderUncheckedUpdateInput, db: Tx) {
    return db.order.update({ where: { id: orderId }, data, select: { id: true } });
  }

  async replaceItems(businessId: string, orderId: string, items: NewOrderItem[], db: Tx): Promise<void> {
    await db.orderItem.deleteMany({ where: { orderId } });
    await db.orderItem.createMany({ data: items.map((i) => ({ ...i, orderId, businessId })) });
  }

  addHistory(
    rows: Array<{ orderId: string; businessId: string; fromStatus: string | null; toStatus: string; changedById: string }>,
    db: Tx,
  ) {
    return db.orderStatusHistory.createMany({ data: rows });
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
