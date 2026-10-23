// shadcn/ui Textarea (new-york), themed with the schist tokens.
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(inputClass, 'min-h-20', className)} {...props} />;
}

export { Textarea };
