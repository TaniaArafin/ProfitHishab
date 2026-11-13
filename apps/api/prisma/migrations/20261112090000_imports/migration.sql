-- Excel/CSV order import: saved headers, row grouping, saved column mappings, and CHECKs for the status columns.
-- Match IMPORT_STATUSES and IMPORT_ROW_STATUSES in packages/shared/src/enums.ts.

ALTER TABLE "imports" ADD COLUMN     "headers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "headersKey" TEXT;

ALTER TABLE "import_rows" ADD COLUMN     "groupKey" TEXT;

ALTER TABLE "imports" ADD CONSTRAINT "imports_status_check"
  CHECK ("status" IN ('uploaded', 'mapped', 'validated', 'imported', 'undone', 'failed'));
ALTER TABLE "imports" ADD CONSTRAINT "imports_type_check" CHECK ("type" IN ('orders', 'products'));
ALTER TABLE "imports" ADD CONSTRAINT "imports_counts_check"
  CHECK ("totalRows" >= 0 AND "validRows" >= 0 AND "duplicateRows" >= 0 AND "invalidRows" >= 0 AND "importedRows" >= 0);
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_status_check"
  CHECK ("status" IN ('pending', 'valid', 'duplicate', 'invalid'));

-- A row number is unique within its import (writeValidation joins on it).
CREATE UNIQUE INDEX "import_rows_importId_rowNumber_key" ON "import_rows"("importId", "rowNumber");

CREATE TABLE "import_mappings" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "headersKey" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "import_mappings_businessId_headersKey_key" ON "import_mappings"("businessId", "headersKey");

ALTER TABLE "import_mappings" ADD CONSTRAINT "import_mappings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
