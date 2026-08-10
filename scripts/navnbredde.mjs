// ---------------------------------------------------------------------------
// scripts/navnbredde.mjs — KAN MAN LÆSE HOLDNAVNET PÅ EN TELEFON?
//
// Kampkortet og tipshistorikken viser holdnavnet. Hvor smal skærmen må blive,
// før navnet svigter, er et tal, og tal skal måles.
//
// DEN FØRSTE LØSNING VAR KORTKODEN, OG DEN ER VÆK IGEN. Kortet viste "MCI" og
// "MUN" under 600 px, så to Manchester-hold kunne skelnes. Det holdt i målingen
// og faldt i virkeligheden: spillerne ved ikke, hvad forkortelserne betyder —
// "SJF" og "VFF" er ikke almenviden. Svaret blev i stedet et kortere NAVN
// (`visningsnavn.js`) plus ombrydning over op til tre linjer.
//
// SCRIPTET MÅLTE ET STYKKE TID NOGET, DER IKKE FANDTES. Markuppen herunder
// indeholdt stadig `.match-card__side-code` og `.mytips__hold-kort`, længe efter
// at komponenterne var holdt op med at rendere dem. Sweep'et nederst svarede
// derfor "kortkode (MCI/MUN)" på ALLE bredder, inklusive 768 px, hvor der ikke
// findes nogen kortkode. Markuppen skal spejle komponenterne — ellers måler den
// en app, der ikke er der.
//
// DET AFGØRENDE MÅL ER IKKE "KLIPPET", MEN "IKKE TIL AT SKELNE". At
// "Brighton and Hove Albion" bliver til "Brighton and Hove…" er kosmetisk —
// der findes kun ét Brighton. At Manchester City og Manchester United BEGGE
// bliver til "Manch…" er en fejl: to forskellige kampe ser ens ud.
//
// BRUG:
//   node scripts/navnbredde.mjs                 # begge flader
//   node scripts/navnbredde.mjs --css sti.css   # mod en anden stylesheet
//   node scripts/navnbredde.mjs --ombryd        # nuværende gitter mod det gamle
//   node scripts/navnbredde.mjs --ordbrud       # holder overflow-wrap sin begrundelse?
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

// Markuppen er kopieret fra FootballTip.jsx og TipsHistorik.jsx, og den skal
// blive ved med at spejle dem. En forenkling ville måle noget andet end det,
// brugeren ser — trøjen og kickoff-kolonnen tager plads, og det er præcis den
// plads, striden står om.
const side = (navn) => `
  <div class="match-card__side">
    <svg width="34" height="34" viewBox="0 0 24 24" style="flex:0 0 auto;display:block"></svg>
    <span class="match-card__side-name">${navn}</span>
  </div>`;

const kampkort = (h, a) => `
  <div class="container"><div class="card">
    <div class="match-card__lineup">
      ${side(h)}
      <div class="match-card__dash">–</div>
      ${side(a)}
    </div>
  </div></div>`;

const tipsraekke = (h, a, iKort) => {
  const raekke = `
    <div class="mytips__rows"><div class="mytips__row">
      <span class="mytips__kick">man 10. aug. · 19.00</span>
      <span class="mytips__match">
        <span class="mytips__hold">${h}</span>
        <span class="mytips__dash">–</span>
        <span class="mytips__hold">${a}</span>
      </span>
      <span class="mytips__pick">1</span>
      <span class="mytips__res">+2,1</span>
    </div></div>`;
  // Spillerpanelet ligger i et EKSTRA kort inde i siden. Det koster bredde, og
  // en viewport-baseret media query kan ikke se forskel på de to.
  return `<div class="container"><div class="card">${iKort ? `<div class="card">${raekke}</div>` : raekke}</div></div>`;
};

const browser = await chromium.launch();
const side1 = await browser.newPage();

/**
 * Ved en given bredde: er navnet klippet, og hvor mange px har det til rådighed?
 * Måler også, hvor bredt det fælles præfiks + ét skelnende tegn ville være.
 *
 * Kampkortets navn ombrydes over op til tre linjer, så "klippet" er et LODRET
 * spørgsmål dér (scrollHeight) og et vandret i tips-rækken, som står på én
 * linje. Måles begge veje, så den samme funktion kan bruges på begge flader.
 */
async function maal(html, vaelger, bredde, praefiks) {
  await side1.setViewportSize({ width: bredde, height: 900 });
  await side1.setContent(`<style>${css}</style>${html}`);
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
    const lh = parseFloat(st.lineHeight) || 1;
    return {
      plads: el.clientWidth,
      klippet: el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 1,
      // Kan de to navne skelnes? På en ombrudt flade er det linjerne tilsammen,
      // der bærer teksten, så pladsen ganges med antal linjer.
      skelnes: el.clientWidth * Math.max(1, Math.round(el.clientHeight / lh)) >= kraevet,
      kraevet: Math.ceil(kraevet),
      linjer: Math.round(el.clientHeight / lh),
    };
  }, [vaelger, praefiks]);
  /* eslint-enable no-undef */
}

/** Mindste bredde, hvor `ok(m)` bliver sand. Binær søgning i [320, 1400]. */
async function graense(html, vaelger, praefiks, ok) {
  let lav = 320; let hoej = 1400;
  if (ok(await maal(html, vaelger, lav, praefiks))) return lav;
  if (!ok(await maal(html, vaelger, hoej, praefiks))) return null;
  while (hoej - lav > 1) {
    const mid = Math.floor((lav + hoej) / 2);
    if (ok(await maal(html, vaelger, mid, praefiks))) hoej = mid; else lav = mid;
  }
  return hoej;
}

console.log('\nMindste viewport-bredde, hvor navnet står UKLIPPET:\n');
console.log(`  ${'kamp'.padEnd(46)} kampkort   Mine tips   spillerpanel`);
for (const [h, a] of KAMPE) {
  const p = faellesPraefiks(h, a);
  const ukl = (m) => m && !m.klippet;
  // SEKVENTIELT, ikke Promise.all. De tre målinger deler én browserside, så
  // parallelle kald overskriver hinandens viewport, og tallene bliver tilfældige.
  // Første udgave gjorde det, og den rapporterede ">1400" for en bredde, hvor
  // sweep'et lige nedenfor viste "fuldt navn".
  const k = await graense(kampkort(h, a), '.match-card__side-name', p, ukl);
  const t = await graense(tipsraekke(h, a, false), '.mytips__match', p, ukl);
  const s = await graense(tipsraekke(h, a, true), '.mytips__match', p, ukl);
  console.log(`  ${`${h}–${a}`.padEnd(46)} ${String(k ?? '>1400').padStart(6)}   ${String(t ?? '>1400').padStart(9)}   ${String(s ?? '>1400').padStart(12)}`);
}

// DET, DER AFGØR KNÆKPUNKTET. Et klippet navn er grimt; to klippede navne, der
// ser ENS ud, er en fejl.
console.log('\nMindste bredde, hvor to hold med fælles præfiks kan SKELNES:\n');
for (const [h, a] of KAMPE) {
  const p = faellesPraefiks(h, a);
  if (p.length < 3) continue;
  const k = await graense(kampkort(h, a), '.match-card__side-name', p, (m) => m && m.skelnes);
  const t = await graense(tipsraekke(h, a, false), '.mytips__match', p, (m) => m && m.skelnes);
  console.log(`  fælles præfiks "${p}"  →  kampkort ${String(k ?? '>1400').padStart(5)} px, Mine tips ${String(t ?? '>1400').padStart(5)} px`);
}

// Hvad ser man rent faktisk på de mest udbredte telefoner? Manchester-parret er
// det hårdeste: 10 fælles tegn, og ingen kortkode til at skille dem ad længere.
console.log('\nPå de almindelige skærmbredder — Manchester City mod Manchester United:\n');
for (const b of [320, 360, 375, 390, 414, 430, 480, 600, 768]) {
  const m = await maal(kampkort('Manchester City', 'Manchester United'), '.match-card__side-name', b, 'Manchester ');
  const hvad = !m.klippet ? `fuldt navn (${m.linjer} linjer)`
    : m.skelnes ? `klippet, men til at skelne (${m.linjer} linjer)`
      : `KLIPPET OG IKKE TIL AT SKELNE (${m.plads} px × ${m.linjer} linjer, kræver ${m.kraevet})`;
  console.log(`  ${String(b).padStart(4)} px   ${hvad}`);
}

await browser.close();
console.log();

// ---------------------------------------------------------------------------
// --ombryd — DEN MÅLING, DER AFGJORDE GITTERET.
//
// Kampkortet klippede holdnavnet, indtil det blev sat til at ombryde. Men
// ombrydning alene var ikke nok: med `repeat(3, 1fr)` får tankestregen en hel
// tredjedel af kortet til ét tegn, og så er selv "Nottingham Forest" klippet på
// enhver telefonbredde — også med tre linjer. Først `1fr auto 1fr` løste det.
//
// Uden den her tilstand kunne påstanden ikke efterprøves: den gamle CSS er væk,
// og scriptet læser kun den nuværende. Tilstanden tvinger derfor det GAMLE
// gitter frem, så begge tal står side om side.
// ---------------------------------------------------------------------------
if (args.includes('--ombryd')) {
  const GAMMELT = '.match-card__lineup{grid-template-columns:repeat(3,1fr)!important}';
  const NAVNE = [
    'Nottingham Forest', 'Manchester United', 'Sønderjyske Fodbold',
    'FC Nordsjælland', 'Brighton and Hove Albion', 'Arsenal',
  ];
  const browser2 = await chromium.launch();
  const s2 = await browser2.newPage();

  for (const [mærkat, ekstra] of [['NUVÆRENDE (1fr auto 1fr)', ''], ['GAMMELT (3 lige kolonner)', GAMMELT]]) {
    console.log(`\n${mærkat} — linjer, og om navnet stadig klippes:\n`);
    console.log('  bredde  ' + NAVNE.map((n) => n.split(' ')[0].slice(0, 8).padEnd(10)).join(''));
    for (const w of [320, 360, 375, 390, 414, 430]) {
      const celler = [];
      for (const n of NAVNE) {
        await s2.setViewportSize({ width: w, height: 900 });
        await s2.setContent(`<style>${css}${ekstra}</style>${kampkort(n, 'Arsenal')}`);
        /* eslint-disable no-undef */
        const r = await s2.evaluate(() => {
          const el = document.querySelector('.match-card__side-name');
          const lh = parseFloat(getComputedStyle(el).lineHeight) || 1;
          return { l: Math.round(el.clientHeight / lh), klip: el.scrollHeight > el.clientHeight + 1 };
        });
        /* eslint-enable no-undef */
        celler.push((r.klip ? 'KLIPPET' : `${r.l} linje`).padEnd(10));
      }
      console.log(`  ${String(w).padStart(4)} px ` + celler.join(''));
    }
  }
  await browser2.close();
  console.log();
}

// ---------------------------------------------------------------------------
// --ordbrud — HOLDER `overflow-wrap: anywhere` SIN EGEN BEGRUNDELSE?
//
// Kommentaren i theme.css begrundede reglen med, at browseren ellers ikke
// bryder `Wolverhampton`, og at ét langt ord ville skubbe kortet ud i vandret
// scroll. To ting var galt med den begrundelse: Wolverhampton spiller ikke i
// nogen af de to ligaer, og navnet har `overflow: hidden`, så et for bredt ord
// bliver KLIPPET — det skubber ingenting.
//
// Reglen er der stadig, men af den rigtige grund, og den står herunder til at
// efterprøve: uden den bliver de længste ENKELTORD i data stående på én linje
// og klippet, i stedet for at brydes over de tre, der er plads til.
// ---------------------------------------------------------------------------
if (args.includes('--ordbrud')) {
  const { PREMIER_LEAGUE_TEAMS_2026 } = await import('../src/data/premierLeagueTeams2026.js');
  const { SUPERLIGA_TEAMS_2026 } = await import('../src/data/superligaTeams2026.js');
  const { standardVisningsnavn } = await import('../src/features/games/football/visningsnavn.js');

  // Det VISTE navn, splittet i ord. Bindestreg tæller som brudpunkt, for der
  // bryder browseren af sig selv.
  const ord = [...PREMIER_LEAGUE_TEAMS_2026, ...SUPERLIGA_TEAMS_2026]
    .map((t) => standardVisningsnavn(t.name))
    .flatMap((n) => n.split(/[\s-]+/))
    .sort((a, b) => b.length - a.length);
  const laengste = [...new Set(ord)].slice(0, 4);

  const browser3 = await chromium.launch();
  const s3 = await browser3.newPage();
  const UDEN = '.match-card__side-name{overflow-wrap:normal!important;word-break:normal!important}';

  console.log('\n--ordbrud — de længste ENKELTORD i de to ligaers viste navne:\n');
  console.log(`  ${'ord'.padEnd(14)} bredde   med regel              uden regel`);
  for (const o of laengste) {
    for (const w of [320, 360]) {
      const celler = [];
      for (const ekstra of ['', UDEN]) {
        await s3.setViewportSize({ width: w, height: 900 });
        await s3.setContent(`<style>${css}${ekstra}</style>${kampkort(o, 'Arsenal')}`);
        /* eslint-disable no-undef */
        celler.push(await s3.evaluate(() => {
          const el = document.querySelector('.match-card__side-name');
          const lh = parseFloat(getComputedStyle(el).lineHeight) || 1;
          const klip = el.scrollWidth > el.clientWidth + 0.5;
          // Løber SIDEN vandret over? Det var den oprindelige begrundelse for
          // reglen, og svaret er nej — `overflow: hidden` klipper i stedet.
          const ud = document.documentElement.scrollWidth > document.documentElement.clientWidth;
          return `${Math.round(el.clientHeight / lh)} linje${klip ? ', KLIPPET' : ''}${ud ? ', SIDEN LØBER OVER' : ''}`;
        }));
        /* eslint-enable no-undef */
      }
      console.log(`  ${o.padEnd(14)} ${String(w).padStart(4)} px  ${celler[0].padEnd(22)} ${celler[1]}`);
    }
  }
  await browser3.close();
  console.log();
}
