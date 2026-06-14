---
title: "We rebuilt 0to255 because it went paid. Here's what we learned."
description: "Free OKLCH-based shade generator with Tailwind exports and WCAG contrast badges, built on Astro + Cloudflare Workers as a 0to255 replacement."
pubDate: 2026-06-14
ogImage: "https://UIshades.com/og/4040ff.png"
---

For about twelve years, anyone searching "lighter shade of #4040ff" was thrown
the same first result: 0to255.com. The site did one thing - generated a
gradient of tints and shades from any hex you handed it - and it did that one
thing well enough to anchor the long tail of color-tool SEO for over a decade.

A few months ago, 0to255 went behind a paywall. Bookmarks that had survived
since the late 2000s now landed on a login wall. Google results began routing
traffic to a page that asked for a credit card before showing the colour you
typed into the address bar.

We built **[UIshades.com](https://UIshades.com)** to take that traffic back.

The site is free. There are no ads, no signup, no upgrade prompts. Type any
hex into the box and you get the same kind of gradient 0to255 used to give
you, plus a Tailwind-style 11-stop scale, paste-ready exports for Tailwind v4,
Tailwind v3, CSS variables, W3C Design Tokens, and Figma Variables. Every
shade carries a WCAG contrast badge against white and black. Permanent URLs
for every hex, so you can paste `/4040ff` into Slack and your teammate sees
the same page you saw.

## The algorithm is where it splits from 0to255

0to255 generates its ramps by walking each RGB channel toward 0 (for darker)
or 255 (for lighter) in equal steps. The math is simple. The output looks
clean on greys and blues. It falls apart on yellows, browns, and olives,
where the channels move at different rates relative to perceived lightness,
and the mid-shades drift away from the input hue.

We default to OKLCH. The ramp adjusts the `L` (perceptual lightness) channel
in equal steps while holding `C` (chroma) and `H` (hue) constant, which keeps
the mid-shades on-hue and on-chroma. The difference is most visible at
muddy mid-yellows like olive `#808000`:

| Step          | Classic RGB walk | OKLCH                    |
|---------------|------------------|--------------------------|
| Input         | `#808000`        | `#808000`                |
| -1 (darker)   | `#737300`        | `#787700` - same hue     |
| -2            | `#666600`        | `#6f6e00` - same hue     |
| -3            | `#595900` (drifts to khaki-brown) | `#666500` - still olive |

The Classic ramp's darker steps drift toward a grey-green olive that no longer
reads as the input colour; OKLCH's stay anchored. On bright reds the
difference is smaller; on muddied warms it is the whole story.

If you want the familiar 0to255 output bit-for-bit, say to match an existing
design system that was built against the RGB-walk algorithm, there's a Classic
toggle that reproduces the original formula exactly.

## Tailwind-first exports

The continuous ramp is one half of the tool. The other half is the
**11-stop Tailwind scale** rendered alongside, anchored on your input
colour, with copy buttons that hand you the exact snippet you need:

- Tailwind v4 `@theme` block
- Tailwind v3 `tailwind.config.js` extend block
- CSS custom properties
- [W3C Design Tokens](https://design-tokens.github.io/community-group/format/) JSON
- Figma Variables JSON for direct import

Most existing colour tools stop at the gradient. The Tailwind exports were
the thing that kept turning up in user research - designers and developers
were copying hex values out of 0to255 into spreadsheets and back into config
files. We cut that loop.

## Per-shade WCAG contrast badges

Every step in the ramp shows its WCAG contrast ratio against pure white and
pure black, with AA and AAA badges inline. No round trip to a separate
contrast checker. Designers can see, at a glance, which step of their brand
ramp will pass body-text contrast and which will only clear the threshold at
headline sizes.

## Implementation notes

The stack is intentionally simple:

- **Astro** for the page shell. Each `/colors/[name]` page is a static
  pre-rendered HTML/CSS document with the React island lazy-hydrating only
  when the user actually touches the tool.
- **React island** for the interactive bits - the input, the ramps, the
  copy buttons. Around 30KB Brotli, deferred.
- **Cloudflare Workers** for the SSR path. Arbitrary `/[hex]` requests render
  on demand at the edge in single-digit milliseconds (~11ms), with a 30-day
  `Cache-Control` for browsers and downstream caches.
- **culori** for colour math. Battle-tested, gamut-correct, supports OKLCH
  out of the box. No reinventing colour-space conversions.
- **OG images** rendered on demand with workers-og (Satori under the hood), so
  every shareable URL gets a custom preview image.

Page weight on the named-color pages is under 20KB Brotli for HTML/CSS, with
the React island deferred. Lighthouse scores: 95+ Performance, 100 SEO, 100
Accessibility, 100 Best Practices on every route in CI.

The whole thing runs on Cloudflare's free tier. No ads, no paywall, no signup
wall on the tool itself. The cheapest, fastest version of a tool that does one
thing well.

## Built for agents, too

The same data a browser renders is available to AI assistants and tools
directly. Every colour page answers `Accept: text/markdown` with a clean
markdown palette, there's an `llms.txt` describing the data model, and a
public MCP endpoint at `/mcp` exposes a `generate_shades` tool over JSON-RPC,
with no auth and no key. Ask Claude or another agent for "an OKLCH Tailwind scale for
#4040ff" and it can pull the answer straight from here instead of guessing.

We borrowed the URL structure from 0to255 deliberately, so anyone with an
old bookmark or a search result pointing at `0to255.com/4040ff` can swap
the hostname and land on the same page they used to land on. SEO transfer
was the explicit design goal; we built the redirect path before we built
the tool.

## Try it

[UIshades.com](https://UIshades.com). Free, fast, no signup. Drop in any hex,
any rgb(), any hsl(), any oklch(), or any CSS colour name. Bookmark the
specific shades you use most. If you find it useful, share it with someone
who used to bookmark 0to255.

If something's missing - an export format we don't support, a colour space
we should handle, a paste format you want - there's a feedback box right in
the tool. We're shipping fixes weekly.
