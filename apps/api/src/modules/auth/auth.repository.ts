import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../../common/prisma.service';

/** Users and sessions only. Business rows belong to the Business module. */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByIdentifier(identifier: { email?: string; phone?: string }) {
    if (!identifier.email && !identifier.phone) return Promise.resolve(null);
    return this.prisma.user.findFirst({
      where: identifier.email ? { email: identifier.email } : { phone: identifier.phone },
    });
  }

  /** exists(), not count() (laravel-eloquent: perf-exists-not-count). */
  async emailExists(email: string, exceptUserId?: string): Promise<boolean> {
    const where = { email, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) };
    return (await this.prisma.user.findFirst({ where, select: { id: true } })) !== null;
  }

  async phoneExists(phone: string, exceptUserId?: string): Promise<boolean> {
    const where = { phone, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) };
    return (await this.prisma.user.findFirst({ where, select: { id: true } })) !== null;
  }

  createUser(
    data: { name: string; email: string | null; phone: string | null; phoneVerifiedAt: Date | null; passwordHash: string },
    db: Tx,
  ) {
    return db.user.create({ data });
  }

  createSession(data: { userId: string; tokenHash: string; expiresAt: Date; ip?: string; userAgent?: string }) {
    return this.prisma.session.create({ data });
  }

  /** Active session with the user's business (V1: exactly one membership). */
  findActiveSession(tokenHash: string, now: Date) {
    return this.prisma.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      select: {
        id: true,
        userId: true,
        lastUsedAt: true,
        user: {
          select: {
            isPlatformAdmin: true,
            memberships: {
              take: 1,
              orderBy: { createdAt: 'asc' },
              select: { business: { select: { id: true, timezone: true, trialEndsAt: true, blockedAt: true } } },
            },
          },
        },
      },
    });
  }

  extendSession(sessionId: string, expiresAt: Date, now: Date) {
    return this.prisma.session.update({ where: { id: sessionId }, data: { expiresAt, lastUsedAt: now } });
  }

  revokeSession(sessionId: string) {
    return this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  revokeAllSessions(userId: string, db: Tx = this.prisma) {
    return db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** True when the user's business was blocked by a platform admin. */
  async isBlocked(userId: string): Promise<boolean> {
    const member = await this.prisma.businessMember.findFirst({
      where: { userId, business: { blockedAt: { not: null } } },
      select: { id: true },
    });
    return member !== null;
  }

  /** Logs out everyone in a business (it was blocked). */
  revokeBusinessSessions(businessId: string, db: Tx) {
    return db.session.updateMany({
      where: { revokedAt: null, user: { memberships: { some: { businessId } } } },
      data: { revokedAt: new Date() },
    });
  }

  /** Platform admin flag; only `npm run admin:grant` calls this. Returns the user, or null when unknown. */
  setPlatformAdmin(where: { email?: string; phone?: string }, on: boolean) {
    return this.prisma.user
      .updateMany({ where, data: { isPlatformAdmin: on } })
      .then(({ count }) => (count === 1 ? this.prisma.user.findFirst({ where, select: { id: true, name: true } }) : null));
  }

  updatePassword(userId: string, passwordHash: string, db: Tx) {
    return db.user.update({ where: { id: userId }, data: { passwordHash }, select: { id: true } });
  }

  /** FR-AUTH-09: the account fields a user edits themselves. */
  updateUser(userId: string, data: { name?: string; email?: string | null; phone?: string | null; phoneVerifiedAt?: Date | null }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, phone: true, locale: true, isPlatformAdmin: true },
    });
  }

  async findPasswordHash(userId: string): Promise<string> {
    return (await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } })).passwordHash;
  }

  /** Logs out every other device after a password change; `keepSessionId` stays logged in. */
  revokeOtherSessions(userId: string, keepSessionId: string, db: Tx) {
    return db.session.updateMany({ where: { userId, revokedAt: null, id: { not: keepSessionId } }, data: { revokedAt: new Date() } });
  }

  findUser(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, locale: true, isPlatformAdmin: true },
    });
  }

  /** The owner's email, or null when the owner signed up with a phone only (or there is no such business). */
  async ownerEmail(businessId: string, db: Tx = this.prisma): Promise<string | null> {
    const member = await db.businessMember.findFirst({
      where: { businessId, role: 'owner' },
      orderBy: { createdAt: 'asc' },
      select: { user: { select: { email: true } } },
    });
    return member?.user.email ?? null;
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
