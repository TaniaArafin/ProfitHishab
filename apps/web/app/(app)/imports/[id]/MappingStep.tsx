'use client';

import { useState } from 'react';
import { IMPORT_TARGET_LABELS, IMPORT_TARGETS, REQUIRED_IMPORT_TARGETS, type ImportDto, type ImportTarget } from '@ph/shared';
import { SelectField } from '@/components/SelectField';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { checkFile, knownStatuses, saveAndCheck } from './checkFile';
import { SampleRows } from './SampleRows';

type Columns = Partial<Record<ImportTarget, string>>;

const REQUIRED: readonly ImportTarget[] = REQUIRED_IMPORT_TARGETS;

/** Which column of the file fills each order field. Prefilled from the saved mapping, else the API's guesses. */
export function MappingStep({
  imp,
  reviewStatuses = false,
  onStatuses,
  onChecked,
}: {
  imp: ImportDto;
  /** The seller came back to change the match, so show the statuses even when all are recognised. */
  reviewStatuses?: boolean;
  /** A status needs the seller's answer: next, match its texts to order statuses. */
  onStatuses: (mapped: ImportDto) => void;
  /** Nothing left to ask: the file was checked straight away. */
  onChecked: (checked: ImportDto) => void;
}) {
  const headers = [...new Set(imp.headers.filter((h) => h !== ''))];
  const [columns, setColumns] = useState<Columns>(() => {
    const start: Columns = imp.mapping?.columns ?? imp.suggestedColumns;
    return Object.fromEntries(Object.entries(start).filter(([, col]) => col && headers.includes(col)));
  });
  const [pending, setPending] = useState<'saving' | 'checking' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const missing = REQUIRED.filter((t) => !columns[t]);
  const optional = IMPORT_TARGETS.filter((t) => !REQUIRED.includes(t));
  const options = [{ value: '', label: 'Not in my file' }, ...headers.map((h) => ({ value: h, label: h }))];
  const example = (column: string | undefined) => (column ? imp.sampleRows.find((r) => r[column])?.[column] : undefined);

  async function save() {
    setPending('saving');
    setError(null);
    const saved = await api<ImportDto>('PUT', `/imports/${imp.id}/mapping`, { columns });
    if (!saved.ok) {
      setPending(null);
      setError(saved.error);
      return;
    }
    const statuses = columns.status && !reviewStatuses ? knownStatuses(saved.data) : null;
    if (columns.status && !statuses) {
      onStatuses(saved.data);
      return;
    }
    setPending('checking');
    const checked = statuses ? await saveAndCheck(imp.id, { columns, statuses }) : await checkFile(imp.id);
    if (!checked.ok) {
      setPending(null);
      setError(checked.error);
      return;
    }
    onChecked(checked.data);
  }

  const field = (target: ImportTarget) => {
    const required = REQUIRED.includes(target);
    const sample = example(columns[target]);
    const problem = fieldError(error, `columns.${target}`);
    return (
      <div key={target} className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`map-${target}`}>
          {IMPORT_TARGET_LABELS[target]}
          {required ? (
            <>
              <span aria-hidden className="text-loss">
                {' '}
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          ) : null}
        </Label>
        <SelectField
          id={`map-${target}`}
          options={options}
          value={columns[target] ?? ''}
          onValueChange={(col) => setColumns({ ...columns, [target]: col || undefined })}
        />
        {problem ? (
          <p className="text-xs text-loss">{problem}</p>
        ) : sample ? (
          <p className="truncate text-xs text-ink-faint">e.g. {sample}</p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Card className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Which column is which?</h2>
          <p className="mt-1 text-sm text-ink-muted">Pick the column in your file for each detail. We filled in what we could recognise.</p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{REQUIRED.map(field)}</div>
        <details className="rounded-xl border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">More columns (optional)</summary>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{optional.map(field)}</div>
        </details>
        {missing.length > 0 ? (
          <p className="text-sm text-ink-muted">Choose a column for: {missing.map((t) => IMPORT_TARGET_LABELS[t]).join(', ')}</p>
        ) : null}
        {error ? <Alert variant="destructive">{error.message}</Alert> : null}
        <div>
          <Button onClick={save} disabled={missing.length > 0 || pending !== null}>
            {pending === 'checking' ? 'Checking your file…' : pending === 'saving' ? 'Saving…' : 'Review orders'}
          </Button>
        </div>
      </Card>
      <SampleRows imp={imp} />
    </div>
  );
}
