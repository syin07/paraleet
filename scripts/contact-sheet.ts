// Lays screenshots out on one sheet so a UI issue's final screenshots can be attached to its
// Linear issue as a single image (PRD section 13, merge gate for UI work).
//
//   npx tsx scripts/contact-sheet.ts <out.png> "<title>" <screenshots-dir> [name-prefix]
//
// It pairs `<name>-default.png` (1100x720) with `<name>-min.png` (860x580), one pair per row.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const [out, title, dir, prefix = ''] = process.argv.slice(2);
if (!out || !title || !dir) {
  console.error('Usage: npx tsx scripts/contact-sheet.ts <out.png> "<title>" <screenshots-dir> [name-prefix]');
  process.exit(1);
}

const names = [
  ...new Set(
    readdirSync(dir)
      .filter((file) => file.startsWith(prefix) && /-(default|min)\.png$/.test(file))
      .map((file) => file.replace(/-(default|min)\.png$/, '')),
  ),
].sort();
if (names.length === 0) {
  console.error(`No screenshots matching ${prefix}*-default.png in ${dir}`);
  process.exit(1);
}

function image(name: string, size: 'default' | 'min'): string {
  try {
    const data = readFileSync(resolve(dir, `${name}-${size}.png`)).toString('base64');
    return `<img src="data:image/png;base64,${data}" />`;
  } catch {
    return '<div class="missing">not captured</div>';
  }
}

const rows = names
  .map(
    (name) => `<section><h2>${name}</h2><div class="pair">
      <figure class="wide">${image(name, 'default')}<figcaption>1100 x 720</figcaption></figure>
      <figure class="narrow">${image(name, 'min')}<figcaption>860 x 580</figcaption></figure>
    </div></section>`,
  )
  .join('\n');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; padding: 24px; background: #111; color: #efefef; font: 13px -apple-system, sans-serif; width: 1180px; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  h2 { font: 12px ui-monospace, Menlo, monospace; color: #a8a8a8; margin: 20px 0 8px; }
  .pair { display: flex; gap: 12px; align-items: flex-start; }
  figure { margin: 0; }
  .wide { width: 660px; } .narrow { width: 508px; }
  img { width: 100%; display: block; border: 1px solid #3e3e3e; border-radius: 6px; }
  figcaption { color: #999; font-size: 11px; margin-top: 4px; }
  .missing { color: #999; border: 1px dashed #3e3e3e; border-radius: 6px; padding: 40px; text-align: center; }
</style></head><body><h1>${title}</h1>${rows}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1228, height: 800 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`${basename(out)}: ${names.length} screens`);
