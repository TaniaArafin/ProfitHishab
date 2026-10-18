-- Price history: an order takes the price in effect on its order date.
CREATE TABLE "product_prices" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sellingPrice" INTEGER NOT NULL,
    "costPrice" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_prices_money_non_negative" CHECK ("sellingPrice" >= 0 AND "costPrice" >= 0)
);

CREATE UNIQUE INDEX "product_prices_productId_effectiveFrom_key" ON "product_prices"("productId", "effectiveFrom");

ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing product starts its history with its current price, from the day it was created
-- (in the business's timezone). Orders dated before that day fall back to this first row.
INSERT INTO "product_prices" ("id", "businessId", "productId", "sellingPrice", "costPrice", "effectiveFrom", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."businessId", p.id, p."sellingPrice", p."costPrice",
       ((p."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE b.timezone)::date, now(), now()
FROM "products" p
JOIN "businesses" b ON b.id = p."businessId";
