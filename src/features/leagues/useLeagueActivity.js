/**
 * Hook: useLeagueActivity — live aktivitets-feed for en liga (nyeste først).
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useLeagueActivity(leagueId, max = 30) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) { setItems([]); setLoading(false); return undefined; }
    setLoading(true);
    const q = query(
      collection(db, COL.LEAGUE_ACTIVITY),
      where('leagueId', '==', leagueId),
      orderBy('createdAt', 'desc'),
      limit(max),
    );
    const unsub = onSnapshot(
      q,
      (snap) => { setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error('useLeagueActivity fejl:', err); setLoading(false); },
    );
    return unsub;
  }, [leagueId, max]);

  return { items, loading };
}
