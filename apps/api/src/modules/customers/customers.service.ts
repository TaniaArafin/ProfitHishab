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
}
