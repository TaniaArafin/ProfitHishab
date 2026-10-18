'use client';

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <h1 className="text-lg font-semibold">This page could not load</h1>
      <p className="max-w-md text-sm text-ink-muted">{error.message || 'Something went wrong while loading your data.'}</p>
      <button type="button" className="btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
