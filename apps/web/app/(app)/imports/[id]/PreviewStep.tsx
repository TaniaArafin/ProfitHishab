'use client';

import { Download } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { ImportCommitResultDto, ImportDto } from '@ph/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, type ApiError } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { checkFile, LONG_CALL } from './checkFile';
import { PreviewRows, type RowTab } from './PreviewRows';

const TABS: Array<{ status: RowTab; label: string }> = [
  { status: 'valid', label: 'Valid' },
  { status: 'duplicate', label: 'Duplicate' },
  { status: 'invalid', label: 'Invalid' },
];

/** What the check found, the rows behind each count, and the button that imports the valid orders. */
export function PreviewStep({
  imp,
  onBack,
  onRechecked,
  onImported,
}: {
  imp: ImportDto;
  onBack: () => void;
  onRechecked: (checked: ImportDto) => void;
  onImported: (result: ImportCommitResultDto) => void;
}) {
  const c = imp.counts;
  const [tab, setTab] = useState<RowTab>(c.valid > 0 || c.duplicate + c.invalid === 0 ? 'valid' : c.invalid > 0 ? 'invalid' : 'duplicate');
  const [pending, setPending] = useState<'importing' | 'checking' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const tabRefs = useRef<Record<RowTab, HTMLButtonElement | null>>({ valid: null, duplicate: null, invalid: null });

  async function commit() {
    setPending('importing');
    setError(null);
    const res = await api<ImportCommitResultDto>('POST', `/imports/${imp.id}/commit`, undefined, {}, LONG_CALL);
    if (!res.ok) {
      setPending(null);
      setError(res.error);
      return;
    }
    onImported(res.data);
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

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Card className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
        <div>
          <h2 className="font-semibold">Check before importing</h2>
          <p className="mt-1 text-sm text-ink-muted tabular">
            {c.total} rows detected: {c.valid} valid, {c.duplicate} duplicate, {c.invalid} invalid
          </p>
          {c.duplicate + c.invalid > 0 ? (
            <p className="mt-1 text-sm text-ink-muted">Duplicate and invalid rows are skipped. Only the valid orders are imported.</p>
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

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={commit} disabled={pending !== null || c.orders === 0}>
            {pending === 'importing' ? 'Importing…' : `Import ${c.orders} Orders`}
          </Button>
          <Button variant="secondary" onClick={onBack} disabled={pending !== null}>
            Back to mapping
          </Button>
          {c.duplicate + c.invalid > 0 ? (
            <Button asChild variant="link" className="ml-1">
              <a href={`/api/imports/${imp.id}/rejected.csv`} download>
                <Download className="h-4 w-4" /> Download rejected rows
              </a>
            </Button>
          ) : null}
        </div>
      </Card>

      <section className="flex min-w-0 flex-col gap-3" aria-label="Checked rows">
        <div role="tablist" aria-label="Rows by result" className="flex flex-wrap gap-1 rounded-xl border border-line bg-card p-1 sm:w-fit">
          {TABS.map((t) => {
            const selected = t.status === tab;
            return (
              <Button
                key={t.status}
                ref={(el) => {
                  tabRefs.current[t.status] = el;
                }}
                role="tab"
                id={`tab-${t.status}`}
                aria-selected={selected}
                aria-controls={`panel-${t.status}`}
                tabIndex={selected ? 0 : -1}
                variant="ghost"
                size="sm"
                className={cn('flex-1 sm:flex-none', selected && 'bg-brand-soft text-ink hover:bg-brand-soft')}
                onClick={() => setTab(t.status)}
                onKeyDown={onTabKey}
              >
                {t.label} <span className="tabular text-ink-faint">{counts[t.status]}</span>
              </Button>
            );
          })}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-w-0">
          {/* key: a new tab starts at page 1. */}
          <PreviewRows key={tab} imp={imp} status={tab} />
        </div>
      </section>
    </div>
  );
}
