-- Products Stage 2: batches with expiry dates, FEFO allocations on order lines, and cleared (written-off) expired stock.
-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "batchAllocations" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "tracksBatches" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "stock_batches" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "batchNo" TEXT,
    "expiresOn" DATE NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "receivedOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_writeoffs" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "batchId" UUID,
    "batchNo" TEXT,
    "expiresOn" DATE NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL,
    "writtenOffOn" DATE NOT NULL,
    "expenseId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_writeoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_batches_variantId_expiresOn_idx" ON "stock_batches"("variantId", "expiresOn");

-- CreateIndex
CREATE INDEX "stock_batches_businessId_expiresOn_idx" ON "stock_batches"("businessId", "expiresOn");

-- CreateIndex
CREATE INDEX "stock_writeoffs_businessId_writtenOffOn_idx" ON "stock_writeoffs"("businessId", "writtenOffOn");

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_writeoffs" ADD CONSTRAINT "stock_writeoffs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_writeoffs" ADD CONSTRAINT "stock_writeoffs_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "stock_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_writeoffs" ADD CONSTRAINT "stock_writeoffs_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Checks (money >= 0, quantities sane)
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_quantity_check" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "stock_batches_money_non_negative_check" CHECK ("unitCost" >= 0);
ALTER TABLE "stock_writeoffs" ADD CONSTRAINT "stock_writeoffs_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "stock_writeoffs_money_non_negative_check" CHECK ("unitCost" >= 0 AND "cost" >= 0);
