// Hook: turneringsmeta (logo, navn, spilledag) fra config/competition,
// synket af Cloud Function 'syncStandings' fra football-data.org.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useCompetition() {
  const [competition, setCompetition] = useState(null);

  useEffect(() => {
    const ref = doc(db, COL.CONFIG, 'competition');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setCompetition((snap && typeof snap.exists === 'function' && snap.exists()) ? snap.data() : null);
      },
      () => setCompetition(null),
    );
    return unsub;
  }, []);

  return competition;
}
