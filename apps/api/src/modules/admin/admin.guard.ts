import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthedRequest } from '../../common/auth';
import { AdminError } from './admin.errors';

/**
 * Every /admin route: only platform admins. Runs after the global AuthGuard, so an anonymous visitor
 * already got 401; a logged-in seller gets 404, never 403, so the panel's existence is not revealed.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth?.isPlatformAdmin) throw AdminError.notFound();
    return true;
  }
}
