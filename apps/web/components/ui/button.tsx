// shadcn/ui Button (new-york), themed with the schist tokens.
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand-gradient text-schist-100 shadow-glow hover:brightness-110',
        secondary: 'border border-line bg-card text-ink shadow-[0_1px_2px_rgba(24,31,20,0.05)] hover:border-ink/20 hover:bg-paper',
        destructive: 'bg-loss text-white shadow-[0_8px_20px_-8px_rgba(194,54,43,0.6)] hover:brightness-110',
        'destructive-outline':
          'border border-line bg-card text-loss shadow-[0_1px_2px_rgba(24,31,20,0.05)] hover:border-loss/30 hover:bg-loss-soft',
        ghost: 'text-ink-muted hover:bg-paper hover:text-ink',
        link: 'h-auto px-0 py-0 font-medium text-ink-muted underline underline-offset-4 hover:text-ink active:scale-100',
      },
      size: {
        default: 'min-h-10 px-4 py-2.5',
        sm: 'min-h-8 rounded-lg px-3 py-1.5',
        lg: 'min-h-12 px-6 py-3 text-[15px]',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8 rounded-lg',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'min-h-0 px-0 py-0' }],
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
