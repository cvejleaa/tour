// Hook: live-lytning på den officielle stilling (config/standings),
// synket af Cloud Function 'syncStandings' fra football-data.org.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useOfficialStandings() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, COL.CONFIG, 'standings');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = (snap && typeof snap.exists === 'function' && snap.exists()) ? snap.data() : null;
        setTables(Array.isArray(d?.tables) ? d.tables : []);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  return { tables, loading };
}
