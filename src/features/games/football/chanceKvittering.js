/**
 * Kvitteringen efter et vellykket kald til setGameChance.
 *
 * HVORFOR DEN FINDES. Før skrev klienten selv, og ⚡-pillen kom øjeblikkeligt
 * fra Firestores lokale skrivning. Nu går chancen gennem serveren, og uden et
 * ord tilbage står fladen tilsyneladende uændret et øjeblik — hvorefter
 * spilleren trykker igen, fordi han tror, det fejlede.
 *
 * DEN SIGER OGSÅ "DER SKETE INGENTING". `uaendret: true` betyder, at serveren
 * bevidst ikke skrev: samme indsats, samme kamp. Det er et svar, ikke en fejl,
 * og tavshed ville være det eneste, der lignede en fejl.
 *
 * DEN NÆVNER KAMPEN, CHANCEN BLEV FLYTTET FRA. Det er den dyreste
 * misforståelse i hele mekanikken: spilleren tror, chancen ligger ét sted, og
 * opdager søndag aften, at den lå et andet. Står der "flyttet fra Brøndby–FCK",
 * er der ingen tvivl.
 *
 * @param {{indsats:number, flyttetFra?:string[], uaendret?:boolean}} res
 *   svaret fra callable'en
 * @param {(betId:string)=>string|null} kampNavnAf  slår "uid_matchId" op og
 *   giver kampens navn — eller null, hvis den ikke kendes i fladen
 * @returns {string}
 */
export function kvitteringFor(res, kampNavnAf) {
  if (!res) return '';
  if (res.uaendret) return 'Chancen står, som den stod — intet ændret.';

  const indsats = Number(res.indsats) || 0;
  const flyttet = Array.isArray(res.flyttetFra) ? res.flyttetFra : [];

  if (indsats === 0) {
    // Nul er ikke "ingen chance sat" — det er en HANDLING: spilleren fjernede
    // den. Uden den sætning ser en bevidst fjernelse ud som om intet skete.
    return 'Chancen er fjernet. Du kan sætte den på en anden kamp i runden.';
  }

  const navne = flyttet.map((id) => kampNavnAf?.(id)).filter(Boolean);
  if (navne.length) {
    return `Chancen er flyttet fra ${navne.join(', ')} — nu ${indsats} point på spil her.`;
  }
  // Flyttet, men vi kender ikke kampens navn (fladen viser fx kun én runde).
  // Sig stadig AT den blev flyttet: at fortie det ville lade spilleren tro,
  // han havde to chancer i runden.
  if (flyttet.length) {
    return `Chancen er flyttet fra en anden kamp i runden — nu ${indsats} point på spil her.`;
  }
  return `Chancen er sat: ${indsats} point på spil.`;
}
