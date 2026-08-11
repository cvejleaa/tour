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

/** Intet tema. Samme konstant-greb som `useKlubFarver`, så identiteten er stabil. */
const INTET = () => null;

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
 * Slå temaet op for et VILKÅRLIGT holdnavn i spillet. Samme form som
 * `useKlubFarver`, fordi den bruges samme sted: holdvælgeren på Mit hold skal
 * kunne vise farven for det hold, man PEGER på, ikke kun for det gemte.
 *
 * @returns {(holdnavn: string|null) => {navn, farve, tema}|null}
 */
export function useKlubTema(game) {
  const mode = useFarveMode();
  return useMemo(() => {
    // SAMME GATE SOM RINGEN OM AVATAREN (`useKlubFarver`), og af samme grund:
    // `teamsOf` falder tilbage på Superligaens tolv hold, så uden den ville en
    // Tour-spiller med et cykelhold i feltet kunne få Brøndby-gult tema.
    if (game?.type !== 'football') return INTET;
    const teams = teamsOf(game);
    const styles = game?.teamStyles;
    const cache = new Map();
    return (holdnavn) => {
      if (!holdnavn) return null;
      if (!cache.has(holdnavn)) {
        const farve = klubAccentAf(teams, styles, holdnavn);
        cache.set(holdnavn, farve ? { navn: holdnavn, farve, tema: accentTema(farve, mode) } : null);
      }
      return cache.get(holdnavn);
    };
  }, [game, mode]);
}

/**
 * @returns {{navn: string, farve: string, stil: object}|null} null når spillet
 * ikke er et fodboldspil, spilleren ikke har valgt et hold, holdet ikke findes
 * i spillets liste, eller ingen af holdets tre trøjer har kulør nok.
 */
export function useSpilTema(game, me) {
  const klubTema = useKlubTema(game);
  const valgt = klubTema(me?.favoriteTeam ?? null);
  return useMemo(
    () => (valgt ? { navn: valgt.navn, farve: valgt.farve, stil: temaStil(valgt.tema) } : null),
    [valgt],
  );
}
