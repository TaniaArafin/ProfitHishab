import { z } from 'zod';
import { CREATABLE_ORDER_STATUSES, EXPENSE_KINDS, ORDER_STATUSES, PAYMENT_METHODS, PRODUCT_STATUSES } from './enums';
import { isIsoDate } from './dates';
import { normalizePhone, toAsciiDigits } from './phone';

/** Integer poisha, never negative. */
const money = z.number({ invalid_type_error: 'Enter an amount' }).int('Amount must be whole poisha').min(0, "Amount can't be negative");
const isoDate = z.string().refine(isIsoDate, 'Use a date like 2026-09-30');
const phone = z.string().transform((value, ctx) => {
  const normalized = normalizePhone(value);
  if (!normalized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a number like 017XXXXXXXX' });
    return z.NEVER;
  }
  return normalized;
});
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    // Omitted stays undefined (untouched on update); an empty string clears the field.
    .transform((v) => (v === undefined ? undefined : v || null));
const uuid = z.string().uuid();

// ── Auth ───────────────────────────────────────────────────────────────

/** Step 1 of registration: text a one-time code to this number. */
export const otpRequestSchema = z.object({ phone });
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

/** The 6-digit SMS code; Bangla digits and spaces are accepted. */
const otpCode = z
  .string({ required_error: 'Enter the 6-digit code' })
  .transform((v) => toAsciiDigits(v).replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS'));

/** Step 2: the phone is verified with its code; email is optional. */
export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(100),
  businessName: z.string().trim().min(2, 'Enter your business name').max(120),
  phone,
  code: otpCode,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
  businessType: z.string().trim().max(60).optional(),
  city: z.string().trim().max(60).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or phone'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ── Business & couriers ────────────────────────────────────────────────

export const businessUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: optionalText(20),
  address: optionalText(300),
  city: optionalText(60),
  businessType: optionalText(60),
  facebookPageUrl: optionalText(300),
  defaultCourierId: uuid.nullable().optional(),
  defaultCourierCost: money.optional(),
  defaultReturnCost: money.optional(),
  defaultPackagingCost: money.optional(),
});
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;

export const courierSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
  defaultCost: money.default(0),
  defaultReturnCost: money.default(0),
  isActive: z.boolean().default(true),
});
export type CourierInput = z.infer<typeof courierSchema>;

// ── Catalogue ──────────────────────────────────────────────────────────

export const categorySchema = z.object({ name: z.string().trim().min(1, 'Enter a name').max(80) });

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Enter a product name').max(200),
  sku: z
    .string()
    .trim()
    .max(60)
    .optional()
    .nullable()
    .transform((v) => (v ? v.toUpperCase() : null)),
  categoryId: uuid.nullable().optional(),
  sellingPrice: money,
  costPrice: money,
  stock: z.number().int().default(0),
  status: z.enum(PRODUCT_STATUSES).default('active'),
});
export type ProductInput = z.infer<typeof productSchema>;
export const productUpdateSchema = productSchema.partial();
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const bulkCostSchema = z.object({
  items: z
    .array(z.object({ productId: uuid, costPrice: money }))
    .min(1)
    .max(500),
});
export type BulkCostInput = z.infer<typeof bulkCostSchema>;

// ── Customers ──────────────────────────────────────────────────────────

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  phone,
  address: optionalText(300),
  city: optionalText(60),
  note: optionalText(500),
});
export type CustomerInput = z.infer<typeof customerSchema>;
export const customerUpdateSchema = customerSchema.partial();

// ── Orders ─────────────────────────────────────────────────────────────

export const orderItemSchema = z.object({
  productId: uuid,
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  /** Defaults to the product's selling price. */
  unitPrice: money.optional(),
});

export const orderCreateSchema = z.object({
  customer: z.object({
    phone,
    name: z.string().trim().max(120).optional(),
    address: optionalText(300),
  }),
  items: z.array(orderItemSchema).min(1, 'Add at least one item'),
  discount: money.default(0),
  deliveryCharge: money.default(0),
  paymentMethod: z.enum(PAYMENT_METHODS).default('cod'),
  courierId: uuid.nullable().optional(),
  orderDate: isoDate.optional(),
  status: z.enum(CREATABLE_ORDER_STATUSES).default('new'),
  deliveryAddress: optionalText(300),
  /** Default from the courier, then business settings, when omitted. */
  courierCost: money.optional(),
  packagingCost: money.optional(),
  returnCost: money.optional(),
  note: optionalText(1000),
});
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

export const orderUpdateSchema = z.object({
  items: z.array(orderItemSchema).min(1).optional(),
  discount: money.optional(),
  deliveryCharge: money.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  courierId: uuid.nullable().optional(),
  orderDate: isoDate.optional(),
  deliveryAddress: optionalText(300),
  courierCost: money.optional(),
  packagingCost: money.optional(),
  returnCost: money.optional(),
  note: optionalText(1000),
});
export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;

export const orderStatusSchema = z.object({ status: z.enum(ORDER_STATUSES) });
export const bulkStatusSchema = z.object({
  orderIds: z.array(uuid).min(1).max(500),
  status: z.enum(ORDER_STATUSES),
});
export type BulkStatusInput = z.infer<typeof bulkStatusSchema>;

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(ORDER_STATUSES).optional(),
  courierId: uuid.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  customerId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

// ── Expenses ───────────────────────────────────────────────────────────

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
  kind: z.enum(EXPENSE_KINDS).default('other'),
});
export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;

export const expenseSchema = z.object({
  categoryId: uuid,
  amount: money.refine((v) => v > 0, 'Enter an amount above 0'),
  expenseDate: isoDate,
  note: optionalText(300),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;
export const expenseUpdateSchema = expenseSchema.partial();

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
  sort: z.string().max(40).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const periodQuerySchema = z.object({
  period: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
