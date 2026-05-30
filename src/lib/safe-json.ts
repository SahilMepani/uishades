/**
 * JSON-LD inline-script safe encoder.
 *
 * `JSON.stringify` alone is NOT safe to drop into an inline `<script>` block:
 * a string containing `</script>` will close the script tag and let arbitrary
 * markup follow. The same applies to U+2028 / U+2029 line terminators, which
 * are valid inside JSON strings but illegal inside a JavaScript string literal
 * - so an attacker (or future careless author) who lands one in the JSON-LD
 * payload would break script parsing.
 *
 * This helper post-processes the JSON output by escaping the unsafe
 * characters as `\u00XX` JSON escapes - still valid JSON, still parses to
 * the same value, but inert inside an HTML `<script>` context.
 *
 * Use everywhere we emit `<script type="application/ld+json" set:html={...}>`.
 */

// Build the lookup at module init. We avoid spelling U+2028 / U+2029 as
// literals in this source file (some toolchains and editors mangle pasted
// line-separator code points) by constructing them via String.fromCharCode.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

const REPLACEMENTS: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  [LS]: '\\u2028',
  [PS]: '\\u2029',
};

const UNSAFE_RE = new RegExp('[<>&' + LS + PS + ']', 'g');

export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(UNSAFE_RE, (c) => REPLACEMENTS[c]!);
}
