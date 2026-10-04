/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CONFIRM_EMAIL_REDIRECT, RESET_PASSWORD_REDIRECT } from './auth-links';

// Run with `npm test -w mobile` (Node's test runner through tsx).

/** A Supabase Auth email template of this repository (supabase/templates). */
function template(name: string): string {
  return readFileSync(path.resolve(__dirname, '../../../../supabase/templates', name), 'utf8');
}

describe('links in the emails the app asks Supabase to send', () => {
  it('the confirmation template already routes through /auth/confirm and passes the redirect on as `next`', () => {
    assert.match(template('confirmation.html'), /\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=email&next=\{\{ \.RedirectTo \}\}/);
  });

  it('a confirmed sign-up continues to the account page, not to /auth/confirm a second time', () => {
    assert.equal(CONFIRM_EMAIL_REDIRECT, '/account');
    assert.ok(!CONFIRM_EMAIL_REDIRECT.startsWith('/auth/confirm'));
  });

  it('a password reset continues to the page the recovery template names', () => {
    assert.equal(RESET_PASSWORD_REDIRECT, '/auth/set-password');
    assert.match(template('recovery.html'), /\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=recovery&next=\/auth\/set-password"/);
  });
});
