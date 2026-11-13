'use client';

import { Check, Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { BILLING_METHOD_LABELS, formatTaka, type BillingDto, type BillingMethod } from '@ph/shared';
import { SelectField } from '@/components/SelectField';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { refreshData } from '@/lib/navigation';

type Props = Pick<BillingDto, 'methods' | 'pricePerMonth' | 'monthOptions'>;

/** Pay by bKash or Nagad Send Money, then tell us the TrxID. The admin checks it and extends access. */
export function PaymentForm({ methods, pricePerMonth, monthOptions }: Props) {
  const router = useRouter();
  const [months, setMonths] = useState(String(monthOptions[0] ?? 1));
  const [method, setMethod] = useState<BillingMethod>(methods[0]?.method ?? 'bkash');
  const [senderNumber, setSenderNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  if (methods.length === 0) {
    return <Alert variant="warning">Payments are not open yet. Please contact us to pay.</Alert>;
  }

  const target = methods.find((m) => m.method === method) ?? methods[0];
  const amount = pricePerMonth * Number(months);
  const methodLabel = BILLING_METHOD_LABELS[target.method];

  async function copy() {
    try {
      await navigator.clipboard.writeText(target.number);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await api('POST', '/billing/payments', { method: target.method, months: Number(months), senderNumber, transactionId });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    refreshData(router);
  }

  const senderError = fieldError(error, 'senderNumber');
  const trxError = fieldError(error, 'transactionId');
  const otherError = error && !senderError && !trxError ? error.message : null;

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5" noValidate>
      {otherError ? <Alert variant="destructive">{otherError}</Alert> : null}

      <section className="flex flex-col gap-3" aria-labelledby="pay-step-1">
        <h3 id="pay-step-1" className="text-sm font-semibold">
          1. Choose months
        </h3>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="pay-months">How many months</Label>
            <SelectField
              id="pay-months"
              value={months}
              onValueChange={setMonths}
              options={monthOptions.map((m) => ({
                value: String(m),
                label: `${m} month${m === 1 ? '' : 's'} — ${formatTaka(pricePerMonth * m)}`,
              }))}
            />
          </div>
          <div>
            <Label htmlFor="pay-method">Paid with</Label>
            <SelectField
              id="pay-method"
              value={target.method}
              onValueChange={(v) => setMethod(v as BillingMethod)}
              options={methods.map((m) => ({ value: m.method, label: BILLING_METHOD_LABELS[m.method] }))}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="pay-step-2">
        <h3 id="pay-step-2" className="text-sm font-semibold">
          2. Send money
        </h3>
        <p className="break-words text-sm text-ink-muted">{`Open ${methodLabel}, choose Send Money, and send ${formatTaka(amount)} to ${target.number}.`}</p>
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 break-all rounded-lg bg-paper px-3 py-2 text-base font-semibold tabular">{target.number}</span>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={copied ? 'Copied' : `Copy ${methodLabel} number`}
            onClick={() => void copy()}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="pay-step-3">
        <h3 id="pay-step-3" className="text-sm font-semibold">
          3. Tell us
        </h3>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="pay-sender">Your bKash/Nagad number</Label>
            <Input
              id="pay-sender"
              inputMode="tel"
              autoComplete="tel"
              placeholder="01XXXXXXXXX"
              value={senderNumber}
              onChange={(e) => setSenderNumber(e.target.value)}
              aria-invalid={senderError ? true : undefined}
              aria-describedby={senderError ? 'pay-sender-error' : undefined}
            />
            {senderError ? (
              <p className="mt-1 text-sm text-loss" id="pay-sender-error">
                {senderError}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="pay-trx">Transaction ID (TrxID)</Label>
            <Input
              id="pay-trx"
              autoCapitalize="characters"
              autoComplete="off"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              aria-invalid={trxError ? true : undefined}
              aria-describedby={trxError ? 'pay-trx-error' : undefined}
            />
            {trxError ? (
              <p className="mt-1 text-sm text-loss" id="pay-trx-error">
                {trxError}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <Button type="submit" className="w-full sm:w-auto sm:self-start" disabled={pending}>
        {pending ? 'Sending…' : 'I have paid'}
      </Button>
    </form>
  );
}
