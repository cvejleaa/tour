/**
 * Hook: useDailyStandings
 * Beregner point pr. spiller fra de etaper, der er afgjort med dato i dag (CPH-tid).
 *
 * Strategi: hent alle etaper for den aktive sæson (onSnapshot) + alle etape-tip
 * for dagens afgjorte etaper. Summér hver spillers serverberegnede point lokalt.
 */
import { useEffect, useState, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { stageStatus } from '../../lib/tourStages';
import { useActiveSeason } from '../stages/useActiveSeason';
import { computeDailyPoints, getTodayInCPH } from './standingsUtils';

/**
 * @returns {{
 *   pointsByUid: Record<string, number>,
 *   todayStr:    string,
 *   loading:     boolean,
 *   error:       string|null,
 * }}
 */
export function useDailyStandings() {
  const season = useActiveSeason();
  const todayStr = useMemo(() => getTodayInCPH(), []);

  const [stages, setStages] = useState([]);
  const [bets, setBets] = useState([]);
  const [loadingStages, setLoadingStages] = useState(true);
  const [loadingBets, setLoadingBets] = useState(true);
  const [error, setError] = useState(null);

  // Abonnér på alle etaper for sæsonen
  useEffect(() => {
    if (!season) { setStages([]); setLoadingStages(false); return undefined; }
    const q = query(collection(db, COL.STAGES), where('season', '==', season));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setStages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingStages(false);
      },
      (err) => {
        console.error('useDailyStandings stages fejl:', err);
        setError('Kunne ikke hente dagens etaper.');
        setLoadingStages(false);
      },
    );

    return unsub;
  }, [season]);

  // Id'er på dagens afgjorte etaper
  const todayStageIds = useMemo(() => {
    return stages
      .filter((s) => stageStatus(s, Date.now()) === 'done' && s.date === todayStr)
      .map((s) => s.id);
  }, [stages, todayStr]);

  // Hent etape-tip for dagens afgjorte etaper
  useEffect(() => {
    if (loadingStages) return undefined;
    if (todayStageIds.length === 0) {
      setBets([]);
      setLoadingBets(false);
      return undefined;
    }

    // Firestore 'in'-query maks 30 elementer; del op om nødvendigt.
    const chunks = [];
    for (let i = 0; i < todayStageIds.length; i += 30) {
      chunks.push(todayStageIds.slice(i, i + 30));
    }

    let allBets = [];
    let pending = chunks.length;

    const unsubFns = chunks.map((chunk) => {
      const q = query(
        collection(db, COL.STAGE_BETS),
        where('stageId', 'in', chunk),
      );
      return onSnapshot(
        q,
        (snap) => {
          const chunkBets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          allBets = [...allBets.filter((b) => !chunk.includes(b.stageId)), ...chunkBets];
          setBets([...allBets]);
          pending -= 1;
          if (pending <= 0) setLoadingBets(false);
        },
        (err) => {
          console.error('useDailyStandings bets fejl:', err);
          setError('Kunne ikke hente etape-tip.');
          setLoadingBets(false);
        },
      );
    });

    return () => unsubFns.forEach((unsub) => unsub());
  }, [todayStageIds, loadingStages]);

  // Beregn point pr. uid
  const pointsByUid = useMemo(() => {
    if (loadingStages || loadingBets) return {};
    return computeDailyPoints(stages, bets, todayStr);
  }, [stages, bets, todayStr, loadingStages, loadingBets]);

  return {
    pointsByUid,
    todayStr,
    loading: loadingStages || loadingBets,
    error,
  };
}
