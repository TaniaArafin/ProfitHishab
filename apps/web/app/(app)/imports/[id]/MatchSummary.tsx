import { IMPORT_TARGET_LABELS, ORDER_STATUS_LABELS, type ImportDto, type ImportTarget } from '@ph/shared';

const plural = (n: number, word: string, many: string) => `${n} ${n === 1 ? word : many}`;

/** One line on the preview, opening to show how the file was read, so a wrong match can be spotted. */
export function MatchSummary({ imp }: { imp: ImportDto }) {
  if (!imp.mapping) return null;
  const columns = Object.entries(imp.mapping.columns).filter(([, col]) => col) as Array<[ImportTarget, string]>;
  const statuses = Object.entries(imp.mapping.statuses);
  const title = `Matched ${plural(columns.length, 'column', 'columns')}${statuses.length ? ` and ${plural(statuses.length, 'status', 'statuses')}` : ''}`;

  return (
    <details className="rounded-xl border border-line px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-1 sm:grid-cols-2">
        {columns.map(([target, col]) => (
          <div key={target} className="flex min-w-0 justify-between gap-2">
            <dt className="truncate text-ink-muted">{col}</dt>
            <dd className="truncate">{IMPORT_TARGET_LABELS[target]}</dd>
          </div>
        ))}
        {statuses.map(([text, status]) => (
          <div key={text} className="flex min-w-0 justify-between gap-2">
            <dt className="truncate text-ink-muted">“{text || '(empty)'}”</dt>
            <dd className="truncate">{ORDER_STATUS_LABELS[status]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
