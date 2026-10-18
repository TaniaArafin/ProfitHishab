'use client';

// shadcn/ui Calendar over react-day-picker v9, themed with the schist tokens.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';

const navButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card text-ink-muted transition hover:bg-brand-soft hover:text-ink disabled:opacity-40';

function Calendar({ className, classNames, showOutsideDays = true, ...props }: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('text-sm', className)}
      classNames={{
        months: 'relative flex flex-col gap-6 sm:flex-row',
        month: 'flex flex-col gap-3',
        month_caption: 'flex h-8 items-center justify-center',
        caption_label: 'text-sm font-semibold',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous: navButton,
        button_next: navButton,
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-[11px] font-medium uppercase text-ink-faint',
        week: 'mt-1 flex w-full',
        day: 'relative h-9 w-9 p-0 text-center',
        day_button:
          'h-9 w-9 rounded-lg font-medium tabular transition-colors hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        today: 'font-bold text-brand',
        selected: '[&>button]:bg-brand [&>button]:text-schist-100 [&>button]:hover:bg-brand',
        range_start: 'rounded-l-lg bg-brand-soft',
        range_end: 'rounded-r-lg bg-brand-soft',
        range_middle: 'bg-brand-soft [&>button]:!bg-transparent [&>button]:!text-ink [&>button]:rounded-none',
        outside: 'text-ink-faint/60',
        disabled: 'opacity-40',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => (orientation === 'left' ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />),
      }}
      {...props}
    />
  );
}

export { Calendar };
