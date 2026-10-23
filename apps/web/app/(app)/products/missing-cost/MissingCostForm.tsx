'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatTaka, parseTaka } from '@ph/shared';
import { api } from '@/lib/client-api';
import { navigateFresh } from '@/lib/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface MissingCostRow {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  unitsSold: number;
  orderCount: number;
}

/** FR-IMP-11: one screen, one cost input per product. Costs apply from today; past orders keep theirs. */
export function MissingCostForm({ rows }: { rows: MissingCostRow[] }) {
  const router = useRouter();
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const items: Array<{ productId: string; costPrice: number }> = [];
    for (const row of rows) {
      const value = costs[row.id]?.trim();
      if (!value) continue;
      const costPrice = parseTaka(value);
      if (costPrice === null) {
        setError(`"${value}" is not a valid cost for ${row.name}.`);
        return;
      }
      items.push({ productId: row.id, costPrice });
    }
    if (items.length === 0) {
      setError('Enter at least one cost.');
      return;
    }
    setPending(true);
    const res = await api('PATCH', '/products/bulk-cost', { items });
    setPending(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    navigateFresh(router, '/dashboard');
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Card className="divide-y divide-line/60">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{row.name}</div>
              <div className="text-xs text-ink-faint">
                {row.sku} · sells at {formatTaka(row.sellingPrice)} · {row.unitsSold} sold
              </div>
            </div>
            <Label className="sr-only" htmlFor={`cost-${row.id}`}>
              Cost of {row.name} in taka
            </Label>
            <div className="flex items-center gap-1">
              <span className="text-ink-muted">৳</span>
              <Input
                id={`cost-${row.id}`}
                inputMode="decimal"
                className="tabular sm:w-28"
                placeholder="Cost"
                value={costs[row.id] ?? ''}
                onChange={(e) => setCosts((c) => ({ ...c, [row.id]: e.target.value }))}
              />
            </div>
          </div>
        ))}
      </Card>
      <p className="text-sm text-ink-muted">
        New costs apply to orders from today. Orders already saved keep the cost they were made with.
      </p>
      <div>
        <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
          {pending ? 'Saving…' : 'Save costs'}
        </Button>
      </div>
    </form>
  );
}
