import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  importMappingSchema,
  todayIn,
  type ImportCommitResultDto,
  type ImportDto,
  type ImportMapping,
  type ImportRowDto,
  type ImportRowsQuery,
  type ImportStatus,
  type ImportUndoResultDto,
} from '@ph/shared';
import type { AuthContext } from '../../common/auth';
import { toCsv } from '../../common/csv';
import { BusinessService } from '../business/business.service';
import { CustomersService } from '../customers/customers.service';
import { OrdersService, type ImportedOrder } from '../orders/orders.service';
import { importProductKey, ProductsService, type ImportProduct } from '../products/products.service';
import { headersKey } from './headers-key';
import { ImportMappingsRepository } from './import-mappings.repository';
import { ImportError } from './imports.errors';
import { toImportDto, toImportRowDto, toRawCells, toRejectedCsvRow } from './imports.presenter';
import { ImportsRepository, type ImportRecord } from './imports.repository';
import { suggestColumns } from './rules/header-match';
import { groupOrders, type ImportOrderGroup } from './rules/orders-group';
import { dedupeHash, type NormalizedRow } from './rules/row-parse';
import { prepareRows, rowVerdicts } from './rules/row-verdicts';
import { suggestStatus } from './rules/status-match';
import { readSpreadsheet } from './spreadsheet';

const SAMPLE_ROWS = 5;
const MAPPABLE: ReadonlySet<ImportStatus> = new Set(['uploaded', 'mapped', 'validated']);
const VALIDATABLE: ReadonlySet<ImportStatus> = new Set(['mapped', 'validated']);

export interface UploadedSpreadsheet {
  buffer: Buffer;
  originalname: string;
}

/** A stored mapping JSON, or null when there is none or it no longer parses. */
function parseMapping(json: unknown): ImportMapping | null {
  if (json === null || json === undefined) return null;
  const parsed = importMappingSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** A Prisma unique-constraint error on a constraint that includes `field`. */
function isUniqueViolationOn(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  return Array.isArray(target) ? target.includes(field) : typeof target === 'string' && target.includes(field);
}

/**
 * A foreign-key violation (a row still referenced). Prisma reports P2003 for its own queries and
 * P2010 with Postgres code 23503 for raw SQL such as the undo deletes.
 */
function isForeignKeyViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === 'P2003' || (error.code === 'P2010' && error.meta?.code === '23503');
}

/** Targets whose mapped column is not one of the file's headers. */
function columnsNotIn(headers: string[], mapping: ImportMapping): Array<{ target: string; column: string }> {
  const present = new Set(headers);
  return Object.entries(mapping.columns)
    .filter(([, column]) => column !== undefined && !present.has(column))
    .map(([target, column]) => ({ target, column }));
}

/**
 * Order import, step by step: upload (parse the file, store its rows), map columns, then validate,
 * commit and undo (later tasks). Every write locks the import row first, scoped by businessId.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly repo: ImportsRepository,
    private readonly mappings: ImportMappingsRepository,
    private readonly business: BusinessService,
    private readonly orders: OrdersService,
    private readonly customers: CustomersService,
    private readonly products: ProductsService,
  ) {}

  /** Stores the file's rows as an `uploaded` import, or `mapped` when a saved mapping fits these headers (FR-IMP-03). */
  async upload(auth: AuthContext, file: UploadedSpreadsheet): Promise<ImportDto> {
    const { headers, rows } = await readSpreadsheet(file.buffer, file.originalname);
    const key = headersKey(headers);
    const saved = parseMapping(await this.mappings.find(auth.businessId, key));
    const reuse = saved && columnsNotIn(headers, saved).length === 0 ? saved : null;

    const id = await this.repo.transaction(async (tx) => {
      const created = await this.repo.create(
        auth.businessId,
        { fileName: file.originalname, headers, headersKey: key, createdById: auth.userId },
        rows,
        tx,
      );
      if (reuse) await this.repo.applyMapping(created, reuse, tx);
      return created;
    });
    return this.show(auth.businessId, id);
  }

  async show(businessId: string, id: string): Promise<ImportDto> {
    const imp = await this.repo.find(businessId, id);
    if (!imp) throw ImportError.notFound();
    return this.toDto(businessId, imp);
  }

  /**
   * Saves the mapping on the import and as the business's mapping for this header set. Re-mapping a
   * validated import throws its validation away: rows go back to pending and the counts to 0.
   */
  async saveMapping(businessId: string, id: string, input: ImportMapping): Promise<ImportDto> {
    await this.repo.transaction(async (tx) => {
      const locked = await this.repo.lockForUpdate(businessId, id, tx);
      if (!locked) throw ImportError.notFound();
      if (!MAPPABLE.has(locked.status)) throw ImportError.notReady();
      const imp = await this.repo.find(businessId, id, tx);
      if (!imp) throw ImportError.notFound();
      const missing = columnsNotIn(imp.headers, input);
      if (missing.length > 0) throw ImportError.columnsNotInFile(missing);

      if (locked.status === 'validated') await this.repo.resetRows(id, tx);
      await this.repo.applyMapping(id, input, tx);
      await this.mappings.save(businessId, imp.headersKey ?? headersKey(imp.headers), input, tx);
    });
    return this.show(businessId, id);
  }

  /**
   * Turns every row into valid, duplicate or invalid with reasons, groups rows into orders and marks
   * duplicates against the business's orders and earlier rows (FR-IMP-05–07). Reads, then one UPDATE
   * for all rows: no per-row queries. Re-validating overwrites every row's verdict.
   */
  async validate(auth: AuthContext, id: string): Promise<ImportDto> {
    const { businessId } = auth;
    await this.repo.transaction(async (tx) => {
      const locked = await this.repo.lockForUpdate(businessId, id, tx);
      if (!locked) throw ImportError.notFound();
      if (!VALIDATABLE.has(locked.status)) throw ImportError.notReady();
      const imp = await this.repo.find(businessId, id, tx);
      const mapping = parseMapping(imp?.mapping);
      if (!mapping) throw ImportError.notReady();

      const rows = await this.repo.allRows(businessId, id, tx);
      const couriers = await this.business.couriersByName(businessId, tx);
      const prepared = prepareRows(
        rows.map((r) => ({ rowNumber: r.rowNumber, raw: toRawCells(r.raw) })),
        mapping,
        { today: todayIn(), couriers },
      );
      const existing = await this.orders.existingImportKeys(businessId, prepared.refs, prepared.hashes, tx);
      const { results, counts } = rowVerdicts(prepared, existing);
      await this.repo.writeValidation(id, results, tx);
      await this.repo.setStatus(id, 'validated', counts, tx);
    });
    return this.show(businessId, id);
  }

  /**
   * FR-IMP-10: turns the valid rows into orders, with new customers and products, in one transaction
   * of batch statements. The import row is locked and must be `validated`, so a second click or tab
   * gets 409. Reserving the order numbers locks the business row, so two imports of one business run
   * in turn; the duplicate check is then re-run, because orders may have been added since validation.
   */
  async commit(auth: AuthContext, id: string): Promise<ImportCommitResultDto> {
    const { businessId, userId } = auth;
    let result: { dto: ImportCommitResultDto; newProductIds: string[] };
    try {
      result = await this.repo.transaction(async (tx) => {
        const locked = await this.repo.lockForUpdate(businessId, id, tx);
        if (!locked) throw ImportError.notFound();
        if (locked.status !== 'validated') throw ImportError.notReady();

        const valid = (await this.repo.validRows(businessId, id, tx)).map((r) => ({
          rowNumber: r.rowNumber,
          value: r.normalized as NormalizedRow,
        }));
        const { groups } = groupOrders(valid);
        if (groups.length === 0) throw ImportError.notReady();
        const byRow = new Map(valid.map((r) => [r.rowNumber, r.value]));
        const hashOf = (g: ImportOrderGroup) => (g.externalRef ? null : dedupeHash(byRow.get(g.rowNumbers[0])!));

        // Lock order, shared with OrdersService.insert: the business row first (here, right after this
        // import's own row), then customers and products, so a manual order and an import never deadlock.
        // The business row stays locked until this transaction commits. A manual order created meanwhile
        // waits on it inside its own Prisma transaction (5 s default timeout); a 5,000-row commit holds
        // the lock for about 2 s (measured), so it fits, but a much slower commit would time that order out.
        const firstNo = await this.business.reserveOrderNos(businessId, groups.length, tx);
        const refs = groups.flatMap((g) => (g.externalRef ? [g.externalRef] : []));
        const hashes = groups.flatMap((g) => hashOf(g) ?? []);
        const taken = await this.orders.existingImportKeys(businessId, refs, hashes, tx);
        if (taken.refs.size > 0 || taken.hashes.size > 0) throw ImportError.stale();

        const { customers, created: customersCreated } = await this.customers.findOrCreateManyForImport(
          businessId,
          groups.map((g) => ({ phone: g.phone, name: g.customerName, address: g.address })),
          id,
          tx,
        );
        const { products, createdIds } = await this.products.resolveForImport(
          businessId,
          groups.flatMap((g) =>
            g.items.map((i) => ({ sku: i.sku, name: i.productName, unitPrice: i.unitPrice, unitCost: i.unitCost, orderDate: g.orderDate })),
          ),
          id,
          userId,
          tx,
        );

        const used = new Map<string, ImportProduct>();
        const orders: ImportedOrder[] = groups.map((g, n) => {
          const customer = customers.get(g.phone)!;
          return {
            groupKey: g.key,
            orderNo: firstNo + n,
            customerId: customer.id,
            deliveryAddress: g.address ?? customer.address,
            orderDate: g.orderDate,
            externalRef: g.externalRef,
            dedupeHash: hashOf(g),
            status: g.status,
            paymentMethod: g.paymentMethod,
            courierId: g.courierId,
            discount: g.discount,
            deliveryCharge: g.deliveryCharge,
            courierCost: g.courierCost,
            items: g.items.map((i) => {
              const product = products.get(importProductKey({ sku: i.sku, name: i.productName }))!;
              used.set(product.id, product);
              return {
                productId: product.id,
                productName: product.name,
                sku: product.sku,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                unitCost: i.unitCost ?? product.costOn(g.orderDate),
              };
            }),
          };
        });

        const orderIds = await this.orders.insertImported(businessId, orders, id, userId, tx);
        await this.repo.linkOrders(
          id,
          [...orderIds].map(([groupKey, orderId]) => ({ groupKey, orderId })),
          tx,
        );
        await this.repo.setStatus(id, 'imported', { importedRows: orders.length }, tx);

        const dates = groups.map((g) => g.orderDate).sort();
        return {
          dto: {
            ordersCreated: orders.length,
            customersCreated,
            productsCreated: createdIds.length,
            missingCostProducts: [...used.values()].filter((p) => p.costPrice === 0).length,
            from: dates[0],
            to: dates[dates.length - 1],
          },
          newProductIds: createdIds,
        };
      });
    } catch (error) {
      // Backstop for the race the re-check cannot see: another commit's order ID landing first.
      // Same for a product SKU created meanwhile (a product added by hand or by another import).
      if (isUniqueViolationOn(error, 'externalRef') || isUniqueViolationOn(error, 'sku')) throw ImportError.stale();
      throw error;
    }
    await this.products.syncSearch(businessId, result.newProductIds);
    return result.dto;
  }

  /**
   * FR-IMP-12: deletes exactly the orders this import created, then the customers and products it
   * created that no other order uses, in one transaction. The import row is locked and must be
   * `imported`, so a second undo gets 409. Stock is not touched: the import never moved it.
   */
  async undo(auth: AuthContext, id: string): Promise<ImportUndoResultDto> {
    const { businessId } = auth;
    let result: { dto: ImportUndoResultDto; productIds: string[] };
    try {
      result = await this.repo.transaction(async (tx) => {
        const locked = await this.repo.lockForUpdate(businessId, id, tx);
        if (!locked) throw ImportError.notFound();
        if (locked.status !== 'imported') throw ImportError.cannotUndo();
        // Lock order, shared with OrdersService.insert and commit: the business row, then customers and
        // products. That makes a new order (manual or imported) wait for this undo. It does not cover an
        // item edit on an existing order (OrdersService.update takes no business lock): a line added
        // meanwhile for one of these products makes the delete hit the RESTRICT foreign key (below).
        await this.business.lockAccess(businessId, tx);

        const ordersDeleted = await this.orders.deleteImported(businessId, id, tx);
        const customersDeleted = await this.customers.deleteUnusedFromImport(businessId, id, tx);
        const productIds = await this.products.deleteUnusedFromImport(businessId, id, tx);
        await this.repo.unlinkOrders(id, tx);
        await this.repo.setStatus(id, 'undone', {}, tx);
        return { dto: { ordersDeleted, customersDeleted, productsDeleted: productIds.length }, productIds };
      });
    } catch (error) {
      // A customer or product of this import was put on an order while undoing: nothing was deleted; try again.
      if (isForeignKeyViolation(error)) throw ImportError.stale();
      throw error;
    }
    await this.products.syncSearch(businessId, result.productIds);
    return result.dto;
  }

  /** One page of rows with their verdicts; a foreign id is 404, not an empty page. */
  async rows(businessId: string, id: string, query: ImportRowsQuery): Promise<{ rows: ImportRowDto[]; total: number }> {
    if (!(await this.repo.find(businessId, id))) throw ImportError.notFound();
    const { rows, total } = await this.repo.rows(businessId, id, query);
    return { rows: rows.map(toImportRowDto), total };
  }

  /** The duplicate and invalid rows as CSV: the original columns plus Row, Status and Reason. */
  async rejectedCsv(businessId: string, id: string): Promise<string> {
    const imp = await this.repo.find(businessId, id);
    if (!imp) throw ImportError.notFound();
    const rows = await this.repo.rejectedRows(businessId, id);
    return toCsv(
      [...imp.headers, 'Row', 'Status', 'Reason'],
      rows.map((r) => toRejectedCsvRow(imp.headers, r)),
    );
  }

  private async toDto(businessId: string, imp: ImportRecord): Promise<ImportDto> {
    const mapping = parseMapping(imp.mapping);
    const suggestedColumns = suggestColumns(imp.headers);
    // With a mapping, only its status column counts (none mapped: every row is delivered, FR-IMP-04).
    const statusColumn = mapping ? mapping.columns.status : suggestedColumns.status;
    const [sample, statusCounts, orders] = await Promise.all([
      this.repo.rows(businessId, imp.id, { page: 1, perPage: SAMPLE_ROWS }),
      statusColumn ? this.repo.statusValueCounts(businessId, imp.id, statusColumn) : Promise.resolve([]),
      this.repo.validOrderCount(businessId, imp.id),
    ]);
    return toImportDto(imp, {
      mapping,
      sampleRows: sample.rows.map((r) => toRawCells(r.raw)),
      suggestedColumns,
      statusValues: statusCounts.map((s) => ({ ...s, suggested: suggestStatus(s.value) })),
      orders,
      missingCostProducts: 0,
    });
  }
}
