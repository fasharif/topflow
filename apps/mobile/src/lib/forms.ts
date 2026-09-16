/**
 * Helpers for validating forms with the shared Zod schemas from `@topflow/shared`.
 * Only the structural shape of an issue is used, so this module does not import `zod` itself
 * (the schemas carry their own copy).
 */

interface IssueLike {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Maps validation issues to the first message for each top-level field. */
export function collectFieldErrors<K extends string>(issues: readonly IssueLike[]): FieldErrors<K> {
  const errors: Partial<Record<string, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && errors[field] === undefined) {
      errors[field] = issue.message;
    }
  }
  return errors as FieldErrors<K>;
}

/** Treats blank input as "not provided" for optional fields. */
export function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
