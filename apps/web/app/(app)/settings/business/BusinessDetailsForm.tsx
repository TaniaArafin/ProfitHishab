'use client';

import { useState, type FormEvent } from 'react';
import { BUSINESS_TYPES, type BusinessDto } from '@ph/shared';
import { fieldError } from '@/lib/client-api';
import { SelectField } from '@/components/SelectField';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBusinessSave } from '../useBusinessSave';

/** FR-BIZ-01: the business's name and contact details. */
export function BusinessDetailsForm({ business }: { business: BusinessDto }) {
  const { save, error, saved, pending } = useBusinessSave();
  const [form, setForm] = useState({
    name: business.name,
    phone: business.phone ?? '',
    address: business.address ?? '',
    city: business.city ?? '',
    facebookPageUrl: business.facebookPageUrl ?? '',
    businessType: business.businessType ?? '',
  });
  // An older free-text type stays selectable until the seller picks one of the list.
  const types = [
    ...BUSINESS_TYPES,
    ...(form.businessType && !(BUSINESS_TYPES as readonly string[]).includes(form.businessType) ? [form.businessType] : []),
  ];
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    void save(form);
  }

  return (
    <Card className="w-full max-w-3xl">
      <form onSubmit={submit} className="flex flex-col gap-4 p-4 sm:p-5" noValidate>
        <h2 className="font-semibold">Business details</h2>
        {saved ? (
          <Alert variant="success" role="status">
            Business details saved.
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
            <Label htmlFor="biz-type">Business type</Label>
            <SelectField
              id="biz-type"
              value={form.businessType}
              onValueChange={(v) => setForm((f) => ({ ...f, businessType: v }))}
              placeholder="Choose…"
              options={types.map((t) => ({ value: t, label: t }))}
            />
            <p className="mt-1 text-xs text-ink-faint">Sets the unit, options and details a new product starts with.</p>
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
        <div>
          <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
            {pending ? 'Saving…' : 'Save details'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
