-- Idempotent order creation (laravel-rest-api: controller-idempotency-key-on-unsafe-writes)
ALTER TABLE "orders" ADD COLUMN "idempotencyHash" TEXT,
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "orders_businessId_idempotencyKey_key" ON "orders"("businessId", "idempotencyKey");

-- CHECK constraints: the database refuses values the app would never write
-- (laravel-eloquent: model-cast-every-column — status-like text columns stay inside their enum).
-- Keep these lists in step with packages/shared/src/enums.ts.

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_status_check" CHECK ("status" IN ('new', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')),
  ADD CONSTRAINT "orders_payment_method_check" CHECK ("paymentMethod" IN ('cod', 'bkash', 'nagad', 'rocket', 'bank', 'cash', 'other')),
  ADD CONSTRAINT "orders_source_check" CHECK ("source" IN ('manual', 'import')),
  ADD CONSTRAINT "orders_money_non_negative_check" CHECK (
    "subtotal" >= 0 AND "discount" >= 0 AND "deliveryCharge" >= 0 AND "total" >= 0
    AND "productCost" >= 0 AND "courierCost" >= 0 AND "packagingCost" >= 0 AND "returnCost" >= 0
  ),
  ADD CONSTRAINT "orders_discount_within_subtotal_check" CHECK ("discount" <= "subtotal");

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_money_non_negative_check" CHECK ("unitPrice" >= 0 AND "unitCost" >= 0 AND "lineTotal" >= 0);

ALTER TABLE "order_status_history"
  ADD CONSTRAINT "order_status_history_to_status_check" CHECK ("toStatus" IN ('new', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'));

ALTER TABLE "products"
  ADD CONSTRAINT "products_status_check" CHECK ("status" IN ('active', 'archived')),
  ADD CONSTRAINT "products_money_non_negative_check" CHECK ("sellingPrice" >= 0 AND "costPrice" >= 0);

ALTER TABLE "expense_categories"
  ADD CONSTRAINT "expense_categories_kind_check" CHECK ("kind" IN ('ads', 'courier', 'other'));

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_amount_positive_check" CHECK ("amount" > 0);

ALTER TABLE "couriers"
  ADD CONSTRAINT "couriers_money_non_negative_check" CHECK ("defaultCost" >= 0 AND "defaultReturnCost" >= 0);

ALTER TABLE "businesses"
  ADD CONSTRAINT "businesses_money_non_negative_check" CHECK (
    "defaultCourierCost" >= 0 AND "defaultReturnCost" >= 0 AND "defaultPackagingCost" >= 0
  );

ALTER TABLE "business_members"
  ADD CONSTRAINT "business_members_role_check" CHECK ("role" IN ('owner'));
