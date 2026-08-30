// ---------------------------------------------------------------------------
// scripts/maal-xg.mjs — HVOR OFTE ER XG UENIG MED RESULTATET?
//
// Findes, fordi tallet skal efterprøves FØR der bygges en flade på det.
// Den første optælling påstod "50 % af kampene", og Quality Control viste, at
// tallet var lavet af to ting: halvdelen af uenighederne var UAFGJORTE kampe,
// som xG med streng > / < aldrig kan producere. Den reelle 1-mod-2-vending var
// en helt anden. Det tal må ikke gættes igen (CLAUDE.md: et tal uden kode er
// en påstand), så her er harnesset.
//
// KILDEN ER API'ERNE, IKKE FIRESTORE. Scriptet kan køres af enhver uden
// legitimation, og det læser NØJAGTIG de samme providers, som serveren bruger
// (functions-platform/syncProviders.js) — ikke en kopi. Skifter en kilde
// format, fejler scriptet på samme måde som synken, i stedet for tavst at måle
// noget andet.
//
// HVAD DER MÅLES
//   1. Enighed/uenighed mellem facit og xG, pr. spil og samlet.
//   2. Uenighederne DELT OP: en uafgjort kamp kan xG per konstruktion ikke
//      ramme med streng sammenligning, så den hører ikke i samme bunke som en
//      ægte 1-mod-2-vending.
//   3. Den reelle 1-mod-2-vendingsrate: kun kampe med en VINDER, hvor xG
//      peger på det modsatte hold.
//   4. Båndets pris: giver man xG et uafgjort-bånd |xgH − xgA| < d, kan den
//      ramme uafgjort — men skaber nye uenigheder på afgjorte kampe. Begge
//      veje tælles, for et bånd, der kun måles på den ene, ser altid godt ud.
//
// BRUG: node scripts/maal-xg.mjs
// ---------------------------------------------------------------------------

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PROVIDERS, SYNCED_GAMES } = require('../functions-platform/syncProviders');

/** Hvilken provider hører spillet til? Samme opslag som serveren laver. */
function providerFor(g) {
  return PROVIDERS[g.provider] || PROVIDERS[g.sync?.provider]
    || (g.sync?.competitionId ? PROVIDERS.pulselive : PROVIDERS.superliga);
}

/** 1 / X / 2 af to måltal. */
export const udfald = (h, a) => (h > a ? '1' : (h < a ? '2' : 'X'));

/**
 * xG's udfald med STRENG sammenligning.
 *
 * Den kan ikke FORUDSIGE uafgjort som en model — men to helt ens decimaltal
 * giver 'X', og det er sjældent nok til at blive overset. Netop dét snød den
 * første optælling, som talte en sådan kamp som en 1-mod-2-vending. Derfor
 * har `opdel` en egen bunke til den, og derfor står denne kommentar ikke
 * længere og påstår "kan aldrig give X".
 *
 * Identisk med `udfald` i dag. De holdes adskilt, fordi de to begreber kan
 * skulle skilles ad (fx et bånd på xG alene), og et delt navn ville skjule det.
 */
export const xgUdfald = (h, a) => (h > a ? '1' : (h < a ? '2' : 'X'));

/** xG's udfald MED et uafgjort-bånd. */
export const xgUdfaldBaand = (h, a, d) => (Math.abs(h - a) < d ? 'X' : (h > a ? '1' : '2'));

async function hentSpil(g) {
  const p = providerFor(g);
  const faerdige = await p.hentFaerdige(g.sync, fetch);
  // hentXg tager VORES dokument-id'er. For superligaen ER sourceKey id'et;
  // for pulselive er id'et r{runde}-{matchId}, og metoden læser halen — så et
  // syntetisk runde-præfiks er nok her, hvor vi ikke skal skrive noget.
  const erPulselive = p === PROVIDERS.pulselive;
  const docIds = faerdige.map((f) => (erPulselive ? `r0-${f.sourceKey}` : f.sourceKey));
  const frist = Date.now() + 10 * 60 * 1000; // rundhåndet: engangskørsel, ikke en sweep
  const xg = await p.hentXg(g.sync, fetch, docIds, frist);
  const xgVed = new Map(xg.map((x) => [String(x.sourceKey), x]));
  const raekker = faerdige
    .map((f) => {
      const x = xgVed.get(String(f.sourceKey));
      if (!x) return null;
      return {
        id: f.sourceKey,
        facit: udfald(f.homeGoals, f.awayGoals),
        xg: xgUdfald(x.xgHome, x.xgAway),
        xgHome: x.xgHome,
        xgAway: x.xgAway,
        maal: `${f.homeGoals}-${f.awayGoals}`,
      };
    })
    .filter(Boolean);
  // FRAFALD TÆLLES. Uden det falder n tavst, hvis en kilde holder op med at
  // levere xG, og procenterne ser lige så pæne ud på et halvt datagrundlag.
  // Samme fejlform som "et filter, der ser grønt ud, fordi det ikke kiggede".
  return { raekker, faerdige: faerdige.length, bortfaldet: faerdige.length - raekker.length };
}

/**
 * Optællingen, skilt fra udskriften så den kan testes uden netværk.
 * Delingen er hele pointen: `uenige` er ét tal, `vendte` et andet, og de må
 * aldrig forveksles — hverken af en læser eller af koden selv.
 */
export function opdel(raekker) {
  const uenige = raekker.filter((r) => r.facit !== r.xg);
  const uafgjorte = raekker.filter((r) => r.facit === 'X');
  const uenigeUafgjort = uenige.filter((r) => r.facit === 'X');
  const afgjorte = raekker.filter((r) => r.facit !== 'X');
  // KUN ÆGTE VENDINGER. xG kan selv lande præcis lige (xgHome === xgAway) på
  // en afgjort kamp; den peger da IKKE på det modsatte hold. Talte man den
  // med, ville det nye tal bære nøjagtig samme kategorifejl, som scriptet er
  // skrevet for at afsløre i det gamle — bare i den halvdel, man troede var
  // sikker. Test Managers fund.
  const vendte = afgjorte.filter((r) => r.xg !== 'X' && r.facit !== r.xg);
  const xgLige = afgjorte.filter((r) => r.xg === 'X');
  return {
    n: raekker.length,
    uenige: uenige.length,
    uafgjorte: uafgjorte.length,
    uenigeUafgjort: uenigeUafgjort.length,
    afgjorte: afgjorte.length,
    vendte: vendte.length,
    xgLige: xgLige.length,
  };
}

function rapportér(navn, raekker) {
  const n = raekker.length;
  if (!n) { console.log(`\n${navn}: ingen kampe med både facit og xG.`); return null; }
  const t = opdel(raekker);

  console.log(`\n=== ${navn} ===`);
  console.log(`Kampe med facit OG xG: ${n}`);
  console.log(`  heraf uafgjorte:     ${t.uafgjorte}`);
  console.log(`Uenigheder i alt:      ${t.uenige} af ${n}`
    + `  (${(100 * t.uenige / n).toFixed(0)} %)`);
  console.log(`  ... men ${t.uenigeUafgjort} af dem er UAFGJORTE kampe, som xG med`);
  console.log('      streng sammenligning per konstruktion ikke kan ramme.');
  if (t.xgLige) {
    console.log(`  ... og ${t.xgLige} afgjorte kampe, hvor xG selv var PRÆCIS LIGE.`);
    console.log('      De peger ikke på det modsatte hold og er ikke vendinger.');
  }
  console.log(`REEL 1-mod-2-vending:  ${t.vendte} af ${t.afgjorte}`
    + `  (${t.afgjorte ? (100 * t.vendte / t.afgjorte).toFixed(0) : '–'} %)`);
  return t;
}

/**
 * Båndets pris, opgjort som OVERGANGE og ikke som en bunke.
 *
 * Første udgave talte enhver afgjort kamp, båndet kaldte uafgjort, som
 * "prisen". Det var for højt: nogle af dem var ALLEREDE forkerte, og båndet
 * skiftede kun ét forkert gæt ud med et andet. Ved bånd 0,25 gav det 4, hvor
 * kun 2 gik fra rigtig til forkert — en overcitering med faktor 2, på præcis
 * den slags tal, hele scriptet findes for at holde ærligt. QC's fund.
 */
export function baandOvergange(raekker, d) {
  let vundetX = 0; // uafgjort kamp, båndet nu rammer
  let mistetRigtig = 0; // var rigtig UDEN bånd, forkert MED
  let byttetForkert = 0; // forkert begge veje — båndet ændrede kun hvordan
  let uenige = 0;
  for (const r of raekker) {
    const uden = r.xg;
    const med = d === 0 ? r.xg : xgUdfaldBaand(r.xgHome, r.xgAway, d);
    const rigtigFoer = uden === r.facit;
    const rigtigEfter = med === r.facit;
    if (!rigtigEfter) uenige += 1;
    if (!rigtigFoer && rigtigEfter) vundetX += 1;
    if (rigtigFoer && !rigtigEfter) mistetRigtig += 1;
    if (!rigtigFoer && !rigtigEfter && uden !== med) byttetForkert += 1;
  }
  return { vundetX, mistetRigtig, byttetForkert, uenige };
}

/** Hvad koster det at give xG et uafgjort-bånd? BEGGE veje tælles. */
function baandtabel(navn, raekker) {
  console.log(`\n=== Uafgjort-båndets pris · ${navn} (n=${raekker.length}) ===`);
  console.log('bånd | vinder | mister rigtige | bytter forkert | uenige i alt');
  console.log('-----|--------|----------------|----------------|-------------');
  for (const d of [0, 0.25, 0.5, 0.75, 1.0]) {
    const t = baandOvergange(raekker, d);
    console.log(`${d.toFixed(2).padStart(4)} | ${String(t.vundetX).padStart(6)} | `
      + `${String(t.mistetRigtig).padStart(14)} | ${String(t.byttetForkert).padStart(14)} | `
      + `${String(t.uenige).padStart(12)}`);
  }
}

async function main() {
  // Stemplet gør et citat efterprøveligt: tallene flytter sig, når flere
  // kampe spilles, så "35 %" uden dato og n er en påstand igen.
  console.log(`Målt: ${new Date().toISOString()}`);
  const alle = [];
  const perSpil = new Map();
  for (const g of SYNCED_GAMES) {
    const { raekker, faerdige, bortfaldet } = await hentSpil(g);
    perSpil.set(g.gameId, raekker);
    if (bortfaldet) {
      console.log(`\n⚠ ${g.gameId}: ${bortfaldet} af ${faerdige} færdige kampe mangler xG `
        + 'og indgår IKKE i tallene nedenfor.');
    }
    rapportér(g.gameId, raekker);
    alle.push(...raekker);
  }
  const samlet = rapportér('BEGGE SPIL SAMLET', alle);
  // Pr. spil OGSÅ: båndets tærskler er ABSOLUTTE xG-gab, og de to kilder
  // (superliga.dk mod Opta/Pulselive) kan have hver sin skala. Et samlet
  // gennemsnit kan skjule, at den ene kilde opfører sig anderledes — samme
  // fælde som DRAW_BASE: et gennemsnit kan ikke se kurvens form.
  for (const g of SYNCED_GAMES) {
    const kun = perSpil.get(g.gameId) || [];
    if (kun.length) baandtabel(g.gameId, kun);
  }
  baandtabel('BEGGE SPIL SAMLET', alle);
  if (samlet) {
    const pct = (100 * samlet.vendte / samlet.afgjorte).toFixed(0);
    console.log('\n--- Til fladen ---');
    console.log(`xG er uenig med facit i ${samlet.uenige} af ${samlet.n} kampe (`
      + `${(100 * samlet.uenige / samlet.n).toFixed(0)} %).`);
    console.log(`Men KUN ${samlet.vendte} af ${samlet.afgjorte} afgjorte kampe (${pct} %) peger`);
    console.log('på det modsatte hold. Det er DET tal — den reelle 1-mod-2-vending —');
    console.log('en "resultatet mod chancerne"-flade må bygge på.');
    console.log('');
    console.log(`FORBEHOLD: n = ${samlet.afgjorte} afgjorte kampe. Ved den størrelse er`);
    console.log(`usikkerheden på ${pct} % omkring ±15 procentpoint. Citér tallet som en`);
    console.log('RETNING ("for ofte uenig til at bære en prognose"), ikke som en præcis');
    console.log('rate. Kør igen, når sæsonen er længere fremme.');
    console.log('');
    console.log('OG BÅNDET: læs tabellerne PR. SPIL, ikke den samlede. Samlet ser det ud');
    console.log('som om intet bånd forbedrer noget — men det er et gennemsnit af to');
    console.log('kurver, der peger hver sin vej: Superligaen bliver værre, Premier');
    console.log('League bedre. De udligner hinanden. Netop dét er grunden til, at');
    console.log('tabellen deles: et gennemsnit kan ikke se, om kurven har rigtig form.');
    console.log('PL-tallene hviler dog på n=18 og er for små til at bære en beslutning.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
