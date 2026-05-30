/**
 * W3C Design Tokens (DTCG) JSON export.
 *
 * Conforms to the Design Tokens Community Group format draft. Each color
 * is wrapped in an object with `$value` and `$type: "color"`. The whole
 * palette nests under the `name` key.
 *
 * Reference: https://tr.designtokens.org/format/
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

export function toW3CTokens(scale: TailwindScale, name: string): string {
  const slug = sanitizeName(name);
  const inner: Record<string, { $value: string; $type: 'color' }> = {};
  for (const s of scale.shades) {
    inner[String(s.stop)] = { $value: s.hex, $type: 'color' };
  }
  return JSON.stringify({ [slug]: inner }, null, 2) + '\n';
}
