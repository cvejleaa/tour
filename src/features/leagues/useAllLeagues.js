// Hook (admin): abonnerer på ALLE ligaer. Kræver globalAdmin/owner (Security Rules).
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useAllLeagues() {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, COL.LEAGUES), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLeagues(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useAllLeagues fejl:', err);
        setError('Kunne ikke hente ligaer.');
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { leagues, loading, error };
}
