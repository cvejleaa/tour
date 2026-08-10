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
 *  1. KUN FODBOLDSPIL. Uden den ville en Tour-spiller kunne få en ring i
 *     Brøndby-gul, fordi `teamsOf` falder tilbage på Superligaens tolv hold og
 *     hans cykelhold tilfældigvis hed noget.
 *
 *     GATEN KRÆVER IKKE, AT SPILLET SELV HAR EN HOLDLISTE, og det gjorde den
 *     først. Men `games/{id}.teams` skrives kun af `seed-football.mjs`, og
 *     profil-fanen er ikke gated på fodbold: i et fodboldspil uden liste viste
 *     VÆLGEREN Superligaens tolv hold via samme fallback, mens ringen udeblev
 *     — og hjælpeteksten lige over lovede en ring. Så var den falsk igen, i
 *     det samme kort. Ringen bruger nu nøjagtig den liste, vælgeren viser, så
 *     de to ikke kan sige forskellige ting.
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
