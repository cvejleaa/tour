// ---------------------------------------------------------------------------
// useLeagueTippedTeams – hvilke hold har spillere i din liga tippet? Læser
// etape-tips for de AFGJORTE etaper (1..afterStage), hvor reglerne tillader at
// se andres tips, og samler holdnavnene. Engangsopslag (getDocs) — tippede hold
// ændrer sig sjældent midt i en visning.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { collectTippedTeams } from './tippedTeams';

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * @param {{ afterStage?:number, season?:number, memberUids?:Set<string> }} opts
 * @returns {Set<string>}  holdnavne tippet af ligaens spillere
 */
export function useLeagueTippedTeams({ afterStage, season, memberUids } = {}) {
  const [teams, setTeams] = useState(() => new Set());
  const memberKey = memberUids ? [...memberUids].sort().join(',') : '';

  useEffect(() => {
    if (!afterStage || !season || !memberUids || memberUids.size === 0) {
      setTeams(new Set());
      return undefined;
    }
    let cancelled = false;
    const stageIds = [];
    for (let n = 1; n <= afterStage; n += 1) stageIds.push(`${season}-stage-${n}`);

    (async () => {
      const bets = [];
      // Firestore 'in' tager højst 10 værdier → hent i bidder.
      for (const c of chunk(stageIds, 10)) {
        try {
          const snap = await getDocs(query(collection(db, COL.STAGE_BETS), where('stageId', 'in', c)));
          snap.forEach((d) => bets.push(d.data()));
        } catch (e) {
          console.error('useLeagueTippedTeams fejl:', e);
        }
      }
      if (cancelled) return;
      setTeams(collectTippedTeams(bets.filter((b) => b && memberUids.has(b.uid))));
    })();

    return () => { cancelled = true; };
  }, [afterStage, season, memberKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return teams;
}
