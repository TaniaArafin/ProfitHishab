import { Injectable } from '@nestjs/common';
import { DEFAULT_COURIERS, type BusinessDto, type BusinessUpdateInput, type CourierDto, type CourierInput } from '@ph/shared';
import type { Tx } from '../../common/prisma.service';
import { BusinessError } from './business.errors';
import { toBusinessDto, toCourierDto } from './business.presenter';
import { BusinessRepository } from './business.repository';

/** What the Orders module needs from a business to price a new order. Identities and numbers only. */
export interface OrderDefaults {
  timezone: string;
  courier: { id: string; defaultCost: number; defaultReturnCost: number } | null;
  courierCost: number;
  returnCost: number;
  packagingCost: number;
}

/**
 * Public surface of the Business module. Other modules call this service, never
 * BusinessRepository (laravel-patterns: domain-no-cross-domain-models).
 */
@Injectable()
export class BusinessService {
  constructor(private readonly repo: BusinessRepository) {}

  async profile(businessId: string): Promise<BusinessDto> {
    return toBusinessDto(await this.repo.find(businessId));
  }

  /** Called by Auth inside the registration transaction. */
  async createForOwner(
    owner: { userId: string; phone: string | null },
    details: { name: string; businessType: string | null; city: string | null; trialEndsAt: Date | null },
    db: Tx,
  ): Promise<{ businessId: string }> {
    const business = await this.repo.createForOwner(
      {
        ownerId: owner.userId,
        name: details.name,
        businessType: details.businessType,
        city: details.city,
        phone: owner.phone,
        trialEndsAt: details.trialEndsAt,
      },
      DEFAULT_COURIERS,
      db,
    );
    return { businessId: business.id };
  }

  async update(businessId: string, input: BusinessUpdateInput): Promise<BusinessDto> {
    if (input.defaultCourierId && !(await this.repo.findCourier(businessId, input.defaultCourierId))) {
      throw BusinessError.courierNotFound();
    }
    return toBusinessDto(await this.repo.update(businessId, input));
  }

  async updateCourier(businessId: string, courierId: string, input: Partial<CourierInput>): Promise<CourierDto> {
    if (!(await this.repo.findCourier(businessId, courierId))) throw BusinessError.courierNotFound();
    return toCourierDto(await this.repo.updateCourier(courierId, input));
  }

  /**
   * Cost defaults for a new order. An explicitly chosen courier must belong to the
   * business; otherwise the business default courier is used if it still exists.
   * Courier defaults win over business defaults when they are set (above 0).
   */
  async orderDefaults(businessId: string, chosenCourierId: string | null | undefined, db: Tx): Promise<OrderDefaults> {
    const business = await this.repo.find(businessId, db);
    const courierId = chosenCourierId ?? business.defaultCourierId;
    const courier = courierId ? await this.repo.findCourier(businessId, courierId, db) : null;
    if (chosenCourierId && !courier) throw BusinessError.courierNotFound();

    return {
      timezone: business.timezone,
      courier: courier ? { id: courier.id, defaultCost: courier.defaultCost, defaultReturnCost: courier.defaultReturnCost } : null,
      courierCost: courier && courier.defaultCost > 0 ? courier.defaultCost : business.defaultCourierCost,
      returnCost: courier && courier.defaultReturnCost > 0 ? courier.defaultReturnCost : business.defaultReturnCost,
      packagingCost: business.defaultPackagingCost,
    };
  }

  async assertCourierBelongs(businessId: string, courierId: string, db: Tx): Promise<void> {
    if (!(await this.repo.findCourier(businessId, courierId, db))) throw BusinessError.courierNotFound();
  }

  /** Platform admin: current access fields, locked for the admin's transaction. Null when no such business. */
  lockAccess(businessId: string, db: Tx) {
    return this.repo.lockAccess(businessId, db);
  }

  /** Platform admin: new end of access (null = unlimited). */
  async setAccessEnd(businessId: string, trialEndsAt: Date | null, db: Tx): Promise<void> {
    await this.repo.setAccess(businessId, { trialEndsAt }, db);
  }

  /** Platform admin: block (with a reason) or unblock (null). */
  async setBlocked(businessId: string, block: { at: Date; reason: string } | null, db: Tx): Promise<void> {
    await this.repo.setAccess(businessId, { blockedAt: block?.at ?? null, blockedReason: block?.reason ?? null }, db);
  }

  /** Billing, inside the confirm transaction: remembers when the business first paid (only the first time). */
  async markPaid(businessId: string, at: Date, db: Tx): Promise<void> {
    await this.repo.markPaid(businessId, at, db);
  }

  /**
   * Courier id by lower-cased, trimmed name, for matching a spreadsheet's courier column (FR-IMP-02).
   * Inactive couriers count: past orders may use them. On a name clash the oldest courier wins.
   */
  async couriersByName(businessId: string, db?: Tx): Promise<Map<string, string>> {
    const byName = new Map<string, string>();
    for (const c of await this.repo.courierNames(businessId, db)) {
      const key = c.name.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, c.id);
    }
    return byName;
  }

  reserveOrderNo(businessId: string, db: Tx): Promise<number> {
    return this.repo.reserveOrderNo(businessId, db);
  }

  /**
   * A block of `count` consecutive order numbers (an import); returns the first. The UPDATE also
   * locks the business row until the transaction ends, so two imports of one business run one after the other.
   */
  reserveOrderNos(businessId: string, count: number, db: Tx): Promise<number> {
    return this.repo.reserveOrderNos(businessId, count, db);
  }
}
