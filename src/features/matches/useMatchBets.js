/**
 * Hook: useMatchBets
 * Abonnerer på alle tips for én kamp. Kun aktiveret når kampen er låst
 * (efter kickoff), hvor sikkerhedsreglerne tillader at læse andres tips.
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useMatchBets(matchId, enabled = false) {
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled || !matchId) { setBets([]); setLoading(false); return undefined; }
    setLoading(true);
    const q = query(collection(db, COL.BETS), where('matchId', '==', matchId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useMatchBets fejl:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [matchId, enabled]);

  return { bets, loading };
}
