import { formatTaka, UNIT_LABELS, type BatchDto, type ProductDto } from '@ph/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatDay } from '@/lib/period';
import { ClearStockButton } from '../ClearStockButton';
import { ReceiveStockDialog } from './ReceiveStockDialog';

function ExpiryNote({ batch }: { batch: BatchDto }) {
  if (batch.expired) return <Badge variant="destructive">Expired</Badge>;
  if (batch.expiresInDays > 90) return null;
  const text = batch.expiresInDays === 0 ? 'Expires today' : `Expires in ${batch.expiresInDays} days`;
  return <span className={batch.expiresInDays <= 30 ? 'text-sm font-medium text-warn' : 'text-sm text-ink-muted'}>{text}</span>;
}

/** Spec 5.4: a tracked product's batches, earliest expiry first, with Receive stock and Clear stock. */
export function BatchesCard({ product, batches }: { product: ProductDto; batches: BatchDto[] }) {
  const unit = UNIT_LABELS[product.unit];
  const withLabels = product.options.length > 0;
  return (
    <section aria-labelledby="batches-title">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="batches-title" className="font-semibold">
                Batches
              </h2>
              <p className="text-sm text-ink-muted">
                Stock {product.stock} {unit}
                {product.expiredStock > 0 ? ` · ${product.expiredStock} ${unit} expired (${formatTaka(product.expiredCost)})` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              {product.expiredStock > 0 ? <ClearStockButton product={product} /> : null}
              <ReceiveStockDialog product={product} />
            </div>
          </div>
          {batches.length === 0 ? (
            <p className="text-sm text-ink-muted">No stock in batches yet. Use Receive stock when a delivery arrives.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line/60">
              {batches.map((b) => (
                <li
                  key={b.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_6rem_6rem_auto]"
                >
                  <span className="font-medium">{b.batchNo ?? 'No batch no'}</span>
                  <span className="text-ink-muted">
                    {withLabels ? `${b.variantLabel} · ` : ''}expires {formatDay(b.expiresOn)}
                  </span>
                  <span className="tabular">
                    {b.quantity} {unit}
                  </span>
                  <span className="tabular text-ink-muted">{formatTaka(b.unitCost)}</span>
                  <ExpiryNote batch={b} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
