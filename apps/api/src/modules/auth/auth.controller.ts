import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  forgotPasswordSchema,
  loginSchema,
  otpRequestSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type OtpRequestInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@ph/shared';
import type { Request, Response } from 'express';
import { AllowAfterTrial, Auth, Public, SESSION_COOKIE, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { config } from '../../config';
import { AuthService, type IssuedSession } from './auth.service';
import { PasswordResetService } from './password-reset.service';

const FIFTEEN_MIN = 15 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  /** What the sign-up form must ask for (OTP on or off) and the trial length. */
  @Public()
  @Get('signup-options')
  signupOptions() {
    return { data: this.auth.signupOptions() };
  }

  /** Registration step 1. Per-phone limits live in the service (otp.ts); this caps one IP across many numbers. */
  @Public()
  @Post('otp')
  @HttpCode(202)
  @Throttle({ default: { limit: () => config().registerLimitPer15Minutes, ttl: FIFTEEN_MIN } })
  async requestOtp(@Body(zod(otpRequestSchema)) body: OtpRequestInput) {
    return { data: await this.auth.requestOtp(body.phone) };
  }

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

  /** FR-AUTH-06. Same answer whether or not the email has an account (FR-AUTH-03); 3 links an hour per account in the service. */
  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  @Throttle({ default: { limit: () => config().passwordResetLimitPer15Minutes, ttl: FIFTEEN_MIN } })
  async forgotPassword(@Body(zod(forgotPasswordSchema)) body: ForgotPasswordInput) {
    await this.passwordReset.requestLink(body);
    return { data: { ok: true } };
  }

  /** Sets a new password from an emailed link and logs out every device. The seller then logs in again. */
  @Public()
  @Post('password/reset')
  @HttpCode(200)
  @Throttle({ default: { limit: () => config().passwordResetLimitPer15Minutes, ttl: FIFTEEN_MIN } })
  async resetPassword(@Body(zod(resetPasswordSchema)) body: ResetPasswordInput, @Res({ passthrough: true }) res: Response) {
    await this.passwordReset.reset(body);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { data: { ok: true } };
  }

  @Post('logout')
  @HttpCode(200)
  @AllowAfterTrial()
  async logout(@Auth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(auth.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { data: { ok: true } };
  }

  @Post('logout-all')
  @HttpCode(200)
  @AllowAfterTrial()
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
