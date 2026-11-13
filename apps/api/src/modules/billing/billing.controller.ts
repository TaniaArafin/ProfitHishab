import { Body, Controller, Get, Post } from '@nestjs/common';
import { paymentSubmitSchema, type PaymentSubmitInput } from '@ph/shared';
import { AllowAfterTrial, Auth, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { BillingService } from './billing.service';

/** The seller's billing page. Allowed after the trial ends: paying is how a read-only seller gets back in. */
@Controller('billing')
@AllowAfterTrial()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  async show(@Auth() auth: AuthContext) {
    return { data: await this.billing.overview(auth) };
  }

  @Post('payments')
  async submit(@Auth() auth: AuthContext, @Body(zod(paymentSubmitSchema)) body: PaymentSubmitInput) {
    return { data: await this.billing.submit(auth, body) };
  }
}
