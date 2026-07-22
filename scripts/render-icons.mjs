// Rasteriserer public/logo.svg til PNG-app-ikoner via Chromium (Playwright).
// Kør: node scripts/render-icons.mjs
import { readFileSync } from 'fs';
import { chromium } from 'playwright';

const svg = readFileSync(new URL('../public/logo.svg', import.meta.url), 'utf8');
const outDir = new URL('../public/', import.meta.url);

// [filnavn, px, transparent baggrund?]
const targets = [
  ['favicon-32.png', 32, true],
  ['favicon-16.png', 16, true],
  ['apple-touch-icon.png', 180, false], // iOS vil ikke have transparens
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
  ['icon-maskable-512.png', 512, false], // maskable: fyldt baggrund
  ['og-image.png', 512, false],
];

// Chromium er forudinstalleret i miljøet; peg direkte på binæren hvis den
// bundlede version ikke matcher (ellers falder vi tilbage til default).
const execPath = process.env.PW_CHROMIUM
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(
  execPath ? { executablePath: execPath } : {},
);
try {
  for (const [name, size, transparent] of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const html = `<!doctype html><meta charset="utf-8">
      <style>html,body{margin:0;padding:0}#w{width:${size}px;height:${size}px}
      #w svg{width:100%;height:100%;display:block}</style>
      <div id="w">${svg}</div>`;
    await page.setContent(html, { waitUntil: 'networkidle' });
    const el = await page.$('#w');
    await el.screenshot({ path: new URL(name, outDir).pathname, omitBackground: transparent });
    await page.close();
    console.log(`  ✔ ${name} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
console.log('Ikoner genereret.');
