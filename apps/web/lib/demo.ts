import { parseDemoModeFlag } from '@topflow/shared';

/**
 * The web app's demo setting (ADR-021). NEXT_PUBLIC_DEMO_MODE is inlined when the app is built, so the
 * banner and the demo behaviour are fixed per deployment and identical on the server and in the
 * browser. An unrecognised value throws: the build fails, and instrumentation.ts stops the server at
 * boot, rather than a public deployment running without its demo safeguards.
 */
export const DEMO_MODE = parseDemoModeFlag(process.env.NEXT_PUBLIC_DEMO_MODE, 'NEXT_PUBLIC_DEMO_MODE');

/** Why an action is unavailable in the demo, shown in place of the form or as its error. */
export const DEMO_NOTICES = {
  signUp: 'New accounts are switched off in the portfolio demo, because signing up sends an email. Sign in with one of the demo accounts instead.',
  passwordReset: 'Password reset emails are switched off in the portfolio demo. The demo accounts share one published password.',
  accountSecurity:
    'The demo accounts are shared, so their password and two-factor settings are fixed in the portfolio demo. Every change is undone by the nightly reset.',
} as const;
