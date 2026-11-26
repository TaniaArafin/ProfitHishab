'use client';

import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { MAX_OPTION_VALUES, MAX_OPTIONS, type OptionListDto } from '@ph/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { newId, type OptionDraft } from './drafts';

type Props = {
  options: OptionDraft[];
  onChange: (options: OptionDraft[]) => void;
  /** Option names the business type suggests ("Size", "Colour"). */
  suggestions: string[];
  /** Saved lists (Settings → Product options). */
  optionLists: OptionListDto[];
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Up to 3 options, each with its values as chips; a value is added with Enter or a comma. */
export function OptionsEditor({ options, onChange, suggestions, optionLists }: Props) {
  const full = options.length >= MAX_OPTIONS;
  const has = (name: string) => options.some((o) => same(o.name, name));

  const add = (name = '', values: string[] = []) => {
    const existing = options.find((o) => name && same(o.name, name));
    if (existing) {
      update(existing.id, { values: values.length ? [...values] : existing.values });
      return;
    }
    if (!full) onChange([...options, { id: newId(), name, values: [...values] }]);
  };
  const update = (id: string, patch: Partial<OptionDraft>) => onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const remove = (id: string) => onChange(options.filter((o) => o.id !== id));

  const freeSuggestions = suggestions.filter((s) => !has(s));
  return (
    <section aria-labelledby="options-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="options-heading" className="text-sm font-semibold">
            Options
          </h2>
          <p className="text-xs text-ink-muted">Sizes, colours, pack sizes… Leave empty for a product with one price.</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => add()} disabled={full}>
          Add option
        </Button>
      </div>

      {freeSuggestions.length > 0 || optionLists.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {freeSuggestions.map((s) => (
            <Button key={s} type="button" variant="secondary" size="sm" className="h-7 px-2" disabled={full} onClick={() => add(s)}>
              + {s}
            </Button>
          ))}
          {optionLists.length > 0 ? <span className="ml-1 text-ink-muted">Saved:</span> : null}
          {optionLists.map((l) => (
            <Button
              key={l.id}
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2"
              aria-label={`Use saved list ${l.name}`}
              disabled={full && !has(l.name)}
              onClick={() => add(l.name, l.values)}
            >
              {l.name}
            </Button>
          ))}
        </div>
      ) : null}

      {options.map((o, i) => (
        <OptionRow key={o.id} index={i} option={o} onChange={(patch) => update(o.id, patch)} onRemove={() => remove(o.id)} />
      ))}
    </section>
  );
}

function OptionRow({
  index,
  option,
  onChange,
  onRemove,
}: {
  index: number;
  option: OptionDraft;
  onChange: (patch: Partial<OptionDraft>) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState('');
  const label = option.name.trim() || `option ${index + 1}`;

  const commit = () => {
    const fresh = draft
      .split(',')
      .map((v) => v.trim().slice(0, 40))
      .filter((v) => v && !option.values.some((x) => same(x, v)));
    const unique = fresh.filter((v, i) => fresh.findIndex((w) => same(w, v)) === i);
    if (unique.length > 0) onChange({ values: [...option.values, ...unique].slice(0, MAX_OPTION_VALUES) });
    setDraft('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && option.values.length > 0) {
      onChange({ values: option.values.slice(0, -1) });
    }
  };

  return (
    <div className="grid gap-2 rounded-md border border-ink/10 p-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-start">
      <Input
        aria-label={`Option ${index + 1} name`}
        placeholder="Size"
        maxLength={40}
        value={option.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <div role="group" aria-label={`${label} values`} className="flex min-w-0 flex-wrap items-center gap-1.5">
        {option.values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-sm">
            {v}
            <button
              type="button"
              className="rounded-full text-ink-muted hover:text-ink"
              aria-label={`Remove ${v} from ${label}`}
              onClick={() => onChange({ values: option.values.filter((x) => x !== v) })}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <Input
          aria-label={`Add a value to ${label}`}
          placeholder={option.values.length ? 'Add…' : 'Type a value, press Enter'}
          className="h-8 w-40 min-w-0 flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
      </div>
      <Button type="button" variant="ghost" size="sm" className="justify-self-end text-ink-muted" onClick={onRemove}>
        Remove option
      </Button>
    </div>
  );
}
