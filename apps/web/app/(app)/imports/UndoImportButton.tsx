'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client-api';
import { refreshData } from '@/lib/navigation';

/** Undo one import: deletes its orders after an in-page confirmation, then re-renders the history. */
export function UndoImportButton({ id, fileName, orders }: { id: string; fileName: string; orders: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    setPending(true);
    setError(null);
    const res = await api('POST', `/imports/${id}/undo`);
    setPending(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setOpen(false);
    refreshData(router);
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive-outline" size="sm" aria-label={`Undo ${fileName}`}>
          Undo
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo this import?</AlertDialogTitle>
          <AlertDialogDescription>
            Delete the {orders} orders from this import? Customers and products it created are deleted too if no other order uses them, even
            if you edited them since.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          {/* A plain Button, not AlertDialogAction: the dialog stays open until the undo finishes. */}
          <Button variant="destructive" disabled={pending} onClick={undo}>
            {pending ? 'Undoing…' : 'Undo import'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
