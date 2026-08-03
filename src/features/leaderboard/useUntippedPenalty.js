// Hook: læser straffen for en utippet etape fra config/settings.
// Værdien gemmes under `points.untippedPenalty` — SAMME felt som serverens
// scoring (normalizePodium) bruger. Et ældre top-niveau `untippedPenalty` læses
// stadig som fallback for gamle dokumenter. Owner sætter den under Admin;
// alle godkendte kan læse den.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { DEFAULT_UNTIPPED_PENALTY } from '../../lib/tourScoring';

// Re-eksporter den kanoniske standard (fra scoringen), så UI og server matcher.
export { DEFAULT_UNTIPPED_PENALTY };

/** Læs straffen fra et settings-dokument (nested først, ellers gammelt top-felt). */
export function readUntippedPenalty(d) {
  const raw = d && d.points && d.points.untippedPenalty != null
    ? d.points.untippedPenalty
    : (d ? d.untippedPenalty : undefined);
  return Number.isFinite(Number(raw)) ? Math.abs(Number(raw)) : DEFAULT_UNTIPPED_PENALTY;
}

export function useUntippedPenalty() {
  const [penalty, setPenalty] = useState(DEFAULT_UNTIPPED_PENALTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const ref = doc(db, COL.CONFIG, 'settings');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap && typeof snap.exists === 'function' && snap.exists() ? snap.data() : null;
        setPenalty(readUntippedPenalty(d));
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return unsub;
  }, []);

  return { penalty, loaded };
}
