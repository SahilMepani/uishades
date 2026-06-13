# UIshades — Audience & Monetization Roadmap

Status: **strategy doc, decided 2026-06-13.** Captures who UIshades is for, the
order we build for them, and the monetization design. Sits alongside
`billing-paywall.md` (the implementation reference) — this doc is the *why* and
the *sequence*; that doc is the *how* of turning on Pro.

---

## The core decision

The product had three audiences pulling in incompatible directions:

| Audience | Wants | Pays? |
|---|---|---|
| **A. Casual hex searchers** (0to255 inheritance) | Grab a hex, leave | No (ads only — ruled out) |
| **B. Developers on Tailwind / tokens** | Clean scale, copy, leave | Rarely |
| **C. Designers/agencies** | Save, theme, ship branded UI | **Yes** |

**Chosen path:** start as a free, closed-source dev utility for **B**, grow an
audience, then layer paid **Pro** on top aimed at **C** — with **UI previews as
the bridge** between the two. Never gate the free shade tool, generation, or
public palettes; they are the funnel.

**The monetization thesis (refined):** nobody pays for color math. They pay for
**time saved + production-ready, accessible code**. So:

- The **component gallery is the marketing** (free — "see your palette on real UI").
- The **themed, WCAG-verified code/token export is the product** (paid).
- The **moat is color intelligence** (OKLCH + contrast roles), **not** the
  components themselves — competing on component breadth means losing to
  Tailwind Plus / shadcn. We win on "guaranteed-accessible, role-mapped theme in
  your exact palette," which they can't claim and which scales algorithmically.

---

## Phase 1 — Win developers with the fastest clean-scale tool

**Goal:** returning developer audience. **Metric:** weekly return visitors +
agent/citation traffic. **Not** revenue, not stars. **Do not touch the paywall.**

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
   SEO/marketing surface). No `isPro` calls wired yet.

**Exit criteria:** a measurable base of returning developers + steady organic /
agent traffic before spending a day on monetization.

---

## Phase 2 — UI previews (the free bridge)

**Goal:** give devs "visual confidence" (see the palette on real UI) AND build
the surface that Phase 3 monetizes. Built **free and ungated** in this phase to
drive love and reliance first.

Reuse the existing seam: the `MockPreview` registry (`src/components/mocks/`,
`src/components/MockPreview.tsx`) and the "4 visual-layout mockups" plan in
`billing-paywall.md`.

### Steps

1. **Curate a *small* section set — 5–8, not 50.** Enough to prove the concept,
   not a design treadmill. Suggested lane: **marketing/landing sections** (hero,
   testimonials, pricing, CTA, features) — where brand color matters most and
   the indie-hacker/ShipFast crowd pays.
2. **Wire each section to the palette as a role system**, not a single accent:
   `surface / text / border / accent / muted`. This is the part Tailwind Plus
   does *not* give you.
3. **Run every section through contrast scoring.** Reuse `src/lib/color/contrast.ts`.
   Surface an AA/AAA badge per section so "guaranteed accessible in your colors"
   is visible, not just claimed.
4. **Add a whole-preview WCAG score** (per `notes.todo`) so users trust the
   output at a glance.
5. **Keep everything copy-free in this phase** — no paywall, no locks. Measure:
   do people browse the gallery and return? That signal validates Phase 3.

**Exit criteria:** the preview gallery is used and liked; contrast/role theming
demonstrably works across all sections.

---

## Phase 3 — Turn on the business

**Goal:** revenue from **C** (and power users of **B**) without ever gating the
free tool. Most of the plumbing is pre-wired in `billing-paywall.md` — flip
seams, don't rebuild.

**Decide first (Option A vs B below), then execute these steps.**

### Steps

1. **Pick the paid artifact** (see "Two monetization options" — this is the one
   open decision):
   - **A. Section code export** — copy HTML/CSS/React/Tailwind for a section,
     themed + accessible. Funnel = the gallery.
   - **B. Theme-system export** — full Tailwind config + CSS vars + shadcn theme
     + Radix/Figma/iOS tokens + auto dark mode, all contrast-verified.
   - Recommended: **build A as the visible hook, sell B as the scalable core**
     (gallery markets it, theme/code export is the product).
2. **Choose pricing model to match the job.** Copying code is a *one-time* need
   ⇒ favor **lifetime / one-time (with updates)** over pure subscription
   (Tailwind Plus is $299 lifetime). Revisit the `$4/mo` assumption in
   `billing-paywall.md` against this.
3. **Choose provider: Lemon Squeezy** (merchant-of-record — handles global VAT
   for a solo founder). Confirm against `billing-paywall.md` §"Founder decisions".
4. **Gate polish + privacy, never the tool.** Flip the inert seams:
   1. `isPro()` (`src/lib/auth/db.ts:338`) — already exported/tested, called
      nowhere yet.
   2. The code/theme **export buttons** → gated by `isPro` (free = preview only).
   3. Private palettes 402 seam (`src/pages/api/palettes/[id].ts:59-61`).
   4. `VisibilityToggle` → `UpgradeSheet` (`src/components/PaletteEditor.tsx`).
   5. Watermark removal + raised save cap.
5. **Build checkout + webhook + portal** per `billing-paywall.md` §"What needs to
   be built". Keep the webhook the **only** writer of `plan`/`plan_until`.
6. **Test in provider test mode end-to-end**, then go live.

**Exit criteria:** a free user hits the export paywall, upgrades, and the gated
export unlocks — with the free shade tool untouched throughout.

---

## Two monetization options (the Phase 3 fork)

### Option A — Section code export (the visible hook)

A curated gallery of polished sections rendered live in the user's palette; pay
to copy the code (HTML / CSS / React / Tailwind) + tokens.

- **Strength:** concrete, screenshot-able "worth it" moment; clear time-saved value.
- **Risk:** components are a **content business** (ongoing design labor) and put
  you against Tailwind Plus's design team + free shadcn. Mitigate by keeping the
  set *small* and making the value the **accessibility + theming**, not breadth.
- **Moat:** "every section guaranteed AA/AAA in your colors" — algorithmic, not
  design-labor.

### Option B — Theme-system export (the scalable core)

Sell the complete, accessible design system generated from the palette: full
Tailwind config + CSS variables + shadcn `globals.css` theme + Radix/Figma/
iOS-Android tokens + auto-generated, contrast-verified dark mode.

- **Strength:** pure **algorithm/engineering moat** (your strength), near-zero
  ongoing content cost, avoids the Tailwind-UI content war. Proven demand
  (shadcn theme generators, e.g. tweakcn).
- **Risk:** less visually exciting to market than "your palette on a beautiful
  testimonial."

### Recommendation

**Not mutually exclusive — A markets B.** Build a small section gallery as the
free wow-factor funnel; make the paid artifact the **accessible themed code +
design tokens**, so value rests on color intelligence you can scale, not a design
treadmill you can't.

---

## What NOT to do

- Don't open-source (decided).
- Don't gate the free shade tool, generation, saving, or public palettes — funnel.
- Don't try to out-breadth Tailwind Plus / shadcn on components. Win on
  accessible, role-mapped theming.
- Don't wire any `isPro` gate before Phase 1 has a returning audience.
