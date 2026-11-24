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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

/**
 * One wrong or duplicate row in a window: its cells as inputs, each error under its field. It closes once the
 * row is fixed (or moves to another list), and stays open with the new error otherwise.
 */
export function FixRow({
  imp,
  row,
  onFixed,
  onClose,
}: {
  imp: ImportDto;
  row: ImportRowDto;
  onFixed: (result: ImportRowEditDto) => void;
  onClose: () => void;
}) {
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
    if (res.data.row.status !== row.status) onClose();
    onFixed(res.data);
  }

  const title = `Fix row ${row.rowNumber}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          // Start on the first wrong field, not the first field.
          const first = fields.find((t) => current.problems[t]);
          const input = first ? document.getElementById(`fix-${row.rowNumber}-${first}`) : null;
          if (input) {
            e.preventDefault();
            input.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {current.status === 'duplicate'
              ? 'This row looks like an order you already have. Change it only if it is a different order.'
              : 'Correct the highlighted values, then save.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            {fields.map((target) => {
              const id = `fix-${row.rowNumber}-${target}`;
              const problem = current.problems[target];
              return (
                <div key={target} className={cn('flex min-w-0 flex-col gap-1', !SHORT_FIELDS.has(target) && 'col-span-2')}>
                  <Label htmlFor={id}>{IMPORT_TARGET_LABELS[target]}</Label>
                  <Input
                    id={id}
                    value={valueOf(target)}
                    onChange={(e) => setValues({ ...values, [target]: e.target.value })}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? `${id}-error` : undefined}
                    className="aria-[invalid=true]:focus:border-loss aria-[invalid=true]:focus:ring-0"
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
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" aria-label={`Save row ${row.rowNumber}`} disabled={changed.length === 0 || pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
