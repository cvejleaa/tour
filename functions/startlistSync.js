// ---------------------------------------------------------------------------
// functions/startlistSync.js — ren logik for startliste-sync (testbar, ingen IO).
// Henter TV2-startlisten via proxyen (/api/startlist) og skriver den til
// config/startlist, så holdsiderne fyldes ud automatisk efterhånden som holdene
// melder deres ryttere ud.
// ---------------------------------------------------------------------------

/**
 * Byg config/startlist-dokumentets payload fra proxy-svaret. Normaliserer
 * rytter-felterne og tæller hvor mange hold der har udtaget.
 * @param {{teams?:Array<{code:string,name?:string,announced?:boolean,riders?:Array}>}} payload
 * @returns {{ teams: object, announced: number, total: number }}
 */
function buildStartlistDoc(payload) {
  const teams = Array.isArray(payload && payload.teams) ? payload.teams : [];
  const byCode = {};
  let announced = 0;
  for (const t of teams) {
    const code = t && t.code;
    if (!code) continue;
    const riders = Array.isArray(t.riders)
      ? t.riders
        .map((r) => ({
          name: String((r && r.name) || '').trim(),
          country: String((r && r.country) || '').trim(),
          leader: r && r.leader === true,
        }))
        .filter((r) => r.name)
      : [];
    const isAnnounced = t.announced === true;
    if (isAnnounced) announced += 1;
    byCode[code] = { name: String(t.name || ''), announced: isAnnounced, riders };
  }
  return { teams: byCode, announced, total: teams.length };
}

/**
 * Hent startlisten fra proxyen og skriv den til config/startlist. IO injiceres
 * (db, fetchImpl, serverTimestamp) så funktionen er fuldt testbar uden netværk.
 * @param {object} opts
 * @param {object} opts.db
 * @param {string} opts.proxyUrl
 * @param {number} [opts.season]
 * @param {Function} opts.fetchImpl
 * @param {Function} [opts.serverTimestamp]
 * @returns {Promise<{announced:number,total:number}>}
 */
async function syncStartlistCore({ db, proxyUrl, season, fetchImpl, serverTimestamp = () => null }) {
  const res = await fetchImpl(`${proxyUrl}/api/startlist`);
  if (!res.ok) throw new Error(`proxy /api/startlist: HTTP ${res.status}`);
  const data = await res.json();
  const doc = buildStartlistDoc(data);
  // Sikring: hvis hentningen ikke gav ÉN eneste rytter (TV2 nede, markup-ændring
  // e.l.), så skriv IKKE — ellers ville et tomt resultat overskrive de hold der
  // allerede er fyldt ud. Den statiske snapshot/forrige data bevares.
  const totalRiders = Object.values(doc.teams).reduce((n, t) => n + (t.riders ? t.riders.length : 0), 0);
  if (totalRiders === 0) {
    return { announced: 0, total: doc.total, skipped: true };
  }
  await db.collection('config').doc('startlist').set(
    {
      season: season != null ? Number(season) : null,
      teams: doc.teams,
      announced: doc.announced,
      total: doc.total,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return { announced: doc.announced, total: doc.total };
}

module.exports = { buildStartlistDoc, syncStartlistCore };
