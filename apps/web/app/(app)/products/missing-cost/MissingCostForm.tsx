'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatTaka, parseTaka } from '@ph/shared';
import { api } from '@/lib/client-api';
import { navigateFresh } from '@/lib/navigation';

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
      {error ? <p className="rounded-md bg-loss-soft px-3 py-2 text-sm text-loss">{error}</p> : null}
      <div className="card divide-y divide-line/60">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-[180px] flex-1">
              <div className="font-medium">{row.name}</div>
              <div className="text-xs text-ink-faint">
                {row.sku} · sells at {formatTaka(row.sellingPrice)} · {row.unitsSold} sold
              </div>
            </div>
            <label className="sr-only" htmlFor={`cost-${row.id}`}>
              Cost of {row.name} in taka
            </label>
            <div className="flex items-center gap-1">
              <span className="text-ink-muted">৳</span>
              <input
                id={`cost-${row.id}`}
                inputMode="decimal"
                className="input w-28 tabular"
                placeholder="Cost"
                value={costs[row.id] ?? ''}
                onChange={(e) => setCosts((c) => ({ ...c, [row.id]: e.target.value }))}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-ink-muted">
        New costs apply to orders from today. Orders already saved keep the cost they were made with.
      </p>
      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save costs'}
        </button>
      </div>
    </form>
  );
}
