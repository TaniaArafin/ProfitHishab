'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { parseTaka, toTaka, type CourierDto } from '@ph/shared';
import { api } from '@/lib/client-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { refreshData } from '@/lib/navigation';

/** Blank means 0 for these defaults. */
const poisha = (taka: string) => parseTaka(taka) ?? 0;

/** FR-BIZ-04: what one courier charges, and whether it is offered on new orders. */
export function CourierRow({ courier }: { courier: CourierDto }) {
  const router = useRouter();
  const [cost, setCost] = useState(String(toTaka(courier.defaultCost)));
  const [returnCost, setReturnCost] = useState(String(toTaka(courier.defaultReturnCost)));
  const [status, setStatus] = useState<string | null>(null);

  async function save(patch: Partial<CourierDto>) {
    const res = await api('PATCH', `/couriers/${courier.id}`, patch);
    setStatus(res.ok ? 'Saved' : res.error.message);
    refreshData(router);
  }

  return (
    <div className="grid grid-cols-2 items-end gap-3 py-3 sm:flex sm:flex-wrap">
      <div className="col-span-2 min-w-0 sm:min-w-[120px] sm:flex-1">
        <div className={cn('truncate font-medium', !courier.isActive && 'text-ink-faint line-through')}>{courier.name}</div>
        {status ? (
          <div className="text-xs text-ink-faint" role="status">
            {status}
          </div>
        ) : null}
      </div>
      <div className="sm:w-28">
        <Label className="text-xs" htmlFor={`c-cost-${courier.id}`}>
          Cost (৳)
        </Label>
        <Input id={`c-cost-${courier.id}`} inputMode="decimal" className="tabular" value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
      <div className="sm:w-28">
        <Label className="text-xs" htmlFor={`c-ret-${courier.id}`}>
          Return (৳)
        </Label>
        <Input
          id={`c-ret-${courier.id}`}
          inputMode="decimal"
          className="tabular"
          value={returnCost}
          onChange={(e) => setReturnCost(e.target.value)}
        />
      </div>
      <Button type="button" variant="secondary" onClick={() => save({ defaultCost: poisha(cost), defaultReturnCost: poisha(returnCost) })}>
        Save
      </Button>
      <Button type="button" variant="link" className="min-h-10 justify-self-start" onClick={() => save({ isActive: !courier.isActive })}>
        {courier.isActive ? 'Deactivate' : 'Activate'}
      </Button>
    </div>
  );
}
