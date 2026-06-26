/**
 * Rene hjælpefunktioner til rangeringsberegninger.
 * Ingen Firebase-afhængigheder – nemme at teste isoleret.
 */

import { TIMEZONE } from '../../lib/constants';
import { scoreMatch, scoreKnockout } from '../../lib/scoring';

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
 * Antal afsluttede kampe hver spiller har tippet — bruges til "gns. point pr.
 * tippet kamp". Bygger på tipParticipation (matchId → Set(uids)) krydset med de
 * afsluttede kampe, så kun kampe der har givet point tæller med.
 *
 * @param {Array<object>} matches             – alle kampe (skal have .id og .status)
 * @param {Map<string, Set<string>>} byMatch  – matchId → Set(uids) der har tippet
 * @returns {Record<string, number>}          – uid → antal tippede, afsluttede kampe
 */
export function tippedFinishedCounts(matches, byMatch) {
  const counts = {};
  for (const m of matches ?? []) {
    if (!m || m.status !== 'finished') continue;
    const set = byMatch?.get?.(m.id);
    if (!set) continue;
    for (const uid of set) counts[uid] = (counts[uid] ?? 0) + 1;
  }
  return counts;
}

/**
 * Beregner point pr. spiller fra dagens afsluttede kampe.
 * Rent klient-baseret: matcher (finished + kickoff i dag) + bets.
 *
 * @param {Array<object>} matches  – alle hentede kampe
 * @param {Array<object>} bets     – alle hentede bets (documentId = uid_matchId)
 * @param {string} todayStr        – 'YYYY-MM-DD'
 * @returns {Record<string, number>}  – uid → point (kun spillere med ≥1 bet)
 */
export function computeDailyPoints(matches, bets, todayStr) {
  // Find id'er på afsluttede kampe med kickoff i dag
  const todayMatchIds = new Set(
    matches
      .filter((m) => {
        if (m.status !== 'finished') return false;
        const kickoff = m.kickoff?.toDate ? m.kickoff.toDate() : new Date(m.kickoff);
        const dateStr = kickoff.toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
        return dateStr === todayStr;
      })
      .map((m) => m.id)
  );

  if (todayMatchIds.size === 0) return {};

  // Beregn point pr. uid
  const pointsByUid = {};

  bets.forEach((bet) => {
    if (!todayMatchIds.has(bet.matchId)) return;

    // Find den tilhørende kamp for at få resultat
    const match = matches.find((m) => m.id === bet.matchId);
    if (!match?.result) return;

    // Knockout-kampe scorer anderledes (advance)
    const isKnockout = match.round && match.round !== 'group';
    const pts = isKnockout
      ? scoreKnockout(bet, match.result)
      : scoreMatch(bet, match.result);

    pointsByUid[bet.uid] = (pointsByUid[bet.uid] ?? 0) + pts;
  });

  return pointsByUid;
}
