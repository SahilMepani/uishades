// Capture LCP element + its computed font on each key page type.
// Run after `npm run preview` is live; pass the port via PREVIEW_PORT.
import { chromium } from 'playwright';

const PORT = process.env.PREVIEW_PORT ?? '4324';
const BASE = `http://localhost:${PORT}`;
const PAGES = ['/', '/4040ff', '/colors/coral'];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
});

for (const path of PAGES) {
  const page = await ctx.newPage();
  // Capture LCP entries as the browser reports them.
  await page.addInitScript(() => {
    window.__lcp = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__lcp.push({
          startTime: e.startTime,
          renderTime: e.renderTime,
          loadTime: e.loadTime,
          size: e.size,
          id: e.id,
          url: e.url,
          element: e.element,
        });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });

  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  // Give LCP one more tick; the spec stops updating after the first user input.
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const entries = window.__lcp ?? [];
    const last = entries[entries.length - 1];
    if (!last || !last.element) {
      return { count: entries.length, lcp: null };
    }
    const el = last.element;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      count: entries.length,
      finalLcpStartTime: last.startTime,
      tag: el.tagName.toLowerCase(),
      className: el.getAttribute('class') ?? '',
      text: (el.textContent ?? '').trim().slice(0, 120),
      box: { w: Math.round(rect.width), h: Math.round(rect.height) },
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight,
      fontSize: cs.fontSize,
      backgroundImage: cs.backgroundImage,
      isImg: el.tagName === 'IMG',
      isText: el.childNodes.length > 0 && Array.from(el.childNodes).some((n) => n.nodeType === 3),
    };
  });

  console.log(`\n=== ${path} ===`);
  console.log(JSON.stringify(result, null, 2));
  await page.close();
}

await browser.close();
