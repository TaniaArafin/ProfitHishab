'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { parseTaka, UNIT_LABELS, type ProductDto } from '@ph/shared';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { refreshData } from '@/lib/navigation';
import { SelectField } from '@/components/SelectField';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Spec 5.4: stock arrives as a batch with its expiry date and cost. */
export function ReceiveStockDialog({ product }: { product: ProductDto }) {
  const router = useRouter();
  const onSale = product.variants.filter((v) => v.status === 'active');
  const withOptions = product.options.length > 0;
  const unit = UNIT_LABELS[product.unit];
  const [open, setOpen] = useState(false);
  const [variantId, setVariantId] = useState(withOptions ? '' : (onSale[0]?.id ?? ''));
  const [batchNo, setBatchNo] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    const body = {
      ...(withOptions ? { variantId: variantId || undefined } : {}),
      batchNo: batchNo.trim() || null,
      expiresOn,
      quantity: quantity.trim() === '' ? undefined : Number(quantity),
      unitCost: parseTaka(cost) ?? undefined,
    };
    const res = await api('POST', `/products/${product.id}/batches`, withOptions ? body : { ...body, batchNo: body.batchNo ?? undefined });
    setPending(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    setOpen(false);
    setBatchNo('');
    setExpiresOn('');
    setQuantity('');
    refreshData(router);
  }

  const err = (field: string) => (fieldError(error, field) ? <p className="mt-1 text-sm text-loss">{fieldError(error, field)}</p> : null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Receive stock
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receive stock — {product.name}</DialogTitle>
          <DialogDescription>
            Each delivery is a batch with its own expiry date. Orders take the batch that expires first.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          {error && !error.fields ? <Alert variant="destructive">{error.message}</Alert> : null}
          {withOptions ? (
            <div>
              <Label htmlFor="rs-variant">Variant</Label>
              <SelectField
                id="rs-variant"
                value={variantId}
                onValueChange={setVariantId}
                placeholder="Choose…"
                options={onSale.map((v) => ({ value: v.id, label: v.label }))}
              />
              {err('variantId')}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rs-batch">Batch no</Label>
              <Input id="rs-batch" maxLength={40} value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <Label htmlFor="rs-expiry">Expiry date</Label>
              <Input id="rs-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} required />
              {err('expiresOn')}
            </div>
            <div>
              <Label htmlFor="rs-qty">Quantity ({unit})</Label>
              <Input id="rs-qty" inputMode="decimal" className="tabular" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              {err('quantity')}
            </div>
            <div>
              <Label htmlFor="rs-cost">Cost per {unit} (৳)</Label>
              <Input id="rs-cost" inputMode="decimal" className="tabular" value={cost} onChange={(e) => setCost(e.target.value)} />
              {err('unitCost')}
            </div>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add stock'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
