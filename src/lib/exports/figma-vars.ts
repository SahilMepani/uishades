/**
 * Figma Variables JSON export.
 *
 * Output is shaped for the popular "Variables Import" community plugin.
 * That format is a single collection containing modes and variables.
 * Each variable holds a `valuesByMode` map keyed by mode id, with the
 * value as a hex string the plugin parses to a COLOR variable.
 *
 * Single "Default" mode keeps the import simple — designers can split
 * into light/dark modes after import using Figma's UI.
 */

import type { TailwindScale } from '../color/types';

function sanitizeName(name: string): string {
  const cleaned = (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'brand';
}

export function toFigmaVars(scale: TailwindScale, name: string): string {
  const slug = sanitizeName(name);
  const modeId = '1:0';
  const variables = scale.shades.map((s) => ({
    name: `${slug}/${s.stop}`,
    type: 'COLOR' as const,
    valuesByMode: {
      [modeId]: s.hex,
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
