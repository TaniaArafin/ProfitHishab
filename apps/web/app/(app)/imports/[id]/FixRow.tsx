'use client';

import { useState, type FormEvent } from 'react';
import {
  IMPORT_ROW_REASON_LABELS,
  IMPORT_TARGET_LABELS,
  type ImportDto,
  type ImportRowDto,
  type ImportRowEditDto,
  type ImportTarget,
} from '@ph/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/utils';

/** Always shown, so the seller can tell which order this is; a wrong optional field joins them. */
const KEY_FIELDS: ImportTarget[] = ['externalRef', 'phone', 'product', 'quantity', 'sellingPrice', 'orderDate'];
/** Small numbers: two fit side by side on a phone. */
const SHORT_FIELDS = new Set<ImportTarget>(['quantity', 'sellingPrice']);
/** Problems about the row as a whole, which no single field can show. */
const ROW_REASONS = new Set(['order_conflict', 'order_row_invalid', 'duplicate_row', 'duplicate_in_file']);

/** One wrong or duplicate row: its cells as inputs, each error under its field, saved in place. */
export function FixRow({ imp, row, onFixed }: { imp: ImportDto; row: ImportRowDto; onFixed: (result: ImportRowEditDto) => void }) {
  const columns = imp.mapping?.columns ?? {};
  // The latest save answers before the list reloads, so its errors show at once.
  const [saved, setSaved] = useState<ImportRowDto | null>(null);
  const current = saved ?? row;
  const fields = [...new Set([...KEY_FIELDS, ...(Object.keys(current.problems) as ImportTarget[])])].filter((t) => columns[t]);
  const [values, setValues] = useState<Partial<Record<ImportTarget, string>>>(() =>
    Object.fromEntries(fields.map((t) => [t, row.raw[columns[t]!] ?? ''])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A field that only became wrong after a save has no typed value yet: it shows the file's.
  const valueOf = (t: ImportTarget) => values[t] ?? current.raw[columns[t]!] ?? '';
  const changed = fields.filter((t) => valueOf(t) !== (current.raw[columns[t]!] ?? ''));
  const rowNotes = current.reasons.filter((r) => ROW_REASONS.has(r)).map((r) => IMPORT_ROW_REASON_LABELS[r]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (changed.length === 0 || pending) return;
    setPending(true);
    setError(null);
    const cells = Object.fromEntries(changed.map((t) => [columns[t]!, valueOf(t)]));
    const res = await api<ImportRowEditDto>('PATCH', `/imports/${imp.id}/rows/${row.rowNumber}`, { cells });
    setPending(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSaved(res.data.row);
    onFixed(res.data);
  }

  return (
    <Card className={cn('min-w-0 p-3 sm:p-4', current.status === 'duplicate' ? 'border-warn/40' : 'border-loss/30')}>
      <form onSubmit={save} aria-label={`Fix row ${row.rowNumber}`} className="flex flex-col gap-3" noValidate>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold tabular">Row {row.rowNumber}</span>
          <Button type="submit" size="sm" aria-label={`Save row ${row.rowNumber}`} disabled={changed.length === 0 || pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
          {fields.map((target) => {
            const id = `fix-${row.rowNumber}-${target}`;
            const problem = current.problems[target];
            return (
              <div key={target} className={cn('flex min-w-0 flex-col gap-1', !SHORT_FIELDS.has(target) && 'col-span-2 lg:col-span-1')}>
                <Label htmlFor={id}>{IMPORT_TARGET_LABELS[target]}</Label>
                <Input
                  id={id}
                  value={valueOf(target)}
                  onChange={(e) => setValues({ ...values, [target]: e.target.value })}
                  aria-invalid={problem ? true : undefined}
                  aria-describedby={problem ? `${id}-error` : undefined}
                  className={cn(problem && 'border-loss bg-loss-soft/40 focus-visible:ring-loss')}
                />
                {problem ? (
                  <p id={`${id}-error`} className="text-xs text-loss">
                    {problem}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        {rowNotes.length > 0 ? <p className="text-sm text-loss">{rowNotes.join('; ')}</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
