/**
 * Hook: useUnreadMessages — antal ulæste private beskeder (live), til badge.
 * Abonnerer på mine beskeder (participants array-contains uid) og sammenholder
 * med den lokale "læst"-tilstand.
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { getSeenMap, computeUnread, DM_SEEN_EVENT } from './dmRead';

export function useUnreadMessages(uid) {
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState({ total: 0, byUser: {} });

  // Abonnér på mine beskeder
  useEffect(() => {
    if (!uid) { setMessages([]); return undefined; }
    const q = query(collection(db, COL.MESSAGES), where('participants', 'array-contains', uid));
    const unsub = onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setMessages([]),
    );
    return unsub;
  }, [uid]);

  // Genberegn ulæste når beskeder eller "læst"-tilstand ændrer sig
  useEffect(() => {
    if (!uid) { setUnread({ total: 0, byUser: {} }); return undefined; }
    const recompute = () => setUnread(computeUnread(messages, uid, getSeenMap()));
    recompute();
    window.addEventListener(DM_SEEN_EVENT, recompute);
    window.addEventListener('storage', recompute);
    return () => {
      window.removeEventListener(DM_SEEN_EVENT, recompute);
      window.removeEventListener('storage', recompute);
    };
  }, [messages, uid]);

  return unread;
}
