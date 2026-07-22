'use strict';
// ---------------------------------------------------------------------------
// liveTicker.js — dansk live-ticker fra letour.fr's racecenter under etapen.
//
// racecenter.letour.fr/api/publication_da-{år}-{etape} leverer redaktionens
// DANSKE live-opslag (mål-tider, angreb, historier) som JSON. Endpointet har
// ingen CORS-headers, så browseren kan ikke hente det selv — derfor går det
// via en callable, med et kort server-cache-vindue så vi er høflige mod
// letour uanset hvor mange spillere der kigger med.
//
// Ren og testbar: fetch/cache/klokke injiceres.
// ---------------------------------------------------------------------------

const RACECENTER = 'https://racecenter.letour.fr/api';

/**
 * Rens letours opslags-tekst: teksterne indeholder rå HTML (<br />, af og til
 * andre tags og entities), som frontenden ellers ville vise bogstaveligt.
 * <br>/<p> bliver linjeskift, øvrige tags fjernes, gængse entities afkodes.
 */
function cleanText(s) {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, '’')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Opslagets tidsstempel som epoch-ms. VIGTIGT: sammenlign aldrig ISO-strenge
 * leksikografisk — letour blander offset-formater (fx "+02:00" og "Z"), og
 * strengsortering lægger så finale-opslagene NEDERST, hvor de bliver skåret
 * af limit. Ukendt/manglende tid → 0 (ældst).
 */
function postEpoch(p) {
  const t = Date.parse(p?.publicationAt || p?.createdAt || '');
  return Number.isFinite(t) ? t : 0;
}

/**
 * Normalisér racecenter-opslag til det frontend viser. Nyeste først;
 * pinned-opslag øverst (letours egen fremhævning).
 * @param {Array} json  rå publication_da-payload
 * @param {number} [limit]
 */
/** Som mapPosts, men beholder det interne _epoch-felt (til fletning). */
function mapPostsWithEpoch(json) {
  const arr = Array.isArray(json) ? json : [];
  return arr
    .filter((p) => p && (p.title || (Array.isArray(p.text) && p.text.length)))
    .map((p) => ({
      id: p.id ?? p._id ?? p.slug ?? null,
      title: cleanText(p.title || ''),
      text: Array.isArray(p.text) ? p.text.map(cleanText).filter(Boolean).join('\n\n') : cleanText(p.text || ''),
      picto: p.picto || null,
      publicationAt: p.publicationAt || p.createdAt || null,
      _epoch: postEpoch(p),
      pinned: !!p.pinned,
      highlight: !!p.highlight,
    }))
    .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b._epoch - a._epoch));
}

function stripEpoch(posts, limit) {
  return posts.slice(0, limit).map((p) => { const q = { ...p }; delete q._epoch; return q; });
}

function mapPosts(json, limit = 30) {
  return stripEpoch(mapPostsWithEpoch(json), limit);
}

/**
 * Diagnose-statistik over det RÅ publication-payload: hvor mange opslag,
 * nyeste/ældste tidsstempel, offset-varianter og evt. opslag uden tid.
 * Bruges af debugLiveTicker-callablen når tickeren "stopper for tidligt".
 */
function postStats(json) {
  const arr = Array.isArray(json) ? json : [];
  const offsets = {};
  let nullTime = 0;
  let newest = null;
  let oldest = null;
  for (const p of arr) {
    const raw = String(p?.publicationAt || p?.createdAt || '');
    if (!raw) { nullTime += 1; continue; }
    const m = raw.match(/(Z|[+-]\d{2}:?\d{2})$/);
    const suffix = m ? m[1] : '(intet offset)';
    offsets[suffix] = (offsets[suffix] || 0) + 1;
    const t = Date.parse(raw);
    if (Number.isFinite(t)) {
      if (newest === null || t > newest) newest = t;
      if (oldest === null || t < oldest) oldest = t;
    }
  }
  return {
    total: arr.length,
    nullTime,
    offsets,
    newestAt: newest !== null ? new Date(newest).toISOString() : null,
    oldestAt: oldest !== null ? new Date(oldest).toISOString() : null,
  };
}

/**
 * Hent (og cache) live-tickeren for en etape.
 * Fejl caches OGSÅ, så et blokeret/nede endpoint ikke hamres hvert sekund.
 * @param {object} opts
 * @param {number} opts.stageNumber  1-21
 * @param {number} [opts.season]
 * @param {Function} opts.fetchImpl
 * @param {Map}    [opts.cache]     nøgle → {at, value}
 * @param {Function} [opts.now]     () => ms
 * @param {number} [opts.cacheMs]
 * @returns {Promise<{ok:true, stage:number, posts:Array, fetchedAt:string} | {ok:false, reason:string}>}
 */
/** Feed-URL for et sprog. `lang` er fx 'da'/'en'; tom streng = letours basisfeed. */
function feedUrl(season, n, lang, buster) {
  const suffix = lang ? `_${lang}` : '';
  return `${RACECENTER}/publication${suffix}-${season}-${n}?_=${buster}`;
}

const FEED_HEADERS = {
  // Racecenteret er en offentlig side; en almindelig browser-UA og
  // Accept-header er nok (payloadet i HAR'en havde intet krav udover det).
  // no-cache: uden den kan letours CDN servere et gammelt svar.
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'application/json',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

// Fallback: det danske feed går ofte i stå FØR finalen (redaktionen stopper
// med at oversætte — set på etape 17: sidste danske opslag 17.10, mens det
// engelske feed dækkede målgang 17.18). Er nyeste danske opslag ældre end
// dette, hentes det engelske feed også, og dets NYERE opslag flettes ind.
const DA_STALE_MS = 10 * 60 * 1000;
const FALLBACK_LANGS = ['en', ''];

/**
 * Hent (og cache) live-tickeren for en etape.
 * Fejl caches OGSÅ, så et blokeret/nede endpoint ikke hamres hvert sekund.
 * @param {object} opts
 * @param {number} opts.stageNumber  1-21
 * @param {number} [opts.season]
 * @param {Function} opts.fetchImpl
 * @param {Map}    [opts.cache]     nøgle → {at, value}
 * @param {Function} [opts.now]     () => ms
 * @param {number} [opts.cacheMs]
 * @param {number} [opts.staleMs]   hvornår dansk feed regnes for gået i stå
 * @param {Function} [opts.translateImpl]  async (posts) => posts — oversætter
 *   fallback-opslag til dansk. Fejler den, vises opslagene uoversat.
 * @returns {Promise<{ok:true, stage:number, posts:Array, fetchedAt:string} | {ok:false, reason:string}>}
 */
async function fetchLiveTickerCore({
  stageNumber, season = 2026, fetchImpl, cache, now = () => Date.now(),
  cacheMs = 45000, staleMs = DA_STALE_MS, limit = 30, translateImpl = null,
}) {
  const n = Number(stageNumber);
  if (!Number.isInteger(n) || n < 1 || n > 21) return { ok: false, reason: 'bad-stage' };

  const key = `${season}-${n}`;
  const hit = cache && cache.get(key);
  if (hit && now() - hit.at < cacheMs) return hit.value;

  const getJson = async (lang) => {
    const res = await fetchImpl(feedUrl(season, n, lang, now()), { headers: FEED_HEADERS });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, json: await res.json() };
  };

  let value;
  try {
    const da = await getJson('da');
    if (!da.ok) {
      value = { ok: false, reason: `http-${da.status}` };
    } else {
      let posts = mapPostsWithEpoch(da.json);
      const newestDa = posts.reduce((m, p) => Math.max(m, p._epoch), 0);

      // Dansk feed i stå (eller tomt)? Flet nyere opslag fra fallback-feedet.
      if (!posts.length || now() - newestDa > staleMs) {
        for (const lang of FALLBACK_LANGS) {
          try {
            const fb = await getJson(lang);
            if (!fb.ok) continue;
            let extra = mapPostsWithEpoch(fb.json).filter((p) => p._epoch > newestDa);
            if (extra.length) {
              // AI-oversæt fallback-opslagene til dansk. Fejler oversættelsen,
              // vises de uoversat — hellere engelsk finale end ingen finale.
              if (translateImpl) {
                try { extra = await translateImpl(extra); } catch { /* uoversat */ }
              }
              posts = posts.concat(extra)
                .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b._epoch - a._epoch));
              break; // ét fallback-sprog er nok
            }
            if (Array.isArray(fb.json) && fb.json.length) break; // feedet virker, men intet nyere
          } catch { /* fallback må aldrig vælte det danske feed */ }
        }
      }
      value = { ok: true, stage: n, posts: stripEpoch(posts, limit), fetchedAt: new Date(now()).toISOString() };
    }
  } catch (e) {
    value = { ok: false, reason: String((e && e.message) || e) };
  }

  if (cache) cache.set(key, { at: now(), value });
  return value;
}

module.exports = {
  RACECENTER, cleanText, mapPosts, postStats, fetchLiveTickerCore, feedUrl, FEED_HEADERS,
};
