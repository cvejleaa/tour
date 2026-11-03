// ---------------------------------------------------------------------------
// HVAD YNDLINGSHOLDET GØR — ÉN sætning, to flader.
//
// Mit hold (GameProfile) og guiden (FootballHelp, «Dit hold») beskriver den
// samme funktion. Teksten stod før skrevet af to steder med kommentaren «SAMME
// ORDLYD SOM GameProfile», og den form har allerede drevet én gang: da
// GameProfile blev rettet, blev guiden stående og sagde noget andet.
//
// Med landeflag er der TO ordlyde: i et flag-spil er der ingen trøje, og
// «trøjens farve» / «klubbens farve» ville være falsk lige ved siden af et
// flag. Ringen og temaet er dér LANDETS farve (holdfilens `color`, som har
// kulør nok til begge — haandboldVm2027Hold.js), og ringen bærer desuden
// landets anden farve (`awayColor`, badges.js `sekundaerAf`) — derfor
// «farver» om ringen, men «farve» om temaet. Valget følger `harLandeflag`,
// samme evne som badgen.
// ---------------------------------------------------------------------------

/**
 * @param {boolean} flag  spillet har landeflag (`harLandeflag(game)`)
 * @returns {string}
 */
export function ringOgTemaTekst(flag) {
  return flag
    ? 'Din avatar får landets farver som ring om sig i stillingen og i dine ligaer, og hele spillet toner over i landets farve.'
    : 'Din avatar får trøjens farve som ring om sig i stillingen og i dine ligaer, og hele spillet toner over i klubbens farve.';
}
