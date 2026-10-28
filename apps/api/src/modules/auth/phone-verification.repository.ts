import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../../common/prisma.service';

/** Registration codes and used trials, both keyed by a phone number. Not tenant data: no business owns them yet. */
@Injectable()
export class PhoneVerificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  createOtp(data: { phone: string; codeHash: string; expiresAt: Date }) {
    return this.prisma.phoneOtp.create({ data, select: { id: true } });
  }

  /** Send times in the last hour, oldest first: the input to the resend and hourly limits. */
  async sentSince(phone: string, since: Date): Promise<Date[]> {
    const rows = await this.prisma.phoneOtp.findMany({
      where: { phone, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    return rows.map((r) => r.createdAt);
  }

  /** The newest code for the phone that can still be used. Sending a new code makes older ones useless. */
  async liveOtp(phone: string, now: Date, maxAttempts: number) {
    const newest = await this.prisma.phoneOtp.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true, attempts: true, expiresAt: true, consumedAt: true },
    });
    if (!newest || newest.consumedAt || newest.expiresAt <= now || newest.attempts >= maxAttempts) return null;
    return newest;
  }

  /** Counts a wrong guess in one statement, so parallel guesses cannot share an attempt. */
  async recordWrongAttempt(otpId: string): Promise<number> {
    const row = await this.prisma.phoneOtp.update({
      where: { id: otpId },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return row.attempts;
  }

  /** Marks the code used. False when another request used it first. */
  async consumeOtp(otpId: string, now: Date, db: Tx): Promise<boolean> {
    const { count } = await db.phoneOtp.updateMany({ where: { id: otpId, consumedAt: null }, data: { consumedAt: now } });
    return count === 1;
  }

  /** exists(), not count() (laravel-eloquent: perf-exists-not-count). */
  async trialUsed(phone: string, db: Tx): Promise<boolean> {
    return (await db.trialClaim.findUnique({ where: { phone }, select: { phone: true } })) !== null;
  }

  /** Records that this phone has had its trial. A repeat keeps the first claim. */
  async claimTrial(phone: string, businessId: string, db: Tx): Promise<void> {
    await db.trialClaim.upsert({ where: { phone }, create: { phone, businessId }, update: {} });
  }
}
