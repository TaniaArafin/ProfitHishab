import clsx from 'clsx';
import { TrendingUp } from 'lucide-react';

export function LogoMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-xl bg-accent-gradient text-schist-900 shadow-[0_6px_16px_-6px_rgba(77,93,72,0.45)]',
        size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-16 w-16 rounded-2xl' : 'h-10 w-10',
      )}
      aria-hidden
    >
      <TrendingUp className={size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'} strokeWidth={2.6} />
    </span>
  );
}
