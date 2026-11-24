import { Check, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type BusyStep = 'upload' | 'read' | 'check' | 'import';

const UPLOAD_STEPS: Array<{ id: BusyStep; label: string }> = [
  { id: 'upload', label: 'Upload file' },
  { id: 'read', label: 'Read your file' },
  { id: 'check', label: 'Check every row' },
];

/**
 * What the import is doing right now. Only the upload has a real percentage (bytes sent); the server
 * steps that follow take a second or two, so their bar moves without claiming a number.
 */
export function ImportBusy({ step, uploaded, orders = 0 }: { step: BusyStep; uploaded?: number; orders?: number }) {
  const percent = step === 'upload' && uploaded !== undefined ? Math.round(uploaded * 100) : null;
  const label =
    step === 'import'
      ? `Creating ${orders} ${orders === 1 ? 'order' : 'orders'}`
      : step === 'upload'
        ? 'Uploading your file'
        : (UPLOAD_STEPS.find((s) => s.id === step)?.label ?? '');
  const at = UPLOAD_STEPS.findIndex((s) => s.id === step);

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4" aria-live="polite">
      {step !== 'import' ? (
        <ol className="flex flex-col gap-1.5 text-sm">
          {UPLOAD_STEPS.map((s, i) => {
            const state = i < at ? 'done' : i === at ? 'current' : 'todo';
            return (
              <li key={s.id} data-state={state} aria-current={state === 'current' ? 'step' : undefined} className="flex items-center gap-2">
                {state === 'done' ? (
                  <Check className="h-4 w-4 text-gain" aria-hidden />
                ) : state === 'current' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-ink" aria-hidden />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-line" aria-hidden />
                )}
                <span className={cn(state === 'todo' ? 'text-ink-faint' : 'text-ink', state === 'current' && 'font-semibold')}>
                  {s.label}
                </span>
                {state === 'current' && percent !== null ? <span className="ml-auto tabular text-ink-muted">{percent}%</span> : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {label}…
        </p>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={percent !== null ? 0 : undefined}
        aria-valuemax={percent !== null ? 100 : undefined}
        aria-valuenow={percent ?? undefined}
        className="h-1.5 overflow-hidden rounded-full bg-brand-soft"
      >
        {percent !== null ? (
          <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${percent}%` }} />
        ) : (
          <div className="h-full w-2/5 animate-progress rounded-full bg-brand" />
        )}
      </div>
    </Card>
  );
}
