// ---------------------------------------------------------------------------
// scripts/navnbredde.mjs — HVOR SMAL SKAL SKÆRMEN VÆRE, FØR HOLDNAVNET SVIGTER?
//
// Kampkortet og tipshistorikken viser holdnavnet på en bred skærm og kortkoden
// på en smal. Knækpunkterne er tal, og tal skal måles.
//
// FØRSTE UDGAVE VAR GÆTTET, OG DEN VAR VENDT OM. Jeg skrev i kommentaren, at
// tips-rækken har mindre plads til navnet end kampkortet, og satte derfor
// kortet til at skifte SENERE (420 px) end rækken (480 px). Det er omvendt:
//
//   Kampkortet   `grid-template-columns: repeat(3, 1fr)` giver hver side
//                præcis en tredjedel, uanset navnelængde, og trøje + gap
//                spiser ~40 px af den.
//   Tips-rækken  `auto 1fr auto auto` giver BEGGE navne én fælles kolonne, så
//                et kort udehold forærer plads til et langt hjemmehold.
//
// Kortet er altså det stramme sted, ikke rækken.
//
// DET AFGØRENDE MÅL ER IKKE "KLIPPET", MEN "IKKE TIL AT SKELNE". At
// "Brighton and Hove Albion" bliver til "Brighton and Hove…" er kosmetisk —
// der findes kun ét Brighton. At Manchester City og Manchester United BEGGE
// bliver til "Manch…" er en fejl: to forskellige kampe ser ens ud, og
// kortkoden, der kunne skille dem, er skjult af netop den media query, der
// skulle rydde op.
//
// Scriptet måler derfor for hvert par med fælles præfiks, hvor bred skærmen
// skal være, før de to kan skelnes fra hinanden.
//
// BRUG:
//   node scripts/navnbredde.mjs                 # begge flader
//   node scripts/navnbredde.mjs --css sti.css   # mod en anden stylesheet
//
// Kræver Playwright (allerede i repoet til e2e) og Chromium.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const ROD = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CSS_STI = args.includes('--css')
  ? args[args.indexOf('--css') + 1]
  : resolve(ROD, 'src/styles/theme.css');
const css = readFileSync(CSS_STI, 'utf8');

// De længste navne i de to ligaer, plus det par der faktisk kan forveksles.
const KAMPE = [
  ['Manchester City', 'Manchester United'],
  ['Brighton and Hove Albion', 'Tottenham Hotspur'],
  ['Nottingham Forest', 'Crystal Palace'],
  ['Sønderjyske Fodbold', 'Viborg FF'],
  ['FC Midtjylland', 'FC Nordsjælland'],
  ['Arsenal', 'Chelsea'],
];

/** Det fælles præfiks — dét, der gør to navne umulige at skelne, når begge klippes. */
function faellesPraefiks(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return a.slice(0, i);
}

// Markuppen er kopieret fra FootballTip.jsx og TipsHistorik.jsx. En forenkling
// ville måle noget andet end det, brugeren ser — trøjen og kickoff-kolonnen
// tager plads, og det er præcis den plads, striden står om.
const side = (navn, kode) => `
  <div class="match-card__side">
    <svg width="34" height="34" viewBox="0 0 24 24" style="flex:0 0 auto;display:block"></svg>
    <span class="match-card__side-code">${kode}</span>
    <span class="match-card__side-name">${navn}</span>
  </div>`;

const kampkort = (h, hk, a, ak) => `
  <div class="container"><div class="card">
    <div class="match-card__lineup">
      ${side(h, hk)}
      <div class="match-card__dash">–</div>
      ${side(a, ak)}
    </div>
  </div></div>`;

const tipsraekke = (h, hk, a, ak, iKort) => {
  const raekke = `
    <div class="mytips__rows"><div class="mytips__row">
      <span class="mytips__kick">man 10. aug. · 19.00</span>
      <span class="mytips__match">
        <span class="mytips__hold">${h}</span><span class="mytips__hold-kort">${hk}</span>
        <span class="mytips__dash">–</span>
        <span class="mytips__hold">${a}</span><span class="mytips__hold-kort">${ak}</span>
      </span>
      <span class="mytips__pick">1</span>
      <span class="mytips__res">+2,1</span>
    </div></div>`;
  // Spillerpanelet ligger i et EKSTRA kort inde i siden. Det koster bredde, og
  // en viewport-baseret media query kan ikke se forskel på de to.
  return `<div class="container"><div class="card">${iKort ? `<div class="card">${raekke}</div>` : raekke}</div></div>`;
};

const kode = (n) => n.split(/\s+/).map((o) => o[0]).join('').slice(0, 3).toUpperCase();

const browser = await chromium.launch();
const side1 = await browser.newPage();

/**
 * Ved en given bredde: er navnet klippet, og hvor mange px har det til rådighed?
 * Måler også, hvor bredt det fælles præfiks + ét skelnende tegn ville være.
 */
async function maal(html, vaelger, bredde, praefiks, fri = false) {
  await side1.setViewportSize({ width: bredde, height: 900 });
  // `fri` tvinger navnet frem uanset media query. Uden det måler binær-
  // søgningen sig selv: under knækpunktet er navnet `display: none`, og en
  // test på "er det klippet" er trivielt sand for noget, der ikke vises.
  // Første udgave havde netop den fejl og rapporterede 320 px.
  const overstyr = fri
    ? '.match-card__side-name,.mytips__hold{display:inline!important}'
      + '.match-card__side-code,.mytips__hold-kort{display:none!important}'
    : '';
  await side1.setContent(`<style>${css}${overstyr}</style>${html}`);
  // Callbacken herunder kører i BROWSEREN, ikke i Node — `document` og
  // `getComputedStyle` findes kun dér. eslint læser filen som et Node-script.
  /* eslint-disable no-undef */
  return side1.evaluate(([v, p]) => {
    const el = document.querySelector(v);
    if (!el) return null;
    const st = getComputedStyle(el);
    // Bredden af "fælles præfiks + ét tegn": under den kan to navne med samme
    // præfiks ikke skelnes, uanset hvad der står bagefter.
    const proeve = document.createElement('span');
    proeve.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${st.font}`;
    proeve.textContent = `${p}x…`;
    document.body.appendChild(proeve);
    const kraevet = proeve.getBoundingClientRect().width;
    proeve.remove();
    return {
      plads: el.clientWidth,
      fuld: el.scrollWidth,
      klippet: el.scrollWidth > el.clientWidth + 0.5,
      skelnes: el.clientWidth >= kraevet,
      kraevet: Math.ceil(kraevet),
      vist: st.display,
    };
  }, [vaelger, praefiks]);
  /* eslint-enable no-undef */
}

/** Mindste bredde, hvor `ok(m)` bliver sand. Binær søgning i [320, 1400]. */
async function graense(html, vaelger, praefiks, ok, fri = true) {
  let lav = 320; let hoej = 1400;
  if (ok(await maal(html, vaelger, lav, praefiks, fri))) return lav;
  if (!ok(await maal(html, vaelger, hoej, praefiks, fri))) return null;
  while (hoej - lav > 1) {
    const mid = Math.floor((lav + hoej) / 2);
    if (ok(await maal(html, vaelger, mid, praefiks, fri))) hoej = mid; else lav = mid;
  }
  return hoej;
}

console.log('\nMindste viewport-bredde, hvor navnet står ULKIPPET:\n');
console.log(`  ${'kamp'.padEnd(46)} kampkort   Mine tips   spillerpanel`);
for (const [h, a] of KAMPE) {
  const kort = kampkort(h, kode(h), a, kode(a));
  const mine = tipsraekke(h, kode(h), a, kode(a), false);
  const panel = tipsraekke(h, kode(h), a, kode(a), true);
  const p = faellesPraefiks(h, a);
  const ukl = (m) => m && !m.klippet;
  // SEKVENTIELT, ikke Promise.all. De tre målinger deler én browserside, så
  // parallelle kald overskriver hinandens viewport, og tallene bliver tilfældige.
  // Første udgave gjorde det, og den rapporterede ">1400" for en bredde, hvor
  // sweep'et lige nedenfor viste "fuldt navn".
  const k = await graense(kort, '.match-card__side-name', p, ukl);
  const t = await graense(mine, '.mytips__match', p, ukl);
  const s = await graense(panel, '.mytips__match', p, ukl);
  console.log(`  ${`${h}–${a}`.padEnd(46)} ${String(k ?? '>1400').padStart(6)}   ${String(t ?? '>1400').padStart(9)}   ${String(s ?? '>1400').padStart(12)}`);
}

// DET, DER AFGØR KNÆKPUNKTET. Et klippet navn er grimt; to klippede navne, der
// ser ENS ud, er en fejl.
console.log('\nMindste bredde, hvor to hold med fælles præfiks kan SKELNES:\n');
for (const [h, a] of KAMPE) {
  const p = faellesPraefiks(h, a);
  if (p.length < 3) continue;
  const kort = kampkort(h, kode(h), a, kode(a));
  const mine = tipsraekke(h, kode(h), a, kode(a), false);
  const k = await graense(kort, '.match-card__side-name', p, (m) => m && m.skelnes);
  const t = await graense(mine, '.mytips__match', p, (m) => m && m.skelnes);
  console.log(`  fælles præfiks "${p}"  →  kampkort ${String(k ?? '>1400').padStart(5)} px, Mine tips ${String(t ?? '>1400').padStart(5)} px`);
}

// Hvad ser man rent faktisk på de mest udbredte telefoner?
console.log('\nPå de almindelige skærmbredder — hvad vises på kampkortet:\n');
for (const b of [375, 390, 414, 419, 421, 430, 480, 540, 600, 700, 768]) {
  const kort = kampkort('Manchester City', 'MCI', 'Manchester United', 'MUN');
  const m = await maal(kort, '.match-card__side-name', b, 'Manchester ');
  const k = await maal(kort, '.match-card__side-code', b, 'Manchester ');
  const hvad = k.vist !== 'none' ? 'kortkode (MCI/MUN)'
    : m.skelnes ? 'fuldt navn' : `KLIPPET OG IKKE TIL AT SKELNE (${m.plads} px, kræver ${m.kraevet})`;
  console.log(`  ${String(b).padStart(4)} px   ${hvad}`);
}

await browser.close();
console.log();
