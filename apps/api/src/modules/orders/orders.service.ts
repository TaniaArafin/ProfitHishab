import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canTransition,
  holdsStock,
  orderTotals,
  todayIn,
  type BulkStatusInput,
  type OrderCreateInput,
  type OrderDetailDto,
  type OrderStatus,
  type OrderUpdateInput,
} from '@ph/shared';
import { createHash } from 'node:crypto';
import type { AuthContext } from '../../common/auth';
import { fromDbDate, toDbDate } from '../../common/dates';
import { RequestError } from '../../common/errors';
import type { Tx } from '../../common/prisma.service';
import { BusinessService } from '../business/business.service';
import { CustomersService } from '../customers/customers.service';
import { ProductsService } from '../products/products.service';
import { ProductError } from '../products/products.errors';
import { OrderError } from './orders.errors';
import { toOrderDetail } from './orders.presenter';
import { OrdersRepository, type NewOrderItem, type OrderWithItems } from './orders.repository';

type ItemInput = OrderCreateInput['items'][number];

/**
 * Order use cases. Talks to other modules only through their public services
 * (laravel-patterns: domain-no-cross-domain-models).
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly business: BusinessService,
    private readonly products: ProductsService,
    private readonly customers: CustomersService,
  ) {}

  async show(businessId: string, orderId: string): Promise<OrderDetailDto> {
    const row = await this.repo.findDetail(businessId, orderId);
    if (!row) throw OrderError.notFound();
    return toOrderDetail(row);
  }

  /**
   * FR-ORD-01..05: snapshot prices and costs, prefill costs and reserve stock in one transaction.
   * The same Idempotency-Key replays the first order instead of creating a second
   * (laravel-rest-api: controller-idempotency-key-on-unsafe-writes).
   */
  async create(auth: AuthContext, input: OrderCreateInput, idempotencyKey: string): Promise<OrderDetailDto> {
    const bodyHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const replay = await this.replay(auth.businessId, idempotencyKey, bodyHash);
    if (replay) return replay;

    let orderId: string;
    try {
      orderId = await this.repo.transaction((tx) => this.insert(auth, input, { key: idempotencyKey, hash: bodyHash }, tx));
    } catch (error) {
      // Two concurrent requests with the same key: the loser replays the winner's order.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.replay(auth.businessId, idempotencyKey, bodyHash);
        if (raced) return raced;
      }
      throw error;
    }
    return this.show(auth.businessId, orderId);
  }

  /** FR-ORD-11: edit any field in any status. Re-added products keep their original price and cost snapshot. */
  async update(auth: AuthContext, orderId: string, input: OrderUpdateInput): Promise<OrderDetailDto> {
    const { businessId } = auth;
    await this.repo.transaction(async (tx) => {
      const order = await this.lockOne(businessId, orderId, tx);
      const keepsStock = holdsStock(order.status as OrderStatus);

      let items: NewOrderItem[] = order.items;
      if (input.items) {
        if (keepsStock) await this.products.moveStock(order.items, +1, tx);
        items = await this.buildItems(businessId, input.items, input.orderDate ?? fromDbDate(order.orderDate), tx, order);
        await this.repo.replaceItems(businessId, orderId, items, tx);
        if (keepsStock) await this.products.moveStock(items, -1, tx);
      }

      if (input.courierId) await this.business.assertCourierBelongs(businessId, input.courierId, tx);
      const totals = this.totals(items, input.discount ?? order.discount, input.deliveryCharge ?? order.deliveryCharge);
      const { items: _items, orderDate, ...fields } = input;
      await this.repo.update(orderId, { ...fields, ...totals, ...(orderDate ? { orderDate: toDbDate(orderDate) } : {}) }, tx);
    });
    return this.show(businessId, orderId);
  }

  async changeStatus(auth: AuthContext, orderId: string, status: OrderStatus): Promise<OrderDetailDto> {
    await this.repo.transaction(async (tx) => {
      const order = await this.lockOne(auth.businessId, orderId, tx);
      const refusal = this.transitionRefusal(order.status as OrderStatus, status);
      if (refusal) throw refusal;
      await this.applyStatus(auth, [order], status, tx);
    });
    return this.show(auth.businessId, orderId);
  }

  /** FR-ORD-09: orders that cannot make the move are skipped and reported; the rest move together. */
  async bulkStatus(auth: AuthContext, input: BulkStatusInput) {
    return this.repo.transaction(async (tx) => {
      const ids = await this.repo.lockForUpdate(auth.businessId, [...new Set(input.orderIds)], tx);
      const orders = await this.repo.findManyWithItems(auth.businessId, ids, tx);
      const movable: OrderWithItems[] = [];
      const skipped: Array<{ orderNo: number; reason: string }> = [];
      for (const order of orders) {
        if (order.status === input.status) continue;
        const refusal = this.transitionRefusal(order.status as OrderStatus, input.status);
        if (refusal) skipped.push({ orderNo: order.orderNo, reason: refusal.message });
        else movable.push(order);
      }
      await this.applyStatus(auth, movable, input.status, tx);
      return { updated: movable.length, skipped };
    });
  }

  private async replay(businessId: string, key: string, bodyHash: string): Promise<OrderDetailDto | null> {
    const existing = await this.repo.findByIdempotencyKey(businessId, key);
    if (!existing) return null;
    if (existing.idempotencyHash !== bodyHash) throw RequestError.idempotencyKeyReused();
    return this.show(businessId, existing.id);
  }

  private async insert(auth: AuthContext, input: OrderCreateInput, idempotency: { key: string; hash: string }, tx: Tx): Promise<string> {
    const { businessId } = auth;
    const defaults = await this.business.orderDefaults(businessId, input.courierId, tx);
    const customer = await this.customers.findOrCreateForOrder(businessId, input.customer, tx);
    const orderDate = input.orderDate ?? todayIn(defaults.timezone);
    const items = await this.buildItems(businessId, input.items, orderDate, tx);
    const status = input.status;

    const order = await this.repo.create(
      businessId,
      {
        orderNo: await this.business.reserveOrderNo(businessId, tx),
        customerId: customer.id,
        courierId: defaults.courier?.id ?? null,
        status,
        paymentMethod: input.paymentMethod,
        orderDate: toDbDate(orderDate),
        deliveryAddress: input.deliveryAddress ?? customer.address,
        ...this.totals(items, input.discount, input.deliveryCharge),
        courierCost: input.courierCost ?? defaults.courierCost,
        packagingCost: input.packagingCost ?? defaults.packagingCost,
        returnCost: input.returnCost ?? defaults.returnCost,
        note: input.note,
        source: 'manual',
        deliveredAt: status === 'delivered' ? new Date() : null,
        createdById: auth.userId,
        idempotencyKey: idempotency.key,
        idempotencyHash: idempotency.hash,
      },
      items,
      tx,
    );

    if (holdsStock(status)) await this.products.moveStock(items, -1, tx);
    await this.repo.addHistory([{ orderId: order.id, businessId, fromStatus: null, toStatus: status, changedById: auth.userId }], tx);
    return order.id;
  }

  private async lockOne(businessId: string, orderId: string, tx: Tx): Promise<OrderWithItems> {
    const [id] = await this.repo.lockForUpdate(businessId, [orderId], tx);
    const [order] = id ? await this.repo.findManyWithItems(businessId, [id], tx) : [];
    if (!order) throw OrderError.notFound();
    return order;
  }

  /** Moves locked orders to `to`, adjusting stock once for all of them and writing history. */
  private async applyStatus(auth: AuthContext, orders: OrderWithItems[], to: OrderStatus, tx: Tx): Promise<void> {
    if (orders.length === 0) return;
    const now = new Date();
    const restock = orders.filter((o) => holdsStock(o.status as OrderStatus) && !holdsStock(to)).flatMap((o) => o.items);
    const unstock = orders.filter((o) => !holdsStock(o.status as OrderStatus) && holdsStock(to)).flatMap((o) => o.items);
    await this.products.moveStock(restock, +1, tx);
    await this.products.moveStock(unstock, -1, tx);

    for (const order of orders) {
      await this.repo.update(
        order.id,
        {
          status: to,
          deliveredAt: to === 'delivered' ? now : to === 'returned' ? order.deliveredAt : null,
          returnedAt: to === 'returned' ? now : null,
        },
        tx,
      );
    }
    await this.repo.addHistory(
      orders.map((o) => ({ orderId: o.id, businessId: auth.businessId, fromStatus: o.status, toStatus: to, changedById: auth.userId })),
      tx,
    );
  }

  private transitionRefusal(from: OrderStatus, to: OrderStatus): OrderError | null {
    if (from === to) return OrderError.alreadyInStatus(to);
    if (canTransition(from, to)) return null;
    return to === 'cancelled' ? OrderError.cannotCancel(from) : OrderError.cannotReturn(from);
  }

  /** New lines take the price and cost in effect on the order date; lines already on the order keep theirs. */
  private async buildItems(
    businessId: string,
    input: ItemInput[],
    orderDate: string,
    tx: Tx,
    existing?: OrderWithItems,
  ): Promise<NewOrderItem[]> {
    const products = await this.products.productsForOrder(businessId, [...new Set(input.map((i) => i.productId))], orderDate, tx);
    const previous = new Map(existing?.items.map((i) => [i.productId, i]) ?? []);

    return input.map((item) => {
      const product = products.get(item.productId);
      if (!product) throw ProductError.notFound();
      const before = previous.get(item.productId);
      if (product.archived && !before) throw ProductError.archived(product.name);
      const unitPrice = item.unitPrice ?? before?.unitPrice ?? product.sellingPrice;
      return {
        productId: product.id,
        productName: before?.productName ?? product.name,
        sku: before?.sku ?? product.sku,
        quantity: item.quantity,
        unitPrice,
        unitCost: before?.unitCost ?? product.costPrice,
        lineTotal: unitPrice * item.quantity,
      };
    });
  }

  /** The stored totals, from the same shared formula the order form shows live. */
  private totals(items: NewOrderItem[], discount: number, deliveryCharge: number) {
    const t = orderTotals(items, { discount, deliveryCharge });
    if (t.discountExceedsSubtotal) throw OrderError.discountExceedsSubtotal();
    return { subtotal: t.subtotal, discount: t.discount, deliveryCharge: t.deliveryCharge, total: t.total, productCost: t.productCost };
  }
}
