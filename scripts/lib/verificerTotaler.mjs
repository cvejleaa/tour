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
//
// FORÆLDET (task #14, D0). Intern konsistens fanger ikke en spiller, der aldrig
// blev genberegnet: mangler hans combi, er han stadig enig med sig selv (total
// 6 = rubrikker 6). Får `vurder` kampene og spil-dokumentet med, regnes hver
// spiller derfor også FORFRA af hans tips og spillets kampe — med de samme
// moduler som serveren og fladen (src/lib/pointOpdeling.js, spejlet af
// functions-platform/pointOpdeling.js) og samme startrunde-gate — og hans
// gemte `perRound` sammenlignes RUNDE FOR RUNDE med genberegningen. Pr. runde,
// ikke kun totalen: en combi for lidt i én runde og en for meget i en anden
// går ellers ud med hinanden (QC). Noten nævner ALLE afvigende runder og,
// hvor combi er en del af forskellen, hvor meget combi spilleren har til gode.

import { buildRoundContext, opdelPoint, maaVises } from '../../src/lib/pointOpdeling.js';
import { startRundeFor, gatedeKampe } from '../../src/lib/startGate.js';

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

/**
 * Chancen regnes som "negativ", når den er under dette — ikke ved -0,0 eller
 * afrundingsstøj. Rubrikken er allerede afrundet til én decimal (r1), så
 * enhver tærskel i (-0,1; 0] giver samme adfærd: første negative værdi, der
 * kan forekomme, er -0,1 (Test Manager: mutationer inden for det bånd
 * overlever med rette — de er ækvivalente, ikke udækkede).
 */
export const CHANCE_NEGATIV = -0.05;

export const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
/** Så meget må rubrikkerne pr. runde afvige fra rundens tal, før resten er point, opdelingen ikke kunne læse (serveren har allerede lagt ren afrunding i p1x2). */
export const RUNDE_TOLERANCE = 0.05;

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
 * Det, serveren regner en spiller forfra med: runde-konteksten af de
 * IKKE-gatede kampe og mængden af gatede kampe — præcis som
 * gameScoring.recomputeAllPlayerTotals (gatedIds → buildRoundContext af
 * resten). Regnede vi uden gaten, ville en spiller med tips i en gatet runde
 * få et for højt tal her, og forskellen blev læst som «forældet» — den
 * forkerte vej (samme fælde som audit-spiller-point.mjs beskriver).
 * @param {Array<object>} kampe  HELE kamplisten (med `id`)
 * @param {object|null} game     spil-dokumentet
 * @param {number} [nu]          tidspunktet, «intet tip»-tællingen måles mod
 */
export function facitKontekst(kampe, game, nu = Date.now()) {
  const alle = Array.isArray(kampe) ? kampe : [];
  const gated = gatedeKampe(alle, startRundeFor(game || null, alle));
  return { roundCtx: buildRoundContext(alle.filter((m) => !gated.has(m.id))), gated, nu };
}

/** Rundenøglerne i talorden, `uden` sidst — så tabellen læses som sæsonen. */
export function sorterRunder(noegler) {
  const tal = (k) => (Number.isFinite(Number(k)) ? Number(k) : Infinity);
  return [...noegler].sort((a, b) => tal(a) - tal(b) || String(a).localeCompare(String(b)));
}

/**
 * Er spillerens gemte total forældet i forhold til hans tips og kampene?
 *
 * Genberegner med opdelPoint (serverens eget regnestykke) og sammenligner
 * `perRound` RUNDE FOR RUNDE, plus totalen. En runde afviger, hvis den ene
 * side har nøglen og den anden ikke, eller tallene er mere end afrundingen
 * (RUNDE_TOLERANCE) fra hinanden. For hver afvigende runde: gemt og
 * genberegnet tal, combi gemt (af `opdelingPerRunde`, ellers ukendt) og
 * genberegnet, og hvor mange af kuponens kampe spilleren IKKE tippede — det
 * er det, der skiller «combi-hullet» (missede en kuponkamp) fra andre årsager
 * (fx en kamp, der er flyttet ind på eller ud af kuponen).
 *
 * «Intet tip» tælles KUN på kampe, hvis tips andre må se (maaVises: facit OG
 * kickoff passeret). Tabellen står i en OFFENTLIG Actions-log med navne; en
 * runde i gang, der afviger af en anden grund, ville ellers sige, om en
 * navngiven spiller har tippet en kamp, der ikke er startet — det skjuler
 * firestore.rules ellers (Security). Combi-hullet findes kun, når HELE
 * kuponen er afgjort, så det, målingen er til for, mister intet.
 *
 * @param {{uid:string, totalPoints?:unknown, perRound?:object, opdelingPerRunde?:object, bonusPoints?:unknown}} p
 * @param {Array<object>} egneBets  spillerens bets (alle — gaten lægges her)
 * @param {{roundCtx:object, gated:Set<string>, nu?:number}} ktx  fra facitKontekst
 * @returns {{totalGemt:number, totalNy:number, runder:Array<{runde:string, gemt:number|null, ny:number|null, combiGemt:number|null, combiNy:number, udenTip:number, kupon:number}>}}
 */
export function kontrollerForaeldet(p, egneBets, ktx) {
  const bets = (egneBets || []).filter((b) => !ktx.gated.has(b.matchId));
  const ny = opdelPoint({ bets, roundCtx: ktx.roundCtx, puljeBonus: Number(p.bonusPoints) || 0 });
  const gemtVektor = (p.perRound && typeof p.perRound === 'object') ? p.perRound : {};
  const gemtOpr = (p.opdelingPerRunde && typeof p.opdelingPerRunde === 'object') ? p.opdelingPerRunde : null;
  const tippet = new Set(bets.map((b) => b.matchId));
  const nu = Number.isFinite(ktx.nu) ? ktx.nu : Date.now();
  const runder = [];
  for (const k of sorterRunder(new Set([...Object.keys(gemtVektor), ...Object.keys(ny.perRunde)]))) {
    const gemt = k in gemtVektor ? r1(gemtVektor[k]) : null;
    const nyV = k in ny.perRunde ? r1(ny.perRunde[k]) : null;
    const ens = (gemt == null && nyV == null)
      || (gemt != null && nyV != null && Math.abs(gemt - nyV) <= RUNDE_TOLERANCE);
    if (ens) continue;
    const combiGemt = gemtOpr && gemtOpr[k] && typeof gemtOpr[k] === 'object' ? r1(gemtOpr[k].combi) : (gemt == null ? 0 : null);
    const combiNy = r1(ny.opdelingPerRunde[k]?.combi);
    // Kuponens kampe i runden, og hvor mange af dem spilleren ikke tippede.
    let kupon = 0;
    let udenTip = 0;
    for (const [id, info] of Object.entries(ktx.roundCtx.byMatch)) {
      if (String(info.round) !== k || !info.iVindue) continue;
      kupon += 1;
      if (!tippet.has(id) && maaVises(info, nu)) udenTip += 1;
    }
    runder.push({ runde: k, gemt, ny: nyV, combiGemt, combiNy, udenTip, kupon });
  }
  return { totalGemt: r1(p.totalPoints), totalNy: ny.total, runder };
}

/** Er forældet-svaret en afvigelse? Totalen ELLER en runde. */
export function erForaeldet(f) {
  return !!f && (f.runder.length > 0 || Math.abs(f.totalGemt - f.totalNy) > RUNDE_TOLERANCE);
}

const fortegn = (n) => (n > 0 ? `+${n}` : `${n}`);
/** Combi, spilleren har til gode i én afvigende runde (negativ = for meget). null = ukendt. */
export const combiTilGode = (r) => (r.combiGemt == null ? null : r1(r.combiNy - r.combiGemt));

/** Én afvigende runde som tekst: «runde 9: 6 → 11.7 (combi +5.7; intet tip på 1 af kuponens 3)». */
export function rundeTekst(r) {
  const tal = (v) => (v == null ? '–' : String(v));
  const c = combiTilGode(r);
  const dele = [];
  if (c == null) dele.push(`combi ? → ${r.combiNy}`);
  else if (c !== 0) dele.push(`combi ${fortegn(c)}`);
  if (r.kupon > 0 && r.udenTip > 0) dele.push(`intet tip på ${r.udenTip} af kuponens ${r.kupon}`);
  return `runde ${r.runde}: ${tal(r.gemt)} → ${tal(r.ny)}${dele.length ? ` (${dele.join('; ')})` : ''}`;
}

/**
 * Efterprøv ÉN spiller. Returnerer tallene til tabellen og de bemærkninger,
 * der gør rækken til en fejl. Tom `noter` = ok.
 * @param {{uid:string, totalPoints?:unknown, opdeling?:object}} p
 * @param {Set<string>} harIndsats
 * @param {{bets:Array<object>, ktx:{roundCtx:object, gated:Set<string>}}} [facit]
 *   Spillerens egne bets og facitKontekst. Uden den springes FORÆLDET over.
 */
export function kontrollerSpiller(p, harIndsats, facit = null) {
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

  // RUBRIKKERNE PR. RUNDE (opdelingPerRunde) — ligaens regnskab fra startrunden.
  // Feltet skrives sammen med perRound; mangler det hos en spiller, der HAR en
  // vektor, er spilleren ikke genberegnet siden udrulningen (🔄 Genberegn point).
  // En runde, hvis rubrikker ikke summer til rundens tal, er ikke en fejl men
  // point fra en kamp, opdelingen ikke kan læse (slettet kamp, kamp uden facit):
  // den vises som «–» i ligaens regnskab. Tælles for sig (`rester`), så den
  // kan måles FØR fladen stoler på feltet — og farver aldrig en kørsel rød.
  const rester = [];
  if (p.perRound && typeof p.perRound === 'object') {
    const opr = p.opdelingPerRunde;
    if (!opr || typeof opr !== 'object') {
      noter.push('INGEN OPDELING PR. RUNDE — kør Genberegn point for spillet');
    } else {
      for (const [k, v] of Object.entries(p.perRound)) {
        const rk = opr[k];
        if (!rk || typeof rk !== 'object') { noter.push(`RUNDE ${k} MANGLER I OPDELINGEN PR. RUNDE — kør Genberegn point`); continue; }
        const rs = r1((Number(rk.p1x2) || 0) + (Number(rk.chance) || 0) + (Number(rk.combi) || 0));
        if (Math.abs(rs - r1(v)) > RUNDE_TOLERANCE) rester.push(k);
      }
    }
  }

  // FORÆLDET: det gemte mod en genberegning forfra (se øverst). Står efter de
  // andre noter, så en spiller uden opdeling stadig får sin egen besked først.
  let foraeldet = null;
  if (facit) {
    foraeldet = kontrollerForaeldet(p, facit.bets, facit.ktx);
    if (erForaeldet(foraeldet)) {
      noter.push(`FORÆLDET: total gemt ${foraeldet.totalGemt}, genberegnet ${foraeldet.totalNy}`
        + (foraeldet.runder.length ? `; ${foraeldet.runder.map(rundeTekst).join(', ')}` : '')
        + ' — kør Genberegn point for spillet');
    } else {
      foraeldet = null;
    }
  }

  return { uid: p.uid, p1x2, chance, combi, pulje, sum, total, noter, rester, foraeldet };
}

/**
 * Efterprøv alle spillere. Rækkerne sorteres som stillingen (total faldende).
 * @param {Array<object>} spillere
 * @param {Array<object>} bets  ALLE spillets bets
 * @param {{kampe:Array<object>, game:object|null, nu?:number}} [kilde]  Med kampene og
 *   spil-dokumentet regnes hver spiller også forfra (FORÆLDET). Uden: kun den
 *   interne konsistens, som før. `nu` (standard Date.now()) er til testene.
 * @returns {{ rows: Array, fejl: number, rester: number, iAlt: number, foraeldede: number, foraeldetPrRunde?: Array }}
 */
export function vurder(spillere, bets, kilde = null) {
  const harIndsats = harIndsatsAf(bets);
  let facitFor = () => null;
  if (kilde) {
    const ktx = facitKontekst(kilde.kampe, kilde.game, kilde.nu);
    const perUid = new Map();
    for (const b of bets) {
      if (!b || !b.uid) continue;
      if (!perUid.has(b.uid)) perUid.set(b.uid, []);
      perUid.get(b.uid).push(b);
    }
    facitFor = (uid) => ({ bets: perUid.get(uid) || [], ktx });
  }
  const rows = [...spillere]
    .sort((x, y) => (Number(y.totalPoints) || 0) - (Number(x.totalPoints) || 0))
    .map((p) => kontrollerSpiller(p, harIndsats, facitFor(p.uid)));
  const fejl = rows.reduce((a, r) => a + r.noter.length, 0);
  const rester = rows.reduce((a, r) => a + (r.rester.length ? 1 : 0), 0);
  const iAlt = r1(spillere.reduce((a, p) => a + (Number(p.totalPoints) || 0), 0));
  const foraeldede = rows.filter((r) => r.foraeldet).length;
  const ud = { rows, fejl, rester, iAlt, foraeldede };
  if (kilde) ud.foraeldetPrRunde = foraeldetPrRunde(rows);
  return ud;
}

/**
 * Forældet-listen vendt om: PR. RUNDE, hvem står forkert, og hvor meget combi
 * de har til gode. Det er listen, ejeren afgør genberegningen på.
 * @returns {Array<{runde:string, spillere:Array<{uid:string, gemt:number|null, ny:number|null, combi:number|null, udenTip:number, kupon:number}>, combiIAlt:number, combiUkendt:number}>}
 */
export function foraeldetPrRunde(rows) {
  const perRunde = new Map();
  for (const row of rows) {
    if (!row.foraeldet) continue;
    for (const r of row.foraeldet.runder) {
      if (!perRunde.has(r.runde)) perRunde.set(r.runde, []);
      perRunde.get(r.runde).push({ uid: row.uid, gemt: r.gemt, ny: r.ny, combi: combiTilGode(r), udenTip: r.udenTip, kupon: r.kupon });
    }
  }
  return sorterRunder(perRunde.keys()).map((runde) => {
    const spillere = perRunde.get(runde).sort((a, b) => (b.combi ?? -Infinity) - (a.combi ?? -Infinity) || String(a.uid).localeCompare(String(b.uid)));
    return {
      runde,
      spillere,
      combiIAlt: r1(spillere.reduce((a, s) => a + (s.combi ?? 0), 0)),
      combiUkendt: spillere.filter((s) => s.combi == null).length,
    };
  });
}

/** Et tal, som spillerne skriver det: decimalkomma. */
const komma = (n) => String(n).replace('.', ',');

/**
 * Én færdig sætning til ligaens væg om en runde, hvor combi manglede — så en
 * bagfyldning bliver noget at snakke om og ikke en tavs ændring af stillingen
 * (Spilfører). Ejeren kopierer den og skriver den som sig selv; der sendes
 * ingen mail. Kun spillere med combi TIL GODE (> 0) nævnes: en combi for
 * meget eller en ukendt er ikke en nyhed, man lægger på væggen. null = ingen
 * sætning.
 * @param {{runde:string, spillere:Array<{uid:string, combi:number|null}>}} r  én række fra foraeldetPrRunde
 * @param {(uid:string) => string} navnAf  visningsnavn — sætningen renses af tabel()
 */
export function vaegSaetning(r, navnAf) {
  const plus = r.spillere.filter((s) => s.combi != null && s.combi > 0);
  if (!plus.length) return null;
  const stoerst = plus.reduce((a, s) => (s.combi > a.combi ? s : a));
  const hvem = plus.length === 1 ? '1 spiller' : `${plus.length} spillere`;
  return `Rettelse: combi'en fra runde ${r.runde} manglede hos ${hvem} og er nu lagt til. `
    + `Største: ${navnAf(stoerst.uid)} +${komma(stoerst.combi)}.`;
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
  // Visningsnavnet er brugerstyret tekst uden indholdsvagt i firestore.rules
  // (kun typen er tjekket). Et navn med linjeskift eller ANSI kunne lægge en
  // falsk «✓ Ingen fejl fundet.» eller en `::error::`-annotering i kolonne 0
  // af Actions-loggen (Security-fund, målt). Alle styretegn bliver mellemrum —
  // ÉT sted, så enhver skriver af tabellen er dækket. String() tåler et navn,
  // der ikke er en streng (skrevet via konsol/Admin SDK) i stedet for at vælte.
  // Navnet står i KOLONNE 0, så et navn, der begynder med «::error::», er en
  // workflow-kommando uden et eneste styretegn — indledende koloner fjernes.
  // eslint-disable-next-line no-control-regex
  const rent = (s) => String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/^:+/, '');
  const h = (s, n) => String(s).padStart(n);
  const linjer = [];
  linjer.push(`VERIFICÉR TOTALER · ${gameId}`);
  linjer.push('');
  linjer.push(`${b('spiller', 26)}${h('1X2', 8)}${h('chance', 8)}${h('combi', 8)}${h('pulje', 7)}${h('sum', 8)}${h('total', 8)}  bemærkning`);
  linjer.push('-'.repeat(96));
  for (const r of v.rows) {
    linjer.push(
      b(rent(navn.get(r.uid) || r.uid).slice(0, 25), 26)
      + h(r.p1x2, 8) + h(r.chance, 8) + h(r.combi, 8) + h(r.pulje, 7)
      // Noterne og resterne bærer RUNDE-NØGLER fra dokumentet — samme rensning
      // som navnet, for en nøgle med linjeskift er lige så meget en
      // `::error::`-annotering (Security-fund på opdelingPerRunde).
      + h(r.sum, 8) + h(r.total, 8) + '  ' + (rent(r.noter.join(' · ')) || 'ok')
      + (r.rester.length ? ` · ulæselig rest i runde ${rent(r.rester.join(', '))}` : ''),
    );
  }
  linjer.push('-'.repeat(96));
  linjer.push(`${b('I ALT', 26)}${h('', 39)}${h(v.iAlt, 8)}`);
  if (v.foraeldetPrRunde) {
    // PR. RUNDE: hvem står forkert, og hvor meget combi de har til gode. Det
    // er listen, ejeren afgør genberegningen på (docs/drift.md).
    linjer.push('');
    linjer.push('FORÆLDET PR. RUNDE (gemt → genberegnet forfra af tips og kampe)');
    if (!v.foraeldetPrRunde.length) linjer.push('  ingen — alle gemte totaler stemmer med en genberegning');
    for (const r of v.foraeldetPrRunde) {
      linjer.push(`  runde ${rent(r.runde)}: ${r.spillere.length} spiller(e), combi til gode i alt ${fortegn(r.combiIAlt)}`
        + (r.combiUkendt ? ` (+ ${r.combiUkendt} med ukendt gemt combi)` : ''));
      for (const s of r.spillere) {
        linjer.push(`    ${b(rent(navn.get(s.uid) || s.uid).slice(0, 25), 26)}${h(s.gemt ?? '–', 8)} →${h(s.ny ?? '–', 7)}`
          + `   combi ${s.combi == null ? '?' : fortegn(s.combi)}`
          + (s.kupon > 0 && s.udenTip > 0 ? `   intet tip på ${s.udenTip} af kuponens ${s.kupon}` : ''));
      }
      const v = vaegSaetning(r, (uid) => navn.get(uid) || uid);
      // Navnet og rundenøglen er data fra dokumentet — HELE sætningen renses
      // ét sted (en ekstra rensning af navnet alene var en overlevende mutant).
      if (v) linjer.push(`    til væggen efter 🔄: «${rent(v)}»`);
    }
  }
  linjer.push('');
  linjer.push(v.fejl === 0 ? '✓ Ingen fejl fundet.' : `⚠️  ${v.fejl} problem(er) fundet.`);
  if (v.foraeldede > 0) {
    linjer.push(`⚠️  ${v.foraeldede} spiller(e) har en FORÆLDET total — svaret er 🔄 Genberegn point for spillet, `
      + 'men kun med ejerens ja (det flytter stillingen).');
  }
  if (v.rester > 0) {
    linjer.push(`ℹ️  ${v.rester} spiller(e) har point fra kampe, opdelingen ikke kan læse (rubrikkerne pr. runde summer ikke) `
      + '— vises som «–» i ligaens regnskab. Ikke en fejl.');
  }
  linjer.push('LÆS-ONLY — der er ikke skrevet noget.');
  return linjer;
}
