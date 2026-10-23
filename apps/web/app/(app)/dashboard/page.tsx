import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
  CheckCircle2,
  LayoutDashboard,
  Megaphone,
  Package,
  PackageCheck,
  Plus,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { formatTaka, percent, type InsightDto, type ProductProfitReportDto, type ProfitSummaryDto, type TrendPointDto } from '@ph/shared';
import { PeriodSelector } from '@/components/PeriodSelector';
import { TrendChartLazy as TrendChart } from '@/components/TrendChartLazy';
import { Banner, IconChip, Money, PageHeader, Skeleton } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { periodFromParams, periodLabel } from '@/lib/period';
import { apiGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Dashboard' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DashboardPage({ searchParams }: Props) {
  const period = periodFromParams(await searchParams);
  const { data: summary } = await apiGet<{ data: ProfitSummaryDto }>(`/profit/summary?${period.query}`);

  if (!summary.dataQuality.hasOrders) return <Onboarding />;

  const s = summary.statement;
  const prev = summary.previous.statement;
  const k = summary.kpis;
  const range = `from=${period.from}&to=${period.to}`;
  const missing = summary.dataQuality.productsMissingCost;
  const profitChange = change(s.netProfit, prev.netProfit);

  return (
    <div className="flex flex-col gap-5 sm:gap-7">
      <PageHeader
        icon={LayoutDashboard}
        title={periodLabel(period.from, period.to)}
        description="Profit from delivered orders, after product cost, courier, returns and expenses."
        actions={
          <>
            <PeriodSelector preset={period.preset} from={period.from} to={period.to} />
            <Button asChild>
              <Link href="/orders/new">
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                New order
              </Link>
            </Button>
          </>
        }
      />

      {missing > 0 ? (
        <Banner tone="warn">
          <strong>{missing === 1 ? '1 product has' : `${missing} products have`} no cost.</strong> Your profit is shown higher than it
          really is.{' '}
          <Link href="/products/missing-cost" className="font-semibold underline underline-offset-2">
            Fix costs
          </Link>
        </Banner>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* Hero: the one number the seller came for */}
        <section
          className="relative overflow-hidden rounded-3xl bg-schist-500 p-5 text-schist-200 shadow-lift sm:p-7"
          aria-labelledby="hero-title"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-glow/25 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-brand/40 blur-3xl" aria-hidden />
          <div className="relative flex h-full flex-col gap-6">
            <div className="flex items-center justify-between gap-3">
              <h2 id="hero-title" className="flex items-center gap-2 text-sm font-semibold text-schist-200">
                <Sparkles className="h-4 w-4 text-schist-100" /> Net profit
              </h2>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-schist-200 ring-1 ring-inset ring-white/10">
                {k.profitMargin}% margin
              </span>
            </div>
            <div>
              <div className="break-words text-4xl font-extrabold leading-none tracking-tight tabular text-schist-100 sm:text-[52px]">
                {formatTaka(s.netProfit)}
              </div>
              {profitChange !== null ? (
                <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-schist-100">
                  {profitChange >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {Math.abs(profitChange)}% vs previous period
                </div>
              ) : (
                <div className="mt-3 text-xs text-schist-200">No earlier period to compare with yet.</div>
              )}
            </div>
            <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-white/10 pt-5 text-sm sm:gap-3">
              <HeroStat label="Revenue" value={formatTaka(s.revenue)} />
              <HeroStat label="Delivered" value={String(k.delivered)} />
              <HeroStat label="Return rate" value={`${k.returnRate}%`} />
            </dl>
          </div>
        </section>

        <Card role="region" className="p-4 sm:p-6" aria-labelledby="statement-title">
          <div className="flex items-center justify-between">
            <h2 id="statement-title" className={SECTION_TITLE}>
              Profit statement
            </h2>
            <Receipt className="h-4 w-4 text-ink-faint" />
          </div>
          <div className="mt-5 flex flex-col gap-1">
            <Line label="Sales" value={s.revenue} href={`/orders?status=delivered&${range}`} icon={Wallet} />
            <Line label="Product cost" value={-s.productCost} href={`/reports/products?${range}`} icon={Package} />
            <Line label="Courier & returns" value={-s.courierCost} href={`/orders?${range}`} icon={RotateCcw} />
            <Line label="Ads" value={-s.adsCost} href={`/expenses?${range}`} icon={Megaphone} />
            <Line label="Other expenses" value={-s.otherExpenses} href={`/expenses?${range}`} icon={Receipt} />
            <div className="mt-3 flex items-baseline justify-between rounded-xl bg-paper px-4 py-3">
              <span className="font-semibold">Net profit</span>
              <span className="text-lg font-bold">
                <Money value={s.netProfit} tone />
              </span>
            </div>
          </div>
          {!summary.dataQuality.expensesEntered ? (
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
              <Megaphone className="h-4 w-4 text-ink" />
              No expenses entered for this period.
              <Link href="/expenses" className="font-semibold text-ink hover:underline">
                Add ad spend
              </Link>
            </p>
          ) : null}
        </Card>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Key figures">
        <Kpi icon={Wallet} label="Revenue" value={<Money value={s.revenue} compact />} change={change(s.revenue, prev.revenue)} />
        <Kpi
          icon={TrendingUp}
          tone="gain"
          label="Gross profit"
          value={<Money value={s.grossProfit} compact />}
          change={change(s.grossProfit, prev.grossProfit)}
        />
        <Kpi icon={BadgePercent} tone="accent" label="Profit margin" value={`${k.profitMargin}%`} />
        <Kpi icon={ShoppingBag} label="Orders" value={k.orders} hint={k.pending ? `${k.pending} pending` : 'none pending'} />
        <Kpi icon={PackageCheck} tone="gain" label="Delivered" value={k.delivered} />
        <Kpi icon={RotateCcw} tone="loss" label="Returned" value={k.returned} />
        <Kpi
          icon={TriangleAlert}
          tone={k.returnRate > 10 ? 'loss' : 'warn'}
          label="Return rate"
          value={`${k.returnRate}%`}
          bad={k.returnRate > 10}
        />
        <Kpi icon={Receipt} tone="brand" label="Avg. order value" value={<Money value={k.avgOrderValue} compact />} />
      </section>

      <Suspense fallback={<Skeleton className="h-16" />}>
        <Insights query={period.query} />
      </Suspense>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card role="region" aria-label="Profit trend" className="p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className={SECTION_TITLE}>Profit trend</h2>
            <TrendingUp className="h-4 w-4 text-ink-faint" />
          </div>
          <Suspense fallback={<Skeleton className="mt-5 h-64" />}>
            <Trend query={period.query} />
          </Suspense>
        </Card>
        <Card role="region" aria-label="Top products by profit" className="p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className={SECTION_TITLE}>Top products by profit</h2>
            <Link
              href={`/reports/products?${range}`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-ink hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <Suspense fallback={<Skeleton className="mt-5 h-48" />}>
            <TopProducts query={period.query} />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}

const SECTION_TITLE = 'text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-faint';

function change(current: number, previous: number): number | null {
  return previous > 0 ? percent(current - previous, previous) : null;
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-schist-200">{label}</dt>
      <dd className="mt-0.5 truncate font-semibold tabular text-schist-100">{value}</dd>
    </div>
  );
}

function Line({ label, value, href, icon: Icon }: { label: string; value: number; href: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      className="group -mx-2 flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-paper"
    >
      <span className="flex min-w-0 items-center gap-2.5 text-ink-muted group-hover:text-ink">
        <Icon className="h-4 w-4 text-ink-faint group-hover:text-ink" />
        {label}
      </span>
      <span className="shrink-0 font-medium">
        <Money value={value} />
      </span>
    </Link>
  );
}

function Kpi({
  icon,
  label,
  value,
  change,
  hint,
  bad,
  tone = 'brand',
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  change?: number | null;
  hint?: string;
  bad?: boolean;
  tone?: 'brand' | 'gain' | 'loss' | 'warn' | 'accent';
}) {
  return (
    <Card className={cn('flex min-w-0 flex-col gap-3 p-4 sm:p-5', CARD_HOVER, bad && 'border-loss/30 bg-loss-soft/40')}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('min-w-0 text-[13px] font-medium', bad ? 'text-loss' : 'text-ink-muted')}>{label}</span>
        <IconChip icon={icon} tone={tone} />
      </div>
      <span className={cn('truncate text-xl font-bold tracking-tight tabular sm:text-2xl', bad && 'text-loss')}>{value}</span>
      {change !== undefined && change !== null ? (
        <span
          className={cn('inline-flex flex-wrap items-center gap-1 text-xs font-semibold tabular', change >= 0 ? 'text-gain' : 'text-loss')}
        >
          {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(change)}% <span className="font-normal text-ink-faint">vs previous</span>
        </span>
      ) : (
        <span className="text-xs text-ink-faint">{hint ?? ' '}</span>
      )}
    </Card>
  );
}

const CARD_HOVER = 'hover:-translate-y-0.5 hover:border-schist-300 hover:shadow-lift';

const SEVERITY_TONE = { critical: 'loss', warning: 'warn', info: 'brand', good: 'gain' } as const;

async function Insights({ query }: { query: string }) {
  const all = await apiGet<{ data: InsightDto[] }>(`/profit/insights?${query}`);
  // Missing costs and missing expenses already have their own notices on this page.
  const data = all.data.filter((i) => i.code !== 'missing-cost' && i.code !== 'no-expenses');
  if (data.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5" aria-label="Insights">
      {data.map((insight) => (
        <Banner key={insight.code} tone={SEVERITY_TONE[insight.severity]}>
          {insight.message}{' '}
          {insight.href ? (
            <Link href={insight.href} className="font-semibold underline underline-offset-2">
              View
            </Link>
          ) : null}
        </Banner>
      ))}
    </section>
  );
}

async function Trend({ query }: { query: string }) {
  const { data } = await apiGet<{ data: { interval: 'day' | 'month'; points: TrendPointDto[] } }>(`/profit/trend?${query}`);
  return (
    <div className="mt-5">
      <TrendChart points={data.points} interval={data.interval} />
    </div>
  );
}

async function TopProducts({ query }: { query: string }) {
  const { data } = await apiGet<{ data: ProductProfitReportDto }>(`/profit/products?${query}&limit=5`);
  if (data.rows.length === 0) return <p className="mt-5 text-sm text-ink-muted">No delivered orders in this period yet.</p>;
  const max = Math.max(...data.rows.map((r) => Math.abs(r.profit)), 1);
  return (
    <ol className="mt-5 flex flex-col gap-4">
      {data.rows.map((row, i) => (
        <li key={row.productId} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-paper text-xs font-bold text-ink-muted tabular">
                {i + 1}
              </span>
              <span className="truncate font-medium">{row.name}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2.5">
              <span className="text-xs text-ink-faint tabular">{row.margin}%</span>
              <Money value={row.profit} tone className="font-semibold" />
            </span>
          </div>
          <div className="ml-[34px] h-1.5 overflow-hidden rounded-full bg-paper">
            <div
              className={cn('h-full rounded-full', row.profit >= 0 ? 'bg-gain/70' : 'bg-loss/70')}
              style={{ width: `${Math.max(4, (Math.abs(row.profit) / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Onboarding() {
  const steps: Array<{ label: string; body: string; href: string | null; icon: LucideIcon }> = [
    { label: 'Add your products', body: 'Selling price and what each product costs you.', href: '/products/new', icon: Package },
    {
      label: 'Create your first order',
      body: 'Or several. Mark them delivered when the courier delivers.',
      href: '/orders/new',
      icon: ShoppingBag,
    },
    { label: "Add this month's ad spend", body: 'Facebook ads are usually the biggest expense.', href: '/expenses', icon: Megaphone },
    { label: 'See your real profit', body: 'This page fills in by itself.', href: null, icon: CheckCircle2 },
  ];
  return (
    <div className="flex flex-col gap-5 sm:gap-7">
      <section className="relative overflow-hidden rounded-3xl bg-schist-500 p-6 text-schist-200 shadow-lift sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-glow/25 blur-3xl" aria-hidden />
        <div className="relative max-w-xl">
          <p className="font-bangla text-sm text-schist-100">Sales দেখবেন না — আসল Profit বুঝবেন।</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Let&apos;s find your real profit</h1>
          <p className="mt-2 text-schist-200">Four steps, about ten minutes.</p>
        </div>
      </section>
      <ol className="grid gap-3 sm:gap-4 md:grid-cols-2">
        {steps.map((step, i) => (
          <li key={step.label}>
            <Card className={cn('flex h-full flex-wrap items-start gap-4 p-4 sm:p-5', CARD_HOVER)}>
              <IconChip icon={step.icon} tone={i === 3 ? 'gain' : 'brand'} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-ink-faint">Step {i + 1}</div>
                <div className="font-semibold">{step.label}</div>
                <p className="mt-0.5 text-sm text-ink-muted">{step.body}</p>
              </div>
              {step.href ? (
                <Button asChild variant="secondary" className="ml-auto shrink-0 px-3">
                  <Link href={step.href}>
                    Start <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
