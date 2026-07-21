/**
 * Hook: useGameStandings(gameId) — per-spil-stilling.
 * Abonnerer på spillets deltagere (games/{gameId}/players) og på bruger-
 * profilerne (til navn/avatar), og returnerer en rangeret liste.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, USER_STATUS } from '../../lib/constants';
import { rankStandings } from './gameStandings';

/**
 * @param {string} gameId
 * @returns {{ standings: Array<object>, loading: boolean, error: string|null }}
 */
export function useGameStandings(gameId) {
  const [players, setPlayers] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [playersLoading, setPlayersLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState(null);

  // Deltagere i spillet (+ deres point).
  useEffect(() => {
    if (!gameId) return undefined;
    setPlayersLoading(true);
    const unsub = onSnapshot(
      collection(db, COL.GAMES, gameId, COL.GAME_PLAYERS),
      (snap) => {
        setPlayers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
        setPlayersLoading(false);
      },
      (err) => {
        console.error('useGameStandings (deltagere) fejl:', err);
        setError('Kunne ikke hente stillingen.');
        setPlayersLoading(false);
      },
    );
    return unsub;
  }, [gameId]);

  // Bruger-profiler (navn/avatar) for de godkendte spillere.
  useEffect(() => {
    const q = query(collection(db, COL.USERS), where('status', '==', USER_STATUS.APPROVED));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => { map[d.id] = d.data(); });
        setUsersById(map);
        setUsersLoading(false);
      },
      (err) => {
        console.error('useGameStandings (brugere) fejl:', err);
        setUsersLoading(false);
      },
    );
    return unsub;
  }, []);

  const standings = useMemo(() => rankStandings(players, usersById), [players, usersById]);
  return { standings, loading: playersLoading || usersLoading, error };
}
