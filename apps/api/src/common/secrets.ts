import { createHash, randomBytes } from 'node:crypto';

/** A 256-bit, URL-safe secret for single-use links such as invitations. */
export function generateSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Secrets are stored only as SHA-256 hashes, so a database leak does not expose live links. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
