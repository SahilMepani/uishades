/**
 * Shared OAuth cookie config. State (and PKCE verifier) are stashed in
 * short-lived cookies for the provider→callback hop. `SameSite=Lax` (not Strict)
 * is required: that hop is cross-site, and Strict would drop the cookie and
 * break state verification (Security §2). `secure` is off on localhost http.
 */
import type { AstroCookieSetOptions } from 'astro';

export const STATE_COOKIE = 'oauth_state';
export const VERIFIER_COOKIE = 'oauth_code_verifier';

export function oauthCookieOptions(secure: boolean): AstroCookieSetOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  };
}
