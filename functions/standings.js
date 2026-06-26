// ---------------------------------------------------------------------------
// functions/standings.js — Ren funktion til grupperangering (VM 2026).
// Testbar uden Firebase-afhængigheder.
//
// Rangeringskriterier (FIFA):
//   1. Flest point (3/sejr, 1/uafgjort, 0/tab)
//   2. Bedste målforskel (MF = scorede - imod)
//   3. Flest scorede mål
//   4. Indbyrdes point (mod hold på samme niveau)
//   5. Indbyrdes målforskel
//   6. Indbyrdes scorede mål
//   (Herefter lodtrækning — ikke implementeret her)
// ---------------------------------------------------------------------------

'use strict';

/**
 * Bygger en rangeringsliste for en gruppe.
 *
 * @param {string[]} teams  Liste af holdnavne i gruppen (f.eks. ['Brazil','Argentina','Uruguay','Paraguay'])
 * @param {Array<{homeTeam:string, awayTeam:string, result:{home:number,away:number}}>} matches
 *   Kun FINISHED kampe i denne gruppe (med result sat)
 * @returns {Array<{team:string, played:number, w:number, d:number, l:number,
 *   gf:number, ga:number, gd:number, pts:number, rank:number}>}
 *   Sorteret liste, rank starter ved 1.
 */
function computeGroupStandings(teams, matches) {
  // Initialisér statistik for alle hold
  const stats = {};
  for (const team of teams) {
    stats[team] = { team, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  }

  // Gennemgå alle kampe og opdater statistik
  for (const m of matches) {
    const { homeTeam, awayTeam, result } = m;
    if (!result || !stats[homeTeam] || !stats[awayTeam]) continue;
    const { home: hg, away: ag } = result;

    stats[homeTeam].played++;
    stats[awayTeam].played++;
    stats[homeTeam].gf += hg;
    stats[homeTeam].ga += ag;
    stats[awayTeam].gf += ag;
    stats[awayTeam].ga += hg;
    stats[homeTeam].gd += hg - ag;
    stats[awayTeam].gd += ag - hg;

    if (hg > ag) {
      stats[homeTeam].w++;
      stats[homeTeam].pts += 3;
      stats[awayTeam].l++;
    } else if (hg < ag) {
      stats[awayTeam].w++;
      stats[awayTeam].pts += 3;
      stats[homeTeam].l++;
    } else {
      stats[homeTeam].d++;
      stats[awayTeam].d++;
      stats[homeTeam].pts += 1;
      stats[awayTeam].pts += 1;
    }
  }

  const teamList = Object.values(stats);

  // Sorter: point → målforskel → scorede mål → indbyrdes opgør
  teamList.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    // Indbyrdes opgør (h2h) for hold med samme point/MF/GF
    return resolveHeadToHead(a.team, b.team, matches);
  });

  // Tildel placeringer
  return teamList.map((s, i) => ({ ...s, rank: i + 1 }));
}

/**
 * Hjælpefunktion: indbyrdes opgør mellem to hold.
 * Returnerer negativ værdi hvis hold a er bedre, positiv hvis b er bedre.
 */
function resolveHeadToHead(teamA, teamB, matches) {
  // Find indbyrdes kamp(e)
  let ptsA = 0, ptsB = 0, gdA = 0, gfA = 0;
  for (const m of matches) {
    if (m.homeTeam === teamA && m.awayTeam === teamB && m.result) {
      const { home: hg, away: ag } = m.result;
      gdA += hg - ag;
      gfA += hg;
      if (hg > ag) ptsA += 3;
      else if (hg === ag) { ptsA += 1; ptsB += 1; }
      else ptsB += 3;
    } else if (m.homeTeam === teamB && m.awayTeam === teamA && m.result) {
      const { home: hg, away: ag } = m.result;
      gdA += ag - hg;
      gfA += ag;
      if (ag > hg) ptsA += 3;
      else if (hg === ag) { ptsA += 1; ptsB += 1; }
      else ptsB += 3;
    }
  }
  if (ptsB !== ptsA) return ptsB - ptsA; // negativt = A bedre
  if (gdA !== 0) return -gdA;            // negativt GD diff = A bedre
  if (gfA !== 0) return -gfA;
  return 0; // uafgjort → lodtrækning
}

/**
 * Udvælger de 8 bedste 3'ere fra 12 grupper.
 * Bruges i VM 2026 bracket (12 grupper, 3 h.h.v. 4 hold pr. gruppe = 12 grupper à 4 hold).
 * De bedste 3'ere rangeres efter: point → MF → GF.
 *
 * @param {Array<{team:string, pts:number, gd:number, gf:number, groupName:string}>} allThirds
 *   Alle 12 3'ere (én pr. gruppe)
 * @returns {Array<{team:string, groupName:string}>} De 8 bedste, sorteret (rank 1 = bedst)
 */
function pickBestThirds(allThirds) {
  const sorted = [...allThirds].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });
  return sorted.slice(0, 8);
}

module.exports = { computeGroupStandings, pickBestThirds, resolveHeadToHead };
