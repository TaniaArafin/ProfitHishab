import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  importListQuerySchema,
  importMappingSchema,
  importRowsQuerySchema,
  type ImportListQuery,
  type ImportMapping,
  type ImportRowsQuery,
} from '@ph/shared';
import { Auth, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { ImportFileTooLargeInterceptor } from './file-too-large.interceptor';
import { ImportError } from './imports.errors';
import { toImportListItemDto } from './imports.presenter';
import { ImportsRepository } from './imports.repository';
import { ImportsService, type UploadedSpreadsheet } from './imports.service';
import { buildTemplate } from './template';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Excel/CSV order import (SRS §8.2). The history list is a plain read (repository → presenter). */
@Controller('imports')
export class ImportsController {
  constructor(
    private readonly imports: ImportsService,
    private readonly repo: ImportsRepository,
  ) {}

  @Post()
  // The outer interceptor turns multer's size error into import_file_too_large. defParamCharset: browsers
  // send UTF-8 file names, which busboy would otherwise read as latin1 ("অর্ডার.csv" garbled). One file
  // and a handful of other parts: busboy would otherwise accept any number of them.
  @UseInterceptors(
    ImportFileTooLargeInterceptor,
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 5, parts: 10 }, defParamCharset: 'utf8' }),
  )
  async upload(
    @Auth() auth: AuthContext,
    @UploadedFile(new ParseFilePipe({ exceptionFactory: () => ImportError.fileMissing() })) file: UploadedSpreadsheet,
  ) {
    return { data: await this.imports.upload(auth, file) };
  }

  @Get()
  async list(@Auth() auth: AuthContext, @Query(zod(importListQuerySchema)) query: ImportListQuery) {
    const { rows, total } = await this.repo.paginate(auth.businessId, query);
    return { data: rows.map(toImportListItemDto), meta: { page: query.page, perPage: query.perPage, total } };
  }

  /** Declared before `:id` so "template.xlsx" is not taken for an id. */
  @Get('template.xlsx')
  @Header('Content-Type', XLSX_TYPE)
  @Header('Content-Disposition', 'attachment; filename="profithishab-orders-template.xlsx"')
  template(): StreamableFile {
    return new StreamableFile(buildTemplate());
  }

  @Get(':id')
  async show(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.imports.show(auth.businessId, id) };
  }

  @Put(':id/mapping')
  async saveMapping(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(importMappingSchema)) body: ImportMapping,
  ) {
    return { data: await this.imports.saveMapping(auth.businessId, id, body) };
  }

  @Post(':id/validate')
  @HttpCode(200)
  async validate(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.imports.validate(auth, id) };
  }

  @Post(':id/commit')
  @HttpCode(200)
  async commit(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.imports.commit(auth, id) };
  }

  @Post(':id/undo')
  @HttpCode(200)
  async undo(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.imports.undo(auth, id) };
  }

  @Get(':id/rows')
  async rows(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Query(zod(importRowsQuerySchema)) query: ImportRowsQuery) {
    const { rows, total } = await this.imports.rows(auth.businessId, id, query);
    return { data: rows, meta: { page: query.page, perPage: query.perPage, total } };
  }

  /** Headers go on the file itself, not @Header(), so a 404 stays a JSON error response. */
  @Get(':id/rejected.csv')
  async rejectedCsv(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    return new StreamableFile(Buffer.from(await this.imports.rejectedCsv(auth.businessId, id), 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="rejected-rows.csv"',
    });
  }
}
