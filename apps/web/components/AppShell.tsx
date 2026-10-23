'use client';

import clsx from 'clsx';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PieChart,
  Plus,
  Settings,
  ShoppingBag,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { api } from '@/lib/client-api';
import { navigateFresh } from '@/lib/navigation';
import { LogoMark } from './LogoMark';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/reports/products', label: 'Product profit', icon: PieChart },
    ],
  },
  {
    title: 'Business',
    items: [
      { href: '/orders', label: 'Orders', icon: ShoppingBag },
      { href: '/products', label: 'Products', icon: Package },
      { href: '/customers', label: 'Customers', icon: Users },
      { href: '/expenses', label: 'Expenses', icon: Wallet },
    ],
  },
  { title: 'Account', items: [{ href: '/settings', label: 'Settings', icon: Settings }] },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** Phone: bottom tabs with a raised "+" for a new order. */
const TABS: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/products', label: 'Products', icon: Package },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function AppShell({ businessName, userName, children }: { businessName: string; userName: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // The clicked item lights up at once, before the next page has rendered; cleared when it arrives
  // (state adjusted during render, react.dev "Adjusting some state when a prop changes").
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);
  if (pending && pending.from !== pathname) setPending(null);
  const shown = pending?.href ?? pathname;
  const navigate = (href: string) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || href === pathname) return; // new tab, or already here
    setPending({ href, from: pathname });
  };

  const matches = (path: string, href: string) => {
    if (href === '/orders') return path === '/orders' || (path.startsWith('/orders/') && path !== '/orders/new');
    return path === href || path.startsWith(`${href}/`);
  };
  /** Highlighted: the page being opened, else the current one. */
  const isActive = (href: string) => matches(shown, href);
  /** For aria-current: only the page actually on screen. */
  const isCurrent = (href: string) => matches(pathname, href);

  async function logout() {
    await api('POST', '/auth/logout');
    navigateFresh(router, '/login');
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* While the next page loads (only noticeable on a slow connection). No loading.tsx skeleton on
          purpose: swapping a skeleton for content adds React's ~300 ms reveal delay to every click. */}
      {pending ? (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-brand-soft" role="progressbar" aria-label="Loading page">
          <div className="h-full w-2/5 animate-progress rounded-full bg-brand" />
        </div>
      ) : null}
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-schist-300 bg-sidebar-gradient text-ink lg:flex">
        <div className="flex items-center gap-3 px-6 pb-6 pt-7">
          <LogoMark />
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tight">ProfitHishab</div>
            <div className="text-[11px] font-medium text-ink/50">আসল profit, এক জায়গায়</div>
          </div>
        </div>

        <div className="mx-4 mb-5 rounded-xl border border-ink/10 bg-white/45 px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink/45">Business</div>
          <div className="mt-0.5 truncate font-semibold">{businessName}</div>
        </div>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3" aria-label="Main">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/35">{group.title}</div>
              <ul className="flex flex-col gap-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={navigate(href)}
                        aria-current={isCurrent(href) ? 'page' : undefined}
                        className={clsx(
                          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                          active ? 'bg-card text-ink shadow-soft' : 'text-ink/70 hover:bg-white/50 hover:text-ink',
                        )}
                      >
                        {active ? (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand" aria-hidden />
                        ) : null}
                        <Icon
                          className={clsx(
                            'h-[18px] w-[18px] shrink-0 transition',
                            active ? 'text-brand' : 'text-ink/50 group-hover:text-ink/80',
                          )}
                          strokeWidth={2}
                        />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-4">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/50 text-sm font-semibold">
              {initials(userName)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink/85">{userName}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={logout}
              className="text-ink/50 hover:bg-white/50 hover:text-ink"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar */}
        <header
          className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line/70 bg-white/85 px-4 py-3 backdrop-blur-md lg:hidden"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark size="sm" />
            <div className="min-w-0 leading-tight">
              <div className="text-[13px] font-bold">ProfitHishab</div>
              <div className="truncate text-xs text-ink-muted">{businessName}</div>
            </div>
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-ink">
            {initials(userName)}
          </span>
        </header>

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 2xl:max-w-[1400px] pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-14 lg:pt-10">
          {children}
        </main>

        {/* Phone bottom tabs */}
        <nav className="fixed inset-x-0 bottom-0 z-30 lg:hidden" aria-label="Main">
          <div className="border-t border-line/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
            <div className="grid grid-cols-5 items-end text-[11px] font-semibold">
              {TABS.slice(0, 2).map((tab) => (
                <TabLink key={tab.href} tab={tab} active={isActive(tab.href)} current={isCurrent(tab.href)} onClick={navigate(tab.href)} />
              ))}
              <div className="flex justify-center">
                <Link
                  href="/orders/new"
                  aria-label="New order"
                  className="-mt-5 mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-schist-100 shadow-glow ring-4 ring-white"
                >
                  <Plus className="h-6 w-6" strokeWidth={2.5} />
                </Link>
              </div>
              <TabLink tab={TABS[2]} active={isActive(TABS[2].href)} current={isCurrent(TABS[2].href)} onClick={navigate(TABS[2].href)} />
              <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetTrigger className={clsx('flex flex-col items-center gap-1 py-2.5', moreOpen ? 'text-ink' : 'text-ink-faint')}>
                  <Menu className="h-5 w-5" />
                  More
                </SheetTrigger>
                <SheetContent side="bottom" className="mx-auto max-w-lg">
                  <SheetHeader>
                    <SheetTitle>More</SheetTitle>
                    <SheetDescription className="truncate">{businessName}</SheetDescription>
                  </SheetHeader>
                  <ul className="grid grid-cols-2 gap-1">
                    {ALL_ITEMS.filter((n) => !TABS.some((t) => t.href === n.href)).map(({ href, label, icon: Icon }) => (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={(e) => {
                            setMoreOpen(false);
                            navigate(href)(e);
                          }}
                          aria-current={isCurrent(href) ? 'page' : undefined}
                          className={clsx(
                            'flex min-h-12 items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-medium',
                            isActive(href) ? 'bg-brand-soft text-ink' : 'hover:bg-paper',
                          )}
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          {label}
                        </Link>
                      </li>
                    ))}
                    <li>
                      <Button
                        variant="ghost"
                        onClick={logout}
                        className="min-h-12 w-full justify-start gap-2.5 px-3 font-medium text-loss hover:bg-loss-soft hover:text-loss"
                      >
                        <LogOut className="h-[18px] w-[18px]" />
                        Log out
                      </Button>
                    </li>
                  </ul>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}

function TabLink({ tab, active, current, onClick }: { tab: NavItem; active: boolean; current: boolean; onClick: (e: MouseEvent) => void }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      onClick={onClick}
      aria-current={current ? 'page' : undefined}
      className={clsx('flex flex-col items-center gap-1 py-2.5', active ? 'text-ink' : 'text-ink-faint')}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
      {tab.label}
    </Link>
  );
}
