import {
  IMPORT_ROW_REASON_LABELS,
  IMPORT_ROW_REASONS,
  type ImportDto,
  type ImportListItemDto,
  type ImportMapping,
  type ImportRowDto,
  type ImportRowReason,
} from '@ph/shared';
import type { ImportRecord, ImportRowRecord } from './imports.repository';
import { rowProblems, WHOLE_QUANTITY_HINT } from './rules/row-parse';

/** What the service works out for one import beyond its own columns. */
export interface ImportDetail {
  mapping: ImportMapping | null;
  sampleRows: Record<string, string>[];
  suggestedColumns: ImportDto['suggestedColumns'];
  statusValues: ImportDto['statusValues'];
  orders: number;
  missingCostProducts: number;
}

/** Never carries businessId, createdById or the rows themselves: only the first few as a sample. */
export function toImportDto(imp: ImportRecord, detail: ImportDetail): ImportDto {
  return {
    id: imp.id,
    fileName: imp.fileName,
    status: imp.status,
    createdAt: imp.createdAt.toISOString(),
    headers: imp.headers,
    sampleRows: detail.sampleRows,
    mapping: detail.mapping,
    suggestedColumns: detail.suggestedColumns,
    statusValues: detail.statusValues,
    counts: {
      total: imp.totalRows,
      valid: imp.validRows,
      duplicate: imp.duplicateRows,
      invalid: imp.invalidRows,
      orders: detail.orders,
    },
    importedOrders: imp.importedRows,
    missingCostProducts: detail.missingCostProducts,
  };
}

export function toImportListItemDto(imp: ImportRecord): ImportListItemDto {
  return {
    id: imp.id,
    fileName: imp.fileName,
    status: imp.status,
    createdAt: imp.createdAt.toISOString(),
    importedOrders: imp.importedRows,
    canUndo: imp.status === 'imported',
  };
}

/** A raw cell map as stored (every value was written as a string). */
export function toRawCells(raw: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? v : '']));
}

const KNOWN_REASONS: ReadonlySet<string> = new Set(IMPORT_ROW_REASONS);

/** The stored `errors` JSON ({ reasons, warnings }); a pending row has none. */
function verdictOf(errors: unknown): { reasons: ImportRowReason[]; warnings: string[] } {
  const e = (errors ?? {}) as { reasons?: unknown; warnings?: unknown };
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    reasons: strings(e.reasons).filter((r): r is ImportRowReason => KNOWN_REASONS.has(r)),
    warnings: strings(e.warnings),
  };
}

const DUPLICATE_REF_HINT = 'This order ID is already imported. Enter a new one if this is a different order.';

/** One row of the preview: its cells as uploaded and the verdict, never the normalised values. */
export function toImportRowDto(row: ImportRowRecord, mapping: ImportMapping | null): ImportRowDto {
  const raw = toRawCells(row.raw);
  const verdict = verdictOf(row.errors);
  let problems: ImportRowDto['problems'] = {};
  if (row.status === 'invalid' && mapping) {
    problems = rowProblems(raw, mapping);
    if (verdict.reasons.includes('quantity_not_whole')) problems.quantity = WHOLE_QUANTITY_HINT;
  } else if (verdict.reasons.includes('duplicate_ref')) problems = { externalRef: DUPLICATE_REF_HINT };
  return { rowNumber: row.rowNumber, status: row.status, ...verdict, raw, problems };
}

const STATUS_LABELS: Record<string, string> = { duplicate: 'Duplicate', invalid: 'Invalid' };

/** A rejected-rows CSV line: the original cells, then Row, Status and the reasons in plain English. */
export function toRejectedCsvRow(headers: string[], row: ImportRowRecord): string[] {
  const raw = toRawCells(row.raw);
  return [
    ...headers.map((h) => raw[h] ?? ''),
    String(row.rowNumber),
    STATUS_LABELS[row.status] ?? row.status,
    verdictOf(row.errors)
      .reasons.map((r) => IMPORT_ROW_REASON_LABELS[r])
      .join('; '),
  ];
}
