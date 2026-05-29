# Structured-Data Audit — UIshades.com

**Date:** 2026-05-23
**Scope:** http://localhost:4321/ (home), /colors/coral (named-color page), /4040ff (hex page)
**Source files:** `src/pages/index.astro`, `src/pages/colors/[name].astro`, `src/pages/[hex].astro`
**Format detected:** JSON-LD only (no microdata, no RDFa, no Open Graph RDFa). All emitted via `safeJsonForScript()`.

---

## 1. Per-URL findings

### 1.1 `/` — Home page

**Type detected:** `WebApplication`

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "UIshades.com",
  "url": "https://UIshades.com/",
  "description": "Find tints and shades of any hex color, free. OKLCH ramps, Tailwind 11-stop scales, exports you can paste straight into your code.",
  "applicationCategory": "DesignApplication",
  "operatingSystem": "Any",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
}
```

**Validation (Schema.org `WebApplication` / `SoftwareApplication`):**
- Required: `name`  PRESENT, `offers`  PRESENT
- Google rich-result eligibility (`SoftwareApplication`) requires either `aggregateRating` OR `review` — **both missing** (this is why Search Console will not surface a rich result for the WebApplication entity).
- Recommended-but-missing: `image`, `screenshot`, `author`/`creator` (or `publisher`), `inLanguage`, `browserRequirements`, `featureList`, `softwareVersion`, `datePublished`, `dateModified`.

**Missing opportunities on this URL:**
- `WebSite` with `SearchAction` (the single biggest miss — gives Google the sitelinks search box for branded queries).
- `Organization` (or `Person`) as the `publisher`, referenced via `@id`.

---

### 1.2 `/colors/coral` — Named-color page

**Type detected:** `Thing`

```json
{
  "@context": "https://schema.org",
  "@type": "Thing",
  "name": "Coral",
  "alternateName": [],
  "description": "Coral is the warm pink-orange named after the living reef organism...",
  "url": "https://UIshades.com/colors/coral",
  "identifier": "#FF7F50",
  "color": "#ff7f50"
}
```

**Validation:**
- `Thing` is the abstract root. It is the weakest possible type and yields zero rich-result eligibility. `name`, `description`, `url` are present (all are recommended on Thing, none are strictly required).
- `color` is not a property of `Thing` — it is valid on `Product`, `ImageObject`, etc., but unknown on `Thing`. Today this is silently ignored by Schema.org consumers.
- `alternateName: []` — empty array adds no value; better omitted when empty.
- `og:type` is `article` but the JSON-LD is `Thing`. Mismatched semantics; pick one direction (recommend treating these as `CreativeWork`/`Article` because they have substantial original editorial blurbs).

**Missing opportunities on this URL:**
- Upgrade `Thing`  `CreativeWork` (or `Article`) — the blurb is hand-authored long-form editorial content.
- `BreadcrumbList` (Home  Named colors  Coral) — eligible for breadcrumb rich result.
- `ImageObject` for the OG endpoint `/og/ff7f50.png` referenced as `image`.
- `mainEntity` of type `Product`/`DefinedTerm` pointing to the actual color value, so search engines understand the page is *about* the color, distinct from being the color.

---

### 1.3 `/4040ff` — Arbitrary hex page (SSR)

**Type detected:** `Thing`

```json
{
  "@context": "https://schema.org",
  "@type": "Thing",
  "name": "Hex color #4040FF",
  "description": "Tints and shades of #4040FF. OKLCH ramp, 11-stop Tailwind scale, copy-ready exports.",
  "url": "https://UIshades.com/4040ff",
  "identifier": "#4040FF"
}
```

**Validation:**
- Same `Thing`-is-the-weakest-type problem as `/colors/coral`.
- No `image` despite the page having `og:image` set to a real, generated PNG at `/og/4040ff.png` — this is free schema data being thrown away.
- For named hexes (`findByHex` returns a hit), this page knows the color name but the JSON-LD doesn't use it.

**Missing opportunities on this URL:**
- Upgrade to `CreativeWork` with `mainEntity` referencing the color.
- `BreadcrumbList` (Home  #4040FF).
- `image` pointing to the OG endpoint with declared dimensions.
- Re-use `WebApplication` reference via `@id` so the tool entity is identified once and linked from every page.

---

### 1.4 Microdata / RDFa

None present on any sampled URL. The only `property="..."` attributes are Open Graph `<meta>` tags in `<head>`, which is the standard OG syntax (not RDFa). No action needed.

---

## 2. Cross-cutting opportunities (ranked by impact)

| # | Opportunity | Where to add | Impact |
|---|---|---|---|
| 1 | **`WebSite` + `SearchAction`** | `index.astro` (additional JSON-LD block) | Enables sitelinks search box for branded queries on Google. High ROI, one-time. |
| 2 | **`BreadcrumbList`** | `colors/[name].astro` and `[hex].astro` | Eligible for breadcrumb rich result; replaces the URL slug in SERPs with a clean trail. Per-page. |
| 3 | **Upgrade `Thing`  `CreativeWork`** on color pages | `colors/[name].astro`, `[hex].astro` | Activates `image`, `author`, `datePublished`, `keywords` properties that `Thing` ignores. Required before any rich-result eligibility. |
| 4 | **`Organization` with `@id`** | `index.astro` (additional block) | Lets every other JSON-LD reference `"publisher": { "@id": "https://UIshades.com/#org" }` without duplication. Foundation for E-E-A-T signaling. |
| 5 | **`SoftwareApplication` upgrade with `featureList` + `screenshot`** | `index.astro` (replace existing block) | Pushes the WebApplication entity toward rich-result eligibility once you add a public review/rating. |
| 6 | **`ImageObject` for `/og/[hex].png`** | Add via `image` on color pages | Improves image-search surfacing of OG cards; cheap to add. |
| 7 | **`CollectionPage` index** | Future `/colors/` index page (does not yet exist) | If/when a named-colors index ships, mark it as `CollectionPage` with `mainEntity` = `ItemList` of `CreativeWork` entries. |

**Explicitly excluded per hard constraints:**
- `HowTo` — deprecated for rich results by Google (Aug 2023).
- `FAQPage` — restricted to government/health sites (Aug 2023). Do not add even if the page has Q&A copy.

---

## 3. Ready-to-paste JSON-LD

All blocks below assume the project pattern: wrap the object literal in `safeJsonForScript()` and emit with `<script type="application/ld+json" set:html={...} />`.

### 3.1 `WebSite` + `SearchAction` + `Organization` (add to `src/pages/index.astro`)

These are two additional JSON-LD blocks for the home page (keep the existing `WebApplication` block — see 3.2 for an upgraded version).

```astro
---
// Add alongside the existing `jsonLd` constant in src/pages/index.astro
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': 'https://UIshades.com/#org',
  name: 'UIshades.com',
  url: 'https://UIshades.com/',
  logo: {
    '@type': 'ImageObject',
    url: 'https://UIshades.com/favicon.svg',
    width: 512,
    height: 512,
  },
  sameAs: [
    // Add any real social profiles here; omit the array if none exist.
  ],
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': 'https://UIshades.com/#website',
  url: 'https://UIshades.com/',
  name: 'UIshades.com',
  description: DESCRIPTION,
  inLanguage: 'en',
  publisher: { '@id': 'https://UIshades.com/#org' },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://UIshades.com/{search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
};
---

<script type="application/ld+json" set:html={safeJsonForScript(orgJsonLd)} />
<script type="application/ld+json" set:html={safeJsonForScript(websiteJsonLd)} />
```

> Note on `urlTemplate`: the home form already routes `/<hex>` and `/colors/<slug>` directly, so a bare `{search_term_string}` works for hex inputs. If you want Google to send all queries through a "search results" path instead, point it at a route like `/?hex={search_term_string}` and have the form handler accept that param.

### 3.2 Upgraded `SoftwareApplication` (replace existing block in `src/pages/index.astro`)

```astro
---
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': 'https://UIshades.com/#app',
  name: 'UIshades.com',
  url: 'https://UIshades.com/',
  description: DESCRIPTION,
  applicationCategory: 'DesignApplication',
  applicationSubCategory: 'Color Tool',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript. Modern evergreen browser.',
  inLanguage: 'en',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@id': 'https://UIshades.com/#org' },
  image: 'https://UIshades.com/og/777777.png',
  screenshot: 'https://UIshades.com/og/777777.png',
  featureList: [
    'OKLCH-anchored color ramps',
    'Classic RGB-walk shade algorithm',
    '11-stop Tailwind scale generation',
    'Exports for Tailwind v4 @theme, Tailwind v3 config, CSS variables, W3C Design Tokens, Figma Variables',
    'WCAG contrast badges on every shade',
    'Permanent shareable URL for every hex',
  ],
};
---
```

### 3.3 `CreativeWork` + `BreadcrumbList` + `ImageObject` (replace existing block in `src/pages/colors/[name].astro`)

```astro
---
// Replace the existing `jsonLd` block in src/pages/colors/[name].astro
const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://UIshades.com/',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Named colors',
      item: `https://UIshades.com/colors/${color.slug}`,
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: color.name,
      item: canonicalUrl,
    },
  ],
};

const colorPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CreativeWork',
  '@id': `${canonicalUrl}#article`,
  headline: `${color.name} (${color.hex.toUpperCase()}) — Tints, Shades & Palette`,
  name: color.name,
  alternateName: color.aliases && color.aliases.length > 0 ? color.aliases : undefined,
  description: plainBlurb,
  url: canonicalUrl,
  identifier: color.hex.toUpperCase(),
  inLanguage: 'en',
  isAccessibleForFree: true,
  isPartOf: { '@id': 'https://UIshades.com/#website' },
  publisher: { '@id': 'https://UIshades.com/#org' },
  image: {
    '@type': 'ImageObject',
    url: ogImage,
    width: 1200,
    height: 630,
    caption: `OG preview card for ${color.name} (${color.hex.toUpperCase()})`,
  },
  keywords: [
    color.name,
    color.hex.toUpperCase(),
    `${color.family} color`,
    'color shades',
    'color tints',
    'tailwind scale',
    'oklch ramp',
  ],
  about: {
    '@type': 'Thing',
    name: color.name,
    identifier: color.hex.toUpperCase(),
    sameAs: color.aliases ?? [],
  },
};
---

<script type="application/ld+json" set:html={safeJsonForScript(breadcrumbJsonLd)} />
<script type="application/ld+json" set:html={safeJsonForScript(colorPageJsonLd)} />
```

**Why this shape:**
- `CreativeWork` correctly types the hand-authored blurb as editorial content (matches the `og:type=article`).
- `about.Thing` preserves the "this page is *about* a color" semantic without trying to claim the page *is* a color.
- `isPartOf` + `publisher` reference the home page's `@id`s so the entity graph stays connected.
- `aliases` only appear when non-empty (avoids the empty-array smell from the current output).

### 3.4 `CreativeWork` + `BreadcrumbList` (replace existing block in `src/pages/[hex].astro`)

```astro
---
// Replace the existing `jsonLd` block in src/pages/[hex].astro
const breadcrumbItems = [
  {
    '@type': 'ListItem',
    position: 1,
    name: 'Home',
    item: 'https://UIshades.com/',
  },
  {
    '@type': 'ListItem',
    position: 2,
    name: hexLabel,
    item: canonicalUrl,
  },
];

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: breadcrumbItems,
};

const hexPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CreativeWork',
  '@id': `${canonicalUrl}#page`,
  headline: named
    ? `Hex Color ${hexLabel} (${named.name}) — Tints & Shades`
    : `Hex Color ${hexLabel} — Tints & Shades`,
  name: named?.name ?? `Hex color ${hexLabel}`,
  description: DESCRIPTION,
  url: canonicalUrl,
  identifier: hexLabel,
  inLanguage: 'en',
  isAccessibleForFree: true,
  isPartOf: { '@id': 'https://UIshades.com/#website' },
  publisher: { '@id': 'https://UIshades.com/#org' },
  image: {
    '@type': 'ImageObject',
    url: ogImage,
    width: 1200,
    height: 630,
    caption: `OG preview card for ${hexLabel}`,
  },
  about: {
    '@type': 'Thing',
    name: named?.name ?? hexLabel,
    identifier: hexLabel,
  },
};
---

<script type="application/ld+json" set:html={safeJsonForScript(breadcrumbJsonLd)} />
<script type="application/ld+json" set:html={safeJsonForScript(hexPageJsonLd)} />
```

---

## 4. Validation checklist after deploy

1. Run https://validator.schema.org/ against each of `/`, `/colors/coral`, `/4040ff`.
2. Run Google Rich Results Test (https://search.google.com/test/rich-results) on the same three URLs — confirm Breadcrumbs eligibility on color pages and Sitelinks Searchbox on the home page.
3. In Search Console, watch the *Enhancements* tab for the next 4–14 days; new Breadcrumb and Sitelinks Searchbox cards should appear.
4. Once you have any public reviews or ratings, add `aggregateRating` to the `SoftwareApplication` block — that unlocks the software app rich result.

---

## 5. Out-of-scope (not recommended)

- **`HowTo`** — Google deprecated rich results for `HowTo` in August 2023. Do not add even for "How to find shades of a color" copy.
- **`FAQPage`** — Restricted by Google to government and health sites (Aug 2023). Do not add even if FAQ-style copy exists on the page.
- **`Product`** — uishades is free, not a product for sale. Even with `price: 0` this misrepresents the entity. `SoftwareApplication` with an `Offer` (already done) is the correct shape.
