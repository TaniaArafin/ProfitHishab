import type { OrderStatus } from './enums';

const PROGRESS: readonly OrderStatus[] = ['new', 'confirmed', 'processing', 'shipped', 'delivered'];

/**
 * FR-ORD-07. Forward moves may skip steps and wrong statuses may be corrected by
 * moving back. Only two moves are refused: cancelling an order that was already
 * delivered or returned, and returning an order that never shipped.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  if (to === 'cancelled') return PROGRESS.indexOf(from) >= 0 && from !== 'delivered';
  if (to === 'returned') return from === 'shipped' || from === 'delivered';
  return true;
}

export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  const all: OrderStatus[] = [...PROGRESS, 'cancelled', 'returned'];
  return all.filter((to) => canTransition(from, to));
}

/** Stock is taken out of the shelf for every order except cancelled and returned ones. */
export function holdsStock(status: OrderStatus): boolean {
  return status !== 'cancelled' && status !== 'returned';
}
