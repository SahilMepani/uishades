/**
 * `buildColorPageData` - the single source of truth for the `ColorPageData`
 * payload shared by every machine-readable surface:
 *
 *   - `/api/[hex].json`        (the public JSON API)
 *   - `Accept: text/markdown`  on `/` and `/[hex]` (via `lib/markdown/color-page`)
 *   - the `/mcp` `generate_shades` tool (via `lib/mcp/handler`)
 *
 * Keeping the ramp/scale/neighbor derivation here means all three stay byte-for-
 * byte consistent - an agent reading the markdown, the JSON, or the MCP tool
 * result sees the same ramp the HTML page renders. `input` must already be a
 * canonical `Hex` (run it through `parseColor` first).
 */
import { oklchRamp } from './ramp';
import { buildScale } from './scale';
import type { ColorPageData, Hex } from './types';

/** Neighbor count surfaced on each side - matches the HTML page's crawl graph. */
const NEIGHBOR_SPAN = 3;

export function buildColorPageData(input: Hex): ColorPageData {
  const ramp = oklchRamp(input);
  const scale = buildScale(input);

  // 3-up / 3-down neighbor hexes, the same policy the HTML page and the crawl
  // graph use - kept consistent so JSON / markdown / MCP consumers see the same
  // link graph the crawler does.
  const lighter: Hex[] = [];
  for (let i = ramp.inputIndex - 1; i >= Math.max(0, ramp.inputIndex - NEIGHBOR_SPAN); i--) {
    lighter.push(ramp.shades[i].hex);
  }
  const darker: Hex[] = [];
  for (
    let i = ramp.inputIndex + 1;
    i <= Math.min(ramp.shades.length - 1, ramp.inputIndex + NEIGHBOR_SPAN);
    i++
  ) {
    darker.push(ramp.shades[i].hex);
  }

  return { input, ramp, scale, neighbors: { lighter, darker } };
}
