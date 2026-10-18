'use client';

import { formatTaka, type CustomerProfileDto } from '@ph/shared';

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
    <section className="card flex flex-col gap-4 p-5" aria-labelledby="customer-heading">
      <h2 id="customer-heading" className="font-semibold">
        Customer
      </h2>
      <div>
        <label className="label" htmlFor="phone">
          Phone
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          className="input"
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
          <div className="font-semibold">{customer.name}</div>
          <div className={customer.returnedOrders > 0 ? 'text-loss' : 'text-ink-muted'}>
            {customer.totalOrders} order{customer.totalOrders === 1 ? '' : 's'} · {customer.returnedOrders} returned ·{' '}
            {formatTaka(customer.totalSpent)} spent
          </div>
        </div>
      ) : customer === null ? (
        <div>
          <label className="label" htmlFor="customer-name">
            Name <span className="font-normal text-ink-faint">(new customer)</span>
          </label>
          <input id="customer-name" className="input" value={name} onChange={(e) => onNameChange(e.target.value)} />
        </div>
      ) : null}
      <div>
        <label className="label" htmlFor="address">
          Delivery address
        </label>
        <textarea id="address" className="input" rows={2} value={address} onChange={(e) => onAddressChange(e.target.value)} />
      </div>
    </section>
  );
}
