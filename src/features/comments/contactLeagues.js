// Hvilke brugere deler man en liga med? Privat-beskeder er begrænset til dem.
// Returnerer otherUid → { leagueId, gameId } for en delt liga (bruges som
// besked-kontekst + i regler). gameId er sat, når ligaen ligger under et spil
// (platformens mini-ligaer); den er null for de gamle top-niveau-ligaer (Tour),
// og et null-gameId på beskeden sender serveren ad den uændrede legacy-gren.

/**
 * @param {Array<{id:string, memberUids?:string[], gameId?:string}>} leagues – ligaer man er medlem af
 * @param {string} meUid
 * @returns {Record<string,{leagueId:string, gameId:(string|null)}>} otherUid → delt liga
 */
export function buildContactLeagues(leagues, meUid) {
  const map = {};
  if (!meUid) return map;
  for (const lg of leagues || []) {
    const members = lg?.memberUids || [];
    if (!members.includes(meUid)) continue;
    for (const uid of members) {
      // Første delte liga vinder — adgang kræver blot ÉN delt liga, og
      // visningen er par-baseret (én samtale pr. modpart), så hvilket
      // konkret gameId der vælges, er uden betydning for læsning/visning.
      if (uid !== meUid && !map[uid]) map[uid] = { leagueId: lg.id, gameId: lg.gameId ?? null };
    }
  }
  return map;
}
