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
const udfald = (h, a) => (h > a ? '1' : (h < a ? '2' : 'X'));

/**
 * xG's udfald med STRENG sammenligning — kan aldrig give X.
 * Det er hele pointen i fund nr. 2: uden et bånd er "xG sagde uafgjort"
 * umuligt, så en uafgjort kamp tæller ALTID som uenighed.
 */
const xgUdfald = (h, a) => (h > a ? '1' : (h < a ? '2' : 'X'));

/** xG's udfald MED et uafgjort-bånd. */
const xgUdfaldBaand = (h, a, d) => (Math.abs(h - a) < d ? 'X' : (h > a ? '1' : '2'));

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
  return faerdige
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
}

function rapportér(navn, raekker) {
  const n = raekker.length;
  if (!n) { console.log(`\n${navn}: ingen kampe med både facit og xG.`); return null; }
  const uenige = raekker.filter((r) => r.facit !== r.xg);
  const uafgjorte = raekker.filter((r) => r.facit === 'X');
  const uenigeUafgjort = uenige.filter((r) => r.facit === 'X');
  const afgjorte = raekker.filter((r) => r.facit !== 'X');
  const vendte = afgjorte.filter((r) => r.facit !== r.xg);

  console.log(`\n=== ${navn} ===`);
  console.log(`Kampe med facit OG xG: ${n}`);
  console.log(`  heraf uafgjorte:     ${uafgjorte.length}`);
  console.log(`Uenigheder i alt:      ${uenige.length} af ${n}`
    + `  (${(100 * uenige.length / n).toFixed(0)} %)`);
  console.log(`  ... men ${uenigeUafgjort.length} af dem er UAFGJORTE kampe, som xG med`);
  console.log('      streng sammenligning per konstruktion ikke kan ramme.');
  console.log(`REEL 1-mod-2-vending:  ${vendte.length} af ${afgjorte.length}`
    + `  (${afgjorte.length ? (100 * vendte.length / afgjorte.length).toFixed(0) : '–'} %)`);
  return { n, uenige: uenige.length, uafgjorte: uafgjorte.length, afgjorte: afgjorte.length, vendte: vendte.length };
}

/** Hvad koster det at give xG et uafgjort-bånd? BEGGE veje tælles. */
function baandtabel(raekker) {
  console.log('\n=== Uafgjort-båndets pris (alle kampe samlet) ===');
  console.log('bånd | rammer X | mister afgjorte | uenige i alt');
  console.log('-----|----------|-----------------|-------------');
  for (const d of [0, 0.25, 0.5, 0.75, 1.0]) {
    let rammerX = 0; let misterAfgjort = 0; let uenige = 0;
    for (const r of raekker) {
      const b = d === 0 ? r.xg : xgUdfaldBaand(r.xgHome, r.xgAway, d);
      if (b !== r.facit) uenige += 1;
      if (r.facit === 'X' && b === 'X') rammerX += 1;
      // En afgjort kamp, båndet nu kalder uafgjort: prisen for at ramme X.
      if (r.facit !== 'X' && b === 'X') misterAfgjort += 1;
    }
    console.log(`${d.toFixed(2).padStart(4)} | ${String(rammerX).padStart(8)} | `
      + `${String(misterAfgjort).padStart(15)} | ${String(uenige).padStart(12)}`);
  }
  console.log('\nEt bånd, der kun måles på "rammer X", ser altid godt ud. Kolonnen');
  console.log('"mister afgjorte" er den, der afgør, om det er en forbedring.');
}

async function main() {
  const alle = [];
  for (const g of SYNCED_GAMES) {
    const raekker = await hentSpil(g);
    rapportér(g.gameId, raekker);
    alle.push(...raekker);
  }
  const samlet = rapportér('BEGGE SPIL SAMLET', alle);
  baandtabel(alle);
  if (samlet) {
    console.log('\n--- Til fladen ---');
    console.log(`xG er uenig med facit i ${samlet.uenige} af ${samlet.n} kampe, men kun`);
    console.log(`${samlet.vendte} af ${samlet.afgjorte} afgjorte kampe peger den modsatte vej.`);
    console.log('Det ANDET tal er det, en "resultatet mod chancerne"-flade må bygge på.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
