/**
 * Tailwind v3 config snippet export.
 *
 * Produces the full `module.exports = { ... }` snippet. The brand keys and the
 * per-shade keys are quoted strings so a hyphenated slug (e.g. burnt-orange)
 * or a bare numeric key stays a valid JS object literal when the pasted config
 * is require()'d. A multi-color palette emits one quoted color key per group.
 *
 * **Two-tier:** when any group carries a `semantic` label, a second set of
 * quoted color keys (the roles — `'primary'`, `'neutral'`, …) is appended, each
 * a nested map (`DEFAULT`/`hover`/`active`/`surface`/`muted`/`border`/`emphasis`).
 * Because a v3 config is a plain JS object, these can't `var()`-reference
 * the primitive keys above — they are *resolved snapshots* of the primitive
 * hexes (a comment in the output says so). v4/css-vars keep live `var()` aliases.
 */

import {
  sanitizeName,
  tokenValue,
  semanticTokens,
  type ColorGroup,
  type ValueMode,
} from './tokens';

/** `''` (base) nests under `DEFAULT`; every other variant keeps its own key. */
function semanticKey(variant: string): string {
  return variant === '' ? 'DEFAULT' : variant;
}

function primitiveColorBlock(g: ColorGroup, valueMode: ValueMode): string {
  const slug = sanitizeName(g.name);
  const entries = g.tokens
    .map((t) => `          '${t.key}': '${tokenValue(t, valueMode)}',`)
    .join('\n');
  return [`        '${slug}': {`, entries, `        },`].join('\n');
}

function semanticColorBlock(g: ColorGroup, valueMode: ValueMode): string {
  const role = sanitizeName(g.semantic ?? '');
  const byKey = new Map(g.tokens.map((t) => [t.key, t]));
  const entries = semanticTokens(g)
    .map((s) => {
      const value = tokenValue(byKey.get(s.ref.stop)!, valueMode);
      return `          '${semanticKey(s.variant)}': '${value}',`;
    })
    .join('\n');
  return [`        '${role}': {`, entries, `        },`].join('\n');
}

export function toTailwindV3(groups: ColorGroup[], valueMode: ValueMode): string {
  const primitives = groups.map((g) => primitiveColorBlock(g, valueMode));
  const semantics = groups
    .filter((g) => semanticTokens(g).length > 0)
    .map((g) => semanticColorBlock(g, valueMode));

  const colorBlocks =
    semantics.length === 0
      ? primitives.join('\n')
      : [
          primitives.join('\n'),
          `        // semantic (tier 2): resolved snapshots of the primitives above`,
          semantics.join('\n'),
        ].join('\n');

  return [
    `module.exports = {`,
    `  theme: {`,
    `    extend: {`,
    `      colors: {`,
    colorBlocks,
    `      },`,
    `    },`,
    `  },`,
    `};`,
    '',
  ].join('\n');
}
