// ---------------------------------------------------------------------------
// Hook: useMatches – henter alle kampe med onSnapshot og sorterer efter kickoff.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * Returnerer { matches, loading, error }.
 * Kampe sorteres stigende på kickoff (Firestore-side).
 */
export function useMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, COL.MATCHES),
      orderBy('kickoff', 'asc'),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useMatches fejl:', err);
        setError(err);
        setLoading(false);
      },
    );

    return unsub;
  }, []);

  return { matches, loading, error };
}
