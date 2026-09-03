/**
 * Hook: useGame(gameId)
 * Live-abonnement på ÉT spil: selve spil-dokumentet, min egen deltagelse
 * (players/{uid} — indeholder bl.a. saldo/point), samt spillets kampe.
 * Fundament for spil-siderne under /spil/:gameId (Fase B).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { COL } from '../../lib/constants';

/**
 * @param {string} gameId
 * @returns {{
 *   game: object|null|undefined,   // undefined = indlæser, null = findes ikke
 *   me: object|null,               // mit players/{uid}-dokument (null = deltager ikke)
 *   isMember: boolean,
 *   matches: Array<object>,        // spillets kampe, sorteret efter kickoff
 *   loading: boolean,
 * }}
 */
export function useGame(gameId) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [game, setGame] = useState(undefined);
  const [me, setMe] = useState(null);
  const [matches, setMatches] = useState([]);
  const [gameLoading, setGameLoading] = useState(true);
  const [meLoading, setMeLoading] = useState(true);
  const [matchesLoading, setMatchesLoading] = useState(true);

  // Spil-dokumentet.
  useEffect(() => {
    if (!gameId) return undefined;
    setGameLoading(true);
    const unsub = onSnapshot(
      doc(db, COL.GAMES, gameId),
      (snap) => {
        setGame(snap.exists() ? { ...snap.data(), id: snap.id } : null);
        setGameLoading(false);
      },
      (err) => {
        console.error('useGame (spil) fejl:', err);
        setGame(null);
        setGameLoading(false);
      },
    );
    return unsub;
  }, [gameId]);

  // Min deltagelse (saldo/point). Fravær = jeg deltager ikke (endnu).
  useEffect(() => {
    if (!gameId || !uid) {
      setMe(null);
      setMeLoading(false);
      return undefined;
    }
    setMeLoading(true);
    const unsub = onSnapshot(
      doc(db, COL.GAMES, gameId, COL.GAME_PLAYERS, uid),
      (snap) => {
        setMe(snap.exists() ? { ...snap.data(), id: snap.id } : null);
        setMeLoading(false);
      },
      (err) => {
        console.error('useGame (deltagelse) fejl:', err);
        setMe(null);
        setMeLoading(false);
      },
    );
    return unsub;
  }, [gameId, uid]);

  // Kampene i spillet, sorteret efter kickoff (tidligste først).
  useEffect(() => {
    if (!gameId) return undefined;
    setMatchesLoading(true);
    const q = query(
      collection(db, COL.GAMES, gameId, COL.GAME_MATCHES),
      orderBy('kickoff'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMatches(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
        setMatchesLoading(false);
      },
      (err) => {
        console.error('useGame (kampe) fejl:', err);
        setMatches([]);
        setMatchesLoading(false);
      },
    );
    return unsub;
  }, [gameId]);

  const loading = gameLoading || meLoading || matchesLoading;
  // Forladt = arkiv: fladen viser Deltag-kortet ("Vend tilbage"), ikke fanerne.
  const isMember = me != null && me.forladt !== true;
  const value = useMemo(
    () => ({ game, me, isMember, matches, loading }),
    [game, me, isMember, matches, loading],
  );
  return value;
}
