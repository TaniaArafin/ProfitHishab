'use client';

import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { MAX_OPTION_VALUES } from '@ph/shared';
import { Input } from '@/components/ui/input';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Values as removable chips; a value is added with Enter, a comma or leaving the box. Repeats (any case) are ignored. */
export function ChipsInput({
  values,
  onChange,
  groupLabel,
  inputLabel,
  placeholder = 'Type a value, press Enter',
}: {
  values: string[];
  onChange: (values: string[]) => void;
  groupLabel: string;
  inputLabel: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const fresh = draft
      .split(',')
      .map((v) => v.trim().slice(0, 40))
      .filter((v) => v && !values.some((x) => same(x, v)));
    const unique = fresh.filter((v, i) => fresh.findIndex((w) => same(w, v)) === i);
    if (unique.length > 0) onChange([...values, ...unique].slice(0, MAX_OPTION_VALUES));
    setDraft('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };
  return (
    <div role="group" aria-label={groupLabel} className="flex min-w-0 flex-wrap items-center gap-1.5">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-sm">
          {v}
          <button
            type="button"
            className="rounded-full text-ink-muted hover:text-ink"
            aria-label={`Remove ${v}`}
            onClick={() => onChange(values.filter((x) => x !== v))}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <Input
        aria-label={inputLabel}
        placeholder={values.length ? 'Add…' : placeholder}
        className="h-8 w-40 min-w-0 flex-1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  );
}
