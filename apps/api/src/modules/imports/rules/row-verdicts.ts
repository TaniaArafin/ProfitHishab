import type { ImportMapping, ImportRowReason, ImportRowStatus } from '@ph/shared';
import { groupOrders, type ImportOrderGroup } from './orders-group';
import { dedupeHash, parseRow, type NormalizedRow, type ParseContext, type ParsedRow } from './row-parse';

export interface RowVerdict {
  rowNumber: number;
  status: ImportRowStatus;
  /** Only for valid rows: what the commit turns into an order line. */
  normalized: NormalizedRow | null;
  errors: { reasons: ImportRowReason[]; warnings: string[] };
  /** The order the row belongs to, for valid and duplicate rows. */
  groupKey: string | null;
}

export interface PreparedRows {
  parsed: Array<{ rowNumber: number; ref: string | null; result: ParsedRow; hash: string | null }>;
  groups: ImportOrderGroup[];
  conflicts: number[];
  /** Order IDs and fingerprints to look up among the business's existing orders. */
  refs: string[];
  hashes: string[];
}

const keyOf = (rowNumber: number, ref: string | null) => (ref ? `ref:${ref}` : `row:${rowNumber}`);

/** Parses every row and groups the readable ones into orders (step 1 of validation, no I/O). */
export function prepareRows(
  rows: Array<{ rowNumber: number; raw: Record<string, string> }>,
  mapping: ImportMapping,
  ctx: ParseContext,
): PreparedRows {
  const refColumn = mapping.columns.externalRef;
  const parsed = rows.map((r) => {
    const result = parseRow(r.raw, mapping, ctx);
    const ref = refColumn === undefined ? null : (r.raw[refColumn] ?? '').trim() || null;
    // Only rows without an order ID are matched by fingerprint (FR-IMP-06).
    const hash = result.ok && result.value.externalRef === null ? dedupeHash(result.value) : null;
    return { rowNumber: r.rowNumber, ref, result, hash };
  });
  const readable = parsed.flatMap((p) => (p.result.ok ? [{ rowNumber: p.rowNumber, value: p.result.value }] : []));
  const { groups, conflicts } = groupOrders(readable);
  return {
    parsed,
    groups,
    conflicts,
    refs: [...new Set(groups.flatMap((g) => (g.externalRef ? [g.externalRef] : [])))],
    hashes: [...new Set(parsed.flatMap((p) => (p.hash ? [p.hash] : [])))],
  };
}

/**
 * Each row's verdict, in file order (step 2, after the duplicate lookup):
 * - unreadable row: invalid with its reasons;
 * - row of a group whose rows disagree: invalid, `order_conflict`;
 * - readable row whose order has an unreadable row: invalid, `order_row_invalid`;
 * - order ID already used by an order: the whole group is duplicate, `duplicate_ref`;
 * - no order ID and the fingerprint is an existing order's: `duplicate_row`, or an earlier row's: `duplicate_in_file`.
 */
export function rowVerdicts(
  prepared: PreparedRows,
  existing: { refs: Set<string>; hashes: Set<string> },
): { results: RowVerdict[]; counts: { validRows: number; duplicateRows: number; invalidRows: number } } {
  const broken = new Set(prepared.parsed.filter((p) => !p.result.ok).map((p) => keyOf(p.rowNumber, p.ref)));
  const conflicts = new Set(prepared.conflicts);
  const groupOf = new Map<number, ImportOrderGroup>();
  for (const g of prepared.groups) for (const n of g.rowNumbers) groupOf.set(n, g);

  const seen = new Set<string>();
  const results = prepared.parsed.map(({ rowNumber, result, hash }): RowVerdict => {
    const reject = (status: ImportRowStatus, reasons: ImportRowReason[], groupKey: string | null = null): RowVerdict => ({
      rowNumber,
      status,
      normalized: null,
      errors: { reasons, warnings: [] },
      groupKey,
    });
    if (!result.ok) return reject('invalid', result.reasons);
    const group = groupOf.get(rowNumber);
    if (conflicts.has(rowNumber) || !group) return reject('invalid', ['order_conflict']);
    if (broken.has(group.key)) return reject('invalid', ['order_row_invalid']);
    if (group.externalRef && existing.refs.has(group.externalRef)) return reject('duplicate', ['duplicate_ref'], group.key);
    if (hash) {
      if (existing.hashes.has(hash)) return reject('duplicate', ['duplicate_row'], group.key);
      if (seen.has(hash)) return reject('duplicate', ['duplicate_in_file'], group.key);
      seen.add(hash);
    }
    return {
      rowNumber,
      status: 'valid',
      normalized: result.value,
      errors: { reasons: [], warnings: [...result.warnings, ...group.warnings] },
      groupKey: group.key,
    };
  });

  const count = (s: ImportRowStatus) => results.filter((r) => r.status === s).length;
  return {
    results,
    counts: { validRows: count('valid'), duplicateRows: count('duplicate'), invalidRows: count('invalid') },
  };
}
