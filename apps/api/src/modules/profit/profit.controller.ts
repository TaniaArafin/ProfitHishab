import { Controller, Get, Query } from '@nestjs/common';
import { periodQuerySchema, resolvePeriod } from '@ph/shared';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { ProfitService } from './profit.service';

const productQuery = periodQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

type PeriodQuery = z.infer<typeof periodQuerySchema>;

@Controller('profit')
export class ProfitController {
  constructor(private readonly profit: ProfitService) {}

  @Get('summary')
  async summary(@Auth() auth: AuthContext, @Query(zod(periodQuerySchema)) query: PeriodQuery) {
    return { data: await this.profit.summary(auth.businessId, this.period(query, auth)) };
  }

  @Get('trend')
  async trend(@Auth() auth: AuthContext, @Query(zod(periodQuerySchema)) query: PeriodQuery) {
    return { data: await this.profit.trend(auth.businessId, this.period(query, auth)) };
  }

  @Get('insights')
  async insights(@Auth() auth: AuthContext, @Query(zod(periodQuerySchema)) query: PeriodQuery) {
    return { data: await this.profit.insights(auth.businessId, this.period(query, auth)) };
  }

  @Get('products')
  async products(@Auth() auth: AuthContext, @Query(zod(productQuery)) query: z.infer<typeof productQuery>) {
    return { data: await this.profit.products(auth.businessId, this.period(query, auth), query) };
  }

  private period(query: PeriodQuery, auth: AuthContext) {
    const { from, to } = resolvePeriod(query, auth.timezone);
    return { from, to };
  }
}
