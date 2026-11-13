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

/** A product as a spreadsheet line names it (FR-IMP-08). */
export interface ImportProductRef {
  sku: string | null;
  name: string;
  unitPrice: number;
  unitCost: number | null;
  orderDate: string;
}

/** A product an import's lines use: its snapshot fields, current cost and cost on any day. */
export interface ImportProduct {
  id: string;
  name: string;
  sku: string;
  costPrice: number;
  costOn: (date: string) => number;
}

/**
 * The match key of a spreadsheet product: `sku:<sku>`, or `name:<name>` when it has none, trimmed and
 * lower-cased. The prefixes keep SKU "hijab" and a product named "Hijab" apart.
 */
export function importProductKey(ref: { sku: string | null; name: string }): string {
  const sku = ref.sku?.trim();
  return sku ? `sku:${sku.toLowerCase()}` : `name:${ref.name.trim().toLowerCase()}`;
}

const GENERATED_SKU = /^PRD-(\d+)$/;

/** The cost in effect on `date` (same rule as ProductPricesRepository.on): the latest row on or before it, else the first. */
function costOnFrom(history: Array<{ effectiveFrom: string; costPrice: number }>, fallback: number) {
  return (date: string): number => {
    if (history.length === 0) return fallback;
    let cost = history[0].costPrice;
    for (const row of history) if (row.effectiveFrom <= date) cost = row.costPrice;
    return cost;
  };
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
    await this.search.index(businessId, [id]);
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
    if (input.name !== undefined || sku || input.status !== undefined) await this.search.index(businessId, [productId]);
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

  // ── Public surface for Imports ───────────────────────────────────────

  /**
   * FR-IMP-08: finds each spreadsheet product by SKU, then by exact name (trimmed, any case), and
   * creates the rest in one INSERT: the row's SKU or the next PRD- numbers, the first row's price,
   * the first cost given (0 when none), tagged with the import. Each new product gets one price row,
   * effective from the earliest order date that uses it. Fixed number of statements, whatever the size.
   * Returns the products by importProductKey(), and the ids created (to index after the transaction).
   */
  async resolveForImport(
    businessId: string,
    refs: ReadonlyArray<ImportProductRef>,
    importId: string,
    createdById: string | null,
    db: Tx,
  ): Promise<{ products: Map<string, ImportProduct>; createdIds: string[] }> {
    // One entry per key, in first-seen order.
    const wanted = new Map<string, { sku: string | null; name: string; unitPrice: number; unitCost: number | null; firstDate: string }>();
    for (const ref of refs) {
      const key = importProductKey(ref);
      const seen = wanted.get(key);
      if (!seen) {
        const sku = ref.sku?.trim() || null;
        wanted.set(key, { sku, name: ref.name.trim(), unitPrice: ref.unitPrice, unitCost: ref.unitCost, firstDate: ref.orderDate });
      } else {
        seen.unitCost ??= ref.unitCost;
        if (ref.orderDate < seen.firstDate) seen.firstDate = ref.orderDate;
      }
    }

    const lower = (s: string) => s.trim().toLowerCase();
    const entries = [...wanted.entries()];
    const skus = entries.flatMap(([, w]) => (w.sku ? [lower(w.sku)] : []));
    const names = entries.map(([, w]) => lower(w.name));
    const rows = await this.repo.findBySkusOrNames(businessId, skus, names, db);
    const bySku = new Map<string, (typeof rows)[number]>();
    const byName = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      if (!bySku.has(lower(r.sku))) bySku.set(lower(r.sku), r);
      if (!byName.has(lower(r.name))) byName.set(lower(r.name), r);
    }

    const matched = new Map<string, (typeof rows)[number]>();
    const unmatched: Array<[string, (typeof entries)[number][1]]> = [];
    for (const [key, w] of entries) {
      const found = (w.sku ? bySku.get(lower(w.sku)) : undefined) ?? byName.get(lower(w.name));
      if (found) matched.set(key, found);
      else unmatched.push([key, w]);
    }

    // New products: a SKU from the file is kept; a name-only line reuses a new product of the same
    // name, or gets the next PRD- number after any in use (in the business or in this file).
    const fresh: Array<{ keys: string[]; sku: string; w: (typeof entries)[number][1] }> = [];
    const freshByName = new Map<string, (typeof fresh)[number]>();
    for (const [key, w] of unmatched.filter(([, w]) => w.sku)) {
      const product = { keys: [key], sku: w.sku!.toUpperCase(), w };
      fresh.push(product);
      if (!freshByName.has(lower(w.name))) freshByName.set(lower(w.name), product);
    }
    let lastSku = Math.max(
      await this.repo.maxGeneratedSku(businessId, db),
      ...fresh.map((f) => Number(GENERATED_SKU.exec(f.sku)?.[1] ?? 0)),
    );
    for (const [key, w] of unmatched.filter(([, w]) => !w.sku)) {
      const same = freshByName.get(lower(w.name));
      if (same) {
        same.keys.push(key);
        same.w.unitCost ??= w.unitCost;
        if (w.firstDate < same.w.firstDate) same.w.firstDate = w.firstDate;
        continue;
      }
      lastSku += 1;
      fresh.push({ keys: [key], sku: `PRD-${String(lastSku).padStart(4, '0')}`, w });
    }

    const inserted = await this.repo.createMany(
      businessId,
      fresh.map((f) => ({ name: f.w.name, sku: f.sku, sellingPrice: f.w.unitPrice, costPrice: f.w.unitCost ?? 0, importId })),
      db,
    );
    const idBySku = new Map(inserted.map((p) => [p.sku, p.id]));
    await this.prices.recordMany(
      businessId,
      fresh.map((f) => ({
        productId: idBySku.get(f.sku)!,
        sellingPrice: f.w.unitPrice,
        costPrice: f.w.unitCost ?? 0,
        effectiveFrom: f.w.firstDate,
      })),
      createdById,
      db,
    );

    const history = await this.prices.costHistory(businessId, [...new Set([...matched.values()].map((p) => p.id))], db);
    const products = new Map<string, ImportProduct>();
    for (const [key, p] of matched) {
      products.set(key, {
        id: p.id,
        name: p.name,
        sku: p.sku,
        costPrice: p.costPrice,
        costOn: costOnFrom(history.get(p.id) ?? [], p.costPrice),
      });
    }
    for (const f of fresh) {
      const cost = f.w.unitCost ?? 0;
      const product = { id: idBySku.get(f.sku)!, name: f.w.name, sku: f.sku, costPrice: cost, costOn: () => cost };
      for (const key of f.keys) products.set(key, product);
    }
    return { products, createdIds: inserted.map((p) => p.id) };
  }

  /**
   * FR-IMP-12: deletes the products this import created that no order line uses (run after its orders
   * are gone); their price rows cascade. Returns the deleted ids, to pass to syncSearch after the commit.
   */
  deleteUnusedFromImport(businessId: string, importId: string, db: Tx): Promise<string[]> {
    return this.repo.deleteUnusedFromImport(businessId, importId, db);
  }

  /**
   * After a write outside this module's own methods (an import or its undo) commits: sync these
   * products of the business to search. Call only after the transaction commits; ids missing from
   * Postgres are removed from the index. Never throws.
   */
  syncSearch(businessId: string, productIds: string[]): Promise<void> {
    return this.search.index(businessId, productIds);
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
