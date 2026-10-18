import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { customerSchema, customerUpdateSchema, listQuerySchema, normalizePhone, type CustomerInput, type ListQuery } from '@ph/shared';
import { Auth, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { CustomerError } from './customers.errors';
import { toCustomerDto } from './customers.presenter';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly repo: CustomersRepository,
  ) {}

  @Get()
  async list(@Auth() auth: AuthContext, @Query(zod(listQuerySchema)) query: ListQuery) {
    const { rows, total } = await this.repo.paginate(auth.businessId, query);
    return { data: rows.map(toCustomerDto), meta: { page: query.page, perPage: query.perPage, total } };
  }

  /** Order form phone lookup: the customer with their history, or null for a new number. */
  @Get('lookup')
  async lookup(@Auth() auth: AuthContext, @Query('phone') phone: string) {
    const normalized = normalizePhone(phone);
    if (!normalized) throw CustomerError.invalidPhone();
    const row = await this.repo.findWithStats(auth.businessId, { phone: normalized });
    return { data: row ? toCustomerDto(row) : null };
  }

  @Post()
  async create(@Auth() auth: AuthContext, @Body(zod(customerSchema)) body: CustomerInput) {
    return { data: await this.customers.create(auth.businessId, body) };
  }

  @Get(':id')
  async show(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.customers.show(auth.businessId, id) };
  }

  @Patch(':id')
  async update(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(customerUpdateSchema)) body: Partial<CustomerInput>,
  ) {
    return { data: await this.customers.update(auth.businessId, id, body) };
  }
}
