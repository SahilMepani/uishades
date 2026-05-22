import { describe, it, expect } from 'vitest';
import { safeJsonForScript } from '../src/lib/safe-json';

// Construct the line/paragraph separator code points at runtime so this
// source file stays ASCII-only — pasting U+2028 / U+2029 literals into a
// TypeScript file is a syntax error inside string literals, and many
// editors / pipelines silently mangle them anyway.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe('safeJsonForScript', () => {
  it('round-trips a plain object via JSON.parse', () => {
    const value = {
      name: 'Coral',
      hex: '#ff7f50',
      stops: [50, 100, 200, 300],
      nested: { a: 1, b: [true, false, null] },
    };
    const encoded = safeJsonForScript(value);
    expect(JSON.parse(encoded)).toEqual(value);
  });

  it('does not contain a literal `</script>` substring when escaping a script-break payload', () => {
    const encoded = safeJsonForScript({
      s: '</script><script>alert(1)</script>',
    });
    expect(encoded).not.toContain('</script>');
    // And the escaped form is still valid JSON that decodes back to the
    // original payload — the protection is purely at the inline-script
    // boundary, the data round-trips intact.
    expect(JSON.parse(encoded)).toEqual({
      s: '</script><script>alert(1)</script>',
    });
  });

  it('escapes U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR)', () => {
    const encoded = safeJsonForScript({ s: 'before' + LS + 'middle' + PS + 'after' });
    // The literal control characters must not appear in the output, because
    // they would terminate the inline `<script>` JavaScript string literal.
    expect(encoded).not.toContain(LS);
    expect(encoded).not.toContain(PS);
    // Their JSON-safe escapes (literal backslash-u-2028 / backslash-u-2029)
    // must appear instead. We assert the six-character string with the
    // backslash spelled out, not the actual code point.
    expect(encoded).toContain('\\u2028');
    expect(encoded).toContain('\\u2029');
  });
});
