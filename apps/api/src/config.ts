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
  login: { maxFailures: number; windowMs: number };
  search: { url: string; apiKey: string; collection: string } | null;
  sms: { otpRequired: boolean; driver: 'log'; fixedCode: string | null };
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
    login: { maxFailures: env.LOGIN_MAX_FAILURES, windowMs: env.LOGIN_FAILURE_WINDOW_MINUTES * 60_000 },
    search:
      env.SEARCH_DRIVER === 'typesense' && env.TYPESENSE_URL && env.TYPESENSE_API_KEY
        ? { url: env.TYPESENSE_URL, apiKey: env.TYPESENSE_API_KEY, collection: env.TYPESENSE_COLLECTION }
        : null,
    sms: { otpRequired: env.OTP_REQUIRED, driver: env.SMS_DRIVER, fixedCode: env.OTP_FIXED_CODE ?? null },
  });
  return cached;
}
