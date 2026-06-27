/**
 * Rene hjælpefunktioner til rangeringsberegninger.
 * Ingen Firebase-afhængigheder – nemme at teste isoleret.
 */

import { TIMEZONE } from '../../lib/constants';
import { stageStatus } from '../../lib/tourStages';
import { scoreStageBet } from '../../lib/tourScoring';

/**
 * Returnerer dags dato som 'YYYY-MM-DD' i Europe/Copenhagen-tidszonen.
 * @param {Date} [now]  – valgfri "nu"-dato; bruges i tests.
 */
export function getTodayInCPH(now = new Date()) {
  return now.toLocaleDateString('sv-SE', { timeZone: TIMEZONE }); // 'sv-SE' → ISO-format
}

/**
 * Filtrerer et array af brugerobjekter til kun dem,
 * der er med i det givne sæt af UIDs.
 *
 * @param {Array<{uid: string}>} users
 * @param {string[]|null|undefined} memberUids  – null/undefined → returner alle
 * @returns {Array<{uid: string}>}
 */
export function filterByMembers(users, memberUids) {
  if (!memberUids || memberUids.length === 0) return users;
  const set = new Set(memberUids);
  return users.filter((u) => set.has(u.uid));
}

/**
 * Samler de UIDs en spiller må se i stillingen: sig selv + alle medlemmer
 * af de ligaer, spilleren selv er med i. Bruges til at begrænse den
 * "samlede" stilling til ens egne liga-netværk.
 *
 * @param {Array<{memberUids?: string[]}>} leagues  – spillerens egne ligaer
 * @param {string|null|undefined} selfUid           – den indloggede bruger
 * @returns {string[]}  – unikke UIDs (mindst spilleren selv hvis kendt)
 */
export function collectVisibleUids(leagues, selfUid) {
  const set = new Set();
  if (selfUid) set.add(selfUid);
  for (const l of leagues ?? []) {
    for (const uid of l?.memberUids ?? []) set.add(uid);
  }
  return [...set];
}

/**
 * Sorterer brugere faldende efter totalPoints (allerede denormaliseret).
 * Giver en ny array – muterer ikke input.
 *
 * @param {Array<{totalPoints?: number}>} users
 * @returns {Array<{totalPoints?: number}>}
 */
export function sortByPoints(users) {
  return [...users].sort(
    (a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0)
  );
}

/**
 * Antal afgjorte etaper hver spiller har tippet — bruges til "gns. point pr.
 * tippet etape". Tæller etape-tip (mindst ét holdvalg) på afgjorte etaper.
 *
 * @param {Array<object>} stages                – alle etaper (skal have .id + status/result)
 * @param {Map<string, Set<string>>} byStage    – stageId → Set(uids) der har tippet
 * @returns {Record<string, number>}            – uid → antal tippede, afgjorte etaper
 */
export function tippedFinishedCounts(stages, byStage) {
  const counts = {};
  for (const s of stages ?? []) {
    if (!s || stageStatus(s, Date.now()) !== 'done') continue;
    const set = byStage?.get?.(s.id);
    if (!set) continue;
    for (const uid of set) counts[uid] = (counts[uid] ?? 0) + 1;
  }
  return counts;
}

/**
 * Beregner point pr. spiller fra dagens afgjorte etaper.
 * Rent klient-baseret: etaper (afgjort + dato i dag) + etape-tip.
 *
 * @param {Array<object>} stages  – alle hentede etaper
 * @param {Array<object>} bets    – alle hentede etape-tip (har .stageId, .uid)
 * @param {string} todayStr       – 'YYYY-MM-DD'
 * @returns {Record<string, number>}  – uid → point (kun spillere med ≥1 tip)
 */
export function computeDailyPoints(stages, bets, todayStr) {
  // Find afgjorte etaper med dato i dag
  const todayStages = (stages ?? []).filter(
    (s) => stageStatus(s, Date.now()) === 'done' && s.date === todayStr && s.result,
  );
  const resultById = new Map(todayStages.map((s) => [s.id, s.result]));
  if (resultById.size === 0) return {};

  const pointsByUid = {};
  for (const bet of bets ?? []) {
    const result = resultById.get(bet.stageId);
    if (!result) continue;
    // Brug serverberegnede point hvis de findes, ellers genberegn lokalt.
    const pts = typeof bet.points === 'number'
      ? bet.points
      : scoreStageBet(bet, result).points;
    pointsByUid[bet.uid] = (pointsByUid[bet.uid] ?? 0) + pts;
  }
  return pointsByUid;
}
