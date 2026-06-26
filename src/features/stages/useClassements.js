// Hook: useClassements – aktuelle trøje-indehavere fra den seneste afgjorte
// etape (vi gemmer `jerseys` på hvert stages-dokument ved sync).
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useClassements() {
  const [jerseys, setJerseys] = useState(null);
  const [afterStage, setAfterStage] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, COL.STAGES),
      where('status', '==', 'done'),
      orderBy('number', 'desc'),
      limit(1),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const d = snap.docs[0]?.data();
        setJerseys(d?.jerseys ?? null);
        setAfterStage(d?.number ?? null);
      },
      () => {},
    );
    return unsub;
  }, []);

  return { jerseys, afterStage };
}
