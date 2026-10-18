'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import {
  CREATABLE_ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  orderTotals,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  parseTaka,
  toTaka,
  type BusinessDto,
  type CourierDto,
  type OrderDetailDto,
  type PaymentMethod,
  type ProductDto,
  type ProductPriceOnDto,
} from '@ph/shared';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { navigateFresh } from '@/lib/navigation';
import { SelectField } from '@/components/SelectField';
import { useCustomerLookup } from '@/lib/hooks';
import { CustomerFields } from './CustomerFields';
import { LineItems, type Line } from './LineItems';
import { OrderSummary } from './OrderSummary';

type CreatableStatus = (typeof CREATABLE_ORDER_STATUSES)[number];

/** Blank or invalid taka input counts as 0 while typing; the API validates the real values. */
const poishaOrZero = (taka: string) => parseTaka(taka) ?? 0;
const takaText = (poisha: number) => String(toTaka(poisha));

function defaultCourierCost(business: BusinessDto, courier?: CourierDto) {
  return courier && courier.defaultCost > 0 ? courier.defaultCost : business.defaultCourierCost;
}

export function OrderForm({
  business,
  couriers,
  today,
  initialPhone,
}: {
  business: BusinessDto;
  couriers: CourierDto[];
  today: string;
  initialPhone: string;
}) {
  const router = useRouter();
  const initialCourier = couriers.find((c) => c.id === business.defaultCourierId);

  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [courierId, setCourierId] = useState(initialCourier?.id ?? '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [orderDate, setOrderDate] = useState(today);
  const [status, setStatus] = useState<CreatableStatus>('new');
  const [discount, setDiscount] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState('');
  const [courierCost, setCourierCost] = useState(() => takaText(defaultCourierCost(business, initialCourier)));
  const [packagingCost, setPackagingCost] = useState(() => takaText(business.defaultPackagingCost));
  const [note, setNote] = useState('');
  // One key per order being entered: a retry after a timeout replays the same order instead
  // of creating a duplicate. A new key is issued only once an order is saved.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const customer = useCustomerLookup(phone);

  // Prefill the address once per looked-up customer, during render rather than in an Effect
  // (react.dev: "Adjusting some state when a prop changes").
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (customer && customer.id !== prefilledFor) {
    setPrefilledFor(customer.id);
    if (!address && customer.address) setAddress(customer.address);
  }

  // Derived during render from the same shared formula the API stores.
  const totals = orderTotals(
    lines.map((l) => ({ quantity: l.quantity, unitPrice: poishaOrZero(l.unitPrice), unitCost: l.unitCost })),
    {
      discount: poishaOrZero(discount),
      deliveryCharge: poishaOrZero(deliveryCharge),
      courierCost: poishaOrZero(courierCost),
      packagingCost: poishaOrZero(packagingCost),
    },
  );

  // A backdated order is priced as of its date (the API does the same when it saves). Only the
  // latest lookup may apply: picking another date while one is in flight makes it stale.
  const pricing = useRef(0);
  async function priceLinesOn(date: string, productIds: string[]) {
    const request = ++pricing.current;
    if (productIds.length === 0) return;
    const res = await api<ProductPriceOnDto[]>('GET', `/products/prices-on?ids=${productIds.join(',')}&date=${date}`);
    if (!res.ok || request !== pricing.current) return;
    const byId = new Map(res.data.map((p) => [p.productId, p]));
    setLines((prev) =>
      prev.map((l) => {
        const dated = byId.get(l.product.id);
        if (!dated) return l;
        return { ...l, unitCost: dated.costPrice, unitPrice: l.priceEdited ? l.unitPrice : takaText(dated.sellingPrice) };
      }),
    );
  }

  function changeOrderDate(date: string) {
    setOrderDate(date);
    if (date) void priceLinesOn(date, [...new Set(lines.map((l) => l.product.id))]);
  }

  function addProduct(product: ProductDto) {
    const line = {
      key: crypto.randomUUID(),
      product,
      quantity: 1,
      unitPrice: takaText(product.sellingPrice),
      unitCost: product.costPrice,
      priceEdited: false,
    };
    setLines((prev) => [...prev, line]);
    if (orderDate !== today) void priceLinesOn(orderDate, [...new Set([...lines.map((l) => l.product.id), product.id])]);
  }

  function resetForNextOrder() {
    setPhone('');
    setName('');
    setAddress('');
    setPrefilledFor(null);
    setLines([]);
    setDiscount('');
    setDeliveryCharge('');
    setNote('');
    setStatus('new');
    setError(null);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Which button submitted the form, read from the event rather than tracked in a ref.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const addAnother = submitter?.value === 'another';
    setPending(true);
    setSaved(null);
    const res = await api<OrderDetailDto>(
      'POST',
      '/orders',
      {
        customer: { phone, name: name || undefined, address: address || undefined },
        // A price the seller didn't touch is left to the API, which prices it as of the order date.
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          ...(l.priceEdited ? { unitPrice: poishaOrZero(l.unitPrice) } : {}),
        })),
        discount: poishaOrZero(discount),
        deliveryCharge: poishaOrZero(deliveryCharge),
        paymentMethod,
        courierId: courierId || null,
        orderDate,
        status,
        deliveryAddress: address || undefined,
        courierCost: poishaOrZero(courierCost),
        packagingCost: poishaOrZero(packagingCost),
        note: note || undefined,
      },
      { 'Idempotency-Key': idempotencyKey },
    );
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setIdempotencyKey(crypto.randomUUID());
    if (addAnother) {
      setSaved(`Order #${res.data.orderNo} saved.`);
      resetForNextOrder();
      router.refresh();
    } else {
      navigateFresh(router, `/orders/${res.data.id}`);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" noValidate>
      <div className="flex min-w-0 flex-col gap-5">
        {error ? (
          <p className="rounded-xl bg-loss-soft px-3 py-2 text-sm text-loss" role="alert">
            {error.message}
          </p>
        ) : null}
        {saved ? (
          <p className="rounded-xl bg-gain-soft px-3 py-2 text-sm text-gain" role="status">
            {saved}
          </p>
        ) : null}

        <CustomerFields
          phone={phone}
          onPhoneChange={setPhone}
          customer={customer}
          name={name}
          onNameChange={setName}
          address={address}
          onAddressChange={setAddress}
          phoneError={fieldError(error, 'customer.phone')}
        />

        <LineItems
          lines={lines}
          onAdd={addProduct}
          onChange={(key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))}
          onRemove={(key) => setLines((prev) => prev.filter((l) => l.key !== key))}
          error={fieldError(error, 'items')}
        />

        <section className="card grid gap-4 p-5 sm:grid-cols-2" aria-labelledby="delivery-heading">
          <h2 id="delivery-heading" className="font-semibold sm:col-span-2">
            Delivery & payment
          </h2>
          <div>
            <label className="label" htmlFor="courier">
              Courier
            </label>
            <SelectField
              id="courier"
              value={courierId}
              onValueChange={(id) => {
                setCourierId(id);
                setCourierCost(
                  takaText(
                    defaultCourierCost(
                      business,
                      couriers.find((c) => c.id === id),
                    ),
                  ),
                );
              }}
              options={[{ value: '', label: 'No courier' }, ...couriers.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
          <div>
            <label className="label" htmlFor="payment">
              Payment
            </label>
            <SelectField
              id="payment"
              value={paymentMethod}
              onValueChange={(m) => setPaymentMethod(m as PaymentMethod)}
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="order-date">
              Order date
            </label>
            <input id="order-date" type="date" className="input" value={orderDate} onChange={(e) => changeOrderDate(e.target.value)} />
            {fieldError(error, 'orderDate') ? <p className="mt-1 text-sm text-loss">{fieldError(error, 'orderDate')}</p> : null}
          </div>
          <div>
            <label className="label" htmlFor="status">
              Status
            </label>
            <SelectField
              id="status"
              value={status}
              onValueChange={(s) => setStatus(s as CreatableStatus)}
              options={CREATABLE_ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="discount">
              Discount (৳)
            </label>
            <input
              id="discount"
              inputMode="decimal"
              className="input tabular"
              placeholder="0"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
            {fieldError(error, 'discount') ? <p className="mt-1 text-sm text-loss">{fieldError(error, 'discount')}</p> : null}
          </div>
          <div>
            <label className="label" htmlFor="delivery-charge">
              Delivery charge from customer (৳)
            </label>
            <input
              id="delivery-charge"
              inputMode="decimal"
              className="input tabular"
              placeholder="0"
              value={deliveryCharge}
              onChange={(e) => setDeliveryCharge(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="note">
              Note
            </label>
            <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </section>
      </div>

      <OrderSummary
        totals={totals}
        courierCost={courierCost}
        onCourierCostChange={setCourierCost}
        packagingCost={packagingCost}
        onPackagingCostChange={setPackagingCost}
        pending={pending}
      />
    </form>
  );
}
