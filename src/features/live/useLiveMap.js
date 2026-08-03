// Hook: poller getLiveMap-callablen mens en etape er live (60 sek. interval —
// serveren cacher selv i 45 sek.). Fejl er stille: kortet skjules bare.
import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

const POLL_MS = 60000;

export function useLiveMap(stageNumber, enabled) {
  const [data, setData] = useState(null); // {stage, route, groups, updatedAt}
  const [failed, setFailed] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!enabled || !stageNumber) {
      setData(null);
      setFailed(false);
      return undefined;
    }
    let cancelled = false;

    async function load() {
      try {
        const fn = httpsCallable(functions, 'getLiveMap');
        const res = await fn({ stage: stageNumber });
        if (cancelled) return;
        if (res.data?.ok) {
          setData(res.data);
          setFailed(false);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    load();
    timer.current = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [stageNumber, enabled]);

  return { data, failed };
}
