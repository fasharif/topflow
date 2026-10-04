import { isDemoAccount, parseDemoModeFlag } from '@topflow/shared';

/**
 * The web app's demo setting (ADR-021). NEXT_PUBLIC_DEMO_MODE is inlined when the app is built, on the
 * server as well as in the browser, so the banner and the demo behaviour are fixed per build. An
 * unrecognised value throws while the pages are prerendered, so the build fails rather than producing
 * a public deployment without its demo safeguards.
 */
export const DEMO_MODE = parseDemoModeFlag(process.env.NEXT_PUBLIC_DEMO_MODE, 'NEXT_PUBLIC_DEMO_MODE');

/**
 * Said wherever the app would otherwise report that an email went out: in the demo the API withholds
 * business email from everyone except the maintainer's allow-list, DEMO_MAIL_ALLOWLIST (ADR-021).
 */
export const DEMO_NO_EMAIL = 'The portfolio demo does not email visitors.';

/**
 * Next to Top Flow's real phone number, WhatsApp link and email address in demo mode, on the contact
 * page and in the footer: a visitor who calls Top Flow must know that nothing done in the demo reached it.
 */
export const DEMO_CONTACT_NOTE =
  "These are Top Flow's real contact details. Quote requests and orders made in the portfolio demo are not passed to Top Flow, and its prices are not an offer.";

/** Why an action is unavailable in the demo, shown in place of the form or as its error. */
export const DEMO_NOTICES = {
  signUp: 'New accounts are switched off in the portfolio demo, because signing up sends an email. Sign in with one of the demo accounts instead.',
  passwordReset: 'Password reset emails are switched off in the portfolio demo. The demo accounts share one published password.',
  accountSecurity:
    'The demo accounts are shared, so the web app does not change their password or two-factor settings in the portfolio demo. Anything changed another way is undone by the nightly reset.',
} as const;

/** Sign-in methods recorded in a Supabase access token's `amr` claim, such as `password` or `invite`. */
export function signInMethods(amr: unknown): string[] {
  if (!Array.isArray(amr)) return [];
  return amr.flatMap((entry: unknown) => {
    if (typeof entry === 'string') return [entry];
    if (entry && typeof entry === 'object' && 'method' in entry && typeof entry.method === 'string') return [entry.method];
    return [];
  });
}

/**
 * Whether the demo lets this session choose a password on /auth/set-password. Only someone who arrived
 * through their own invitation or recovery link may, and never on a published demo account: otherwise
 * any visitor signed in to a shared account could change its password and lock everyone else out.
 * Outside demo mode the page serves every signed-in user.
 */
export function demoAllowsPasswordChoice(claims: { email?: unknown; amr?: unknown }): boolean {
  if (!DEMO_MODE) return true;
  const email = typeof claims.email === 'string' ? claims.email : '';
  if (!email || isDemoAccount(email)) return false;
  const methods = signInMethods(claims.amr);
  return methods.includes('invite') || methods.includes('recovery');
}
