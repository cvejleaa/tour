// ---------------------------------------------------------------------------
// Hook: useStatsData – henter ALLE afsluttede kampe, alle tips på dem, og
// spillernavne. Bruges af Statistik-siden (både "I dag" og "Hele turneringen").
// Tips kan først læses efter kickoff (Security Rules), hvilket afsluttede kampe
// altid opfylder.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, MATCH_STATUS, TIMEZONE } from '../../lib/constants';
import { getTodayInCPH, computeDailyPoints } from '../leaderboard/standingsUtils';

function toDate(k) {
  return k?.toDate ? k.toDate() : new Date(k);
}

export function useStatsData() {
  const todayStr = useMemo(() => getTodayInCPH(), []);
  const [matches, setMatches] = useState([]);
  const [bets, setBets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingBets, setLoadingBets] = useState(true);
  const [error, setError] = useState(null);

  // Alle afsluttede kampe (sorteret efter kickoff)
  useEffect(() => {
    const q = query(collection(db, COL.MATCHES), where('status', '==', MATCH_STATUS.FINISHED));
    return onSnapshot(q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => toDate(a.kickoff) - toDate(b.kickoff));
        setMatches(list);
        setLoadingMatches(false);
      },
      (err) => { console.error('useStatsData matches:', err); setError('Kunne ikke hente kampe.'); setLoadingMatches(false); },
    );
  }, []);

  // Spillere (til navne)
  useEffect(() => {
    return onSnapshot(collection(db, COL.USERS),
      (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('useStatsData users:', err),
    );
  }, []);

  const finishedIds = useMemo(() => matches.map((m) => m.id), [matches]);

  // Tips for alle afsluttede kampe (chunket pga. Firestore 'in'-grænse på 30)
  useEffect(() => {
    if (loadingMatches) return undefined;
    if (finishedIds.length === 0) { setBets([]); setLoadingBets(false); return undefined; }

    const chunks = [];
    for (let i = 0; i < finishedIds.length; i += 30) chunks.push(finishedIds.slice(i, i + 30));
    let all = [];
    let pending = chunks.length;
    const unsubs = chunks.map((chunk) =>
      onSnapshot(query(collection(db, COL.BETS), where('matchId', 'in', chunk)),
        (snap) => {
          const cb = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          all = [...all.filter((b) => !chunk.includes(b.matchId)), ...cb];
          setBets([...all]);
          pending -= 1; if (pending <= 0) setLoadingBets(false);
        },
        (err) => { console.error('useStatsData bets:', err); setError('Kunne ikke hente tips.'); setLoadingBets(false); },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [finishedIds, loadingMatches]);

  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  const betsByMatch = useMemo(() => {
    const map = new Map();
    for (const b of bets) {
      if (!map.has(b.matchId)) map.set(b.matchId, []);
      map.get(b.matchId).push(b);
    }
    return map;
  }, [bets]);

  const todayMatches = useMemo(
    () => matches.filter((m) => toDate(m.kickoff).toLocaleDateString('sv-SE', { timeZone: TIMEZONE }) === todayStr),
    [matches, todayStr],
  );

  const pointsByUidToday = useMemo(
    () => computeDailyPoints(matches, bets, todayStr),
    [matches, bets, todayStr],
  );

  return {
    todayStr,
    matches,        // alle afsluttede
    todayMatches,   // afsluttede i dag
    betsByMatch,
    usersById,
    pointsByUidToday,
    loading: loadingMatches || loadingBets,
    error,
  };
}
