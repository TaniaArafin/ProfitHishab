import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { newAccessEnd, type AdminAccessInput, type AdminAction, type AdminBusinessDto, type AdminResetLinkDto } from '@ph/shared';
import type { Tx } from '../../common/prisma.service';
import { AuthService } from '../auth/auth.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { BusinessService } from '../business/business.service';
import { AdminError } from './admin.errors';
import { toAdminBusinessDto } from './admin.presenter';
import { AdminRepository } from './admin.repository';

const iso = (d: Date | null) => d?.toISOString() ?? null;

/**
 * Platform admin use cases. Every change runs in one transaction with its admin_actions row, so the
 * history never misses a change and never shows one that did not happen.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly repo: AdminRepository,
    private readonly business: BusinessService,
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  async show(businessId: string, now = new Date()): Promise<AdminBusinessDto> {
    const [row, actions] = await Promise.all([this.repo.findBusiness(businessId), this.repo.recentActions(businessId)]);
    if (!row) throw AdminError.businessNotFound();
    return toAdminBusinessDto(row, actions, now);
  }

  /** Extend, set an end date, make unlimited, or end access now. Manual payment uses this until billing exists. */
  async setAccess(adminUserId: string, businessId: string, change: AdminAccessInput, now = new Date()): Promise<AdminBusinessDto> {
    await this.repo.transaction(async (tx) => {
      const current = await this.business.lockAccess(businessId, tx);
      if (!current) throw AdminError.businessNotFound();
      const next = newAccessEnd(change, current.trialEndsAt, now);
      await this.business.setAccessEnd(businessId, next, tx);
      await this.repo.logAction(
        { adminUserId, businessId, action: 'set_access', details: { ...change, from: iso(current.trialEndsAt), to: iso(next) } },
        tx,
      );
    });
    return this.show(businessId, now);
  }

  /** Nobody in the business can log in; everyone is logged out at once. */
  async block(
    adminUserId: string,
    adminBusinessId: string,
    businessId: string,
    reason: string,
    now = new Date(),
  ): Promise<AdminBusinessDto> {
    if (businessId === adminBusinessId) throw AdminError.cannotBlockOwnBusiness();
    await this.repo.transaction(async (tx) => {
      if (!(await this.business.lockAccess(businessId, tx))) throw AdminError.businessNotFound();
      await this.business.setBlocked(businessId, { at: now, reason }, tx);
      await this.auth.revokeBusinessSessions(businessId, tx);
      await this.repo.logAction({ adminUserId, businessId, action: 'block', details: { reason } }, tx);
    });
    return this.show(businessId, now);
  }

  /**
   * Writes one admin_actions row inside another module's transaction (billing confirm and reject),
   * so the history and the change commit or roll back together.
   */
  async recordAction(
    entry: { adminUserId: string; businessId: string; action: AdminAction; details: Prisma.InputJsonObject },
    tx: Tx,
  ): Promise<void> {
    await this.repo.logAction(entry, tx);
  }

  /** The owner can log in again (their old sessions stay ended). */
  async unblock(adminUserId: string, businessId: string, now = new Date()): Promise<AdminBusinessDto> {
    await this.repo.transaction(async (tx) => {
      const current = await this.business.lockAccess(businessId, tx);
      if (!current) throw AdminError.businessNotFound();
      await this.business.setBlocked(businessId, null, tx);
      await this.repo.logAction({ adminUserId, businessId, action: 'unblock', details: { blockedAt: iso(current.blockedAt) } }, tx);
    });
    return this.show(businessId, now);
  }

  /** A password link for the owner, shown to the admin to send by SMS or WhatsApp. Logged without the link. */
  async resetLink(adminUserId: string, businessId: string, now = new Date()): Promise<AdminResetLinkDto> {
    const row = await this.repo.findBusiness(businessId);
    if (!row) throw AdminError.businessNotFound();
    const link = await this.passwordReset.createLink(row.ownerId, now);
    await this.repo.logAction({ adminUserId, businessId, action: 'reset_link', details: { ownerId: row.ownerId } });
    return { url: link.url, expiresAt: link.expiresAt.toISOString() };
  }

  /**
   * `npm run admin:grant`: turns the admin flag on or off for the user with this email or phone.
   * Turning it on also makes the admin's own business unlimited, so their trial never locks the panel.
   */
  async grant(identifier: string, on: boolean): Promise<{ id: string; name: string } | null> {
    const user = await this.auth.setPlatformAdmin(identifier, on);
    if (!user || !on) return user;
    const businessId = await this.repo.ownedBusinessId(user.id);
    if (businessId) {
      await this.repo.transaction(async (tx) => {
        const current = await this.business.lockAccess(businessId, tx);
        await this.business.setAccessEnd(businessId, null, tx);
        await this.repo.logAction(
          {
            adminUserId: user.id,
            businessId,
            action: 'set_access',
            details: { mode: 'unlimited', from: iso(current?.trialEndsAt ?? null), to: null, via: 'admin:grant' },
          },
          tx,
        );
      });
    }
    return user;
  }
}
