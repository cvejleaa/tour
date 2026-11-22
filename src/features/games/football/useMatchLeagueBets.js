/**
 * Hook: useMatchLeagueBets(gameId, matchId, leagueIds, enabled)
 * — hvad tippede mine liga-kammerater på ÉN kamp?
 *
 * Hentes automatisk for hvert kampkort efter kickoff (LeagueBets sender
 * enabled = "jeg er i en liga"), og som en engangs-hentning, ikke en lytter:
 * tippene kan alligevel ikke ændre sig, når kampen er i gang. Facit kan — men
 * farverne følger kampens `result`, som kortet allerede har; ingen ny hentning.
 *
 * PRIS. Hvert låst kort laver én forespørgsel på tips. Navnene slås op gennem
 * en fælles cache på modulniveau (`hentNavne`), så de samme venner ikke slås
 * op én gang pr. kort. `useMatchLeagueBets.test.js` måler det: ti låste kort
 * med de samme fem navne giver 11 forespørgsler (10 på tips + 1 på navne),
 * hvor det uden cachen var 20.
 *
 * Forespørgslen på tips bliver PR. KAMP. En samlet `matchId in [...]` ville
 * spare flere, men reglens get()-sti afhænger af `resource.data.matchId`
 * (firestore.rules), og det er ikke en ændring, der hører til her.
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
 * Fælles navnecache: uid → løfte om et navn (eller null, når profilen mangler).
 *
 * Løftet gemmes, ikke kun svaret, så to kort, der monteres samtidig og beder
 * om de samme navne, deler ÉN forespørgsel i stedet for at sende hver sin.
 * Et navn, der ændres midt i en session, ses først efter genindlæsning — det
 * er prisen for ikke at slå hele vennekredsen op pr. kort.
 */
const navneCache = new Map();

/** Kun til tests: tøm cachen, så én tests navne ikke lækker ind i den næste. */
export function nulstilNavneCache() {
  navneCache.clear();
}

/**
 * Slå visningsnavne op for et sæt uid'er (users/{uid}.displayName) — kun dem,
 * cachen ikke allerede har.
 * @returns {Promise<Record<string,string>>} uid → navn
 */
export async function hentNavne(uids) {
  const unikke = [...new Set(uids)];
  const mangler = unikke.filter((u) => !navneCache.has(u));
  for (const ids of chunk(mangler)) {
    const klump = getDocs(query(collection(db, COL.USERS), where(documentId(), 'in', ids)))
      .then((snap) => {
        const fundet = {};
        snap.forEach((d) => { fundet[d.id] = d.data()?.displayName || null; });
        return fundet;
      });
    for (const u of ids) {
      const loefte = klump.then((fundet) => fundet[u] ?? null);
      // Et mislykket opslag må ikke blive hængende i cachen — så ville navnet
      // aldrig komme, heller ikke ved næste kort eller næste visning.
      loefte.catch(() => navneCache.delete(u));
      navneCache.set(u, loefte);
    }
  }
  const navne = {};
  await Promise.all(unikke.map(async (u) => {
    navne[u] = (await navneCache.get(u)) || 'Ukendt spiller';
  }));
  return navne;
}

/**
 * @param {string} gameId
 * @param {string} matchId
 * @param {string[]} leagueIds – mine ligaer i spillet
 * @param {boolean} enabled    – false: hent ikke (fx uden liga)
 * @returns {{ bets: Array<object>, loading: boolean, error: string }}
 */
export function useMatchLeagueBets(gameId, matchId, leagueIds, enabled) {
  // Primitiv nøgle, så effekten ikke kører igen på en ny array-reference med
  // samme indhold.
  const key = Array.isArray(leagueIds) ? [...leagueIds].sort().join(',') : '';
  const henter = Boolean(enabled && gameId && matchId && key);

  const [bets, setBets] = useState([]);
  // QC/RM (BØR): loading starter SAND, når der skal hentes. Startede den
  // falsk, var første billede «ingen tips» (bets=[], loading=false) på hvert
  // låst kort — en forkert sætning og et ekstra layout-hop, før effekten nåede
  // at tænde spinneren. Panelet var før foldet, så det kunne ikke ses.
  const [loading, setLoading] = useState(henter);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!henter) {
      setBets([]);
      setLoading(false);
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
        const names = await hentNavne(rows.map((r) => r.uid).filter(Boolean));
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
  }, [gameId, matchId, key, henter]);

  return { bets, loading, error };
}
