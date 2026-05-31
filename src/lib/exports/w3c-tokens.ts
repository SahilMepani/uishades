/**
 * W3C Design Tokens (DTCG) JSON export.
 *
 * Each color is `{ $value, $type: "color" }`, nested under the brand `name`.
 * Reference: https://tr.designtokens.org/format/
 *
 * NOTE: always emits hex. The DTCG `color` $type expects a hex/sRGB string;
 * emitting `oklch(...)` would produce non-standard tokens, so this serializer
 * ignores `valueMode` by design.
 */

import { sanitizeName, type ColorToken, type ValueMode } from './tokens';

export function toW3CTokens(
  tokens: ColorToken[],
  name: string,
  _valueMode: ValueMode,
): string {
  const slug = sanitizeName(name);
  const inner: Record<string, { $value: string; $type: 'color' }> = {};
  for (const t of tokens) {
    inner[t.key] = { $value: t.hex, $type: 'color' };
  }
  return JSON.stringify({ [slug]: inner }, null, 2) + '\n';
}
