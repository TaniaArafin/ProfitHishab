export const ORDER_STATUSES = ['new', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses an order can be created with. */
export const CREATABLE_ORDER_STATUSES = ['new', 'confirmed', 'processing', 'shipped', 'delivered'] as const;

/** Orders in these statuses are neither revenue nor loss yet. */
export const PENDING_ORDER_STATUSES = ['new', 'confirmed', 'processing', 'shipped'] as const;

export const PAYMENT_METHODS = ['cod', 'bkash', 'nagad', 'rocket', 'bank', 'cash', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const EXPENSE_KINDS = ['ads', 'courier', 'other'] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export const PRODUCT_STATUSES = ['active', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'New',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: 'Cash on delivery',
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  bank: 'Bank',
  cash: 'Cash',
  other: 'Other',
};

/** Seeded for every new business (FR-EXP-01). */
export const DEFAULT_EXPENSE_CATEGORIES: ReadonlyArray<{ name: string; kind: ExpenseKind }> = [
  { name: 'Facebook Ads', kind: 'ads' },
  { name: 'Packaging', kind: 'other' },
  { name: 'Salary', kind: 'other' },
  { name: 'Rent', kind: 'other' },
  { name: 'Courier', kind: 'courier' },
  { name: 'Internet', kind: 'other' },
  { name: 'Other', kind: 'other' },
];

/** Seeded for every new business (FR-BIZ-04). */
export const DEFAULT_COURIERS = ['Pathao', 'Steadfast', 'RedX', 'Other'] as const;
