import { ORDER_STATUS_LABELS, type OrderStatus } from '@ph/shared';
import { AppError } from '../../common/errors';

const label = (s: OrderStatus) => ORDER_STATUS_LABELS[s].toLowerCase();

export class OrderError extends AppError {
  static notFound(): OrderError {
    return new OrderError(404, 'order_not_found', 'Order not found.');
  }

  static discountExceedsSubtotal(): OrderError {
    const message = "Discount can't be more than the subtotal.";
    return new OrderError(422, 'discount_exceeds_subtotal', message, { discount: [message] });
  }

  static alreadyInStatus(status: OrderStatus): OrderError {
    const message = `The order is already ${label(status)}.`;
    return new OrderError(422, 'status_unchanged', message, { status: [message] });
  }

  /** FR-ORD-07: delivered and returned orders are returned, never cancelled. */
  static cannotCancel(from: OrderStatus): OrderError {
    const message = `A ${label(from)} order can't be cancelled. Mark it returned instead.`;
    return new OrderError(422, 'cannot_cancel', message, { status: [message] });
  }

  /** FR-ORD-07: only an order that left with the courier can come back. */
  static cannotReturn(from: OrderStatus): OrderError {
    const message = `A ${label(from)} order can't be marked returned. Only shipped or delivered orders can.`;
    return new OrderError(422, 'cannot_return', message, { status: [message] });
  }
}
