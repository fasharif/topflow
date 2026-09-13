import { ApiError } from './api';

export type FieldErrors = Record<string, string>;

/**
 * Structural view of a validation failure. Typing it structurally (instead of importing
 * `ZodError`) keeps forms independent of which copy of zod a package resolves.
 */
export interface ValidationIssues {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}

/** First message per field path from a schema validation failure ("address.city" → message). */
export function zodFieldErrors(error: ValidationIssues): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.');
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Server-side validation errors use the same paths, so forms can show them inline too. */
export function apiFieldErrors(error: unknown): FieldErrors {
  return error instanceof ApiError ? error.fieldErrors() : {};
}
