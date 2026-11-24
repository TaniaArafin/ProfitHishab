'use client';

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Fragment, useState } from 'react';
import { IMPORT_ROW_REASON_LABELS, type ImportDto, type ImportRowDto, type ImportRowEditDto, type ImportTarget } from '@ph/shared';
import { Skeleton } from '@/components/ui';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useImportRows } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { FixCell } from './FixCell';

export type RowTab = 'valid' | 'duplicate' | 'invalid';

const PER_PAGE = 25;

/** Things to know about a ready row; it still imports. */
const WARNING_LABELS: Record<string, string> = {
  date_missing: "No order date: today's date is used",
  cost_missing: 'No product cost: its profit will show higher',
  discount_clamped: 'Discount was more than the order, so it is capped',
};

type Issue = { tone: 'error' | 'warn' | 'fixed'; text: string };

/** Reasons that belong to one value; that value's message (with its column and value) replaces them. */
const FIELD_REASONS = new Set(['phone_invalid', 'product_missing', 'quantity_invalid', 'price_invalid', 'date_invalid', 'duplicate_ref']);

/**
 * The line under a row: what is wrong (naming the column and the value), that a fix worked, or what to
 * know about it. `headerOf` gives the seller's column name for an imported field.
 */
function issuesOf(row: ImportRowDto, edited: boolean, headerOf: (t: ImportTarget) => string | undefined): Issue[] {
  const fields = (Object.entries(row.problems) as Array<[ImportTarget, string]>).flatMap(([target, hint]) => {
    const header = headerOf(target);
    return header ? [{ tone: 'error' as const, text: `${header} “${row.raw[header] ?? ''}”: ${hint}` }] : [];
  });
  const rowReasons = row.reasons
    .filter((r) => fields.length === 0 || !FIELD_REASONS.has(r))
    .map((r) => ({ tone: 'error' as const, text: IMPORT_ROW_REASON_LABELS[r] }));
  if (fields.length + rowReasons.length > 0) return [...fields, ...rowReasons];
  return [
    ...(edited ? [{ tone: 'fixed' as const, text: 'Fixed, will be imported' }] : []),
    ...row.warnings.map((w) => ({ tone: 'warn' as const, text: WARNING_LABELS[w] ?? w })),
  ];
}

/** Full-width line under a row; it stays at the left edge while the table scrolls sideways. */
function IssueLine({ id, issues }: { id: string; issues: Issue[] }) {
  return (
    <div id={id} className="sticky left-4 flex w-fit max-w-[min(48rem,85vw)] flex-col gap-0.5">
      {issues.map((issue) => (
        <span
          key={issue.text}
          className={cn(
            'inline-flex items-start gap-1.5 text-sm',
            issue.tone === 'error' ? 'text-loss' : issue.tone === 'warn' ? 'text-xs text-warn-ink' : 'font-medium text-gain',
          )}
        >
          {issue.tone === 'fixed' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : null}
          {issue.tone === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : null}
          {issue.text}
        </span>
      ))}
    </div>
  );
}

/**
 * One page of checked rows, with every column of the seller's file under its own header, in one table that
 * scrolls sideways on every screen size. Every imported
 * value can be changed in place; a fixed row stays where it is (its red border goes) until the tab changes.
 */
export function PreviewRows({ imp, status, onFixed }: { imp: ImportDto; status: RowTab; onFixed: (result: ImportRowEditDto) => void }) {
  const [page, setPage] = useState(1);
  // Rows fixed on this tab, as the API answered: shown in place of the loaded row so nothing jumps away.
  const [edited, setEdited] = useState<Map<number, ImportRowDto>>(() => new Map());
  const { data, error } = useImportRows(imp.id, status, page, PER_PAGE);
  const columns = imp.mapping?.columns ?? {};
  const targetOf = new Map(Object.entries(columns).map(([target, header]) => [header, target as ImportTarget]));
  const headers = [...new Set(imp.headers.filter((h) => h !== ''))];

  function fixed(result: ImportRowEditDto) {
    setEdited(new Map(edited).set(result.row.rowNumber, result.row));
    onFixed(result);
  }

  if (error) return <Alert variant="destructive">{error.message}</Alert>;
  if (!data) return <Skeleton className="h-40 w-full" />;
  if (data.rows.length === 0) {
    return (
      <Card>
        <p className="px-5 py-6 text-sm text-ink-muted">{status === 'invalid' ? 'Nothing needs fixing.' : 'No rows here.'}</p>
      </Card>
    );
  }
  const rows = data.rows.map((r) => edited.get(r.rowNumber) ?? r);
  const pages = Math.max(1, Math.ceil(data.total / PER_PAGE));

  /** An imported value is a box you can change; a column that is not imported is shown faded. */
  const value = (row: ImportRowDto, header: string, fit = false) => {
    const target = targetOf.get(header);
    const text = row.raw[header] ?? '';
    if (!target) return <span className="text-ink-faint">{text}</span>;
    return (
      <FixCell
        key={`${row.rowNumber}-${target}-${text}`}
        imp={imp}
        row={row}
        target={target}
        label={header}
        fit={fit}
        describedBy={`row-${row.rowNumber}-issue`}
        onFixed={fixed}
      />
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {headers.length > 5 ? (
        <p className={cn('text-xs text-ink-faint', headers.length <= 8 && 'xl:hidden')}>
          Scroll sideways to see all {headers.length} columns.
        </p>
      ) : null}
      {/* One table on every screen size: it scrolls sideways, with the row number kept on the left. */}
      <Card className="min-w-0 overflow-x-auto [scrollbar-width:thin]">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 z-10 bg-card">Row</TableHead>
              {headers.map((h) => (
                <TableHead key={h} className="whitespace-nowrap">
                  {h}
                  {targetOf.has(h) ? null : <span className="ml-1 text-[10px] font-normal normal-case text-ink-faint">not imported</span>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const issues = issuesOf(row, edited.has(row.rowNumber), (t) => columns[t]);
              return (
                <Fragment key={row.rowNumber}>
                  <TableRow className={cn(issues.length > 0 && 'border-b-0')}>
                    <TableCell className="sticky left-0 z-10 bg-card align-top tabular text-ink-muted">{row.rowNumber}</TableCell>
                    {headers.map((h) => (
                      <TableCell key={h} className="whitespace-nowrap align-top">
                        {value(row, h, true)}
                      </TableCell>
                    ))}
                  </TableRow>
                  {issues.length > 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={headers.length + 1} className="pb-3 pt-0">
                        <IssueLine id={`row-${row.rowNumber}-issue`} issues={issues} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>

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
