// Hook til live-lytning på alle kampe i Firestore.
// Bruges af global admin og owner til kampstyring.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * Returnerer live-opdateret liste over alle kampe.
 * @returns {{ matches: Array, loading: boolean, error: string }}
 */
export function useMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Hent alle kampe sorteret efter afsparktidspunkt
    const q = query(
      collection(db, COL.MATCHES),
      orderBy('kickoff', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useMatches fejl:', err);
        setError('Kunne ikke hente kamplisten. Tjek din forbindelse.');
        setLoading(false);
      }
    );

    return unsub;
  }, []);

  return { matches, loading, error };
}
