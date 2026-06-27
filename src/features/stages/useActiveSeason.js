// Hook: useActiveSeason – den aktive sæson (årstal) fra config/settings.
// Admin skifter activeSeason til fx 2027 næste år; data fra tidligere år ligger
// urørt under deres eget årstal.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { DEFAULT_SEASON } from '../../lib/tourStages';

export function useActiveSeason() {
  const [season, setSeason] = useState(DEFAULT_SEASON);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, COL.CONFIG, 'settings'),
      (snap) => {
        const v = Number(snap.data()?.activeSeason);
        if (Number.isFinite(v)) setSeason(v);
      },
      () => {},
    );
    return unsub;
  }, []);

  return season;
}
