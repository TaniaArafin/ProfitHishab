import { ACCESS_STATUS_LABELS, type AccessStatus } from '@ph/shared';
import { Badge } from '@/components/ui/badge';

const VARIANT: Record<AccessStatus, 'default' | 'warning' | 'success' | 'destructive'> = {
  trial: 'default',
  ended: 'warning',
  unlimited: 'success',
  blocked: 'destructive',
};

/** Access status with days left; the text, not only the colour, carries the meaning. */
export function AccessBadge({ status, daysLeft }: { status: AccessStatus; daysLeft: number | null }) {
  const days = status === 'trial' && daysLeft !== null ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : '';
  return (
    <Badge variant={VARIANT[status]}>
      {ACCESS_STATUS_LABELS[status]}
      {days}
    </Badge>
  );
}
