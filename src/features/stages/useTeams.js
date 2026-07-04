// Hook: useTeams – holdnavne til tip-dropdowns. Læser `teams`-kollektionen
// (som udfyldes automatisk fra resultaterne); falder tilbage til seed-listen
// indtil den er udfyldt, så man kan tippe allerede før første etape.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { TOUR_TEAMS } from '../../data/tourTeams2026';
import { canonicalTeamKey } from '../../lib/tourTeams';

/**
 * Oversæt de syncede holdnavne til dropdown-listen. Resultattabellernes
 * navne er ALL-CAPS-varianter ("INEOS GRENADIERS", "TEAM VISMA | LEASE A
 * BIKE") — gemte tips bruger seed-listens officielle navne, og et <select>
 * matcher kun på PRÆCIS strengværdi. Derfor: kendte hold vises ALTID med
 * seed-navnet (dedupleret på kanonisk nøgle), ukendte hold beholdes råt,
 * så et nyt/omdøbt hold stadig kan tippes.
 */
export function mergeTeamNames(syncedNames, seedNames = TOUR_TEAMS) {
  const seedByKey = new Map(seedNames.map((n) => [canonicalTeamKey(n), n]));
  const out = new Map(); // kanonisk nøgle -> visningsnavn
  for (const raw of syncedNames || []) {
    if (!raw) continue;
    const key = canonicalTeamKey(raw);
    if (!out.has(key)) out.set(key, seedByKey.get(key) || raw);
  }
  if (!out.size) return [...seedNames];
  return [...out.values()].sort((a, b) => a.localeCompare(b, 'da'));
}

export function useTeams(season) {
  const [teams, setTeams] = useState(TOUR_TEAMS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!season) { setLoading(false); return undefined; }
    const q = query(collection(db, COL.TEAMS), where('season', '==', season));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const names = snap.docs.map((d) => d.data().name).filter(Boolean);
        // Firestore-holdene for sæsonen (oversat til officielle navne),
        // ellers seed-listen.
        setTeams(mergeTeamNames(names));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [season]);

  return { teams, loading };
}
