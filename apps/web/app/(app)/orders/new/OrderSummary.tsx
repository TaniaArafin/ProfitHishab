import { formatTaka, type OrderTotals } from '@ph/shared';

interface Props {
  totals: OrderTotals;
  courierCost: string;
  onCourierCostChange: (value: string) => void;
  packagingCost: string;
  onPackagingCostChange: (value: string) => void;
  pending: boolean;
}

export function OrderSummary({ totals, courierCost, onCourierCostChange, packagingCost, onPackagingCostChange, pending }: Props) {
  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
      <section className="card flex flex-col gap-2 p-5 text-sm" aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="mb-1 font-semibold">
          Summary
        </h2>
        <Row label="Subtotal" value={formatTaka(totals.subtotal)} />
        <Row label="Discount" value={`−${formatTaka(totals.discount)}`} />
        <Row label="Delivery charge" value={formatTaka(totals.deliveryCharge)} />
        <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
          <span>Total</span>
          <span className="tabular">{formatTaka(totals.total)}</span>
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-5 text-sm" aria-labelledby="costs-heading">
        <h2 id="costs-heading" className="font-semibold">
          Costs for profit
        </h2>
        <p className="text-xs text-ink-faint">What you pay. Prefilled from your settings.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label text-xs" htmlFor="courier-cost">
              Courier cost (৳)
            </label>
            <input
              id="courier-cost"
              inputMode="decimal"
              className="input tabular"
              value={courierCost}
              onChange={(e) => onCourierCostChange(e.target.value)}
            />
          </div>
          <div>
            <label className="label text-xs" htmlFor="packaging-cost">
              Packaging (৳)
            </label>
            <input
              id="packaging-cost"
              inputMode="decimal"
              className="input tabular"
              value={packagingCost}
              onChange={(e) => onPackagingCostChange(e.target.value)}
            />
          </div>
        </div>
        <Row label="Product cost" value={`−${formatTaka(totals.productCost)}`} />
        <div className="flex justify-between border-t border-line pt-2 font-semibold">
          <span>Estimated profit</span>
          <span className={`tabular ${totals.estimatedProfit >= 0 ? 'text-gain' : 'text-loss'}`}>{formatTaka(totals.estimatedProfit)}</span>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <button type="submit" name="intent" value="view" className="btn-primary py-2.5" disabled={pending}>
          {pending ? 'Saving…' : 'Save order'}
        </button>
        <button type="submit" name="intent" value="another" className="btn-secondary" disabled={pending}>
          Save and add another
        </button>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-muted">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
