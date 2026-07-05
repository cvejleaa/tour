'use strict';
// ---------------------------------------------------------------------------
// liveMap.js — live-kort-data fra letour racecenter under etapen.
//
// To racecenter-endpoints (samme familie som live-tickeren, ingen CORS):
//   api/telemetryPack-{år}-{etape}   → grupperne på vejen (udbrud/hovedfelt):
//                                      position, fart, tidsgab, størrelse, bibs
//   api/checkpointList-{år}-{etape}  → ~70 geopunkter langs ruten (polylinje)
//
// Ruten er statisk pr. etape → langt cache-vindue; telemetrien cacher kort
// (45 sek.), så letour højst rammes ~1 gang i minuttet uanset antal spillere.
// Ren og testbar: fetch/cache/klokke injiceres.
// ---------------------------------------------------------------------------

const RACECENTER = 'https://racecenter.letour.fr/api';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'application/json',
};

// null/tom streng er IKKE et tal (Number(null) er 0!).
const isNum = (v) => v != null && v !== '' && Number.isFinite(Number(v));

/**
 * Normalisér telemetryPack-payloadet til de grupper frontenden tegner.
 * @param {Array|object} json  rå telemetryPack-payload
 * @returns {{groups: Array, date: ?string}}
 */
function mapGroups(json) {
  const doc = Array.isArray(json) ? json[0] : json;
  const raw = doc && Array.isArray(doc.groups) ? doc.groups : [];
  const groups = raw
    .filter((g) => g && isNum(g.latitude) && isNum(g.longitude))
    .map((g) => ({
      id: g.id ?? null,
      name: String(g.name || ''),
      size: Number(g.size) || 0,
      gapSec: Number(g.relative) || 0, // sekunder efter forreste gruppe
      speed: isNum(g.speed) ? Number(g.speed) : null,
      lat: Number(g.latitude),
      lon: Number(g.longitude),
      kmDone: isNum(g.completedDistance) ? Math.round(Number(g.completedDistance) / 100) / 10 : null,
      kmLeft: isNum(g.remainingDistance) ? Math.round(Number(g.remainingDistance) / 100) / 10 : null,
      bibs: (Array.isArray(g.bibs) ? g.bibs : [])
        .map((b) => Number(b && b.bib))
        .filter(Number.isFinite),
      jerseys: {
        yellow: !!g.hasYellowJersey,
        green: !!g.hasGreenJersey,
        polka: !!g.hasPolkaDotJersey,
        white: !!g.hasWhiteJersey,
      },
    }))
    .sort((a, b) => a.gapSec - b.gapSec);
  return { groups, date: (doc && doc.date) || null };
}

/**
 * checkpointList → rutens polylinje: [[lat, lon], ...] i køreretning.
 * @param {Array} json
 */
function mapRoute(json) {
  const arr = Array.isArray(json) ? json : [];
  return arr
    .filter((c) => c && isNum(c.latitude) && isNum(c.longitude))
    .sort((a, b) => (Number(a.checkpoint) || 0) - (Number(b.checkpoint) || 0))
    .map((c) => [Number(c.latitude), Number(c.longitude)]);
}

/**
 * Hent (og cache) live-kortets data for en etape. Fejl caches OGSÅ, så et
 * nede endpoint ikke hamres. Ruten caches separat og længe (statisk).
 * @param {object} opts
 * @param {number} opts.stageNumber 1-21
 * @param {number} [opts.season]
 * @param {Function} opts.fetchImpl
 * @param {Map} [opts.cache]        telemetri (+samlet svar): nøgle → {at, value}
 * @param {Map} [opts.routeCache]   rute pr. etape: nøgle → {at, value}
 * @param {Function} [opts.now]
 * @param {number} [opts.cacheMs]
 * @param {number} [opts.routeCacheMs]
 * @returns {Promise<{ok:true, stage:number, route:Array, groups:Array, updatedAt:?string, fetchedAt:string} | {ok:false, reason:string}>}
 */
async function fetchLiveMapCore({
  stageNumber, season = 2026, fetchImpl, cache, routeCache,
  now = () => Date.now(), cacheMs = 45000, routeCacheMs = 6 * 3600 * 1000,
}) {
  const n = Number(stageNumber);
  if (!Number.isInteger(n) || n < 1 || n > 21) return { ok: false, reason: 'bad-stage' };

  const key = `${season}-${n}`;
  const hit = cache && cache.get(key);
  if (hit && now() - hit.at < cacheMs) return hit.value;

  const getJson = async (url) => {
    const res = await fetchImpl(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`http-${res.status}`);
    return res.json();
  };

  let value;
  try {
    // Rute (statisk pr. etape → langt cache-vindue).
    let route;
    const rHit = routeCache && routeCache.get(key);
    if (rHit && now() - rHit.at < routeCacheMs && rHit.value.length >= 2) {
      route = rHit.value;
    } else {
      route = mapRoute(await getJson(`${RACECENTER}/checkpointList-${season}-${n}`));
      if (routeCache) routeCache.set(key, { at: now(), value: route });
    }

    const { groups, date } = mapGroups(await getJson(`${RACECENTER}/telemetryPack-${season}-${n}`));
    value = {
      ok: true, stage: n, route, groups,
      updatedAt: date, fetchedAt: new Date(now()).toISOString(),
    };
  } catch (e) {
    value = { ok: false, reason: String((e && e.message) || e) };
  }

  if (cache) cache.set(key, { at: now(), value });
  return value;
}

module.exports = { RACECENTER, mapGroups, mapRoute, fetchLiveMapCore };
