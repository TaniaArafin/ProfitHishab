import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ImportRowStatus, ImportStatus } from '@ph/shared';
import { PrismaService, type Tx } from '../../common/prisma.service';

const CHUNK = 1000;

export interface ImportRecord {
  id: string;
  type: string;
  fileName: string;
  status: ImportStatus;
  mapping: unknown;
  statusMapping: unknown;
  headers: string[];
  headersKey: string | null;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  importedRows: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImportRowRecord {
  id: string;
  rowNumber: number;
  raw: Record<string, unknown>;
  normalized: unknown;
  status: ImportRowStatus;
  errors: unknown;
  orderId: string | null;
  groupKey: string | null;
}

export interface NewImport {
  fileName: string;
  headers: string[];
  headersKey: string;
  createdById: string | null;
}

export interface ImportCounts {
  totalRows?: number;
  validRows?: number;
  duplicateRows?: number;
  invalidRows?: number;
  importedRows?: number;
}

export interface RowValidation {
  rowNumber: number;
  status: ImportRowStatus;
  normalized: unknown;
  errors: unknown;
  groupKey: string | null;
}

export interface Page {
  page: number;
  perPage: number;
}

const IMPORT_SELECT = {
  id: true,
  type: true,
  fileName: true,
  status: true,
  mapping: true,
  statusMapping: true,
  headers: true,
  headersKey: true,
  totalRows: true,
  validRows: true,
  duplicateRows: true,
  invalidRows: true,
  importedRows: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ROW_SELECT = {
  id: true,
  rowNumber: true,
  raw: true,
  normalized: true,
  status: true,
  errors: true,
  orderId: true,
  groupKey: true,
} as const;

/** Uploaded import files and their rows. Every read is scoped by businessId; writes by id follow a scoped lock. */
@Injectable()
export class ImportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 30_000 });
  }

  /** Creates the import and its rows (pending), 1,000 rows per statement. Returns the import id. */
  async create(
    businessId: string,
    data: NewImport,
    rows: Array<{ rowNumber: number; raw: Prisma.InputJsonValue }>,
    tx: Tx,
  ): Promise<string> {
    const created = await tx.import.create({
      data: { businessId, ...data, totalRows: rows.length },
      select: { id: true },
    });
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx.importRow.createMany({
        data: rows
          .slice(i, i + CHUNK)
          .map((r) => ({ importId: created.id, businessId, rowNumber: r.rowNumber, raw: r.raw, status: 'pending' })),
      });
    }
    return created.id;
  }

  find(businessId: string, id: string, db: Tx = this.prisma): Promise<ImportRecord | null> {
    return db.import.findFirst({ where: { id, businessId }, select: IMPORT_SELECT }) as Promise<ImportRecord | null>;
  }

  /** Newest first. */
  async paginate(businessId: string, { page, perPage }: Page): Promise<{ rows: ImportRecord[]; total: number }> {
    const where = { businessId };
    const [rows, total] = await Promise.all([
      this.prisma.import.findMany({
        where,
        select: IMPORT_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.import.count({ where }),
    ]);
    return { rows: rows as ImportRecord[], total };
  }

  /** One page of rows by row number, optionally of one status. */
  async rows(
    businessId: string,
    id: string,
    { status, page, perPage }: Page & { status?: ImportRowStatus },
  ): Promise<{ rows: ImportRowRecord[]; total: number }> {
    const where = { importId: id, businessId, ...(status ? { status } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.importRow.findMany({
        where,
        select: ROW_SELECT,
        orderBy: { rowNumber: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.importRow.count({ where }),
    ]);
    return { rows: rows as ImportRowRecord[], total };
  }

  allRows(businessId: string, id: string, db: Tx = this.prisma): Promise<ImportRowRecord[]> {
    return db.importRow.findMany({ where: { importId: id, businessId }, select: ROW_SELECT, orderBy: { rowNumber: 'asc' } }) as Promise<
      ImportRowRecord[]
    >;
  }

  /** The rows marked valid, with what validation stored, by row number (what a commit turns into orders). */
  validRows(businessId: string, id: string, db: Tx): Promise<Array<{ rowNumber: number; normalized: unknown; groupKey: string | null }>> {
    return db.importRow.findMany({
      where: { importId: id, businessId, status: 'valid' },
      select: { rowNumber: true, normalized: true, groupKey: true },
      orderBy: { rowNumber: 'asc' },
    });
  }

  /** The duplicate and invalid rows, by row number (the rejected-rows download). */
  rejectedRows(businessId: string, id: string): Promise<ImportRowRecord[]> {
    return this.prisma.importRow.findMany({
      where: { importId: id, businessId, status: { in: ['duplicate', 'invalid'] } },
      select: ROW_SELECT,
      orderBy: { rowNumber: 'asc' },
    }) as Promise<ImportRowRecord[]>;
  }

  /** Distinct values of one raw column with how many rows have each (a missing cell is the empty string). */
  async statusValueCounts(businessId: string, id: string, rawColumn: string): Promise<Array<{ value: string; count: number }>> {
    return this.prisma.$queryRaw<Array<{ value: string; count: number }>>`
      SELECT COALESCE(raw ->> ${rawColumn}, '') AS value, count(*)::int AS count
      FROM import_rows
      WHERE "importId" = ${id}::uuid AND "businessId" = ${businessId}::uuid
      GROUP BY 1
      ORDER BY count DESC, value`;
  }

  /** Locks the import row (SELECT … FOR UPDATE) and returns its status; null when it is not this business's. */
  async lockForUpdate(businessId: string, id: string, tx: Tx): Promise<{ status: ImportStatus } | null> {
    const rows = await tx.$queryRaw<Array<{ status: ImportStatus }>>`
      SELECT status FROM imports WHERE id = ${id}::uuid AND "businessId" = ${businessId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  async setStatus(id: string, status: ImportStatus, counts: ImportCounts = {}, db: Tx = this.prisma): Promise<void> {
    await db.import.update({ where: { id }, data: { status, ...counts } });
  }

  /** Stores the column mapping and moves the import to `mapped`, clearing the validation counts. */
  async applyMapping(id: string, mapping: Prisma.InputJsonValue, tx: Tx): Promise<void> {
    await tx.import.update({
      where: { id },
      data: { mapping, status: 'mapped', validRows: 0, duplicateRows: 0, invalidRows: 0, importedRows: 0 },
    });
  }

  /** Puts every row of the import back to `pending` with no verdict, in one UPDATE. */
  async resetRows(importId: string, tx: Tx): Promise<void> {
    await tx.$executeRaw`
      UPDATE import_rows SET status = 'pending', normalized = NULL, errors = NULL, "groupKey" = NULL
      WHERE "importId" = ${importId}::uuid`;
  }

  /** How many orders the valid rows make (one per group key). */
  async validOrderCount(businessId: string, id: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(DISTINCT "groupKey")::int AS n FROM import_rows
      WHERE "importId" = ${id}::uuid AND "businessId" = ${businessId}::uuid AND status = 'valid'`;
    return rows[0]?.n ?? 0;
  }

  /** Writes every row's verdict in one UPDATE. Rows not in `results` are left as they are. */
  async writeValidation(importId: string, results: RowValidation[], tx: Tx): Promise<void> {
    if (results.length === 0) return;
    const json = JSON.stringify(results);
    await tx.$executeRaw`
      UPDATE import_rows AS r
      SET status = v.status, normalized = v.normalized, errors = v.errors, "groupKey" = v."groupKey"
      FROM jsonb_to_recordset(${json}::jsonb) AS v("rowNumber" int, status text, normalized jsonb, errors jsonb, "groupKey" text)
      WHERE r."importId" = ${importId}::uuid AND r."rowNumber" = v."rowNumber"`;
  }

  /** Clears every row's order link (the orders were deleted by an undo), in one UPDATE. */
  async unlinkOrders(importId: string, tx: Tx): Promise<void> {
    await tx.$executeRaw`UPDATE import_rows SET "orderId" = NULL WHERE "importId" = ${importId}::uuid AND "orderId" IS NOT NULL`;
  }

  /** Points every valid row of each group at the order created for it, in one UPDATE. */
  async linkOrders(importId: string, pairs: Array<{ groupKey: string; orderId: string }>, tx: Tx): Promise<void> {
    if (pairs.length === 0) return;
    const json = JSON.stringify(pairs);
    await tx.$executeRaw`
      UPDATE import_rows AS r
      SET "orderId" = v."orderId"
      FROM jsonb_to_recordset(${json}::jsonb) AS v("groupKey" text, "orderId" uuid)
      WHERE r."importId" = ${importId}::uuid AND r.status = 'valid' AND r."groupKey" = v."groupKey"`;
  }
}
