import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AssuranceLevel } from '@topflow/shared';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  errors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { z } from 'zod';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';

/** Resolves the Supabase project's public signing keys (replaced by a local key set in tests). */
export const SIGNING_KEYS = Symbol('SIGNING_KEYS');

export const signingKeysProvider = {
  provide: SIGNING_KEYS,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): JWTVerifyGetKey =>
    createRemoteJWKSet(new URL(config.auth.jwksUrl), {
      // Keys rotate rarely: cache them, but refetch promptly when a token names an unknown key.
      cacheMaxAge: 10 * 60_000,
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    }),
};

const claimsSchema = z.object({
  sub: z.uuid(),
  role: z.literal('authenticated'),
  email: z.string().optional(),
  aal: z.enum(['aal1', 'aal2']).default('aal1'),
  session_id: z.string().optional(),
  is_anonymous: z.boolean().optional(),
  user_metadata: z.record(z.string(), z.unknown()).default({}),
});

/** The claims the platform relies on, normalised. */
export interface AccessTokenClaims {
  userId: string;
  email: string | null;
  assuranceLevel: AssuranceLevel;
  sessionId: string | null;
  userMetadata: Record<string, unknown>;
}

const INVALID_TOKEN = 'Invalid or expired access token';

/**
 * Verifies Supabase Auth access tokens. Asymmetric tokens (ES256/RS256) are checked against the
 * project's published key set; a legacy HS256 token is accepted only when SUPABASE_JWT_SECRET is
 * configured. Issuer, audience and expiry are always enforced and anonymous sessions are refused.
 */
@Injectable()
export class AccessTokenVerifier {
  private readonly legacySecret?: Uint8Array;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SIGNING_KEYS) private readonly signingKeys: JWTVerifyGetKey,
  ) {
    this.legacySecret = config.auth.jwtSecret
      ? new TextEncoder().encode(config.auth.jwtSecret)
      : undefined;
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const payload = await this.verifySignature(token);
    const parsed = claimsSchema.safeParse(payload);
    if (!parsed.success || parsed.data.is_anonymous) {
      throw new UnauthorizedException(INVALID_TOKEN);
    }
    const claims = parsed.data;
    return {
      userId: claims.sub,
      email: claims.email?.trim().toLowerCase() || null,
      assuranceLevel: claims.aal,
      sessionId: claims.session_id ?? null,
      userMetadata: claims.user_metadata,
    };
  }

  private async verifySignature(token: string): Promise<JWTPayload> {
    const options = {
      issuer: this.config.auth.issuer,
      audience: this.config.auth.audience,
      clockTolerance: 5,
    };
    try {
      const { alg } = decodeProtectedHeader(token);
      if (alg === 'HS256') {
        if (!this.legacySecret)
          throw new errors.JOSEAlgNotAllowed(INVALID_TOKEN);
        return (
          await jwtVerify(token, this.legacySecret, {
            ...options,
            algorithms: ['HS256'],
          })
        ).payload;
      }
      return (
        await jwtVerify(token, this.signingKeys, {
          ...options,
          algorithms: ['ES256', 'RS256'],
        })
      ).payload;
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        throw new UnauthorizedException(
          'Your session has expired. Please sign in again.',
        );
      }
      if (
        error instanceof errors.JWKSTimeout ||
        (error instanceof TypeError && /fetch/i.test(error.message))
      ) {
        throw new ServiceUnavailableException(
          'Sign-in is temporarily unavailable. Please try again shortly.',
        );
      }
      throw new UnauthorizedException(INVALID_TOKEN);
    }
  }
}
