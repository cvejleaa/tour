// ---------------------------------------------------------------------------
// superligaSeed — rene hjælpere til at bygge kamp-dokumenter med FROSNE odds.
// Odds beregnes fra holdenes Elo på seedet-tidspunktet (elo-lite) og gemmes på
// kampen, så afregningen af "Chancen" er deterministisk og ikke kan snydes af
// klienten. Ingen Firebase-afhængigheder (testbar).
// ---------------------------------------------------------------------------

import { ELO, outcomeOdds, oddsParametre, sportProfil } from './superligaScoring.js';

/**
 * Slå et holds Elo op. `teams` kan være et map {navn: elo} eller en liste
 * [{name, elo}]. Ukendt hold → `start` (sportens neutrale rating; fodbold
 * ELO.START).
 */
export function teamElo(teams, name, start = ELO.START) {
  if (!teams || name == null) return start;
  if (Array.isArray(teams)) {
    const t = teams.find((x) => x.name === name);
    return Number.isFinite(t?.elo) ? t.elo : start;
  }
  return Number.isFinite(teams[name]) ? teams[name] : start;
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
 *
 * Oddsene prises med SPILLETS sportsprofil (`sportProfil(game)`): hjemmebane,
 * uafgjort-model og odds-gulv. Udelades den, er det fodbold — præcis de tal,
 * Superligaen og Premier League altid er seedet med.
 *
 * @param {{round:number, home:string, away:string, kickoff:*}} fx – én fixture
 * @param {object|Array} teams – Elo-kilde
 * @param {object} [profil] – sportsprofil, se sportProfil i superligaScoring.js
 * @returns {{id,round,home,away,kickoff,eloHome,eloAway,odds}}
 */
export function buildMatch(fx, teams, profil = sportProfil()) {
  const eloHome = teamElo(teams, fx.home, profil.elo.START);
  const eloAway = teamElo(teams, fx.away, profil.elo.START);
  const odds = outcomeOdds({ eloHome, eloAway, ...oddsParametre(profil) });
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

/** Byg flere kampe — alle med samme sportsprofil. */
export function buildMatches(fixtures, teams, profil = sportProfil()) {
  return (fixtures || []).map((fx) => buildMatch(fx, teams, profil));
}
