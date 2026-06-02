---
name: color-conversion
description: Normalize any color (hex, rgb()/hsl()/oklch(), or CSS name) to a canonical lowercase hex and read its exact OKLCH coordinates and WCAG contrast, using the free no-auth UIshades JSON API or the generate_shades MCP tool.
---

# Convert and inspect a color

Use UIshades (https://uishades.com) to normalize a color and read its
perceptual coordinates. The same response that powers shade generation also
carries everything you need to **convert** and **inspect** a single color:
its canonical hex, its OKLCH `{l, c, h}`, and (via markdown) WCAG contrast.
The tool is free, ad-free, and public. **No authentication required.**

## Get the canonical hex + OKLCH

### JSON API

```
GET https://uishades.com/api/{hex}.json
```

`{hex}` is a bare 3-, 6-, or 8-digit hex (no `#`). The response's **`input`**
field is the canonical color: lowercase, 7-char `#rrggbb`. Each shade carries
exact OKLCH coordinates:

```sh
curl -s https://uishades.com/api/4040ff.json
```

```jsonc
{
  "input": "#4040ff",            // <- normalized canonical hex
  "ramp": {
    "shades": [
      { "hex": "#4040ff",
        "oklch": { "l": 0.508, "c": 0.281, "h": 270.4 },
        "isInput": true }        // the shade at ramp.inputIndex is the input
    ],
    "inputIndex": 11
  },
  "scale": { "shades": [ /* each has oklch + stop */ ], "anchorStop": 600 }
}
```

To read OKLCH for the input color specifically, take
`ramp.shades[ramp.inputIndex].oklch` (or scan for the shade with
`isInput: true`). Every shade in both `ramp.shades` and `scale.shades` exposes
`oklch: { l, c, h }` - `l` is 0..1, `c` is 0..~0.4, `h` is degrees 0..360
(`NaN`/absent when achromatic).

### MCP tool

```
POST https://uishades.com/mcp        (streamable HTTP, JSON-RPC 2.0, no auth)
```

Call the **`generate_shades`** tool with `{ "color": string }`. Because `color`
accepts a hex, `rgb()`, `hsl()`, `oklch()`, or a **CSS color name**, this is the
easiest conversion path when you start from a loosely-formatted value:

```jsonc
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "generate_shades",
              "arguments": { "color": "rgb(64 64 255)" } } }
```

The result's `structuredContent.input` is the canonical hex; every shade in
`structuredContent` carries `oklch`. Invalid input returns an error - fix the
color string and retry.

## Read WCAG contrast

Request the page as markdown to get a contrast table for free (ratio + AA/AAA
level vs white and vs black for every shade, including the input):

```sh
curl -s -H 'Accept: text/markdown' https://uishades.com/4040ff
```

This is the simplest way to answer "does this color pass WCAG AA on white/black"
without recomputing luminance yourself.

## When to use this skill

- Normalize a CSS name, `rgb()`, `hsl()`, or `oklch()` value to a stable
  lowercase `#rrggbb` for storage or comparison.
- Read exact OKLCH lightness/chroma/hue for a color (e.g. to sort palettes by
  perceptual lightness or to nudge chroma).
- Check WCAG contrast of a color against white and black before using it as
  text or a background.

For generating a full palette (ramp + Tailwind scale) from the converted color,
see the companion **generate-shades** skill - it reads from the same endpoints.
