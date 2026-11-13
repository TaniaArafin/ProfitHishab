import { Injectable } from '@nestjs/common';
import type { CustomerInput, CustomerProfileDto } from '@ph/shared';
import type { Tx } from '../../common/prisma.service';
import { CustomerError } from './customers.errors';
import { toCustomerDto } from './customers.presenter';
import { CustomersRepository } from './customers.repository';

/** Customer rules, and the public surface Orders uses to attach a customer to an order. */
@Injectable()
export class CustomersService {
  constructor(private readonly repo: CustomersRepository) {}

  async show(businessId: string, customerId: string): Promise<CustomerProfileDto> {
    const c = await this.repo.findWithStats(businessId, { id: customerId });
    if (!c) throw CustomerError.notFound();
    return toCustomerDto(c);
  }

  async create(businessId: string, input: CustomerInput): Promise<CustomerProfileDto> {
    if (await this.repo.findByPhone(businessId, input.phone)) throw CustomerError.phoneTaken();
    const c = await this.repo.create(businessId, input);
    return this.show(businessId, c.id);
  }

  async update(businessId: string, customerId: string, input: Partial<CustomerInput>): Promise<CustomerProfileDto> {
    const existing = await this.repo.find(businessId, customerId);
    if (!existing) throw CustomerError.notFound();
    if (input.phone && input.phone !== existing.phone && (await this.repo.findByPhone(businessId, input.phone))) {
      throw CustomerError.phoneTaken();
    }
    await this.repo.update(customerId, input);
    return this.show(businessId, customerId);
  }

  /**
   * FR-CUST-02: orders and imports reuse the customer with the same phone, or create one.
   * An existing customer keeps their name; a missing address is filled in.
   */
  async findOrCreateForOrder(
    businessId: string,
    data: { phone: string; name?: string | null; address?: string | null; importId?: string },
    db: Tx,
  ): Promise<{ id: string; address: string | null }> {
    const existing = await this.repo.findByPhone(businessId, data.phone, db);
    if (existing) {
      if (data.address && !existing.address) {
        await this.repo.update(existing.id, { address: data.address }, db);
        return { id: existing.id, address: data.address };
      }
      return { id: existing.id, address: existing.address };
    }
    const created = await this.repo.create(
      businessId,
      { phone: data.phone, name: data.name?.trim() || data.phone, address: data.address ?? null, importId: data.importId ?? null },
      db,
    );
    return { id: created.id, address: created.address };
  }

  /**
   * findOrCreateForOrder for a whole import, in a fixed number of statements: one select by phone,
   * one INSERT for the new customers (tagged with the import), one UPDATE filling empty addresses,
   * and a re-select. Several people with one phone are one customer (first non-empty name and address).
   * Returns each phone's customer id and address.
   */
  async findOrCreateManyForImport(
    businessId: string,
    people: ReadonlyArray<{ phone: string; name: string | null; address: string | null }>,
    importId: string,
    db: Tx,
  ): Promise<{ customers: Map<string, { id: string; address: string | null }>; created: number }> {
    const byPhone = new Map<string, { phone: string; name: string | null; address: string | null }>();
    for (const p of people) {
      const seen = byPhone.get(p.phone);
      const name = p.name?.trim() || null;
      const address = p.address?.trim() || null;
      if (!seen) byPhone.set(p.phone, { phone: p.phone, name, address });
      else byPhone.set(p.phone, { phone: p.phone, name: seen.name ?? name, address: seen.address ?? address });
    }
    const phones = [...byPhone.keys()];
    const existing = await this.repo.findByPhones(businessId, phones, db);
    const known = new Set(existing.map((c) => c.phone));

    const fresh = [...byPhone.values()].filter((p) => !known.has(p.phone)).map((p) => ({ ...p, name: p.name ?? p.phone }));
    const created = await this.repo.createMany(businessId, fresh, importId, db);
    const fills = existing.flatMap((c) => {
      const address = byPhone.get(c.phone)?.address;
      return address && !c.address ? [{ id: c.id, address }] : [];
    });
    await this.repo.fillMissingAddresses(businessId, fills, db);

    const all = await this.repo.findByPhones(businessId, phones, db);
    return { customers: new Map(all.map((c) => [c.phone, { id: c.id, address: c.address }])), created };
  }

  /** FR-IMP-12: deletes the customers this import created that no order uses (run after its orders are gone). */
  deleteUnusedFromImport(businessId: string, importId: string, db: Tx): Promise<number> {
    return this.repo.deleteUnusedFromImport(businessId, importId, db);
  }
}
