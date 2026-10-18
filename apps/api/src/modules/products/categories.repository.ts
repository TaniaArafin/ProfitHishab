import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  all(businessId: string) {
    return this.prisma.category.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, _count: { select: { products: true } } },
    });
  }

  async exists(businessId: string, categoryId: string): Promise<boolean> {
    return (await this.prisma.category.findFirst({ where: { id: categoryId, businessId }, select: { id: true } })) !== null;
  }

  async nameExists(businessId: string, name: string, exceptId?: string): Promise<boolean> {
    const found = await this.prisma.category.findFirst({
      where: { businessId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    return found !== null;
  }

  create(businessId: string, name: string) {
    return this.prisma.category.create({ data: { businessId, name }, select: { id: true, name: true } });
  }

  rename(categoryId: string, name: string) {
    return this.prisma.category.update({ where: { id: categoryId }, data: { name }, select: { id: true, name: true } });
  }

  /** Products of a deleted category become uncategorised (FK is ON DELETE SET NULL). */
  delete(categoryId: string) {
    return this.prisma.category.delete({ where: { id: categoryId } });
  }
}
