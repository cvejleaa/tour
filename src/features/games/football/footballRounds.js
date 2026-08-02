/**
 * Rene hjælpere til fodbold-spil: grupper kampe i runder og find den runde,
 * spilleren skal se/tip'e nu. Ingen Firebase-afhængigheder (testbar).
 */

/** Millisekunder fra et Firestore-Timestamp | Date | tal | ISO-streng. */
export function toMillis(t) {
  if (t == null) return null;
  if (typeof t === 'number') return t;
  if (typeof t === 'string') { const n = Date.parse(t); return Number.isNaN(n) ? null : n; }
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds != null) return t.seconds * 1000;
  if (t instanceof Date) return t.getTime();
  return null;
}

/**
 * Skjul kampe der ligger FØR spillets starttidspunkt (game.startAt). Bruges når
 * spillet først går i gang midt i sæsonen — så tæller/vises kun runder fra
 * starttidspunktet og frem. Uden starttidspunkt vises alle kampe.
 * Kampe uden kickoff bevares (kan ikke afgøres som "før start").
 * @param {Array<object>} matches
 * @param {number|null} startMs  millisekunder (fra toMillis(game.startAt))
 * @returns {Array<object>}
 */
export function afterStart(matches, startMs) {
  if (startMs == null) return matches || [];
  return (matches || []).filter((m) => {
    const k = toMillis(m.kickoff);
    return k == null || k >= startMs;
  });
}

/**
 * Grupper kampe i runder. Kampe uden runde-nummer samles i runde 0.
 * @param {Array<object>} matches
 * @returns {Array<{round:number, matches:Array<object>}>} sorteret efter runde
 */
export function groupByRound(matches) {
  const byRound = new Map();
  for (const m of matches || []) {
    const r = Number.isFinite(m.round) ? m.round : 0;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r).push(m);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, ms]) => ({
      round,
      matches: ms.slice().sort((a, b) => (toMillis(a.kickoff) ?? 0) - (toMillis(b.kickoff) ?? 0)),
    }));
}

/**
 * Vælg den "aktive" runde ud fra tidspunktet nu:
 * den tidligste runde der stadig har mindst én kamp, hvis kickoff ikke er
 * passeret. Hvis alle kampe er begyndt, vælges den sidste runde.
 * @param {Array<{round:number, matches:Array<object>}>} rounds
 * @param {number} nowMs
 * @returns {number|null} runde-nummeret, eller null hvis ingen runder
 */
export function activeRound(rounds, nowMs) {
  if (!rounds || rounds.length === 0) return null;
  for (const { round, matches } of rounds) {
    const hasUpcoming = matches.some((m) => {
      const k = toMillis(m.kickoff);
      return k == null || k > nowMs;
    });
    if (hasUpcoming) return round;
  }
  return rounds[rounds.length - 1].round;
}

/** Er kampens deadline (kickoff) passeret? */
export function isLocked(match, nowMs) {
  const k = toMillis(match?.kickoff);
  return k != null && k <= nowMs;
}

/**
 * Slutresultatet på en kamp, eller null hvis det ikke er kendt.
 *
 * Målene skrives af resultat-synken sammen med facit (superligaSync.js), men
 * har aldrig været VIST nogen steder — kampkortet har haft en hardkodet streg,
 * hvor scoren skulle stå.
 *
 * Number.isFinite og ikke en sandhedstest: 0 er falsy, så `m.homeGoals && …`
 * ville skjule hver eneste målløse kamp. Tomme strenge tælles heller ikke som
 * mål — Number('') er 0.
 *
 * @param {{homeGoals?:*, awayGoals?:*}} match
 * @returns {{home:number, away:number}|null}
 */
export function matchScore(match) {
  const tal = (g) => (g == null || g === '' ? NaN : Number(g));
  const home = tal(match?.homeGoals);
  const away = tal(match?.awayGoals);
  return Number.isFinite(home) && Number.isFinite(away) ? { home, away } : null;
}

/** Hvor længe en levende stilling må stå uden en puls, før vi kalder den
 *  forældet. Fem mistede minut-kørsler — rundhåndet, fordi brugerens ur kan
 *  gå skævt af serverens. */
export const LIVE_STALE_MS = 5 * 60 * 1000;

/** Dansk tekst for halvlegen. Serveren har allerede oversat til et lukket sæt;
 *  'ukendt' giver ingen tekst, så kortet bare siger "direkte". */
const HALVLEG = {
  foerste: '1. halvleg',
  pause: 'Pause',
  anden: '2. halvleg',
  forlaenget: 'Forlænget spilletid',
  straffe: 'Straffespark',
  afbrudt: 'Afbrudt',
};

/**
 * Den LEVENDE stilling på en kamp, eller null.
 *
 * Facit slår altid live: har kampen et resultat, er den slut, uanset hvad der
 * måtte ligge tilbage i live-feltet.
 *
 * `friskAt` er spillets puls (game.liveHeartbeatAt) — tidspunktet hvor synken
 * sidst kiggede. Den bruges frem for live.at, fordi live.at kun flytter sig,
 * når stillingen ÆNDRER sig: et 0-0 i 40 minutter ville ellers se dødt ud.
 *
 * @param {object} match
 * @param {number|null} friskAt
 * @param {number} nowMs
 * @returns {{home:number, away:number, halvleg:string|null, afbrudt:boolean,
 *            forældet:boolean, setAt:number|null}|null}
 */
export function liveScore(match, friskAt, nowMs) {
  if (match?.result != null && match.result !== '') return null;
  // Forsvar i dybden: en stilling hører aldrig til på et kort, der stadig
  // tager imod tips. Skrivestien sikrer det allerede (live skrives kun på
  // kampe, hvis kickoff er passeret), men så ville et dokument, der bliver
  // forkert på anden vis, kunne vise stillingen for et åbent tip.
  if (!isLocked(match, nowMs)) return null;
  const l = match?.live;
  if (!l || !Number.isFinite(Number(l.home)) || !Number.isFinite(Number(l.away))) return null;
  // Number(null) er 0, ikke NaN — uden vagten ville en manglende puls læses
  // som 1970 og gøre enhver levende stilling "forældet". Samme fælde som
  // Number('') i matchScore ovenfor.
  const tid = (v) => (v == null || v === '' ? NaN : Number(v));
  const puls = Number.isFinite(tid(friskAt)) ? tid(friskAt) : tid(l.at);
  return {
    home: Number(l.home),
    away: Number(l.away),
    halvleg: HALVLEG[l.status] || null,
    afbrudt: l.status === 'afbrudt',
    // Forældet, ikke forsvundet: et tal med et ærligt forbehold er mere værd
    // end en streg. Vi sletter aldrig stillingen, vi dæmper den.
    forældet: Number.isFinite(puls) ? nowMs - puls > LIVE_STALE_MS : true,
    setAt: Number.isFinite(puls) ? puls : null,
  };
}
