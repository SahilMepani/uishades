# Billing & Paywall — Implementation Reference

Status: **deferred / not built.** The palettes feature ships everything free + public;
this doc is the plan for turning on paid **Pro** later. Hooks are already in the
codebase (see "What already exists") so this is additive — no schema rewrite.

Related: the overall feature direction lives in
`~/.claude/plans/i-like-the-options-agile-garden.md` (the "Deferred" section).

---

## Why a paywall (the product thesis)

UIshades is ad-free, so subscriptions are the **only** revenue. The free tier is
deliberately generous on the SEO-critical surfaces (the `/[hex]` tool, public
palettes, the gallery) because every public palette page is organic marketing.
**Pro sells privacy + polish + scale** — the things a working designer/agency
with clients actually pays for, not the core utility.

Hard rule (unchanged): never gate **generation, saving, publishing, or the free
tool**. The paywall only gates *secrecy* and *polish*.

---

## Founder decisions still open (confirm before building)

1. **Provider** — not chosen. Two realistic paths:
   - **Merchant-of-Record (Lemon Squeezy / Paddle)** — *recommended for a solo
     founder.* They collect & remit global sales tax / EU VAT for you (a real
     burden otherwise). Slightly higher fees (~5%+). Hosted checkout + webhook.
   - **Stripe** — lower fees (~2.9%), Customer Portal for self-serve management,
     but **you** own sales-tax compliance in every jurisdiction (or add Stripe Tax).
   - Both integrate the same way here (hosted checkout redirect + one webhook).
2. **Price** — working assumption **$4/mo (and ~$36/yr)**. Impulse-tier, undercuts
   Coolors Pro. Confirm.
3. **What Pro gates** — "decide later." Leading proposal (strongest "worth it"):
   - **Private palettes** (the headline gate)
   - **All 4 visual-layout mockups** (free gets the Cards mock only) + **mockup PNG download**
   - **Watermark removal** ("Made with UIshades" on `/p/` footer + exported PNGs)
   - **Raised save cap** (e.g. free 25 → Pro 300)
   - **Custom slugs / Featured-eligible**
   - Alternative thinner cut: **privacy only**. Decide which before wiring the gate.

---

## What already exists (the seams — do not rebuild)

| Hook | Location |
|---|---|
| `users.plan` (`'free'\|'pro'`, default `'free'`) + `users.plan_until` (epoch ms) | `migrations/0004_palettes.sql:8-9` |
| `isPro(user: Pick<User,'plan'\|'planUntil'>): boolean` | `src/lib/auth/db.ts:338` |
| `User.plan` / `User.planUntil`, `MeResponse.plan` | `src/lib/auth/types.ts` |
| **402/Pro seam** — `PATCH /api/palettes/[id]` rejects `visibility!=='public'` with `400 {error:'pro_required'}` | `src/pages/api/palettes/[id].ts:59-61` |
| **Inert Public·Private toggle** ("coming with Pro" caption, no-op) | `src/components/PaletteEditor.tsx` (`VisibilityToggle`, ~line 468) |
| `MockPreview` registry (gating point for free-vs-Pro mocks) | `src/components/mocks/`, `src/components/MockPreview.tsx` |

`isPro` is exported and tested but **called nowhere user-facing yet** — it's the
single function the gate plugs into.

---

## What needs to be built

### 1. Data model — `migrations/0005_billing.sql`

```sql
-- Provider customer/subscription linkage (only the webhook writes plan/plan_until).
ALTER TABLE users ADD COLUMN billing_customer_id TEXT;   -- provider customer id
ALTER TABLE users ADD COLUMN billing_subscription_id TEXT;
CREATE INDEX idx_users_billing_customer ON users(billing_customer_id);
```

`plan` / `plan_until` already exist — the webhook just updates them. Keep the
webhook as the **only** writer of `plan`/`plan_until` so client state can never
forge Pro.

### 2. Secrets — `src/worker-env.d.ts` + `wrangler secret put`

Add (provider-dependent), e.g. for Stripe:
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`,
`STRIPE_PRICE_ID_YEARLY`. For Lemon Squeezy: `LEMONSQUEEZY_API_KEY`,
`LEMONSQUEEZY_WEBHOOK_SECRET`, `LEMONSQUEEZY_STORE_ID`, variant ids.
Declare them in `src/worker-env.d.ts` (they're not in `wrangler.toml`, like the
existing OAuth/Brevo secrets) and add to `.dev.vars` for local.

### 3. Checkout — `src/pages/api/billing/checkout.ts`

`POST`, `withUser`. Creates a **hosted checkout session** (Stripe Checkout /
Lemon Squeezy checkout) for the signed-in user, passing `user.id` as
client-reference/custom data so the webhook can map payment → user. Returns the
redirect URL; the client `window.location =` it. **Prefer hosted checkout** (no
card fields on-site → no PCI scope, and **no CSP change for card JS**).

### 4. Webhook — `src/pages/api/billing/webhook.ts`

`POST`, **not** `withUser` (provider-authenticated). Steps:
- Verify the signature (`STRIPE_WEBHOOK_SECRET` / LS signing secret) — reject unsigned.
- On subscription created/active/renewed → set `users.plan='pro'`,
  `plan_until = current_period_end_ms`, store `billing_customer_id`/`subscription_id`.
- On cancel/expire/payment_failed (past grace) → `plan='free'` (keep `plan_until`
  so access lasts until period end). **Downgrade never publishes private palettes**
  — they stay private-but-hidden with a reactivation banner.
- Idempotent (handle duplicate deliveries).
- **CSRF**: this is a cross-origin POST. Astro's `checkOrigin` / the middleware
  CSRF gate must **exempt** `/api/billing/webhook` (it's signature-verified instead).
  See `src/lib/auth/csrf.ts` (`CSRF_PROTECTED_PREFIXES`) and `src/middleware.ts`.

### 5. Manage subscription

- **Stripe:** `POST /api/billing/portal` → Stripe Customer Portal URL (handles
  cancel/update card/invoices for free).
- **Lemon Squeezy / Paddle:** use their hosted customer portal link.

### 6. Wire the gates (flip the inert hooks "on")

- **Private palettes** — replace the placeholder in `src/pages/api/palettes/[id].ts:59-61`:
  allow `visibility='private'` when `isPro(user)`, else return **`402 {error:'pro_required'}`**
  (currently a 400 placeholder). Do the same on create (`src/pages/api/palettes.ts`)
  and `/api/palettes/[id]/publish` if/when added.
- **VisibilityToggle** (`PaletteEditor.tsx`) — when the user is free and selects
  Private, open an **`UpgradeSheet`** modal (reuse `HeaderAuth`'s modal primitives)
  headlined "Private palettes are part of Pro", one `Upgrade — $4/mo` button →
  `/api/billing/checkout`, and a "Keep it public" dismiss. Palette stays public
  until the webhook actually flips `plan`.
- **Mockups** — in `MockPreview`, gate the non-Cards templates + "Download mockup
  PNG" behind `isPro`; free users see a visible-but-locked chip (drives conversion).
  Plan state comes from `/api/me` (`MeResponse.plan`).
- **Watermark** — show "Made with UIshades" on `/p/[slug]` footer + exported PNGs
  unless the palette owner `isPro`.
- **Save cap** — bump the `MAX_PALETTES` check (`src/pages/api/palettes.ts`) to a
  higher limit when `isPro`.

### 7. CSP / middleware

- Hosted-checkout redirect needs **no** CSP change (full-page navigation).
- If you ever embed provider JS (Stripe.js elements), add the provider domains to
  `script-src` / `connect-src` / `frame-src` in **both** `src/middleware.ts` and
  `public/_headers`. Avoid this by using hosted checkout.
- The `Permissions-Policy` currently sets `payment=()` (disabled) in
  `src/middleware.ts` — only loosen if using the in-page Payment Request API.

### 8. UI surfacing

- `/api/me` already returns `plan` — `HeaderAuth` / dashboard can show a "Pro" badge
  and an "Upgrade" / "Manage subscription" entry. Add an account/settings area or a
  simple `/account` page for upgrade + portal links.

---

## Tier definition (proposed — confirm)

**Free (no login for the tool):** the whole single-color tool (`/[hex]`,
`/colors/*`) forever; signed-in: unlimited **public** palettes up to 25 saved,
full multi-color editor, share links, Explore + voting, the **Cards** mock.

**Pro (~$4/mo or ~$36/yr):** private palettes · all 4 mockups + PNG/custom-OG
download · 300-palette cap · no watermark · custom slug / Featured-eligible.

---

## Testing

- **Unit:** `isPro` boundaries (already tested) + webhook plan-sync logic (mock D1,
  like `tests/palettes-db.spec.ts`): created→pro, cancel→free-at-period-end,
  signature-reject.
- **e2e:** a free user selecting Private opens the UpgradeSheet (not an error); the
  PATCH/create endpoints return 402 for free + succeed for a seeded `plan='pro'`
  fixture user. Seed a pro user in `tests/fixtures/seed-e2e.sql`.
- **Manual:** provider **test mode** end-to-end — checkout → webhook flips `plan` →
  Private unlocks → cancel → reverts at period end. Verify the webhook is the only
  writer (can't forge Pro by hand-crafting a PATCH).

---

## Go-live checklist

1. Choose provider + create the product/prices (test mode first).
2. `0005_billing.sql` → `db:migrate:local`, then `db:migrate` (remote) at release.
3. Set secrets via `wrangler secret put` (and `.dev.vars`).
4. Implement checkout + webhook + portal; exempt the webhook from CSRF.
5. Flip the gates (402 seam, UpgradeSheet, mockups, watermark, cap).
6. Test in provider test mode end-to-end; then switch to live keys.
7. Add provider domains to CSP **only if** embedding their JS.
