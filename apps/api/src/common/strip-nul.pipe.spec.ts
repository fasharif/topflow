import type { ArgumentMetadata } from '@nestjs/common';
import { StripNulPipe } from './strip-nul.pipe';

const pipe = new StripNulPipe();
const as = (type: ArgumentMetadata['type']): ArgumentMetadata => ({ type });

describe('StripNulPipe', () => {
  it('removes NUL characters from strings in bodies, queries and path parameters', () => {
    expect(pipe.transform('dr\u0000ip', as('query'))).toBe('drip');
    expect(pipe.transform('\u0000', as('param'))).toBe('');
    expect(
      pipe.transform(
        {
          name: 'A\u0000B',
          items: [{ note: '\u0000x\u0000' }, 2],
          nested: { deep: ['c\u0000'] },
        },
        as('body'),
      ),
    ).toEqual({
      name: 'AB',
      items: [{ note: 'x' }, 2],
      nested: { deep: ['c'] },
    });
  });

  it('keeps every other character and value unchanged', () => {
    const body = {
      text: 'Tëst — ✓ 😀\t\n',
      count: 3,
      flag: false,
      empty: null,
      missing: undefined,
    };
    expect(pipe.transform(body, as('body'))).toEqual(body);
  });

  it('leaves custom parameters and class instances alone', () => {
    const user = { id: 'user\u00001' };
    expect(pipe.transform(user, as('custom'))).toBe(user);
    const date = new Date(0);
    expect(pipe.transform({ at: date }, as('body'))).toEqual({ at: date });
  });

  it('walks deeply nested input without exhausting the call stack', () => {
    // 50,000 levels: a recursive walk failed from about 6,000 (a 12 KB body), answered as a 500.
    const DEPTH = 50_000;
    let nested: unknown = 'x\u0000';
    for (let depth = 0; depth < DEPTH; depth += 1) {
      nested = depth % 2 === 0 ? [nested] : { next: nested };
    }
    let cursor = pipe.transform(nested, as('body'));
    for (let depth = 0; depth < DEPTH; depth += 1) {
      cursor = Array.isArray(cursor)
        ? (cursor as unknown[])[0]
        : (cursor as { next: unknown }).next;
    }
    expect(cursor).toBe('x');
  });

  it('keeps a key named __proto__ as an ordinary key', () => {
    const body = JSON.parse(
      '{"__proto__":{"admin":"y\\u0000"},"name":"n"}',
    ) as object;
    const cleaned = pipe.transform(body, as('body')) as Record<string, unknown>;
    expect(Object.keys(cleaned)).toEqual(['__proto__', 'name']);
    expect(Object.getPrototypeOf(cleaned)).toBe(Object.prototype);
    expect(JSON.stringify(cleaned)).toBe(
      '{"__proto__":{"admin":"y"},"name":"n"}',
    );
  });
});
