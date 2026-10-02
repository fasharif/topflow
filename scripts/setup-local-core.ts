/**
 * The file handling behind `npm run setup` (scripts/setup-local.ts), kept free of I/O so it is unit-tested
 * in setup-local.spec.ts.
 */

/** Keys of the local Supabase stack that the apps need. */
export interface LocalSupabaseKeys {
  publishableKey: string | null;
  secretKey: string | null;
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

/** The value part of `NAME=value`: quotes removed, and an unquoted value cut at an inline ` #` comment. */
function valueOf(raw: string): string {
  const text = raw.trim();
  const quote = text[0];
  if (quote === '"' || quote === "'") {
    const end = text.indexOf(quote, 1);
    return end > 0 ? text.slice(1, end) : text.slice(1);
  }
  const comment = text.search(/\s#/);
  return (comment >= 0 ? text.slice(0, comment) : text).trim();
}

/** Reads `NAME="value"` lines, as printed by `npx supabase status -o env`. */
export function parseEnvOutput(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = ASSIGNMENT.exec(line.trim());
    if (match?.[1]) values[match[1]] = valueOf(match[2] ?? '');
  }
  return values;
}

/**
 * The publishable and secret keys when the CLI reports them, otherwise the legacy anon and service-role
 * keys, which Supabase still accepts in their place.
 */
export function localSupabaseKeys(status: Record<string, string>): LocalSupabaseKeys {
  return {
    publishableKey: status.PUBLISHABLE_KEY || status.ANON_KEY || null,
    secretKey: status.SECRET_KEY || status.SERVICE_ROLE_KEY || null,
  };
}

/** The value of `name` in an env file's text, or '' when it is missing or empty. */
export function envValue(content: string, name: string): string {
  for (const line of content.split(/\r?\n/)) {
    const match = ASSIGNMENT.exec(line.trim());
    if (match?.[1] === name) return valueOf(match[2] ?? '');
  }
  return '';
}

/**
 * Sets each of `values` where the env file has the variable with an empty value, and leaves every other
 * line as it was: a value somebody already chose is never replaced. Null values are skipped.
 */
export function fillEmpty(content: string, values: Record<string, string | null>): { content: string; filled: string[] } {
  const filled: string[] = [];
  const lines = content.split('\n').map((line) => {
    const match = ASSIGNMENT.exec(line.trim());
    const name = match?.[1];
    if (!name || !(name in values) || valueOf(match[2] ?? '') !== '') return line;
    const value = values[name];
    if (!value) return line;
    filled.push(name);
    return `${name}=${value}`;
  });
  return { content: lines.join('\n'), filled };
}

/** True for the loopback addresses of a local Supabase stack. */
export function isLocalDatabase(databaseUrl: string): boolean {
  try {
    return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}
