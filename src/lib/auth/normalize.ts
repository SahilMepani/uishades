/**
 * The single email normalization used everywhere we read or write an email
 * (lookup, create, magic-link request, OAuth profile extraction). Keeping it
 * in one place stops the copies from drifting — e.g. one path trimming and
 * another not, which would silently create a duplicate, unlinkable account.
 *
 * Pure (no Cloudflare import) so it stays unit-testable.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
