// ---------------------------------------------------------------------------
// useClassifications – læser de fulde Tour-stillinger (config/classifications),
// som sync-funktionen skriver efter hver afgjorte etape: samlet/sprint/bjerg/
// ungdom/hold + trøjeførere + seneste etaperesultat.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * @returns {{ data: object|null, loading: boolean }}
 *   data = { afterStage, standings:{samlet,sprint,bjerg,ungdom,hold},
 *            stageResult:Array, jerseys:{yellow,green,polka,white,teamLead}, updatedAt }
 */
export function useClassifications() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, COL.CONFIG, 'classifications'),
      (snap) => {
        setData(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error('useClassifications fejl:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { data, loading };
}
