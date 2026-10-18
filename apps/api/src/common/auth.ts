import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export const SESSION_COOKIE = 'ph_session';
export const CSRF_COOKIE = 'ph_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Resolved from the session cookie by AuthGuard. The business always comes from here, never from the request. */
export interface AuthContext {
  userId: string;
  businessId: string;
  sessionId: string;
  timezone: string;
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.auth) {
    throw new Error('Auth context missing: route is not protected by AuthGuard.');
  }
  return req.auth;
});
