// ---------------------------------------------------------------------------
// useStartlist – live startliste fra config/startlist (skrevet af den planlagte
// syncStartlist-funktion, der skraber TV2). Returnerer { byCode, updatedAt }.
// Tom hvis dokumentet ikke findes endnu — kalderen falder tilbage til den
// statiske snapshot.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useStartlist() {
  const [data, setData] = useState({ byCode: {}, updatedAt: null });

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, COL.CONFIG, 'startlist'),
      (snap) => {
        const d = snap.data() || {};
        setData({ byCode: d.teams || {}, updatedAt: d.updatedAt || null });
      },
      () => {},
    );
    return unsub;
  }, []);

  return data;
}
