// Hook til live-lytning på automatik-status (config/syncStatus).
// Skrives af Cloud Function 'syncResults' ved hver kørsel, så admin kan se,
// om resultat-automatikken kører — eller er død (token udløbet, API-fejl).
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * @returns {{ status: object|null, loading: boolean, error: string }}
 */
export function useSyncStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const ref = doc(db, COL.CONFIG, 'syncStatus');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setStatus(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error('useSyncStatus fejl:', err);
        setError('Kunne ikke hente synk-status.');
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { status, loading, error };
}
