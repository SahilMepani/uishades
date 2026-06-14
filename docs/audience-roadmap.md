# UIshades — Audience & Product Roadmap

Status: **strategy doc. Free forever — monetization abandoned 2026-06-14.**
Captures who UIshades is for and the order we build for them. There is no paid
tier and no paywall plan; the old `billing-paywall.md` and the Phase 3
monetization fork have been removed. Everything ships free, ad-free, and
login-free on the core tool.

---

## The core decision

The product had three audiences:

| Audience | Wants |
|---|---|
| **A. Casual hex searchers** (0to255 inheritance) | Grab a hex, leave |
| **B. Developers on Tailwind / tokens** | Clean scale, copy, leave |
| **C. Designers/agencies** | Save, theme, ship branded UI |

**Chosen path:** a free, closed-source dev utility, built first for **B** and
broadened toward **C** with UI previews — all of it free. We are **not**
monetizing. No ads (ruled out), no subscriptions, no Pro tier. Revenue is not a
goal of this project; a fast, ad-free, genuinely useful tool is.

What that means in practice:

- The **component gallery is free** — "see your palette on real UI."
- The **themed, WCAG-verified code/token export is free** too.
- The **differentiator is color intelligence** (OKLCH + contrast roles), and we
  win on "guaranteed-accessible, role-mapped theme in your exact palette." We
  give it away because the whole point is reach and usefulness, not conversion.

---

## Phase 1 — Win developers with the fastest clean-scale tool

**Goal:** returning developer audience. **Metric:** weekly return visitors +
agent/citation traffic.

Positioning (one line):
> *"Paste a color, get a production-ready OKLCH scale you can drop straight into Tailwind — no ads, no signup."*

### Steps

1. **Make the output the hero.** Remove any explanatory copy above the tool on
   `/`. The palette is the page (per `notes.todo`: `/7f57ca` works because it
   demonstrates before it explains). Verify on `/` and `/[hex]`.
2. **Ship the listed UX fixes** (from `notes.todo`):
   1. Native browser color picker across the site.
   2. Relabel "Copy as" → "View as / Show as" (single clickable label that
      cycles values, like the cc mode).
   3. Move the copy toast to the **top** on desktop viewports.
   4. Add WCAG contrast badges to the preview.
3. **Sharpen the wedge.** Make sure the OKLCH ramp + one-click Tailwind/token
   export is faster and cleaner than uicolors.app / Coolors. That speed + ad-free
   + OKLCH quality is the entire differentiator — protect it.
4. **Distribute** (closed source ⇒ this replaces GitHub stars):
   1. Polish and publish `launch-blog-post.md`.
   2. Fire `launch-announcements.md` (Product Hunt, dev newsletters, the
      awesome-* lists in `notes.todo`).
   3. Lead the agent angle: "the color tool AI agents can actually use" (MCP,
      markdown negotiation, llms.txt are already built — real, underused moat).
5. **Hold the line:** palettes stay free and public (every public palette is an
   SEO/marketing surface).

**Exit criteria:** a measurable base of returning developers + steady organic /
agent traffic.

---

## Phase 2 — UI previews (free, the end state)

**Goal:** give devs "visual confidence" (see the palette on real UI). Built
**free and ungated** — and it stays that way. This is the product's destination,
not a bridge to anything paid.

Reuse the existing seam: the `MockPreview` registry (`src/components/mocks/`,
`src/components/MockPreview.tsx`).

### Steps

1. **Curate a *small* section set — 5–8, not 50.** Enough to prove the concept,
   not a design treadmill. Suggested lane: **marketing/landing sections** (hero,
   testimonials, pricing, CTA, features) — where brand color matters most.
2. **Wire each section to the palette as a role system**, not a single accent:
   `surface / text / border / accent / muted`. This is the part Tailwind Plus
   does *not* give you.
3. **Run every section through contrast scoring.** Reuse `src/lib/color/contrast.ts`.
   Surface an AA/AAA badge per section so "guaranteed accessible in your colors"
   is visible, not just claimed.
4. **Add a whole-preview WCAG score** (per `notes.todo`) so users trust the
   output at a glance.
5. **Keep everything copy-free** — no paywall, no locks, ever.

**Exit criteria:** the preview gallery is used and liked; contrast/role theming
demonstrably works across all sections.

---

## What NOT to do

- Don't open-source (decided).
- Don't add ads, a paywall, a Pro tier, or any monetization — this is a free
  tool, full stop. The `isPro` / `users.plan` DB seams are inert leftovers; leave
  them harmless, don't build on them.
- Don't gate the free shade tool, generation, saving, or public palettes.
- Don't try to out-breadth Tailwind Plus / shadcn on components. Win on
  accessible, role-mapped theming.
