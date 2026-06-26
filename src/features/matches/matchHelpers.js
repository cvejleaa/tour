// ---------------------------------------------------------------------------
// Rene hjælpefunktioner til kamp-logik. Ingen Firebase-afhængigheder.
// Kan testes uden netværk.
// ---------------------------------------------------------------------------
import { TIMEZONE } from '../../lib/constants';

/**
 * Afgør om en kamp er låst (nu >= kickoff).
 * @param {Date|number|{toDate:()=>Date}|null} kickoff  Firestore Timestamp, Date eller ms
 * @param {Date} [now]  Injiceret tidspunkt til test (default: new Date())
 * @returns {boolean}
 */
export function isMatchLocked(kickoff, now = new Date()) {
  if (!kickoff) return false;
  const ko =
    typeof kickoff.toDate === 'function'
      ? kickoff.toDate()
      : new Date(kickoff);
  return now >= ko;
}

/**
 * Afgør om en kamp faktisk kan tippes lige nu:
 *  - holdene skal være kendt (ikke en knockout der venter på hold)
 *  - status må ikke være 'pendingTeams'
 *  - kampen må ikke være låst (kickoff passeret)
 * @param {object} match
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isTippable(match, now = new Date()) {
  if (!match) return false;
  if (!match.homeTeam || !match.awayTeam) return false;
  if (match.status === 'pendingTeams') return false;
  return !isMatchLocked(match.kickoff, now);
}

/**
 * Formaterer en dato til dansk dagsnøgle, fx "onsdag 11. juni".
 * Bruges som grupperings-nøgle (og vises som overskrift).
 * @param {Date|{toDate:()=>Date}|null} kickoff
 * @returns {string}
 */
export function dayKey(kickoff) {
  if (!kickoff) return 'Ukendt dato';
  const d =
    typeof kickoff.toDate === 'function' ? kickoff.toDate() : new Date(kickoff);
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d);
}

/**
 * Grupperer en liste af kampe (med .kickoff) efter dansk dagsnøgle.
 * Returnerer array af { label: string, matches: Match[] } – sorteret efter dag.
 * @param {Array} matches
 * @returns {Array<{label:string, matches:Array}>}
 */
export function groupMatchesByDay(matches) {
  const map = new Map();
  for (const m of matches) {
    const key = dayKey(m.kickoff);
    if (!map.has(key)) map.set(key, { label: key, matches: [], _ts: m.kickoff });
    map.get(key).matches.push(m);
  }
  // Sorter dagene kronologisk (brug første kamps kickoff)
  return [...map.values()].sort((a, b) => {
    const ta = typeof a._ts?.toDate === 'function' ? a._ts.toDate() : new Date(a._ts ?? 0);
    const tb = typeof b._ts?.toDate === 'function' ? b._ts.toDate() : new Date(b._ts ?? 0);
    return ta - tb;
  });
}

/**
 * Ordnet liste af dagsnøgler (labels) der har kampe – kronologisk.
 * Bruges til dag-for-dag-navigation.
 * @param {Array} matches
 * @returns {string[]}
 */
export function tournamentDays(matches) {
  return groupMatchesByDay(matches ?? []).map((g) => g.label);
}

/**
 * Formaterer kickoff-tidspunkt til "HH:mm" (Copenhagen-tid).
 * @param {*} kickoff
 * @returns {string}
 */
export function formatKickoffTime(kickoff) {
  if (!kickoff) return '--:--';
  const d =
    typeof kickoff.toDate === 'function' ? kickoff.toDate() : new Date(kickoff);
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Formaterer kickoff-dato kompakt til "11. jun" (Copenhagen-tid).
 * @param {*} kickoff
 * @returns {string}
 */
export function formatKickoffDate(kickoff) {
  if (!kickoff) return '';
  const d =
    typeof kickoff.toDate === 'function' ? kickoff.toDate() : new Date(kickoff);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE,
    day: 'numeric',
    month: 'short',
  }).format(d);
}

/** ms-tid for et kickoff-felt (Timestamp/Date/ms). Ugyldigt → 0. */
function kickoffMs(kickoff) {
  if (!kickoff) return 0;
  const d = typeof kickoff.toDate === 'function' ? kickoff.toDate() : new Date(kickoff);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Find id'et på den "aktuelle" kamp ud fra uret:
 *  1) første kamp der er i gang (status 'live'), ellers
 *  2) næste kamp hvis kickoff endnu ikke er passeret, ellers
 *  3) sidste kamp (alt er spillet).
 * Forventer kampe sorteret stigende på kickoff.
 * @param {Array} matches
 * @param {Date} [now]
 * @returns {string|null}
 */
export function findCurrentMatchId(matches, now = new Date()) {
  if (!Array.isArray(matches) || matches.length === 0) return null;
  const nowMs = now.getTime();
  const live = matches.find((m) => m.status === 'live');
  if (live) return live.id ?? null;
  const next = matches.find((m) => kickoffMs(m.kickoff) >= nowMs);
  if (next) return next.id ?? null;
  return matches[matches.length - 1].id ?? null;
}

/**
 * Er en dag-gruppe "tidligere" (alle kampe spillet og ikke i dag)?
 * Bruges til at folde gamle kampe sammen i kamplisten.
 * @param {{label:string, matches:Array}} group
 * @param {string} todayLabel  dansk dagsnøgle for i dag (fra dayKey)
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isDayGroupPast(group, todayLabel, now = new Date()) {
  if (!group || !Array.isArray(group.matches) || group.matches.length === 0) return false;
  if (group.label === todayLabel) return false;
  const nowMs = now.getTime();
  return group.matches.every((m) => m.status !== 'live' && kickoffMs(m.kickoff) < nowMs);
}

/**
 * Udfald af en kamp set fra ét holds perspektiv.
 * @param {object} match  kamp med result + homeTeam/awayTeam
 * @param {string} code    holdkode
 * @returns {'win'|'draw'|'loss'|null}  null hvis ikke spillet eller holdet ikke er med
 */
export function teamMatchOutcome(match, code) {
  if (!match || !match.result) return null;
  const r = match.result;
  const isHome = match.homeTeam === code;
  const isAway = match.awayTeam === code;
  if (!isHome && !isAway) return null;
  // Knockout afgjort (evt. på straffe): det hold der gik videre, vandt.
  if (r.advance) return r.advance === code ? 'win' : 'loss';
  const gf = isHome ? r.home : r.away;
  const ga = isHome ? r.away : r.home;
  if (gf > ga) return 'win';
  if (gf < ga) return 'loss';
  return 'draw';
}

/**
 * Returnerer rundens fulde danske navn.
 * @param {string} round
 * @returns {string}
 */
export function roundLabel(round) {
  const map = {
    group: 'Gruppespil',
    r32: '1/16-finale',
    r16: '1/8-finale',
    qf: 'Kvartfinale',
    sf: 'Semifinale',
    bronze: 'Bronzekamp',
    final: 'Finale',
  };
  return map[round] ?? round;
}

/**
 * Flag-emoji for en landekode (ISO 3166-1 alpha-2).
 * Virker i moderne browsere og iOS.
 * @param {string|null} code
 * @returns {string}
 */
export function flagEmoji(code) {
  if (!code || code.length !== 2) return '🏳️';
  return (
    String.fromCodePoint(
      ...code.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
    )
  );
}

/** Modsat side (selvmål tæller for modstanderen). Bevarer null/ukendt uændret. */
export function flipSide(side) {
  if (side === 'home') return 'away';
  if (side === 'away') return 'home';
  return side;
}

/** Kronologisk sortering af begivenheder på minut + tillægstid. */
function byMinute(a, b) {
  return ((a.minute ?? 999) - (b.minute ?? 999)) || ((a.injuryTime ?? 0) - (b.injuryTime ?? 0));
}

/**
 * Sortér mål kronologisk og påfør den løbende stilling EFTER hvert mål.
 * Selvmål (type 'OWN') tæller for modstanderen. Beregnes på de RÅ mål (med
 * uflippet `side`), så visningen efterfølgende selv kan flippe selvmål uden
 * at det påvirker scoren.
 * @param {Array<{minute?:number, injuryTime?:number, type?:string, side?:string}>} goals
 * @returns {Array<object>} samme mål (sorteret) med tilføjet `score: {home, away}`
 */
export function goalsWithRunningScore(goals) {
  const sorted = [...(Array.isArray(goals) ? goals : [])].sort(byMinute);
  let home = 0;
  let away = 0;
  return sorted.map((g) => {
    const scoringSide = g.type === 'OWN' ? flipSide(g.side) : g.side;
    if (scoringSide === 'home') home += 1;
    else if (scoringSide === 'away') away += 1;
    return { ...g, score: { home, away } };
  });
}

/**
 * Live-label til kamp-headeren, fx "1. halvleg · 43'" eller "2. halvleg · 67+2'".
 * Bygger på det synkede spilleminut (match.details.minute/injuryTime). Mangler
 * minuttet, returneres bare "LIVE".
 * @param {object} match
 * @returns {string}
 */
export function liveMinuteLabel(match) {
  const d = match?.details || {};
  const m = d.minute;
  if (m == null) return 'LIVE';
  const half = m <= 45 ? '1. halvleg' : m <= 90 ? '2. halvleg' : 'Forlænget tid';
  const it = d.injuryTime;
  const minuteStr = `${m}${it ? `+${it}` : ''}'`;
  return `${half} · ${minuteStr}`;
}
