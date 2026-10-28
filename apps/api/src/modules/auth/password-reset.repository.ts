import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../../common/prisma.service';

/** Forgot-password links (FR-AUTH-06). Only the token's hash is stored. */
@Injectable()
export class PasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return this.prisma.passwordReset.create({ data, select: { id: true } });
  }

  /** Links asked for since `since`: the input to the 3-an-hour limit (FR-AUTH-08). */
  countSince(userId: string, since: Date): Promise<number> {
    return this.prisma.passwordReset.count({ where: { userId, createdAt: { gte: since } } });
  }

  /** A link that is unused and not expired, with its user's login identifiers. */
  findLive(tokenHash: string, now: Date) {
    return this.prisma.passwordReset.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      select: { id: true, userId: true, user: { select: { email: true, phone: true } } },
    });
  }

  /** Marks the link used. False when another request used it first. */
  async markUsed(id: string, now: Date, db: Tx): Promise<boolean> {
    const { count } = await db.passwordReset.updateMany({ where: { id, usedAt: null }, data: { usedAt: now } });
    return count === 1;
  }

  /** Every other open link of the user stops working (a newer link, or a completed reset). */
  async closeOthers(userId: string, exceptId: string | null, now: Date, db: Tx = this.prisma): Promise<void> {
    await db.passwordReset.updateMany({
      where: { userId, usedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { usedAt: now },
    });
  }
}
