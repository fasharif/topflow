import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyDispatchSignature } from './dispatch-signature';

// The real functions, wrapped so that the tests can see how the verifier calls them.
jest.mock('node:crypto', () => {
  const actual =
    jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    createHmac: jest.fn(actual.createHmac),
    timingSafeEqual: jest.fn(actual.timingSafeEqual),
  };
});

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
  it('compares in constant time: timingSafeEqual on two 32-byte digests, never on text', () => {
    const compare = jest.mocked(timingSafeEqual);
    const good = header(SECRET, BODY, NOW);
    // Wrong in the first hex digit and wrong in the last: both go through the same comparison.
    const flip = (digit: string) => (digit === '0' ? '1' : '0');
    const [prefix, digest] = good.split('v1=');
    const firstWrong = `${prefix}v1=${flip(digest[0])}${digest.slice(1)}`;
    const lastWrong = `${prefix}v1=${digest.slice(0, -1)}${flip(digest.slice(-1))}`;
    for (const candidate of [good, firstWrong, lastWrong]) {
      compare.mockClear();
      const result = verifyDispatchSignature(
        candidate,
        BODY,
        [SECRET],
        300,
        NOW,
      );
      expect(result.valid).toBe(candidate === good);
      expect(compare).toHaveBeenCalledTimes(1);
      const [received, expected] = compare.mock.calls[0] as [Buffer, Buffer];
      expect(received).toHaveLength(32);
      expect(expected).toHaveLength(32);
    }
  });

  it('signs the bytes as received, so a body re-serialised on the way is refused', () => {
    const spaced = Buffer.from('{ "id": "e1", "type": "delivery.completed" }');
    expect(JSON.parse(spaced.toString())).toEqual(JSON.parse(BODY.toString()));
    const signed = header(SECRET, BODY, NOW);
    expect(verifyDispatchSignature(signed, spaced, [SECRET], 300, NOW)).toEqual(
      { valid: false, reason: 'mismatch' },
    );
    // Bytes that are not valid UTF-8 are signed and compared as bytes, not as decoded text.
    const binary = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    expect(
      verifyDispatchSignature(
        header(SECRET, binary, NOW),
        binary,
        [SECRET],
        300,
        NOW,
      ).valid,
    ).toBe(true);
    expect(
      verifyDispatchSignature(
        header(SECRET, binary, NOW),
        Buffer.from(binary.toString('utf8')),
        [SECRET],
        300,
        NOW,
      ).valid,
    ).toBe(false);
  });

  it('computes one HMAC per accepted secret, however many signatures the header lists', () => {
    const hmac = jest.mocked(createHmac);
    const wrong = Array.from(
      { length: 200 },
      (_, index) => `v1=${index.toString(16).padStart(64, '0')}`,
    ).join(',');
    // Counted from here: the header() helper of this file computes HMACs too.
    hmac.mockClear();
    expect(
      verifyDispatchSignature(
        `t=${NOW},${wrong}`,
        BODY,
        [SECRET, PREVIOUS],
        300,
        NOW,
      ),
    ).toEqual({ valid: false, reason: 'mismatch' });
    expect(hmac).toHaveBeenCalledTimes(2);
    // A valid signature among others is still found (a sender may list several).
    expect(
      verifyDispatchSignature(
        `${wrong},${header(PREVIOUS, BODY, NOW)}`,
        BODY,
        [SECRET, PREVIOUS],
        300,
        NOW,
      ).valid,
    ).toBe(true);
  });

  it('never throws on, and never accepts, a header it cannot read', () => {
    const digest = header(SECRET, BODY, NOW).split('v1=')[1];
    for (const bad of [
      `t=${NOW},v1=${digest.toUpperCase()}`,
      `t=${NOW},v1=${digest}0`,
      `t=${NOW},v1=${digest.slice(1)}`,
      `t=${NOW}.5,v1=${digest}`,
      `t=-${NOW},v1=${digest}`,
      `t=${'9'.repeat(13)},v1=${digest}`,
      `t=${NOW};v1=${digest}`,
      `v0=${digest},t=${NOW}`,
      '=,=,,',
      't==,v1==',
      ','.repeat(5000),
      `t=${NOW},v1=${'é'.repeat(64)}`,
    ]) {
      expect(verifyDispatchSignature(bad, BODY, [SECRET], 300, NOW)).toEqual({
        valid: false,
        reason: 'malformed',
      });
    }
    // With no accepted secret nothing verifies (the service answers 503 before it gets here).
    expect(
      verifyDispatchSignature(header(SECRET, BODY, NOW), BODY, [], 300, NOW),
    ).toEqual({ valid: false, reason: 'mismatch' });
  });
});
