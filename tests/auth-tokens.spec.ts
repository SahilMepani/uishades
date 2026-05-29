import { describe, it, expect } from 'vitest';
import { generateToken, hashToken, MAGIC_TTL_MS } from '../src/lib/auth/tokens';

describe('magic-link tokens', () => {
  it('MAGIC_TTL_MS is 15 minutes', () => {
    expect(MAGIC_TTL_MS).toBe(15 * 60 * 1000);
  });

  it('generateToken returns 64 lowercase hex chars and is unguessably unique', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('hashToken is sha256, deterministic, and matches a known vector', async () => {
    // sha256("abc")
    expect(await hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const raw = generateToken();
    expect(await hashToken(raw)).toBe(await hashToken(raw)); // deterministic
    expect(await hashToken(raw)).not.toBe(await hashToken(generateToken())); // input-sensitive
  });

  it('hash is 64 hex chars and never equals the raw token', async () => {
    const raw = generateToken();
    const h = await hashToken(raw);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe(raw);
  });
});
