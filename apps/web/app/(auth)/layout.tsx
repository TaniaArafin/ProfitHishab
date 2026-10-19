import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoMark } from '@/components/LogoMark';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-night-gradient p-12 text-schist-100 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-glow/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand/40 blur-3xl" aria-hidden />
        {/* Brand only: one calm line, no feature list (the app explains itself after sign-up). */}
        <div className="relative m-auto flex flex-col items-center gap-5 text-center">
          <Link href="/" aria-label="ProfitHishab home">
            <LogoMark size="lg" />
          </Link>
          <span className="text-3xl font-bold tracking-tight text-schist-100">ProfitHishab</span>
          <p className="font-bangla text-lg text-schist-200">ব্যবসা আপনার, লাভ-ক্ষতির হিসাব আমাদের।</p>
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
