import { z } from 'zod';

/**
 * The only place that reads process.env (laravel-patterns: config-never-env-outside-config).
 * Validated once at startup so a missing or malformed variable fails fast, not mid-request.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().url(),
    PORT: z.coerce.number().int().positive().default(4000),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
    REGISTER_LIMIT_PER_15_MINUTES: z.coerce.number().int().positive().default(10),
    /** Forgot-password and reset requests per IP (flood guard; the 3-links-an-hour rule is per account). */
    PASSWORD_RESET_LIMIT_PER_15_MINUTES: z.coerce.number().int().positive().default(10),
    LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
    LOGIN_FAILURE_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
    /** Product search: Typesense, or plain Postgres ILIKE (tests, or running without the search service). */
    SEARCH_DRIVER: z.enum(['typesense', 'postgres']).default('typesense'),
    TYPESENSE_URL: z.string().url().optional(),
    TYPESENSE_API_KEY: z.string().min(1).optional(),
    TYPESENSE_COLLECTION: z.string().min(1).default('products'),
    /**
     * true: sign-up confirms the phone with an SMS code (one trial per verified number).
     * false (test phase, default): email or phone and a password, no SMS. The 7-day trial applies either way.
     */
    OTP_REQUIRED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /**
     * How registration codes are sent (only when OTP_REQUIRED is on). Only `log` exists until an SMS gateway is chosen:
     * it writes the code to the API log instead of texting it.
     */
    SMS_DRIVER: z.enum(['log']).default('log'),
    /** Dev and test only: every code is this value instead of a random one, so e2e tests can register. */
    OTP_FIXED_CODE: z
      .string()
      .regex(/^\d{6}$/, 'must be 6 digits')
      .optional(),
    /**
     * With OTP_REQUIRED on, production refuses `SMS_DRIVER=log`, because anyone could register without
     * owning the phone. Only a production-mode test run (CI) sets this to allow it.
     */
    ALLOW_INSECURE_OTP_IN_PRODUCTION: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /** Where sellers open the app; emailed links (password reset) point here. */
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
    /**
     * How email is sent. `log` writes it to the API log (development, tests); `smtp` sends through any
     * SMTP service (Brevo, Resend, Mailgun, Amazon SES, Gmail…). Production refuses `log`, since a
     * forgot-password email that never arrives locks the seller out.
     */
    MAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
    MAIL_FROM: z.string().min(3).default('ProfitHishab <no-reply@localhost>'),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    /** true for port 465 (TLS from the start); false for 587, which upgrades with STARTTLS. */
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    /** Only a production-mode test run (CI) sets this, to run without a mail service. */
    ALLOW_LOG_MAIL_IN_PRODUCTION: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.OTP_REQUIRED && env.NODE_ENV === 'production' && !env.ALLOW_INSECURE_OTP_IN_PRODUCTION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMS_DRIVER'],
        message:
          'production needs a real SMS gateway (log only writes codes to the log); set ALLOW_INSECURE_OTP_IN_PRODUCTION=true only for test runs',
      });
    }
    if (env.MAIL_DRIVER === 'log' && env.NODE_ENV === 'production' && !env.ALLOW_LOG_MAIL_IN_PRODUCTION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAIL_DRIVER'],
        message:
          'production needs MAIL_DRIVER=smtp (log only writes emails to the log); set ALLOW_LOG_MAIL_IN_PRODUCTION=true only for test runs',
      });
    }
    if (env.MAIL_DRIVER === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SMTP_HOST'], message: 'required when MAIL_DRIVER=smtp' });
    }
  });

export type AppConfig = Readonly<{
  env: 'development' | 'test' | 'production';
  logLevel: string;
  databaseUrl: string;
  port: number;
  cookieSecure: boolean;
  sessionTtlMs: number;
  rateLimitPerMinute: number;
  registerLimitPer15Minutes: number;
  passwordResetLimitPer15Minutes: number;
  login: { maxFailures: number; windowMs: number };
  search: { url: string; apiKey: string; collection: string } | null;
  sms: { otpRequired: boolean; driver: 'log'; fixedCode: string | null };
  webOrigin: string;
  mail: {
    from: string;
    smtp: { host: string; port: number; secure: boolean; user: string | null; pass: string | null } | null;
  };
}>;

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const env = parsed.data;
  cached = Object.freeze({
    env: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    port: env.PORT,
    cookieSecure: env.COOKIE_SECURE,
    sessionTtlMs: env.SESSION_TTL_DAYS * 86_400_000,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
    registerLimitPer15Minutes: env.REGISTER_LIMIT_PER_15_MINUTES,
    passwordResetLimitPer15Minutes: env.PASSWORD_RESET_LIMIT_PER_15_MINUTES,
    login: { maxFailures: env.LOGIN_MAX_FAILURES, windowMs: env.LOGIN_FAILURE_WINDOW_MINUTES * 60_000 },
    search:
      env.SEARCH_DRIVER === 'typesense' && env.TYPESENSE_URL && env.TYPESENSE_API_KEY
        ? { url: env.TYPESENSE_URL, apiKey: env.TYPESENSE_API_KEY, collection: env.TYPESENSE_COLLECTION }
        : null,
    sms: { otpRequired: env.OTP_REQUIRED, driver: env.SMS_DRIVER, fixedCode: env.OTP_FIXED_CODE ?? null },
    webOrigin: env.WEB_ORIGIN.replace(/\/+$/, ''),
    mail: {
      from: env.MAIL_FROM,
      smtp:
        env.MAIL_DRIVER === 'smtp' && env.SMTP_HOST
          ? { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, user: env.SMTP_USER ?? null, pass: env.SMTP_PASS ?? null }
          : null,
    },
  });
  return cached;
}
