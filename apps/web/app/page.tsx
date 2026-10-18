import Link from 'next/link';

export const dynamic = 'force-static';

const STATEMENT = [
  ['Sales', '৳5,20,000'],
  ['Product cost', '−৳3,00,000'],
  ['Courier', '−৳35,000'],
  ['Facebook ads', '−৳50,000'],
  ['Other expenses', '−৳15,000'],
];

const BENEFITS = [
  { title: 'Real monthly profit', body: 'Sales minus product cost, courier, returns and ad spend. Not just sales.' },
  { title: 'Return loss in taka', body: 'See what returned parcels actually cost you, not only how many came back.' },
  { title: 'Profit per product', body: 'Find the products that make money, and the best-sellers that barely do.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 lg:px-8">
        <span className="text-sm font-bold uppercase tracking-wider text-ink">ProfitHishab</span>
        <div className="flex gap-2">
          <Link href="/login" className="btn-secondary">
            Log in
          </Link>
          <Link href="/register" className="btn-primary">
            Start free
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:px-8 lg:pt-16">
        <section className="flex flex-col gap-6">
          <h1 className="font-bangla text-4xl font-semibold leading-tight text-balance lg:text-5xl">
            Sales দেখবেন না — আসল Profit বুঝবেন।
          </h1>
          <p className="max-w-xl text-lg text-ink-muted">
            ProfitHishab shows Facebook sellers in Bangladesh what they really earn each month, and where the money goes: courier charges,
            returns and ad spend.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              Start free
            </Link>
            <span className="self-center text-sm text-ink-muted">Import your order Excel and see your profit in minutes.</span>
          </div>
          <ul className="mt-4 grid gap-4 sm:grid-cols-3">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex flex-col gap-1">
                <span className="font-semibold">{b.title}</span>
                <span className="text-sm text-ink-muted">{b.body}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-6 shadow-sm" aria-label="Example profit statement">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">September 2026</span>
            <span className="text-xs text-ink-faint">Example</span>
          </div>
          <dl className="mt-4 flex flex-col gap-2 text-sm">
            {STATEMENT.map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="tabular">{v}</dd>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-line pt-3 text-base font-semibold">
              <dt>Net profit</dt>
              <dd className="tabular text-gain">৳1,20,000</dd>
            </div>
          </dl>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-md bg-paper p-2">
              <div className="text-xs text-ink-muted">Margin</div>
              <div className="font-semibold tabular">23.1%</div>
            </div>
            <div className="rounded-md bg-paper p-2">
              <div className="text-xs text-ink-muted">Delivered</div>
              <div className="font-semibold tabular">360</div>
            </div>
            <div className="rounded-md bg-loss-soft p-2">
              <div className="text-xs text-loss">Return rate</div>
              <div className="font-semibold tabular text-loss">14.3%</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
