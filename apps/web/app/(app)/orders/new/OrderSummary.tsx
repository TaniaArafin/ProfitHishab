import { formatTaka, type OrderTotals } from '@ph/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  totals: OrderTotals;
  courierCost: string;
  onCourierCostChange: (value: string) => void;
  packagingCost: string;
  onPackagingCostChange: (value: string) => void;
  pending: boolean;
}

/** Wide screens: a sticky side column. Tablets: summary and costs side by side under the form. Phones: stacked. */
export function OrderSummary({ totals, courierCost, onCourierCostChange, packagingCost, onPackagingCostChange, pending }: Props) {
  return (
    <aside className="grid content-start gap-4 md:grid-cols-2 xl:sticky xl:top-6 xl:grid-cols-1 xl:self-start">
      <Card role="region" aria-labelledby="summary-heading">
        <CardHeader>
          <CardTitle id="summary-heading">Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Row label="Subtotal" value={formatTaka(totals.subtotal)} />
          <Row label="Discount" value={`−${formatTaka(totals.discount)}`} />
          <Row label="Delivery charge" value={formatTaka(totals.deliveryCharge)} />
          <div className="flex justify-between gap-3 border-t border-line pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="tabular">{formatTaka(totals.total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card role="region" aria-labelledby="costs-heading">
        <CardHeader>
          <CardTitle id="costs-heading">Costs for profit</CardTitle>
          <CardDescription className="text-xs text-ink-faint">What you pay. Prefilled from your settings.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs" htmlFor="courier-cost">
                Courier cost (৳)
              </Label>
              <Input
                id="courier-cost"
                inputMode="decimal"
                className="tabular"
                value={courierCost}
                onChange={(e) => onCourierCostChange(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="packaging-cost">
                Packaging (৳)
              </Label>
              <Input
                id="packaging-cost"
                inputMode="decimal"
                className="tabular"
                value={packagingCost}
                onChange={(e) => onPackagingCostChange(e.target.value)}
              />
            </div>
          </div>
          <Row label="Product cost" value={`−${formatTaka(totals.productCost)}`} />
          <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
            <span>Estimated profit</span>
            <span className={`tabular ${totals.estimatedProfit >= 0 ? 'text-gain' : 'text-loss'}`}>
              {formatTaka(totals.estimatedProfit)}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 md:col-span-2 md:flex-row xl:col-span-1 xl:flex-col">
        <Button type="submit" name="intent" value="view" size="lg" className="md:flex-1 xl:flex-none" disabled={pending}>
          {pending ? 'Saving…' : 'Save order'}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="another"
          variant="secondary"
          size="lg"
          className="md:flex-1 xl:flex-none"
          disabled={pending}
        >
          Save and add another
        </Button>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
