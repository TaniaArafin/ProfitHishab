'use client';

import { formatTaka, type CustomerProfileDto } from '@ph/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  phone: string;
  onPhoneChange: (phone: string) => void;
  customer: CustomerProfileDto | null | undefined;
  name: string;
  onNameChange: (name: string) => void;
  address: string;
  onAddressChange: (address: string) => void;
  phoneError?: string;
}

/** Phone first: an existing customer shows their history, a new number asks for a name. */
export function CustomerFields({ phone, onPhoneChange, customer, name, onNameChange, address, onAddressChange, phoneError }: Props) {
  return (
    <Card role="region" aria-labelledby="customer-heading">
      <CardHeader>
        <CardTitle id="customer-heading">Customer</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            placeholder="017XXXXXXXX"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            aria-invalid={phoneError ? true : undefined}
            aria-describedby={phoneError ? 'phone-error' : undefined}
            autoFocus
          />
          {phoneError ? (
            <p id="phone-error" className="mt-1 text-sm text-loss">
              {phoneError}
            </p>
          ) : null}
        </div>
        {customer ? (
          <div className="rounded-xl bg-paper px-3 py-2 text-sm" aria-live="polite">
            <div className="break-words font-semibold">{customer.name}</div>
            <div className={customer.returnedOrders > 0 ? 'text-loss' : 'text-ink-muted'}>
              {customer.totalOrders} order{customer.totalOrders === 1 ? '' : 's'} · {customer.returnedOrders} returned ·{' '}
              {formatTaka(customer.totalSpent)} spent
            </div>
          </div>
        ) : customer === null ? (
          <div>
            <Label htmlFor="customer-name">
              Name <span className="font-normal text-ink-faint">(new customer)</span>
            </Label>
            <Input id="customer-name" value={name} onChange={(e) => onNameChange(e.target.value)} />
          </div>
        ) : null}
        <div>
          <Label htmlFor="address">Delivery address</Label>
          <Textarea id="address" className="min-h-0" rows={2} value={address} onChange={(e) => onAddressChange(e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}
