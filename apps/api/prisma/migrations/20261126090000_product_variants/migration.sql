-- Products for every business, Stage 1: variants, units, details, saved option lists.
-- Every existing product gets exactly one variant (no option values) carrying its SKU,
-- price, cost, stock and status; every order line and price row is pointed at it, so past
-- orders and profit read exactly as before.

-- 1. New tables
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "optionValues" JSONB NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "sku" TEXT NOT NULL,
    "sellingPrice" INTEGER NOT NULL,
    "costPrice" INTEGER NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "importId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_variants_status_check" CHECK ("status" IN ('active', 'archived')),
    CONSTRAINT "product_variants_money_non_negative_check" CHECK ("sellingPrice" >= 0 AND "costPrice" >= 0)
);

CREATE TABLE "option_lists" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "option_lists_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");
CREATE UNIQUE INDEX "product_variants_businessId_sku_key" ON "product_variants"("businessId", "sku");
CREATE UNIQUE INDEX "option_lists_businessId_name_key" ON "option_lists"("businessId", "name");

ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "option_lists" ADD CONSTRAINT "option_lists_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. New product columns; decimal stock
ALTER TABLE "products" ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "brand" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "options" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'piece',
ALTER COLUMN "stock" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "stock" SET DEFAULT 0;

ALTER TABLE "products" ADD CONSTRAINT "products_unit_check"
  CHECK ("unit" IN ('piece', 'kg', 'gram', 'litre', 'ml', 'metre', 'pack', 'box', 'strip', 'dozen', 'pair', 'set'));

-- 3. One variant per existing product
INSERT INTO "product_variants" ("id", "businessId", "productId", "position", "sku", "sellingPrice", "costPrice", "stock", "status", "importId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "businessId", "id", 0, "sku", "sellingPrice", "costPrice", "stock", "status", "importId", "createdAt", CURRENT_TIMESTAMP
FROM "products";

-- 4. Order lines: variant, label snapshot, decimal quantity
ALTER TABLE "order_items" ADD COLUMN "variantId" UUID,
ADD COLUMN "variantLabel" TEXT,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

UPDATE "order_items" i SET "variantId" = v."id" FROM "product_variants" v WHERE v."productId" = i."productId";
ALTER TABLE "order_items" ALTER COLUMN "variantId" SET NOT NULL;
CREATE INDEX "order_items_variantId_idx" ON "order_items"("variantId");
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Price history per variant
ALTER TABLE "product_prices" ADD COLUMN "variantId" UUID;
UPDATE "product_prices" p SET "variantId" = v."id" FROM "product_variants" v WHERE v."productId" = p."productId";
ALTER TABLE "product_prices" ALTER COLUMN "variantId" SET NOT NULL;
DROP INDEX "product_prices_productId_effectiveFrom_key";
CREATE UNIQUE INDEX "product_prices_variantId_effectiveFrom_key" ON "product_prices"("variantId", "effectiveFrom");
CREATE INDEX "product_prices_productId_idx" ON "product_prices"("productId");
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Saved option lists for existing sellers, from their business type (PRESET_OPTION_LISTS)
INSERT INTO "option_lists" ("id", "businessId", "name", "values", "updatedAt")
SELECT gen_random_uuid(), b."id", l."name", l."values"::jsonb, CURRENT_TIMESTAMP
FROM "businesses" b
JOIN (VALUES
  ('Clothing & fashion', 'Size', '["S","M","L","XL","XXL"]'),
  ('Clothing & fashion', 'Colour', '["Red","Blue","Black","White","Green"]'),
  ('Cosmetics & beauty', 'Shade', '[]'),
  ('Food & grocery', 'Pack size', '["250 g","500 g","1 kg","1 litre","5 litre"]'),
  ('Electronics & gadgets', 'Storage', '["4/64","6/128","8/128","8/256"]'),
  ('Electronics & gadgets', 'Colour', '["Red","Blue","Black","White","Green"]')
) AS l("businessType", "name", "values") ON l."businessType" = b."businessType";
