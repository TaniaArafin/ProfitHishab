// shadcn/ui Alert (new-york), themed with the schist tokens: inline messages after a save or a failure.
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva('w-full rounded-xl border px-3.5 py-2.5 text-sm [&>svg]:mr-2 [&>svg]:inline [&>svg]:h-4 [&>svg]:w-4', {
  variants: {
    variant: {
      default: 'border-line bg-paper text-ink',
      success: 'border-gain/20 bg-gain-soft text-gain-ink',
      warning: 'border-warn/20 bg-warn-soft text-warn-ink',
      destructive: 'border-loss/20 bg-loss-soft text-loss-ink',
    },
  },
  defaultVariants: { variant: 'default' },
});

function Alert({ className, variant, ...props }: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('font-semibold', className)} {...props} />;
}

function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('text-sm', className)} {...props} />;
}

export { Alert, AlertDescription, AlertTitle };
