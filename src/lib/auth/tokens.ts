/**
 * Magic-link token primitives. Pure Web Crypto (available on both the Workers
 * runtime and Node ≥ 22 via `globalThis.crypto`), so this module is unit-testable
 * without any Cloudflare binding.
 *
 * The raw token only ever travels in the emailed URL; we persist `sha256(raw)`.
 */

export const MAGIC_TTL_MS = 15 * 60 * 1000; // 15 minutes, single-use

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += HEX[b];
  return out;
}

/** 32 random bytes as 64 lowercase hex chars. */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** sha256 of the raw token, hex-encoded - what we store and look up by. */
export async function hashToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return toHex(new Uint8Array(digest));
}
