/**
 * Hook: useGameStandings(gameId) — per-spil-stilling.
 *
 * Stillingen er jeres indbyrdes opgør: man kan kun se point for spillere, man
 * deler mindst én liga med. Det håndhæves i security rules via det server-
 * skrevne felt players/{uid}.leagueIds, så forespørgslen her filtrerer på
 * netop dét felt — regler er ikke filtre, så en bredere query ville blive
 * afvist. Sit eget deltager-dokument hentes altid, så man selv er med.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, onSnapshot, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { COL, USER_STATUS } from '../../lib/constants';
import { rankStandings } from './gameStandings';
import { useGameLeagues } from './useGameLeagues';

// array-contains-any tager højst 30 værdier.
const MAX_LEAGUES_IN_QUERY = 30;

/**
 * @param {string} gameId
 * @returns {{ standings: Array<object>, loading: boolean, error: string|null }}
 */
export function useGameStandings(gameId) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { leagues, loading: leaguesLoading } = useGameLeagues(gameId);
  const leagueIds = useMemo(
    () => leagues.map((l) => l.id).slice(0, MAX_LEAGUES_IN_QUERY),
    [leagues],
  );
  const leagueKey = leagueIds.join(',');

  const [mates, setMates] = useState([]);
  const [me, setMe] = useState(null);
  const [matesLoading, setMatesLoading] = useState(true);
  const [usersById, setUsersById] = useState({});
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState(null);

  // Liga-kammeraternes deltager-dokumenter.
  useEffect(() => {
    if (!gameId || leagueIds.length === 0) {
      setMates([]);
      setMatesLoading(false);
      return undefined;
    }
    setMatesLoading(true);
    const unsub = onSnapshot(
      query(
        collection(db, COL.GAMES, gameId, COL.GAME_PLAYERS),
        where('leagueIds', 'array-contains-any', leagueIds),
      ),
      (snap) => {
        setMates(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
        setMatesLoading(false);
      },
      (err) => {
        console.error('useGameStandings (deltagere) fejl:', err);
        setError('Kunne ikke hente stillingen.');
        setMatesLoading(false);
      },
    );
    return unsub;
    // leagueKey holder effekten stabil, selvom array-referencen skifter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, leagueKey]);

  // Sit eget deltager-dokument — man står altid selv på listen.
  useEffect(() => {
    if (!gameId || !uid) { setMe(null); return undefined; }
    const unsub = onSnapshot(
      doc(db, COL.GAMES, gameId, COL.GAME_PLAYERS, uid),
      (snap) => setMe(snap.exists() ? { uid: snap.id, ...snap.data() } : null),
      (err) => console.error('useGameStandings (mig) fejl:', err),
    );
    return unsub;
  }, [gameId, uid]);

  // Bruger-profiler (navn/avatar) for de godkendte spillere.
  useEffect(() => {
    const q = query(collection(db, COL.USERS), where('status', '==', USER_STATUS.APPROVED));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => { map[d.id] = d.data(); });
        setUsersById(map);
        setUsersLoading(false);
      },
      (err) => {
        console.error('useGameStandings (brugere) fejl:', err);
        setUsersLoading(false);
      },
    );
    return unsub;
  }, []);

  const players = useMemo(() => {
    const byUid = new Map(mates.map((p) => [p.uid, p]));
    if (me) byUid.set(me.uid, me);
    return [...byUid.values()];
  }, [mates, me]);

  const standings = useMemo(() => rankStandings(players, usersById), [players, usersById]);
  return { standings, loading: leaguesLoading || matesLoading || usersLoading, error };
}
