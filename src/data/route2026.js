// Officiel Tour de France 2026-rute (4.–26. juli, 2 hviledage).
// Data udtrukket fra racecenter.letour.fr (de 21 etaper med type, distance,
// start/mål-by, billede og bymotekst). Bruges som fallback/seed så etape-siden
// kan vises FØR sync'en har seedet etaperne i Firestore — og som kilde til den
// rigtige seed via admin (TourTab → seedTourRoute).
import { stageId, deriveKickoff } from '../lib/tourStages';
import { activeQuestionsForStage } from '../lib/tourScoring';
import ROUTE_2026 from './route2026.json';

/**
 * De 21 officielle 2026-etaper som etape-dokumenter klar til visning/seed.
 * Beholder navnet `placeholderRoute2026` for ikke at bryde eksisterende imports
 * (StagesPage, DashboardPage, TourTab) — det er ikke længere placeholder-data.
 * @param {number} [season]
 * @returns {Array<object>}
 */
export function placeholderRoute2026(season = 2026) {
  return ROUTE_2026.map((s) => ({
    id: stageId(s.number, season),
    season,
    number: s.number,
    date: s.date,
    kickoff: deriveKickoff(s.date, 12),
    type: s.type,
    typeCode: s.typeCode,
    km: s.km,
    startCity: s.startCity,
    finishCity: s.finishCity,
    image: s.image,
    description: s.description,
    // Eksplicitte type-standarder, så friskt seedede etaper bærer deres egne
    // aktive spørgsmål (helperen dækker også fravær af feltet).
    questions: activeQuestionsForStage(s),
  }));
}
