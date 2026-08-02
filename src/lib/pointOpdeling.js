// ---------------------------------------------------------------------------
// src/lib/pointOpdeling.js — hvor en spillers point KOMMER FRA.
//
// SPEJLET FIL: functions-platform/pointOpdeling.js skal følges ad (CLAUDE.md).
// Serveren regner tallene og gemmer dem; klienten bruger samme modul til at
// vise en spillers egen historik uden at vente på en server-tur.
//
// Findes, fordi totalen blev regnet to steder ad hver sin vej — og de var
// allerede uenige: tipsHistory glemte puljebonussen, mens stillingen tog den
// med. To formler for "point i alt" driver fra hinanden ved næste ændring.
// ---------------------------------------------------------------------------

import { outcomePoints, outcomeReward, roundComboBonus, round1 } from './superligaScoring';

/**
 * Tæller kampens point med i TOTALEN? Kun ét krav: kampen skal være afgjort.
 *
 * Bevidst uden kickoff-tjek — det bor i maaVises() nedenfor. Blandede vi de to,
 * ville kickoff gate totalen, og et forkert gemt tidspunkt kunne fjerne point
 * fra stillingen.
 */
function taeller(info) {
  return !!(info && info.result);
}

/**
 * Må kampens RÆKKE vises for andre? Strengere end taeller().
 *
 * De to filtre er med vilje adskilt. Blander man dem, gater kickoff også
 * TOTALEN — og så forsvinder point fra stillingen, hvis vores gemte kickoff er
 * forkert. Det sker: ligaen flytter en kamp, facit kommer fra API'et uanset
 * hvad vi har gemt, og lander det før vores kickoff, taber alle tippere deres
 * point for den kamp. Tavst, indtil en anden kamp tilfældigvis genberegner dem.
 *
 * Her er kravet derimod nødvendigt og skal være STRENGT: rækkerne havner i et
 * dokument, liga-kammerater må læse, og det kommer aldrig forbi kickoff-tjekket
 * i firestore.rules. Et ulæseligt kickoff må derfor betyde "vis ikke", ikke
 * "vis alligevel" — ellers kunne et tip blive udstillet før kampstart.
 */
function maaVises(info, nowMs) {
  if (!taeller(info)) return false;
  return Number.isFinite(info.kickoff) && info.kickoff <= nowMs;
}

/**
 * Combi-bonus for én spillers bets. Gives kun når HELE runden er spillet, og
 * spilleren har tippet alle kampe i den — med 0 eller 1 fejl.
 *
 * @param {Array<{matchId:string, pick:string}>} bets
 * @param {{byMatch:object, rounds:object}|null} roundCtx
 */
export function combiBonus(bets, roundCtx) {
  if (!roundCtx) return 0;
  const byRound = new Map();
  for (const b of bets) {
    const info = roundCtx.byMatch[b.matchId];
    if (!info) continue;
    if (!byRound.has(info.round)) byRound.set(info.round, []);
    byRound.get(info.round).push(b);
  }
  let bonus = 0;
  for (const [round, pbs] of byRound) {
    const rc = roundCtx.rounds[round];
    if (!rc || rc.count < 2) continue;
    if (rc.settledCount !== rc.count) continue; // runden ikke helt afgjort
    if (pbs.length !== rc.count) continue;      // tippede ikke alle kampe
    const hitOdds = [];
    for (const pb of pbs) {
      const info = roundCtx.byMatch[pb.matchId];
      if (info.result && pb.pick === info.result) hitOdds.push(outcomeReward(info.result, info.odds));
    }
    bonus += roundComboBonus(hitOdds, rc.count);
  }
  return bonus;
}

/**
 * Del en spillers point op i de fire kilder, spillet har.
 *
 * `bets` skal ALLEREDE være renset for gatede kampe (kampe før game.startAt) —
 * samme kontrakt som recalcPlayerTotal har i dag. Filteret for "afgjort og
 * begyndt" bor derimod HER, så de to flader ikke kan blive uenige om, hvilke
 * kampe der tæller.
 *
 * Chancen UDLEDES som (gemte point − 1X2-point). Den må aldrig genberegnes:
 * serveren afregner med clampStake UDEN bank-loft, så en genberegning på
 * klienten ville give et andet tal, og delene ville ikke summe til totalen.
 *
 * @param {{bets?:Array, roundCtx?:object|null, puljeBonus?:number, nowMs?:number}} arg
 * @returns {{p1x2:number, chance:number, combi:number, pulje:number,
 *            total:number, kampe:Array}}
 */
export function opdelPoint({ bets = [], roundCtx = null, puljeBonus = 0, nowMs = Date.now() } = {}) {
  const byMatch = roundCtx?.byMatch || {};
  const afgjorte = []; // kendt og afgjort → kan deles op i rubrikker
  const kampe = [];    // må vises for andre
  let p1x2 = 0;
  let chance = 0;
  // Summen af ALLE bet-point — præcis som recalcPlayerTotal regnede før.
  //
  // Totalen må IKKE afhænge af, om runde-konteksten er komplet. Regnede vi den
  // ud af rubrikkerne, ville en ufuldstændig kamplæsning — eller et slettet
  // kampdokument — nulstille spillerens stilling, tavst. Rubrikkerne er
  // best-effort; totalen er stillingen.
  let raw = 0;

  for (const b of bets) {
    raw += Number(b.points) || 0;
    const info = byMatch[b.matchId];
    if (!taeller(info)) continue;
    const tip = outcomePoints(b.pick, info.result, info.odds);
    p1x2 += tip;
    chance += (Number(b.points) || 0) - tip;
    afgjorte.push(b);
    if (maaVises(info, nowMs)) kampe.push(b);
  }

  // Combi regnes på ALLE afgjorte kampe, ikke kun de synlige. Ellers ville en
  // kamp med et ulæseligt kickoff koste spilleren hans rundebonus.
  const combi = combiBonus(afgjorte, roundCtx);
  const pulje = Number(puljeBonus) || 0;

  // Totalen afrundes ÉN gang og gulves ÉN gang — nøjagtig som recalcPlayerTotal.
  // Rubrikkerne afrundes hver for sig, fordi de skal vises. De to ting kan
  // derfor afvige nogle tiendedele; totalen er den autoritative.
  return {
    p1x2: round1(p1x2),
    chance: round1(chance),
    combi: round1(combi),
    pulje: round1(pulje),
    // raw, ikke p1x2 + chance: identisk med den gamle formel i
    // recalcPlayerTotal, så stillingen ikke kan flytte sig af denne ændring.
    total: Math.max(0, round1(raw + combi + pulje)),
    // Samme sum UDEN gulvet. Fladen har brug for begge tal: gulvet kan gøre
    // forskellen mellem rubrikkerne og totalen enorm — 11 + (−44,8) + 8,5 giver
    // en total på 0 — og uden det rå tal kan skærmen ikke forklare, hvorfor de
    // fire tal ikke summer til det femte. Saldoen går aldrig i minus, men det
    // skal siges, ikke skjules.
    raaTotal: round1(raw + combi + pulje),
    kampe,
  };
}
