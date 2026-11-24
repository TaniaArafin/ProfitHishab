'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ImportCommitResultDto, ImportDto } from '@ph/shared';
import { Banner } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { ImportProgress } from '../ImportProgress';
import { MappingStep } from './MappingStep';
import { PreviewStep } from './PreviewStep';
import { ResultStep } from './ResultStep';
import { StatusStep } from './StatusStep';

/**
 * The step on screen once the seller has acted. Each holds the API response that led to it, so the
 * step shows what the API just said: the mapping response (status texts to match), the validate
 * response (fresh counts), or the commit result, which the API does not store.
 */
type View =
  | { step: 'mapping'; imp: ImportDto; reviewStatuses?: boolean }
  | { step: 'statuses'; imp: ImportDto }
  | { step: 'preview'; imp: ImportDto }
  | { step: 'result'; result: ImportCommitResultDto };

/** Before the seller acts, the server's status picks the step. */
function initialView(imp: ImportDto): View | 'imported' | 'undone' | 'failed' {
  switch (imp.status) {
    case 'uploaded':
      return { step: 'mapping', imp };
    case 'mapped':
      // Columns are saved; with a status column, what is left is the statuses we could not recognise.
      return imp.mapping?.columns.status ? { step: 'statuses', imp } : { step: 'mapping', imp };
    case 'validated':
      return { step: 'preview', imp };
    default:
      return imp.status;
  }
}

/**
 * Preview → result when the file was recognised at upload. Mapping and statuses appear only for what
 * needs an answer, or when the seller chooses Change columns.
 */
export function ImportWizard({ imp }: { imp: ImportDto }) {
  const [view, setView] = useState<View | null>(null);
  // Bumped on every check, so the preview remounts and its tabs load the re-checked rows.
  const [check, setCheck] = useState(0);
  const current = view ?? initialView(imp);

  const showPreview = (checked: ImportDto) => {
    setCheck(check + 1);
    setView({ step: 'preview', imp: checked });
  };

  if (current === 'imported') return <ResultStep importedOrders={imp.importedOrders} />;
  if (current === 'undone')
    return <Notice text="This import was undone. Its orders were deleted." href="/imports" link="Back to imports" />;
  if (current === 'failed') return <Notice text="This file could not be imported." href="/imports/new" link="Upload another file" />;

  const step = () => {
    switch (current.step) {
      case 'mapping':
        return (
          <MappingStep
            key={`mapping-${check}`}
            imp={current.imp}
            reviewStatuses={current.reviewStatuses}
            onStatuses={(mapped) => setView({ step: 'statuses', imp: mapped })}
            onChecked={showPreview}
          />
        );
      case 'statuses':
        return (
          <StatusStep
            imp={current.imp}
            onBack={() => setView({ step: 'mapping', imp: current.imp, reviewStatuses: true })}
            onChecked={showPreview}
          />
        );
      case 'preview':
        return (
          <PreviewStep
            key={`preview-${check}`}
            imp={current.imp}
            onBack={() => setView({ step: 'mapping', imp: current.imp, reviewStatuses: true })}
            onRechecked={showPreview}
            onRowFixed={(updated) => setView({ step: 'preview', imp: updated })}
            onImported={(result) => setView({ step: 'result', result })}
          />
        );
      case 'result':
        return <ResultStep result={current.result} />;
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <ImportProgress current={current.step === 'result' ? 'done' : 'review'} />
      {step()}
    </div>
  );
}

function Notice({ text, href, link }: { text: string; href: string; link: string }) {
  return (
    <Banner tone="brand">
      <p>{text}</p>
      <Button asChild variant="secondary" className="mt-3">
        <Link href={href}>{link}</Link>
      </Button>
    </Banner>
  );
}
