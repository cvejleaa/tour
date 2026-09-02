/**
 * Hook: useLeagueAwards — live-lytning på en ligas manuelle point-tildelinger
 * (leagueBonusAwards) + summen pr. medlem til liga-stillingen.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { awardsByUidFromDocs } from './leagueAwards';

export function useLeagueAwards(leagueId) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) { setDocs([]); setLoading(false); return undefined; }
    const q = query(
      collection(db, COL.LEAGUE_BONUS_AWARDS),
      where('leagueId', '==', leagueId),
    );
    const unsub = onSnapshot(q, (snap) => {
      setDocs(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    }, () => { setDocs([]); setLoading(false); });
    return unsub;
  }, [leagueId]);

  const awardsByUid = useMemo(() => awardsByUidFromDocs(docs), [docs]);

  return { awards: docs, awardsByUid, loading };
}
