import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { businessUpdateSchema, courierSchema, type BusinessUpdateInput, type CourierInput } from '@ph/shared';
import { Auth, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { toCourierDto } from './business.presenter';
import { BusinessRepository } from './business.repository';
import { BusinessService } from './business.service';

/**
 * Plain reads and the no-rule courier create go straight to the repository and
 * presenter; anything with a rule goes through the service (laravel-patterns:
 * action-not-a-pass-through).
 */
@Controller()
export class BusinessController {
  constructor(
    private readonly business: BusinessService,
    private readonly repo: BusinessRepository,
  ) {}

  @Get('business')
  async show(@Auth() auth: AuthContext) {
    return { data: await this.business.profile(auth.businessId) };
  }

  @Patch('business')
  async update(@Auth() auth: AuthContext, @Body(zod(businessUpdateSchema)) body: BusinessUpdateInput) {
    return { data: await this.business.update(auth.businessId, body) };
  }

  @Get('couriers')
  async couriers(@Auth() auth: AuthContext) {
    return { data: (await this.repo.allCouriers(auth.businessId)).map(toCourierDto) };
  }

  @Post('couriers')
  async createCourier(@Auth() auth: AuthContext, @Body(zod(courierSchema)) body: CourierInput) {
    return { data: toCourierDto(await this.repo.createCourier(auth.businessId, body)) };
  }

  @Patch('couriers/:id')
  async updateCourier(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(courierSchema.partial())) body: Partial<CourierInput>,
  ) {
    return { data: await this.business.updateCourier(auth.businessId, id, body) };
  }
}
