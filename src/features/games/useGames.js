/**
 * Hook: useGames
 * Live-abonnement på alle spil (games) + hvilke spil den aktuelle bruger
 * deltager i (via collectionGroup-forespørgsel på players hvor uid == mig).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { COL, GAME_STATUS } from '../../lib/constants';

/**
 * Ren hjælpefunktion: opdel spil i tre lister, alle sorteret efter game.order.
 *   - external : kører i sin egen app (externalUrl) — vises som link-ud
 *   - mine     : jeg deltager, og spillet er ikke eksternt
 *   - open     : jeg deltager IKKE, spillet er joinable og ikke afsluttet
 * @param {Array<object>} games       – alle spil
 * @param {Set<string>|Array<string>} myGameIds – id'er på mine spil
 * @returns {{ mine: Array<object>, open: Array<object>, external: Array<object> }}
 */
export function splitGames(games, myGameIds) {
  const ids = myGameIds instanceof Set ? myGameIds : new Set(myGameIds || []);
  const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
  // Eksterne spil (kører i deres egen app, fx tour.vejleaa.dk) vises altid som
  // link-ud — uanset medlemskab OG uanset status. Et afsluttet spil skal stå
  // med et gråt "Afsluttet"-mærkat, ikke forsvinde: appen er der stadig, og
  // stillingen er værd at kunne slå op bagefter. At det ikke reklameres som
  // noget, man kan deltage i, klarer "åbne"-filteret nedenfor.
  const isExternal = (g) => !!g.externalUrl;
  const external = (games || []).filter(isExternal).sort(byOrder);
  const mine = (games || []).filter((g) => ids.has(g.id) && !isExternal(g)).sort(byOrder);
  const open = (games || [])
    .filter((g) => !ids.has(g.id) && g.joinable && g.status !== GAME_STATUS.FINISHED && !isExternal(g))
    .sort(byOrder);
  return { mine, open, external };
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

  // Mine deltagelser: lyt på players/{uid} i HVERT spil. Vi bruger bevidst
  // IKKE en collectionGroup-forespørgsel — den kræver et særligt indeks og
  // rammer collectionGroup-regel-særheder. Én lytter pr. spil rammer den
  // simple per-dokument-regel (auth.uid == uid) og virker uden indeks.
  // gameIdsKey er en primitiv streng, så effekten kun kører når spil-sættet
  // (eller brugeren) reelt ændrer sig.
  const gameIdsKey = useMemo(
    () => games.map((g) => g.id).sort().join(','),
    [games],
  );
  useEffect(() => {
    const gameIds = gameIdsKey ? gameIdsKey.split(',') : [];
    if (!uid || gameIds.length === 0) {
      setMyGameIds(new Set());
      setMembershipLoading(false);
      return undefined;
    }
    setMembershipLoading(true);
    const present = new Map(); // gameId -> boolean (er jeg medlem?)
    let settled = 0;
    const recompute = () => {
      setMyGameIds(new Set(
        [...present.entries()].filter(([, isMember]) => isMember).map(([id]) => id),
      ));
    };
    const unsubs = gameIds.map((gid) =>
      onSnapshot(
        doc(db, COL.GAMES, gid, COL.GAME_PLAYERS, uid),
        (snap) => {
          present.set(gid, snap.exists());
          recompute();
          settled += 1;
          if (settled >= gameIds.length) setMembershipLoading(false);
        },
        (err) => {
          console.error('useGames (deltagelse) fejl for', gid, err);
          present.set(gid, false);
          recompute();
          settled += 1;
          if (settled >= gameIds.length) setMembershipLoading(false);
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [uid, gameIdsKey]);

  const loading = gamesLoading || membershipLoading;
  // Genbrug samme Set-reference mellem renders når indholdet er uændret.
  const stableMyGameIds = useMemo(() => myGameIds, [myGameIds]);

  return { games, myGameIds: stableMyGameIds, loading };
}
