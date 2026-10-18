/**
 * The one definition of an order's money (FR-ORD-05, SRS 6.4). The API stores these
 * numbers; the order form shows the same calculation live, so the estimate the seller
 * sees is exactly what gets saved.
 */
export interface TotalsLine {
  quantity: number;
  unitPrice: number;
  unitCost: number;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  deliveryCharge: number;
  total: number;
  productCost: number;
  /** Profit if the order is delivered: total − product cost − courier − packaging. */
  estimatedProfit: number;
  discountExceedsSubtotal: boolean;
}

export function orderTotals(
  lines: readonly TotalsLine[],
  amounts: { discount: number; deliveryCharge: number; courierCost?: number; packagingCost?: number },
): OrderTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const productCost = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  const total = subtotal - amounts.discount + amounts.deliveryCharge;
  return {
    subtotal,
    discount: amounts.discount,
    deliveryCharge: amounts.deliveryCharge,
    total,
    productCost,
    estimatedProfit: total - productCost - (amounts.courierCost ?? 0) - (amounts.packagingCost ?? 0),
    discountExceedsSubtotal: amounts.discount > subtotal,
  };
}
