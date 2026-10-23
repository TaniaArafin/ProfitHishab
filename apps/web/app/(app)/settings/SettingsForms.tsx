'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { parseTaka, toTaka, type BusinessDto, type CourierDto } from '@ph/shared';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { SelectField } from '@/components/SelectField';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { refreshData } from '@/lib/navigation';

/** Blank means 0 for these defaults. */
const poisha = (taka: string) => parseTaka(taka) ?? 0;

/** FR-BIZ-01..03: business details, default courier and the cost defaults that prefill orders. */
export function BusinessSettingsForm({ business, couriers }: { business: BusinessDto; couriers: CourierDto[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: business.name,
    phone: business.phone ?? '',
    address: business.address ?? '',
    city: business.city ?? '',
    facebookPageUrl: business.facebookPageUrl ?? '',
    defaultCourierId: business.defaultCourierId ?? '',
    defaultCourierCost: String(toTaka(business.defaultCourierCost)),
    defaultReturnCost: String(toTaka(business.defaultReturnCost)),
    defaultPackagingCost: String(toTaka(business.defaultPackagingCost)),
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setSaved(false);
    const res = await api('PATCH', '/business', {
      name: form.name,
      phone: form.phone,
      address: form.address,
      city: form.city,
      facebookPageUrl: form.facebookPageUrl,
      defaultCourierId: form.defaultCourierId || null,
      defaultCourierCost: poisha(form.defaultCourierCost),
      defaultReturnCost: poisha(form.defaultReturnCost),
      defaultPackagingCost: poisha(form.defaultPackagingCost),
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setSaved(true);
    refreshData(router);
  }

  return (
    <Card className="w-full max-w-3xl">
      <form onSubmit={submit} className="flex flex-col gap-4 p-4 sm:p-5" noValidate>
        <h2 className="font-semibold">Business</h2>
        {saved ? (
          <Alert variant="success" role="status">
            Settings saved.
          </Alert>
        ) : null}
        {error ? <Alert variant="destructive">{error.message}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="biz-name">Business name</Label>
            <Input id="biz-name" value={form.name} onChange={set('name')} />
            {fieldError(error, 'name') ? <p className="mt-1 text-sm text-loss">{fieldError(error, 'name')}</p> : null}
          </div>
          <div>
            <Label htmlFor="biz-phone">Phone</Label>
            <Input id="biz-phone" value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <Label htmlFor="biz-city">City</Label>
            <Input id="biz-city" value={form.city} onChange={set('city')} />
          </div>
          <div>
            <Label htmlFor="biz-fb">Facebook page</Label>
            <Input id="biz-fb" value={form.facebookPageUrl} onChange={set('facebookPageUrl')} placeholder="https://facebook.com/yourpage" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="biz-address">Address</Label>
            <Input id="biz-address" value={form.address} onChange={set('address')} />
          </div>
        </div>

        <h2 className="mt-2 font-semibold">Order defaults</h2>
        <p className="-mt-2 text-sm text-ink-muted">Prefill new orders. Changing them does not change existing orders.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="biz-courier">Default courier</Label>
            <SelectField
              id="biz-courier"
              value={form.defaultCourierId}
              onValueChange={(value) => set('defaultCourierId')({ target: { value } })}
              options={[{ value: '', label: 'None' }, ...couriers.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
          <div>
            <Label htmlFor="biz-courier-cost">Courier cost per order (৳)</Label>
            <Input
              id="biz-courier-cost"
              inputMode="decimal"
              className="tabular"
              value={form.defaultCourierCost}
              onChange={set('defaultCourierCost')}
            />
          </div>
          <div>
            <Label htmlFor="biz-return-cost">Return charge per order (৳)</Label>
            <Input
              id="biz-return-cost"
              inputMode="decimal"
              className="tabular"
              value={form.defaultReturnCost}
              onChange={set('defaultReturnCost')}
            />
          </div>
          <div>
            <Label htmlFor="biz-packaging-cost">Packaging per order (৳)</Label>
            <Input
              id="biz-packaging-cost"
              inputMode="decimal"
              className="tabular"
              value={form.defaultPackagingCost}
              onChange={set('defaultPackagingCost')}
            />
          </div>
        </div>
        <div>
          <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
            {pending ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

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
