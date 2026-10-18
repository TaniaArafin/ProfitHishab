import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  bulkCostSchema,
  categorySchema,
  listQuerySchema,
  PRODUCT_STATUSES,
  productSchema,
  productUpdateSchema,
  type BulkCostInput,
  type ProductInput,
  type ProductUpdateInput,
} from '@ph/shared';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { isIsoDate } from '@ph/shared';
import { CategoriesRepository } from './categories.repository';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

const productListQuery = listQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  costMissing: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const pricesOnQuery = z.object({
  ids: z
    .string()
    .transform((v) => v.split(',').filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(100)),
  date: z.string().refine(isIsoDate, 'Use a date like 2026-09-30'),
});

@Controller()
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly repo: ProductsRepository,
    private readonly categoriesRepo: CategoriesRepository,
  ) {}

  @Get('products')
  async list(@Auth() auth: AuthContext, @Query(zod(productListQuery)) query: z.infer<typeof productListQuery>) {
    const { data, total } = await this.products.list(auth.businessId, query);
    return { data, meta: { page: query.page, perPage: query.perPage, total } };
  }

  /** The order form prices a backdated order with these. Declared before products/:id. */
  @Get('products/prices-on')
  async pricesOn(@Auth() auth: AuthContext, @Query(zod(pricesOnQuery)) query: z.infer<typeof pricesOnQuery>) {
    return { data: await this.products.pricesOn(auth.businessId, query.ids, query.date) };
  }

  @Get('products/missing-cost')
  async missingCost(@Auth() auth: AuthContext) {
    return { data: await this.repo.missingCost(auth.businessId) };
  }

  @Patch('products/bulk-cost')
  async bulkCost(@Auth() auth: AuthContext, @Body(zod(bulkCostSchema)) body: BulkCostInput) {
    return { data: await this.products.bulkCost(auth, body) };
  }

  @Post('products')
  async create(@Auth() auth: AuthContext, @Body(zod(productSchema)) body: ProductInput) {
    return { data: await this.products.create(auth, body) };
  }

  @Get('products/:id')
  async show(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.products.show(auth.businessId, id) };
  }

  @Get('products/:id/prices')
  async prices(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.products.priceHistory(auth.businessId, id) };
  }

  @Patch('products/:id')
  async update(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(productUpdateSchema)) body: ProductUpdateInput,
  ) {
    return { data: await this.products.update(auth, id, body) };
  }

  @Post('products/:id/archive')
  @HttpCode(200)
  async archive(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.products.update(auth, id, { status: 'archived' }) };
  }

  @Get('categories')
  async categories(@Auth() auth: AuthContext) {
    const rows = await this.categoriesRepo.all(auth.businessId);
    return { data: rows.map((c) => ({ id: c.id, name: c.name, productCount: c._count.products })) };
  }

  @Post('categories')
  async createCategory(@Auth() auth: AuthContext, @Body(zod(categorySchema)) body: { name: string }) {
    return { data: await this.products.createCategory(auth.businessId, body.name) };
  }

  @Patch('categories/:id')
  async renameCategory(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(categorySchema)) body: { name: string },
  ) {
    return { data: await this.products.renameCategory(auth.businessId, id, body.name) };
  }

  @Delete('categories/:id')
  @HttpCode(204)
  async deleteCategory(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.products.deleteCategory(auth.businessId, id);
  }
}
