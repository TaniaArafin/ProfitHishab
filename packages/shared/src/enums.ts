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

/** What a platform admin did to a business (admin_actions.action CHECK constraint). */
export const ADMIN_ACTIONS = ['set_access', 'block', 'unblock', 'reset_link', 'confirm_payment', 'reject_payment'] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/** A business's access, derived from trialEndsAt and blockedAt (never stored). */
export const ACCESS_STATUSES = ['trial', 'ended', 'unlimited', 'blocked'] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const ACCESS_STATUS_LABELS: Record<AccessStatus, string> = {
  trial: 'On trial',
  ended: 'Trial ended',
  unlimited: 'Unlimited',
  blocked: 'Blocked',
};

/** How a seller pays for ProfitHishab: a manual bKash or Nagad transfer to our number, checked by an admin. */
export const BILLING_METHODS = ['bkash', 'nagad'] as const;
export type BillingMethod = (typeof BILLING_METHODS)[number];

export const BILLING_METHOD_LABELS: Record<BillingMethod, string> = { bkash: 'bKash', nagad: 'Nagad' };

/** What a payment may buy, in months (payments.months CHECK constraint). One month = BILLING_PERIOD_DAYS days. */
export const BILLING_MONTH_OPTIONS = [1, 3, 6, 12] as const;
export const BILLING_PERIOD_DAYS = 30;

/** payments.status CHECK constraint. */
export const BILLING_PAYMENT_STATUSES = ['pending', 'confirmed', 'rejected'] as const;
export type BillingPaymentStatus = (typeof BILLING_PAYMENT_STATUSES)[number];

export const BILLING_PAYMENT_STATUS_LABELS: Record<BillingPaymentStatus, string> = {
  pending: 'Waiting for check',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
};

export const IMPORT_STATUSES = ['uploaded', 'mapped', 'validated', 'imported', 'undone', 'failed'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_ROW_STATUSES = ['pending', 'valid', 'duplicate', 'invalid'] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

/** Fields of an order that a spreadsheet column can fill. */
export const IMPORT_TARGETS = [
  'phone',
  'product',
  'quantity',
  'sellingPrice',
  'customerName',
  'address',
  'orderDate',
  'externalRef',
  'sku',
  'productCost',
  'discount',
  'deliveryCharge',
  'courier',
  'courierCost',
  'paymentMethod',
  'status',
] as const;
export type ImportTarget = (typeof IMPORT_TARGETS)[number];

export const REQUIRED_IMPORT_TARGETS = ['phone', 'product', 'quantity', 'sellingPrice'] as const;

export const IMPORT_TARGET_LABELS: Record<ImportTarget, string> = {
  phone: 'Phone',
  product: 'Product',
  quantity: 'Quantity',
  sellingPrice: 'Selling price',
  customerName: 'Customer name',
  address: 'Address',
  orderDate: 'Order date',
  externalRef: 'Order ID',
  sku: 'SKU',
  productCost: 'Product cost',
  discount: 'Discount',
  deliveryCharge: 'Delivery charge',
  courier: 'Courier',
  courierCost: 'Courier cost',
  paymentMethod: 'Payment method',
  status: 'Status',
};

export const IMPORT_ROW_REASONS = [
  'phone_invalid',
  'product_missing',
  'quantity_invalid',
  'price_invalid',
  'date_invalid',
  'order_conflict',
  'order_row_invalid',
  'duplicate_ref',
  'duplicate_row',
  'duplicate_in_file',
] as const;
export type ImportRowReason = (typeof IMPORT_ROW_REASONS)[number];

/** Short plain-English text for each reason, for the preview and the rejected-rows CSV. */
export const IMPORT_ROW_REASON_LABELS: Record<ImportRowReason, string> = {
  phone_invalid: 'Phone number is not valid',
  product_missing: 'Product is missing',
  quantity_invalid: 'Quantity must be a whole number of 1 or more',
  price_invalid: 'An amount is not a valid number',
  date_invalid: 'Order date is not a valid date',
  order_conflict: 'Rows with this order ID have different phone, date or status',
  order_row_invalid: 'Another row of this order is not valid',
  duplicate_ref: 'An order with this order ID already exists',
  duplicate_row: 'This order was already imported',
  duplicate_in_file: 'Same as an earlier row in this file',
};

export const IMPORT_ROW_WARNINGS = ['date_missing', 'cost_missing', 'discount_clamped'] as const;
