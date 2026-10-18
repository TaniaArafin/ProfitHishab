import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC, SESSION_COOKIE, type AuthedRequest } from '../../common/auth';
import { AuthError } from '../../common/errors';
import { AuthService } from './auth.service';

/** Global guard: every route needs a valid session unless marked @Public(). */
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
    return true;
  }
}
