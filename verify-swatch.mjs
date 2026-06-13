import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });

// Add a color to the palette to reveal the preview band.
const addBtn = page.getByRole('button', { name: /Add to palette/i }).first();
await addBtn.click();
await page.waitForTimeout(400);

const band = page.locator('ul[aria-label="Palette preview"]');
await band.waitFor({ state: 'visible', timeout: 5000 });
const swatches = band.locator('li');
const n = await swatches.count();
console.log('swatch count:', n);

// Click the first swatch's trigger.
const firstTrigger = swatches.first().getByRole('button').first();
const tlabel = await firstTrigger.getAttribute('aria-label');
console.log('first trigger aria-label:', tlabel);
const sb = await swatches.first().boundingBox();
await firstTrigger.click();
await page.waitForTimeout(300);

const dialog = page.getByRole('dialog', { name: /Color picker/i });
const visible = await dialog.isVisible().catch(() => false);
console.log('picker dialog visible after click:', visible);
if (visible) {
  const db = await dialog.boundingBox();
  console.log('swatch box:', sb && {x:Math.round(sb.x),y:Math.round(sb.y),w:Math.round(sb.width),h:Math.round(sb.height)});
  console.log('dialog box:', db && {x:Math.round(db.x),y:Math.round(db.y),w:Math.round(db.width),h:Math.round(db.height)});
  // Is the dialog near (below) the swatch?
  if (sb && db) {
    console.log('dialog below swatch bottom?', db.y >= sb.y + sb.height - 5);
    console.log('horizontally overlapping swatch?', db.x < sb.x + sb.width && db.x + db.width > sb.x);
  }
}
await page.screenshot({ path: '/tmp/swatch-open.png' });
console.log('screenshot saved');
await browser.close();
