'use client';

import { useState } from 'react';
import { ORDER_STATUS_LABELS, ORDER_STATUSES, type ImportDto, type OrderStatus } from '@ph/shared';
import { SelectField } from '@/components/SelectField';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { ApiError } from '@/lib/client-api';
import { saveAndCheck } from './checkFile';

const OPTIONS = ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }));

/** Each distinct text in the status column becomes one of our order statuses. */
export function StatusStep({
  imp,
  onBack,
  onChecked,
}: {
  /** The mapping response: its `statusValues` come from the chosen status column. */
  imp: ImportDto;
  onBack: () => void;
  onChecked: (checked: ImportDto) => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, OrderStatus | ''>>(() =>
    Object.fromEntries(imp.statusValues.map((v) => [v.value, imp.mapping?.statuses[v.value] ?? v.suggested ?? ''])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const complete = imp.statusValues.every((v) => statuses[v.value]);

  async function proceed() {
    if (!imp.mapping) return;
    setPending(true);
    setError(null);
    const res = await saveAndCheck(imp.id, { columns: imp.mapping.columns, statuses: statuses as Record<string, OrderStatus> });
    if (!res.ok) {
      setPending(false);
      setError(res.error);
      return;
    }
    onChecked(res.data);
  }

  return (
    <Card className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <div>
        <h2 className="font-semibold">Match your statuses</h2>
        <p className="mt-1 text-sm text-ink-muted">Choose what each status in your file means here.</p>
      </div>
      {imp.statusValues.length === 0 ? <p className="text-sm text-ink-muted">Your status column is empty.</p> : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {imp.statusValues.map((v, i) => (
          <div key={v.value} className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`status-${i}`} className="truncate">
              “{v.value || '(empty)'}” ({v.count} {v.count === 1 ? 'row' : 'rows'})
            </Label>
            <SelectField
              id={`status-${i}`}
              options={OPTIONS}
              value={statuses[v.value] ?? ''}
              placeholder="Choose a status"
              onValueChange={(s) => setStatuses({ ...statuses, [v.value]: s as OrderStatus })}
            />
          </div>
        ))}
      </div>
      {error ? <Alert variant="destructive">{error.message}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={proceed} disabled={!complete || pending}>
          {pending ? 'Checking your file…' : 'Check my file'}
        </Button>
        <Button variant="secondary" onClick={onBack} disabled={pending}>
          Back to columns
        </Button>
      </div>
    </Card>
  );
}
