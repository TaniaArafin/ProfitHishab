'use client';

// shadcn/ui Checkbox (new-york), themed with the schist tokens.
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative h-[18px] w-[18px] shrink-0 rounded-[5px] border border-ink/25 bg-card shadow-[0_1px_2px_rgba(24,31,20,0.05)] transition',
        'before:absolute before:-inset-3 before:content-[""] hover:border-ink/40',
        'data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-schist-100',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="flex items-center justify-center">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
