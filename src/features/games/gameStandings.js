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
      // Runde-vektoren og puljebonussen — grundlaget for en ligas EGEN total,
      // når den starter ved en senere runde (se ligaRanking/ligaPoint).
      perRound: p.perRound ?? null,
      bonusPoints: Number(p.bonusPoints) || 0,
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
 * Liga-stilling for en liga MED egen startrunde: totalerne regnes FORFRA af
 * spillernes runde-vektor, og placeringer + pile gen-tildeles efter de nye
 * tal.
 *
 * HVORFOR IKKE BARE `subsetRanking`: dens rækker bærer spillets totaler, og en
 * liga fra runde 20 har sine egne. Og previousRank fra serveren er spillets
 * skala — sorteres ligaens nye orden mod den gamle globale, får alle en grøn
 * pil (to-skala-fejlen, som subsetRankings egen kommentar beskriver). Pilene
 * her regnes i stedet af SAMME vektor: rangen før den seneste afgjorte runde
 * er ligaens orden uden dens sidste bidrag.
 *
 * En spiller uden `perRound` (ikke genberegnet endnu) vises med `klar: false`
 * og ingen total — fladen skal sige "ikke klar", ikke påstå nul. Samme mønster
 * som `opdeling`.
 *
 * @param {Array<object>} rows      – rangeret spil-stilling (fra rankStandings)
 * @param {{memberUids?:Array<string>, startRound?:number|null}} league
 * @param {(perRound: object|null, startRunde: number|null, pulje: number) => number} regn  – ligaPoint
 * @param {(perRound: object|null) => boolean} harVektor  – harRundeVektor
 * @param {(perRound: object|null, spilTotal: number, pulje: number) => boolean} stemmer
 *   – vektorStemmer. INJICERET og uden standardværdi med vilje: en default på
 *   `() => true` ville slå vagten fra i enhver kalder, der glemte den, og
 *   fejlen ville være tavs — præcis den slags, vagten selv findes for.
 */
export function ligaRanking(rows, league, regn, harVektor, stemmer) {
  const set = new Set(league?.memberUids || []);
  const startRunde = Number.isFinite(league?.startRound) ? league.startRound : null;
  // Uden startrunde er ligaen bare en delmængde af spillet — samme tal.
  if (startRunde == null) return subsetRanking(rows, set);

  const medlemmer = (rows || []).filter((r) => set.has(r.uid));

  // Sidste runde, NOGEN i ligaen har point fra — pilene sammenligner mod
  // stillingen uden den. Kun runder fra ligaens egen start tæller med her.
  let sidste = null;
  for (const r of medlemmer) {
    for (const noegle of Object.keys(r.perRound || {})) {
      const n = Number(noegle);
      if (!Number.isFinite(n) || n < startRunde) continue;
      if (sidste == null || n > sidste) sidste = n;
    }
  }

  const talte = medlemmer.map((r) => {
    // ÉN VAGT, ÉT STED. Stod prøven tre gange (total, klar, pilen), kunne to
    // af dem muteres væk med grøn suite — og pilen ville regne på en vektor,
    // totalen har afvist. Husets regel: saml beslutningen, så en mutation af
    // den bliver rød.
    const klar = harVektor(r.perRound)
      && stemmer(r.perRound, r.totalPoints, r.bonusPoints || 0);
    return {
    ...r,
    // Spillets total FØR omregningen. Pointopdelingen og spillerdetaljen
    // viser spillets regnskab (rubrikkerne er spil-globale), og de skal have
    // spillets tal at stemme mod — ellers står rubrikker på én skala mod en
    // total på en anden, og afvigelses-noten forklarer det med to grunde, der
    // begge er forkerte.
    spilTotal: r.totalPoints,
    // KLAR ER TO SPØRGSMÅL, IKKE ÉT: findes vektoren, OG kan den gengive
    // spillets egen total? En vektor, der mangler runder, består det første
    // og fejler det andet — og uden det andet ville ligaen vise et for lavt
    // tal uden fejlbesked. Se vektorStemmer.
    klar,
    totalPoints: klar ? regn(r.perRound, startRunde, r.bonusPoints || 0) : 0,
    // Total FØR den seneste runde — grundlaget for pilen. Regnet af samme
    // vektor, så begge tal er på ligaens skala. Samme `klar` som totalen: en
    // pil regnet af en afvist vektor ville pege et sted, tallet ikke gør.
    _foer: klar && sidste != null
      ? regn(fjernRunde(r.perRound, sidste), startRunde, r.bonusPoints || 0)
      : null,
    };
  });

  // Rang nu og rang før — begge på ligaens egen skala.
  const rangér = (liste, felt) => {
    const sorteret = [...liste].sort((a, b) => (b[felt] - a[felt])
      || a.name.localeCompare(b.name, 'da'));
    const rang = new Map();
    let r = 0;
    let prev = null;
    sorteret.forEach((x, i) => {
      if (x[felt] !== prev) { r = i + 1; prev = x[felt]; }
      rang.set(x.uid, r);
    });
    return rang;
  };
  const nu = rangér(talte.filter((t) => t.klar), 'totalPoints');
  const foerRang = sidste != null ? rangér(talte.filter((t) => t._foer != null), '_foer') : new Map();

  return talte
    .sort((a, b) => (b.totalPoints - a.totalPoints) || a.name.localeCompare(b.name, 'da'))
    .map((r) => ({
      ...r,
      rank: nu.get(r.uid) ?? null,
      previousRank: foerRang.get(r.uid) ?? null,
      _foer: undefined,
    }));
}

/** Vektoren uden én bestemt runde — til "stillingen før sidste runde". */
function fjernRunde(perRound, runde) {
  const ud = {};
  for (const [k, v] of Object.entries(perRound || {})) {
    if (Number(k) === runde) continue;
    ud[k] = v;
  }
  return ud;
}

/**
 * Liga-stilling: filtrér en allerede rangeret liste (fra rankStandings) til
 * ligaens medlemmer og gen-tildel placeringer INDEN FOR ligaen. Bevarer den
 * eksisterende point-sortering.
 *
 * BRUGES KUN, når ligaen ikke har sin egen startrunde — ellers `ligaRanking`,
 * som regner totalerne forfra af runde-vektoren.
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
