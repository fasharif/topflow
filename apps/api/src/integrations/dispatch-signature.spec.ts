import { createHmac } from 'node:crypto';
import { verifyDispatchSignature } from './dispatch-signature';

const SECRET = 'dispatch-secret-dispatch-secret-dispatch-1';
const PREVIOUS = 'previous-secret-previous-secret-previous-1';
const BODY = Buffer.from('{"id":"e1","type":"delivery.completed"}');
const NOW = 1_790_000_000;

function header(secret: string, body: Buffer, t: number): string {
  const v1 = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${t}.`), body]))
    .digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('verifyDispatchSignature', () => {
  it('accepts a signature over the exact body within the tolerance', () => {
    expect(
      verifyDispatchSignature(
        header(SECRET, BODY, NOW - 120),
        BODY,
        [SECRET],
        300,
        NOW,
      ),
    ).toEqual({ valid: true, timestamp: NOW - 120 });
  });

  it('accepts the previous secret while a new one is rolled out', () => {
    const signed = header(PREVIOUS, BODY, NOW);
    expect(
      verifyDispatchSignature(signed, BODY, [SECRET, PREVIOUS], 300, NOW).valid,
    ).toBe(true);
    expect(verifyDispatchSignature(signed, BODY, [SECRET], 300, NOW)).toEqual({
      valid: false,
      reason: 'mismatch',
    });
  });

  it('refuses a changed body or a changed timestamp', () => {
    const signed = header(SECRET, BODY, NOW);
    const tampered = Buffer.from(
      BODY.toString().replace('completed', 'cancelled'),
    );
    expect(
      verifyDispatchSignature(signed, tampered, [SECRET], 300, NOW).valid,
    ).toBe(false);
    const moved = signed.replace(`t=${NOW}`, `t=${NOW + 1}`);
    expect(verifyDispatchSignature(moved, BODY, [SECRET], 300, NOW).valid).toBe(
      false,
    );
  });

  it('refuses replays outside the tolerance, in either direction', () => {
    expect(
      verifyDispatchSignature(
        header(SECRET, BODY, NOW - 301),
        BODY,
        [SECRET],
        300,
        NOW,
      ),
    ).toEqual({ valid: false, reason: 'expired' });
    expect(
      verifyDispatchSignature(
        header(SECRET, BODY, NOW + 301),
        BODY,
        [SECRET],
        300,
        NOW,
      ),
    ).toEqual({ valid: false, reason: 'expired' });
  });

  it('refuses missing and malformed headers', () => {
    expect(
      verifyDispatchSignature(undefined, BODY, [SECRET], 300, NOW),
    ).toEqual({
      valid: false,
      reason: 'missing',
    });
    for (const bad of [
      '',
      't=abc,v1=00',
      `v1=${'0'.repeat(64)}`,
      `t=${NOW}`,
      `t=${NOW},v1=xyz`,
    ]) {
      expect(verifyDispatchSignature(bad, BODY, [SECRET], 300, NOW)).toEqual({
        valid: false,
        reason: bad === '' ? 'missing' : 'malformed',
      });
    }
  });
});
