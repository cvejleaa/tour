// Hook: live-lytning på topscorer-listen (config/topScorers).
// Skrives af Cloud Function 'syncScorers' fra football-data.org.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * @returns {{ list: Array<object>, updatedAt: object|null, loading: boolean, error: string }}
 */
export function useTopScorers() {
  const [data, setData] = useState({ list: [], updatedAt: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const ref = doc(db, COL.CONFIG, 'topScorers');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = (snap && typeof snap.exists === 'function' && snap.exists()) ? snap.data() : null;
        setData({ list: Array.isArray(d?.list) ? d.list : [], updatedAt: d?.updatedAt ?? null });
        setLoading(false);
      },
      (err) => {
        console.error('useTopScorers fejl:', err);
        setError('Kunne ikke hente topscorere.');
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { list: data.list, updatedAt: data.updatedAt, loading, error };
}
