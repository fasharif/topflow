import type { AppConfig } from '../config/env';

/**
 * The public demo's email guard (ADR-021). Anyone can reach the demo's public forms and sign in to
 * its published accounts, so without a guard its quote requests, quotations and invitations would
 * send real email, through the platform's mail provider, to any address a visitor types in (and to
 * Top Flow's own inbox). In demo mode a message is delivered only when its recipient is on
 * DEMO_MAIL_ALLOWLIST; every other message is withheld and only logged.
 */
export type MailRoute = 'deliver' | 'withhold';

/**
 * One bare address: a single `@`, and none of the characters that let a recipient string name more
 * than one mailbox or carry a display name (whitespace, commas, semicolons, angle brackets, double
 * quotes, brackets, colons or backslashes).
 */
const SINGLE_ADDRESS = /^[^\s@,;<>"()[\]:\\]+@[^\s@,;<>"()[\]:\\]+$/;

/**
 * True when `email` is one bare address that matches an allow-list entry: an exact address, or a
 * domain written as `@example.com`. Domains match exactly, so `@example.com` does not cover
 * `sub.example.com`. Anything that is not a single bare address never matches, so a recipient such
 * as `victim@gmail.com,me@allowed.example` is withheld even though it ends in an allowed domain.
 */
export function isAllowListed(
  email: string,
  allowList: readonly string[],
): boolean {
  const address = email.trim().toLowerCase();
  if (!SINGLE_ADDRESS.test(address)) return false;
  const domain = address.slice(address.indexOf('@'));
  return allowList.some((entry) =>
    entry.startsWith('@') ? entry === domain : entry === address,
  );
}

export function mailRoute(demo: AppConfig['demo'], to: string): MailRoute {
  if (!demo.enabled) return 'deliver';
  return isAllowListed(to, demo.mailAllowList) ? 'deliver' : 'withhold';
}

/** `jo***@example.com`: enough to follow a log line without publishing the address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}
