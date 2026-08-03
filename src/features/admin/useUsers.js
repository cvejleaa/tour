// Hook til live-lytning på alle brugere i Firestore.
// Bruges kun af owner/admin til brugerstyring.
//
// E-mail bor i den PRIVATE collection userContacts/{uid} (kun bruger selv +
// admin kan læse den). Her fletter vi — som admin — hver brugers e-mail ind på
// bruger-objektet, så forbrugerne (UsersTab, BroadcastTab, LeaguesAdminTab)
// fortsat kan læse `u.email`. For ældre, endnu ikke migrerede profiler falder vi
// tilbage til en evt. e-mail på selve users-dokumentet.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * Returnerer live-opdateret liste over alle brugere (med e-mail flettet ind).
 * @returns {{ users: Array, loading: boolean, error: string }}
 */
export function useUsers() {
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState({}); // uid -> email
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query(collection(db, COL.USERS), orderBy('createdAt', 'asc'));
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
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    // Privat kontaktinfo — kun læsbar for admin. Fejl her er ikke-fatal
    // (så brugerlisten stadig vises, bare uden e-mail).
    const unsub = onSnapshot(
      collection(db, COL.USER_CONTACTS),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const email = d.data()?.email;
          if (email) map[d.id] = email;
        });
        setContacts(map);
      },
      (err) => { console.error('useUsers (kontakter) fejl:', err); },
    );
    return unsub;
  }, []);

  const merged = users.map((u) => {
    const email = contacts[u.id] ?? u.email ?? null;
    return email ? { ...u, email } : u;
  });

  return { users: merged, loading, error };
}
