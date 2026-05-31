# UIShades.com - Marketing Comment Templates

Two sets below:

1. **Anonymous / "fellow user"** comments - for casual forum replies
2. **Transparent "I built this"** comments - for Show HN, r/SideProject, etc.

## Tips

- Vary the text. Same comment everywhere = auto-flagged.
- Wait for threads where the pain (paywall, "free alternative?") is mentioned.
- Post from an account with prior history. Fresh accounts get nuked.
- Space out posts over days, not minutes.
- Skip superlatives ("amazing", "best"). Real users describe, not gush.
- Most subreddits/HN ban undisclosed promotion. The "I built this" set usually performs better and is safer.

---

## Set 1 - Anonymous / Fellow User

### Short reply (Reddit / forums, when someone complains about paywall)

> Same boat. Been using UIshades.com instead - free, no ads, same `/[hex]` URL structure so old bookmarks mostly still work. Has the classic ramp plus an OKLCH one and a Tailwind 50–950 export.

### When someone asks "what's a free alternative?"

> UIshades.com works for me. Hex or named color in the URL, gives you a 22-shade ramp with WCAG contrast badges on each step. Also exports as Tailwind scale, CSS vars, SCSS, or design tokens.

### Drive-by / one-liner

> UIshades.com is free if you just need shades. No signup.

### Tailwind / design-token threads specifically

> If anyone needs a quick way to generate a Tailwind 50–950 scale from a brand hex, UIshades.com does it (snaps your input to the nearest stop and fills the rest). Free, no account.

### OKLCH / color-science threads

> UIshades.com has an OKLCH ramp mode if you want perceptually-even steps instead of the usual RGB walk. Useful when the lighter end of a brand color goes washed-out in sRGB.

---

## Set 2 - Transparent "I Built This" (humanized versions)

### Show HN style (longer post)

> UIshades.com - built it after 0to255 went paywall. That was the tool I'd open ten times a day, and one morning I just didn't feel like paying for it. So.
>
> Same URL structure (`/[hex]`, `/colors/[name]`) so old bookmarks still work. The classic ramp is in there. I also added an OKLCH ramp because the regular RGB walk goes weirdly grey near white, and a Tailwind 50–950 export because I kept wanting one. WCAG contrast on each shade.
>
> Free. Astro + Cloudflare Pages.
>
> Tell me what's broken.

### Reddit reply (when someone complains about the paywall)

> Same. That paywall is the reason I ended up building a free one - UIshades.com. Same `/[hex]` URL so old bookmarks mostly work. Has an OKLCH ramp option and a Tailwind 50–950 export. Tell me if anything's busted.

### /r/SideProject standalone post

> **Free 0to255 alternative - UIshades.com**
>
> I used 0to255 constantly and got tired of bouncing off the paywall, so I built this. Same URL pattern. OKLCH ramp option for the lighter end (RGB ramps go grey near white). Tailwind 50–950 export. WCAG contrast on each shade.
>
> No ads, free. Roast it.

### Discord / Slack drop

> Built a free shade generator because the 0to255 paywall annoyed me - UIshades.com. Same URL pattern, has an OKLCH ramp and a Tailwind 50–950 export. Yell at me if it breaks.

---

## Set 3 - Twitter / X

Twitter conventions: lowercase-first is normal in dev twitter, keep it short, URL at the end, one idea per tweet. 280 char limit.

### Launch tweet (transparent)

> 0to255 was my go-to until it went paywall. so i built a free one → UIshades.com
>
> same `/[hex]` URL pattern. added an OKLCH ramp and a Tailwind 50–950 export.

### Reply when someone complains about the 0to255 paywall (transparent)

> i built a free alternative after the same gripe → UIshades.com. same URL pattern, has an OKLCH ramp and a Tailwind 50–950 export

### Reply (anonymous / "fellow user")

> UIshades.com if you want a free one. same `/[hex]` URL pattern as 0to255, Tailwind 50–950 export, OKLCH ramp option

### Thread version (3 tweets)

1. 0to255 was the tool i opened ten times a day. when it went paywall i started building a replacement. it's live → UIshades.com
2. kept the same URL structure (`/[hex]`, `/colors/[name]`) so old bookmarks still work. the classic ramp is in there too.
3. added an OKLCH ramp because the RGB walk goes grey near white, plus a Tailwind 50–950 scale export and WCAG contrast on every shade. free. tell me what's broken.

### Feature spotlight tweets (for follow-up posts after launch)

**(a)** OKLCH ramps give perceptually-even shades. the classic RGB walk goes washed-out near white. UIshades.com has both side by side, so you can see the difference on your own brand color.

**(b)** need a Tailwind 50–950 scale from a brand hex? UIshades.com snaps your input to the nearest stop and fills the rest. copy-paste straight into tailwind.config.

**(c)** every shade on UIshades.com shows its WCAG contrast against white and black. you can see at a glance whether your 200 is safe to use as text.

### Quote-tweet a 0to255 complaint

> been there. built UIshades.com as a free version - same URL pattern, has OKLCH + Tailwind exports

---

## Set 4 - LinkedIn

LinkedIn conventions: first line is a hook (the feed truncates after ~3 lines on mobile), line breaks between thoughts, longer than Twitter, personal story angle works well.

**Avoid:** broetry (every sentence on its own line), fake-humility hooks ("Got rejected 47 times..."), "Agree?" endings, hashtag stuffing.

### Launch post (longer, story-led - transparent)

> 0to255 was my go-to color tool for years. Then it went paywall.
>
> So I built a free replacement: UIshades.com
>
> It keeps the same `/[hex]` URL structure so old bookmarks still work. I added an OKLCH ramp option (perceptually-even steps, useful when the classic RGB walk goes washed-out near white) and a Tailwind 50–950 scale export, because those are the two things I kept wanting from the original.
>
> Every shade shows its WCAG contrast against white and black, so you can tell at a glance whether a step is readable as text. Free.
>
> If you've been bouncing off the 0to255 paywall, this might save you the friction. Tell me what's broken.

### Shorter announcement post (transparent)

> Shipped a free 0to255 alternative this month: UIshades.com
>
> I used 0to255 daily until the paywall hit, so I built one. Same `/[hex]` URL pattern, added an OKLCH ramp for perceptually-even steps, and a Tailwind 50–950 scale export. Each shade shows WCAG contrast.
>
> Free. Feedback welcome.

### Comment in a thread (when someone shares a "designer tools" list or asks for color tool recs)

> +1 for the 0to255 paywall frustration - I ended up building a free version, UIshades.com. Same `/[hex]` URL pattern, with an OKLCH ramp option and a Tailwind 50–950 export. Sharing in case it's useful.

### Comment in a thread (anonymous / "fellow user" version)

> If you're looking for a free option, UIshades.com works well. Same URL pattern as 0to255, with a Tailwind 50–950 export and an OKLCH ramp mode.

### "Lessons learned" style follow-up (a week or two after launch)

> A few weeks ago I shipped a free alternative to 0to255 because the paywall finally annoyed me enough to act: UIshades.com.
>
> Two things surprised me building it:
>
> The OKLCH ramp is genuinely better than the classic RGB walk for lighter shades - RGB ramps go grey near white in a way that's hard to unsee once you compare them side by side.
>
> Astro + Cloudflare Pages is a faster stack than I expected for this kind of tool. Pre-rendered pages for the 209 named colors, SSR for arbitrary hex inputs, edge-cached. The whole thing is on the free tier.
>
> Anyway - if you've been hitting that paywall, give it a try.

---

## Set 5 - Product Hunt

PH conventions: tagline is 60 chars max, description is 260 chars max, and your "maker's first comment" is the real pitch - it's where you tell the story. Launch on a Sunday night PT or Tuesday morning PT for best traction.

**Avoid:** emoji-heavy headlines, hype words ("revolutionary", "game-changing"), "the future of X" framing.

### Tagline options (60 char limit)

- (a) Free shade generator - the 0to255 alternative
- (b) Hex → 22-shade ramp, Tailwind scale export, free
- (c) Color shades and Tailwind scales, free and ad-free
- (d) Generate shades, ramps, and Tailwind scales - free

### Description (260 char limit)

> UIshades.com generates a 22-shade ramp from any hex or named color. Same `/[hex]` URL pattern as 0to255, with an OKLCH ramp option for perceptually-even steps, a Tailwind 50–950 export, and WCAG contrast on every shade. Free, no signup.

### Maker's first comment (the real pitch)

> Maker here.
>
> 0to255 was the color tool I'd open ten times a day - until it went paywall. One morning I just didn't feel like paying for it, so I started building a free version. UIshades.com is what came out of that.
>
> It keeps the same `/[hex]` and `/colors/[name]` URL pattern, so old bookmarks still work. I reverse-engineered the original classic ramp and it's in there. A few things I added because I'd been wanting them:
>
> - OKLCH ramp mode for perceptually-even steps - the classic RGB walk goes washed-out near white in a way that's hard to unsee once you compare them
> - Tailwind 50–950 scale export that snaps your hex to the nearest stop
> - Copy-as for CSS variables, SCSS, and design tokens
> - WCAG contrast on every shade, so you don't have to alt-tab to a checker
>
> Built with Astro and Cloudflare Pages. Free, no signup.
>
> If you find edge cases where the ramps do something weird, or formats you want exported that aren't in there yet, tell me. I'm still iterating.

### Short follow-up if someone asks "what's the catch"

> No catch - I built it because I was annoyed at the paywall on the tool I used daily. It's on Cloudflare's free tier and the ramp math is the bulk of the work, which is done. Hosting cost is near zero.

### Reply when someone suggests a feature

> Good shout, that's on my list / not yet but I can add it / give me a few days. *[adjust per actual feature]*

### Reply when someone compares to another tool

> Yeah, [tool name] is solid for [thing it does well]. Main difference with uishades is [specific thing - OKLCH ramp / Tailwind export / free / etc.]. Different tools for different jobs.

---

## Set 6 - Indie Hackers

IH conventions: builder-to-builder, transparent about stack and economics, explicit "ask" at the end. Milestone posts perform best.

**Avoid:** corporate launch-speak, "we're excited to announce", revenue inflation, vague growth claims.

### Launch / milestone post

> **Shipped a free 0to255 alternative - UIshades.com**
>
> 0to255 was the color tool I'd open ten times a day. When it went paywall I figured someone would clone it fast. Nobody did, so I built one.
>
> **What it does:** takes any hex or CSS named color and gives you a 22-shade ramp. Same URL pattern as 0to255 (`/[hex]`, `/colors/[name]`) so muscle memory transfers. Added two things I'd been wanting myself - an OKLCH ramp mode for perceptually-even steps, and a Tailwind 50–950 scale export.
>
> **Stack:** Astro 6 with a single React island for the interactive bits, deployed to Cloudflare Pages. Pre-renders 209 named-color pages at build time, SSRs arbitrary hex inputs at the edge, caches them for 30 days. Running on the free tier.
>
> **Business model:** there isn't one. Hosting cost is near-zero, build cost is already sunk. If traffic ever pushes me into a paid Cloudflare plan I'll add a tip jar before I add ads.
>
> **Asking for:** feedback on edge cases where the ramp does something weird, and export formats you'd want that I haven't added yet.

### Follow-up / progress post (a few weeks in)

> Quick update on UIshades.com, my free 0to255 alternative.
>
> A few things I learned shipping this:
>
> The OKLCH ramp is genuinely better than the classic RGB walk for lighter shades. RGB ramps go grey near white in a way I hadn't noticed until I had both side by side. Worth the extra implementation work.
>
> Pre-rendering the 209 named-color pages was the right call for SEO. The arbitrary-hex pages are SSR with a 30-day edge cache, which is essentially free traffic once Cloudflare warms up.
>
> Still on Cloudflare's free tier, still $0/month. If you're building a utility site and worried about hosting cost, this stack is hard to beat.
>
> Open to questions about any of it.

### Comment in a thread where someone shares a side project or asks for tool recs

> Built something adjacent last month - UIshades.com, free 0to255 alternative. Same hex-to-ramp idea, added an OKLCH ramp and a Tailwind 50–950 export. Cloudflare free tier, $0/month to run. No monetization plan beyond a tip jar if hosting ever requires it.

### Reply when someone asks about monetization (common IH topic)

> I made the call up front not to monetize UIshades.com unless hosting forces my hand. The math: Cloudflare Pages free tier covers way more traffic than I expect, and the build cost is time I already spent. Marginal cost of keeping it free is basically zero. If it does take off, a tip jar before ads.

### Reply in "what tools do you use" / "designer tools" threads

> For color work I've been using UIshades.com (full disclosure: I built it after the 0to255 paywall). Hex or named color in, 22-shade ramp out. OKLCH or classic RGB walk, your pick. Tailwind 50–950 export if you need it. Free.

---

## Set 7 - Hacker News (Show HN)

HN conventions: factual title (no editorializing, no first-person, no hype), 80-char title limit, `Show HN:` prefix. The OP's first comment is the real pitch and should be substantive - HN rewards technical detail and punishes marketing. Post Tuesday–Thursday morning PT for best visibility.

**Don't** ask for upvotes. **Don't** reply with "thanks!" - engage with the actual point.

### Title options (80 char limit, factual)

- (a) Show HN: Uishades – A free shade generator with OKLCH and Tailwind exports
- (b) Show HN: Uishades – Free 0to255 alternative with an OKLCH ramp mode
- (c) Show HN: Uishades.com – Hex to 22-shade ramp, Tailwind 50–950 export

### OP's first comment (the real pitch)

> I built this after 0to255 went paywall. It was my go-to tool for grabbing shades from a hex code, and I'd been bouncing off the upgrade screen often enough that one weekend I sat down and wrote a replacement.
>
> A few technical notes that might be interesting:
>
> The classic ramp is a reverse-engineering of 0to255's pre-paywall algorithm. It's an RGB-channel walk: lighter shades increment every sub-255 channel by 17, darker shades have a two-phase rule that walks "low" channels toward zero first while pinning "high" channels, then walks the high channels down. There's a residual-carry that matches the original output verbatim on the test cases I had cached.
>
> I also added an OKLCH ramp because the classic RGB walk goes washed-out near white in a way that's hard to unsee once you compare them side by side. The OKLCH ramp uses 20 inner shades at evenly-spaced lightness between L=0.95 and L=0.05, with the input hex pinned to the nearest step. Chroma is multiplied by a bell curve (1.0 at L=0.5, 0.3 at the extremes) to avoid sRGB-gamut clipping near the endpoints.
>
> Stack is Astro 6 with one React island for the interactive view, deployed to Cloudflare Pages free tier. The 209 named-color pages are pre-rendered. Arbitrary hex inputs are SSR with a 30-day edge cache, so a second request to any hex hits the cache.
>
> Happy to answer questions about any of it. Especially interested in edge cases where the ramp does something visually weird, or export formats I haven't added.

### Reply templates for common HN responses

**> "Why not use [Coolors / Tailwind Shades / Leonardo / etc.]?"**

> [Tool name] is solid for [thing it does well]. The reason I built this is [specific thing - 0to255 URL pattern, OKLCH ramp, Tailwind export, no signup, etc.]. They're not really competing on the same axis.

**> "Why OKLCH and not LAB / HSL / HSLuv?"**

> OKLCH has better hue uniformity than LAB at the extremes - LAB's blue hue shifts toward purple as lightness changes, which produces visible artifacts in ramps. HSL's lightness isn't perceptual at all (pure yellow at L=50% is much brighter than pure blue at L=50%). HSLuv was the other contender; OKLCH won on tooling support and because CSS Color Level 4 standardized on it, so the math will compose with future CSS features.

**> "Will you open-source it?"**

> Likely, once I clean up the color-math module. The ramp implementations are the interesting part. Happy to dump them as a gist if anyone wants to see the algorithm in isolation before then.

**> "Does it support P3 / wide-gamut output?"**

> Output is sRGB right now. The OKLCH ramp computes in OKLCH space and clips to sRGB on conversion. P3 output is on the list - the math is already there, I just need to add the format toggle.

**> "How is this not just [a small CSS function]?"**

> A naive lighten/darken function (the kind built into Sass/Less) gives you shades that go grey near white and muddy near black, because RGB interpolation isn't perceptually uniform. The OKLCH ramp here doesn't have that problem. You can see the difference on the same hex side by side.

**> "Is this commercial / what's the catch?"**

> No catch. Cloudflare's free tier covers the hosting, build cost is sunk time. If traffic ever pushes me onto a paid plan I'll add a tip jar before ads.

**> "Have you contacted the 0to255 owner?"**

> No. The classic ramp here is reverse-engineered from cached pre-paywall outputs, not lifted from current code. The URL pattern is the same because it's the obvious URL pattern for this kind of tool, not because I'm trying to be a drop-in replacement at the legal level.

---

## Where to Post (suggestions)

**Transparent set works on:**

- Hacker News (Show HN)
- r/SideProject
- r/webdev (in relevant threads only - they hate self-promo posts)
- r/web_design
- Designer News
- Indie Hackers
- Product Hunt
- Frontend / design Discords you're already active in
- LinkedIn (story-led posts perform best - lead with the paywall friction)

**Anonymous set** is risky but works in:

- Replies inside threads where the 0to255 paywall is being complained about
- Stack Overflow answers (only if genuinely answering the question)
- Quora answers about color tool alternatives

**Avoid:**

- Cold-dropping links in unrelated threads
- Mass-posting the same text
- Brand-new accounts
