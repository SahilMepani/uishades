/**
 * Figma Variables JSON export (for the "Variables Import" community plugin).
 *
 * A single "Default" mode collection of COLOR variables named `{slug}/{key}`.
 *
 * NOTE: always emits hex. The plugin parses hex strings into COLOR variables;
 * an `oklch(...)` string would fail the import, so this serializer ignores
 * `valueMode` by design.
 */

import { sanitizeName, type ColorToken, type ValueMode } from './tokens';

export function toFigmaVars(
  tokens: ColorToken[],
  name: string,
  _valueMode: ValueMode,
): string {
  const slug = sanitizeName(name);
  const modeId = '1:0';
  const variables = tokens.map((t) => ({
    name: `${slug}/${t.key}`,
    type: 'COLOR' as const,
    valuesByMode: {
      [modeId]: t.hex,
    },
  }));
  const out = {
    version: '1.0',
    collections: [
      {
        name: slug,
        modes: [{ modeId, name: 'Default' }],
        variables,
      },
    ],
  };
  return JSON.stringify(out, null, 2) + '\n';
}
