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
  async emailExists(email: string): Promise<boolean> {
    return (await this.prisma.user.findFirst({ where: { email }, select: { id: true } })) !== null;
  }

  async phoneExists(phone: string): Promise<boolean> {
    return (await this.prisma.user.findFirst({ where: { phone }, select: { id: true } })) !== null;
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
            memberships: {
              take: 1,
              orderBy: { createdAt: 'asc' },
              select: { business: { select: { id: true, timezone: true, trialEndsAt: true } } },
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

  revokeAllSessions(userId: string) {
    return this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  findUser(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, locale: true },
    });
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
