// Hook: live-lytning på mail-loggen (emailLog), nyeste først.
// Skrives af Cloud Functions; kun globale admins kan læse (Security Rules).
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * @param {number} max  antal seneste loglinjer
 * @returns {{ entries: Array<object>, loading: boolean, error: string }}
 */
export function useEmailLog(max = 100) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query(collection(db, COL.EMAIL_LOG), orderBy('createdAt', 'desc'), limit(max));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useEmailLog fejl:', err);
        setError('Kunne ikke hente mail-loggen.');
        setLoading(false);
      },
    );
    return unsub;
  }, [max]);

  return { entries, loading, error };
}
