import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { businessUpdateSchema, courierSchema, type BusinessUpdateInput, type CourierInput } from '@ph/shared';
import { Auth, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { toCourierDto } from './business.presenter';
import { BusinessError } from './business.errors';
import { BusinessRepository } from './business.repository';
import { BusinessService } from './business.service';
import { LOGO } from './logo.image';
import { LogoStore } from './logo.store';
import { LogoTooLargeInterceptor } from './logo-too-large.interceptor';

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
    private readonly logos: LogoStore,
  ) {}

  @Get('business')
  async show(@Auth() auth: AuthContext) {
    return { data: await this.business.profile(auth.businessId) };
  }

  @Patch('business')
  async update(@Auth() auth: AuthContext, @Body(zod(businessUpdateSchema)) body: BusinessUpdateInput) {
    return { data: await this.business.update(auth.businessId, body) };
  }

  /** FR-BIZ-01: PNG, JPG or WebP up to 2 MB (decided by content), stored as a 256 px WebP. */
  @Post('business/logo')
  @UseInterceptors(LogoTooLargeInterceptor, FileInterceptor('file', { limits: { fileSize: LOGO.maxBytes, files: 1, fields: 0, parts: 1 } }))
  async uploadLogo(
    @Auth() auth: AuthContext,
    @UploadedFile(new ParseFilePipe({ exceptionFactory: () => BusinessError.logoUnsupported() })) file: { buffer: Buffer },
  ) {
    return { data: await this.business.setLogo(auth.businessId, file.buffer) };
  }

  @Delete('business/logo')
  async removeLogo(@Auth() auth: AuthContext) {
    return { data: await this.business.removeLogo(auth.businessId) };
  }

  /** The session's own business logo only: there is no id to ask for another one. Headers on the file, so a 404 stays JSON. */
  @Get('business/logo')
  async logo(@Auth() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const webp = await this.logos.read(auth.businessId);
    if (!webp) throw BusinessError.logoNotFound();
    // Private: only this business's sessions may see it. The ?v= in logoUrl changes on every upload.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return new StreamableFile(webp, { type: 'image/webp' });
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
