import { z } from 'zod';

/**
 * Environment contract, validated once at boot. A misconfigured deployment fails
 * immediately with a readable report instead of misbehaving at runtime (v1 silently
 * fell back to a hard-coded JWT secret when JWT_SECRET was missing).
 */
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me-0123456789';

const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    APP_VERSION: z.string().default('2.0.0'),
    APP_PUBLIC_URL: z.url().default('http://localhost:3002'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    JWT_SECRET: z.string().optional(),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(86_400)
      .default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    COOKIE_SECURE: booleanFlag.optional(),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    CORS_ORIGINS: csv.default([
      'http://localhost:3002',
      'http://localhost:8081',
    ]),
    TRUST_PROXY: booleanFlag.default(false),
    SWAGGER_ENABLED: booleanFlag.optional(),

    THROTTLE_TTL_MS: z.coerce.number().int().min(1000).default(60_000),
    THROTTLE_LIMIT: z.coerce.number().int().min(1).default(300),
    AUTH_THROTTLE_LIMIT: z.coerce.number().int().min(1).default(10),

    MAIL_TRANSPORT: z.enum(['console', 'resend']).default('console'),
    MAIL_FROM: z.string().default('Top Flow <no-reply@topflow.ae>'),
    RESEND_API_KEY: z.string().optional(),

    COMPANY_LEGAL_NAME: z
      .string()
      .default('Top Flow Irrigation & Flow Control Supplies'),
    COMPANY_TRN: z.string().optional(),
    COMPANY_ADDRESS: z.string().default('Dubai, United Arab Emirates'),
    COMPANY_PHONE: z.string().default('+971 4 000 0000'),
    COMPANY_EMAIL: z.string().default('sales@topflow.ae'),
    COMPANY_WEBSITE: z.string().default('www.topflow.ae'),
    COMPANY_BANK_DETAILS: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_SECRET'],
          message:
            'must be set to a random string of at least 32 characters in production',
        });
      }
      if (env.MAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['RESEND_API_KEY'],
          message: 'is required when MAIL_TRANSPORT=resend',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  isProduction: boolean;
  port: number;
  app: { version: string; publicUrl: string };
  database: { url: string; poolMax: number };
  auth: {
    jwtSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    refreshCookieName: string;
    cookieSecure: boolean;
    cookieSameSite: 'lax' | 'strict' | 'none';
    bcryptRounds: number;
  };
  http: { corsOrigins: string[]; trustProxy: boolean; swaggerEnabled: boolean };
  throttle: { ttlMs: number; limit: number; authLimit: number };
  mail: {
    transport: 'console' | 'resend';
    from: string;
    resendApiKey?: string;
  };
  company: {
    legalName: string;
    trn?: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    bankDetails?: string;
  };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';

  return {
    env: env.NODE_ENV,
    isProduction,
    port: env.PORT,
    app: {
      version: env.APP_VERSION,
      publicUrl: env.APP_PUBLIC_URL.replace(/\/$/, ''),
    },
    database: { url: env.DATABASE_URL, poolMax: env.DATABASE_POOL_MAX },
    auth: {
      jwtSecret: env.JWT_SECRET ?? DEV_JWT_SECRET,
      accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      refreshCookieName: 'tf_refresh',
      cookieSecure: env.COOKIE_SECURE ?? isProduction,
      cookieSameSite: env.COOKIE_SAMESITE,
      bcryptRounds: env.NODE_ENV === 'test' ? 4 : env.BCRYPT_ROUNDS,
    },
    http: {
      corsOrigins: env.CORS_ORIGINS,
      trustProxy: env.TRUST_PROXY,
      swaggerEnabled: env.SWAGGER_ENABLED ?? !isProduction,
    },
    throttle: {
      ttlMs: env.THROTTLE_TTL_MS,
      limit: env.THROTTLE_LIMIT,
      authLimit: env.AUTH_THROTTLE_LIMIT,
    },
    mail: {
      transport: env.MAIL_TRANSPORT,
      from: env.MAIL_FROM,
      resendApiKey: env.RESEND_API_KEY,
    },
    company: {
      legalName: env.COMPANY_LEGAL_NAME,
      trn: env.COMPANY_TRN,
      address: env.COMPANY_ADDRESS,
      phone: env.COMPANY_PHONE,
      email: env.COMPANY_EMAIL,
      website: env.COMPANY_WEBSITE,
      bankDetails: env.COMPANY_BANK_DETAILS,
    },
  };
}
