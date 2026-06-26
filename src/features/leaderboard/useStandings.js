/**
 * Hook: useStandings
 * Abonnerer på users-collection (onSnapshot) og returnerer alle godkendte
 * spillere sorteret faldende efter totalPoints.
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, USER_STATUS } from '../../lib/constants';
import { sortByPoints } from './standingsUtils';

/**
 * @returns {{ standings: Array<object>, loading: boolean, error: string|null }}
 */
export function useStandings() {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Hent kun godkendte spillere
    const q = query(
      collection(db, COL.USERS),
      where('status', '==', USER_STATUS.APPROVED)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        setStandings(sortByPoints(users));
        setLoading(false);
      },
      (err) => {
        console.error('useStandings fejl:', err);
        setError('Kunne ikke hente stilling.');
        setLoading(false);
      }
    );

    return unsub;
  }, []);

  return { standings, loading, error };
}
