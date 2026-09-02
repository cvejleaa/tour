// ---------------------------------------------------------------------------
// SPILLETS RUNDER — hentet FØRST når nogen skal bruge dem.
//
// Startrunden sættes i Spil-tidsplan, og for at kunne vælge den skal ejeren se,
// hvilke runder spillet har, og hvornår de ligger. Det kræver kamplisten.
//
// DEN HENTES IKKE VED RENDER AF FANEN. Fanen viser alle spil på én gang, og
// Superligaen alene har 132 kampe; et opslag pr. spil ved hver indlæsning ville
// koste hundredvis af læsninger, hver gang nogen åbnede fanen for at skifte en
// status.
//
// DOVENSKABEN LIGGER I KALDESTEDET, ikke her. Hooken havde først en
// `aktiv`-parameter, men det eneste kaldested sendte altid `true` — vagten var
// den betingede render af `StartRundeVaelger`, ikke parameteren. En vagt, der
// altid er sand, er ikke en vagt; den er en kommentar, der ligner kode. Den er
// derfor væk, og komponenten monteres først, når ejeren beder om at vælge.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { groupByRound } from '../games/football/footballRounds';

/**
 * @param {string|null} gameId
 * @returns {{runder: Array<{round:number, matches:Array<object>}>, kampe: Array<object>, henter: boolean, fejl: string|null}}
 */
export function useGameRounds(gameId) {
  const [kampe, setKampe] = useState(null);
  const [fejl, setFejl] = useState(null);

  useEffect(() => {
    if (!gameId || kampe) return undefined;
    let afbrudt = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'games', gameId, 'matches'));
        if (!afbrudt) setKampe(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      } catch (err) {
        if (!afbrudt) setFejl(err?.message || 'Kunne ikke hente kampene.');
      }
    })();
    return () => { afbrudt = true; };
  }, [gameId, kampe]);

  return {
    kampe: kampe || [],
    // Runde 0 er `groupByRound`s pose til kampe UDEN rundenummer. De kan ikke
    // vælges som startrunde — gaten rører dem aldrig — så de hører ikke i
    // vælgeren.
    runder: (kampe ? groupByRound(kampe) : []).filter((r) => r.round > 0),
    henter: Boolean(gameId && !kampe && !fejl),
    fejl,
  };
}
