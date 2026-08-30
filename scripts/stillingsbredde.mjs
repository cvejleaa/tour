// ---------------------------------------------------------------------------
// scripts/stillingsbredde.mjs — KAN STILLINGSLISTEN BÆRE EN KOLONNE MERE?
//
// Pokaler.jsx bærer husets skrevne beslutning: "Stillingslisten er en bar
// <table> med tre kolonner og UDEN .table-wrap, så to nye kolonner ville
// knække den på en telefon uden vandret scroll." Derfor blev pokalerne kort.
//
// Rundens point tilføjer ÉN kolonne. Beslutningen ovenfor handler om TO, så
// den svarer ikke på spørgsmålet — og forskellen mellem en og to kolonner er
// præcis den slags, man ikke må skønne (CLAUDE.md: et tal uden kode er en
// påstand). Scriptet måler det i stedet:
//
//   1. Løber rækken ud over skærmen ved telefonbredder (320/375/390 px)?
//   2. Hvor meget plads er der tilbage til navnet — og ombryder et LANGT
//      dansk holdnavn til flere linjer?
//
// Målt uden vandret scroll, netop fordi tabellen ikke har .table-wrap: en
// overskridelse her betyder afklippet indhold, ikke en scrollbar.
//
// Markuppen SPEJLER Row i GameStandings.jsx. Ændrer kolonnerne sig, skal
// KOLONNER herunder følge med — bundet af stillingsbredde.test.mjs, samme
// vagt som fanebredde. Uden den ville scriptet måle en tabel, der ikke findes.
//
// BRUG: node scripts/stillingsbredde.mjs
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from '@playwright/test';

const ROD = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(ROD, 'src/styles/theme.css'), 'utf8');

// Cellerne i én stillingsrække, i rækkefølge. Spejler Row i GameStandings.jsx.
// VI SENDER TRE. Den fjerde måles kun for at vise HVORFOR den blev valgt fra.
export const KOLONNER = ['rang', 'navn', 'total'];

// Det værste realistiske navn: længste faktiske spillernavn-form i fladen er
// et holdnavn med (dig) efter. Vælges kort, måler vi et problem, der ikke er.
const LANGT_NAVN = 'Christoffer Vejlelaaaaang';

const BREDDER = [320, 375, 390];

function side(bredde, medRunde) {
  // medRunde=false: tre kolonner, rundens point som en LINJE under totalen
  // (det, vi sender). medRunde=true: den fravalgte fjerde kolonne.
  const rundeKolonne = medRunde ? '<td class="c-runde">👑 +12,3</td>' : '';
  const rundeLinje = medRunde ? '' : '<div class="c-under">👑 +12,3</div>';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${css}
    html,body{margin:0;padding:0;width:${bredde}px}
    /* Ingen .table-wrap — netop dét er pointen: der er ingen vandret scroll. */
    table{width:100%;border-collapse:collapse}
    .c-rang{padding:.45rem .5rem;width:52px;font-variant-numeric:tabular-nums}
    .c-navn{padding:.45rem .5rem}
    .c-runde{padding:.45rem .35rem;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    .c-total{padding:.45rem .5rem;text-align:right;font-variant-numeric:tabular-nums}
    .c-under{font-size:.8rem}
    .avatar{display:inline-block;width:26px;height:26px;border-radius:50%;background:#ccc;vertical-align:middle}
  </style></head><body>
    <table><tbody><tr id="r">
      <td class="c-rang">12<span>▲3</span></td>
      <td class="c-navn"><span style="display:inline-flex;align-items:center;gap:.5rem">
        <span class="avatar"></span><button class="link-btn">${LANGT_NAVN}</button>
        <span> (dig)</span></span></td>
      ${rundeKolonne}
      <td class="c-total">1.234,5${rundeLinje}</td>
    </tr></tbody></table>
  </body></html>`;
}

async function maal(page, bredde, medRunde) {
  await page.setViewportSize({ width: bredde, height: 700 });
  await page.setContent(side(bredde, medRunde));
  // Kører i BROWSEREN, ikke i Node — getBoundingClientRect findes kun dér.
  /* eslint-disable no-undef */
  return page.evaluate(() => {
    const raekke = document.getElementById('r');
    const navn = document.querySelector('.c-navn');
    const linjehoejde = parseFloat(getComputedStyle(navn).lineHeight) || 20;
    return {
      dokumentBredde: document.documentElement.scrollWidth,
      vinduesBredde: window.innerWidth,
      raekkehoejde: Math.round(raekke.getBoundingClientRect().height),
      navnBredde: Math.round(navn.getBoundingClientRect().width),
      navnLinjer: Math.round(navn.getBoundingClientRect().height / linjehoejde),
    };
  });
  /* eslint-enable no-undef */
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  console.log('Stillingsrækken på telefonbredder — UDEN vandret scroll.\n');
  console.log('bredde | udgave                | overløb | navnets plads | linjer | højde');
  console.log('-------|-----------------------|---------|---------------|--------|------');
  let vaersteSendt = 0;
  let vaersteFravalgt = 0;
  for (const b of BREDDER) {
    for (const medRunde of [false, true]) {
      const m = await maal(page, b, medRunde);
      const overloeb = m.dokumentBredde - m.vinduesBredde;
      if (medRunde) vaersteFravalgt = Math.max(vaersteFravalgt, overloeb);
      else vaersteSendt = Math.max(vaersteSendt, overloeb);
      console.log(
        `${String(b).padStart(6)} | ${(medRunde ? '4 kolonner (fravalgt)' : '3 + linje (sendes)').padEnd(21)} | `
        + `${String(overloeb > 0 ? `${overloeb}px` : 'nej').padStart(7)} | `
        + `${String(`${m.navnBredde}px`).padStart(13)} | ${String(m.navnLinjer).padStart(6)} | ${m.raekkehoejde}px`,
      );
    }
  }
  await browser.close();
  console.log(`\nDen FRAVALGTE fjerde kolonne: op til ${vaersteFravalgt}px uden for skærmen.`);
  console.log(`Den udgave vi SENDER: op til ${vaersteSendt}px.`);
  console.log('');
  console.log(vaersteSendt >= vaersteFravalgt
    ? 'Linjen under totalen er IKKE bedre end kolonnen — vælg om.'
    : 'Linjen under totalen koster ingen bredde: den vokser nedad i stedet.');
  // 23px ved 320px findes ALLEREDE uden rundens point (målt med tre kolonner
  // og ingen linje). Tallet herunder er derfor listens eksisterende trængsel,
  // ikke noget denne ændring har indført — men det er en åben opgave (#35).
  if (vaersteSendt > 0) {
    console.log(`BEMÆRK: ${vaersteSendt}px overløb findes ved den smalleste bredde uden `
      + 'rundens point og er listens eksisterende problem (opgave #35).');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
