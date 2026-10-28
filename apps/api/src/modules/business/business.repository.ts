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

  /** Atomically reserves the next human order number for the business. */
  async reserveOrderNo(businessId: string, db: Tx): Promise<number> {
    const b = await db.business.update({
      where: { id: businessId },
      data: { nextOrderNo: { increment: 1 } },
      select: { nextOrderNo: true },
    });
    return b.nextOrderNo - 1;
  }

  allCouriers(businessId: string) {
    return this.prisma.courier.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
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
