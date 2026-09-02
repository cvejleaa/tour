/**
 * Hook: useMatchLeagueBets(gameId, matchId, leagueIds, enabled)
 * — hvad tippede mine liga-kammerater på ÉN kamp?
 *
 * Hentes først når kortet foldes ud (enabled), og som en engangs-hentning, ikke
 * en lytter: tippene kan alligevel ikke ændre sig, når kampen er i gang.
 *
 * Forespørgslen SKAL have array-contains-any på leagueIds. Security-reglen
 * kræver liga-overlap pr. dokument, og en regel, der ikke kan afgøres for hvert
 * dokument, får hele forespørgslen til at fejle — ikke bare de dokumenter, man
 * ikke må se. (Se "Regler er ikke filtre" i CLAUDE.md.)
 */
import { useEffect, useState } from 'react';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { COL } from '../../../lib/constants';

// Firestore tillader højst 30 værdier i array-contains-any / in.
const MAX_IN = 30;

/** Del en liste i klumper på højst n. */
export function chunk(list, n = MAX_IN) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/**
 * Slå visningsnavne op for et sæt uid'er (users/{uid}.displayName).
 * @returns {Promise<Record<string,string>>} uid → navn
 */
async function fetchNames(uids) {
  const names = {};
  for (const ids of chunk([...new Set(uids)])) {
    if (!ids.length) continue;
    const snap = await getDocs(query(collection(db, COL.USERS), where(documentId(), 'in', ids)));
    snap.forEach((d) => { names[d.id] = d.data()?.displayName || 'Ukendt spiller'; });
  }
  return names;
}

/**
 * @param {string} gameId
 * @param {string} matchId
 * @param {string[]} leagueIds – mine ligaer i spillet
 * @param {boolean} enabled    – hent først når visningen er foldet ud
 * @returns {{ bets: Array<object>, loading: boolean, error: string }}
 */
export function useMatchLeagueBets(gameId, matchId, leagueIds, enabled) {
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Primitiv nøgle, så effekten ikke kører igen på en ny array-reference med
  // samme indhold.
  const key = Array.isArray(leagueIds) ? [...leagueIds].sort().join(',') : '';

  useEffect(() => {
    if (!enabled || !gameId || !matchId || !key) {
      setBets([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const ids = key.split(',');
        const rows = [];
        const seen = new Set(); // samme tip kan komme igen via to fælles ligaer
        for (const part of chunk(ids)) {
          const snap = await getDocs(query(
            collection(db, COL.GAMES, gameId, COL.GAME_BETS),
            where('matchId', '==', matchId),
            where('leagueIds', 'array-contains-any', part),
          ));
          snap.forEach((d) => {
            if (seen.has(d.id)) return;
            seen.add(d.id);
            rows.push({ ...d.data(), id: d.id });
          });
        }
        const names = await fetchNames(rows.map((r) => r.uid).filter(Boolean));
        if (cancelled) return;
        setBets(rows
          .map((r) => ({ ...r, name: names[r.uid] || 'Ukendt spiller' }))
          .sort((a, b) => a.name.localeCompare(b.name, 'da')));
        setLoading(false);
      } catch (err) {
        console.error('useMatchLeagueBets fejl:', err);
        if (cancelled) return;
        setBets([]);
        setError('Kunne ikke hente ligaens tips.');
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [gameId, matchId, key, enabled]);

  return { bets, loading, error };
}
