'use client';

import { CalendarDays } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { SelectField } from '@/components/SelectField';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { periodLabel } from '@/lib/period';

const PRESETS = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'last-7-days', label: 'Last 7 days' },
  { value: 'last-30-days', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

/** "2026-10-01" ⇄ a local Date at midnight, so the calendar shows the same day the URL names. */
const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Keeps the period in the URL so the page renders on the server and can be shared (FR-DASH-01). */
export function PeriodSelector({ preset, from, to }: { preset: string; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState(preset);
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({ from: toDate(from), to: toDate(to) });

  function go(params: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete('page');
    router.push(`${pathname}?${sp.toString()}`);
  }

  function apply() {
    if (!range?.from || !range.to) return;
    setOpen(false);
    go({ period: null, from: toIso(range.from), to: toIso(range.to) });
  }

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="period-preset">
        Period
      </label>
      <SelectField
        id="period-preset"
        className="w-auto min-w-[10rem]"
        value={mode}
        onValueChange={(next) => {
          setMode(next);
          if (next === 'custom') {
            setRange(undefined); // two clicks pick start and end, instead of nudging the old preset's range
            setOpen(true);
          } else go({ period: next, from: null, to: null });
        }}
        options={PRESETS}
      />
      {mode === 'custom' ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className="flex items-center gap-2 whitespace-nowrap rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] text-ink shadow-[0_1px_2px_rgba(24,31,20,0.04)] transition hover:border-ink/20 data-[state=open]:border-brand data-[state=open]:ring-4 data-[state=open]:ring-brand/10">
            <CalendarDays className="h-4 w-4 text-ink-faint" />
            {range?.from && range.to ? periodLabel(toIso(range.from), toIso(range.to)) : 'Pick dates'}
          </PopoverTrigger>
          {/* The period dropdown takes focus back as it closes; that must not close the calendar it just opened. */}
          <PopoverContent align="end" className="w-auto" onFocusOutside={(e) => e.preventDefault()}>
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={range?.from ?? toDate(from)}
              selected={range}
              onSelect={setRange}
              disabled={{ after: new Date() }}
            />
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
              <span className="text-sm text-ink-muted">
                {range?.from && range.to ? periodLabel(toIso(range.from), toIso(range.to)) : 'Choose a start and end date'}
              </span>
              <button type="button" className="btn-primary px-4 py-2" disabled={!range?.from || !range.to} onClick={apply}>
                Apply
              </button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
