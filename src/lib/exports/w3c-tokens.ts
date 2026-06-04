/**
 * W3C Design Tokens (DTCG) JSON export.
 *
 * Each color is `{ $value, $type: "color" }`, nested under its brand name.
 * A multi-color palette becomes one top-level group per color.
 * Reference: https://tr.designtokens.org/format/
 *
 * NOTE: always emits hex. The DTCG `color` $type expects a hex/sRGB string;
 * emitting `oklch(...)` would produce non-standard tokens, so this serializer
 * ignores `valueMode` by design.
 */

import { sanitizeName, type ColorGroup, type ValueMode } from './tokens';

export function toW3CTokens(groups: ColorGroup[], _valueMode: ValueMode): string {
  const out: Record<string, Record<string, { $value: string; $type: 'color' }>> = {};
  for (const g of groups) {
    const inner: Record<string, { $value: string; $type: 'color' }> = {};
    for (const t of g.tokens) {
      inner[t.key] = { $value: t.hex, $type: 'color' };
    }
    out[sanitizeName(g.name)] = inner;
  }
  return JSON.stringify(out, null, 2) + '\n';
}
