// Hook: stempler brugerens besøg/side-navigation i presence/{uid}.
// Fire-and-forget — statistik må ALDRIG forstyrre spillet (fejl sluges).
// Skriver ét lille merge-dokument pr. rutenavigation; "besøg" tælles kun
// efter 30 minutters pause (localStorage-throttle pr. enhed).
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { doc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { pageKeyFromPath, dayKeyCopenhagen, isNewVisit } from './presence';

const PING_KEY = 'tour.presencePing';

export function usePresenceBeacon(uid, enabled = true) {
  const location = useLocation();

  useEffect(() => {
    if (!uid || !enabled) return;
    const now = Date.now();
    let lastPing = 0;
    try { lastPing = Number(localStorage.getItem(PING_KEY)) || 0; } catch { /* ok */ }
    try { localStorage.setItem(PING_KEY, String(now)); } catch { /* ok */ }

    const day = dayKeyCopenhagen();
    const page = pageKeyFromPath(location.pathname);
    setDoc(
      doc(db, COL.PRESENCE, uid),
      {
        uid,
        lastSeenAt: serverTimestamp(),
        days: { [day]: increment(isNewVisit(lastPing, now) ? 1 : 0) },
        pages: { [page]: increment(1) },
      },
      { merge: true },
    ).catch(() => { /* statistik er best-effort */ });
  }, [uid, enabled, location.pathname]);
}
