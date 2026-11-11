import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessStatus, AdminAction, AdminBusinessListQuery } from '@ph/shared';
import { PrismaService, type Tx } from '../../common/prisma.service';

export interface AdminBusinessRow {
  id: string;
  name: string;
  createdAt: Date;
  trialEndsAt: Date | null;
  blockedAt: Date | null;
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  phoneVerified: boolean;
  orderCount: number;
  lastActiveAt: Date | null;
}

export interface AdminBusinessDetailRow extends AdminBusinessRow {
  city: string | null;
  businessType: string | null;
  blockedReason: string | null;
  productCount: number;
}

export interface AdminActionRow {
  id: string;
  action: AdminAction;
  details: Prisma.JsonValue;
  adminName: string | null;
  createdAt: Date;
}

const ROW_SELECT = Prisma.sql`
  b.id, b.name, b."createdAt", b."trialEndsAt", b."blockedAt",
  u.id AS "ownerId", u.name AS "ownerName", u.email AS "ownerEmail", u.phone AS "ownerPhone",
  (u."phoneVerifiedAt" IS NOT NULL) AS "phoneVerified",
  (SELECT count(*)::int FROM orders o WHERE o."businessId" = b.id) AS "orderCount",
  (SELECT max(s."lastUsedAt") FROM sessions s JOIN business_members m ON m."userId" = s."userId"
    WHERE m."businessId" = b.id) AS "lastActiveAt"`;

/** The same rules as accessStatus() in shared, as SQL, so the list can filter by status. */
function statusSql(status: AccessStatus, now: Date): Prisma.Sql {
  switch (status) {
    case 'blocked':
      return Prisma.sql`b."blockedAt" IS NOT NULL`;
    case 'unlimited':
      return Prisma.sql`b."blockedAt" IS NULL AND b."trialEndsAt" IS NULL`;
    case 'trial':
      return Prisma.sql`b."blockedAt" IS NULL AND b."trialEndsAt" > ${now}`;
    case 'ended':
      return Prisma.sql`b."blockedAt" IS NULL AND b."trialEndsAt" <= ${now}`;
  }
}

/**
 * Platform admin reads across every business, and the admin action history.
 * Deliberate exception to tenancy: the AdminGuard is the scope. It reads other modules' tables
 * (businesses, users, sessions, orders, products) with SQL and never writes them; writes go through
 * BusinessService and AuthService.
 */
@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest businesses first. */
  async paginateBusinesses(f: AdminBusinessListQuery, now: Date) {
    const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (f.status) where.push(statusSql(f.status, now));
    if (f.q) {
      const like = `%${f.q}%`;
      const digits = f.q.replace(/\D/g, '');
      where.push(
        digits.length >= 3
          ? Prisma.sql`(b.name ILIKE ${like} OR u.name ILIKE ${like} OR u.email ILIKE ${like} OR u.phone LIKE ${`%${digits}%`})`
          : Prisma.sql`(b.name ILIKE ${like} OR u.name ILIKE ${like} OR u.email ILIKE ${like})`,
      );
    }
    const whereSql = Prisma.join(where, ' AND ');
    const [rows, count] = await Promise.all([
      this.prisma.$queryRaw<AdminBusinessRow[]>`
        SELECT ${ROW_SELECT}
        FROM businesses b JOIN users u ON u.id = b."ownerId"
        WHERE ${whereSql}
        ORDER BY b."createdAt" DESC, b.id
        LIMIT ${f.perPage} OFFSET ${(f.page - 1) * f.perPage}`,
      this.prisma.$queryRaw<[{ total: number }]>`
        SELECT count(*)::int AS total FROM businesses b JOIN users u ON u.id = b."ownerId" WHERE ${whereSql}`,
    ]);
    return { rows, total: count[0].total };
  }

  async findBusiness(businessId: string): Promise<AdminBusinessDetailRow | null> {
    const rows = await this.prisma.$queryRaw<AdminBusinessDetailRow[]>`
      SELECT ${ROW_SELECT}, b.city, b."businessType", b."blockedReason",
        (SELECT count(*)::int FROM products p WHERE p."businessId" = b.id) AS "productCount"
      FROM businesses b JOIN users u ON u.id = b."ownerId"
      WHERE b.id = ${businessId}::uuid`;
    return rows[0] ?? null;
  }

  recentActions(businessId: string): Promise<AdminActionRow[]> {
    return this.prisma.$queryRaw<AdminActionRow[]>`
      SELECT a.id, a.action, a.details, u.name AS "adminName", a."createdAt"
      FROM admin_actions a LEFT JOIN users u ON u.id = a."adminUserId"
      WHERE a."businessId" = ${businessId}::uuid
      ORDER BY a."createdAt" DESC, a.id DESC
      LIMIT 50`;
  }

  /** The business a user owns (V1: one), for admin:grant. */
  async ownedBusinessId(userId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM businesses WHERE "ownerId" = ${userId}::uuid ORDER BY "createdAt" LIMIT 1`;
    return rows[0]?.id ?? null;
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  async logAction(
    data: { adminUserId: string; businessId: string; action: AdminAction; details: Prisma.InputJsonObject },
    db: Tx = this.prisma,
  ) {
    await db.adminAction.create({ data, select: { id: true } });
  }
}
