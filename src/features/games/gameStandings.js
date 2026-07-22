/**
 * Rene hjælpere til per-spil-stilling (games/{gameId}/players).
 * Slår deltagere sammen med deres bruger-profil (navn/avatar) og tildeler
 * placering med korrekt tie-håndtering (1, 2, 2, 4). Ingen Firebase-afhængighed.
 */

/**
 * @param {Array<{uid:string, totalPoints?:number, previousRank?:number}>} players
 * @param {Record<string, {displayName?:string, avatarEmoji?:string, favoriteTeam?:string}>} usersById
 * @returns {Array<{uid,name,emoji,favoriteTeam,totalPoints,rank,previousRank}>}
 */
export function rankStandings(players, usersById = {}) {
  const rows = (players || []).map((p) => {
    const u = usersById[p.uid] || {};
    return {
      uid: p.uid,
      name: u.displayName || 'Ukendt spiller',
      emoji: u.avatarEmoji ?? null,
      // Yndlingshold pr. spil (players-doc) har forrang for den globale profil.
      favoriteTeam: p.favoriteTeam ?? u.favoriteTeam ?? null,
      totalPoints: Number(p.totalPoints) || 0,
      previousRank: p.previousRank ?? null,
    };
  });

  // Faldende efter point; ens point sorteres alfabetisk (dansk) for stabil orden.
  rows.sort((a, b) => (b.totalPoints - a.totalPoints)
    || a.name.localeCompare(b.name, 'da'));

  // Standard-rangering: samme point → samme placering, næste springer over.
  let rank = 0;
  let prevPts = null;
  rows.forEach((r, i) => {
    if (r.totalPoints !== prevPts) { rank = i + 1; prevPts = r.totalPoints; }
    r.rank = rank;
  });
  return rows;
}

/** Placerings-ændring siden sidst: >0 = rykket op, <0 = ned, 0/null = uændret. */
export function rankDelta(row) {
  if (row?.previousRank == null || row?.rank == null) return null;
  return row.previousRank - row.rank;
}

/**
 * Liga-stilling: filtrér en allerede rangeret liste (fra rankStandings) til
 * ligaens medlemmer og gen-tildel placeringer INDEN FOR ligaen. Bevarer den
 * eksisterende point-sortering.
 * @param {Array<object>} rows       – rangeret spil-stilling
 * @param {Array<string>|Set<string>} memberUids
 */
export function subsetRanking(rows, memberUids) {
  const set = memberUids instanceof Set ? memberUids : new Set(memberUids || []);
  const filtered = (rows || []).filter((r) => set.has(r.uid));
  let rank = 0;
  let prevPts = null;
  return filtered.map((r, i) => {
    if (r.totalPoints !== prevPts) { rank = i + 1; prevPts = r.totalPoints; }
    return { ...r, rank };
  });
}
