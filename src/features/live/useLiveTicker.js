// Hook: poller getLiveTicker-callablen mens en etape er live (60 sek. interval
// — serveren cacher selv i 45 sek., så letour rammes højst ~1 gang/min i alt).
// Fejl er stille: tickeren skjules bare, spillet virker uændret.
import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

const POLL_MS = 60000;

export function useLiveTicker(stageNumber, enabled) {
  const [posts, setPosts] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!enabled || !stageNumber) {
      setPosts([]);
      setFailed(false);
      return undefined;
    }
    let cancelled = false;

    async function load() {
      try {
        const fn = httpsCallable(functions, 'getLiveTicker');
        const res = await fn({ stage: stageNumber });
        if (cancelled) return;
        if (res.data?.ok) {
          setPosts(res.data.posts ?? []);
          setUpdatedAt(res.data.fetchedAt ?? new Date().toISOString());
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

  return { posts, updatedAt, failed };
}
