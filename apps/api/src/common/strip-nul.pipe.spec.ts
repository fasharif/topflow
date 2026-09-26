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
});
