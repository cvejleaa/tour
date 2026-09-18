// scripts/lib/verificerTotaler.mjs — den RENE del af verificer-totaler.
//
// Læser ingenting selv: får spillernes gemte dokumenter og alle bets som lister
// og siger, hvad der er galt. Adskilt fra CLI'et (scripts/verificer-totaler.mjs),
// som initialiserer Firebase ved import og derfor ikke kan importeres af en
// test — samme snit som scripts/lib/roller.mjs.
//
// Kontrakten, den efterprøver, står i functions-platform/pointOpdeling.js
// (opdelPoint) og gameScoring.js (recalcPlayerTotal):
//   total      = max(0, round1(raw + combi + pulje))   — afrundet ÉN gang, gulvet ÉN gang
//   opdeling   = { p1x2, chance, combi, pulje }        — hver rubrik afrundet for sig
//   p1x2 + chance = Σ bet.points for de kampe, der er kendt og afgjort
// Rubrikkerne er "best-effort; totalen er stillingen" — så en afvigelse ud over
// afrundingen betyder, at opdelingen og stillingen er uenige.

/**
 * Største afvigelse, afrundingen alene kan give: fire rubrikker afrundet hver
 * for sig (±0,05 hver) plus totalen afrundet én gang (±0,05) = 0,25.
 *
 * Den første udgave brugte 0,15 og ville have meldt fejl på et rent
 * afrundingstilfælde: p1x2 10,049 + chance 0,049 + combi 5,049 + pulje 0,049
 * giver rubrikker 10,0 / 0,0 / 5,0 / 0,0 (sum 15,0), mens totalen afrundes af
 * 15,196 til 15,2 — afvigelse 0,2 uden en eneste fejl i data.
 */
export const TOLERANCE = 0.25;

/** Chancen regnes som "negativ", når den er under dette — ikke ved -0,0 eller afrundingsstøj. */
export const CHANCE_NEGATIV = -0.05;

export const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

/**
 * Hvem har overhovedet sat point på spil? KUN de spillere må have negativ
 * Chancen. Et bet med `chanceStake > 0` beholder feltet efter afregning
 * (gameScoring.js skriver det videre i detalje/opdeling), så en tabt indsats
 * i en tidligere runde tæller også.
 * @param {Array<{uid?:string, chanceStake?:unknown}>} bets
 * @returns {Set<string>}
 */
export function harIndsatsAf(bets) {
  const ud = new Set();
  for (const b of bets) if (Number(b.chanceStake) > 0 && b.uid) ud.add(b.uid);
  return ud;
}

/**
 * Efterprøv ÉN spiller. Returnerer tallene til tabellen og de bemærkninger,
 * der gør rækken til en fejl. Tom `noter` = ok.
 * @param {{uid:string, totalPoints?:unknown, opdeling?:object}} p
 * @param {Set<string>} harIndsats
 */
export function kontrollerSpiller(p, harIndsats) {
  const o = p.opdeling;
  const rubrik = (k) => r1(o ? o[k] : 0);
  const p1x2 = rubrik('p1x2');
  const chance = rubrik('chance');
  const combi = rubrik('combi');
  const pulje = rubrik('pulje');
  const sum = r1(p1x2 + chance + combi + pulje);
  const total = r1(p.totalPoints);
  const noter = [];

  if (!o || typeof o !== 'object') {
    // Spilleren er aldrig genberegnet efter udrulningen af `opdeling`. Der er
    // ingen rubrikker at sammenligne — svaret er 🔄 Genberegn point, ikke en
    // bagfyldning.
    noter.push('INGEN OPDELING — kør Genberegn point for spillet');
  } else if (Math.abs(sum - total) > TOLERANCE && !(total === 0 && sum < 0)) {
    // Totalen gulves ved 0, så sum < total er legitimt netop dér — undtaget.
    noter.push(`SUM ${sum} ≠ TOTAL ${total}`);
  }

  if (chance < CHANCE_NEGATIV && !harIndsats.has(p.uid)) {
    // Chancen udledes som (gemte point − 1X2-point). Uden indsats SKAL de to
    // være ens; er de det ikke, står bet-pointene med en gammel regel.
    noter.push('CHANCEN NEGATIV UDEN INDSATS — bet-pointene følger ikke reglen, genscor (bagfyld)');
  }

  return { uid: p.uid, p1x2, chance, combi, pulje, sum, total, noter };
}

/**
 * Efterprøv alle spillere. Rækkerne sorteres som stillingen (total faldende).
 * @returns {{ rows: Array, fejl: number, iAlt: number }}
 */
export function vurder(spillere, bets) {
  const harIndsats = harIndsatsAf(bets);
  const rows = [...spillere]
    .sort((x, y) => (Number(y.totalPoints) || 0) - (Number(x.totalPoints) || 0))
    .map((p) => kontrollerSpiller(p, harIndsats));
  const fejl = rows.reduce((a, r) => a + r.noter.length, 0);
  const iAlt = r1(spillere.reduce((a, p) => a + (Number(p.totalPoints) || 0), 0));
  return { rows, fejl, iAlt };
}

/**
 * Tabellen som tekstlinjer — én pr. spiller, en I ALT-linje og dommen. Ligger
 * her og ikke i CLI'et, så en test kan læse, HVAD der står, ikke kun at noget
 * blev skrevet.
 * @param {ReturnType<typeof vurder>} v
 * @param {Map<string,string>} navn  uid → visningsnavn
 * @param {string} gameId
 */
export function tabel(v, navn, gameId) {
  const b = (s, n) => String(s).padEnd(n);
  const h = (s, n) => String(s).padStart(n);
  const linjer = [];
  linjer.push(`VERIFICÉR TOTALER · ${gameId}`);
  linjer.push('');
  linjer.push(`${b('spiller', 26)}${h('1X2', 8)}${h('chance', 8)}${h('combi', 8)}${h('pulje', 7)}${h('sum', 8)}${h('total', 8)}  bemærkning`);
  linjer.push('-'.repeat(96));
  for (const r of v.rows) {
    linjer.push(
      b((navn.get(r.uid) || r.uid).slice(0, 25), 26)
      + h(r.p1x2, 8) + h(r.chance, 8) + h(r.combi, 8) + h(r.pulje, 7)
      + h(r.sum, 8) + h(r.total, 8) + '  ' + (r.noter.join(' · ') || 'ok'),
    );
  }
  linjer.push('-'.repeat(96));
  linjer.push(`${b('I ALT', 26)}${h('', 39)}${h(v.iAlt, 8)}`);
  linjer.push('');
  linjer.push(v.fejl === 0 ? '✓ Ingen fejl fundet.' : `⚠️  ${v.fejl} problem(er) fundet.`);
  linjer.push('LÆS-ONLY — der er ikke skrevet noget.');
  return linjer;
}
