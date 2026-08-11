// ---------------------------------------------------------------------------
// SPILLETS ACCENTFARVE — yndlingsholdets klubfarve, kun inde i spillet.
//
// Tour havde det samme, men som en GLOBAL indstilling: ét hold, hele appen,
// gemt i localStorage. Platformen har flere spil ved siden af hinanden, og
// yndlingsholdet er et felt PÅ SPILLERDOKUMENTET I SPILLET
// (`games/{id}/players/{uid}.favoriteTeam`). To spil, to hold, to farver.
//
// Derfor sættes variablerne på spillets container (se GameLayout) og ikke på
// <html>. Fire ting følger gratis af det valg:
//
//   · Topbjælken bliver grøn og markerer, hvor spillet holder op.
//   · Der er intet at RYDDE, når man navigerer væk — CSS-variabler nedarves
//     kun nedad, så farven forsvinder med containeren.
//   · Intet blink: `me` hentes asynkront, og et tema på <html> ville blive sat
//     et øjeblik efter, at siden allerede stod grøn.
//   · Layout.jsx's hardkodede '#fff' på det aktive nav-link kan ikke ramme
//     forkert, for topbjælken er uden for temaet. (Den er rettet alligevel —
//     Tour-temaerne står stadig på <html>.)
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { accentTema, temaStil } from '../../lib/accentTema';
import { laesFarveMode, lytTilFarveMode } from '../../lib/farveMode';
import { klubAccentAf } from './football/badges';
import { teamsOf } from './football/teamInfo';

/** Basistemaet lige nu, holdt opdateret hvis brugeren slår om undervejs. */
export function useFarveMode() {
  const [mode, setMode] = useState(laesFarveMode);
  useEffect(() => {
    setMode(laesFarveMode());
    return lytTilFarveMode(setMode);
  }, []);
  return mode;
}

/**
 * @returns {{navn: string, farve: string, stil: object}|null} null når spillet
 * ikke er et fodboldspil, spilleren ikke har valgt et hold, holdet ikke findes
 * i spillets liste, eller ingen af holdets tre trøjer har kulør nok.
 */
export function useSpilTema(game, me) {
  const mode = useFarveMode();
  const holdnavn = me?.favoriteTeam ?? null;
  return useMemo(() => {
    // SAMME GATE SOM RINGEN OM AVATAREN (`useKlubFarver`), og af samme grund:
    // `teamsOf` falder tilbage på Superligaens tolv hold, så uden den ville en
    // Tour-spiller med et cykelhold i feltet kunne få Brøndby-gult tema.
    if (game?.type !== 'football') return null;
    const farve = klubAccentAf(teamsOf(game), game?.teamStyles, holdnavn);
    if (!farve) return null;
    return { navn: holdnavn, farve, stil: temaStil(accentTema(farve, mode)) };
  }, [game, holdnavn, mode]);
}
