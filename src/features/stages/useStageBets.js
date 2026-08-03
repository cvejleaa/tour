// ---------------------------------------------------------------------------
// useStageBets – henter ALLE spilleres tips på én etape. Firestore-reglerne
// tillader at læse andres etape-tips efter etapestart, så dette bruges til at
// vise "alles svar" når etapen er afgjort. Aktiveres kun når enabled=true.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * @param {string|null} stageId
 * @param {boolean} enabled
 * @returns {{ bets: Array, loading: boolean }}
 */
export function useStageBets(stageId, enabled = false) {
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled || !stageId) { setBets([]); setLoading(false); return undefined; }
    setLoading(true);
    const q = query(collection(db, COL.STAGE_BETS), where('stageId', '==', stageId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useStageBets fejl:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [stageId, enabled]);

  return { bets, loading };
}
