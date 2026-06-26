/**
 * Hook: useLeagues
 * Abonnerer på alle ligaer, hvor den aktuelle brugers uid er i memberUids.
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * @param {string|null} uid  – den indloggede brugers uid
 * @returns {{
 *   leagues: Array<object>,
 *   loading: boolean,
 *   error:   string|null,
 * }}
 */
export function useLeagues(uid) {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) {
      setLeagues([]);
      setLoading(false);
      return;
    }

    // Hent ligaer, som brugeren er medlem af (Firestore array-contains)
    const q = query(
      collection(db, COL.LEAGUES),
      where('memberUids', 'array-contains', uid),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setLeagues(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useLeagues fejl:', err);
        setError('Kunne ikke hente ligaer.');
        setLoading(false);
      },
    );

    return unsub;
  }, [uid]);

  return { leagues, loading, error };
}
