import {
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';

/** U+0000, the one character PostgreSQL cannot store in text (error 22021). */
const NUL = String.fromCharCode(0);

type Container = unknown[] | Record<string, unknown>;

/** Arrays and plain objects are walked; class instances (dates, buffers) are left alone. */
function isContainer(value: unknown): value is Container {
  if (Array.isArray(value)) return true;
  if (value === null || typeof value !== 'object') return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Removes U+0000 from every string in a parsed JSON value; everything else is kept. The walk
 * uses its own stack instead of recursion: a body nested a few thousand levels deep (about
 * 12 KB of brackets) exhausted the call stack and was answered as a 500.
 */
export function stripNul(value: unknown): unknown {
  if (typeof value === 'string') return value.replaceAll(NUL, '');
  if (!isContainer(value)) return value;
  const copyOf = (source: Container): Container =>
    Array.isArray(source) ? new Array<unknown>(source.length) : {};
  const root = copyOf(value);
  const pending: [Container, Container][] = [[value, root]];
  for (let next = pending.pop(); next; next = pending.pop()) {
    const [source, target] = next;
    for (const [key, item] of Object.entries(source)) {
      let cleaned: unknown = item;
      if (typeof item === 'string') {
        cleaned = item.replaceAll(NUL, '');
      } else if (isContainer(item)) {
        cleaned = copyOf(item);
        pending.push([item, cleaned as Container]);
      }
      // defineProperty, so a key named __proto__ stays a key (as with Object.fromEntries).
      Object.defineProperty(target, key, {
        value: cleaned,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return root;
}

/**
 * Removes NUL characters from request bodies, query strings and path parameters before they are
 * validated. JSON and URLs can carry U+0000, but PostgreSQL refuses it in text, so a search or a
 * name containing one ended in a 500 (BUG-15). No legitimate input contains it, and every other
 * character is kept.
 */
@Injectable()
export class StripNulPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    return metadata.type === 'custom' ? value : stripNul(value);
  }
}
