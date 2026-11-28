/**
 * quiz.js — en quiz om, hvordan det går (og er gået) for ÉN liga på tværs af
 * spillene: VM 2026 og Tour de France (afsluttede, i hver sin gamle app) og
 * Superligaen og Premier League (i gang her på platformen).
 *
 * REN FUNKTION: data ind, spørgsmål ud. Ingen Firestore her — QuizTab henter.
 *
 * KILDERNE ER LEVENDE, IKKE KOPIER. VM og Tour findes kun som de top 5, der
 * blev eksporteret til `legacyLeagueResults` (scripts/export-legacy-league-
 * results.mjs) — derfor spørger runde 1 kun om det, den eksport rummer
 * (placering, point, antal deltagere). Superligaen og PL regnes af ligaens
 * stilling (samme ligaRanking som Stilling-fanen) og af tippene + kampene.
 *
 * Hvert spørgsmål er { type: 'valg'|'aaben', spil, tekst, svar, valg? }.
 * Et spørgsmål med uafgjort svar (to deler førstepladsen) springes over og
 * erstattes af et reservespørgsmål — en multiple choice med to rigtige svar
 * ville være en løgn i quizzen. Runden fyldes op til 10, så langt data rækker.
 */
import { fmtPoints } from '../../lib/daNum';

export const PR_RUNDE = 10;

/** Deterministisk "tilfældig" orden ud fra en tekst — stabil mellem renders. */
function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Fire svarmuligheder: det rigtige + tre andre fra `pulje`, i en orden der
 * afhænger af spørgsmålet (ikke af renderingen). Færre end 2 i alt → null.
 */
export function svarMuligheder(rigtigt, pulje, noegle) {
  const andre = [...new Set(pulje.filter((n) => n && n !== rigtigt))]
    .sort((a, b) => hash(`${noegle}|${a}`) - hash(`${noegle}|${b}`))
    .slice(0, 3);
  if (andre.length === 0) return null;
  return [rigtigt, ...andre].sort((a, b) => hash(`${noegle}#${a}`) - hash(`${noegle}#${b}`));
}

/** Er placeringen `rank` entydig (kun én række har den)? */
function entydig(rows, rank) {
  return rows.filter((r) => r.rank === rank).length === 1;
}

const navnPaa = (rows, rank) => rows.find((r) => r.rank === rank)?.name ?? null;

/** Multiple choice om hvem der står på en placering — null hvis delt/ukendt. */
function hvemPaaPlads(rows, rank, tekst, spil, pulje) {
  if (!rows?.length || !entydig(rows, rank)) return null;
  const navn = navnPaa(rows, rank);
  const valg = svarMuligheder(navn, pulje ?? rows.map((r) => r.name), tekst);
  return valg ? { type: 'valg', spil, tekst, svar: navn, valg } : null;
}

const aaben = (spil, tekst, svar) => ({ type: 'aaben', spil, tekst, svar });

// ---------------------------------------------------------------------------
// Runde 1: VM 2026 og Tour de France (top 5 fra den gamle app)
// ---------------------------------------------------------------------------

/**
 * @param {{name:string, memberCount:number, top:Array<{rank,name,points}>}|null} vm
 * @param {{...}|null} tour
 * @param {{superliga?: number, pl?: number}} antalLive  medlemstal i de levende spil
 */
export function rundeEt(vm, tour, antalLive = {}) {
  const kandidater = [];
  const vT = vm?.top || [];
  const tT = tour?.top || [];
  const vmNavne = vT.map((r) => r.name);
  const tourNavne = tT.map((r) => r.name);
  const alleNavne = [...vmNavne, ...tourNavne];

  if (vT.length) {
    kandidater.push(hvemPaaPlads(vT, 1, 'Hvem vandt ligaen til VM 2026?', 'VM 2026', alleNavne));
    if (entydig(vT, 1)) kandidater.push(aaben('VM 2026', 'Hvor mange point fik vinderen til VM 2026?', `${fmtPoints(vT[0].points)} point (${vT[0].name})`));
    kandidater.push(hvemPaaPlads(vT, 2, 'Hvem blev nr. 2 til VM 2026?', 'VM 2026', alleNavne));
    if (vm.memberCount) kandidater.push(aaben('VM 2026', 'Hvor mange var med i ligaen til VM 2026?', `${vm.memberCount}`));
  }
  if (tT.length) {
    kandidater.push(hvemPaaPlads(tT, 1, 'Hvem vandt ligaen i Tour de France?', 'Tour de France', alleNavne));
    if (tT.length >= 2 && entydig(tT, 1)) {
      const forskel = Math.round((tT[0].points - tT[1].points) * 10) / 10;
      kandidater.push(aaben('Tour de France', 'Hvor mange point skilte vinderen og nr. 2 i Tour de France?', `${fmtPoints(forskel)} point (${tT[0].name} ${fmtPoints(tT[0].points)} – ${tT[1].name} ${fmtPoints(tT[1].points)})`));
    }
    kandidater.push(hvemPaaPlads(tT, 3, 'Hvem blev nr. 3 i Tour de France?', 'Tour de France', alleNavne));
    if (tour.memberCount) kandidater.push(aaben('Tour de France', 'Hvor mange var med i ligaen i Tour de France?', `${tour.memberCount}`));
  }

  // På tværs: hvem var i top 5 i BEGGE sommerens spil?
  if (vT.length && tT.length) {
    const begge = vmNavne.filter((n) => tourNavne.includes(n));
    const kunEt = [...new Set(alleNavne)].filter((n) => !begge.includes(n));
    if (begge.length === 1 && kunEt.length >= 1) {
      const valg = svarMuligheder(begge[0], kunEt, 'begge-top5');
      if (valg) kandidater.push({ type: 'valg', spil: 'VM + Tour', tekst: 'Hvem af disse sluttede i top 5 i både VM 2026 og Tour de France?', svar: begge[0], valg });
    } else {
      kandidater.push(aaben('VM + Tour', 'Hvor mange sluttede i top 5 i både VM 2026 og Tour de France?', begge.length ? `${begge.length} (${begge.join(', ')})` : '0 — ingen'));
    }
  }

  // Hvilket spil havde flest med i ligaen? Kun hvis svaret er entydigt.
  const tal = [
    ['VM 2026', vm?.memberCount], ['Tour de France', tour?.memberCount],
    ['Superligaen', antalLive.superliga], ['Premier League', antalLive.pl],
  ].filter(([, n]) => Number(n) > 0);
  if (tal.length >= 2) {
    const max = Math.max(...tal.map(([, n]) => n));
    const flest = tal.filter(([, n]) => n === max);
    if (flest.length === 1) {
      kandidater.push({
        type: 'valg', spil: 'Alle spil', tekst: 'I hvilket spil havde ligaen flest deltagere?',
        svar: `${flest[0][0]} (${max})`,
        valg: svarMuligheder(flest[0][0], tal.map(([s]) => s), 'flest-deltagere'),
        svarValg: flest[0][0],
      });
    }
  }

  // Reserver — bruges kun, hvis noget ovenfor faldt bort.
  if (vT.length >= 5) kandidater.push(aaben('VM 2026', 'Hvor mange point skulle der til for en top 5-plads til VM 2026?', `${fmtPoints(vT[4].points)} point (${vT[4].name})`));
  if (tT.length && entydig(tT, 1)) kandidater.push(aaben('Tour de France', 'Hvor mange point fik vinderen i Tour de France?', `${fmtPoints(tT[0].points)} point (${tT[0].name})`));
  if (vT.length) kandidater.push(hvemPaaPlads(vT, 3, 'Hvem blev nr. 3 til VM 2026?', 'VM 2026', alleNavne));
  if (tT.length) kandidater.push(hvemPaaPlads(tT, 2, 'Hvem blev nr. 2 i Tour de France?', 'Tour de France', alleNavne));

  return kandidater.filter(Boolean).slice(0, PR_RUNDE);
}

// ---------------------------------------------------------------------------
// Runde 2: Superligaen og Premier League (i gang)
// ---------------------------------------------------------------------------

/**
 * Statistik pr. spiller af tip + kampe. Kun kampe med facit og (har ligaen en
 * startrunde) kun runder fra ligaens start — så tallene passer til ligaens
 * egen stilling.
 */
export function tipStatistik(bets, matches, startRunde = null) {
  const kampe = new Map((matches || []).map((m) => [m.id, m]));
  const pr = new Map();
  let bedsteKamp = null;
  const ramtePrKamp = new Map();
  for (const b of bets || []) {
    const m = kampe.get(b.matchId);
    if (!m || !m.result || !b.uid) continue;
    if (startRunde != null && Number(m.round) < startRunde) continue;
    const s = pr.get(b.uid) || { tippet: 0, ramt: 0, chancer: 0, chanceNetto: 0 };
    s.tippet += 1;
    const ramt = b.pick === m.result;
    if (ramt) {
      s.ramt += 1;
      ramtePrKamp.set(m.id, (ramtePrKamp.get(m.id) || 0) + 1);
    }
    const stake = Number(b.chanceStake) || 0;
    const point = Number(b.points);
    if (stake > 0 && Number.isFinite(point)) {
      s.chancer += 1;
      // Serverens points = tip + chance; et tabt tip giver 0 for tippet, så
      // dets points ER chance-tabet. Ramt: points − kampens odds for udfaldet.
      const tip = ramt && Number.isFinite(m.odds?.[b.pick]) ? Number(m.odds[b.pick]) : 0;
      s.chanceNetto = Math.round((s.chanceNetto + point - tip) * 10) / 10;
    }
    if (Number.isFinite(point) && (!bedsteKamp || point > bedsteKamp.point)) {
      bedsteKamp = { uid: b.uid, point, kamp: `${m.home}–${m.away}`, matchId: m.id };
    }
    pr.set(b.uid, s);
  }
  // Delt bedste enkeltkamp? Så er spørgsmålet ikke entydigt.
  if (bedsteKamp) {
    const lige = (bets || []).filter((b) => Number(b.points) === bedsteKamp.point
      && kampe.get(b.matchId)?.result
      && (startRunde == null || Number(kampe.get(b.matchId).round) >= startRunde));
    if (lige.length > 1) bedsteKamp = { ...bedsteKamp, delt: true };
  }
  let mestRamte = null;
  for (const [id, n] of ramtePrKamp) {
    if (!mestRamte || n > mestRamte.n) mestRamte = { id, n, delt: false };
    else if (n === mestRamte.n) mestRamte.delt = true;
  }
  if (mestRamte) {
    const m = kampe.get(mestRamte.id);
    mestRamte.kamp = `${m.home}–${m.away}`;
  }
  return { pr, bedsteKamp, mestRamte };
}

/** Den med højest værdi af f(stat) — null hvis delt eller tomt. */
function bedsteAf(rows, statPr, f) {
  const vaerdier = rows.map((r) => ({ r, v: statPr.get(r.uid) ? f(statPr.get(r.uid)) : null }))
    .filter((x) => x.v != null);
  if (!vaerdier.length) return null;
  const max = Math.max(...vaerdier.map((x) => x.v));
  const top = vaerdier.filter((x) => x.v === max);
  return top.length === 1 ? { navn: top[0].r.name, v: max } : null;
}

/**
 * @param {{rows:Array<{uid,name,rank,totalPoints}>, bets:Array, matches:Array, startRound?:number}|null} sl
 * @param {{...}|null} pl
 */
export function rundeTo(sl, pl) {
  const k = [];
  const spil = [['Superligaen', sl], ['Premier League', pl]];

  for (const [navn, d] of spil) {
    if (!d?.rows?.length) continue;
    const rows = d.rows;
    const navne = rows.map((r) => r.name);
    const { pr, bedsteKamp } = tipStatistik(d.bets, d.matches, d.startRound ?? null);
    k.push(hvemPaaPlads(rows, 1, `Hvem fører ligaen i ${navn} lige nu?`, navn, navne));
    if (entydig(rows, 1)) k.push(aaben(navn, `Hvor mange point har føreren i ${navn}?`, `${fmtPoints(rows[0].totalPoints)} point (${rows[0].name})`));
    const flestRamt = bedsteAf(rows, pr, (s) => s.ramt);
    if (flestRamt) {
      const valg = svarMuligheder(flestRamt.navn, navne, `ramt-${navn}`);
      if (valg) k.push({ type: 'valg', spil: navn, tekst: `Hvem har ramt flest kampe i ${navn}?`, svar: `${flestRamt.navn} (${flestRamt.v} rigtige)`, svarValg: flestRamt.navn, valg });
    }
    const chance = bedsteAf(rows, pr, (s) => (s.chancer ? s.chanceNetto : null));
    if (chance && chance.v > 0) {
      const valg = svarMuligheder(chance.navn, navne, `chance-${navn}`);
      if (valg) k.push({ type: 'valg', spil: navn, tekst: `Hvem har tjent mest på ⚡ Chancen i ${navn}?`, svar: `${chance.navn} (netto ${fmtPoints(chance.v)} point)`, svarValg: chance.navn, valg });
    }
    if (bedsteKamp && !bedsteKamp.delt) {
      const hvem = rows.find((r) => r.uid === bedsteKamp.uid)?.name;
      if (hvem) k.push(aaben(navn, `Hvem fik flest point på én enkelt kamp i ${navn} — og hvor mange?`, `${hvem}: ${fmtPoints(bedsteKamp.point)} point på ${bedsteKamp.kamp}`));
    }
  }

  // Reserver og tværgående.
  for (const [navn, d] of spil) {
    if (!d?.rows?.length) continue;
    const rows = d.rows;
    const sidst = Math.max(...rows.map((r) => r.rank));
    k.push(hvemPaaPlads(rows, sidst, `Hvem ligger sidst i ligaen i ${navn}?`, navn, rows.map((r) => r.name)));
    if (rows.length >= 2) {
      const forskel = Math.round((rows[0].totalPoints - rows[rows.length - 1].totalPoints) * 10) / 10;
      k.push(aaben(navn, `Hvor mange point er der mellem nr. 1 og sidstepladsen i ${navn}?`, `${fmtPoints(forskel)} point`));
    }
    const { pr, mestRamte } = tipStatistik(d.bets, d.matches, d.startRound ?? null);
    const brugte = [...pr.values()].reduce((s, x) => s + x.chancer, 0);
    if (brugte) k.push(aaben(navn, `Hvor mange gange har ligaen samlet brugt ⚡ Chancen på afgjorte kampe i ${navn}?`, `${brugte}`));
    if (mestRamte && !mestRamte.delt) k.push(aaben(navn, `Hvilken kamp i ${navn} ramte flest i ligaen rigtigt?`, `${mestRamte.kamp} (${mestRamte.n} ramte)`));
  }
  if (sl?.rows?.length && pl?.rows?.length) {
    const sum = new Map();
    for (const r of [...sl.rows, ...pl.rows]) {
      const s = sum.get(r.uid) || { name: r.name, p: 0, n: 0 };
      s.p += r.totalPoints; s.n += 1; sum.set(r.uid, s);
    }
    const begge = [...sum.values()].filter((s) => s.n === 2);
    if (begge.length >= 2) {
      const max = Math.max(...begge.map((s) => s.p));
      const top = begge.filter((s) => s.p === max);
      if (top.length === 1) {
        const valg = svarMuligheder(top[0].name, begge.map((s) => s.name), 'samlet-sl-pl');
        if (valg) k.push({ type: 'valg', spil: 'Superligaen + PL', tekst: 'Hvem har flest point, når man lægger Superligaen og Premier League sammen?', svar: `${top[0].name} (${fmtPoints(Math.round(max * 10) / 10)} point)`, svarValg: top[0].name, valg });
      }
    }
  }
  // Kerne-spørgsmålene står først; flyt det tværgående op, hvis det findes,
  // så runden altid slutter med en samlet afslutning.
  return k.filter(Boolean).slice(0, PR_RUNDE);
}

/** Hele quizzen: 2 runder à (op til) 10 spørgsmål. */
export function lavQuiz({ vm = null, tour = null, sl = null, pl = null } = {}) {
  return [
    { titel: 'Runde 1 · Sommerens spil (VM 2026 og Tour de France)', spoergsmaal: rundeEt(vm, tour, { superliga: sl?.rows?.length, pl: pl?.rows?.length }) },
    { titel: 'Runde 2 · Sæsonen lige nu (Superligaen og Premier League)', spoergsmaal: rundeTo(sl, pl) },
  ];
}
