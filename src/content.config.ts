import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Blog content collection - the owned content surface for launch posts and
 * SEO/GEO articles (the `/blog` route family). Markdown lives in
 * `src/content/blog/*.md`; each file's slug is its filename. Pages render
 * through `src/pages/blog/[slug].astro` (pre-rendered, like `/colors/*`).
 *
 * The autonomous content drafter (`marketing/agents/B-blog-drafter.md`) writes
 * drafts to `marketing/drafts/` for human review; an approved draft is moved
 * here with this front-matter shape.
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    // Absolute OG image URL. Defaults (in the page) to the seed-color card.
    ogImage: z.string().optional(),
    // Drafts are excluded from getStaticPaths and the index in PROD builds.
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
