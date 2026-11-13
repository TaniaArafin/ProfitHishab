import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import type { ImportCommitResultDto } from '@ph/shared';
import { Banner } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDay } from '@/lib/period';

/**
 * After the import. Right after committing it has the commit result (date range, missing costs).
 * Opened later, only the stored order count is known, so it links to the dashboard as it is.
 */
export function ResultStep(props: { result: ImportCommitResultDto } | { importedOrders: number }) {
  const result = 'result' in props ? props.result : null;
  const orders = result ? result.ordersCreated : 'importedOrders' in props ? props.importedOrders : 0;
  const missing = result?.missingCostProducts ?? 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Card className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-gain" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tabular">{orders} orders imported</h2>
            {result ? (
              <p className="mt-1 text-sm text-ink-muted tabular">
                {result.customersCreated} new customers and {result.productsCreated} new products were added.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            {result ? (
              <Link href={`/dashboard?from=${result.from}&to=${result.to}`}>
                See profit for {formatDay(result.from)} – {formatDay(result.to)}
              </Link>
            ) : (
              <Link href="/dashboard">See your dashboard</Link>
            )}
          </Button>
          <Button asChild variant="secondary">
            <Link href="/imports">All imports</Link>
          </Button>
        </div>
      </Card>
      {missing > 0 ? (
        <Banner tone="warn">
          <p>{missing} products have no cost, so the profit of these imported orders is shown higher than it really is.</p>
          <p className="mt-1">A cost you add now counts for new orders only. These imported orders keep a cost of 0.</p>
          <Button asChild variant="secondary" className="mt-3">
            <Link href="/products/missing-cost">Fix missing costs</Link>
          </Button>
        </Banner>
      ) : null}
    </div>
  );
}
