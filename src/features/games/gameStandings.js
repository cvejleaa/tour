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
      // Rubrikkerne (1X2, Chancen, Combi, Pulje) kommer FÆRDIGE fra serveren.
      // Uden dem her ville opdelings-fanen skulle hente spillerne en gang til —
      // stillingen abonnerer allerede på præcis de dokumenter.
      //
      // null og ikke fire nuller: findes feltet ikke endnu, skal fladen kunne
      // sige "ikke klar" i stedet for at påstå, at spilleren ingen point har.
      opdeling: p.opdeling ?? null,
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

  // previousRank kommer fra serveren og er rangen i HELE spillet. Lader man
  // den stå, mens rank gen-tildeles inden for delmængden, sammenligner
  // rankDelta to forskellige skalaer — og så får alle en stor grøn pil op,
  // hver eneste gang, uden at have flyttet sig. Den skal derfor også
  // gen-tildeles inden for delmængden, i den indbyrdes rækkefølge den havde.
  const prevRankByUid = new Map();
  const medForrige = filtered.filter((r) => Number.isFinite(r.previousRank));
  const iForrigeOrden = [...medForrige].sort((a, b) => a.previousRank - b.previousRank);
  let pRank = 0;
  let pPrev = null;
  iForrigeOrden.forEach((r, i) => {
    if (r.previousRank !== pPrev) { pRank = i + 1; pPrev = r.previousRank; }
    prevRankByUid.set(r.uid, pRank);
  });

  let rank = 0;
  let prevPts = null;
  return filtered.map((r, i) => {
    if (r.totalPoints !== prevPts) { rank = i + 1; prevPts = r.totalPoints; }
    // Ingen forrige placering (ny spiller) → ingen pil, frem for en falsk en.
    const previousRank = prevRankByUid.has(r.uid) ? prevRankByUid.get(r.uid) : null;
    return { ...r, rank, previousRank };
  });
}

/**
 * De spillere man deler mindst én liga med — plus én selv.
 * @param {Array<{memberUids?:Array<string>}>} leagues – mine ligaer i spillet
 * @param {string|null} uid
 * @returns {Set<string>}
 */
export function leagueMateUids(leagues, uid) {
  const set = new Set();
  if (!uid) return set;
  set.add(uid);
  for (const l of leagues || []) {
    const members = l?.memberUids || [];
    // Kun ligaer man selv er med i tæller — defensivt, selvom kilden kun
    // henter egne ligaer.
    if (!members.includes(uid)) continue;
    for (const m of members) set.add(m);
  }
  return set;
}

/**
 * Spil-stillingen som den må vises for én bruger: kun spillere man deler
 * mindst én liga med (plus én selv), gen-rangeret inden for den kreds.
 * @param {Array<object>} rows     – rangeret spil-stilling (fra rankStandings)
 * @param {Array<object>} leagues  – mine ligaer i spillet (med memberUids)
 * @param {string|null} uid
 */
export function leagueMateStandings(rows, leagues, uid) {
  if (!uid) return [];
  return subsetRanking(rows, leagueMateUids(leagues, uid));
}
