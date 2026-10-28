import type { ExpenseKind, OrderStatus, PaymentMethod, ProductStatus } from './enums';
import type { Period } from './dates';

/** Response shapes shared by the API and the web app. Money is integer poisha. */

export interface Paginated<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number };
}

/** Response of POST /auth/otp. */
export interface OtpSentDto {
  /** Seconds until the code stops working. */
  expiresIn: number;
  /** Seconds before another code can be sent. */
  resendIn: number;
}

export interface Me {
  user: { id: string; name: string; email: string | null; phone: string | null; locale: string };
  business: BusinessDto;
}

export interface BusinessDto {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  businessType: string | null;
  facebookPageUrl: string | null;
  currency: string;
  timezone: string;
  defaultCourierId: string | null;
  defaultCourierCost: number;
  defaultReturnCost: number;
  defaultPackagingCost: number;
  /** ISO time the free trial ends; writes are refused after it. Null = no limit (early access). */
  trialEndsAt: string | null;
}

export interface CourierDto {
  id: string;
  name: string;
  defaultCost: number;
  defaultReturnCost: number;
  isActive: boolean;
}

export interface CategoryDto {
  id: string;
  name: string;
  productCount: number;
}

export interface ProductDto {
  id: string;
  name: string;
  sku: string;
  categoryId: string | null;
  categoryName: string | null;
  sellingPrice: number;
  costPrice: number;
  grossProfit: number;
  margin: number;
  stock: number;
  status: ProductStatus;
  costMissing: boolean;
}

/** One row of a product's price history: the price from `effectiveFrom` until the next row. */
export interface ProductPriceDto {
  sellingPrice: number;
  costPrice: number;
  effectiveFrom: string;
  changedAt: string;
}

/** A product's price and cost on a given day (GET /products/prices-on). */
export interface ProductPriceOnDto {
  productId: string;
  sellingPrice: number;
  costPrice: number;
}

export interface CustomerDto {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  city: string | null;
  note: string | null;
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  totalSpent: number;
  lastOrderDate: string | null;
}

export interface CustomerProfileDto extends CustomerDto {
  profitGenerated: number;
}

export interface OrderListItemDto {
  id: string;
  orderNo: number;
  status: OrderStatus;
  orderDate: string;
  total: number;
  paymentMethod: PaymentMethod;
  customer: { id: string; name: string; phone: string };
  courier: { id: string; name: string } | null;
  itemCount: number;
}

export interface OrderItemDto {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
}

export interface OrderDetailDto extends OrderListItemDto {
  deliveryAddress: string | null;
  subtotal: number;
  discount: number;
  deliveryCharge: number;
  productCost: number;
  courierCost: number;
  packagingCost: number;
  returnCost: number;
  note: string | null;
  source: 'manual' | 'import';
  deliveredAt: string | null;
  returnedAt: string | null;
  items: OrderItemDto[];
  profit: number;
  allowedStatuses: OrderStatus[];
  history: Array<{ fromStatus: OrderStatus | null; toStatus: OrderStatus; changedAt: string }>;
}

export interface ExpenseCategoryDto {
  id: string;
  name: string;
  kind: ExpenseKind;
  isSystem: boolean;
}

export interface ExpenseDto {
  id: string;
  categoryId: string;
  categoryName: string;
  kind: ExpenseKind;
  amount: number;
  expenseDate: string;
  note: string | null;
}

export interface ExpenseListDto {
  data: ExpenseDto[];
  totals: Array<{ categoryId: string; categoryName: string; kind: ExpenseKind; amount: number }>;
  total: number;
  warning: string | null;
}

export interface ProfitStatement {
  productSales: number;
  deliveryIncome: number;
  revenue: number;
  productCost: number;
  courierCost: number;
  adsCost: number;
  otherExpenses: number;
  grossProfit: number;
  netProfit: number;
}

export interface ProfitKpis {
  profitMargin: number;
  orders: number;
  delivered: number;
  returned: number;
  pending: number;
  returnRate: number;
  avgOrderValue: number;
}

export interface ProfitSummaryDto {
  period: Period;
  previousPeriod: Period;
  statement: ProfitStatement;
  kpis: ProfitKpis;
  previous: { statement: ProfitStatement; kpis: ProfitKpis };
  dataQuality: { productsMissingCost: number; expensesEntered: boolean; hasOrders: boolean };
}

export interface TrendPointDto {
  bucket: string;
  revenue: number;
  netProfit: number;
}

export interface ProductProfitDto {
  productId: string;
  name: string;
  sku: string;
  unitsSold: number;
  sales: number;
  cost: number;
  profit: number;
  margin: number;
  unitsReturned: number;
}

export interface ProductProfitReportDto {
  period: Period;
  rows: ProductProfitDto[];
  highlights: {
    mostProfitable: ProductProfitDto | null;
    highestRevenue: ProductProfitDto | null;
    lowestMargin: ProductProfitDto | null;
  };
}

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'good';

export interface InsightDto {
  code: string;
  severity: InsightSeverity;
  message: string;
  href: string | null;
}
