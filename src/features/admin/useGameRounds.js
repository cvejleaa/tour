// ---------------------------------------------------------------------------
// SPILLETS RUNDER — hentet FØRST når nogen skal bruge dem.
//
// Startrunden sættes i Spil-tidsplan, og for at kunne vælge den skal ejeren se,
// hvilke runder spillet har, og hvornår de ligger. Det kræver kamplisten.
//
// DEN HENTES IKKE VED RENDER. Fanen viser alle spil på én gang, og Superligaen
// alene har 132 kampe; et opslag pr. spil ved hver indlæsning ville koste
// hundredvis af læsninger, hver gang nogen åbnede fanen for at skifte en status.
// Derfor `aktiv`: listen hentes én gang, når ejeren rent faktisk beder om at
// vælge en runde.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { groupByRound } from '../games/football/footballRounds';

/**
 * @param {string|null} gameId
 * @param {boolean} aktiv  hent først når den er sand
 * @returns {{runder: Array<{round:number, matches:Array<object>}>, kampe: Array<object>, henter: boolean, fejl: string|null}}
 */
export function useGameRounds(gameId, aktiv) {
  const [kampe, setKampe] = useState(null);
  const [fejl, setFejl] = useState(null);

  useEffect(() => {
    if (!aktiv || !gameId || kampe) return undefined;
    let afbrudt = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'games', gameId, 'matches'));
        if (!afbrudt) setKampe(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        if (!afbrudt) setFejl(err?.message || 'Kunne ikke hente kampene.');
      }
    })();
    return () => { afbrudt = true; };
  }, [gameId, aktiv, kampe]);

  return {
    kampe: kampe || [],
    // Runde 0 er `groupByRound`s pose til kampe UDEN rundenummer. De kan ikke
    // vælges som startrunde — gaten rører dem aldrig — så de hører ikke i
    // vælgeren.
    runder: (kampe ? groupByRound(kampe) : []).filter((r) => r.round > 0),
    henter: Boolean(aktiv && gameId && !kampe && !fejl),
    fejl,
  };
}
