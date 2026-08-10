// ---------------------------------------------------------------------------
// SPILLERENS KLUBFARVER — ét opslag, som alle flader deler.
//
// Yndlingsholdet gjorde INTET synligt på platformen: `Avatar` brugte kun
// `favoriteTeam` til et Tour-cykelholds trøjebillede, og den kode er slået fra,
// når PLATFORM_MODE er sat. Baggrunden er `avatarColor(uid)`, en hash. Alligevel
// lovede spilprofilen ordret, at valget "giver din avatar holdets farve i
// stillingen og i dine ligaer". Det her er den funktion, den tekst beskrev.
// ---------------------------------------------------------------------------

import { useMemo } from 'react';
import { teamsOf } from './teamInfo';
import { klubFarverAf } from './badges';

const INTET = () => null;

/**
 * Giver en funktion `holdnavn → {primaer, sekundaer, navn} | null`.
 *
 * TO GATES, og begge er nødvendige:
 *
 *  1. KUN FODBOLDSPIL. `teamsOf` falder tilbage på Superligaens tolv hold, når
 *     spillet ikke har nogen — en fallback, der giver mening på tip-fladen i et
 *     endnu ikke seedet fodboldspil, men som her ville give en Tour-spiller en
 *     ring i Brøndby-gul, fordi hans cykelhold tilfældigvis hed noget.
 *  2. KUN NAVNE, SPILLET KENDER. `gameStandings.js` falder tilbage på brugerens
 *     GLOBALE yndlingshold (`p.favoriteTeam ?? u.favoriteTeam`), og for en
 *     migreret Tour-bruger står der et CYKELHOLD dér. `klubFarverAf` slår op i
 *     holdlisten og giver null for et navn, den ikke kender — i stedet for
 *     `badgeFor`s grå, som ville se ud som en rigtig klubfarve.
 *
 * Resultatet caches pr. navn: stillingen kalder den én gang pr. række, og
 * `teamInfo` går listen igennem hver gang.
 */
export function useKlubFarver(game) {
  return useMemo(() => {
    if (game?.type !== 'football') return INTET;
    if (!Array.isArray(game?.teams) || game.teams.length === 0) return INTET;
    const teams = teamsOf(game);
    const styles = game?.teamStyles;
    const cache = new Map();
    return (holdnavn) => {
      if (!holdnavn) return null;
      if (!cache.has(holdnavn)) cache.set(holdnavn, klubFarverAf(teams, styles, holdnavn));
      return cache.get(holdnavn);
    };
  }, [game]);
}
