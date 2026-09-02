// Hook: useMyStageBets – brugerens egne etape-tip som map {stageId: bet}.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useMyStageBets(uid, season) {
  const [betsByStage, setBetsByStage] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || !season) {
      setBetsByStage({});
      setLoading(false);
      return undefined;
    }
    const q = query(
      collection(db, COL.STAGE_BETS),
      where('uid', '==', uid),
      where('season', '==', season),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const b = d.data();
          if (b.stageId) map[b.stageId] = { ...b, id: d.id };
        });
        setBetsByStage(map);
        setLoading(false);
      },
      (err) => {
        console.error('useMyStageBets fejl:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [uid, season]);

  return { betsByStage, loading };
}
