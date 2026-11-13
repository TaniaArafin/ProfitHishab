import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../../common/prisma.service';

@Injectable()
export class BusinessRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** A new business with its owner membership and the default couriers (FR-AUTH-01, FR-BIZ-04). */
  async createForOwner(
    data: {
      ownerId: string;
      name: string;
      businessType: string | null;
      city: string | null;
      phone: string | null;
      trialEndsAt: Date | null;
    },
    courierNames: readonly string[],
    db: Tx,
  ) {
    const business = await db.business.create({ data });
    await db.businessMember.create({ data: { businessId: business.id, userId: data.ownerId, role: 'owner' } });
    await db.courier.createMany({ data: courierNames.map((name) => ({ businessId: business.id, name })) });
    return business;
  }

  find(businessId: string, db: Tx = this.prisma) {
    return db.business.findUniqueOrThrow({ where: { id: businessId } });
  }

  update(businessId: string, data: Prisma.BusinessUpdateInput) {
    return this.prisma.business.update({ where: { id: businessId }, data });
  }

  /** The access fields, locked until the transaction ends (two admins changing access at once). */
  async lockAccess(businessId: string, db: Tx): Promise<{ trialEndsAt: Date | null; blockedAt: Date | null } | null> {
    const rows = await db.$queryRaw<Array<{ trialEndsAt: Date | null; blockedAt: Date | null }>>`
      SELECT "trialEndsAt", "blockedAt" FROM businesses WHERE id = ${businessId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  setAccess(businessId: string, data: { trialEndsAt?: Date | null; blockedAt?: Date | null; blockedReason?: string | null }, db: Tx) {
    return db.business.update({ where: { id: businessId }, data, select: { id: true } });
  }

  /** Sets firstPaidAt unless it is already set: the first payment is kept. */
  async markPaid(businessId: string, at: Date, db: Tx): Promise<void> {
    await db.business.updateMany({ where: { id: businessId, firstPaidAt: null }, data: { firstPaidAt: at } });
  }

  /** Atomically reserves the next human order number for the business. */
  async reserveOrderNo(businessId: string, db: Tx): Promise<number> {
    const b = await db.business.update({
      where: { id: businessId },
      data: { nextOrderNo: { increment: 1 } },
      select: { nextOrderNo: true },
    });
    return b.nextOrderNo - 1;
  }

  /** Reserves `count` consecutive order numbers in one UPDATE … RETURNING; returns the first. */
  async reserveOrderNos(businessId: string, count: number, db: Tx): Promise<number> {
    const [row] = await db.$queryRaw<[{ next: number }]>`
      UPDATE businesses SET "nextOrderNo" = "nextOrderNo" + ${count}::int, "updatedAt" = now()
      WHERE id = ${businessId}::uuid
      RETURNING "nextOrderNo" AS next`;
    return row.next - count;
  }

  allCouriers(businessId: string) {
    return this.prisma.courier.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
  }

  /** Id and name of every courier of the business, oldest first (inactive ones too). */
  courierNames(businessId: string, db: Tx = this.prisma): Promise<Array<{ id: string; name: string }>> {
    return db.courier.findMany({ where: { businessId }, select: { id: true, name: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  }

  findCourier(businessId: string, courierId: string, db: Tx = this.prisma) {
    return db.courier.findFirst({ where: { id: courierId, businessId } });
  }

  createCourier(businessId: string, data: Omit<Prisma.CourierUncheckedCreateInput, 'businessId'>) {
    return this.prisma.courier.create({ data: { ...data, businessId } });
  }

  updateCourier(courierId: string, data: Prisma.CourierUpdateInput) {
    return this.prisma.courier.update({ where: { id: courierId }, data });
  }
}
