/**
 * Figma Variables JSON export (for the "Variables Import" community plugin).
 *
 * A single "Default" mode collection of COLOR variables named `{slug}/{key}`.
 * A multi-color palette puts every color's variables in the same collection
 * (`{slug}/{key}` keeps them grouped by color in Figma's variable picker); the
 * collection itself is named after the single color, or `palette` for many.
 *
 * NOTE: always emits hex. The plugin parses hex strings into COLOR variables;
 * an `oklch(...)` string would fail the import, so this serializer ignores
 * `valueMode` by design.
 */

import { sanitizeName, type ColorGroup, type ValueMode } from './tokens';

export function toFigmaVars(groups: ColorGroup[], _valueMode: ValueMode): string {
  const modeId = '1:0';
  const variables = groups.flatMap((g) => {
    const slug = sanitizeName(g.name);
    return g.tokens.map((t) => ({
      name: `${slug}/${t.key}`,
      type: 'COLOR' as const,
      valuesByMode: {
        [modeId]: t.hex,
      },
    }));
  });
  const collectionName = groups.length === 1 ? sanitizeName(groups[0].name) : 'palette';
  const out = {
    version: '1.0',
    collections: [
      {
        name: collectionName,
        modes: [{ modeId, name: 'Default' }],
        variables,
      },
    ],
  };
  return JSON.stringify(out, null, 2) + '\n';
}
