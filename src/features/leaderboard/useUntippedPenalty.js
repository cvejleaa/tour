// Hook: læser straffen for en utippet kamp (Skarpskytten) fra config/settings.
// Værdien gemmes som et positivt tal (antal point der trækkes fra). Default 2.
// Owner sætter den under Admin → ⚙️ Indstillinger; alle godkendte kan læse den.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export const DEFAULT_UNTIPPED_PENALTY = 2;

export function useUntippedPenalty() {
  const [penalty, setPenalty] = useState(DEFAULT_UNTIPPED_PENALTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const ref = doc(db, COL.CONFIG, 'settings');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap && typeof snap.exists === 'function' && snap.exists() ? snap.data() : null;
        const v = d && Number.isFinite(Number(d.untippedPenalty)) ? Math.abs(Number(d.untippedPenalty)) : DEFAULT_UNTIPPED_PENALTY;
        setPenalty(v);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return unsub;
  }, []);

  return { penalty, loaded };
}
