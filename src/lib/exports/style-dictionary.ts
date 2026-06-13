/**
 * Style Dictionary (Amazon) JSON export.
 *
 * Classic Style Dictionary v3 token format: a nested object keyed by the CTI
 * (Category/Type/Item) convention, with each leaf token a `{ value }` object.
 * We nest every color family under the top-level `color` category, so the
 * default Style Dictionary build emits names like `color-royalblue-50`:
 *
 *   { "color": { "royalblue": { "50": { "value": "#f5f6ff" }, … } } }
 *
 * A multi-color palette becomes one sub-group per color under `color`.
 * Reference: https://styledictionary.com/info/tokens/
 *
 * NOTE: always emits hex (like the W3C / Figma JSON serializers). Style
 * Dictionary's built-in `color/*` transforms parse the `value` as a color, and
 * an `oklch(...)` string would break those transforms - so this serializer
 * ignores `valueMode` by design (see EXPORT_SUPPORTS_NON_HEX in tokens.ts).
 */

import { sanitizeName, type ColorGroup, type ValueMode } from './tokens';

export function toStyleDictionary(groups: ColorGroup[], _valueMode: ValueMode): string {
  const color: Record<string, Record<string, { value: string }>> = {};
  for (const g of groups) {
    const inner: Record<string, { value: string }> = {};
    for (const t of g.tokens) {
      inner[t.key] = { value: t.hex };
    }
    color[sanitizeName(g.name)] = inner;
  }
  return JSON.stringify({ color }, null, 2) + '\n';
}
