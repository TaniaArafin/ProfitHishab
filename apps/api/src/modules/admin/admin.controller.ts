import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  adminAccessSchema,
  adminBlockSchema,
  adminBusinessListQuerySchema,
  type AdminAccessInput,
  type AdminBlockInput,
  type AdminBusinessListQuery,
} from '@ph/shared';
import { AllowAfterTrial, Auth, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { AdminGuard } from './admin.guard';
import { toAdminBusinessListItemDto } from './admin.presenter';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

/**
 * Internal panel for ProfitHishab staff (platform admins). Admin actions are not the admin's own
 * business's writes, so they keep working when that business's trial has ended.
 */
@Controller('admin')
@UseGuards(AdminGuard)
@AllowAfterTrial()
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly repo: AdminRepository,
  ) {}

  @Get('businesses')
  async list(@Query(zod(adminBusinessListQuerySchema)) query: AdminBusinessListQuery) {
    const now = new Date();
    const { rows, total } = await this.repo.paginateBusinesses(query, now);
    return { data: rows.map((r) => toAdminBusinessListItemDto(r, now)), meta: { page: query.page, perPage: query.perPage, total } };
  }

  @Get('businesses/:id')
  async show(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.admin.show(id) };
  }

  @Post('businesses/:id/access')
  @HttpCode(200)
  async setAccess(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(zod(adminAccessSchema)) body: AdminAccessInput) {
    return { data: await this.admin.setAccess(auth.userId, id, body) };
  }

  @Post('businesses/:id/block')
  @HttpCode(200)
  async block(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(zod(adminBlockSchema)) body: AdminBlockInput) {
    return { data: await this.admin.block(auth.userId, auth.businessId, id, body.reason) };
  }

  @Post('businesses/:id/unblock')
  @HttpCode(200)
  async unblock(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.admin.unblock(auth.userId, id) };
  }

  @Post('businesses/:id/reset-link')
  async resetLink(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.admin.resetLink(auth.userId, id) };
  }
}
