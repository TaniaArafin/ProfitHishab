import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from '@ph/shared';
import type { Request, Response } from 'express';
import { Auth, Public, SESSION_COOKIE, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { config } from '../../config';
import { AuthService, type IssuedSession } from './auth.service';

const FIFTEEN_MIN = 15 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: () => config().registerLimitPer15Minutes, ttl: FIFTEEN_MIN } })
  async register(@Body(zod(registerSchema)) body: RegisterInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.setSessionCookie(res, await this.auth.register(body, this.meta(req)));
    return { data: { ok: true } };
  }

  /** Failed attempts are limited per account and per IP by LoginAttempts (FR-AUTH-08); this is a coarse flood guard. */
  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: FIFTEEN_MIN } })
  async login(@Body(zod(loginSchema)) body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.setSessionCookie(res, await this.auth.login(body, this.meta(req)));
    return { data: { ok: true } };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Auth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(auth.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { data: { ok: true } };
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@Auth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutEverywhere(auth.userId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { data: { ok: true } };
  }

  @Get('me')
  async me(@Auth() auth: AuthContext) {
    return { data: await this.auth.me(auth.userId, auth.businessId) };
  }

  private setSessionCookie(res: Response, session: IssuedSession): void {
    res.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: config().cookieSecure,
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });
  }

  private meta(req: Request) {
    return { ip: req.ip, userAgent: req.header('user-agent') };
  }
}
