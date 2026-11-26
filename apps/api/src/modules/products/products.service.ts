import { Injectable } from '@nestjs/common';
import {
  allocateFefo,
  optionValuesKey,
  roundQuantity,
  presetOptionLists,
  productUpdateSchema,
  suggestVariantSku,
  todayIn,
  variantLabel,
  type BulkCostInput,
  type BatchAllocation,
  type CategoryDto,
  type OptionListDto,
  type OptionListInput,
  type OptionListUpdateInput,
  type ProductDto,
  type ProductInput,
  type ProductPriceDto,
  type ProductPriceOnDto,
  type ProductUpdateInput,
  type Unit,
  type VariantInput,
} from '@ph/shared';
import { ZodError } from 'zod';
import type { AuthContext } from '../../common/auth';
import type { Tx } from '../../common/prisma.service';
import { BatchesRepository } from './batches.repository';
import { CategoriesRepository } from './categories.repository';
import { ProductPricesRepository } from './product-prices.repository';
import { ProductSearch } from './product-search';
import { ProductsImportService, type ImportProduct, type ImportProductRef } from './products-import.service';

export { importLineKey, importProductKey, type ImportProduct, type ImportProductRef } from './products-import.service';
import { OptionListsRepository } from './option-lists.repository';
import { CategoryError, OptionListError, ProductError } from './products.errors';
import { productOptions, toProductDto } from './products.presenter';
import { ProductsRepository, type ProductListFilters, type ProductRow } from './products.repository';
import { VariantsRepository, type VariantRow, type VariantWithProduct, type VariantWrite } from './variants.repository';

/** The facts Orders needs about the variant on a line, priced as on the order date. */
export interface VariantForOrder {
  variantId: string;
  productId: string;
  productName: string;
  /** "M / Red"; null for a plain product. */
  variantLabel: string | null;
  sku: string;
  unit: Unit;
  archived: boolean;
  sellingPrice: number;
  costPrice: number;
  /** Stock in expired batches, and stock that can still be sold (stock − expired). */
  expiredStock: number;
  freshStock: number;
}

type Option = { name: string; values: string[] };

/** Option values as the option spells them ("red" → "Red"), so labels and matching stay consistent. */
function canonical(optionValues: Record<string, string>, options: Option[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of options) {
    const given = optionValues[o.name];
    if (given === undefined) continue;
    out[o.name] = o.values.find((v) => v.toLowerCase() === given.toLowerCase()) ?? given;
  }
  return out;
}

const firstActive = <T extends VariantRow>(variants: T[]): T => variants.find((v) => v.status === 'active') ?? variants[0];

/** A variant to write, with the id of the stored variant it replaces (if any). */
type PlannedVariant = VariantWrite & { id?: string; index: number };

/**
 * Product rules, and the public surface of the Products module: Orders calls
 * variantsForOrder() and moveStock(), never a repository
 * (laravel-patterns: domain-no-cross-domain-models).
 *
 * Every product has at least one variant (what is sold and counted). A plain product has one
 * with no option values. The product row keeps a summary (price and cost of the first active
 * variant, stock summed), refreshed in the same transaction as any variant write.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly repo: ProductsRepository,
    private readonly variants: VariantsRepository,
    private readonly categories: CategoriesRepository,
    private readonly optionLists: OptionListsRepository,
    private readonly prices: ProductPricesRepository,
    private readonly search: ProductSearch,
    private readonly importer: ProductsImportService,
    private readonly batches: BatchesRepository,
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
        return { data: await this.withVariants(businessId, rows, filters.today), total: hits.found };
      }
    }
    const ids = q ? await this.search.ids(businessId, q, { status }) : null;
    const { rows, total } = await this.repo.paginate(businessId, ids ? { ...filters, ids } : filters);
    return { data: await this.withVariants(businessId, rows, filters.today), total };
  }

  private async withVariants(businessId: string, rows: ProductRow[], today = todayIn()): Promise<ProductDto[]> {
    const ids = rows.map((r) => r.id);
    const [variants, expired] = await Promise.all([
      this.variants.forProducts(businessId, ids),
      this.batches.expiredByVariant(businessId, ids, today),
    ]);
    const byProduct = new Map<string, VariantRow[]>();
    for (const v of variants) byProduct.set(v.productId, [...(byProduct.get(v.productId) ?? []), v]);
    return rows.map((r) => toProductDto(r, byProduct.get(r.id) ?? [], expired));
  }

  async show(businessId: string, productId: string, today = todayIn()): Promise<ProductDto & { pastOrderCount: number }> {
    const [row, variants, pastOrderCount, expired] = await Promise.all([
      this.repo.findRow(businessId, productId),
      this.variants.forProducts(businessId, [productId]),
      this.repo.countOrdersWithProduct(businessId, productId),
      this.batches.expiredByVariant(businessId, [productId], today),
    ]);
    if (!row) throw ProductError.notFound();
    return { ...toProductDto(row, variants, expired), pastOrderCount };
  }

  /**
   * A plain product's variant takes the product's SKU (the next PRD- number when none is given);
   * a variant of a product with options takes its own SKU or one suggested from the product's
   * (KUR-XL-RED). Each variant's price history starts today, in the business's timezone.
   */
  async create(auth: AuthContext, input: ProductInput): Promise<ProductDto> {
    const { businessId } = auth;
    await this.assertCategory(businessId, input.categoryId);
    const sku = input.sku ?? (await this.repo.nextSku(businessId));
    const planned = this.plan(input.variants, input.options, sku, [], input.tracksBatches);
    await this.assertSkus(businessId, sku, input.options.length === 0, planned, [], undefined);
    const summary = this.summary(planned);

    const id = await this.repo.transaction(async (tx) => {
      const product = await this.repo.create(
        businessId,
        {
          name: input.name,
          sku,
          categoryId: input.categoryId ?? null,
          unit: input.unit,
          brand: input.brand ?? null,
          description: input.description ?? null,
          attributes: input.attributes,
          options: input.options,
          status: input.status,
          tracksBatches: input.tracksBatches,
          ...summary,
        },
        tx,
      );
      const ids = await this.variants.createMany(businessId, product.id, planned.map(this.toWrite), tx);
      const today = todayIn(auth.timezone);
      await this.prices.recordMany(
        businessId,
        planned.map((v, i) => ({
          productId: product.id,
          variantId: ids[i],
          sellingPrice: v.sellingPrice,
          costPrice: v.costPrice,
          effectiveFrom: today,
        })),
        auth.userId,
        tx,
      );
      return product.id;
    });
    await this.search.index(businessId, [id]);
    return this.show(businessId, id);
  }

  /**
   * A new selling price or cost applies from today on: it is added to that variant's price history
   * and past orders keep the price they were made at. Several changes on one day keep the last.
   *
   * With `variants`: a variant with an id is updated, one without is created (or matched to a stored
   * one with the same option values); a stored variant left out is archived when an order uses it,
   * deleted otherwise. The legacy `sellingPrice / costPrice / stock` fields update a plain product's
   * only variant; on a product with several variants they are refused (`variant_required`).
   */
  async update(auth: AuthContext, productId: string, input: ProductUpdateInput): Promise<ProductDto> {
    const { businessId } = auth;
    const current = await this.repo.findRow(businessId, productId);
    if (!current) throw ProductError.notFound();
    await this.assertCategory(businessId, input.categoryId);
    const stored = await this.variants.forProducts(businessId, [productId]);
    const options = input.options ?? productOptions(current);
    const unit = (input.unit ?? current.unit) as Unit;
    const sku = input.sku ?? current.sku;
    const plain = options.length === 0;

    const incoming = this.incomingVariants(current, stored, options, input);
    if (incoming) productUpdateSchema.parse({ options, unit, variants: incoming });
    else if (input.unit && stored.some((v) => !Number.isInteger(v.stock))) {
      productUpdateSchema.parse({ unit, variants: stored });
    }

    const planned = incoming ? this.plan(incoming, options, sku, stored, input.tracksBatches ?? current.tracksBatches) : null;
    const kept = new Set(planned?.flatMap((v) => (v.id ? [v.id] : [])) ?? stored.map((v) => v.id));
    const dropped = stored.filter((v) => !kept.has(v.id));
    if (planned) await this.assertSkus(businessId, sku, plain, planned, dropped, productId);
    else if (input.sku) await this.assertSkus(businessId, sku, plain, [], [], productId);

    await this.repo.transaction(async (tx) => {
      const withOrders = await this.variants.withOrders(
        dropped.map((v) => v.id),
        tx,
      );
      await this.variants.deleteMany(
        dropped.filter((v) => !withOrders.has(v.id)).map((v) => v.id),
        tx,
      );
      await this.variants.archive(
        dropped.filter((v) => withOrders.has(v.id) && v.status !== 'archived').map((v) => v.id),
        tx,
      );
      if (planned) await this.applyVariants(auth, productId, planned, stored, tx);

      await this.repo.update(
        productId,
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.sku ? { sku: input.sku } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.unit ? { unit: input.unit } : {}),
          ...(input.brand !== undefined ? { brand: input.brand } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.attributes ? { attributes: input.attributes } : {}),
          ...(input.options ? { options: input.options } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.tracksBatches !== undefined ? { tracksBatches: input.tracksBatches } : {}),
        },
        tx,
      );
      await this.variants.refreshProductSummary([productId], tx);
    });
    if (input.name !== undefined || input.sku || input.status !== undefined) await this.search.index(businessId, [productId]);
    return this.show(businessId, productId);
  }

  /** The variants an update writes: as sent, or the plain product's one variant with the legacy fields applied. */
  private incomingVariants(current: ProductRow, stored: VariantRow[], options: Option[], input: ProductUpdateInput): VariantInput[] | null {
    if (input.variants) return input.variants;
    if (input.options) {
      throw new ZodError([{ code: 'custom', path: ['variants'], message: 'Send the variants with the options' }]);
    }
    const legacy = (['sellingPrice', 'costPrice', 'stock'] as const).find((k) => input[k] !== undefined);
    const only = stored.filter((v) => v.status === 'active');
    if (!legacy) {
      // A plain product's variant carries the product SKU.
      if (input.sku && options.length === 0 && only.length === 1) return [{ ...only[0], sku: null, status: 'active' }];
      return null;
    }
    if (options.length > 0 || only.length !== 1) throw ProductError.variantRequired(current.name, legacy);
    const v = only[0];
    return [
      {
        id: v.id,
        optionValues: {},
        sku: null,
        sellingPrice: input.sellingPrice ?? v.sellingPrice,
        costPrice: input.costPrice ?? v.costPrice,
        stock: input.stock ?? v.stock,
        status: 'active',
      },
    ];
  }

  /**
   * Matches each incoming variant to a stored one (by id, else by option values) and fills its SKU. A product
   * that tracks batches keeps its stored stock (new variants start at 0): only Receive stock, orders and
   * Clear stock change it, so a form saved with an old number can't overwrite it.
   */
  private plan(incoming: VariantInput[], options: Option[], productSku: string, stored: VariantRow[], tracked = false): PlannedVariant[] {
    const byId = new Map(stored.map((v) => [v.id, v]));
    const byKey = new Map(stored.map((v) => [optionValuesKey(v.optionValues), v]));
    const plain = options.length === 0;
    return incoming.map((v, index) => {
      const optionValues = canonical(v.optionValues, options);
      const existing = v.id ? byId.get(v.id) : byKey.get(optionValuesKey(optionValues));
      if (v.id && !existing) throw ProductError.variantNotFound();
      return {
        id: existing?.id,
        index,
        optionValues,
        position: index,
        sku: plain ? productSku : (v.sku ?? existing?.sku ?? suggestVariantSku(productSku, optionValues, options)),
        sellingPrice: v.sellingPrice,
        costPrice: v.costPrice,
        stock: tracked ? (existing?.stock ?? 0) : v.stock,
        status: v.status,
      };
    });
  }

  private toWrite = ({ id: _id, index: _index, ...write }: PlannedVariant): VariantWrite => write;

  /** Updates and creates the planned variants; a changed price or cost, or a new variant, gets a price row from today. */
  private async applyVariants(
    auth: AuthContext,
    productId: string,
    planned: PlannedVariant[],
    stored: VariantRow[],
    tx: Tx,
  ): Promise<void> {
    const byId = new Map(stored.map((v) => [v.id, v]));
    const today = todayIn(auth.timezone);
    for (const v of planned.filter((p) => p.id)) {
      const before = byId.get(v.id!)!;
      await this.variants.update(v.id!, this.toWrite(v), tx);
      if (before.sellingPrice !== v.sellingPrice || before.costPrice !== v.costPrice) {
        const point = { sellingPrice: v.sellingPrice, costPrice: v.costPrice };
        await this.prices.record(auth.businessId, productId, v.id!, point, today, auth.userId, tx);
      }
    }
    const fresh = planned.filter((p) => !p.id);
    const ids = await this.variants.createMany(auth.businessId, productId, fresh.map(this.toWrite), tx);
    await this.prices.recordMany(
      auth.businessId,
      fresh.map((v, i) => ({ productId, variantId: ids[i], sellingPrice: v.sellingPrice, costPrice: v.costPrice, effectiveFrom: today })),
      auth.userId,
      tx,
    );
  }

  /** Product summary of planned variants: first active variant's price and cost, stock summed over active ones. */
  private summary(planned: PlannedVariant[]): { sellingPrice: number; costPrice: number; stock: number } {
    const active = planned.filter((v) => v.status === 'active');
    const first = active[0] ?? planned[0];
    return { sellingPrice: first.sellingPrice, costPrice: first.costPrice, stock: active.reduce((s, v) => s + v.stock, 0) };
  }

  /**
   * SKUs are unique per business across products and variants. A plain product's variant shares its
   * product's SKU; any other clash is refused on the field that holds it.
   */
  private async assertSkus(
    businessId: string,
    productSku: string,
    plain: boolean,
    planned: PlannedVariant[],
    dropped: VariantRow[],
    productId: string | undefined,
  ): Promise<void> {
    // A dropped variant that an order uses is archived and keeps its SKU; one without orders is deleted first, freeing it.
    const withOrders = await this.variants.withOrders(dropped.map((v) => v.id));
    const archivedKept = new Set(dropped.filter((v) => withOrders.has(v.id)).map((v) => v.sku));
    const seen = new Map<string, number>();
    if (!plain) {
      for (const v of planned) {
        if (seen.has(v.sku) || v.sku === productSku || archivedKept.has(v.sku)) {
          throw ProductError.variantSkuTaken(v.sku, `variants.${v.index}.sku`);
        }
        seen.set(v.sku, v.index);
      }
    }
    const taken = await this.variants.skusTaken(businessId, [productSku, ...seen.keys()], productId);
    if (taken.has(productSku)) throw ProductError.skuTaken(productSku);
    for (const [sku, index] of seen) if (taken.has(sku)) throw ProductError.variantSkuTaken(sku, `variants.${index}.sku`);
  }

  /**
   * FR-IMP-11: fill several missing costs at once. Like any cost change, it applies from today on.
   * A plain product's variant takes the cost; on a product with several variants, every active
   * variant whose cost is 0 does.
   */
  async bulkCost(auth: AuthContext, input: BulkCostInput): Promise<{ productsUpdated: number }> {
    const ids = [...new Set(input.items.map((i) => i.productId))];
    const rows = await this.repo.findManyByIds(auth.businessId, ids);
    if (rows.length !== ids.length) throw ProductError.notFound();
    const variants = await this.variants.forProducts(auth.businessId, ids);
    const today = todayIn(auth.timezone);

    await this.repo.transaction(async (tx) => {
      for (const item of input.items) {
        const active = variants.filter((v) => v.productId === item.productId && v.status === 'active');
        const targets = active.length === 1 ? active : active.filter((v) => v.costPrice === 0);
        for (const v of targets) {
          await this.variants.update(v.id, { costPrice: item.costPrice }, tx);
          const point = { sellingPrice: v.sellingPrice, costPrice: item.costPrice };
          await this.prices.record(auth.businessId, item.productId, v.id, point, today, auth.userId, tx);
        }
      }
      await this.variants.refreshProductSummary(ids, tx);
    });
    return { productsUpdated: input.items.length };
  }

  async priceHistory(businessId: string, productId: string): Promise<ProductPriceDto[]> {
    const row = await this.repo.findRow(businessId, productId);
    if (!row) throw ProductError.notFound();
    const options = productOptions(row);
    const history = await this.prices.history(businessId, productId);
    return history.map((h) => ({
      variantId: h.variantId,
      variantLabel: variantLabel(h.optionValues, options),
      sellingPrice: h.sellingPrice,
      costPrice: h.costPrice,
      effectiveFrom: h.effectiveFrom,
      changedAt: h.changedAt.toISOString(),
    }));
  }

  /**
   * Price and cost each variant had on `date`, for the order form's backdated orders. A product id
   * (the older `ids=` query) stands for that product's first variant.
   */
  async pricesOn(businessId: string, refs: { variantIds: string[]; productIds: string[] }, date: string): Promise<ProductPriceOnDto[]> {
    const rows = await this.variants.withProducts(businessId, refs.variantIds, refs.productIds);
    const wanted = new Set(refs.variantIds);
    const chosen: VariantWithProduct[] = rows.filter((v) => wanted.has(v.id));
    for (const productId of refs.productIds) {
      const first = firstActive(rows.filter((v) => v.productId === productId));
      if (first && !wanted.has(first.id)) chosen.push(first);
    }
    const prices = await this.prices.on(
      businessId,
      chosen.map((v) => v.id),
      date,
    );
    return chosen.flatMap((v) => {
      const p = prices.get(v.id);
      return p ? [{ variantId: v.id, productId: v.productId, sellingPrice: p.sellingPrice, costPrice: p.costPrice }] : [];
    });
  }

  // ── Public surface for Orders ────────────────────────────────────────

  /**
   * The variant on each order line, priced as on `orderDate` (from its price history), in input
   * order. A `productId` stands for a plain product's only variant; a product with options needs a
   * `variantId` (422 `variant_required` on `items.<i>.variantId`). A missing or foreign id is a 404.
   */
  async variantsForOrder(
    businessId: string,
    refs: ReadonlyArray<{ variantId?: string; productId?: string }>,
    orderDate: string,
    db: Tx,
    today = todayIn(),
  ): Promise<VariantForOrder[]> {
    const variantIds = [...new Set(refs.flatMap((r) => (r.variantId ? [r.variantId] : [])))];
    const productIds = [...new Set(refs.flatMap((r) => (r.productId ? [r.productId] : [])))];
    const rows = await this.variants.withProducts(businessId, variantIds, productIds, db);
    const byId = new Map(rows.map((v) => [v.id, v]));

    const chosen = refs.map((ref, i) => {
      if (ref.variantId) {
        const v = byId.get(ref.variantId);
        if (!v) throw ProductError.notFound();
        return v;
      }
      const all = rows.filter((v) => v.productId === ref.productId);
      if (all.length === 0) throw ProductError.notFound();
      if (all[0].options.length > 0 || all.length > 1) throw ProductError.variantRequired(all[0].productName, `items.${i}.variantId`);
      return all[0];
    });
    const [prices, expired] = await Promise.all([
      this.prices.on(businessId, [...new Set(chosen.map((v) => v.id))], orderDate, db),
      this.batches.expiredByVariant(businessId, [...new Set(chosen.map((v) => v.productId))], today),
    ]);
    return chosen.map((v) => {
      const dated = prices.get(v.id) ?? v; // no history row yet: today's price
      const expiredStock = expired.get(v.id)?.quantity ?? 0;
      return {
        expiredStock,
        freshStock: roundQuantity(v.stock - expiredStock),
        variantId: v.id,
        productId: v.productId,
        productName: v.productName,
        variantLabel: variantLabel(v.optionValues, v.options) || null,
        sku: v.sku,
        unit: v.unit as Unit,
        archived: v.productStatus === 'archived' || v.status === 'archived',
        sellingPrice: dated.sellingPrice,
        costPrice: dated.costPrice,
      };
    });
  }

  /**
   * Takes each line's stock off the shelf (FR-PROD-07: may go negative). A variant with batches gives
   * its stock first-expiry-first from fresh batches only (`allocateFefo`); what they can't cover is
   * `unallocated`. Batches are locked in id order. Returns each line's allocations, in input order.
   */
  async takeStock(
    businessId: string,
    lines: ReadonlyArray<{ variantId: string; quantity: number }>,
    today: string,
    tx: Tx,
  ): Promise<Array<{ allocations: BatchAllocation[]; unallocated: number }>> {
    const batches = await this.batches.lockForVariants(businessId, [...new Set(lines.map((l) => l.variantId))], tx);
    const left = new Map(batches.map((b) => [b.id, b.quantity]));
    const deltas = new Map<string, number>();
    const result = lines.map((line) => {
      const mine = batches.filter((b) => b.variantId === line.variantId).map((b) => ({ ...b, quantity: left.get(b.id) ?? 0 }));
      if (mine.length === 0) return { allocations: [], unallocated: line.quantity };
      const { allocations, unallocated } = allocateFefo(mine, line.quantity, today);
      for (const a of allocations) {
        left.set(a.batchId, roundQuantity((left.get(a.batchId) ?? 0) - a.quantity));
        deltas.set(a.batchId, (deltas.get(a.batchId) ?? 0) - a.quantity);
      }
      const byId = new Map(mine.map((b) => [b.id, b]));
      return {
        unallocated,
        allocations: allocations.map((a) => ({ ...a, batchNo: byId.get(a.batchId)!.batchNo, expiresOn: byId.get(a.batchId)!.expiresOn })),
      };
    });
    await this.batches.adjust(deltas, tx);
    await this.moveStock(lines, -1, tx);
    return result;
  }

  /** Puts lines' stock back, each batch quantity into the batch it came from. */
  async returnStock(lines: ReadonlyArray<{ variantId: string; quantity: number; batchAllocations: unknown }>, tx: Tx): Promise<void> {
    const deltas = new Map<string, number>();
    for (const line of lines) {
      const allocations = Array.isArray(line.batchAllocations) ? (line.batchAllocations as BatchAllocation[]) : [];
      for (const a of allocations) deltas.set(a.batchId, (deltas.get(a.batchId) ?? 0) + a.quantity);
    }
    await this.batches.adjust(deltas, tx);
    await this.moveStock(lines, +1, tx);
  }

  /** direction -1 takes stock off the shelf, +1 puts it back. Stock may go negative (FR-PROD-07). */
  async moveStock(lines: ReadonlyArray<{ variantId: string; quantity: number }>, direction: 1 | -1, db: Tx): Promise<void> {
    const deltas = new Map<string, number>();
    for (const line of lines) deltas.set(line.variantId, (deltas.get(line.variantId) ?? 0) + direction * line.quantity);
    const productIds = await this.variants.adjustStock(deltas, db);
    await this.variants.refreshProductSummary(productIds, db);
  }

  // ── Public surface for Imports ───────────────────────────────────────

  /** See ProductsImportService.resolve: each line's variant by importLineKey(), created where missing. */
  resolveForImport(
    businessId: string,
    refs: ReadonlyArray<ImportProductRef>,
    importId: string,
    createdById: string | null,
    defaultUnit: Unit,
    db: Tx,
  ): Promise<{ products: Map<string, ImportProduct>; createdIds: string[] }> {
    return this.importer.resolve(businessId, refs, importId, createdById, defaultUnit, db);
  }

  /** The unit of each existing product these lines name, by importProductKey(), for the whole-number check. */
  unitsForImport(businessId: string, refs: ReadonlyArray<{ sku: string | null; name: string }>, db: Tx): Promise<Map<string, Unit>> {
    return this.importer.unitsFor(businessId, refs, db);
  }

  /**
   * FR-IMP-12: deletes what this import created that no order line uses (run after its orders are gone):
   * its products (variants and price rows cascade) and the variants it added to other products.
   * Returns the deleted product ids, to pass to syncSearch after the commit.
   */
  deleteUnusedFromImport(businessId: string, importId: string, db: Tx): Promise<string[]> {
    return this.importer.deleteUnused(businessId, importId, db);
  }

  /**
   * After a write outside this module's own methods (an import or its undo) commits: sync these
   * products of the business to search. Call only after the transaction commits; ids missing from
   * Postgres are removed from the index. Never throws.
   */
  syncSearch(businessId: string, productIds: string[]): Promise<void> {
    return this.search.index(businessId, productIds);
  }

  // ── Saved option lists ───────────────────────────────────────────────

  /** At registration, in its transaction: the preset lists for the business type (none for Other or unknown). */
  seedOptionLists(businessId: string, businessType: string | null, db: Tx): Promise<void> {
    return this.optionLists.seed(businessId, presetOptionLists(businessType), db);
  }

  async createOptionList(businessId: string, input: OptionListInput): Promise<OptionListDto> {
    if (await this.optionLists.nameTaken(businessId, input.name)) throw OptionListError.nameTaken(input.name);
    return this.optionLists.create(businessId, input);
  }

  async updateOptionList(businessId: string, id: string, input: OptionListUpdateInput): Promise<OptionListDto> {
    if (!(await this.optionLists.exists(businessId, id))) throw OptionListError.notFound();
    if (input.name && (await this.optionLists.nameTaken(businessId, input.name, id))) throw OptionListError.nameTaken(input.name);
    return this.optionLists.update(id, input);
  }

  async deleteOptionList(businessId: string, id: string): Promise<void> {
    if (!(await this.optionLists.exists(businessId, id))) throw OptionListError.notFound();
    await this.optionLists.delete(id);
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
