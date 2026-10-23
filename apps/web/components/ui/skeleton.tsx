// shadcn/ui Skeleton, themed with the schist tokens.
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('animate-pulse rounded-xl bg-line/60', className)} {...props} />;
}

export { Skeleton };
