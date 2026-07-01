// ---------------------------------------------------------------------------
// Rytter-søgning: ren logik til at slå ryttere op på tværs af alle holds
// startlister. Accent- og rækkefølge-uafhængig, så "vingegaard", "Jonas" og
// "pogacar tadej" alle matcher. UI'et ligger i RiderSearch.jsx.
// ---------------------------------------------------------------------------

/** Normalisér et navn til søgeform: uden accenter, små bogstaver, kun ord. */
export function normName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Byg et fladt indeks over alle ryttere på tværs af holdene.
 * @param {Array<{code:string,name:string}>} teams  holdliste (TEAMS)
 * @param {(code:string)=>Array<{name:string,country?:string,leader?:boolean}>} ridersOf
 * @param {(name:string)=>string} [prettyTeam]  pænt holdnavn (valgfrit)
 * @returns {Array<{name,country,leader,code,teamName,_norm}>}
 */
export function buildRiderIndex(teams, ridersOf, prettyTeam) {
  const out = [];
  for (const t of teams || []) {
    const riders = (ridersOf ? ridersOf(t.code) : null) || [];
    for (const r of riders) {
      if (!r || !r.name) continue;
      out.push({
        name: r.name,
        country: r.country || '',
        leader: !!r.leader,
        code: t.code,
        teamName: prettyTeam ? prettyTeam(t.name) : t.name,
        _norm: normName(r.name),
      });
    }
  }
  return out;
}

/**
 * Søg i rytter-indekset. Matcher når hvert søgeord er en delstreng i rytterens
 * normaliserede navn. Præfiks-match (navnet eller et fornavn/efternavn starter
 * med søgningen) rankes øverst; derefter alfabetisk.
 * @param {Array} index  fra buildRiderIndex
 * @param {string} query
 * @param {number} [limit=25]
 * @returns {Array} matchende ryttere (samme form som indekset)
 */
export function searchRiders(index, query, limit = 25) {
  const q = normName(query);
  if (!q || !Array.isArray(index)) return [];
  const tokens = q.split(' ').filter(Boolean);
  const scored = [];
  for (const r of index) {
    if (!tokens.every((tok) => r._norm.includes(tok))) continue;
    const words = r._norm.split(' ');
    const prefix = r._norm.startsWith(q) || words.some((w) => w.startsWith(tokens[0]));
    scored.push({ r, score: prefix ? 0 : 1 });
  }
  scored.sort((a, b) => a.score - b.score || a.r.name.localeCompare(b.r.name, 'da'));
  return scored.slice(0, limit).map((s) => s.r);
}
