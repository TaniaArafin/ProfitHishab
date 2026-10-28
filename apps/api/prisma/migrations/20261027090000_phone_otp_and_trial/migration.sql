-- 7-day free trial, one per verified phone number.
-- Existing businesses keep "trialEndsAt" NULL: early-access sellers have no time limit.
ALTER TABLE "businesses" ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

ALTER TABLE "users" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- One-time SMS codes. Only a hash of the code is stored.
CREATE TABLE "phone_otps" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_otps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "phone_otps_attempts_non_negative" CHECK ("attempts" >= 0)
);

-- A phone number that has used its trial. Survives the business being deleted (SET NULL).
CREATE TABLE "trial_claims" (
    "phone" TEXT NOT NULL,
    "businessId" UUID,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_claims_pkey" PRIMARY KEY ("phone")
);

CREATE INDEX "phone_otps_phone_createdAt_idx" ON "phone_otps"("phone", "createdAt");

ALTER TABLE "trial_claims" ADD CONSTRAINT "trial_claims_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
