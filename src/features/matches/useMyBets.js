// ---------------------------------------------------------------------------
// Hook: useMyBets – henter brugerens egne tips med onSnapshot.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * Returnerer { bets, loading, error }.
 * bets er en Map: matchId -> bet-objekt (for hurtig opslag i MatchCard).
 * @param {string|null} uid
 */
export function useMyBets(uid) {
  const [bets, setBets] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) {
      setBets(new Map());
      setLoading(false);
      return;
    }

    // Hent alle bets hvor uid matcher
    const q = query(
      collection(db, COL.BETS),
      where('uid', '==', uid),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const m = new Map();
        snap.docs.forEach((d) => {
          const data = d.data();
          m.set(data.matchId, { id: d.id, ...data });
        });
        setBets(m);
        setLoading(false);
      },
      (err) => {
        console.error('useMyBets fejl:', err);
        setError(err);
        setLoading(false);
      },
    );

    return unsub;
  }, [uid]);

  return { bets, loading, error };
}
