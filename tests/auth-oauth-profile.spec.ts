import { describe, it, expect } from 'vitest';
import { googleProfile, pickGithubEmail } from '../src/lib/auth/oauth-profile';

describe('googleProfile (verified-email gate)', () => {
  const base = { sub: '123', email: 'User@Example.com', email_verified: true, name: 'Jo', picture: 'p' };

  it('accepts a verified email and lowercases it', () => {
    const p = googleProfile(base);
    expect(p).toEqual({ providerUserId: '123', email: 'user@example.com', name: 'Jo', avatarUrl: 'p' });
  });

  it('rejects an unverified email (account-takeover guard)', () => {
    expect(googleProfile({ ...base, email_verified: false })).toBeNull();
    expect(googleProfile({ ...base, email_verified: 'true' })).toBeNull(); // strict !== true
    expect(googleProfile({ ...base, email_verified: undefined })).toBeNull();
  });

  it('rejects missing email or sub', () => {
    expect(googleProfile({ ...base, email: undefined })).toBeNull();
    expect(googleProfile({ ...base, sub: undefined })).toBeNull();
  });

  it('tolerates missing name/picture', () => {
    const p = googleProfile({ sub: '1', email: 'a@b.co', email_verified: true });
    expect(p).toEqual({ providerUserId: '1', email: 'a@b.co', name: null, avatarUrl: null });
  });
});

describe('pickGithubEmail', () => {
  it('prefers the verified primary email (lowercased)', () => {
    const r = pickGithubEmail([
      { email: 'secondary@x.com', primary: false, verified: true },
      { email: 'Primary@X.com', primary: true, verified: true },
    ]);
    expect(r).toBe('primary@x.com');
  });

  it('falls back to any verified email when the primary is unverified', () => {
    const r = pickGithubEmail([
      { email: 'primary@x.com', primary: true, verified: false },
      { email: 'verified@x.com', primary: false, verified: true },
    ]);
    expect(r).toBe('verified@x.com');
  });

  it('returns null when nothing is verified', () => {
    expect(
      pickGithubEmail([{ email: 'a@x.com', primary: true, verified: false }]),
    ).toBeNull();
    expect(pickGithubEmail([])).toBeNull();
  });
});
