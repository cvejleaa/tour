// Hook (admin): abonnerer på ALLE ligaer. Kræver globalAdmin/owner (Security Rules).
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useAllLeagues(enabled = true) {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Kun globalAdmin/owner må læse alle ligaer — spring abonnementet over
    // ellers (undgår permission-denied-støj for menige brugere).
    if (!enabled) { setLeagues([]); setLoading(false); return undefined; }
    const q = query(collection(db, COL.LEAGUES), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        // Dokument-id'et vinder (spread først), og navnet normaliseres til en
        // streng ét sted for alle forbrugere — et map som navn kastede i React
        // hos alle ligaens medlemmer (Security-fund). Samme form som useGameLeagues.
        setLeagues(snap.docs.map((d) => {
          const data = d.data();
          return { ...data, id: d.id, name: typeof data.name === 'string' ? data.name : '' };
        }));
        setLoading(false);
      },
      (err) => {
        console.error('useAllLeagues fejl:', err);
        setError('Kunne ikke hente ligaer.');
        setLoading(false);
      },
    );
    return unsub;
  }, [enabled]);

  return { leagues, loading, error };
}
