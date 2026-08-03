// Hook: henter alle stageBets for AFGJORTE etaper (én engangs-forespørgsel
// pr. etape — reglerne åbner læsning efter etapestart) og beregner den
// udspecificerede pointfordeling pr. spiller. Genberegner når facit ændrer
// sig (jury-rettelser), da useStages er et live-abonnement.
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { stageStatus } from '../../lib/tourStages';
import { computeStandingsBreakdown } from './standingsBreakdown';

export function useStandingsBreakdown(stages, points = {}, enabled = true) {
  const [byUid, setByUid] = useState({});
  const [loading, setLoading] = useState(true);

  const decided = useMemo(
    () => (stages || []).filter((s) => stageStatus(s, Date.now()) === 'done' && s.result),
    [stages],
  );
  // Nøgle der ændrer sig når en etape afgøres ELLER et facit jury-rettes.
  const decidedKey = useMemo(
    () => decided.map((s) => `${s.id}:${JSON.stringify(s.result)}`).join('|'),
    [decided],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    if (!decided.length) { setByUid({}); setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const betsByStageId = {};
        await Promise.all(decided.map(async (s) => {
          const snap = await getDocs(
            query(collection(db, COL.STAGE_BETS), where('stageId', '==', s.id)),
          );
          betsByStageId[s.id] = snap.docs.map((d) => d.data());
        }));
        if (!cancelled) {
          setByUid(computeStandingsBreakdown(decided, betsByStageId, points));
          setLoading(false);
        }
      } catch (e) {
        console.error('useStandingsBreakdown fejl:', e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // decidedKey dækker decided-indholdet; points ændrer sig reelt aldrig midt i sæsonen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decidedKey, enabled, points]);

  return { byUid, loading };
}
