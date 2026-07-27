/**
 * Hook: useVisibleGameStandings(gameId) — spil-stillingen som den må vises for
 * den indloggede spiller: kun dem man deler mindst én liga med (plus én selv).
 * Ranglisten er altså jeres indbyrdes opgør — ikke hele spillets deltagerfelt.
 */
import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useGameStandings } from './useGameStandings';
import { useGameLeagues } from './useGameLeagues';
import { leagueMateStandings } from './gameStandings';

/**
 * @param {string} gameId
 * @returns {{ standings: Array<object>, leagueCount: number, loading: boolean, error: string|null }}
 */
export function useVisibleGameStandings(gameId) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { standings: all, loading: sLoading, error } = useGameStandings(gameId);
  const { leagues, loading: lLoading } = useGameLeagues(gameId);

  const standings = useMemo(
    () => leagueMateStandings(all, leagues, uid),
    [all, leagues, uid],
  );

  return { standings, leagueCount: leagues.length, loading: sLoading || lLoading, error };
}
