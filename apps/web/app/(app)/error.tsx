'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-5 py-12 text-center sm:px-6">
      <h1 className="text-lg font-semibold">This page could not load</h1>
      <p className="max-w-md break-words text-sm text-ink-muted">{error.message || 'Something went wrong while loading your data.'}</p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
