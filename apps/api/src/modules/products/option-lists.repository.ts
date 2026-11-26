import { Injectable } from '@nestjs/common';
import type { OptionListDto } from '@ph/shared';
import { PrismaService, type Tx } from '../../common/prisma.service';

const SELECT = { id: true, name: true, values: true } as const;
const toDto = (r: { id: string; name: string; values: unknown }): OptionListDto => ({
  id: r.id,
  name: r.name,
  values: Array.isArray(r.values) ? (r.values as string[]) : [],
});

/** All queries on option_lists. Names are unique per business, ignoring case. */
@Injectable()
export class OptionListsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async all(businessId: string): Promise<OptionListDto[]> {
    const rows = await this.prisma.optionList.findMany({ where: { businessId }, orderBy: { name: 'asc' }, select: SELECT });
    return rows.map(toDto);
  }

  async exists(businessId: string, id: string): Promise<boolean> {
    return (await this.prisma.optionList.findFirst({ where: { id, businessId }, select: { id: true } })) !== null;
  }

  async nameTaken(businessId: string, name: string, exceptId?: string): Promise<boolean> {
    const found = await this.prisma.optionList.findFirst({
      where: { businessId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    return found !== null;
  }

  async create(businessId: string, data: { name: string; values: string[] }): Promise<OptionListDto> {
    return toDto(await this.prisma.optionList.create({ data: { ...data, businessId }, select: SELECT }));
  }

  async update(id: string, data: { name?: string; values?: string[] }): Promise<OptionListDto> {
    return toDto(await this.prisma.optionList.update({ where: { id }, data, select: SELECT }));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.optionList.delete({ where: { id } });
  }

  /** Inserts the lists whose names the business does not have yet, in one statement. */
  async seed(businessId: string, lists: Array<{ name: string; values: string[] }>, db: Tx): Promise<void> {
    if (lists.length === 0) return;
    await db.optionList.createMany({ data: lists.map((l) => ({ ...l, businessId })), skipDuplicates: true });
  }
}
