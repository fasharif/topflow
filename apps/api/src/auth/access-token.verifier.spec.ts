import { UnauthorizedException } from '@nestjs/common';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
} from 'jose';
import { loadConfig } from '../config/env';
import { AccessTokenVerifier } from './access-token.verifier';

const SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const USER_ID = '0b5a3f7e-2c1d-4e8f-9a6b-7c8d9e0f1a2b';
const LEGACY_SECRET = 'legacy-hs256-secret-legacy-hs256-secret-0123';

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

const now = () => Math.floor(Date.now() / 1000);

describe('AccessTokenVerifier', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test',
    SUPABASE_URL,
    SUPABASE_JWT_SECRET: LEGACY_SECRET,
  });
  let projectKey: SigningKey;
  let verifier: AccessTokenVerifier;

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    projectKey = pair.privateKey;
    const jwk: JWK = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'project-key',
      alg: 'ES256',
      use: 'sig',
    };
    verifier = new AccessTokenVerifier(
      config,
      createLocalJWKSet({ keys: [jwk] }),
    );
  });

  function sign(
    claims: Record<string, unknown> = {},
    options: {
      issuer?: string;
      audience?: string;
      expiresAt?: number;
      key?: SigningKey;
    } = {},
  ): Promise<string> {
    return new SignJWT({
      role: 'authenticated',
      email: ' Jane@Oasis.ae ',
      aal: 'aal2',
      session_id: 'b1f3d0c2-5a7e-4c9b-8d6f-1e2a3b4c5d6e',
      ...claims,
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'project-key' })
      .setSubject(USER_ID)
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? 'authenticated')
      .setIssuedAt(now() - 10)
      .setExpirationTime(options.expiresAt ?? now() + 3600)
      .sign(options.key ?? projectKey);
  }

  it('accepts a token signed with the project key and normalises its claims', async () => {
    await expect(
      verifier.verify(await sign({ user_metadata: { full_name: 'Jane' } })),
    ).resolves.toEqual({
      userId: USER_ID,
      email: 'jane@oasis.ae',
      assuranceLevel: 'aal2',
      sessionId: 'b1f3d0c2-5a7e-4c9b-8d6f-1e2a3b4c5d6e',
      userMetadata: { full_name: 'Jane' },
    });
  });

  it('rejects tokens issued for another project or audience', async () => {
    await expect(
      verifier.verify(
        await sign({}, { issuer: 'https://evil.example/auth/v1' }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      verifier.verify(await sign({}, { audience: 'service_role' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('asks the user to sign in again when the token has expired', async () => {
    await expect(
      verifier.verify(await sign({}, { expiresAt: now() - 60 })),
    ).rejects.toThrow(/expired/);
  });

  it('rejects tokens signed with an unknown key', async () => {
    const intruder = await generateKeyPair('ES256');
    await expect(
      verifier.verify(await sign({}, { key: intruder.privateKey })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts legacy HS256 tokens only with the configured secret', async () => {
    const legacy = (secret: string) =>
      new SignJWT({ role: 'authenticated', email: 'owner@oasis.ae' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(USER_ID)
        .setIssuer(ISSUER)
        .setAudience('authenticated')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(secret));

    await expect(
      verifier.verify(await legacy(LEGACY_SECRET)),
    ).resolves.toMatchObject({
      userId: USER_ID,
      assuranceLevel: 'aal1',
      sessionId: null,
    });
    await expect(
      verifier.verify(await legacy('another-secret-another-secret-another-0')),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const withoutSecret = new AccessTokenVerifier(
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://test',
        SUPABASE_URL,
      }),
      createLocalJWKSet({ keys: [] }),
    );
    await expect(
      withoutSecret.verify(await legacy(LEGACY_SECRET)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses anonymous sessions, service tokens and malformed input', async () => {
    await expect(
      verifier.verify(await sign({ is_anonymous: true })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      verifier.verify(await sign({ role: 'service_role' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(verifier.verify('not-a-jwt')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
