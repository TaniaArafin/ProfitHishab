import { PackageCheck, PieChart, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoMark } from '@/components/LogoMark';

const POINTS = [
  { icon: PieChart, text: 'Real monthly profit after product cost, courier and ads' },
  { icon: RotateCcw, text: 'What returned parcels actually cost you, in taka' },
  { icon: PackageCheck, text: 'Which products make money, and which only sell' },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-night-gradient p-12 text-schist-100 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-glow/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand/40 blur-3xl" aria-hidden />
        <Link href="/" className="relative flex items-center gap-3">
          <LogoMark />
          <span className="text-lg font-bold tracking-tight">ProfitHishab</span>
        </Link>
        <div className="relative mt-auto max-w-md">
          <p className="font-bangla text-3xl font-semibold leading-snug">Sales দেখবেন না — আসল Profit বুঝবেন।</p>
          <ul className="mt-8 flex flex-col gap-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-schist-200/80">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/10">
                  <Icon className="h-4 w-4 text-schist-100" />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
            <div className="text-xs text-schist-200/50">Net profit · September (example)</div>
            <div className="mt-1 text-3xl font-extrabold tabular">৳1,20,000</div>
            <div className="mt-1 text-xs text-gain-bright">23.1% margin on ৳5,20,000 sales</div>
          </div>
        </div>
      </aside>

      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <Link href="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
          <LogoMark size="sm" />
          <span className="font-bold">ProfitHishab</span>
        </Link>
        <div className="w-full max-w-md animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
