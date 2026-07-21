/**
 * Hook: useGameLeagues(gameId) — de ligaer i spillet, jeg er medlem af.
 */
import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { COL } from '../../lib/constants';

/**
 * @param {string} gameId
 * @returns {{ leagues: Array<object>, loading: boolean, error: string|null }}
 */
export function useGameLeagues(gameId) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!gameId || !uid) {
      setLeagues([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(
      collection(db, COL.GAMES, gameId, COL.GAME_LEAGUES),
      where('memberUids', 'array-contains', uid),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLeagues(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(a.name).localeCompare(String(b.name), 'da')));
        setLoading(false);
      },
      (err) => {
        console.error('useGameLeagues fejl:', err);
        setError('Kunne ikke hente dine ligaer.');
        setLoading(false);
      },
    );
    return unsub;
  }, [gameId, uid]);

  return { leagues, loading, error };
}
