import { z } from 'zod';

/** Treats an empty variable (`SENTRY_DSN=` in an env file or compose) as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );

/**
 * Error-reporting settings, also validated by the environment contract (config/env.ts) so the
 * release preflight rejects a malformed DSN. Sentry stays off unless SENTRY_DSN is set. This file
 * does not load the SDK, so the preflight stays light.
 */
export const sentryEnvShape = {
  SENTRY_DSN: optional(z.url({ protocol: /^https?$/ })),
  /** Defaults to NODE_ENV; set it to tell staging and production apart. */
  SENTRY_ENVIRONMENT: optional(z.string().min(1)),
  /** Share of requests traced for performance (0 to 1). Errors are always reported. */
  SENTRY_TRACES_SAMPLE_RATE: optional(z.coerce.number().min(0).max(1)),
};

const sentryEnvSchema = z.object({
  ...sentryEnvShape,
  NODE_ENV: z.string().default('development'),
  APP_VERSION: z.string().default('3.0.0'),
});

export interface SentryOptions {
  dsn: string;
  environment: string;
  release: string;
  tracesSampleRate: number;
  /** Never send cookies, IP addresses or user details to Sentry. */
  sendDefaultPii: false;
}

/** Sentry options from the environment, or null when error reporting is not configured. */
export function sentryOptions(
  source: NodeJS.ProcessEnv = process.env,
): SentryOptions | null {
  const parsed = sentryEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid error-reporting configuration:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const env = parsed.data;
  if (!env.SENTRY_DSN) return null;
  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.APP_VERSION,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ?? 0,
    sendDefaultPii: false,
  };
}
