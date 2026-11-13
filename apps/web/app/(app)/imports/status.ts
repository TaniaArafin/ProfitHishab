import type { ImportStatus } from '@ph/shared';

/** How each import status reads in the history. */
export const IMPORT_STATUS_BADGES: Record<
  ImportStatus,
  { label: string; variant: 'default' | 'muted' | 'success' | 'warning' | 'destructive' }
> = {
  uploaded: { label: 'Uploaded', variant: 'muted' },
  mapped: { label: 'Columns chosen', variant: 'muted' },
  validated: { label: 'Checked', variant: 'warning' },
  imported: { label: 'Imported', variant: 'success' },
  undone: { label: 'Undone', variant: 'muted' },
  failed: { label: 'Failed', variant: 'destructive' },
};

/** "2026-11-12T08:00:00Z" → "12 Nov 2026, 2:00 pm" in Dhaka time. */
export function formatImportTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Dhaka',
  });
}
