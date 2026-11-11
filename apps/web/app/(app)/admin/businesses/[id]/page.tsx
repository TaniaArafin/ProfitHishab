import type { Metadata } from 'next';
import { ArrowLeft, Building2 } from 'lucide-react';
import Link from 'next/link';
import type { AdminActionDto, AdminBusinessDto } from '@ph/shared';
import { PageHeader } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/server-api';
import { AccessBadge } from '../../AccessBadge';
import { formatDate, formatDateTime } from '../../format';
import { AccessForm } from './AccessForm';
import { BlockControls } from './BlockControls';
import { ResetLinkButton } from './ResetLinkButton';

export const metadata: Metadata = { title: 'Business · Admin' };

const str = (v: unknown) => (typeof v === 'string' ? v : null);

/** One line of history, in words. */
function describe(a: AdminActionDto): string {
  const d = a.details;
  switch (a.action) {
    case 'set_access': {
      const was = ` (was ${str(d.from) ? formatDate(str(d.from)) : 'unlimited'})`;
      if (d.mode === 'extend') return `Added ${String(d.days)} days${was}`;
      if (d.mode === 'until') return `Access until ${formatDate(str(d.to))}${was}`;
      if (d.mode === 'unlimited') return `Made unlimited${was}${d.via === 'admin:grant' ? ' when made a platform admin' : ''}`;
      return `Ended access${was}`;
    }
    case 'block':
      return `Blocked: ${str(d.reason) ?? ''}`;
    case 'unblock':
      return 'Unblocked';
    case 'reset_link':
      return 'Created a password link';
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium sm:text-right">{children}</dd>
    </div>
  );
}

export default async function AdminBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: b } = await apiGet<{ data: AdminBusinessDto }>(`/admin/businesses/${id}`);

  return (
    <div className="flex flex-col gap-5">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/admin">
          <ArrowLeft className="h-4 w-4" /> All businesses
        </Link>
      </Button>
      <PageHeader icon={Building2} title={b.name} description={<AccessBadge status={b.status} daysLeft={b.daysLeft} />} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Owner and usage</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2.5">
              <Row label="Owner">{b.owner.name}</Row>
              <Row label="Phone">
                {b.owner.phone ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="tabular">{b.owner.phone}</span>
                    <Badge variant={b.owner.phoneVerified ? 'success' : 'muted'}>
                      {b.owner.phoneVerified ? 'Verified' : 'Not verified'}
                    </Badge>
                  </span>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Email">{b.owner.email ?? '—'}</Row>
              <Row label="City · type">{[b.city, b.businessType].filter(Boolean).join(' · ') || '—'}</Row>
              <Row label="Signed up">{formatDateTime(b.createdAt)}</Row>
              <Row label="Last active">{formatDateTime(b.lastActiveAt)}</Row>
              <Row label="Orders · products">
                <span className="tabular">
                  {b.orderCount} · {b.productCount}
                </span>
              </Row>
              <Row label="Access ends">{b.trialEndsAt ? formatDateTime(b.trialEndsAt) : 'Never (unlimited)'}</Row>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
            <CardDescription>After the end date the account is read-only. Record a manual payment here by adding days.</CardDescription>
          </CardHeader>
          <CardContent>
            <AccessForm businessId={b.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              For an owner who can&apos;t reset it themselves, such as a phone-only account. Send the link by SMS or WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResetLinkButton businessId={b.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{b.blockedAt ? 'Blocked' : 'Block'}</CardTitle>
            <CardDescription>
              {b.blockedAt
                ? `Since ${formatDateTime(b.blockedAt)}: ${b.blockedReason ?? 'no reason given'}`
                : 'Logs everyone out and stops them logging in. Use for abuse, not for unpaid accounts.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BlockControls businessId={b.id} blocked={b.blockedAt !== null} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>What admins changed on this business, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {b.actions.length === 0 ? (
            <p className="text-sm text-ink-muted">No changes yet.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-line/60">
              {b.actions.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-4">
                  <span className="min-w-0 break-words text-sm">{describe(a)}</span>
                  <span className="shrink-0 text-xs text-ink-faint">
                    {a.adminName ?? 'Former admin'} · {formatDateTime(a.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
