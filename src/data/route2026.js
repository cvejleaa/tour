// Placeholder-rute for Tour de France 2026 (4.–26. juli, 2 hviledage).
// Bruges som fallback så etape-siden kan vises/bruges FØR sync'en har seedet
// de rigtige etaper i Firestore. Datoer/typer er foreløbige og overskrives
// automatisk når de rigtige etapedata kommer ind.
import { stageId, deriveKickoff } from '../lib/tourStages';

// Datoer: stage 1–9 = 4.–12. juli, hvile 13., 10–15 = 14.–19., hvile 20.,
// 16–21 = 21.–26. juli.
const DATES = [
  '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08',
  '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12',
  '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19',
  '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26',
];
// Foreløbig typefordeling (rettes med rigtige data).
const TYPES = [
  'flat', 'hilly', 'flat', 'itt', 'hilly', 'mountain', 'flat', 'mountain', 'mountain',
  'flat', 'hilly', 'flat', 'mountain', 'mountain', 'itt',
  'flat', 'mountain', 'mountain', 'hilly', 'itt', 'flat',
];

export function placeholderRoute2026(season = 2026) {
  return DATES.map((date, i) => ({
    id: stageId(i + 1, season),
    season,
    number: i + 1,
    date,
    kickoff: deriveKickoff(date, 12),
    type: TYPES[i] || 'unknown',
    startCity: null,
    finishCity: null,
    placeholder: true,
  }));
}
