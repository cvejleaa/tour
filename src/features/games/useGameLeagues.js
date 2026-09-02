/**
 * Hook: useGameLeagues(gameId) — de ligaer i spillet, jeg er medlem af.
 */
import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { COL } from '../../lib/constants';

/**
 * @param {string} gameId
 * @returns {{ leagues: Array<object>, loading: boolean, error: string|null }}
 */
export function useGameLeagues(gameId) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!gameId || !uid) {
      setLeagues([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(
      collection(db, COL.GAMES, gameId, COL.GAME_LEAGUES),
      where('memberUids', 'array-contains', uid),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        // DOKUMENT-ID'ET VINDER — spreadet ligger FØRST. Første udgave satte
        // id-nøglen FØR spreadet, så et `id`-FELT i dokumentet skyggede
        // for det ægte id: en ejer kunne skrive `id: '<fremmed liga>'`, og
        // stillingens forespørgsel (useGameStandings) ramte så en liga, reglen
        // afviste — offerets stilling forsvandt (Security-fund). Reglen
        // forbyder nu feltet; læseren stoler alligevel ikke på det.
        //
        // NAVNET NORMALISERES HER, ét sted for alle forbrugere: et map som
        // navn (muligt før reglen fik typevagt på update) kaster i React,
        // hvor det renderes — LeagueBets, GameStandings, PuljeAfsloering …
        setLeagues(snap.docs.map((d) => {
          const data = d.data();
          return { ...data, id: d.id, name: typeof data.name === 'string' ? data.name : '' };
        }).sort((a, b) => a.name.localeCompare(b.name, 'da')));
        setLoading(false);
      },
      (err) => {
        console.error('useGameLeagues fejl:', err);
        setError('Kunne ikke hente dine ligaer.');
        setLoading(false);
      },
    );
    return unsub;
  }, [gameId, uid]);

  return { leagues, loading, error };
}
