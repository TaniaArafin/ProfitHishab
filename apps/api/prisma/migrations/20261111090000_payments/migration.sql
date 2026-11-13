-- Manual bKash/Nagad payments after the free trial, checked by a platform admin.

-- First confirmed payment: paying sellers are not told their "free trial" is ending.
ALTER TABLE "businesses" ADD COLUMN     "firstPaidAt" TIMESTAMP(3);

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "submittedById" UUID,
    "method" TEXT NOT NULL,
    "senderNumber" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectReason" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    -- Match BILLING_METHODS, BILLING_PAYMENT_STATUSES and BILLING_MONTH_OPTIONS in packages/shared/src/enums.ts.
    CONSTRAINT "payments_method_check" CHECK ("method" IN ('bkash', 'nagad')),
    CONSTRAINT "payments_status_check" CHECK ("status" IN ('pending', 'confirmed', 'rejected')),
    CONSTRAINT "payments_months_check" CHECK ("months" IN (1, 3, 6, 12)),
    CONSTRAINT "payments_amount_check" CHECK ("amount" > 0)
);

CREATE INDEX "payments_status_createdAt_idx" ON "payments"("status", "createdAt");

-- One transaction ID can never be claimed twice, by any business.
CREATE UNIQUE INDEX "payments_method_transactionId_key" ON "payments"("method", "transactionId");

-- The database itself allows one pending payment per business (Prisma cannot express a partial index).
CREATE UNIQUE INDEX "payments_one_pending_per_business" ON "payments"("businessId") WHERE "status" = 'pending';

ALTER TABLE "payments" ADD CONSTRAINT "payments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Admin actions gain confirm_payment and reject_payment (ADMIN_ACTIONS in shared enums).
ALTER TABLE "admin_actions" DROP CONSTRAINT "admin_actions_action_check";
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_action_check"
  CHECK ("action" IN ('set_access', 'block', 'unblock', 'reset_link', 'confirm_payment', 'reject_payment'));
