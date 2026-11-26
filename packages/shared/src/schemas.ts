import { z } from 'zod';
import {
  ACCESS_STATUSES,
  BILLING_METHODS,
  BILLING_MONTH_OPTIONS,
  BILLING_PAYMENT_STATUSES,
  CREATABLE_ORDER_STATUSES,
  EXPENSE_KINDS,
  IMPORT_ROW_STATUSES,
  IMPORT_TARGETS,
  IMPORT_TARGET_LABELS,
  REQUIRED_IMPORT_TARGETS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PRODUCT_STATUSES,
  VARIANT_STATUSES,
} from './enums';
import { isIsoDate } from './dates';
import {
  MAX_OPTIONS,
  MAX_OPTION_VALUES,
  MAX_VARIANTS,
  UNITS,
  UNIT_LABELS,
  allowsDecimal,
  hasAtMostDecimals,
  optionValuesKey,
  type Unit,
} from './products';
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

/** FR-AUTH-02: one rule for every new password (registration and reset). */
const newPassword = z.string().min(8, 'Use at least 8 characters').max(200);

/** Step 1 of registration: text a one-time code to this number. */
export const otpRequestSchema = z.object({ phone });
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

/** The 6-digit SMS code; Bangla digits and spaces are accepted. */
const otpCode = z
  .string({ required_error: 'Enter the 6-digit code' })
  .transform((v) => toAsciiDigits(v).replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS'));

/**
 * The account. Which fields are required depends on the API's OTP_REQUIRED setting (see
 * GET /auth/signup-options): with it on, `phone` and its SMS `code` are required (the API checks);
 * with it off, an email or a phone is enough and `code` is ignored.
 */
const email = z.string().trim().toLowerCase().email('Enter a valid email');

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name').max(100),
    businessName: z.string().trim().min(2, 'Enter your business name').max(120),
    phone: phone.optional().or(z.literal('').transform(() => undefined)),
    code: otpCode.optional().or(z.literal('').transform(() => undefined)),
    email: email.optional().or(z.literal('').transform(() => undefined)),
    password: newPassword,
    businessType: z.string().trim().max(60).optional(),
    city: z.string().trim().max(60).optional(),
  })
  .refine((d) => d.email || d.phone, { message: 'Enter an email or a phone number', path: ['email'] });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or phone'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** FR-AUTH-06: ask for a reset link by email. */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** The token from the emailed link, and the new password. */
export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20, 'This reset link is not complete. Open it from the email again.').max(200),
  password: newPassword,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** FR-AUTH-09: edit the account. Omitted fields stay as they are; an empty email or phone clears it. */
export const accountUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(100).optional(),
  email: email.optional().or(z.literal('').transform(() => null)),
  phone: phone.optional().or(z.literal('').transform(() => null)),
});
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;

/** FR-AUTH-09: change the password; the current one is checked first. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(200),
  newPassword,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

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

const productSku = z
  .string()
  .trim()
  .max(60)
  .optional()
  .nullable()
  .transform((v) => (v ? v.toUpperCase() : null));

/** Stock or a quantity: up to 3 decimals; whole numbers are enforced per unit. */
const quantityLike = z
  .number({ invalid_type_error: 'Enter a number' })
  .min(-1e9)
  .max(1e9)
  .refine((v) => hasAtMostDecimals(v), 'Use at most 3 decimals');

const optionText = z.string().trim().min(1, 'Enter a value').max(40, 'Use at most 40 characters');

export const productOptionSchema = z.object({
  name: optionText,
  values: z.array(optionText).min(1, 'Add at least one value').max(MAX_OPTION_VALUES, `Use at most ${MAX_OPTION_VALUES} values`),
});
export type ProductOptionInput = z.infer<typeof productOptionSchema>;

export const productAttributeSchema = z.object({
  label: z.string().trim().min(1, 'Enter a label').max(60),
  value: z.string().trim().min(1, 'Enter a value').max(200),
});

export const variantInputSchema = z.object({
  id: uuid.optional(),
  optionValues: z.record(optionText).default({}),
  sku: productSku,
  sellingPrice: money,
  costPrice: money,
  stock: quantityLike.default(0),
  status: z.enum(VARIANT_STATUSES).default('active'),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

const productFields = {
  name: z.string().trim().min(1, 'Enter a product name').max(200),
  sku: productSku,
  categoryId: uuid.nullable().optional(),
  unit: z.enum(UNITS),
  brand: optionalText(100),
  description: optionalText(1000),
  attributes: z.array(productAttributeSchema).max(20, 'Use at most 20 details'),
  options: z.array(productOptionSchema).max(MAX_OPTIONS, `Use at most ${MAX_OPTIONS} options`),
  variants: z.array(variantInputSchema).min(1, 'Add at least one variant').max(MAX_VARIANTS, `Use at most ${MAX_VARIANTS} variants`),
  /** Legacy single-variant fields: still accepted, turned into one hidden variant. */
  sellingPrice: money,
  costPrice: money,
  stock: quantityLike,
  status: z.enum(PRODUCT_STATUSES),
  /** Stock comes in batches with an expiry date; sales take the earliest expiry first. */
  tracksBatches: z.boolean(),
};

type VariantShape = { optionValues: Record<string, string>; stock?: number };
type ProductShape = {
  unit?: Unit;
  options?: Array<{ name: string; values: string[] }>;
  variants?: VariantShape[];
  stock?: number;
};

function checkOptions(options: ProductShape['options'], ctx: z.RefinementCtx) {
  const names = new Set<string>();
  options?.forEach((o, i) => {
    const name = o.name.toLowerCase();
    if (names.has(name)) ctx.addIssue({ code: 'custom', path: ['options', i, 'name'], message: 'This option is already added' });
    names.add(name);
    const values = new Set<string>();
    for (const v of o.values) {
      if (values.has(v.toLowerCase())) {
        ctx.addIssue({ code: 'custom', path: ['options', i, 'values'], message: `“${v}” is listed twice` });
        break;
      }
      values.add(v.toLowerCase());
    }
  });
}

/** Every variant names exactly one value of every option, and no two variants are the same. */
function checkVariants(options: NonNullable<ProductShape['options']>, variants: VariantShape[], ctx: z.RefinementCtx) {
  if (options.length === 0 && (variants.length !== 1 || Object.keys(variants[0]?.optionValues ?? {}).length > 0)) {
    ctx.addIssue({ code: 'custom', path: ['variants'], message: 'A product without options has exactly one variant' });
    return;
  }
  const seen = new Set<string>();
  variants.forEach((v, i) => {
    const keys = Object.keys(v.optionValues);
    const valid =
      keys.length === options.length &&
      options.every((o) => o.values.some((value) => value.toLowerCase() === v.optionValues[o.name]?.toLowerCase()));
    if (!valid) {
      ctx.addIssue({ code: 'custom', path: ['variants', i, 'optionValues'], message: 'Pick one value of every option' });
      return;
    }
    const key = optionValuesKey(v.optionValues);
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'optionValues'], message: 'This variant is listed twice' });
    seen.add(key);
  });
}

function checkWholeStock(p: ProductShape, ctx: z.RefinementCtx) {
  if (!p.unit || allowsDecimal(p.unit)) return;
  const message = `Stock must be a whole number for ${UNIT_LABELS[p.unit]}`;
  if (p.stock !== undefined && !Number.isInteger(p.stock)) ctx.addIssue({ code: 'custom', path: ['stock'], message });
  p.variants?.forEach((v, i) => {
    if (v.stock !== undefined && !Number.isInteger(v.stock)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'stock'], message });
  });
}

export const productSchema = z
  .object({
    ...productFields,
    unit: productFields.unit.default('piece'),
    attributes: productFields.attributes.default([]),
    options: productFields.options.default([]),
    variants: productFields.variants.optional(),
    sellingPrice: money.optional(),
    costPrice: money.optional(),
    stock: quantityLike.optional(),
    status: productFields.status.default('active'),
    tracksBatches: productFields.tracksBatches.default(false),
  })
  .superRefine((p, ctx) => {
    checkOptions(p.options, ctx);
    checkWholeStock(p, ctx);
    if (p.variants) return checkVariants(p.options, p.variants, ctx);
    if (p.options.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Add at least one variant' });
      return;
    }
    if (p.sellingPrice === undefined) ctx.addIssue({ code: 'custom', path: ['sellingPrice'], message: 'Enter an amount' });
    if (p.costPrice === undefined) ctx.addIssue({ code: 'custom', path: ['costPrice'], message: 'Enter an amount' });
  })
  .transform(({ sellingPrice, costPrice, stock, variants, ...rest }) => ({
    ...rest,
    variants: variants ?? [
      {
        optionValues: {},
        sku: null,
        sellingPrice: sellingPrice ?? 0,
        costPrice: costPrice ?? 0,
        stock: stock ?? 0,
        status: 'active' as const,
      },
    ],
  }));
export type ProductInput = z.infer<typeof productSchema>;

/**
 * Every field optional. Options and variants are checked against each other when both are sent;
 * the service checks variants alone against the product's stored options, and stock against its unit.
 */
export const productUpdateSchema = z
  .object(productFields)
  .partial()
  .superRefine((p, ctx) => {
    checkOptions(p.options, ctx);
    checkWholeStock(p, ctx);
    if (p.options && p.variants) checkVariants(p.options, p.variants, ctx);
  });
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/** Values trimmed, blanks dropped, repeats (any case) removed, first spelling kept. */
const uniqueValues = z
  .array(optionText)
  .max(MAX_OPTION_VALUES, `Use at most ${MAX_OPTION_VALUES} values`)
  .transform((values) => values.filter((v, i) => values.findIndex((w) => w.toLowerCase() === v.toLowerCase()) === i));

/** A saved option list (Settings → Product options). */
export const optionListSchema = z.object({ name: optionText, values: uniqueValues.default([]) });
export type OptionListInput = z.infer<typeof optionListSchema>;
export const optionListUpdateSchema = z.object({ name: optionText.optional(), values: uniqueValues.optional() });
export type OptionListUpdateInput = z.infer<typeof optionListUpdateSchema>;

/** Receive stock into a new batch (spec 5.4). `variantId` may be left out for a plain product. */
export const receiveStockSchema = z.object({
  variantId: uuid.optional(),
  batchNo: z
    .string()
    .trim()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  expiresOn: isoDate,
  quantity: z
    .number({ invalid_type_error: 'Enter a quantity' })
    .positive('Quantity must be more than 0')
    .max(1e6)
    .refine((v) => hasAtMostDecimals(v), 'Use at most 3 decimals'),
  unitCost: money,
});
export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;

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

export const orderItemSchema = z
  .object({
    /** The variant sold. */
    variantId: uuid.optional(),
    /** Legacy: a product with one variant; a product with several needs `variantId`. */
    productId: uuid.optional(),
    quantity: z
      .number({ invalid_type_error: 'Enter a quantity' })
      .positive('Quantity must be more than 0')
      .max(1e6)
      .refine((v) => hasAtMostDecimals(v), 'Use at most 3 decimals'),
    /** Defaults to the variant's selling price. */
    unitPrice: money.optional(),
  })
  .superRefine((item, ctx) => {
    if (!item.variantId === !item.productId) {
      ctx.addIssue({ code: 'custom', path: ['variantId'], message: 'Pick a product' });
    }
  });
export type OrderItemInput = z.infer<typeof orderItemSchema>;

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

/** Reports (FR-REP): the last month shown (`YYYY-MM`, default the current month) and JSON, CSV or Excel (.xlsx). */
const reportFormat = z.enum(['json', 'csv', 'xlsx']).default('json');
export const reportMonthsQuerySchema = z.object({
  to: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10')
    .optional(),
  format: reportFormat,
});
export type ReportMonthsQuery = z.infer<typeof reportMonthsQuerySchema>;
export const productReportQuerySchema = periodQuerySchema.extend({ format: reportFormat });
export type ProductReportQuery = z.infer<typeof productReportQuerySchema>;

// ── Platform admin ─────────────────────────────────────────────────────

export const adminBusinessListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
  /** Business name, owner name, email or phone. */
  q: z.string().trim().max(100).optional(),
  status: z.enum(ACCESS_STATUSES).optional(),
});
export type AdminBusinessListQuery = z.infer<typeof adminBusinessListQuerySchema>;

export const adminAccessSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('extend'),
    days: z.coerce.number().int('Whole days only').min(1, 'At least 1 day').max(365, 'At most 365 days'),
  }),
  z.object({
    mode: z.literal('until'),
    date: isoDate.refine((d) => d > '2000-01-01', 'Use a date like 2026-12-31'),
  }),
  z.object({ mode: z.literal('unlimited') }),
  z.object({ mode: z.literal('end') }),
]);
export type AdminAccessInput = z.infer<typeof adminAccessSchema>;

export const adminBlockSchema = z.object({
  reason: z.string().trim().min(3, 'Say why, so other admins know').max(300),
});
export type AdminBlockInput = z.infer<typeof adminBlockSchema>;

// ── Billing ────────────────────────────────────────────────────────────

const senderNumber = z.string().transform((value, ctx) => {
  const normalized = normalizePhone(value);
  if (!normalized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter the 11-digit number you paid from.' });
    return z.NEVER;
  }
  return normalized;
});

/** A seller reports a bKash or Nagad payment they made to our number. */
export const paymentSubmitSchema = z.object({
  method: z.enum(BILLING_METHODS),
  months: z.coerce.number().refine((m) => (BILLING_MONTH_OPTIONS as readonly number[]).includes(m), 'Choose 1, 3, 6 or 12 months'),
  senderNumber,
  transactionId: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{8,20}$/, 'Enter the transaction ID from the bKash or Nagad SMS.')),
});
export type PaymentSubmitInput = z.infer<typeof paymentSubmitSchema>;

export const paymentRejectSchema = z.object({ reason: z.string().trim().min(3, 'Say why (at least 3 characters)').max(300) });
export type PaymentRejectInput = z.infer<typeof paymentRejectSchema>;

export const adminPaymentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(BILLING_PAYMENT_STATUSES).default('pending'),
});
export type AdminPaymentListQuery = z.infer<typeof adminPaymentListQuerySchema>;

/** Which spreadsheet column fills which order field, and how status texts map to order statuses. */
export const importMappingSchema = z
  .object({
    columns: z.record(z.enum(IMPORT_TARGETS), z.string().min(1)),
    statuses: z.record(z.string(), z.enum(ORDER_STATUSES)).default({}),
  })
  .superRefine((d, ctx) => {
    for (const target of REQUIRED_IMPORT_TARGETS) {
      if (!d.columns[target]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Choose the column for ${IMPORT_TARGET_LABELS[target]}.`,
          path: ['columns', target],
        });
      }
    }
  });
export type ImportMapping = z.infer<typeof importMappingSchema>;

export const importRowsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(IMPORT_ROW_STATUSES).optional(),
});
export type ImportRowsQuery = z.infer<typeof importRowsQuerySchema>;

/** A fix typed on the import preview: new text for some cells of one row, keyed by the file's headers. */
export const importRowEditSchema = z.object({
  cells: z
    .record(z.string().max(500, 'This value is too long'))
    .refine((cells) => Object.keys(cells).length > 0, 'Change at least one value')
    .refine((cells) => Object.keys(cells).length <= 50, 'Too many values'),
});
export type ImportRowEditInput = z.infer<typeof importRowEditSchema>;

export const importListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});
export type ImportListQuery = z.infer<typeof importListQuerySchema>;
