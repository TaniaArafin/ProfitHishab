'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

/** Archive (confirmed in-page) or restore a stored product. */
export function ArchiveActions({
  name,
  archived,
  onArchive,
  onRestore,
}: {
  name: string;
  archived: boolean;
  onArchive: () => void;
  onRestore: () => void;
}) {
  if (archived) {
    return (
      <Button type="button" variant="link" className="self-center text-ink sm:ml-auto" onClick={onRestore}>
        Restore product
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="link" className="self-center text-loss hover:text-loss sm:ml-auto">
          Archive product
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It leaves your product list and can&apos;t be added to new orders. Past orders and their profit stay as they are. You can
            restore it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep product</AlertDialogCancel>
          <AlertDialogAction onClick={onArchive}>Archive product</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
