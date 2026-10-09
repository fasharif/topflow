import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nestedDeeperThan } from './dispatch-events.service';

describe('nestedDeeperThan', () => {
  it('counts levels of arrays and objects, and nothing else', () => {
    expect(nestedDeeperThan('text', 0)).toBe(false);
    expect(nestedDeeperThan(null, 0)).toBe(false);
    expect(nestedDeeperThan({}, 1)).toBe(false);
    expect(nestedDeeperThan({}, 0)).toBe(true);
    const event = { id: 'e', data: { proof: { tags: ['a', 'b'] } } };
    expect(nestedDeeperThan(event, 4)).toBe(false);
    expect(nestedDeeperThan(event, 3)).toBe(true);
  });

  it('walks a very deep value without exhausting the call stack', () => {
    let nested: unknown = 1;
    for (let depth = 0; depth < 100_000; depth += 1) nested = [nested];
    expect(nestedDeeperThan(nested, 32)).toBe(true);
    expect(nestedDeeperThan(nested, 100_000)).toBe(false);
  });

  it('leaves room for the events the dispatch service really sends', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../test/fixtures/dispatch-webhooks.recorded.json'),
        'utf8',
      ),
    ) as { requests: { body: string }[] };
    for (const request of fixture.requests) {
      const event: unknown = JSON.parse(request.body);
      // The limit in the service is 32; a recorded event is at most 3 levels deep.
      expect(nestedDeeperThan(event, 3)).toBe(false);
    }
  });
});
