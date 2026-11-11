-- Platform admin panel: who is staff, blocked accounts, and a history of admin actions.
ALTER TABLE "users" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "businesses" ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "blockedReason" TEXT;

CREATE TABLE "admin_actions" (
    "id" UUID NOT NULL,
    "adminUserId" UUID,
    "businessId" UUID,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id"),
    -- Matches ADMIN_ACTIONS in packages/shared/src/enums.ts.
    CONSTRAINT "admin_actions_action_check" CHECK ("action" IN ('set_access', 'block', 'unblock', 'reset_link'))
);

CREATE INDEX "admin_actions_businessId_createdAt_idx" ON "admin_actions"("businessId", "createdAt");

ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
