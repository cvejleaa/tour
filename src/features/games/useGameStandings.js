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
  collection, doc, documentId, onSnapshot, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { COL } from '../../lib/constants';
import { rankStandings } from './gameStandings';
import { useGameLeagues } from './useGameLeagues';

// array-contains-any og 'in' tager højst 30 værdier.
const MAX_LEAGUES_IN_QUERY = 30;
const IN_CHUNK = 30;

/** Del en liste i grupper af højst `size`. */
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * @param {string} gameId
 * @returns {{ standings: Array<object>, leagues: Array<object>, loading: boolean, error: string|null }}
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
        setMates(snap.docs.map((d) => ({ ...d.data(), uid: d.id })));
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
      (snap) => setMe(snap.exists() ? { ...snap.data(), uid: snap.id } : null),
      (err) => console.error('useGameStandings (mig) fejl:', err),
    );
    return unsub;
  }, [gameId, uid]);

  // Bruger-profiler (navn/avatar) — KUN for de spillere der faktisk vises.
  // Tidligere blev hele brugerkartoteket hentet for at slå en håndfuld navne op.
  const playerUids = useMemo(() => {
    const set = new Set(mates.map((p) => p.uid));
    if (me) set.add(me.uid);
    return [...set].sort();
  }, [mates, me]);
  const playerKey = playerUids.join(',');

  useEffect(() => {
    if (playerUids.length === 0) { setUsersById({}); setUsersLoading(false); return undefined; }
    const groups = chunk(playerUids, IN_CHUNK);
    const byGroup = groups.map(() => ({}));
    let pending = groups.length;
    const unsubs = groups.map((ids, i) => onSnapshot(
      query(collection(db, COL.USERS), where(documentId(), 'in', ids)),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => { map[d.id] = d.data(); });
        byGroup[i] = map;
        setUsersById(Object.assign({}, ...byGroup));
        if (pending > 0) { pending -= 1; if (pending === 0) setUsersLoading(false); }
      },
      (err) => {
        console.error('useGameStandings (brugere) fejl:', err);
        setUsersLoading(false);
      },
    ));
    return () => unsubs.forEach((u) => u());
    // playerKey holder effekten stabil, selvom array-referencen skifter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerKey]);

  const players = useMemo(() => {
    const byUid = new Map(mates.map((p) => [p.uid, p]));
    if (me) byUid.set(me.uid, me);
    return [...byUid.values()];
  }, [mates, me]);

  const standings = useMemo(() => rankStandings(players, usersById), [players, usersById]);
  // leagues gives med retur, så kaldere ikke behøver et ekstra abonnement.
  return { standings, leagues, loading: leaguesLoading || matesLoading || usersLoading, error };
}
