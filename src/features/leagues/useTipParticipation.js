/**
 * Hook: useTipParticipation
 * Abonnerer (live) på tipParticipation-collectionen og returnerer et opslag
 * matchId → Set(uids), så man kan se hvem der har tippet på hver kamp.
 * (Afslører IKKE selve tippene — kun hvem der har afgivet et.)
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useTipParticipation() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, COL.TIP_PARTICIPATION),
      (snap) => {
        setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useTipParticipation fejl:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  // matchId → Set(uids)
  const byMatch = useMemo(() => {
    const map = new Map();
    for (const d of docs) {
      map.set(d.id, new Set(d.uids ?? []));
    }
    return map;
  }, [docs]);

  return { byMatch, loading };
}

/**
 * Beregn tip-status for en kamp inden for en liga.
 * @param {Set<string>|undefined} tippedSet  – uids der har tippet på kampen
 * @param {Array<{uid:string, displayName?:string}>} members – ligaens medlemmer
 * @returns {{ tipped: number, total: number, missing: Array<object> }}
 */
export function leagueTipStatus(tippedSet, members) {
  const tipped = members.filter((m) => tippedSet?.has(m.uid));
  const missing = members.filter((m) => !tippedSet?.has(m.uid));
  return { tipped: tipped.length, total: members.length, missing };
}
