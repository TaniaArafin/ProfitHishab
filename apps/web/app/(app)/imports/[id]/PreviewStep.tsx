'use client';

import { AlertCircle, CheckCircle2, Copy, Download, type LucideIcon } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { ImportCommitResultDto, ImportDto, ImportRowEditDto } from '@ph/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, type ApiError } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { ImportBusy } from '../ImportBusy';
import { checkFile, LONG_CALL } from './checkFile';
import { PreviewRows, type RowTab } from './PreviewRows';

const TABS: Array<{ status: RowTab; label: string; icon: LucideIcon; tone: string }> = [
  { status: 'invalid', label: 'Needs fixing', icon: AlertCircle, tone: 'text-loss' },
  { status: 'valid', label: 'Ready', icon: CheckCircle2, tone: 'text-gain' },
  { status: 'duplicate', label: 'Duplicates', icon: Copy, tone: 'text-ink-muted' },
];

/** What the check found, the rows behind each count, and the button that imports the valid orders. */
export function PreviewStep({
  imp,
  onBack,
  onRechecked,
  onRowFixed,
  onImported,
}: {
  imp: ImportDto;
  onBack: () => void;
  onRechecked: (checked: ImportDto) => void;
  /** An inline fix was saved: the import with its fresh counts. */
  onRowFixed: (updated: ImportDto) => void;
  /** `seconds`: how long the import took, as the seller waited for it. */
  onImported: (result: ImportCommitResultDto, seconds: number) => void;
}) {
  const c = imp.counts;
  const [tab, setTab] = useState<RowTab>(c.invalid > 0 ? 'invalid' : c.valid > 0 || c.duplicate === 0 ? 'valid' : 'duplicate');
  const [pending, setPending] = useState<'importing' | 'checking' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [fixed, setFixed] = useState<string | null>(null);
  const tabRefs = useRef<Record<RowTab, HTMLButtonElement | null>>({ valid: null, duplicate: null, invalid: null });

  async function commit() {
    setPending('importing');
    setError(null);
    const started = performance.now();
    const res = await api<ImportCommitResultDto>('POST', `/imports/${imp.id}/commit`, undefined, {}, LONG_CALL);
    if (!res.ok) {
      setPending(null);
      setError(res.error);
      return;
    }
    onImported(res.data, (performance.now() - started) / 1000);
  }

  function rowFixed({ import: updated, row }: ImportRowEditDto) {
    onRowFixed(updated);
    if (row.status === tab) return; // Still the same kind of row: its new error shows in the row.
    const n = row.rowNumber;
    setFixed(
      row.status === 'valid'
        ? `Row ${n} fixed.`
        : row.status === 'duplicate'
          ? `Row ${n} fixed. It matches an existing order, so it is skipped.`
          : `Row ${n} still has a mistake.`,
    );
  }

  async function recheck() {
    setPending('checking');
    setError(null);
    const res = await checkFile(imp.id);
    if (!res.ok) {
      setPending(null);
      setError(res.error);
      return;
    }
    onRechecked(res.data);
  }

  // WAI-ARIA tabs: arrow keys move between tabs (and select them), Home/End jump to the ends.
  function onTabKey(e: KeyboardEvent) {
    const i = TABS.findIndex((t) => t.status === tab);
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % TABS.length
        : e.key === 'ArrowLeft'
          ? (i + TABS.length - 1) % TABS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? TABS.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setTab(TABS[next].status);
    tabRefs.current[TABS[next].status]?.focus();
  }

  const counts: Record<RowTab, number> = { valid: c.valid, duplicate: c.duplicate, invalid: c.invalid };
  const stale = error?.code === 'import_stale';

  const title =
    c.invalid > 0
      ? `${c.invalid} ${c.invalid === 1 ? 'row needs' : 'rows need'} fixing`
      : c.orders > 0
        ? 'Your orders are ready to import'
        : c.duplicate > 0
          ? 'These orders are already imported'
          : 'Nothing new to import';
  const hint =
    c.invalid > 0
      ? 'Fix the red values in the table, or import now and those rows are skipped.'
      : c.duplicate > 0 && c.orders === 0
        ? 'Duplicates are skipped. If a row is a different order, change it in the table.'
        : 'Click any value in the table to change it before importing.';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Card className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-0.5 text-sm text-ink-muted tabular">
              {c.total} rows detected: {c.valid} valid, {c.duplicate} duplicate, {c.invalid} invalid
            </p>
          </div>
          <Button size="lg" className="w-full shrink-0 sm:w-auto" onClick={commit} disabled={pending !== null || c.orders === 0}>
            {pending === 'importing' ? 'Importing…' : `Import ${c.orders} ${c.orders === 1 ? 'Order' : 'Orders'}`}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-sm text-ink-muted">
          <span>Columns matched automatically.</span>
          <Button variant="link" size="sm" className="h-auto px-0" onClick={onBack} disabled={pending !== null}>
            Change columns
          </Button>
          {c.duplicate + c.invalid > 0 ? (
            <Button asChild variant="link" size="sm" className="h-auto px-0">
              <a href={`/api/imports/${imp.id}/rejected.csv`} download>
                <Download className="h-4 w-4" /> Download skipped rows
              </a>
            </Button>
          ) : null}
        </div>
        {error ? (
          <Alert variant="destructive">
            <p>{error.message}</p>
            {stale ? (
              <Button variant="secondary" size="sm" className="mt-2" onClick={recheck} disabled={pending !== null}>
                {pending === 'checking' ? 'Checking…' : 'Check again'}
              </Button>
            ) : null}
          </Alert>
        ) : null}
      </Card>

      {pending === 'importing' ? <ImportBusy step="import" orders={c.orders} /> : null}

      <section className="flex min-w-0 flex-col gap-3" aria-label="Checked rows">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Rows by result"
            className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-paper p-1 ring-1 ring-line/70"
          >
            {TABS.map((t) => {
              const selected = t.status === tab;
              const Icon = t.icon;
              return (
                <button
                  key={t.status}
                  type="button"
                  ref={(el) => {
                    tabRefs.current[t.status] = el;
                  }}
                  role="tab"
                  id={`tab-${t.status}`}
                  aria-selected={selected}
                  aria-controls={`panel-${t.status}`}
                  tabIndex={selected ? 0 : -1}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    selected ? 'bg-card text-ink shadow-soft' : 'text-ink-muted hover:text-ink',
                  )}
                  onClick={() => setTab(t.status)}
                  onKeyDown={onTabKey}
                >
                  <Icon className={cn('h-4 w-4', t.tone)} aria-hidden />
                  {t.label}
                  <span className="tabular text-ink-faint">{counts[t.status]}</span>
                </button>
              );
            })}
          </div>
          {fixed ? (
            <p role="status" className="flex items-center gap-1.5 text-sm text-gain">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {fixed}
            </p>
          ) : null}
        </div>
        <p className="text-sm text-ink-muted">{hint}</p>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-w-0">
          {/* key: a new tab starts at page 1. */}
          <PreviewRows key={tab} imp={imp} status={tab} onFixed={rowFixed} />
        </div>
      </section>
    </div>
  );
}
