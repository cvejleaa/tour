/**
 * useSpillerOpdeling(gameId, uid) — én spillers tips på de kampe, der er
 * afgjort og begyndt.
 *
 * ÉT dokument på en KENDT sti, hentet én gang. Ikke en forespørgsel og ikke en
 * lytter:
 *
 *  - En query over bets ville fejle HELT. Reglen slår kampen op pr. dokument
 *    for at tjekke kickoff, og Firestore tillader kun 10 sådanne opslag i én
 *    forespørgsel — over en sæson på 132 kampe afvises hele forespørgslen, ikke
 *    bare de dokumenter man ikke må se. Derfor skriver serveren rækkerne
 *    færdige i ét dokument.
 *  - En lytter ville koste en abonnement pr. panel, man folder ud, på data der
 *    kun ændrer sig, når en kamp afgøres.
 *
 * Klienten må ALDRIG lave en collectionGroup-query over 'detalje': reglen
 * afviser den, og så ville panelet stå tomt uden fejlbesked.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { COL } from '../../../lib/constants';

export function useSpillerOpdeling(gameId, uid) {
  const [kampe, setKampe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!gameId || !uid) { setKampe(null); setLoading(false); return undefined; }
    let afbrudt = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const ref = doc(db, COL.GAMES, gameId, 'players', uid, 'detalje', 'opdeling');
        const snap = await getDoc(ref);
        if (afbrudt) return;
        // Findes dokumentet ikke, har spilleren ingen afgjorte kampe endnu —
        // det er en tom tilstand, ikke en fejl.
        setKampe(snap.exists() ? (snap.data()?.kampe || {}) : {});
      } catch (err) {
        if (afbrudt) return;
        // En afvist læsning er den forventede fejl: man deler ikke længere liga
        // med spilleren. Sig det, i stedet for at vise en tom liste.
        setError(err?.code === 'permission-denied'
          ? 'Du deler ikke længere liga med denne spiller.'
          : 'Kunne ikke hente spillerens tips.');
        setKampe(null);
      } finally {
        if (!afbrudt) setLoading(false);
      }
    })();

    return () => { afbrudt = true; };
  }, [gameId, uid]);

  return { kampe, loading, error };
}
