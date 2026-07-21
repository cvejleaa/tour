// ---------------------------------------------------------------------------
// superligaSeed — rene hjælpere til at bygge kamp-dokumenter med FROSNE odds.
// Odds beregnes fra holdenes Elo på seedet-tidspunktet (elo-lite) og gemmes på
// kampen, så afregningen af "Chancen" er deterministisk og ikke kan snydes af
// klienten. Ingen Firebase-afhængigheder (testbar).
// ---------------------------------------------------------------------------

import { ELO, outcomeOdds } from './superligaScoring.js';

/**
 * Slå et holds Elo op. `teams` kan være et map {navn: elo} eller en liste
 * [{name, elo}]. Ukendt hold → ELO.START (neutral).
 */
export function teamElo(teams, name) {
  if (!teams || name == null) return ELO.START;
  if (Array.isArray(teams)) {
    const t = teams.find((x) => x.name === name);
    return Number.isFinite(t?.elo) ? t.elo : ELO.START;
  }
  return Number.isFinite(teams[name]) ? teams[name] : ELO.START;
}

/** Stabilt kamp-id: runde + hold (små bogstaver, kun a-z0-9). */
export function matchId({ round, home, away }) {
  const slug = (s) => String(s ?? '')
    .toLowerCase()
    .replace(/ø/g, 'o').replace(/å/g, 'a').replace(/æ/g, 'ae') // danske bogstaver
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // øvrige diakritiske tegn
    .replace(/[^a-z0-9]/g, '');
  return `r${round}-${slug(home)}-${slug(away)}`;
}

/**
 * Byg ét kamp-dokument med Elo-snapshot + frosne 1X2-odds.
 * @param {{round:number, home:string, away:string, kickoff:*}} fx – én fixture
 * @param {object|Array} teams – Elo-kilde
 * @returns {{id,round,home,away,kickoff,eloHome,eloAway,odds}}
 */
export function buildMatch(fx, teams) {
  const eloHome = teamElo(teams, fx.home);
  const eloAway = teamElo(teams, fx.away);
  const odds = outcomeOdds({ eloHome, eloAway });
  return {
    id: fx.id || matchId(fx),
    round: fx.round,
    home: fx.home,
    away: fx.away,
    kickoff: fx.kickoff ?? null,
    eloHome,
    eloAway,
    odds,
  };
}

/** Byg flere kampe. */
export function buildMatches(fixtures, teams) {
  return (fixtures || []).map((fx) => buildMatch(fx, teams));
}
