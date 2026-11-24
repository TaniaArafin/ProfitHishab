'use client';

import { useRouter } from 'next/navigation';
import { currentMonthIn } from '@ph/shared';
import { SelectField } from '@/components/SelectField';
import { Label } from '@/components/ui/label';
import { navigateFresh } from '@/lib/navigation';
import { monthLabel } from '@/lib/period';

const MONTHS_SHOWN = 24;

/** The 24 months up to the later of this month and `value`, newest first. */
function monthOptions(value: string): string[] {
  const now = currentMonthIn();
  const [y, m] = (value > now ? value : now).split('-').map(Number) as [number, number];
  return Array.from({ length: MONTHS_SHOWN }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
}

/** Picks the last month a 12-month report shows; navigates to `basePath?to=YYYY-MM`. */
export function MonthPicker({ value, basePath }: { value: string; basePath: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="report-month" className="whitespace-nowrap text-sm text-ink-muted">
        Up to month
      </Label>
      <SelectField
        id="report-month"
        className="w-36"
        value={value}
        onValueChange={(month) => navigateFresh(router, `${basePath}?to=${month}`)}
        options={monthOptions(value).map((month) => ({ value: month, label: monthLabel(month) }))}
      />
    </div>
  );
}
