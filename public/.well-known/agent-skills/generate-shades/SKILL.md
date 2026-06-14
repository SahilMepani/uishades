---
name: generate-shades
description: Generate a full perceptual OKLCH ramp plus an 11-stop Tailwind scale (50-950) for any color, with WCAG contrast and nearby colors, via the free no-auth UIshades JSON API or the generate_shades MCP tool.
---

# Generate shades for any color

UIshades (https://uishades.com) turns a single color into a complete palette:
an 11-step perceptual **OKLCH ramp** (lightest to darkest) and an 11-stop
**Tailwind scale** (50-950), with WCAG contrast and nearby colors. It is a free,
ad-free, public tool. **No authentication, no API key, no rate-limit signup.**

Two equivalent ways to get the data; both return the same `ColorPageData`.

## (a) JSON API

```
GET https://uishades.com/api/{hex}.json
```

`{hex}` is a **bare** 3-, 6-, or 8-digit hex (no `#`), e.g. `4040ff`, `f00`,
`4040ffcc`. The endpoint validates and canonicalizes the input.

```sh
curl -s https://uishades.com/api/4040ff.json
```

The response is a single `ColorPageData` object:

```jsonc
{
  "input": "#4040ff",              // canonical lowercase #rrggbb
  "ramp": {
    "mode": "oklch",
    "shades": [                    // 11 shades, lightest -> darkest
      { "hex": "#f3f2ff",
        "oklch": { "l": 0.95, "c": 0.03, "h": 270.1 } }
      // ...
    ],
    "inputIndex": 5                // index in shades[] where the input is pinned
  },
  "scale": {
    "shades": [                    // exactly 11 entries, stops 50..950 in order
      { "hex": "#eeeeff",
        "oklch": { "l": 0.94, "c": 0.03, "h": 270.0 },
        "stop": 50 }
      // ...
    ],
    "anchorStop": 600              // the Tailwind stop the input snapped to
  },
  "neighbors": {                   // 3 each, for discovery / crawl graph
    "lighter": ["#5a5aff", "#7373ff", "#8d8dff"],
    "darker":  ["#3232e6", "#2727cc", "#1d1db3"]
  }
}
```

Field reference:

- **`input`** - the canonical color, always lowercase `#rrggbb`.
- **`ramp.shades[]`** - the OKLCH ramp; each `{ hex, oklch:{l,c,h} }` ordered
  lightest to darkest. The shade at `ramp.inputIndex` is the input, pinned
  verbatim. `oklch.h` may be `NaN`/absent for achromatic colors.
- **`ramp.mode`** - always `"oklch"` from this API.
- **`scale.shades[]`** - the 11 Tailwind stops; each shade adds a `stop`
  (50, 100, ... 950). The shade snapped to the input has `isInput: true`.
- **`scale.anchorStop`** - which stop the input was snapped to.
- **`neighbors.lighter` / `neighbors.darker`** - 3 nearby hexes on each side
  (each links to `https://uishades.com/{hex-without-hash}`).

To get the same data as ready-to-read markdown (tables with WCAG contrast),
request `Accept: text/markdown` on the page URL:

```sh
curl -s -H 'Accept: text/markdown' https://uishades.com/4040ff
```

## (b) MCP tool

UIshades exposes a Model Context Protocol endpoint over **streamable HTTP**
(JSON-RPC 2.0), no auth:

```
POST https://uishades.com/mcp
```

Tool:

- **`generate_shades`** - input `{ "color": string }`. `color` accepts a hex
  (`#4040ff`, `4040ff`, `#f00`), a CSS function (`rgb(64 64 255)`,
  `hsl(240 100% 62%)`, `oklch(0.5 0.25 270)`), or a CSS color name (`coral`,
  `rebeccapurple`). Output is the palette rendered as **markdown text** plus a
  **`structuredContent`** field carrying the full `ColorPageData` object shown
  above.

Example tool call (JSON-RPC):

```jsonc
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "generate_shades", "arguments": { "color": "coral" } } }
```

Invalid colors return an error (the underlying `parseColor` throws on bad
input); pass a corrected color and retry.

## When to use this skill

- You need light/dark variants, a hover/active state, or a full Tailwind
  `50..950` palette derived from a brand or seed color.
- You want perceptually even tints/shades (OKLCH) rather than naive RGB
  lightening, which washes out near white/black.
- You need the canonical hex plus WCAG contrast for a color before using it.

Prefer the **MCP tool** when your agent already speaks MCP and the user gave a
loosely-formatted color (name / `rgb()` / `oklch()`); prefer the **JSON API**
for a quick, cacheable fetch when you already have a hex.
