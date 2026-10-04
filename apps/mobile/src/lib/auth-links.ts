/**
 * Where the links in Supabase Auth emails requested from the app lead, as paths on the web app
 * (`EXPO_PUBLIC_WEB_URL`). Kept free of React Native so they can be unit tested with Node
 * (auth-links.spec.ts).
 *
 * The email templates (`supabase/templates`) already link to the web app's `/auth/confirm` route,
 * which verifies the token and then continues to the page named here. The page must therefore be
 * the destination itself: `/auth/confirm` opened a second time has no token and answers with
 * `/login?error=link` ("That link can't be used"), although the address has just been confirmed.
 * The web app's own sign-up and password reset use the same two pages.
 */

/** After a sign-up confirmation: the customer's account, signed in on the web app. */
export const CONFIRM_EMAIL_REDIRECT = '/account';

/** After a password recovery link: the page where the new password is chosen. */
export const RESET_PASSWORD_REDIRECT = '/auth/set-password';
