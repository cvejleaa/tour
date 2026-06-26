// Hook: useStages – henter alle etaper med onSnapshot, sorteret på nummer.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useStages() {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, COL.STAGES), orderBy('number', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setStages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useStages fejl:', err);
        setError(err);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { stages, loading, error };
}
