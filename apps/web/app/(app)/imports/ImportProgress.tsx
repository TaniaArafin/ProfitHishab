import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 'upload', label: 'Upload file' },
  { id: 'review', label: 'Review and fix' },
  { id: 'done', label: 'Done' },
] as const;

/** The three steps a seller sees, whatever happens behind them. */
export function ImportProgress({ current }: { current: (typeof STEPS)[number]['id'] }) {
  const at = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-2 text-xs sm:text-sm" aria-label="Import progress">
      {STEPS.map((step, i) => {
        const done = i < at || current === 'done';
        return (
          <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2" aria-current={i === at ? 'step' : undefined}>
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                done ? 'bg-gain text-white' : i === at ? 'bg-ink text-card' : 'bg-line text-ink-muted',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn('truncate', i === at ? 'font-semibold text-ink' : 'text-ink-muted')}>{step.label}</span>
            {i < STEPS.length - 1 ? <span className="hidden h-px flex-1 bg-line sm:block" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
