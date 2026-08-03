/**
 * Hook: useVisibleGameStandings(gameId) — spil-stillingen som den må vises for
 * den indloggede spiller: kun dem man deler mindst én liga med (plus én selv).
 * Ranglisten er altså jeres indbyrdes opgør — ikke hele spillets deltagerfelt.
 */
import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useGameStandings } from './useGameStandings';
import { leagueMateStandings } from './gameStandings';

/**
 * @param {string} gameId
 * @returns {{
 *   standings: Array<object>,
 *   leagues: Array<object>,
 *   leagueCount: number,
 *   loading: boolean,
 *   error: string|null,
 * }}
 *   leagues gives med retur, så visningen kan filtrere ned på én enkelt liga
 *   uden at åbne et dublet-abonnement på samme forespørgsel.
 */
export function useVisibleGameStandings(gameId) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  // useGameStandings abonnerer allerede på mine ligaer og giver dem med retur —
  // et ekstra useGameLeagues her ville åbne et dublet-abonnement på samme query.
  const { standings: all, leagues, loading, error } = useGameStandings(gameId);

  const standings = useMemo(
    () => leagueMateStandings(all, leagues, uid),
    [all, leagues, uid],
  );

  return { standings, leagues, leagueCount: leagues.length, loading, error };
}
