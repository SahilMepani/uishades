/**
 * Pure profile-extraction + the verified-email gate (Security §1): never link an
 * account on an *unverified* provider email. Kept free of any Cloudflare/arctic
 * import so it's unit-testable.
 */
import { normalizeEmail } from './normalize';

export interface VerifiedProfile {
  providerUserId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

interface GoogleClaims {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
}

/** Returns a profile only if Google asserts the email is verified. */
export function googleProfile(claims: GoogleClaims): VerifiedProfile | null {
  if (claims.email_verified !== true) return null;
  const email = typeof claims.email === 'string' ? normalizeEmail(claims.email) : '';
  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  if (!email || !sub) return null;
  return {
    providerUserId: sub,
    email,
    name: typeof claims.name === 'string' ? claims.name : null,
    avatarUrl: typeof claims.picture === 'string' ? claims.picture : null,
  };
}

export interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/** Pick the verified primary email, else any verified email, else null. */
export function pickGithubEmail(emails: GithubEmail[]): string | null {
  const primary = emails.find((e) => e.primary && e.verified);
  if (primary) return normalizeEmail(primary.email);
  const verified = emails.find((e) => e.verified);
  return verified ? normalizeEmail(verified.email) : null;
}
