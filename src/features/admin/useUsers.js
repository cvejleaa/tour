// Hook til live-lytning på alle brugere i Firestore.
// Bruges kun af owner til brugerstyring.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * Returnerer live-opdateret liste over alle brugere.
 * @returns {{ users: Array, loading: boolean, error: string }}
 */
export function useUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Hent alle brugere sorteret efter oprettelsestidspunkt
    const q = query(
      collection(db, COL.USERS),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useUsers fejl:', err);
        setError('Kunne ikke hente brugerlisten. Tjek din forbindelse.');
        setLoading(false);
      }
    );

    return unsub;
  }, []);

  return { users, loading, error };
}
