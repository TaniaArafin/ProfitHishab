import { accessStatus, trialDaysLeft, type AdminActionDto, type AdminBusinessDto, type AdminBusinessListItemDto } from '@ph/shared';
import type { AdminActionRow, AdminBusinessDetailRow, AdminBusinessRow } from './admin.repository';

export function toAdminBusinessListItemDto(r: AdminBusinessRow, now: Date): AdminBusinessListItemDto {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    owner: { id: r.ownerId, name: r.ownerName, email: r.ownerEmail, phone: r.ownerPhone, phoneVerified: r.phoneVerified },
    status: accessStatus(r.trialEndsAt, r.blockedAt, now),
    trialEndsAt: r.trialEndsAt?.toISOString() ?? null,
    daysLeft: trialDaysLeft(r.trialEndsAt, now),
    orderCount: r.orderCount,
    lastActiveAt: r.lastActiveAt?.toISOString() ?? null,
  };
}

export function toAdminActionDto(a: AdminActionRow): AdminActionDto {
  const details = a.details && typeof a.details === 'object' && !Array.isArray(a.details) ? a.details : {};
  return { id: a.id, action: a.action, details, adminName: a.adminName, createdAt: a.createdAt.toISOString() };
}

export function toAdminBusinessDto(r: AdminBusinessDetailRow, actions: AdminActionRow[], now: Date): AdminBusinessDto {
  return {
    ...toAdminBusinessListItemDto(r, now),
    city: r.city,
    businessType: r.businessType,
    blockedAt: r.blockedAt?.toISOString() ?? null,
    blockedReason: r.blockedReason,
    productCount: r.productCount,
    actions: actions.map(toAdminActionDto),
  };
}
