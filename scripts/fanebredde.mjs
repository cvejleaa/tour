// ---------------------------------------------------------------------------
// scripts/fanebredde.mjs — HVOR MANGE FANER KAN MAN SE PÅ EN TELEFON?
//
// Fanerækken (.tabs) scroller vandret med scrollbaren SKJULT — så hver fane
// uden for kanten er usynlig OG umarkeret. En Safari-bruger meldte "fanerne
// kommer ikke frem" (aug. 2026). Før vi vælger medicin (wrap på desktop,
// scroll-hint på mobil), skal to tal MÅLES, ikke skønnes (CLAUDE.md: et tal
// uden kode er en påstand):
//
//   1. Hvor mange af spillets faner er reelt synlige ved telefon-bredder?
//   2. Hvor mange rækker koster flex-wrap ved desktop-bredder med de
//      NUVÆRENDE etiketter? (docs/ux-review-2026-07.md fravalgte wrap på
//      mobil, fordi det dengang kostede 3 rækker — etiketterne er kortere nu,
//      og wrap ≥720 px er en anden beslutning end wrap på 390 px.)
//
// Markuppen spejler GamePage.jsx (GAME_TABS, Superligaens 9 faner = værste
// spil) og AdminPage.jsx (12 faner). Ændrer fanerne sig, skal listerne her
// følge med — ellers måler scriptet en app, der ikke findes (navnbredde.mjs
// lærte os det på den hårde måde).
//
// BRUG: node scripts/fanebredde.mjs
// Kræver Playwright (allerede i repoet til e2e) og Chromium.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const ROD = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(ROD, 'src/styles/theme.css'), 'utf8');

// Superligaen har alle 9 (pulje + tabel); PL efterår har 8 (ingen pulje).
const SPIL_FANER = ['Tip', '📋 Mine tips', '🏆 Stilling', '🎖️ Pulje', '⚽ Tabel', '📈 Elo', '👥 Ligaer', '🙂 Mit hold', '❓ Guide'];
// Ejerens faner på platformen (AdminPage.jsx, PLATFORM_MODE + isOwner).
const ADMIN_FANER = ['Brugere', '🗓️ Spil-tidsplan', '🎨 Hold-farver og navne', '🔔 Påmindelser', '🤖 Runde-Botten', 'Tests', '🩺 Driftstatus', '✉️ Mail-log', '📈 Aktivitet', '📣 Send mail'];

const faneRaekke = (faner) => `
  <div class="tabs" role="tablist">
    ${faner.map((f, i) => `<button class="tab${i === 0 ? ' tab--active' : ''}">${f}</button>`).join('')}
  </div>`;

// VIEWPORTEN sættes — ikke en kunstig container-bredde. .tabs skifter selv
// adfærd på en media query (wrap ≥720, scroll under), og en media query ser
// viewporten. Den første udgave målte med en smal container i et 1280 px
// vindue og ville derfor måle wrap-grenen på "telefon"-bredder.
const html = (indhold) => `<!doctype html><html><head><meta name="viewport" content="width=device-width">
  <style>${css}</style><style>body{margin:0}</style>
  </head><body><div class="container">${indhold}</div></body></html>`;

async function maal(page, faner, bredde, { wrap = false } = {}) {
  await page.setViewportSize({ width: bredde, height: 800 });
  await page.setContent(html(faneRaekke(faner)));
  if (wrap) {
    await page.addStyleTag({ content: '.tabs{flex-wrap:wrap;overflow-x:visible}' });
  }
  // Koden herunder kører i BROWSEREN (page.evaluate) — document og
  // getBoundingClientRect findes kun dér. eslint læser filen som Node-script.
  /* eslint-disable no-undef */
  return page.evaluate(() => {
    const raekke = document.querySelector('.tabs');
    const kant = raekke.getBoundingClientRect();
    const faner = [...raekke.querySelectorAll('.tab')];
    const synlige = faner.filter((f) => {
      const r = f.getBoundingClientRect();
      return r.right <= kant.right + 1 && r.left >= kant.left - 1;
    }).length;
    const raekker = new Set(faner.map((f) => Math.round(f.offsetTop))).size;
    return { ialt: faner.length, synlige, raekker };
  });
  /* eslint-enable no-undef */
}

const browser = await chromium.launch();
const page = await browser.newPage();

console.log('— Spil-faner (Superligaen, 9 = værste spil) — scroll som i dag —');
for (const b of [320, 360, 375, 390, 414, 430]) {
  const m = await maal(page, SPIL_FANER, b);
  console.log(`  ${String(b).padStart(4)}px: ${m.synlige}/${m.ialt} faner synlige (${m.ialt - m.synlige} skjult uden markering)`);
}

console.log('— Spil-faner — flex-wrap ved desktop-bredder —');
for (const b of [720, 848, 1024]) {
  const m = await maal(page, SPIL_FANER, b, { wrap: true });
  console.log(`  ${String(b).padStart(4)}px: ${m.raekker} række(r)`);
}

console.log('— Admin-faner (10, ejerens platform-sæt, målt i .tabs-målform) —');
for (const b of [390, 720, 848]) {
  const scroll = await maal(page, ADMIN_FANER, b);
  const wrap = await maal(page, ADMIN_FANER, b, { wrap: true });
  console.log(`  ${String(b).padStart(4)}px: scroll ${scroll.synlige}/${scroll.ialt} synlige · wrap ${wrap.raekker} række(r)`);
}

await browser.close();
