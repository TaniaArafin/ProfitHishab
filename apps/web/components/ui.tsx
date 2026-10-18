import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, OctagonAlert, UserRound, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatTaka, formatTakaCompact, ORDER_STATUS_LABELS, type OrderStatus } from '@ph/shared';

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {Icon ? (
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-card text-ink shadow-soft ring-1 ring-line/70 sm:flex">
            <Icon className="h-[22px] w-[22px]" strokeWidth={2} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[28px]">{title}</h1>
          {description ? <div className="mt-1 text-sm text-ink-muted">{description}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const STATUS_STYLES: Record<OrderStatus, { pill: string; dot: string }> = {
  new: { pill: 'bg-brand-soft text-ink ring-brand/15', dot: 'bg-brand' },
  confirmed: { pill: 'bg-brand-soft text-ink ring-brand/15', dot: 'bg-brand' },
  processing: { pill: 'bg-warn-soft text-warn ring-warn/15', dot: 'bg-warn' },
  shipped: { pill: 'bg-info-soft text-info-ink ring-info/20', dot: 'bg-info' },
  delivered: { pill: 'bg-gain-soft text-gain ring-gain/15', dot: 'bg-gain' },
  cancelled: { pill: 'bg-paper text-ink-muted ring-line', dot: 'bg-ink-faint' },
  returned: { pill: 'bg-loss-soft text-loss ring-loss/15', dot: 'bg-loss' },
};

export function StatusPill({ status }: { status: OrderStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        s.pill,
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

/** Money in poisha. `tone` colours profit green and loss red, always with a sign so colour is not the only signal. */
export function Money({ value, compact, tone, className }: { value: number; compact?: boolean; tone?: boolean; className?: string }) {
  const text = compact ? formatTakaCompact(value) : formatTaka(value);
  return (
    <span className={clsx('tabular', tone && (value > 0 ? 'text-gain' : value < 0 ? 'text-loss' : ''), className)}>
      {tone && value > 0 ? '+' : ''}
      {text}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  actions,
  icon: Icon,
}: {
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      {Icon ? (
        <span className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-ink">
          <Icon className="h-6 w-6" />
        </span>
      ) : null}
      <h2 className="text-lg font-bold">{title}</h2>
      {body ? <p className="max-w-md text-sm text-ink-muted">{body}</p> : null}
      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

const BANNER: Record<'warn' | 'loss' | 'gain' | 'brand', { box: string; icon: LucideIcon; iconColor: string }> = {
  warn: { box: 'border-warn/20 bg-warn-soft/80 text-warn-ink', icon: AlertTriangle, iconColor: 'text-warn' },
  loss: { box: 'border-loss/20 bg-loss-soft/80 text-loss-ink', icon: OctagonAlert, iconColor: 'text-loss' },
  gain: { box: 'border-gain/20 bg-gain-soft/80 text-gain-ink', icon: CheckCircle2, iconColor: 'text-gain' },
  brand: { box: 'border-brand/15 bg-brand-soft/80 text-ink', icon: Info, iconColor: 'text-ink' },
};

export function Banner({ tone = 'warn', children }: { tone?: 'warn' | 'loss' | 'gain' | 'brand'; children: ReactNode }) {
  const b = BANNER[tone];
  const Icon = b.icon;
  return (
    <div className={clsx('flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm', b.box)}>
      <Icon className={clsx('mt-0.5 h-[18px] w-[18px] shrink-0', b.iconColor)} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Tinted rounded square holding an icon; used on KPI cards. */
export function IconChip({ icon: Icon, tone = 'brand' }: { icon: LucideIcon; tone?: 'brand' | 'gain' | 'loss' | 'warn' | 'accent' }) {
  const styles = {
    brand: 'bg-brand-soft text-ink',
    gain: 'bg-gain-soft text-gain',
    loss: 'bg-loss-soft text-loss',
    warn: 'bg-warn-soft text-warn',
    accent: 'bg-accent-soft text-accent-ink',
  }[tone];
  return (
    <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', styles)}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
    </span>
  );
}

export function Pagination({
  page,
  perPage,
  total,
  path,
  params,
}: {
  page: number;
  perPage: number;
  total: number;
  path: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
    sp.set('page', String(p));
    return `${path}?${sp.toString()}`;
  };
  return (
    <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Pagination">
      <span className="text-ink-muted tabular">
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className="btn-secondary px-3" href={href(page - 1)}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="btn-secondary px-3" href={href(page + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-line/60', className)} />;
}

/** Card wrapper for tables: rounded, clipped, scrolls horizontally on its own. */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('card overflow-hidden', className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/** Round initials avatar; falls back to a person icon when the "name" is only a phone number. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <span
      className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-ink', className)}
      aria-hidden
    >
      {letters || <UserRound className="h-4 w-4" />}
    </span>
  );
}
