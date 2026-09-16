import { z } from 'zod';

/**
 * Environment contract, validated once at boot and again by the release preflight. A
 * misconfigured deployment fails immediately with a readable report instead of misbehaving at
 * runtime (v1 silently fell back to a hard-coded JWT secret when JWT_SECRET was missing).
 */
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';

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
    APP_VERSION: z.string().default('3.0.0'),
    APP_PUBLIC_URL: z.url().default('http://localhost:3002'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    /** Supabase project URL; access tokens are issued by `${SUPABASE_URL}/auth/v1`. */
    SUPABASE_URL: z.url().default(LOCAL_SUPABASE_URL),
    /** Server-only secret key (sb_secret_…) for Auth administration: invitations and suspensions. */
    SUPABASE_SECRET_KEY: z.string().min(20).optional(),
    /** Legacy HS256 JWT secret, only for projects (or local stacks) that still sign with it. */
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),
    STAFF_MFA_REQUIRED: booleanFlag.default(false),

    /** Shared with the web app's server so it may forward the shopper's IP address. */
    INTERNAL_API_SECRET: z.string().min(32).optional(),
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
    COMPANY_ADDRESS: z.string().default('United Arab Emirates'),
    COMPANY_PHONE: z.string().default('+971 56 109 1235'),
    COMPANY_EMAIL: z.string().default('info@topflow.ae'),
    COMPANY_WEBSITE: z.string().default('www.topflow.ae'),
    COMPANY_BANK_DETAILS: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.SUPABASE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_URL'],
        message: 'must be the https URL of the Supabase project in production',
      });
    }
    if (!env.SUPABASE_SECRET_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_SECRET_KEY'],
        message:
          'is required in production (staff invitations and account suspension)',
      });
    }
    if (!env.INTERNAL_API_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['INTERNAL_API_SECRET'],
        message:
          'is required in production so the web app can forward client IP addresses (32+ random characters)',
      });
    }
    if (env.MAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'is required when MAIL_TRANSPORT=resend',
      });
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
    /** `iss` claim of Supabase access tokens. */
    issuer: string;
    audience: 'authenticated';
    /** Public signing keys of the Supabase project. */
    jwksUrl: string;
    /** Legacy HS256 secret; unset for projects using asymmetric signing keys. */
    jwtSecret?: string;
    staffMfaRequired: boolean;
  };
  supabase: { url: string; secretKey?: string };
  http: {
    corsOrigins: string[];
    trustProxy: boolean;
    swaggerEnabled: boolean;
    internalApiSecret?: string;
  };
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
  const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, '');

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
      issuer: `${supabaseUrl}/auth/v1`,
      audience: 'authenticated',
      jwksUrl: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      jwtSecret: env.SUPABASE_JWT_SECRET,
      staffMfaRequired: env.STAFF_MFA_REQUIRED,
    },
    supabase: { url: supabaseUrl, secretKey: env.SUPABASE_SECRET_KEY },
    http: {
      corsOrigins: env.CORS_ORIGINS,
      trustProxy: env.TRUST_PROXY,
      swaggerEnabled: env.SWAGGER_ENABLED ?? !isProduction,
      internalApiSecret: env.INTERNAL_API_SECRET,
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
