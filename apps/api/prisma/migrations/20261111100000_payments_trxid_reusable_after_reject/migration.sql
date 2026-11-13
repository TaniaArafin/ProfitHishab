-- A rejected payment releases its transaction ID, so a seller whose payment was rejected (wrong months,
-- wrong sender) can resubmit the same real TrxID. Pending and confirmed payments still claim it, across
-- every business. Prisma cannot express a partial index, so schema.prisma has no @@unique for it.
DROP INDEX "payments_method_transactionId_key";

CREATE UNIQUE INDEX "payments_method_transactionId_active_key" ON "payments"("method", "transactionId") WHERE "status" <> 'rejected';
