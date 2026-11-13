import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { adminPaymentListQuerySchema, paymentRejectSchema, type AdminPaymentListQuery, type PaymentRejectInput } from '@ph/shared';
import { AllowAfterTrial, Auth, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { AdminGuard } from '../admin/admin.guard';
import { toAdminPaymentDto } from './billing.presenter';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';

/** The platform admin's payment queue. The list is a plain read (repository → presenter); reviews go through the service. */
@Controller('admin/payments')
@UseGuards(AdminGuard)
@AllowAfterTrial()
export class BillingAdminController {
  constructor(
    private readonly billing: BillingService,
    private readonly repo: BillingRepository,
  ) {}

  @Get()
  async list(@Query(zod(adminPaymentListQuerySchema)) query: AdminPaymentListQuery) {
    const { rows, total } = await this.repo.paginateForAdmin(query);
    return { data: rows.map(toAdminPaymentDto), meta: { page: query.page, perPage: query.perPage, total } };
  }

  @Post(':id/confirm')
  @HttpCode(200)
  async confirm(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.billing.confirm(auth.userId, id) };
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(paymentRejectSchema)) body: PaymentRejectInput,
  ) {
    return { data: await this.billing.reject(auth.userId, id, body.reason) };
  }
}
