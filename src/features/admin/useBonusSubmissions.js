// Henter alle bonusBets for ét spørgsmål (kun admin) og grupperer dem efter
// indsendt svar, så admin kan se og godkende stavevarianter.
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useBonusSubmissions(questionId) {
  const [submissions, setSubmissions] = useState([]); // [{answer, count}]
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!questionId) return undefined;
    setLoading(true);
    const q = query(collection(db, COL.BONUS_BETS), where('questionId', '==', questionId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const counts = new Map(); // svar (rå) -> antal
        snap.forEach((d) => {
          const ans = (d.data().answer ?? '').trim();
          if (!ans) return;
          counts.set(ans, (counts.get(ans) ?? 0) + 1);
        });
        const list = [...counts.entries()]
          .map(([answer, count]) => ({ answer, count }))
          .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer, 'da'));
        setSubmissions(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [questionId]);

  return { submissions, loading };
}
