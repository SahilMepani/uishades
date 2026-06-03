#!/usr/bin/env node
// SEO/GEO audit for UIshades. Two halves:
//   STATIC  — read repo files, no server needed (digests, dev guards, sitemap, ld+json safety, host casing)
//   HTTP    — hit a running preview build (titles/canonicals, markdown negotiation, @id graph, dev 404, Link header)
//
// Usage:
//   node audit.mjs                         # static checks only
//   node audit.mjs --base-url http://127.0.0.1:4321   # static + HTTP
//   node audit.mjs --repo /path/to/uishades --base-url http://127.0.0.1:4321
//
// Exit code is non-zero if any HARD check fails. WARN/INFO never fail the run.
// HTTP checks must run against `npm run preview` (the built site) — `astro dev`
// does NOT serve the prod /dev 404 or the public/_headers Link header.

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const REPO = getArg('--repo', process.cwd());
const BASE = getArg('--base-url', null); // null => skip HTTP half
const rel = (p) => join(REPO, p);

const results = []; // {level: PASS|FAIL|WARN|INFO, check, detail}
const add = (level, check, detail) => results.push({ level, check, detail });
const read = (p) => (existsSync(rel(p)) ? readFileSync(rel(p), 'utf8') : null);

// ───────────────────────── STATIC ─────────────────────────

// S1 — agent-skill SKILL.md digests match index.json (rehash-on-edit invariant)
function checkDigests() {
  const idxRaw = read('public/.well-known/agent-skills/index.json');
  if (!idxRaw) return add('WARN', 'skill-digests', 'index.json not found — skipping');
  let idx;
  try { idx = JSON.parse(idxRaw); } catch (e) { return add('FAIL', 'skill-digests', `index.json invalid JSON: ${e.message}`); }
  const skills = idx.skills ?? idx.entries ?? [];
  if (!skills.length) return add('WARN', 'skill-digests', 'no skills array in index.json');
  for (const s of skills) {
    const url = s.url ?? s.href ?? '';
    const declared = (s.digest ?? '').replace(/^sha256:/, '');
    const fsPath = url.replace(/^\//, 'public/').replace(/^public\.well-known/, 'public/.well-known');
    const local = url.startsWith('/.well-known') ? 'public' + url : url;
    const body = read(local);
    if (body == null) { add('FAIL', 'skill-digests', `${s.id ?? url}: file missing at ${local}`); continue; }
    const actual = createHash('sha256').update(body).digest('hex');
    if (actual === declared) add('PASS', 'skill-digests', `${s.id ?? url}: digest matches`);
    else add('FAIL', 'skill-digests', `${s.id ?? url}: digest DRIFT — index.json says sha256:${declared}, file hashes to sha256:${actual}. Rehash and update index.json.`);
  }
}

// S2 — dev page is guarded. The prod 404 only actually fires if the page is
// SSR (`prerender = false`); otherwise it prerenders to a static dev/tool.html
// that Cloudflare's asset layer serves with 200. Both conditions matter.
function checkDevGuards() {
  const dev = read('src/pages/dev/tool.astro');
  if (!dev) return add('WARN', 'dev-guards', 'src/pages/dev/tool.astro not found');
  const prod404 = /import\.meta\.env\.PROD/.test(dev) && /404|status:\s*404/.test(dev);
  const ssr = /export\s+const\s+prerender\s*=\s*false/.test(dev);
  const noindex = /name=["']robots["']\s+content=["'][^"']*noindex/.test(dev);
  add(prod404 ? 'PASS' : 'FAIL', 'dev-prod-404', prod404 ? 'tool.astro returns 404 in PROD' : 'tool.astro missing PROD 404 guard');
  add(ssr ? 'PASS' : 'FAIL', 'dev-ssr', ssr
    ? 'tool.astro is SSR (prerender = false) so the PROD 404 guard runs'
    : 'tool.astro lacks `export const prerender = false` — it prerenders to a static dev/tool.html and the PROD 404 guard is dead code (served 200 in prod)');
  add(noindex ? 'PASS' : 'FAIL', 'dev-noindex', noindex ? 'tool.astro carries noindex' : 'tool.astro missing noindex meta');
}

// S2b — authoritative build-output check: after `npm run build`, NO static
// dev/tool.html must exist under dist/client. Its presence means Cloudflare
// serves the page (200) regardless of the runtime guard. This predicts
// production far more reliably than hitting `astro preview`, which does not
// faithfully run the worker's SSR 404 for this route.
function checkDevBuildOutput() {
  const distDir = rel('dist/client');
  if (!existsSync(distDir)) return add('INFO', 'dev-build-output', 'dist/client not found — run `npm run build` first to verify dev/tool is not emitted as a static asset');
  const leaked = existsSync(rel('dist/client/dev/tool.html'));
  add(leaked ? 'FAIL' : 'PASS', 'dev-build-output', leaked
    ? 'dist/client/dev/tool.html WAS emitted — it will be served 200 in production. Add `export const prerender = false` to src/pages/dev/tool.astro and rebuild.'
    : 'no static dev/tool.html emitted — dev page falls through to the worker (404) in production');
}

// S3 — sitemap excludes /dev and injects SSR-only customPages
function checkSitemap() {
  const cfg = read('astro.config.mjs');
  if (!cfg) return add('WARN', 'sitemap', 'astro.config.mjs not found');
  const excludesDev = /filter:\s*\([^)]*\)\s*=>[^,}]*\/dev\//.test(cfg) || /!\s*page\.includes\(['"]\/dev\//.test(cfg);
  const injectsHome = /customPages/.test(cfg) && /POPULAR_HEXES/.test(cfg);
  add(excludesDev ? 'PASS' : 'FAIL', 'sitemap-dev-excluded', excludesDev ? '/dev/* filtered out of sitemap' : 'sitemap filter does not exclude /dev/*');
  add(injectsHome ? 'PASS' : 'WARN', 'sitemap-custompages', injectsHome ? 'customPages injects POPULAR_HEXES' : 'customPages/POPULAR_HEXES injection not detected');
}

// S4 — every inline ld+json goes through safeJsonForScript
function checkJsonLdSafety() {
  const pages = ['src/pages/index.astro', 'src/pages/[hex].astro', 'src/pages/colors/[name].astro', 'src/pages/colors/index.astro', 'src/pages/explore/index.astro', 'src/pages/p/[slug].astro'];
  let bad = 0, total = 0;
  for (const p of pages) {
    const src = read(p);
    if (!src) continue;
    const blocks = src.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/g) ?? [];
    for (const b of blocks) {
      total++;
      if (!/safeJsonForScript/.test(b)) { bad++; add('FAIL', 'jsonld-safe-encode', `${p}: ld+json block not wrapped in safeJsonForScript: ${b.trim().slice(0, 80)}`); }
    }
  }
  if (total && !bad) add('PASS', 'jsonld-safe-encode', `all ${total} inline ld+json blocks use safeJsonForScript`);
  if (!total) add('INFO', 'jsonld-safe-encode', 'no inline ld+json blocks found in scanned pages');
}

// S5 — host casing consistency (cosmetic but worth a single canonical choice)
function checkHostCasing() {
  const sources = {
    'astro.config.mjs site': read('astro.config.mjs'),
    'index.astro JSON-LD/canonical': read('src/pages/index.astro'),
    '_headers': read('public/_headers'),
    'api-catalog': read('public/.well-known/api-catalog'),
    'robots.txt': read('public/robots.txt'),
  };
  const seen = new Set();
  for (const [, body] of Object.entries(sources)) {
    if (!body) continue;
    for (const m of body.matchAll(/https?:\/\/(uishades\.com|UIshades\.com)/g)) seen.add(m[1]);
  }
  if (seen.size > 1) add('WARN', 'host-casing', `mixed host casing across files: ${[...seen].join(' vs ')} — hosts are case-insensitive, but standardize one for consistency`);
  else if (seen.size === 1) add('PASS', 'host-casing', `host casing consistent (${[...seen][0]})`);
}

// ───────────────────────── HTTP ─────────────────────────

async function fetchSafe(url, opts) {
  try { return await fetch(url, { redirect: 'manual', ...opts }); }
  catch (e) { add('FAIL', 'http-reachable', `${url}: ${e.message} — is \`npm run preview\` running at ${BASE}?`); return null; }
}

function countTag(html, re) { return (html.match(re) ?? []).length; }

// H1 — HTML head essentials on each route shape
async function checkHtmlHead(path, label) {
  const res = await fetchSafe(BASE + path, { headers: { Accept: 'text/html' } });
  if (!res) return null;
  if (res.status !== 200) { add('FAIL', `head:${label}`, `${path} returned ${res.status}`); return null; }
  const html = await res.text();
  const titles = countTag(html, /<title>[^<]+<\/title>/g);
  const canon = countTag(html, /<link[^>]+rel=["']canonical["'][^>]*>/g);
  const desc = countTag(html, /<meta[^>]+name=["']description["'][^>]*>/g);
  add(titles === 1 ? 'PASS' : 'FAIL', `head:${label}:title`, `${titles} <title> tag(s)`);
  add(canon === 1 ? 'PASS' : 'FAIL', `head:${label}:canonical`, `${canon} canonical link(s)`);
  add(desc === 1 ? 'PASS' : 'FAIL', `head:${label}:description`, `${desc} meta description(s)`);
  const og = /property=["']og:title["']/.test(html) && /property=["']og:image["']/.test(html);
  add(og ? 'PASS' : 'WARN', `head:${label}:og`, og ? 'og:title + og:image present' : 'missing og:title or og:image');
  return html;
}

// H2 — extract ld+json, parse, and resolve the @id graph across pages
function extractJsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)) {
    const raw = m[1].trim();
    try { out.push({ ok: true, json: JSON.parse(raw) }); }
    catch (e) { out.push({ ok: false, err: e.message, raw: raw.slice(0, 120) }); }
  }
  return out;
}
function walkIds(node, defined, referenced) {
  if (Array.isArray(node)) { node.forEach((n) => walkIds(n, defined, referenced)); return; }
  if (node && typeof node === 'object') {
    if (node['@id']) {
      const keys = Object.keys(node).filter((k) => k !== '@context');
      if (keys.length === 1 && keys[0] === '@id') referenced.add(node['@id']); // pure ref
      else defined.add(node['@id']);
    }
    for (const v of Object.values(node)) walkIds(v, defined, referenced);
  }
}

// H3 — markdown content negotiation (only / and /[hex])
async function checkMarkdownNegotiation(path, label) {
  const res = await fetchSafe(BASE + path, { headers: { Accept: 'text/markdown' } });
  if (!res) return;
  const ct = res.headers.get('content-type') ?? '';
  const vary = res.headers.get('vary') ?? '';
  const cc = res.headers.get('cache-control') ?? '';
  const isMd = ct.includes('text/markdown');
  const variesAccept = /accept/i.test(vary);
  add(isMd ? 'PASS' : 'FAIL', `md:${label}:content-type`, `${path} Accept:text/markdown → content-type "${ct || '(none)'}"`);
  add(variesAccept ? 'PASS' : 'FAIL', `md:${label}:vary`, `Vary: "${vary || '(none)'}" ${variesAccept ? '' : '— MUST include Accept or the edge serves one variant to everyone'}`);
  add(/s-maxage/.test(cc) ? 'PASS' : 'WARN', `md:${label}:cache`, `Cache-Control: "${cc || '(none)'}"`);
  if (isMd) {
    const body = await res.text();
    const looksMd = /\|.*\|/.test(body) || /^#/m.test(body);
    add(looksMd ? 'PASS' : 'WARN', `md:${label}:body`, looksMd ? 'body looks like markdown' : 'body does not look like markdown (got HTML?)');
  }
}

// H4 — /dev/* status. CAVEAT: `astro preview` does NOT faithfully run the
// Cloudflare worker's SSR 404 for this route — it re-renders the page with
// PROD effectively false, so a 200 here is INCONCLUSIVE. Trust `dev-build-output`
// (static) for the real verdict; only a 200 from the *live deploy* is a true FAIL.
async function checkDev404() {
  const res = await fetchSafe(BASE + '/dev/tool', { headers: { Accept: 'text/html' } });
  if (!res) return;
  const isLocal = /127\.0\.0\.1|localhost/.test(BASE);
  if (res.status === 404) return add('PASS', 'dev-404-live', '/dev/tool returns 404');
  add(isLocal ? 'WARN' : 'FAIL', 'dev-404-live', isLocal
    ? `/dev/tool returned ${res.status} against a LOCAL preview — inconclusive: \`astro preview\` does not run the worker's SSR 404 faithfully. Rely on the dev-build-output check; to confirm prod, \`curl -sI https://uishades.com/dev/tool\`.`
    : `/dev/tool returned ${res.status} on a remote deploy — the dev tool is publicly reachable. Add \`export const prerender = false\` to src/pages/dev/tool.astro and redeploy.`);
}

// H5 — agent-discovery Link header
async function checkLinkHeader() {
  const res = await fetchSafe(BASE + '/', { headers: { Accept: 'text/html' } });
  if (!res) return;
  const link = res.headers.get('link') ?? '';
  const ok = /api-catalog/.test(link) && /llms\.txt/.test(link);
  add(ok ? 'PASS' : 'WARN', 'link-header', ok ? 'Link advertises api-catalog + llms.txt' : `Link header: "${link || '(none)'}" — note: static pages get this from public/_headers, only served by the built preview`);
}

async function runHttp() {
  const homeHtml = await checkHtmlHead('/', 'home');
  const hexHtml = await checkHtmlHead('/4040ff', 'hex');
  const namedHtml = await checkHtmlHead('/colors/coral', 'named');

  // @id graph across all three pages combined
  const defined = new Set(), referenced = new Set();
  let parseErr = 0;
  for (const [html, label] of [[homeHtml, 'home'], [hexHtml, 'hex'], [namedHtml, 'named']]) {
    if (!html) continue;
    for (const b of extractJsonLd(html)) {
      if (!b.ok) { parseErr++; add('FAIL', `jsonld-parse:${label}`, `unparseable ld+json: ${b.err} — "${b.raw}"`); }
      else walkIds(b.json, defined, referenced);
    }
  }
  if (!parseErr && (defined.size || referenced.size)) add('PASS', 'jsonld-parse', `all ld+json blocks parsed (${defined.size} @id defined, ${referenced.size} referenced)`);
  const dangling = [...referenced].filter((id) => !defined.has(id));
  add(dangling.length === 0 ? 'PASS' : 'FAIL', 'jsonld-id-graph', dangling.length === 0
    ? `every referenced @id resolves to a definition (${[...defined].join(', ') || 'none'})`
    : `dangling @id reference(s) not defined anywhere on /, /[hex], /colors/*: ${dangling.join(', ')} — the homepage must define #org/#website/#app`);

  await checkMarkdownNegotiation('/', 'home');
  await checkMarkdownNegotiation('/4040ff', 'hex');
  // /colors/* is prerendered: assert it does NOT pretend to negotiate
  const named = await fetchSafe(BASE + '/colors/coral', { headers: { Accept: 'text/markdown' } });
  if (named) add(!(named.headers.get('content-type') ?? '').includes('text/markdown') ? 'PASS' : 'INFO', 'md:named:expected-html', '/colors/coral does not negotiate markdown (prerendered) — expected');

  await checkDev404();
  await checkLinkHeader();
}

// ───────────────────────── run + report ─────────────────────────

checkDigests();
checkDevGuards();
checkDevBuildOutput();
checkSitemap();
checkJsonLdSafety();
checkHostCasing();
if (BASE) await runHttp();
else add('INFO', 'http', 'no --base-url given — HTTP checks skipped. Run `npm run build && npm run preview`, then re-run with --base-url http://127.0.0.1:4321');

const order = { FAIL: 0, WARN: 1, INFO: 2, PASS: 3 };
results.sort((a, b) => order[a.level] - order[b.level] || a.check.localeCompare(b.check));
const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️ ', INFO: 'ℹ️ ' };
console.log('\n=== UIshades SEO/GEO audit ===');
console.log(`repo: ${REPO}`);
console.log(`http: ${BASE ?? '(skipped — static checks only)'}\n`);
for (const r of results) console.log(`${icon[r.level]} [${r.check}] ${r.detail}`);
const fails = results.filter((r) => r.level === 'FAIL').length;
const warns = results.filter((r) => r.level === 'WARN').length;
console.log(`\n${fails} fail · ${warns} warn · ${results.filter((r) => r.level === 'PASS').length} pass`);
process.exit(fails ? 1 : 0);
