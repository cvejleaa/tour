// Hook: useTeams – holdnavne til tip-dropdowns.
//
// Listen er ALTID den officielle 2026-holdliste (samme kilde som holdsiden,
// letours startfelt) — alfabetisk sorteret. Tidligere blev listen selv-
// udfyldt fra resultaterne (teams-kollektionen), men det efterlod historisk
// støj (nedlagte hold som "ARKEA-B&B HOTELS", 2025-navne, ALL-CAPS-varianter)
// i dropdown'en. Resultattabellernes navnevarianter håndteres i stedet af
// alias-laget i scoring/visning, så dropdown og holdside nu er 1:1.
import { TOUR_TEAMS } from '../../data/tourTeams2026';

const SORTED_TEAMS = [...TOUR_TEAMS].sort((a, b) => a.localeCompare(b, 'da'));

// eslint-disable-next-line no-unused-vars
export function useTeams(season) {
  return { teams: SORTED_TEAMS, loading: false };
}
