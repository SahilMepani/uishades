# Launch announcement copy

Short-form copy for the launch surface. Long-form is in
`docs/launch-blog-post.md`.

---

## Show HN

**Title:** `Show HN: Shades.dev – Free tints and shades of any hex color (0to255 replacement)`

**Body:**

0to255.com — the free shade generator most of us bookmarked years ago — went
behind a paywall recently. Shades.dev is a free replacement with the same URL
structure (`/4040ff` works), so old bookmarks and Google results can swap the
hostname and land where they expected. The defaults are different in three
ways:

- **OKLCH-anchored ramps by default.** Mid-shades on muddy colours like olive
  `#808000` or burnt umber stay on-hue across the gradient instead of drifting
  toward grey. There's a Classic toggle that reproduces the 0to255 RGB-walk
  algorithm bit-for-bit if you need parity with an existing system.
- **Tailwind-first exports.** Every page renders an 11-stop scale anchored
  on your input, with copy buttons for Tailwind v4 `@theme`, v3 config, CSS
  custom properties, W3C Design Tokens JSON, and Figma Variables JSON.
- **WCAG contrast badges on every shade.** AA/AAA against white and black,
  shown inline so you can see at a glance which step of your brand ramp
  passes body-text contrast.

Built on Astro + Cloudflare Workers, ~20KB HTML/CSS per page, MIT licensed.

---

## Product Hunt

**Tagline:** Free OKLCH-based tints and shades of any hex color, with
Tailwind-ready exports.

**Description:**

Shades.dev is a free shade generator for designers and developers — type any
hex, RGB, HSL, OKLCH, or CSS colour name and get a full ramp of tints and
shades, plus a Tailwind-style 11-stop scale with paste-ready exports. The
defaults use OKLCH, which keeps mid-shades on-hue across muddy colours where
older RGB-walk tools drift toward grey. Every shade carries inline WCAG
contrast badges. Permanent URLs for every hex make sharing painless.

**Features:**

- OKLCH ramps with a Classic RGB toggle for parity with 0to255-era outputs
- Copy-ready exports for Tailwind v4, Tailwind v3, CSS vars, W3C Design
  Tokens JSON, and Figma Variables JSON
- Inline WCAG AA/AAA contrast badges on every step in the ramp

---

## Twitter/X thread

**Tweet 1 (hook):**

```
0to255 — the free shade generator most of us had bookmarked for a decade — went paid recently.

Built a replacement: shades.dev. Same URL structure (/4040ff works), free, with a better algorithm by default.

Thread on what's different:
```

**Tweet 2 (algorithm):**

```
Default ramp uses OKLCH, not RGB walks.

On olive #808000, the classic algorithm drifts the mid-shades toward khaki-grey by step 3.

OKLCH holds the hue and chroma constant — every step still reads as olive. Most visible on yellows, browns, and muddied warms.
```

**Tweet 3 (Tailwind):**

```
Every page also renders an 11-stop Tailwind scale anchored on your input, with copy buttons for:

- Tailwind v4 @theme
- Tailwind v3 config
- CSS variables
- W3C Design Tokens JSON
- Figma Variables JSON

Cuts the spreadsheet round-trip designers were doing to ship brand ramps.
```

**Tweet 4 (CTA + link):**

```
Free, no signup, no ads. ~20KB per page. Runs on Cloudflare Workers, MIT licensed, fork-friendly.

Try it: shades.dev
Source: github.com/shades-dev/shades.dev

If you used to bookmark a 0to255 URL, swap the host and yours still works.
```

---

## Reddit /r/webdev

**Title:** `I built a free replacement for 0to255 since they went paid — same URL structure, better algorithm, Tailwind exports`

**Body:**

0to255.com went behind a paywall earlier this year. It was the go-to free
shade generator for a long time, and a lot of bookmarks and Google results
now hit a login wall. I built [shades.dev](https://shades.dev) as a drop-in
replacement: same `/[hex]` URL structure, free forever, no ads. Defaults use
OKLCH instead of the RGB-walk algorithm 0to255 used, which keeps mid-shades
on-hue across muddy colours like olives and browns where the old algorithm
drifts grey. There's a Classic toggle if you need bit-for-bit parity. Every
page also renders an 11-stop Tailwind-style scale with paste-ready exports
for Tailwind v4, v3, CSS variables, W3C Design Tokens, and Figma Variables.
Stack is Astro + Cloudflare Workers, MIT licensed, ~20KB HTML/CSS per page.
Feedback welcome — especially on export formats you want that aren't there
yet.

---

## Reddit /r/web_design

**Title:** `Shades.dev — free tints/shades tool with OKLCH ramps and WCAG contrast badges built in`

**Body:**

Posting here because the contrast-badge feature is the bit designers will
care about most. [Shades.dev](https://shades.dev) generates a tint-and-shade
ramp from any hex (RGB, HSL, OKLCH, and CSS colour names all parse) and shows
inline WCAG AA/AAA contrast ratios against pure white and pure black on every
shade — no round trip to a separate contrast checker. The ramp itself is
OKLCH-anchored by default, so mid-tones on muddy colours like olive or burnt
sienna stay on-hue across the gradient instead of drifting grey the way older
RGB-walk tools handle them. There's also an 11-stop Tailwind-style scale on
every page with paste-ready exports for Figma Variables JSON, W3C Design
Tokens JSON, CSS custom properties, and the Tailwind v3/v4 config formats.
Free, no signup, no ads. Built as a replacement after 0to255 went paid.

---

## Dev.to launch post

**Title:** `We rebuilt 0to255 because it went paid. Here's what we learned.`

**Meta description (155 chars):**

```
Free OKLCH-based shade generator with Tailwind exports and WCAG contrast badges, built on Astro + Cloudflare Workers as a 0to255 replacement.
```

**Body:** Use the long-form post from `docs/launch-blog-post.md` directly.
Add a canonical link back to `https://shades.dev/blog/launch` (or wherever the
canonical version lives) to prevent SEO conflict if cross-posting.
