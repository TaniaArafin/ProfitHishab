// shadcn/ui Badge (new-york), themed with the schist tokens.
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
  {
    variants: {
      variant: {
        default: 'bg-brand-soft text-ink ring-brand/15',
        muted: 'bg-paper text-ink-muted ring-line',
        success: 'bg-gain-soft text-gain ring-gain/15',
        warning: 'bg-warn-soft text-warn ring-warn/15',
        info: 'bg-info-soft text-info-ink ring-info/20',
        destructive: 'bg-loss-soft text-loss ring-loss/15',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({ className, variant, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
