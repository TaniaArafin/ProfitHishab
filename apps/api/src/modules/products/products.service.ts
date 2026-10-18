import { Injectable } from '@nestjs/common';
import { todayIn, type BulkCostInput, type CategoryDto, type ProductDto, type ProductInput, type ProductUpdateInput } from '@ph/shared';
import type { AuthContext } from '../../common/auth';
import type { Tx } from '../../common/prisma.service';
import { CategoriesRepository } from './categories.repository';
import { ProductPricesRepository, type PriceHistoryRow, type PricePoint } from './product-prices.repository';
import { ProductSearch } from './product-search';
import { CategoryError, ProductError } from './products.errors';
import { toProductDto } from './products.presenter';
import { ProductsRepository, type ProductListFilters } from './products.repository';

/** The facts Orders needs about a product to snapshot it onto an order line. */
export interface ProductForOrder {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  costPrice: number;
  archived: boolean;
}

/**
 * Product rules, and the public surface of the Products module: Orders calls
 * productsForOrder() and moveStock(), never ProductsRepository
 * (laravel-patterns: domain-no-cross-domain-models).
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly repo: ProductsRepository,
    private readonly categories: CategoriesRepository,
    private readonly prices: ProductPricesRepository,
    private readonly search: ProductSearch,
  ) {}

  /**
   * A search term goes to the search index. A plain search is paged by the index (fast at any size,
   * true total); with a category, missing-cost filter or sort, Postgres filters and pages the best
   * matches instead. Either way the rows themselves (prices, stock) come from Postgres.
   */
  async list(businessId: string, filters: ProductListFilters): Promise<{ data: ProductDto[]; total: number }> {
    const { q, status, page, perPage } = filters;
    if (q && !filters.categoryId && !filters.costMissing && !filters.sort) {
      const hits = await this.search.page(businessId, q, { status, page, perPage });
      if (hits) {
        if (hits.ids.length === 0) return { data: [], total: hits.found };
        const { rows } = await this.repo.paginate(businessId, { ...filters, ids: hits.ids, page: 1, perPage: hits.ids.length });
        return { data: rows.map(toProductDto), total: hits.found };
      }
    }
    const ids = q ? await this.search.ids(businessId, q, { status }) : null;
    const { rows, total } = await this.repo.paginate(businessId, ids ? { ...filters, ids } : filters);
    return { data: rows.map(toProductDto), total };
  }

  async show(businessId: string, productId: string): Promise<ProductDto & { pastOrderCount: number }> {
    const [row, pastOrderCount] = await Promise.all([
      this.repo.findRow(businessId, productId),
      this.repo.countOrdersWithProduct(businessId, productId),
    ]);
    if (!row) throw ProductError.notFound();
    return { ...toProductDto(row), pastOrderCount };
  }

  /** The first price-history row starts today, in the business's timezone. */
  async create(auth: AuthContext, input: ProductInput): Promise<ProductDto> {
    const { businessId } = auth;
    await this.assertCategory(businessId, input.categoryId);
    const sku = input.sku ?? (await this.repo.nextSku(businessId));
    await this.assertSkuFree(businessId, sku);
    const id = await this.repo.transaction(async (tx) => {
      const product = await this.repo.create(businessId, { ...input, sku, categoryId: input.categoryId ?? null }, tx);
      await this.recordPrice(auth, product.id, input, tx);
      return product.id;
    });
    await this.search.index([id]);
    return this.show(businessId, id);
  }

  /**
   * A new selling price or cost applies from today on: it is added to the price history and
   * past orders keep the price they were made at. Several changes on one day keep the last.
   */
  async update(auth: AuthContext, productId: string, input: ProductUpdateInput): Promise<ProductDto> {
    const { businessId } = auth;
    const current = await this.repo.findRow(businessId, productId);
    if (!current) throw ProductError.notFound();
    await this.assertCategory(businessId, input.categoryId);
    if (input.sku) await this.assertSkuFree(businessId, input.sku, productId);
    const { sku, ...rest } = input;
    const next: PricePoint = { sellingPrice: input.sellingPrice ?? current.sellingPrice, costPrice: input.costPrice ?? current.costPrice };
    const priceChanged = next.sellingPrice !== current.sellingPrice || next.costPrice !== current.costPrice;

    await this.repo.transaction(async (tx) => {
      await this.repo.update(productId, { ...rest, ...(sku ? { sku } : {}) }, tx);
      if (priceChanged) await this.recordPrice(auth, productId, next, tx);
    });
    if (input.name !== undefined || sku || input.status !== undefined) await this.search.index([productId]);
    return this.show(businessId, productId);
  }

  /** FR-IMP-11: fill several missing costs at once. Like any cost change, it applies from today on. */
  async bulkCost(auth: AuthContext, input: BulkCostInput): Promise<{ productsUpdated: number }> {
    const ids = [...new Set(input.items.map((i) => i.productId))];
    const rows = await this.repo.findManyByIds(auth.businessId, ids);
    if (rows.length !== ids.length) throw ProductError.notFound();
    const sellingPrice = new Map(rows.map((r) => [r.id, r.sellingPrice]));

    await this.repo.transaction(async (tx) => {
      for (const item of input.items) {
        await this.repo.update(item.productId, { costPrice: item.costPrice }, tx);
        await this.recordPrice(auth, item.productId, { sellingPrice: sellingPrice.get(item.productId)!, costPrice: item.costPrice }, tx);
      }
    });
    return { productsUpdated: input.items.length };
  }

  async priceHistory(businessId: string, productId: string): Promise<PriceHistoryRow[]> {
    if (!(await this.repo.findRow(businessId, productId))) throw ProductError.notFound();
    return this.prices.history(businessId, productId);
  }

  /** Price and cost each product had on `date`, for the order form's backdated orders. */
  async pricesOn(businessId: string, productIds: string[], date: string): Promise<Array<PricePoint & { productId: string }>> {
    const prices = await this.prices.on(businessId, productIds, date);
    return [...prices].map(([productId, p]) => ({ productId, ...p }));
  }

  private recordPrice(auth: AuthContext, productId: string, price: PricePoint, tx: Tx): Promise<void> {
    const point = { sellingPrice: price.sellingPrice, costPrice: price.costPrice };
    return this.prices.record(auth.businessId, productId, point, todayIn(auth.timezone), auth.userId, tx);
  }

  // ── Public surface for Orders ────────────────────────────────────────

  /**
   * Products of this business by id, priced as they were on `orderDate` (from the price history).
   * Ids that are missing or belong to another business are absent.
   */
  async productsForOrder(businessId: string, ids: string[], orderDate: string, db: Tx): Promise<Map<string, ProductForOrder>> {
    const [rows, prices] = await Promise.all([
      this.repo.findManyByIds(businessId, ids, db),
      this.prices.on(businessId, ids, orderDate, db),
    ]);
    return new Map(
      rows.map((p) => {
        const dated = prices.get(p.id) ?? p; // no history row yet: today's price
        const forOrder = { id: p.id, name: p.name, sku: p.sku, archived: p.status === 'archived' };
        return [p.id, { ...forOrder, sellingPrice: dated.sellingPrice, costPrice: dated.costPrice }];
      }),
    );
  }

  /** direction -1 takes stock off the shelf, +1 puts it back. Stock may go negative (FR-PROD-07). */
  async moveStock(lines: ReadonlyArray<{ productId: string; quantity: number }>, direction: 1 | -1, db: Tx): Promise<void> {
    const deltas = new Map<string, number>();
    for (const line of lines) deltas.set(line.productId, (deltas.get(line.productId) ?? 0) + direction * line.quantity);
    await this.repo.adjustStock(deltas, db);
  }

  // ── Categories ───────────────────────────────────────────────────────

  async createCategory(businessId: string, name: string): Promise<CategoryDto> {
    if (await this.categories.nameExists(businessId, name)) throw CategoryError.nameTaken(name);
    const c = await this.categories.create(businessId, name);
    return { ...c, productCount: 0 };
  }

  async renameCategory(businessId: string, categoryId: string, name: string) {
    if (!(await this.categories.exists(businessId, categoryId))) throw CategoryError.notFound();
    if (await this.categories.nameExists(businessId, name, categoryId)) throw CategoryError.nameTaken(name);
    return this.categories.rename(categoryId, name);
  }

  async deleteCategory(businessId: string, categoryId: string): Promise<void> {
    if (!(await this.categories.exists(businessId, categoryId))) throw CategoryError.notFound();
    await this.categories.delete(categoryId);
  }

  private async assertCategory(businessId: string, categoryId?: string | null): Promise<void> {
    if (categoryId && !(await this.categories.exists(businessId, categoryId))) throw CategoryError.notFound();
  }

  private async assertSkuFree(businessId: string, sku: string, exceptId?: string): Promise<void> {
    if (await this.repo.skuExists(businessId, sku, exceptId)) throw ProductError.skuTaken(sku);
  }
}
