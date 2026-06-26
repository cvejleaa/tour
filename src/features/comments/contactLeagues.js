// Hvilke brugere deler man en liga med? Privat-beskeder er begrænset til dem.
// Returnerer otherUid → en delt liga-id (bruges som besked-kontekst + i regler).

/**
 * @param {Array<{id:string, memberUids?:string[]}>} leagues – ligaer man er medlem af
 * @param {string} meUid
 * @returns {Record<string,string>} otherUid → id på en liga, I begge er med i
 */
export function buildContactLeagues(leagues, meUid) {
  const map = {};
  if (!meUid) return map;
  for (const lg of leagues || []) {
    const members = lg?.memberUids || [];
    if (!members.includes(meUid)) continue;
    for (const uid of members) {
      if (uid !== meUid && !map[uid]) map[uid] = lg.id;
    }
  }
  return map;
}
