/**
 * Hook: useLeagueMessages(gameId, leagueId) — live liga-væg (seneste beskeder).
 * Kun aktiv når leagueId er sat (fx når kortet er åbnet).
 */
import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, query, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useLeagueMessages(gameId, leagueId, max = 50) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId || !leagueId) { setMessages([]); setLoading(false); return undefined; }
    setLoading(true);
    const q = query(
      collection(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId, COL.GAME_LEAGUE_MSGS),
      orderBy('createdAt', 'desc'),
      limit(max),
    );
    const unsub = onSnapshot(
      q,
      (snap) => { setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error('useLeagueMessages fejl:', err); setMessages([]); setLoading(false); },
    );
    return unsub;
  }, [gameId, leagueId, max]);

  return { messages, loading };
}
