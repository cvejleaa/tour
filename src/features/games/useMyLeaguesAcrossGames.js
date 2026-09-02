/**
 * Hook: useMyLeaguesAcrossGames — alle mini-ligaer, jeg er medlem af, på
 * TVÆRS af alle mine spil. Generaliserer useGameLeagues (ét spil) til hele
 * platformen, så Beskeder-fanen kan udlede, hvem man deler en liga med.
 *
 * BEVIDST per-spil-lyttere, IKKE collectionGroup('leagues') — samme fravalg
 * som useGames.js (se dér): en nested `match /games/{gid}/leagues` autoriserer
 * ikke en collectionGroup-query (den kræver en `/{path=**}/leagues`-regel, som
 * ikke findes og ville være en ny sikkerhedsflade). Per-spil-queryen rammer
 * den simple `uid in memberUids`-læseregel, der allerede tillader den — uden
 * nyt indeks.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useGames } from './useGames';
import { COL } from '../../lib/constants';

/**
 * Ren fletning: {gameId → liga-array} → én flad liste, hvor hver liga er
 * mærket med sit gameId. Stabil rækkefølge (gameId, dernæst liga-id), så
 * outputtet ikke hopper mellem renders.
 * @param {Record<string, Array<object>>} perGame
 * @returns {Array<object>} ligaer, hver som { ...data, id, gameId }
 */
export function mergeGameLeagues(perGame) {
  const out = [];
  for (const gid of Object.keys(perGame || {}).sort()) {
    for (const lg of perGame[gid] || []) {
      out.push({ ...lg, gameId: gid });
    }
  }
  return out;
}

/**
 * @returns {{ leagues: Array<object>, loading: boolean }}
 *   leagues: mine mini-ligaer på tværs af spil, hver mærket med sit gameId.
 */
export function useMyLeaguesAcrossGames() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { myGameIds, loading: gamesLoading } = useGames();

  const [perGame, setPerGame] = useState({});
  const [leaguesLoading, setLeaguesLoading] = useState(true);

  // Primitiv nøgle, så effekten kun kører når spil-sættet (eller brugeren)
  // reelt ændrer sig — ikke hver gang Set-referencen skifter.
  const gameIdsKey = useMemo(() => [...myGameIds].sort().join(','), [myGameIds]);

  useEffect(() => {
    const gameIds = gameIdsKey ? gameIdsKey.split(',') : [];
    if (!uid || gameIds.length === 0) {
      setPerGame({});
      setLeaguesLoading(false);
      return undefined;
    }
    setLeaguesLoading(true);
    const acc = {}; // gid → leagues[] (frisk pr. effekt, så fjernede spil falder ud)
    let settled = 0;
    const unsubs = gameIds.map((gid) =>
      onSnapshot(
        query(
          collection(db, COL.GAMES, gid, COL.GAME_LEAGUES),
          where('memberUids', 'array-contains', uid),
        ),
        (snap) => {
          acc[gid] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          setPerGame({ ...acc });
          settled += 1;
          if (settled >= gameIds.length) setLeaguesLoading(false);
        },
        (err) => {
          console.error('useMyLeaguesAcrossGames fejl for', gid, err);
          acc[gid] = [];
          setPerGame({ ...acc });
          settled += 1;
          if (settled >= gameIds.length) setLeaguesLoading(false);
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [uid, gameIdsKey]);

  const leagues = useMemo(() => mergeGameLeagues(perGame), [perGame]);
  return { leagues, loading: gamesLoading || leaguesLoading };
}
