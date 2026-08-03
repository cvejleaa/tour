'use strict';
// ---------------------------------------------------------------------------
// tourSummary.js — rene funktioner der udleder løbs-tilbageblikket (GC-podie,
// trøjevindere, etapesejre og fakta) fra de afgjorte etape-dokumenter (+ det
// fulde klassement i config/classifications). Bruges af takke-mailen.
// Server-testbar: ingen Firestore/IO her.
//
// Etape-dokumentets form (skrevet af syncTourCore):
//   { number, status:'done', result:{winnerTeam,gcTeam,mountainTeam,sprintTeam,podium},
//     jerseys:{yellow,green,polka,white,teamLead}, km, startCity, finishCity,
//     resultRows:[{rank,rider,team,time,points}], mountainRows, sprintRows, holdRows }
// config/classifications (skrevet efter seneste afgjorte etape):
//   { afterStage, previousYear, standings:{samlet:[{rank,rider,team,time}], ...}, jerseys }
// ---------------------------------------------------------------------------

/** Kun etaper der er afgjort med et facit, sorteret efter etapenummer. */
function decidedStages(stages) {
  return (stages || [])
    .filter((s) => s && s.status === 'done' && s.result)
    .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
}

/** Seneste afgjorte etape (højeste nummer) — eller null. */
function lastDecidedStage(stages) {
  const done = decidedStages(stages);
  return done.length ? done[done.length - 1] : null;
}

/**
 * Trøjevindere: indehaverne efter den SIDSTE afgjorte etape (jerseys skrives af
 * synken på hver etape; den sidste etapes indehavere ER slutvinderne).
 * @returns {{afterStage:number, yellow, green, polka, white, teamLead}|null}
 */
function computeJerseyWinners(stages) {
  const last = lastDecidedStage(stages);
  if (!last || !last.jerseys) return null;
  const j = last.jerseys;
  return {
    afterStage: Number(last.number) || null,
    yellow: j.yellow || null,
    green: j.green || null,
    polka: j.polka || null,
    white: j.white || null,
    teamLead: j.teamLead || null,
  };
}

/**
 * Det endelige GC-podie (samlet klassement, top 3) fra config/classifications —
 * etape-dokumenterne gemmer kun trøje-INDEHAVERNE, ikke hele klassementet.
 * Et sidste-års-preview (previousYear:true) ignoreres. Falder tilbage til den
 * gule trøjes indehaver alene (podie med én række), hvis klassementet mangler.
 * @param {object|null} classifications  config/classifications-data
 * @param {Array} stages  alle etape-dokumenter (til fallback)
 * @returns {{afterStage:number|null, rows:Array<{rank,rider,team,time}>}|null}
 */
function computeGcPodium(classifications, stages) {
  const c = classifications;
  const rows = c && c.previousYear !== true && c.standings && Array.isArray(c.standings.samlet)
    ? c.standings.samlet : [];
  if (rows.length) {
    return {
      afterStage: Number(c.afterStage) || null,
      rows: rows.slice(0, 3).map((r, i) => ({
        rank: Number.isFinite(Number(r && r.rank)) ? Number(r.rank) : i + 1,
        rider: (r && r.rider) || null,
        team: (r && r.team) || null,
        time: (r && r.time) || null,
      })),
    };
  }
  // Fallback: kun vinderen (den gule trøje efter sidste etape).
  const j = computeJerseyWinners(stages);
  if (!j || !j.yellow) return null;
  return { afterStage: j.afterStage, rows: [{ rank: 1, rider: j.yellow, team: null, time: null }] };
}

/**
 * Etapesejrs-tællingen: vinderen af hver etape er nr. 1 i målrækkefølgen
 * (resultRows[0]). Etaper uden rytter-navn (fx en holdtidskørsel, hvor "rytteren"
 * er et hold, eller manglende visningsdata) tælles på holdet fra Q1-facittet.
 * @returns {Array<{rider:string|null, team:string|null, wins:number, stages:number[]}>}
 *   sorteret: flest sejre først, tiebreak navn (dansk).
 */
function computeStageWins(stages) {
  const agg = new Map(); // nøgle: rytter (eller 'team:X') → {rider, team, wins, stages}
  for (const s of decidedStages(stages)) {
    const first = Array.isArray(s.resultRows) ? s.resultRows[0] : null;
    const rider = first && first.rider ? String(first.rider) : null;
    const team = (first && first.team) || (s.result && s.result.winnerTeam) || null;
    if (!rider && !team) continue;
    const key = rider || `team:${team}`;
    const a = agg.get(key) || { rider, team, wins: 0, stages: [] };
    a.wins += 1;
    if (Number.isFinite(Number(s.number))) a.stages.push(Number(s.number));
    if (!a.team && team) a.team = team;
    agg.set(key, a);
  }
  return [...agg.values()].sort((a, b) => b.wins - a.wins
    || String(a.rider || a.team || '').localeCompare(String(b.rider || b.team || ''), 'da'));
}

/**
 * Løbs-fakta: antal afgjorte etaper, samlet distance (km, når etaperne har
 * feltet), antal forskellige etapevindere og det mest vindende hold (Q1-facit).
 * Kun hvad etape-dokumenterne faktisk indeholder — intet gættes.
 */
function computeFacts(stages) {
  const done = decidedStages(stages);
  let totalKm = 0;
  let kmKnown = 0;
  const teamWins = new Map();
  for (const s of done) {
    const km = Number(s.km);
    if (Number.isFinite(km) && km > 0) { totalKm += km; kmKnown += 1; }
    const t = s.result && s.result.winnerTeam;
    if (t) teamWins.set(t, (teamWins.get(t) || 0) + 1);
  }
  let topTeam = null;
  for (const [team, wins] of teamWins) {
    if (!topTeam || wins > topTeam.wins) topTeam = { team, wins };
  }
  const winners = computeStageWins(stages);
  return {
    etaper: done.length,
    // Kun når alle afgjorte etaper har en kendt distance — ellers ville tallet
    // lyve (en halv Tour-distance ser ud som facit).
    totalKm: done.length && kmKnown === done.length ? Math.round(totalKm) : null,
    distinctWinners: winners.length,
    topTeam,
  };
}

module.exports = {
  decidedStages, lastDecidedStage,
  computeJerseyWinners, computeGcPodium, computeStageWins, computeFacts,
};
