/**
 * Hook: useGames
 * Live-abonnement på alle spil (games) + hvilke spil den aktuelle bruger
 * deltager i (via collectionGroup-forespørgsel på players hvor uid == mig).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { COL, GAME_STATUS } from '../../lib/constants';

/**
 * Ren hjælpefunktion: opdel spil i "mine" (jeg deltager) og "åbne"
 * (jeg deltager IKKE, spillet er joinable og ikke afsluttet). Begge lister
 * sorteres efter game.order.
 * @param {Array<object>} games       – alle spil
 * @param {Set<string>|Array<string>} myGameIds – id'er på mine spil
 * @returns {{ mine: Array<object>, open: Array<object> }}
 */
export function splitGames(games, myGameIds) {
  const ids = myGameIds instanceof Set ? myGameIds : new Set(myGameIds || []);
  const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
  const mine = (games || []).filter((g) => ids.has(g.id)).sort(byOrder);
  const open = (games || [])
    .filter((g) => !ids.has(g.id) && g.joinable && g.status !== GAME_STATUS.FINISHED)
    .sort(byOrder);
  return { mine, open };
}

/**
 * @returns {{
 *   games: Array<object>,
 *   myGameIds: Set<string>,
 *   loading: boolean,
 * }}
 */
export function useGames() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [games, setGames] = useState([]);
  const [myGameIds, setMyGameIds] = useState(() => new Set());
  const [gamesLoading, setGamesLoading] = useState(true);
  const [membershipLoading, setMembershipLoading] = useState(true);

  // Alle spil, sorteret efter rækkefølge.
  useEffect(() => {
    const q = query(collection(db, COL.GAMES), orderBy('order'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setGames(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setGamesLoading(false);
      },
      (err) => {
        console.error('useGames (spil) fejl:', err);
        setGames([]);
        setGamesLoading(false);
      },
    );
    return unsub;
  }, []);

  // Mine deltagelser (players-dokumenter med mit uid, på tværs af alle spil).
  useEffect(() => {
    if (!uid) {
      setMyGameIds(new Set());
      setMembershipLoading(false);
      return undefined;
    }
    setMembershipLoading(true);
    const q = query(collectionGroup(db, COL.GAME_PLAYERS), where('uid', '==', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        // gameId udledes af forælderens forælder: games/{gameId}/players/{uid}
        const ids = new Set(
          snap.docs.map((d) => d.ref.parent.parent?.id).filter(Boolean),
        );
        setMyGameIds(ids);
        setMembershipLoading(false);
      },
      (err) => {
        console.error('useGames (deltagelser) fejl:', err);
        setMyGameIds(new Set());
        setMembershipLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  const loading = gamesLoading || membershipLoading;
  // Genbrug samme Set-reference mellem renders når indholdet er uændret.
  const stableMyGameIds = useMemo(() => myGameIds, [myGameIds]);

  return { games, myGameIds: stableMyGameIds, loading };
}
