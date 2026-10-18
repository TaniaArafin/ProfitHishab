'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { parseTaka, toTaka, type BusinessDto, type CourierDto } from '@ph/shared';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { SelectField } from '@/components/SelectField';

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
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card flex max-w-2xl flex-col gap-4 p-5" noValidate>
      <h2 className="font-semibold">Business</h2>
      {saved ? <p className="rounded-md bg-gain-soft px-3 py-2 text-sm text-gain">Settings saved.</p> : null}
      {error ? <p className="rounded-md bg-loss-soft px-3 py-2 text-sm text-loss">{error.message}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="biz-name">
            Business name
          </label>
          <input id="biz-name" className="input" value={form.name} onChange={set('name')} />
          {fieldError(error, 'name') ? <p className="mt-1 text-sm text-loss">{fieldError(error, 'name')}</p> : null}
        </div>
        <div>
          <label className="label" htmlFor="biz-phone">
            Phone
          </label>
          <input id="biz-phone" className="input" value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className="label" htmlFor="biz-city">
            City
          </label>
          <input id="biz-city" className="input" value={form.city} onChange={set('city')} />
        </div>
        <div>
          <label className="label" htmlFor="biz-fb">
            Facebook page
          </label>
          <input
            id="biz-fb"
            className="input"
            value={form.facebookPageUrl}
            onChange={set('facebookPageUrl')}
            placeholder="https://facebook.com/yourpage"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="biz-address">
            Address
          </label>
          <input id="biz-address" className="input" value={form.address} onChange={set('address')} />
        </div>
      </div>

      <h2 className="mt-2 font-semibold">Order defaults</h2>
      <p className="-mt-2 text-sm text-ink-muted">Prefill new orders. Changing them does not change existing orders.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="biz-courier">
            Default courier
          </label>
          <SelectField
            id="biz-courier"
            value={form.defaultCourierId}
            onValueChange={(value) => set('defaultCourierId')({ target: { value } })}
            options={[{ value: '', label: 'None' }, ...couriers.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>
        <div>
          <label className="label" htmlFor="biz-courier-cost">
            Courier cost per order (৳)
          </label>
          <input
            id="biz-courier-cost"
            inputMode="decimal"
            className="input tabular"
            value={form.defaultCourierCost}
            onChange={set('defaultCourierCost')}
          />
        </div>
        <div>
          <label className="label" htmlFor="biz-return-cost">
            Return charge per order (৳)
          </label>
          <input
            id="biz-return-cost"
            inputMode="decimal"
            className="input tabular"
            value={form.defaultReturnCost}
            onChange={set('defaultReturnCost')}
          />
        </div>
        <div>
          <label className="label" htmlFor="biz-packaging-cost">
            Packaging per order (৳)
          </label>
          <input
            id="biz-packaging-cost"
            inputMode="decimal"
            className="input tabular"
            value={form.defaultPackagingCost}
            onChange={set('defaultPackagingCost')}
          />
        </div>
      </div>
      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
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
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3 py-3">
      <div className="min-w-[120px] flex-1">
        <div className={`font-medium ${courier.isActive ? '' : 'text-ink-faint line-through'}`}>{courier.name}</div>
        {status ? <div className="text-xs text-ink-faint">{status}</div> : null}
      </div>
      <div className="w-28">
        <label className="label text-xs" htmlFor={`c-cost-${courier.id}`}>
          Cost (৳)
        </label>
        <input
          id={`c-cost-${courier.id}`}
          inputMode="decimal"
          className="input tabular"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
      </div>
      <div className="w-28">
        <label className="label text-xs" htmlFor={`c-ret-${courier.id}`}>
          Return (৳)
        </label>
        <input
          id={`c-ret-${courier.id}`}
          inputMode="decimal"
          className="input tabular"
          value={returnCost}
          onChange={(e) => setReturnCost(e.target.value)}
        />
      </div>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => save({ defaultCost: poisha(cost), defaultReturnCost: poisha(returnCost) })}
      >
        Save
      </button>
      <button type="button" className="text-sm text-ink-muted underline" onClick={() => save({ isActive: !courier.isActive })}>
        {courier.isActive ? 'Deactivate' : 'Activate'}
      </button>
    </div>
  );
}
