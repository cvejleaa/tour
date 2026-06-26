// ---------------------------------------------------------------------------
// Rene funktioner til beregning af gruppestilling.
// Ingen Firebase-afhængigheder — kan testes isoleret.
// ---------------------------------------------------------------------------
import { MATCH_STATUS } from '../../lib/constants';
import { teamName } from '../../lib/teams';

/**
 * Beregner stillingen for ét gruppeforløb (alle kampe i samme gruppe).
 *
 * @param {Array} kampe  Kamp-objekter for én gruppe (samme groupName).
 * @returns {Array} Rækker sorteret efter: point → målforskel → scorede mål → landenavn.
 *   Hver række: { team, played, won, drawn, lost, gf, ga, gd, points }
 */
export function computeGroupStandings(kampe) {
  // Saml alle hold fra kampene
  const holdMap = new Map();

  function hentHold(kode) {
    if (!kode) return null;
    if (!holdMap.has(kode)) {
      holdMap.set(kode, {
        team: kode,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,   // mål for (scorede)
        ga: 0,   // mål imod (indkasserede)
        gd: 0,   // målforskel
        points: 0,
      });
    }
    return holdMap.get(kode);
  }

  for (const kamp of kampe) {
    // Registrér begge hold, også selv om kampen ikke er afsluttet
    hentHold(kamp.homeTeam);
    hentHold(kamp.awayTeam);

    // Tæl kun afsluttede kampe med gyldigt resultat
    const erAfsluttet = kamp.status === MATCH_STATUS.FINISHED;
    const harResultat =
      kamp.result != null &&
      typeof kamp.result.home === 'number' &&
      typeof kamp.result.away === 'number';

    if (!erAfsluttet || !harResultat) continue;

    const { home: hjemmeMål, away: udeMål } = kamp.result;

    const hjemmeHold = hentHold(kamp.homeTeam);
    const udeHold = hentHold(kamp.awayTeam);

    if (!hjemmeHold || !udeHold) continue;

    // Opdater statistik for begge hold
    hjemmeHold.played += 1;
    hjemmeHold.gf += hjemmeMål;
    hjemmeHold.ga += udeMål;

    udeHold.played += 1;
    udeHold.gf += udeMål;
    udeHold.ga += hjemmeMål;

    if (hjemmeMål > udeMål) {
      // Hjemmesejr
      hjemmeHold.won += 1;
      hjemmeHold.points += 3;
      udeHold.lost += 1;
    } else if (hjemmeMål < udeMål) {
      // Udesejr
      udeHold.won += 1;
      udeHold.points += 3;
      hjemmeHold.lost += 1;
    } else {
      // Uafgjort
      hjemmeHold.drawn += 1;
      hjemmeHold.points += 1;
      udeHold.drawn += 1;
      udeHold.points += 1;
    }
  }

  // Beregn målforskel for alle hold
  const rækker = [...holdMap.values()].map((r) => ({
    ...r,
    gd: r.gf - r.ga,
  }));

  // Sorter: point (desc) → målforskel (desc) → scorede mål (desc) → landenavn (asc)
  rækker.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return teamName(a.team).localeCompare(teamName(b.team), 'da');
  });

  return rækker;
}

/**
 * Grupperer alle gruppe-kampe (round === 'group') efter groupName.
 *
 * @param {Array} alleKampe  Alle kampe fra Firestore/fixture.
 * @returns {Map<string, Array>}  Map fra gruppenavn (fx "A") til kamp-array.
 */
export function grupperEfterGruppe(alleKampe) {
  const gruppeMap = new Map();

  for (const kamp of alleKampe) {
    if (kamp.round !== 'group' || !kamp.groupName) continue;
    if (!gruppeMap.has(kamp.groupName)) {
      gruppeMap.set(kamp.groupName, []);
    }
    gruppeMap.get(kamp.groupName).push(kamp);
  }

  // Returner sorteret efter gruppenavn (A, B, C …)
  return new Map([...gruppeMap.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
