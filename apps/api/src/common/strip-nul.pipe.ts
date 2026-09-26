import {
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';

/** U+0000, the one character PostgreSQL cannot store in text (error 22021). */
const NUL = String.fromCharCode(0);

function stripNul(value: unknown): unknown {
  if (typeof value === 'string') return value.replaceAll(NUL, '');
  if (Array.isArray(value)) return value.map(stripNul);
  if (value !== null && typeof value === 'object') {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, stripNul(item)]),
    );
  }
  return value;
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
