// Hook: live-lytning på driftstatus (driftlog) og åbne driftalarmer
// (driftAlarmer). Skrives af Cloud Functions; kun globale admins kan læse
// (Security Rules — emailLog-mønstret).
//
// VIGTIGT: en læsefejl må ALDRIG ligne "ingen problemer" — det er en
// STATUSFLADE. usePendingApprovals' fejl-til-0 er den forkerte model her;
// fejlen skal frem på fanen.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useDriftStatus() {
  const [status, setStatus] = useState([]);
  const [alarmer, setAlarmer] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fejl = (err) => {
      console.error('useDriftStatus fejl:', err);
      setError('Kunne ikke hente driftstatus — det er i sig selv en driftfejl.');
      setLoading(false);
    };
    const unsubStatus = onSnapshot(
      collection(db, COL.DRIFT_LOG),
      (snap) => {
        setStatus(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
        setLoading(false);
      },
      fejl,
    );
    // Kun ÅBNE alarmer: lukkede (loestAt sat) er historie, og historik bor i
    // functions-loggen. Kvitterede men uløste vises stadig — dæmpet.
    const unsubAlarmer = onSnapshot(
      query(collection(db, COL.DRIFT_ALARMER), where('loestAt', '==', null)),
      (snap) => setAlarmer(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
      fejl,
    );
    return () => { unsubStatus(); unsubAlarmer(); };
  }, []);

  return { status, alarmer, loading, error };
}

/** Ukvitterede alarmer, der kræver kvittering — dét, ⚠-markøren tælles af. */
export function ukvitterede(alarmer) {
  return (alarmer || []).filter((a) => a.kraeverKvittering && !a.kvitteretAt);
}

/**
 * Kun tallet til ⚠-markøren i navigationen. `enabled`-gaten er ikke pynt:
 * reglerne afviser alle andre end globale admins, og en menig bruger skal
 * ikke koste et afvist opslag pr. sidevisning. Markøren drives af
 * UKVITTEREDE alarmer — ikke af seneste status — ellers slukker den selv,
 * næste gang en kørsel går godt, og ejeren så den aldrig.
 */
export function useDriftAlarmCount({ enabled = false } = {}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) { setCount(0); return undefined; }
    return onSnapshot(
      query(collection(db, COL.DRIFT_ALARMER), where('loestAt', '==', null)),
      (snap) => setCount(ukvitterede(snap.docs.map((d) => d.data())).length),
      () => setCount(0), // navigationen må ikke vælte — fanen selv viser fejlen
    );
  }, [enabled]);
  return count;
}
