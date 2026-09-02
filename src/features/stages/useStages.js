// Hook: useStages – etaper for den aktive sæson, sorteret på nummer.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useStages(season) {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!season) { setStages([]); setLoading(false); return undefined; }
    const q = query(
      collection(db, COL.STAGES),
      where('season', '==', season),
      orderBy('number', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setStages(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
        setLoading(false);
      },
      (err) => {
        console.error('useStages fejl:', err);
        setError(err);
        setLoading(false);
      },
    );
    return unsub;
  }, [season]);

  return { stages, loading, error };
}
