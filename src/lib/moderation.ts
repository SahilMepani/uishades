/**
 * Tiny, conservative server-side profanity guard for *public* strings -
 * palette names. This is intentionally
 * small and obvious, not a comprehensive filter: it catches the unambiguous
 * slurs/obscenities a public, indexable gallery must not surface, while keeping
 * false positives low (the Scunthorpe problem) by matching on a normalized form
 * plus a short list of word-boundary patterns.
 *
 * It is NOT a security control and NOT a substitute for the report/flag path -
 * it's the cheap front-line check at create/rename time.
 */

/**
 * Normalize a candidate string for matching: lowercase, fold common leetspeak
 * digit/symbol substitutions back to letters, and strip everything that isn't a
 * latin letter (so spacing/punctuation evasions like `f.u.c.k` collapse to the
 * bare word). The result is a letters-only lowercase string used for substring
 * tests. Exported so callers/tests can see exactly what is being matched.
 */
export function normalizeForCheck(text: string): string {
  const leet: Record<string, string> = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '8': 'b',
    '@': 'a',
    $: 's',
  };
  return text
    .toLowerCase()
    .replace(/[01345 78@$]/g, (ch) => leet[ch] ?? ch)
    .replace(/[^a-z]/g, '');
}

/**
 * Short, obvious wordlist. Kept deliberately small - these are the unambiguous
 * obscenities/slurs we never want under our domain. Entries are matched as
 * substrings of the normalized (letters-only, de-leeted) text, so a name like
 * "Sh1tStorm" → "shitstorm" still trips "shit". The Scunthorpe-style innocents
 * (e.g. "scunthorpe", "assassin", "class") are guarded by the allowlist below.
 */
const BLOCKLIST: readonly string[] = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'asshole',
  'bastard',
  'dick',
  'pussy',
  'cock',
  'whore',
  'slut',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'rape',
  'nazi',
];

/**
 * Normalized innocent words that legitimately *contain* a blocked substring.
 * If, after normalization, the whole candidate equals one of these, we let it
 * pass even though a blocklist entry is a substring. (We only allowlist exact
 * normalized matches to avoid re-opening the evasion door.)
 */
const ALLOWLIST: ReadonlySet<string> = new Set([
  'scunthorpe',
  'assassin',
  'assassins',
  'class',
  'classic',
  'classics',
  'pass',
  'password',
  'bass',
  'grass',
  'glass',
  'brass',
  'cockpit',
  'cocktail',
  'shitake', // common misspelling of shiitake
  'shiitake',
  'analysis',
  'dickens',
  'dickinson',
]);

/**
 * Conservative profanity check for public palette names. Returns
 * `true` when the text should be rejected. Empty/whitespace input is treated as
 * clean (length/required validation is the caller's job).
 */
export function isProfane(text: string): boolean {
  const normalized = normalizeForCheck(text);
  if (!normalized) return false;
  if (ALLOWLIST.has(normalized)) return false;
  return BLOCKLIST.some((word) => normalized.includes(word));
}
