'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { UploadStep } from './new/UploadStep';

/**
 * The Import orders button and its pop-up with the upload. After the upload the preview page opens.
 * `defaultOpen`: opened from a link to /imports/new; closing it then drops `?upload=1` from the address.
 */
export function ImportUploadDialog({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);

  function change(next: boolean) {
    if (busy) return; // A file is on its way: keep the progress in view.
    setOpen(next);
    if (!next && defaultOpen) router.replace('/imports');
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Import orders
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import orders</DialogTitle>
          <DialogDescription>Bring in your past orders from Excel or CSV.</DialogDescription>
        </DialogHeader>
        <UploadStep onBusy={setBusy} />
      </DialogContent>
    </Dialog>
  );
}
