'use client';

import { useState, type FormEvent } from 'react';
import { parseTaka, toTaka, type BusinessDto, type CourierDto } from '@ph/shared';
import { SelectField } from '@/components/SelectField';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBusinessSave } from '../useBusinessSave';

/** Blank means 0 for these defaults. */
const poisha = (taka: string) => parseTaka(taka) ?? 0;

/** FR-BIZ-02/03: the default courier and the costs that prefill new and imported orders. */
export function ProfitDefaultsForm({ business, couriers }: { business: BusinessDto; couriers: CourierDto[] }) {
  const { save, error, saved, pending } = useBusinessSave();
  const [form, setForm] = useState({
    defaultCourierId: business.defaultCourierId ?? '',
    defaultCourierCost: String(toTaka(business.defaultCourierCost)),
    defaultReturnCost: String(toTaka(business.defaultReturnCost)),
    defaultPackagingCost: String(toTaka(business.defaultPackagingCost)),
  });
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    void save({
      defaultCourierId: form.defaultCourierId || null,
      defaultCourierCost: poisha(form.defaultCourierCost),
      defaultReturnCost: poisha(form.defaultReturnCost),
      defaultPackagingCost: poisha(form.defaultPackagingCost),
    });
  }

  const money = (key: Exclude<keyof typeof form, 'defaultCourierId'>, id: string, label: string) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="decimal" className="tabular" value={form[key]} onChange={(e) => set(key)(e.target.value)} />
    </div>
  );

  return (
    <Card className="w-full max-w-3xl">
      <form onSubmit={submit} className="flex flex-col gap-4 p-4 sm:p-5" noValidate>
        <div>
          <h2 className="font-semibold">Order defaults</h2>
          <p className="text-sm text-ink-muted">Prefill new orders. Changing them does not change existing orders.</p>
        </div>
        {saved ? (
          <Alert variant="success" role="status">
            Defaults saved.
          </Alert>
        ) : null}
        {error ? <Alert variant="destructive">{error.message}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="biz-courier">Default courier</Label>
            <SelectField
              id="biz-courier"
              value={form.defaultCourierId}
              onValueChange={set('defaultCourierId')}
              options={[{ value: '', label: 'None' }, ...couriers.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
          {money('defaultCourierCost', 'biz-courier-cost', 'Courier cost per order (৳)')}
          {money('defaultReturnCost', 'biz-return-cost', 'Return charge per order (৳)')}
          {money('defaultPackagingCost', 'biz-packaging-cost', 'Packaging per order (৳)')}
        </div>
        <div>
          <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
            {pending ? 'Saving…' : 'Save defaults'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
