import { describe, it, expect } from 'vitest';
import { isProfane, normalizeForCheck } from '../src/lib/moderation';

describe('normalizeForCheck', () => {
  it('lowercases and strips non-letters', () => {
    expect(normalizeForCheck('Hello, World!')).toBe('helloworld');
  });

  it('folds common leetspeak back to letters', () => {
    expect(normalizeForCheck('Sh1t')).toBe('shit');
    expect(normalizeForCheck('@ss')).toBe('ass');
    expect(normalizeForCheck('f.u.c.k')).toBe('fuck');
    expect(normalizeForCheck('5h17')).toBe('shit');
  });

  it('returns empty for whitespace/punctuation-only input', () => {
    expect(normalizeForCheck('   ...  ')).toBe('');
  });
});

describe('isProfane', () => {
  it('passes clean palette names', () => {
    expect(isProfane('Sunset Oxblood')).toBe(false);
    expect(isProfane('Calm Ocean Blues')).toBe(false);
    expect(isProfane('')).toBe(false);
    expect(isProfane('   ')).toBe(false);
  });

  it('rejects obvious obscenities', () => {
    expect(isProfane('fuck')).toBe(true);
    expect(isProfane('Shit Storm')).toBe(true);
    expect(isProfane('what an asshole')).toBe(true);
  });

  it('rejects leetspeak / punctuation evasions', () => {
    expect(isProfane('Sh1tStorm')).toBe(true);
    expect(isProfane('f.u.c.k')).toBe(true);
    expect(isProfane('5h17')).toBe(true);
  });

  it('rejects slurs', () => {
    expect(isProfane('faggot')).toBe(true);
    expect(isProfane('retard')).toBe(true);
  });

  it('does not false-positive on innocent words containing a blocked substring', () => {
    expect(isProfane('Scunthorpe')).toBe(false);
    expect(isProfane('classic')).toBe(false);
    expect(isProfane('password')).toBe(false);
    expect(isProfane('cocktail')).toBe(false);
    expect(isProfane('analysis')).toBe(false);
  });
});
