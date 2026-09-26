import { createHmac, timingSafeEqual } from 'node:crypto';

export type SignatureCheck =
  | { valid: true; timestamp: number }
  | { valid: false; reason: 'missing' | 'malformed' | 'expired' | 'mismatch' };

/**
 * Verifies the signature dispatch puts on every webhook:
 *
 *   x-dispatch-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 *
 * The timestamp is part of the signed text, so a captured request cannot be replayed outside the
 * tolerance window, and the body cannot be changed without the secret. Every accepted secret is
 * compared in constant time, which lets a new secret be rolled out while the old one still works.
 */
export function verifyDispatchSignature(
  header: string | undefined,
  rawBody: Buffer,
  secrets: readonly string[],
  toleranceSeconds: number,
  nowSeconds: number = Date.now() / 1000,
): SignatureCheck {
  if (!header) return { valid: false, reason: 'missing' };
  let timestamp: number | null = null;
  const signatures: Buffer[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't' && value && /^\d{1,12}$/.test(value))
      timestamp = Number(value);
    if (key === 'v1' && value && /^[0-9a-f]{64}$/.test(value)) {
      signatures.push(Buffer.from(value, 'hex'));
    }
  }
  if (timestamp === null || signatures.length === 0) {
    return { valid: false, reason: 'malformed' };
  }
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return { valid: false, reason: 'expired' };
  }
  const signedText = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
  const matches = secrets.some((secret) => {
    const expected = createHmac('sha256', secret).update(signedText).digest();
    return signatures.some((signature) => timingSafeEqual(signature, expected));
  });
  return matches
    ? { valid: true, timestamp }
    : { valid: false, reason: 'mismatch' };
}
