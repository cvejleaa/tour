// Hook: useTeams – holdnavne til tip-dropdowns. Læser `teams`-kollektionen
// (som udfyldes automatisk fra resultaterne); falder tilbage til seed-listen
// indtil den er udfyldt, så man kan tippe allerede før første etape.
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { TOUR_TEAMS } from '../../data/tourTeams2026';

export function useTeams() {
  const [teams, setTeams] = useState(TOUR_TEAMS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, COL.TEAMS),
      (snap) => {
        const names = snap.docs
          .map((d) => d.data().name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'da'));
        // Brug Firestore-holdene hvis de findes, ellers seed-listen.
        setTeams(names.length ? names : TOUR_TEAMS);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  return { teams, loading };
}
