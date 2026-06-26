// Hook: tæller ventende godkendelser (live) til badge på Admin-knappen.
//  - ventende brugere (kun relevant for ejer)
//  - ventende ligaer (relevant for alle admins)
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, USER_STATUS, LEAGUE_STATUS } from '../../lib/constants';

export function usePendingApprovals({ enabled = false, includeUsers = false } = {}) {
  const [users, setUsers] = useState(0);
  const [leagues, setLeagues] = useState(0);

  useEffect(() => {
    if (!enabled) { setUsers(0); setLeagues(0); return undefined; }

    const unsubs = [];
    if (includeUsers) {
      unsubs.push(onSnapshot(
        query(collection(db, COL.USERS), where('status', '==', USER_STATUS.PENDING)),
        (snap) => setUsers(snap.size),
        () => setUsers(0),
      ));
    }
    unsubs.push(onSnapshot(
      query(collection(db, COL.LEAGUES), where('status', '==', LEAGUE_STATUS.PENDING)),
      (snap) => setLeagues(snap.size),
      () => setLeagues(0),
    ));

    return () => unsubs.forEach((u) => u());
  }, [enabled, includeUsers]);

  return { users, leagues, total: users + leagues };
}
