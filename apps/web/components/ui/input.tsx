// shadcn/ui Input (new-york), themed with the schist tokens.
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const inputClass =
  'block w-full min-w-0 rounded-xl border border-line bg-card px-3.5 py-2.5 text-base text-ink shadow-[0_1px_2px_rgba(24,31,20,0.04)] transition placeholder:text-ink-faint hover:border-ink/20 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-paper disabled:opacity-70 aria-[invalid=true]:border-loss sm:text-[15px]';

function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(inputClass, className)} {...props} />;
}

export { Input, inputClass };
