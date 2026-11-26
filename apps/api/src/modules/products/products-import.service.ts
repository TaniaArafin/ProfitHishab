import { Injectable } from '@nestjs/common';
import { optionValuesKey, suggestVariantSku, variantLabel, type Unit } from '@ph/shared';
import type { Tx } from '../../common/prisma.service';
import { ProductPricesRepository } from './product-prices.repository';
import { productOptions } from './products.presenter';
import { ProductsRepository } from './products.repository';
import { VariantsRepository, type VariantRow, type VariantWrite } from './variants.repository';

/** A product line as a spreadsheet row names it (FR-IMP-08). */
export interface ImportProductRef {
  sku: string | null;
  name: string;
  /** {Size: "M", Colour: "Red"}; {} for a plain line. */
  optionValues?: Record<string, string>;
  unit?: Unit | null;
  unitPrice: number;
  unitCost: number | null;
  orderDate: string;
}

/** The variant an import's lines use: its snapshot fields, current cost and cost on any day. */
export interface ImportProduct {
  id: string;
  variantId: string;
  name: string;
  variantLabel: string | null;
  sku: string;
  unit: Unit;
  costPrice: number;
  costOn: (date: string) => number;
}

type Option = { name: string; values: string[] };

const lower = (s: string) => s.trim().toLowerCase();
const hasOptions = (ref: { optionValues?: Record<string, string> }) => Object.keys(ref.optionValues ?? {}).length > 0;

/**
 * The match key of a spreadsheet product: `sku:<sku>`, or `name:<name>` when it has none, trimmed and
 * lower-cased. The prefixes keep SKU "hijab" and a product named "Hijab" apart.
 */
export function importProductKey(ref: { sku: string | null; name: string }): string {
  const sku = ref.sku?.trim();
  return sku ? `sku:${sku.toLowerCase()}` : `name:${lower(ref.name)}`;
}

/** The key of one line: the product's key plus its option values, so M / Red and L / Red differ. */
export function importLineKey(ref: { sku: string | null; name: string; optionValues?: Record<string, string> }): string {
  const options = optionValuesKey(ref.optionValues ?? {});
  return options ? `${importProductKey(ref)}|${options}` : importProductKey(ref);
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

/** Adds each line's option names and values to `options`, in first-seen order. */
function mergeOptions(options: Option[], lines: Array<Record<string, string>>): Option[] {
  const out = options.map((o) => ({ name: o.name, values: [...o.values] }));
  for (const values of lines) {
    for (const [name, value] of Object.entries(values)) {
      let option = out.find((o) => lower(o.name) === lower(name));
      if (!option) out.push((option = { name, values: [] }));
      if (!option.values.some((v) => lower(v) === lower(value))) option.values.push(value);
    }
  }
  return out;
}

/** Option values spelled as the product's options spell them; a missing option gets "Standard". */
function fitTo(options: Option[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of options) {
    const given = Object.entries(values).find(([k]) => lower(k) === lower(o.name))?.[1];
    out[o.name] = given === undefined ? 'Standard' : (o.values.find((v) => lower(v) === lower(given)) ?? given);
  }
  return out;
}

const sameNames = (options: Option[], values: Record<string, string>) => {
  const names = Object.keys(values).map(lower).sort();
  return (
    names.length === options.length &&
    options
      .map((o) => lower(o.name))
      .sort()
      .every((n, i) => n === names[i])
  );
};

interface Wanted {
  ref: ImportProductRef;
  unitCost: number | null;
  firstDate: string;
}

interface NewVariant extends VariantWrite {
  productId: string;
  lineKeys: string[];
  firstDate: string;
}

/**
 * Products for an import (FR-IMP-08), behind `ProductsService`. A fixed number of statements, whatever
 * the file's size.
 */
@Injectable()
export class ProductsImportService {
  constructor(
    private readonly repo: ProductsRepository,
    private readonly variants: VariantsRepository,
    private readonly prices: ProductPricesRepository,
  ) {}

  /** The unit of each existing product (or variant SKU) these lines name, by importProductKey(). */
  async unitsFor(businessId: string, refs: ReadonlyArray<{ sku: string | null; name: string }>, db: Tx): Promise<Map<string, Unit>> {
    const skus = [...new Set(refs.flatMap((r) => (r.sku?.trim() ? [lower(r.sku)] : [])))];
    const names = [...new Set(refs.map((r) => lower(r.name)).filter(Boolean))];
    const [products, variants] = await Promise.all([
      this.repo.findBySkusOrNames(businessId, skus, names, db),
      this.variants.bySkus(businessId, skus, db),
    ]);
    const units = new Map<string, Unit>();
    for (const v of variants) units.set(`sku:${lower(v.sku)}`, v.unit as Unit);
    for (const p of products) {
      if (!units.has(`sku:${lower(p.sku)}`)) units.set(`sku:${lower(p.sku)}`, p.unit as Unit);
      if (!units.has(`name:${lower(p.name)}`)) units.set(`name:${lower(p.name)}`, p.unit as Unit);
    }
    return units;
  }

  /**
   * Finds each line's variant and creates what is missing:
   * - a SKU that is a variant's SKU: that variant;
   * - else the product by SKU, then by exact name (trimmed, any case); on it, the variant with the
   *   same option values; a line without options, or whose option names differ from the product's,
   *   goes on its first active variant; a line with new values of the product's options gets a new
   *   variant (its values are added to the product's options);
   * - else a new product (the row's SKU or the next PRD- number), with the options its lines name and
   *   one variant per combination used, unit from the row or `defaultUnit`.
   * New variants take the first row's price and the first cost given (0 when none), tagged with the
   * import, with one price row from the earliest order date that uses them.
   * Returns each line's variant by importLineKey(), and the ids of the products created.
   */
  async resolve(
    businessId: string,
    refs: ReadonlyArray<ImportProductRef>,
    importId: string,
    createdById: string | null,
    defaultUnit: Unit,
    db: Tx,
  ): Promise<{ products: Map<string, ImportProduct>; createdIds: string[] }> {
    // One entry per line key, in first-seen order.
    const wanted = new Map<string, Wanted>();
    for (const ref of refs) {
      const key = importLineKey(ref);
      const seen = wanted.get(key);
      if (!seen)
        wanted.set(key, {
          ref: { ...ref, sku: ref.sku?.trim() || null, name: ref.name.trim() },
          unitCost: ref.unitCost,
          firstDate: ref.orderDate,
        });
      else {
        seen.unitCost ??= ref.unitCost;
        if (ref.orderDate < seen.firstDate) seen.firstDate = ref.orderDate;
      }
    }
    const entries = [...wanted.entries()];
    const skus = [...new Set(entries.flatMap(([, w]) => (w.ref.sku ? [lower(w.ref.sku)] : [])))];
    const names = [...new Set(entries.map(([, w]) => lower(w.ref.name)))];
    const [rows, skuVariants] = await Promise.all([
      this.repo.findBySkusOrNames(businessId, skus, names, db),
      this.variants.bySkus(businessId, skus, db),
    ]);
    const bySku = new Map<string, (typeof rows)[number]>();
    const byName = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      if (!bySku.has(lower(r.sku))) bySku.set(lower(r.sku), r);
      if (!byName.has(lower(r.name))) byName.set(lower(r.name), r);
    }
    const variantBySku = new Map(skuVariants.map((v) => [lower(v.sku), v]));

    const productIds = [...new Set([...rows.map((r) => r.id), ...skuVariants.map((v) => v.productId)])];
    const stored = await this.variants.forProducts(businessId, productIds, db);
    const storedByProduct = new Map<string, VariantRow[]>();
    for (const v of stored) storedByProduct.set(v.productId, [...(storedByProduct.get(v.productId) ?? []), v]);
    const storedById = new Map(stored.map((v) => [v.id, v]));
    const storedOf = (productId: string) => storedByProduct.get(productId) ?? [];
    const productById = new Map(rows.map((r) => [r.id, r]));
    for (const v of skuVariants) {
      if (!productById.has(v.productId)) {
        productById.set(v.productId, {
          id: v.productId,
          name: v.productName,
          sku: v.productSku,
          costPrice: v.costPrice,
          unit: v.unit,
          options: v.options,
        });
      }
    }

    // 1. Lines that land on an existing variant, or need a new variant on an existing product.
    const onVariant = new Map<string, VariantRow>();
    const extraOn = new Map<string, Array<{ key: string; w: Wanted }>>();
    const unmatched: Array<[string, Wanted]> = [];
    for (const [key, w] of entries) {
      const own = w.ref.sku ? variantBySku.get(lower(w.ref.sku)) : undefined;
      const productBySku = w.ref.sku ? bySku.get(lower(w.ref.sku)) : undefined;
      if (own && (hasOptions(w.ref) || !productBySku)) {
        onVariant.set(key, storedById.get(own.id)!);
        continue;
      }
      const product = productBySku ?? byName.get(lower(w.ref.name));
      if (!product) {
        unmatched.push([key, w]);
        continue;
      }
      const variants = storedOf(product.id);
      const options = productOptions(product);
      const first = variants.find((v) => v.status === 'active') ?? variants[0];
      if (!hasOptions(w.ref) || !sameNames(options, w.ref.optionValues!)) {
        onVariant.set(key, first);
        continue;
      }
      const wantedKey = optionValuesKey(fitTo(options, w.ref.optionValues!));
      const same = variants.find((v) => optionValuesKey(v.optionValues) === wantedKey);
      if (same) onVariant.set(key, same);
      else extraOn.set(product.id, [...(extraOn.get(product.id) ?? []), { key, w }]);
    }

    // 2. New products, grouped by product key; a name-only product reuses a new product of the same name.
    const fresh: Array<{ sku: string; name: string; unit: Unit; lines: Array<{ key: string; w: Wanted }> }> = [];
    const freshByKey = new Map<string, (typeof fresh)[number]>();
    const freshByName = new Map<string, (typeof fresh)[number]>();
    for (const [key, w] of unmatched.filter(([, w]) => w.ref.sku)) {
      const productKey = importProductKey(w.ref);
      const existing = freshByKey.get(productKey);
      if (existing) {
        existing.lines.push({ key, w });
        continue;
      }
      const product = { sku: w.ref.sku!.toUpperCase(), name: w.ref.name, unit: w.ref.unit ?? defaultUnit, lines: [{ key, w }] };
      fresh.push(product);
      freshByKey.set(productKey, product);
      if (!freshByName.has(lower(w.ref.name))) freshByName.set(lower(w.ref.name), product);
    }
    let lastSku = Math.max(
      await this.repo.maxGeneratedSku(businessId, db),
      ...fresh.map((f) => Number(GENERATED_SKU.exec(f.sku)?.[1] ?? 0)),
    );
    for (const [key, w] of unmatched.filter(([, w]) => !w.ref.sku)) {
      const same = freshByName.get(lower(w.ref.name));
      if (same) {
        same.lines.push({ key, w });
        continue;
      }
      lastSku += 1;
      const product = {
        sku: `PRD-${String(lastSku).padStart(4, '0')}`,
        name: w.ref.name,
        unit: w.ref.unit ?? defaultUnit,
        lines: [{ key, w }],
      };
      fresh.push(product);
      freshByName.set(lower(w.ref.name), product);
    }

    // 3. Options and variants of the new products, and new variants of existing products.
    const freshPlans = fresh.map((f) => {
      const options = mergeOptions(
        [],
        f.lines.flatMap(({ w }) => (hasOptions(w.ref) ? [w.ref.optionValues!] : [])),
      );
      return { ...f, options };
    });
    const inserted = await this.repo.createMany(
      businessId,
      freshPlans.map((f) => {
        const first = f.lines[0].w;
        return {
          name: f.name,
          sku: f.sku,
          sellingPrice: first.ref.unitPrice,
          costPrice: first.unitCost ?? 0,
          unit: f.unit,
          options: f.options,
          importId,
        };
      }),
      db,
    );
    const idBySku = new Map(inserted.map((p) => [p.sku, p.id]));

    const newVariants: NewVariant[] = [];
    const usedSkus = new Set<string>();
    const addVariant = (
      productId: string,
      productSku: string,
      options: Option[],
      lines: Array<{ key: string; w: Wanted }>,
      start: number,
    ) => {
      const byKey = new Map<string, NewVariant>();
      for (const { key, w } of lines) {
        const values = options.length === 0 ? {} : fitTo(options, w.ref.optionValues ?? {});
        const vKey = optionValuesKey(values);
        const existing = byKey.get(vKey);
        if (existing) {
          existing.lineKeys.push(key);
          if (w.firstDate < existing.firstDate) existing.firstDate = w.firstDate;
          if (existing.costPrice === 0 && w.unitCost) existing.costPrice = w.unitCost;
          continue;
        }
        const ownSku = hasOptions(w.ref) && w.ref.sku && lower(w.ref.sku) !== lower(productSku) ? w.ref.sku.toUpperCase() : null;
        const sku = options.length === 0 ? productSku : (ownSku ?? suggestVariantSku(productSku, values, options));
        const v: NewVariant = {
          productId,
          optionValues: values,
          position: start + byKey.size,
          sku,
          sellingPrice: w.ref.unitPrice,
          costPrice: w.unitCost ?? 0,
          stock: 0,
          status: 'active',
          importId,
          lineKeys: [key],
          firstDate: w.firstDate,
        };
        byKey.set(vKey, v);
        newVariants.push(v);
        usedSkus.add(sku);
      }
    };
    for (const f of freshPlans) addVariant(idBySku.get(f.sku)!, f.sku, f.options, f.lines, 0);
    const grownOptions: Array<{ id: string; options: Option[] }> = [];
    for (const [productId, lines] of extraOn) {
      const product = productById.get(productId)!;
      const options = mergeOptions(
        productOptions(product),
        lines.map(({ w }) => w.ref.optionValues!),
      );
      grownOptions.push({ id: productId, options });
      addVariant(productId, product.sku, options, lines, storedOf(productId).length);
    }

    // A suggested SKU already used elsewhere gets -2, -3…
    const taken = await this.variants.skusTaken(businessId, [...usedSkus], undefined, db);
    const seen = new Set<string>();
    const plainFresh = new Set(freshPlans.filter((f) => f.options.length === 0).map((f) => idBySku.get(f.sku)!));
    for (const v of newVariants) {
      if (plainFresh.has(v.productId)) {
        seen.add(v.sku);
        continue;
      }
      let sku = v.sku;
      for (let n = 2; taken.has(sku) || seen.has(sku); n += 1) sku = `${v.sku}-${n}`;
      v.sku = sku;
      seen.add(sku);
    }

    const created = await this.variants.createForProducts(
      businessId,
      newVariants.map(({ lineKeys: _k, firstDate: _d, ...v }) => v),
      db,
    );
    const createdId = new Map(created.map((c) => [`${c.productId}|${c.sku}`, c.id]));
    await this.variants.setOptions(grownOptions, db);
    await this.prices.recordMany(
      businessId,
      newVariants.map((v) => ({
        productId: v.productId,
        variantId: createdId.get(`${v.productId}|${v.sku}`)!,
        sellingPrice: v.sellingPrice,
        costPrice: v.costPrice,
        effectiveFrom: v.firstDate,
      })),
      createdById,
      db,
    );

    // 4. The answer: each line key's variant.
    const history = await this.prices.costHistory(businessId, [...new Set([...onVariant.values()].map((v) => v.id))], db);
    const products = new Map<string, ImportProduct>();
    for (const [key, v] of onVariant) {
      const p = productById.get(v.productId)!;
      products.set(key, {
        id: p.id,
        variantId: v.id,
        name: p.name,
        variantLabel: variantLabel(v.optionValues, productOptions(p)) || null,
        sku: v.sku,
        unit: p.unit as Unit,
        costPrice: v.costPrice,
        costOn: costOnFrom(history.get(v.id) ?? [], v.costPrice),
      });
    }
    const freshById = new Map(freshPlans.map((f) => [idBySku.get(f.sku)!, f]));
    const grownById = new Map(grownOptions.map((g) => [g.id, g.options]));
    for (const v of newVariants) {
      const fp = freshById.get(v.productId);
      const p = productById.get(v.productId);
      const options = fp?.options ?? grownById.get(v.productId) ?? [];
      const cost = v.costPrice;
      const product: ImportProduct = {
        id: v.productId,
        variantId: createdId.get(`${v.productId}|${v.sku}`)!,
        name: fp?.name ?? p!.name,
        variantLabel: variantLabel(v.optionValues, options) || null,
        sku: v.sku,
        unit: (fp?.unit ?? p!.unit) as Unit,
        costPrice: cost,
        costOn: () => cost,
      };
      for (const key of v.lineKeys) products.set(key, product);
    }
    return { products, createdIds: inserted.map((p) => p.id) };
  }

  /**
   * FR-IMP-12, after the import's orders are gone: deletes the products it created that no order line
   * uses (their variants and price rows cascade), and the variants it added to other products that no
   * order line uses. Returns the deleted product ids, for syncSearch after the commit.
   */
  async deleteUnused(businessId: string, importId: string, db: Tx): Promise<string[]> {
    const productIds = await this.repo.deleteUnusedFromImport(businessId, importId, db);
    const touched = await this.variants.deleteUnusedFromImport(businessId, importId, db);
    await this.variants.refreshProductSummary(touched, db);
    return productIds;
  }
}
