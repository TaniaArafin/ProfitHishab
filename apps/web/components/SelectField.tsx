'use client';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type SelectOption = { value: string; label: string };

// Radix reserves "" for "nothing selected", but our filters use "" for "All …". Map it to a sentinel.
const EMPTY = '__empty__';
const fromRadix = (v: string) => (v === EMPTY ? '' : v);

type Props = {
  options: SelectOption[];
  /** Goes on the trigger button, so `<label htmlFor>` works. */
  id?: string;
  /** Submits the value with the surrounding form (GET filter forms). */
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

/** The app's dropdown: shadcn Select over a flat list of options, usable controlled or inside a plain form. */
export function SelectField({
  options,
  id,
  name,
  value,
  defaultValue = '',
  onValueChange,
  placeholder,
  className,
  disabled,
  ...aria
}: Props) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const hasEmptyOption = options.some((o) => o.value === '');
  // With no "" option, "" means unset and Radix shows the placeholder.
  const toRadix = (v: string) => (v === '' && hasEmptyOption ? EMPTY : v);

  return (
    <>
      <Select
        value={toRadix(current)}
        disabled={disabled}
        onValueChange={(v) => {
          const next = fromRadix(v);
          setInner(next);
          onValueChange?.(next);
        }}
      >
        <SelectTrigger id={id} className={className} aria-label={aria['aria-label']}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={toRadix(o.value)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {name ? <input type="hidden" name={name} value={current} /> : null}
    </>
  );
}
