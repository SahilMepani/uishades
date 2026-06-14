---
title: "UIshades outgrew 0to255: full palettes, and an API agents can call"
description: "UIshades started as a free 0to255 replacement for tints and shades. It now builds multi-color palettes with semantic roles and exposes the same color data to AI agents over MCP and a no-auth JSON API."
pubDate: 2026-06-14
ogImage: "https://UIshades.com/og/4040ff.png"
---

When we launched, the pitch was simple: 0to255 went paid, so we built a free
replacement. Type a hex, get a gradient of tints and shades, copy what you
need. That covered the thing people had bookmarked for a decade.

The tool does more than that now. Two additions in particular have moved it
past "shade generator" and into "the place you assemble a color system" - and,
separately, "the color endpoint an AI agent reaches for." Here's what changed.

## From one color to a whole palette

A single hex expanded into a ramp is the right answer when you're picking one
shade. It's the wrong shape when you're building a design system, where you
need a *set* of colors that work together: a brand color, a couple of accents,
and the semantic roles every UI ends up needing.

So there's now a dedicated
**[color palette generator](https://UIshades.com/color-palette-generator)**.
It opens on a primary color plus the four roles you'd otherwise have to invent
from scratch - **Neutral, Success, Warning, and Error** - and you add secondary
and accent colors with a "+". Recolor any swatch, rename its role, or drop the
ones you don't need.

The part that matters: every color in the palette expands into the *same*
output the single-color tool gives you - an OKLCH perceptual ramp or an 11-stop
Tailwind scale (50–950) - and the whole palette exports in one pass. You go
from a brand color to a Tailwind `@theme` block with `primary`, `neutral`,
`success`, `warning`, and `error` scales already keyed to the right stops,
without copying hex values between a color tool and your config file. That copy
loop was the thing 0to255 never closed, and now neither the single-color view
nor the palette view leaves it open.

## The same data, for agents

The other shift is who - or what - is reading the page.

Everything a browser renders here is also available to AI assistants and tools,
in the format they actually want, with no auth and no API key:

- **A no-auth JSON API.** `GET /api/{hex}.json` returns the full color data -
  the OKLCH ramp, the Tailwind scale, and lighter/darker neighbors - for any
  hex. The same payload backs the web page, the markdown view, and the MCP
  tool, so all three agree by construction.
- **Markdown content negotiation.** Request any color page with
  `Accept: text/markdown` and you get a clean palette as a markdown table with
  WCAG contrast, instead of a wall of HTML an agent has to scrape.
- **An MCP endpoint.** `/mcp` speaks JSON-RPC over streamable HTTP and exposes a
  `generate_shades` tool that takes a hex, an `rgb()`/`hsl()`/`oklch()` value,
  or a CSS color name (`coral`, `rebeccapurple`) and hands back the palette.
- **Discovery files** under `/.well-known/` (an agent-skills manifest, an MCP
  server card, an API catalog) and an `llms.txt`, so an agent can *find* all of
  the above without being told the URLs.

The practical version: ask Claude or another agent for "an OKLCH Tailwind scale
for #4040ff" and it can pull the exact values from here, with contrast included,
rather than approximating the math itself and getting the mid-shades wrong.

## What didn't change

Still free. Still no ads, no signup, no upgrade prompt. Still the 0to255 URL
structure - `/4040ff`, `/colors/coral` - so old bookmarks and search results
keep landing on the page they always did. The single-color tool is still the
front door and still the fastest way to grab one shade.

The replacement was the starting point. The palette generator and the agent
surface are where it went next.

[Try the palette generator](https://UIshades.com/color-palette-generator), or
just [drop in a hex](https://UIshades.com/) like you always have.
