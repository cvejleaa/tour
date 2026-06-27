// Hook: useTourSettings – læser pointopsætning (points-map + gcTopN) fra
// config/settings via onSnapshot og fletter den ind over standardværdierne, så
// vi altid returnerer et komplet, gyldigt objekt. Bruges af admin-UI'et til at
// forudfylde felter, og af visnings-komponenter (StageCard/PointRules) så de
// viser de tal, som admin faktisk har sat (samme som serveren bruger).
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { DEFAULT_GC_TOP_N, normalizePodium } from '../../lib/tourScoring';

export function useTourSettings() {
  // `points` er nu PODIE-config: pr. spørgsmål [1., 2., 3.] + untippedPenalty.
  const [settings, setSettings] = useState({
    points: normalizePodium({}),
    gcTopN: DEFAULT_GC_TOP_N,
  });

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, COL.CONFIG, 'settings'),
      (snap) => {
        const data = snap.data() || {};
        const n = Number(data.gcTopN);
        setSettings({
          points: normalizePodium(data.points),
          gcTopN: Number.isInteger(n) && n >= 1 ? n : DEFAULT_GC_TOP_N,
        });
      },
      () => {},
    );
    return unsub;
  }, []);

  return settings;
}
