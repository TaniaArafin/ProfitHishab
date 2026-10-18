import { allowedTransitions, type OrderDetailDto, type OrderListItemDto, type OrderStatus, type PaymentMethod } from '@ph/shared';
import { fromDbDate } from '../../common/dates';
import type { OrderDetailRow, OrderListRow } from './orders.repository';

/** SRS 6.4. Pending orders show what they will earn if delivered; cancelled orders earn nothing. */
export function orderProfit(o: {
  status: string;
  total: number;
  productCost: number;
  courierCost: number;
  packagingCost: number;
  returnCost: number;
}): number {
  if (o.status === 'cancelled') return 0;
  if (o.status === 'returned') return -(o.courierCost + o.packagingCost + o.returnCost);
  return o.total - o.productCost - o.courierCost - o.packagingCost;
}

export function toOrderListItem(o: OrderListRow): OrderListItemDto {
  return {
    id: o.id,
    orderNo: o.orderNo,
    status: o.status as OrderStatus,
    orderDate: fromDbDate(o.orderDate),
    total: o.total,
    paymentMethod: o.paymentMethod as PaymentMethod,
    customer: o.customer,
    courier: o.courier,
    itemCount: o._count.items,
  };
}

export function toOrderDetail(o: OrderDetailRow): OrderDetailDto {
  return {
    ...toOrderListItem(o),
    deliveryAddress: o.deliveryAddress,
    subtotal: o.subtotal,
    discount: o.discount,
    deliveryCharge: o.deliveryCharge,
    productCost: o.productCost,
    courierCost: o.courierCost,
    packagingCost: o.packagingCost,
    returnCost: o.returnCost,
    note: o.note,
    source: o.source as 'manual' | 'import',
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    returnedAt: o.returnedAt?.toISOString() ?? null,
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      unitCost: i.unitCost,
      lineTotal: i.lineTotal,
    })),
    profit: orderProfit(o),
    allowedStatuses: allowedTransitions(o.status as OrderStatus),
    history: o.history.map((h) => ({
      fromStatus: h.fromStatus as OrderStatus | null,
      toStatus: h.toStatus as OrderStatus,
      changedAt: h.changedAt.toISOString(),
    })),
  };
}
