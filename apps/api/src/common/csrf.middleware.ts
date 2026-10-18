import { Injectable, NestMiddleware } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { CSRF_COOKIE, CSRF_HEADER } from './auth';
import { RequestError } from './errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie check on every mutating request. The web app sets the
 * `ph_csrf` cookie and echoes it in the `x-csrf-token` header.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
    const header = req.header(CSRF_HEADER);
    if (!cookie || !header || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
      // Thrown, not written here, so the one exception filter shapes every error (error-map-status-centrally).
      throw RequestError.csrfFailed();
    }
    next();
  }
}
