'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatTaka, UNIT_LABELS, type ClearStockResultDto, type ProductDto } from '@ph/shared';
import { api } from '@/lib/client-api';
import { refreshData } from '@/lib/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

/** Owner decision 2: removes a product's expired stock, booked as a loss in this month's profit. Asks first. */
export function ClearStockButton({ product, size = 'sm' }: { product: ProductDto; size?: 'sm' | 'default' }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const unit = product.unit === 'piece' ? 'piece' : UNIT_LABELS[product.unit];

  async function clear() {
    const res = await api<ClearStockResultDto>('POST', `/products/${product.id}/clear-expired`);
    if (!res.ok) return setError(res.error.message);
    refreshData(router);
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive-outline" size={size}>
          Clear stock
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear expired stock of {product.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {product.expiredStock} {unit} of expired stock will be removed. {formatTaka(product.expiredCost)} at cost counts as a loss in
            this month&apos;s profit.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-loss">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction onClick={() => void clear()}>Clear expired stock</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
