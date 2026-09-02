/**
 * Hook: useGameBets(gameId) — live-abonnement på MINE tips i ét spil.
 * Returnerer et opslag matchId → tip, så tip-fladen hurtigt kan slå op.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { COL } from '../../lib/constants';

/**
 * @param {string} gameId
 * @returns {{ betsByMatch: Record<string, object>, loading: boolean }}
 */
export function useGameBets(gameId) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId || !uid) {
      setBets([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(
      collection(db, COL.GAMES, gameId, COL.GAME_BETS),
      where('uid', '==', uid),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBets(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
        setLoading(false);
      },
      (err) => {
        console.error('useGameBets fejl:', err);
        setBets([]);
        setLoading(false);
      },
    );
    return unsub;
  }, [gameId, uid]);

  const betsByMatch = useMemo(() => {
    const map = {};
    for (const b of bets) if (b.matchId) map[b.matchId] = b;
    return map;
  }, [bets]);

  return { betsByMatch, loading };
}
