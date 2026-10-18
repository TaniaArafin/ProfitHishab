import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  bulkStatusSchema,
  orderCreateSchema,
  orderListQuerySchema,
  orderStatusSchema,
  orderUpdateSchema,
  type BulkStatusInput,
  type OrderCreateInput,
  type OrderListQuery,
  type OrderStatus,
  type OrderUpdateInput,
} from '@ph/shared';
import { Auth, type AuthContext } from '../../common/auth';
import { RequestError } from '../../common/errors';
import { zod } from '../../common/zod.pipe';
import { toOrderListItem } from './orders.presenter';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,100}$/;

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly repo: OrdersRepository,
  ) {}

  @Get()
  async list(@Auth() auth: AuthContext, @Query(zod(orderListQuerySchema)) query: OrderListQuery) {
    const { rows, total } = await this.repo.paginate(auth.businessId, query);
    return { data: rows.map(toOrderListItem), meta: { page: query.page, perPage: query.perPage, total } };
  }

  @Get('status-counts')
  async statusCounts(@Auth() auth: AuthContext, @Query(zod(orderListQuerySchema)) query: OrderListQuery) {
    return { data: await this.repo.statusCounts(auth.businessId, query) };
  }

  @Post('bulk-status')
  @HttpCode(200)
  async bulkStatus(@Auth() auth: AuthContext, @Body(zod(bulkStatusSchema)) body: BulkStatusInput) {
    return { data: await this.orders.bulkStatus(auth, body) };
  }

  /** A retry with the same Idempotency-Key returns the first order instead of creating a second. */
  @Post()
  async create(
    @Auth() auth: AuthContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(zod(orderCreateSchema)) body: OrderCreateInput,
  ) {
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) throw RequestError.missingIdempotencyKey();
    return { data: await this.orders.create(auth, body, idempotencyKey) };
  }

  @Get(':id')
  async show(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.orders.show(auth.businessId, id) };
  }

  @Patch(':id')
  async update(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(zod(orderUpdateSchema)) body: OrderUpdateInput) {
    return { data: await this.orders.update(auth, id, body) };
  }

  @Post(':id/status')
  @HttpCode(200)
  async changeStatus(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(orderStatusSchema)) body: { status: OrderStatus },
  ) {
    return { data: await this.orders.changeStatus(auth, id, body.status) };
  }
}
