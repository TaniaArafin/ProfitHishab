import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../../common/prisma.service';

/** The column mapping a business last used for a file layout (see `headersKey`). */
@Injectable()
export class ImportMappingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The saved mapping JSON, or null when none. */
  async find(businessId: string, headersKey: string, db: Tx = this.prisma): Promise<unknown> {
    const row = await db.importMapping.findUnique({
      where: { businessId_headersKey: { businessId, headersKey } },
      select: { mapping: true },
    });
    return row?.mapping ?? null;
  }

  /** One row per business and header set: a second save replaces the mapping. */
  async save(businessId: string, headersKey: string, mapping: Prisma.InputJsonValue, db: Tx = this.prisma): Promise<void> {
    await db.importMapping.upsert({
      where: { businessId_headersKey: { businessId, headersKey } },
      create: { businessId, headersKey, mapping },
      update: { mapping },
    });
  }
}
