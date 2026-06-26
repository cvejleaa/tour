/**
 * Hooks til private 1:1-beskeder.
 *
 *  - useMyMessages(uid)            : alle beskeder brugeren indgår i (til inbox-liste)
 *  - useConversation(a, b)         : alle beskeder i samtalen mellem a og b
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { conversationId } from './commentActions';

/**
 * Alle beskeder som brugeren indgår i (ældste først).
 * @param {string|null} uid
 */
export function useMyMessages(uid) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) { setMessages([]); setLoading(false); return undefined; }
    setLoading(true);
    const q = query(
      collection(db, COL.MESSAGES),
      where('participants', 'array-contains', uid),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('useMyMessages fejl:', err);
        setError('Kunne ikke hente beskeder.');
        setLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  return { messages, loading, error };
}

/**
 * Saml en bruger-besked-liste til samtaler (én pr. modpart), nyeste øverst.
 * @param {Array<object>} messages – fra useMyMessages
 * @param {string} meUid
 * @returns {Array<{otherUid: string, last: object, count: number}>}
 */
export function groupConversations(messages, meUid) {
  const byOther = new Map();
  for (const m of messages) {
    const other = m.participants?.find((p) => p !== meUid) ?? m.from;
    const entry = byOther.get(other) ?? { otherUid: other, last: null, count: 0 };
    entry.count += 1;
    entry.last = m; // messages er sorteret ældste→nyeste, så sidste vinder
    byOther.set(other, entry);
  }
  return [...byOther.values()].sort((a, b) => {
    const ta = a.last?.createdAt?.toMillis?.() ?? 0;
    const tb = b.last?.createdAt?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

/**
 * Beskeder i én samtale (mellem to brugere), ældste først.
 * @param {string|null} a
 * @param {string|null} b
 */
export function useConversation(a, b) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const convId = useMemo(() => (a && b ? conversationId(a, b) : null), [a, b]);

  useEffect(() => {
    if (!convId) { setMessages([]); setLoading(false); return undefined; }
    setLoading(true);
    const q = query(
      collection(db, COL.MESSAGES),
      where('conversationId', '==', convId),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('useConversation fejl:', err);
        setError('Kunne ikke hente samtalen.');
        setLoading(false);
      },
    );
    return unsub;
  }, [convId]);

  return { messages, loading, error };
}
