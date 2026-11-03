// ---------------------------------------------------------------------------
// SPILLERENS EGET PULJE-TIP — games/{gameId}/puljeBets/{uid}, live.
//
// ÉN vej til at læse sit eget tip: 🎖️ Pulje (PuljeTip) og 📊 Grupper (🎖️ ud
// for de hold, man har tippet) bruger begge denne hook. firestore.rules
// tillader altid at læse sit EGET dokument (puljeBets/{uid}); andres kræver
// deadline og er en helt anden læsning (PuljeAfsloering).
//
// undefined = indlæser, null = intet tip (eller ingen bruger/intet spil, eller
// læsningen fejlede — så er der intet at vise, og fladen må ikke gætte).
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import { COL } from '../../../lib/constants';

/**
 * @param {string|null|undefined} gameId  null/undefined = lyt ikke (fx et spil uden pulje)
 * @param {string|null|undefined} uid
 * @returns {object|null|undefined}
 */
export function useEgetPuljeBet(gameId, uid) {
  const [bet, setBet] = useState(undefined);
  useEffect(() => {
    if (!gameId || !uid) { setBet(null); return undefined; }
    const ref = doc(db, COL.GAMES, gameId, COL.GAME_PULJE, uid);
    return onSnapshot(ref, (snap) => {
      setBet(snap.exists() ? snap.data() : null);
    }, () => setBet(null));
  }, [gameId, uid]);
  return bet;
}
