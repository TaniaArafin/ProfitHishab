import { Skeleton } from '@/components/ui';

/**
 * Shown instantly on navigation while the server renders the next page
 * (Next.js production checklist: streaming with loading UI).
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-4">
        <Skeleton className="hidden h-12 w-12 sm:block" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
