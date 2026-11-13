'use client';

import { useState } from 'react';
import { IMPORT_ROW_REASON_LABELS, IMPORT_TARGET_LABELS, type ImportDto, type ImportRowDto, type ImportTarget } from '@ph/shared';
import { Skeleton } from '@/components/ui';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useImportRows } from '@/lib/hooks';

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
export function PreviewRows({ imp, status }: { imp: ImportDto; status: RowTab }) {
  const [page, setPage] = useState(1);
  const { data, error } = useImportRows(imp.id, status, page, PER_PAGE);
  const columns = imp.mapping?.columns ?? {};
  const cell = (row: ImportRowDto, target: ImportTarget) => {
    const col = columns[target];
    return col ? (row.raw[col] ?? '') : '';
  };
  const notesLabel = status === 'valid' ? 'Notes' : 'Reason';

  if (error) return <Alert variant="destructive">{error.message}</Alert>;
  if (!data) return <Skeleton className="h-40 w-full" />;
  if (data.rows.length === 0) {
    return (
      <Card>
        <p className="px-5 py-6 text-sm text-ink-muted">No rows here.</p>
      </Card>
    );
  }
  const pages = Math.max(1, Math.ceil(data.total / PER_PAGE));

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
                    {cell(row, t)}
                  </TableCell>
                ))}
                <TableCell className={status === 'valid' ? 'text-ink-muted' : 'text-loss'}>{notes(row)}</TableCell>
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
              <div className="truncate text-xs text-ink-muted tabular">
                {cell(row, 'phone')} · {cell(row, 'quantity')} × {cell(row, 'sellingPrice')}
              </div>
              {notes(row) ? <div className={status === 'valid' ? 'text-xs text-ink-muted' : 'text-xs text-loss'}>{notes(row)}</div> : null}
            </Card>
          </li>
        ))}
      </ul>

      {pages > 1 ? (
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
      ) : null}
    </div>
  );
}
