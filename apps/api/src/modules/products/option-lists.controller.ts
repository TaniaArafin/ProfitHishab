import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { optionListSchema, optionListUpdateSchema, type OptionListInput, type OptionListUpdateInput } from '@ph/shared';
import { Auth, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { OptionListsRepository } from './option-lists.repository';
import { ProductsService } from './products.service';

/** Saved option lists (Settings → Product options); the product form copies one with "Use saved". */
@Controller('option-lists')
export class OptionListsController {
  constructor(
    private readonly products: ProductsService,
    private readonly repo: OptionListsRepository,
  ) {}

  @Get()
  async list(@Auth() auth: AuthContext) {
    return { data: await this.repo.all(auth.businessId) };
  }

  @Post()
  async create(@Auth() auth: AuthContext, @Body(zod(optionListSchema)) body: OptionListInput) {
    return { data: await this.products.createOptionList(auth.businessId, body) };
  }

  @Patch(':id')
  async update(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(optionListUpdateSchema)) body: OptionListUpdateInput,
  ) {
    return { data: await this.products.updateOptionList(auth.businessId, id, body) };
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.products.deleteOptionList(auth.businessId, id);
  }
}
