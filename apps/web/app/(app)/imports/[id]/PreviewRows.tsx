'use client';

import { useState } from 'react';
import {
  IMPORT_ROW_REASON_LABELS,
  IMPORT_TARGET_LABELS,
  type ImportDto,
  type ImportRowDto,
  type ImportRowEditDto,
  type ImportTarget,
} from '@ph/shared';
import { Skeleton } from '@/components/ui';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useImportRows } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { FixRow } from './FixRow';

export type RowTab = 'valid' | 'duplicate' | 'invalid';

const PER_PAGE = 25;
const SHOWN: ImportTarget[] = ['phone', 'product', 'quantity', 'sellingPrice'];

const WARNING_LABELS: Record<string, string> = {
  date_missing: 'No order date: today is used',
  cost_missing: 'No product cost',
  discount_clamped: 'Discount was more than the order and is capped',
};

function notes(row: ImportRowDto): string {
  if (row.reasons.length > 0) return row.reasons.map((r) => IMPORT_ROW_REASON_LABELS[r]).join('; ');
  return row.warnings.map((w) => WARNING_LABELS[w] ?? w).join('; ');
}

/** One page of checked rows: the key cells and why a row is skipped (or what to know about it). */
export function PreviewRows({
  imp,
  status,
  version,
  onFixed,
}: {
  imp: ImportDto;
  status: RowTab;
  /** Raised after an inline fix, so the rows reload. */
  version: number;
  onFixed: (result: ImportRowEditDto) => void;
}) {
  const [page, setPage] = useState(1);
  const { data, error } = useImportRows(imp.id, status, page, PER_PAGE, version);
  // The last row of the last page was fixed: step back instead of showing an empty page.
  if (data && data.rows.length === 0 && page > 1) setPage(page - 1);
  const columns = imp.mapping?.columns ?? {};
  const cell = (row: ImportRowDto, target: ImportTarget) => {
    const col = columns[target];
    return col ? (row.raw[col] ?? '') : '';
  };
  const notesLabel = status === 'valid' ? 'Notes' : 'Reason';
  const [editing, setEditing] = useState<number | null>(null);

  if (error) return <Alert variant="destructive">{error.message}</Alert>;
  if (!data) return <Skeleton className="h-40 w-full" />;
  if (data.rows.length === 0) {
    return (
      <Card>
        <p className="px-5 py-6 text-sm text-ink-muted">{status === 'invalid' ? 'Nothing needs fixing.' : 'No rows here.'}</p>
      </Card>
    );
  }
  const pages = Math.max(1, Math.ceil(data.total / PER_PAGE));
  const pager =
    pages > 1 ? (
      <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Rows pages">
        <span className="text-ink-muted tabular">
          Page {page} of {pages} · {data.total} rows
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </nav>
    ) : null;

  const fixable = status !== 'valid';
  const editingRow = data.rows.find((r) => r.rowNumber === editing);

  /** A wrong value: a thin red border, and a click opens the row to fix it. */
  const value = (row: ImportRowDto, t: ImportTarget) => {
    const text = cell(row, t);
    if (!fixable || !row.problems[t]) return text;
    return (
      <button
        type="button"
        aria-label={`Fix row ${row.rowNumber}: ${IMPORT_TARGET_LABELS[t]} ${text}`.trimEnd()}
        onClick={() => setEditing(row.rowNumber)}
        className="max-w-full truncate rounded-md border border-loss px-1.5 py-0.5 text-left hover:bg-loss-soft"
      >
        {text || '(empty)'}
      </button>
    );
  };
  /** The reason, which also opens the row (the only way in when no shown value is wrong). */
  const reason = (row: ImportRowDto, className: string) =>
    fixable ? (
      <button
        type="button"
        aria-label={`Fix row ${row.rowNumber}: ${notes(row)}`}
        onClick={() => setEditing(row.rowNumber)}
        className={cn('text-left text-loss underline decoration-loss/40 underline-offset-2 hover:decoration-loss', className)}
      >
        {notes(row)}
      </button>
    ) : (
      <span className={className}>{notes(row)}</span>
    );

  return (
    <div className="flex flex-col gap-3">
      <Card className="hidden min-w-0 overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Row</TableHead>
              {SHOWN.map((t) => (
                <TableHead key={t}>{IMPORT_TARGET_LABELS[t]}</TableHead>
              ))}
              <TableHead>{notesLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <TableRow key={row.rowNumber}>
                <TableCell className="tabular text-ink-muted">{row.rowNumber}</TableCell>
                {SHOWN.map((t) => (
                  <TableCell key={t} className="max-w-[12rem] truncate">
                    {value(row, t)}
                  </TableCell>
                ))}
                <TableCell>{reason(row, status === 'valid' ? 'text-ink-muted' : 'text-loss')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ul className="flex flex-col gap-2 md:hidden">
        {data.rows.map((row) => (
          <li key={row.rowNumber}>
            <Card className="flex min-w-0 flex-col gap-1 p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{cell(row, 'product') || '—'}</span>
                <span className="shrink-0 text-xs text-ink-faint tabular">Row {row.rowNumber}</span>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-ink-muted tabular">
                {value(row, 'phone')} · {value(row, 'quantity')} × {value(row, 'sellingPrice')}
              </div>
              {notes(row) ? reason(row, status === 'valid' ? 'text-xs text-ink-muted' : 'text-xs text-loss') : null}
            </Card>
          </li>
        ))}
      </ul>

      {pager}
      {editingRow ? (
        <FixRow key={editingRow.rowNumber} imp={imp} row={editingRow} onFixed={onFixed} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}
