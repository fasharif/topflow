import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/auth/redirects';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const EMAIL_LINK_TYPES: readonly string[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

/**
 * Landing point of every Supabase Auth email link: sign-up confirmation, password recovery, staff
 * invitation, magic link and email change. The token hash is verified here, which starts the
 * session in httpOnly cookies, and the visitor continues to a safe page on this site.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const type = searchParams.get('type');
  const setsPassword = type === 'recovery' || type === 'invite';
  const next = safeNextPath(searchParams.get('next'), origin, setsPassword ? '/auth/set-password' : '/account');

  const supabase = await createSupabaseServerClient();
  const tokenHash = searchParams.get('token_hash');
  const code = searchParams.get('code');

  let verified = false;
  if (tokenHash && type && EMAIL_LINK_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    verified = !error;
  } else if (code) {
    // PKCE links (OAuth providers, or default templates) carry a one-time code instead.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  }

  if (verified) return NextResponse.redirect(new URL(next, origin));

  const signIn = new URL('/login', origin);
  signIn.searchParams.set('error', 'link');
  return NextResponse.redirect(signIn);
}
