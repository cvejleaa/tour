// Hook til live-lytning på bonusspørgsmål i Firestore.
// Bruges af global admin og owner til at sætte facit.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * Returnerer live-opdateret liste over bonusspørgsmål.
 * @returns {{ questions: Array, loading: boolean, error: string }}
 */
export function useBonusQuestions() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, COL.BONUS_QUESTIONS),
      orderBy('deadline', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useBonusQuestions fejl:', err);
        setError('Kunne ikke hente bonusspørgsmål.');
        setLoading(false);
      }
    );

    return unsub;
  }, []);

  return { questions, loading, error };
}
