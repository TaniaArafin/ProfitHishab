'use client';

import { Pencil } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { type ImportDto, type ImportRowDto, type ImportRowEditDto, type ImportTarget } from '@ph/shared';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/utils';

/**
 * A value edited right in its row. It looks like text, shows a border and a pencil on hover, and a wrong
 * one has a thin red border (the row's message line says why). It saves on Enter or when the seller
 * leaves the box, only if the value changed.
 */
export function FixCell({
  imp,
  row,
  target,
  label,
  fit = false,
  describedBy,
  onFixed,
}: {
  imp: ImportDto;
  row: ImportRowDto;
  target: ImportTarget;
  /** The column's name in the seller's file. */
  label: string;
  /** In a table: as wide as its value, so nothing is cut off. */
  fit?: boolean;
  /** The id of the row's message line that explains what is wrong. */
  describedBy?: string;
  onFixed: (result: ImportRowEditDto) => void;
}) {
  const column = imp.mapping?.columns[target] ?? '';
  const original = row.raw[column] ?? '';
  const [value, setValue] = useState(original);
  // The last value sent, so Enter followed by leaving the box saves once.
  const [sent, setSent] = useState(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = row.problems[target];
  const id = `cell-${row.rowNumber}-${target}`;

  async function save() {
    if (value === sent || saving) return;
    setSaving(true);
    setError(null);
    setSent(value);
    const res = await api<ImportRowEditDto>('PATCH', `/imports/${imp.id}/rows/${row.rowNumber}`, { cells: { [column]: value } });
    setSaving(false);
    if (!res.ok) {
      setSent(original);
      setError(res.error.message);
      return;
    }
    onFixed(res.data);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    void save();
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="group relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => void save()}
          aria-label={`${label}, row ${row.rowNumber}`}
          aria-invalid={problem || error ? true : undefined}
          aria-describedby={error ? `${id}-error` : problem ? describedBy : undefined}
          title="Click to edit"
          disabled={saving}
          style={fit ? { width: `${Math.min(Math.max(value.length, 6), 28) + 4}ch` } : undefined}
          className={cn(
            '-mx-2 h-8 cursor-text rounded-lg px-2 py-1 pr-6 text-sm shadow-none focus:ring-0 sm:text-sm',
            // A right value looks like text until it is pointed at or clicked.
            problem || error
              ? 'border-loss bg-card focus:border-loss'
              : 'border-transparent bg-transparent hover:border-line hover:bg-card focus:border-brand focus:bg-card',
          )}
        />
        <Pencil
          className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint opacity-0 transition-opacity group-focus-within:opacity-0 group-hover:opacity-100"
          aria-hidden
        />
      </div>
      {saving ? (
        <span className="text-xs text-ink-faint">Saving…</span>
      ) : error ? (
        <span id={`${id}-error`} className="whitespace-normal text-xs text-loss">
          {error}
        </span>
      ) : null}
    </div>
  );
}
