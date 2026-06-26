/**
 * Hook: useLeagueComments
 * Abonnerer (live) på beskeder på en ligas væg, ældste først.
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * @param {string|null} leagueId
 * @returns {{ comments: Array<object>, loading: boolean, error: string|null }}
 */
export function useLeagueComments(leagueId) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!leagueId) {
      setComments([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(
      collection(db, COL.LEAGUE_COMMENTS),
      where('leagueId', '==', leagueId),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('useLeagueComments fejl:', err);
        setError('Kunne ikke hente kommentarer.');
        setLoading(false);
      },
    );
    return unsub;
  }, [leagueId]);

  return { comments, loading, error };
}
