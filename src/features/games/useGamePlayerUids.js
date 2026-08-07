/**
 * Hook: useGamePlayerUids(gameId) — ALLE deltagere i ét spil, til admin-brug.
 *
 * Adskilt fra useGameStandings med vilje. Den er skåret efter liga-medlemskab,
 * fordi stillingen er spillernes indbyrdes opgør: man må kun se point for dem,
 * man deler en liga med. Denne her skal svare på noget andet — "hvem deltager
 * overhovedet i dette spil" — og er derfor kun brugbar for en global admin.
 * Security rules tillader netop dét (`allow read: if isGlobalAdmin() || …`), så
 * for alle andre giver forespørgslen en tom liste og en fejl i konsollen.
 *
 * HVORFOR DEN FINDES. Modtagervalget i Send mail kunne kun indsætte ALLE
 * godkendte brugere. Et brev om Superligaens regler gik derfor også til dem,
 * der aldrig har været med i Superligaen — og en mail, der ikke vedkommer én,
 * er den hurtigste måde at lære folk at lade være med at læse dem.
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * @param {string|null} gameId — null/tom slår hooken fra (ingen lytter).
 * @returns {{ uids: Array<string>, loading: boolean, error: string }}
 */
export function useGamePlayerUids(gameId) {
  const [uids, setUids] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!gameId) { setUids([]); setLoading(false); setError(''); return undefined; }
    setLoading(true); setError('');
    const unsub = onSnapshot(
      collection(db, COL.GAMES, gameId, 'players'),
      (snap) => {
        setUids(snap.docs.map((d) => d.id));
        setLoading(false);
      },
      (err) => {
        console.error('useGamePlayerUids fejl:', err);
        // Ærlig fejltekst: den hyppigste årsag er manglende adgang, ikke
        // netværk — og så hjælper "tjek din forbindelse" ingen.
        setError('Kunne ikke hente spillets deltagere. Kræver global admin.');
        setLoading(false);
      },
    );
    return unsub;
  }, [gameId]);

  return { uids, loading, error };
}
