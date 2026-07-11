// ---------------------------------------------------------------------------
// AI-udledte rytter-karakteristika fra live-tickeren (Tour de France).
//
// Ren, Firebase-uafhængig kernelogik: given én etapes danske live-ticker-tekst
// beder vi Claude om at udtrække, hvordan ENKELTE ryttere karakteriseres
// (rolle/stil/kælenavn — fx "baroudeur", "spurter", "klatrekonge") — IKKE
// dagsresultater. Resultatet skrives som AI-forslag (kilde: 'ai') på
// config/riderProfiles, hvor frontenden slår rytternavn → startnummer op og
// merger dem ind under den enkelte rytter.
//
// Samme Anthropic-model og retry-mønster som stageTip.js / AI-morgenopslaget.
// index.js wirer en onCall + onSchedule op om runEnrichRiderTags.
// ---------------------------------------------------------------------------

'use strict';

// Hold ens med de øvrige AI-kald i projektet.
const RIDER_TAG_MODEL = 'claude-opus-4-8';

// Maksimalt antal tickers-opslag der sendes med i én prompt (nyeste vægter
// tungest; en hel etape har typisk 20-40 opslag).
const MAX_POSTS = 40;

const RIDER_TAG_SYSTEM = [
  'Du er en dansk cykelanalytiker. Du får RÅ live-ticker-tekst fra ÉN etape af',
  'Tour de France (redaktionens danske opslag). Din opgave er at udtrække, hvordan',
  'ENKELTE ryttere KARAKTERISERES som ryttertype — deres rolle, stil eller',
  'kælenavn — så data kan bruges til at forstå rytterne over tid.',
  '',
  'Eksempler på karakteristik-tags (dansk, små bogstaver): "baroudeur",',
  '"angrebsrytter", "spurter", "leadout", "klatrer", "bjergkonge", "puncheur",',
  '"tempospecialist", "allrounder", "klassementsrytter", "hjælperytter",',
  '"udbryder", "sprintafslutter". Brug rytterens EGET rolle-ord hvis teksten',
  'bruger et (fx "baroudeur"); ellers vælg det nærmeste tag fra listen.',
  '',
  'MEGET VIGTIGT:',
  '- Kun KARAKTERISTIK af ryttertype/rolle. IKKE dagsresultater, placeringer,',
  '  tidsgab, styrt eller udgåelser.',
  '- Kun ryttere der tydeligt karakteriseres. Ved tvivl: udelad.',
  '- Skriv rytterens navn PRÆCIS som det står i teksten.',
  '- Find ALDRIG på ryttere, tags eller citater. Kun hvad teksten støtter.',
  '',
  'Svar KUN med gyldig JSON på formen:',
  '{"tags":[{"rider":"<navn>","tag":"<karakteristik>","evidence":"<kort citat fra teksten>"}]}',
  'Ingen forklaring, ingen markdown, kun JSON. Tom liste hvis intet findes.',
].join('\n');

/**
 * Byg user-prompten ud fra tickerens opslag (titel + tekst pr. opslag).
 * @param {Array<{title?:string,text?:string}>} posts
 * @param {number} [stageNumber]
 * @returns {string}
 */
function buildRiderTagPrompt(posts = [], stageNumber = null) {
  const chunks = (Array.isArray(posts) ? posts : [])
    .slice(0, MAX_POSTS)
    .map((p) => [p && p.title, p && p.text].filter(Boolean).join('. '))
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  const head = stageNumber != null
    ? `Live-ticker fra etape ${stageNumber}. Udtræk rytter-karakteristika:`
    : 'Live-ticker fra en etape. Udtræk rytter-karakteristika:';
  return `${head}\n\n${chunks.join('\n\n')}`;
}

/**
 * Tolerant JSON-udtræk fra et LLM-svar (håndterer evt. markdown-fence eller
 * ledsagende tekst ved at gribe den første {...}-blok).
 * @param {string} raw
 * @returns {Array<{rider:string,tag:string,evidence?:string}>}
 */
function parseRiderTags(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  let obj = null;
  try {
    obj = JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { obj = JSON.parse(text.slice(start, end + 1)); } catch { obj = null; }
    }
  }
  const arr = obj && Array.isArray(obj.tags) ? obj.tags : [];
  const out = [];
  for (const e of arr) {
    const rider = String((e && e.rider) || '').trim();
    const tag = String((e && e.tag) || '').trim().toLowerCase();
    if (!rider || !tag) continue;
    const evidence = String((e && e.evidence) || '').trim().slice(0, 240);
    out.push(evidence ? { rider, tag, evidence } : { rider, tag });
  }
  return out;
}

/**
 * Kald Anthropic og få rytter-tags for én etapes ticker. Retry ved
 * midlertidige fejl (samme mønster som stageTip.js).
 * @param {object} anthropic  Anthropic-klient
 * @param {Array} posts       tickerens opslag
 * @param {number} [stageNumber]
 * @returns {Promise<Array<{rider,tag,evidence?}>>}
 */
async function extractRiderTags(anthropic, posts, stageNumber = null) {
  const prompt = buildRiderTagPrompt(posts, stageNumber);
  let attempt = 0;
  for (;;) {
    try {
      const res = await anthropic.messages.create({
        model: RIDER_TAG_MODEL,
        max_tokens: 1500,
        system: RIDER_TAG_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      });
      const txt = (res.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return parseRiderTags(txt);
    } catch (err) {
      attempt += 1;
      const status = err && err.status;
      const retryable = status === 429 || status === 500 || status === 503 || status === 529;
      if (retryable && attempt < 4) {
        await new Promise((r) => setTimeout(r, attempt * 5000));
        continue;
      }
      throw err;
    }
  }
}

/** Nøgle til dedup af et AI-tag på tværs af kørsler (rytter+tag+etape). */
function tagKey(t) {
  return `${String(t.rider || '').toLowerCase()}|${String(t.tag || '').toLowerCase()}|${t.stage ?? ''}`;
}

/**
 * Flet nye AI-tags for én etape ind i eksisterende aiRaw-liste (idempotent:
 * samme rytter+tag+etape tilføjes ikke to gange). Returnerer den nye liste.
 * @param {Array} existing  eksisterende aiRaw
 * @param {Array} fresh     nye {rider,tag,evidence}
 * @param {number} stageNumber
 * @param {string} at       ISO-tidsstempel
 * @returns {Array}
 */
function mergeAiTags(existing, fresh, stageNumber, at) {
  const seen = new Set((Array.isArray(existing) ? existing : []).map(tagKey));
  const merged = Array.isArray(existing) ? existing.slice() : [];
  for (const t of fresh || []) {
    const entry = { rider: t.rider, tag: t.tag, stage: Number(stageNumber) };
    if (t.evidence) entry.evidence = t.evidence;
    if (seen.has(tagKey(entry))) continue;
    seen.add(tagKey(entry));
    entry.at = at;
    merged.push(entry);
  }
  return merged;
}

/**
 * Berig config/riderProfiles med AI-udledte tags fra ÉN etapes live-ticker.
 * Henter tickeren, kalder Claude, merger tags ind (idempotent) og markerer
 * etapen som beriget. IO injiceres, så kernen er testbar uden netværk.
 *
 * @param {object}   db            Firestore (admin SDK)
 * @param {object}   anthropic     Anthropic-klient
 * @param {object}   opts
 * @param {number}   opts.stageNumber  1-21
 * @param {number}   [opts.season]
 * @param {Function} opts.fetchTicker  ({stageNumber,season}) => Promise<{ok,posts}>
 * @param {*}        [opts.serverTimestamp]  FieldValue.serverTimestamp()
 * @param {boolean}  [opts.force]      berig igen selvom etapen er markeret
 * @returns {Promise<{ok:boolean, stage:number, added:number, tags?:Array, reason?:string}>}
 */
async function runEnrichRiderTags(db, anthropic, {
  stageNumber, season = 2026, fetchTicker, serverTimestamp, force = false,
} = {}) {
  const n = Number(stageNumber);
  if (!Number.isInteger(n) || n < 1 || n > 21) {
    return { ok: false, stage: n, added: 0, reason: 'bad-stage' };
  }

  const ref = db.collection('config').doc('riderProfiles');
  const snap = await ref.get();
  const data = (snap.exists && snap.data()) || {};
  const enriched = Array.isArray(data.enrichedStages) ? data.enrichedStages : [];
  if (!force && enriched.includes(n)) {
    return { ok: true, stage: n, added: 0, reason: 'already-enriched' };
  }

  const ticker = await fetchTicker({ stageNumber: n, season });
  if (!ticker || ticker.ok !== true || !Array.isArray(ticker.posts) || ticker.posts.length === 0) {
    return { ok: false, stage: n, added: 0, reason: `no-ticker:${ticker && ticker.reason ? ticker.reason : 'empty'}` };
  }

  const fresh = await extractRiderTags(anthropic, ticker.posts, n);
  const at = new Date().toISOString();
  const aiRaw = mergeAiTags(data.aiRaw, fresh, n, at);
  const added = aiRaw.length - (Array.isArray(data.aiRaw) ? data.aiRaw.length : 0);

  const nextEnriched = enriched.includes(n) ? enriched : [...enriched, n].sort((a, b) => a - b);
  await ref.set(
    { aiRaw, enrichedStages: nextEnriched, updatedAt: serverTimestamp },
    { merge: true },
  );
  return { ok: true, stage: n, added, tags: fresh };
}

module.exports = {
  RIDER_TAG_MODEL,
  RIDER_TAG_SYSTEM,
  MAX_POSTS,
  buildRiderTagPrompt,
  parseRiderTags,
  extractRiderTags,
  mergeAiTags,
  runEnrichRiderTags,
};
