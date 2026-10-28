import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isTrialOver } from '@ph/shared';
import { ALLOW_AFTER_TRIAL, IS_PUBLIC, SESSION_COOKIE, type AuthedRequest } from '../../common/auth';
import { AuthError, TrialError } from '../../common/errors';
import { AuthService } from './auth.service';

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard: every route needs a valid session unless marked @Public().
 * After the free trial ends the account is read-only: writes get 402 unless marked @AllowAfterTrial().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;

    const resolved = token ? await this.auth.resolveSession(token) : null;
    if (resolved) req.auth = resolved;

    if (isPublic) return true;
    if (!resolved) throw AuthError.unauthenticated();

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_AFTER_TRIAL, [context.getHandler(), context.getClass()]);
    if (!READS.has(req.method) && !allowed && isTrialOver(resolved.trialEndsAt, new Date())) throw TrialError.ended();
    return true;
  }
}
