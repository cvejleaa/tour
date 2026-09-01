// ---------------------------------------------------------------------------
// maalRaekke — stillingen EFTER hvert mål.
//
// Ejeren bad om resultatet med på hver begivenhed: en målliste, hvor man kan
// se kampen udvikle sig ("1-0 … 1-1 … 2-1") i stedet for kun at få scorerne
// remset op. Det er den samme oplysning, spillet i forvejen handler om —
// 1X2 — bare bevæget gennem kampen.
//
// STILLINGEN UDLEDES, DEN GEMMES IKKE. Serveren kender den (kilden bærer
// `Sc` på hver hændelse, og det er præcis dét, målene udledes af i
// kampDetaljer.js), men at skrive den ville betyde et nyt felt, en ny synk og
// en bagfyldning af alt, der allerede er hentet — for et tal, der kan tælles
// på stedet. Optællingen kan desuden ikke drive fra facit: `kaedeOk` på
// serveren har allerede bundet, at antallet af mål pr. side stemmer med
// kampens resultat, så den sidste stilling i listen ER slutresultatet.
//
// SORTERINGEN GENTAGES her, selv om serveren allerede sorterer. Rækkefølgen
// er ikke pynt: bytter to mål plads, bliver hver eneste mellemstilling
// forkert. En visning, der REGNER på rækkefølgen, må ikke arve den fra et
// dokument, den ikke selv har skrevet. Array.prototype.sort er stabil, så mål
// i samme minut bevarer serverens rækkefølge.
// ---------------------------------------------------------------------------

/**
 * Målene med den løbende stilling påhæftet.
 *
 * @param {Array<{hold:'home'|'away', minut:number}>} maal
 * @returns {Array<{hold:string, minut:number, hjemme:number, ude:number}>}
 *   samme poster, hver med stillingen EFTER målet. Tom liste ind → tom ud.
 */
export function medStilling(maal) {
  if (!Array.isArray(maal)) return [];
  const rene = maal.filter((g) => g && (g.hold === 'home' || g.hold === 'away'));
  const sorteret = [...rene].sort((a, b) => (Number(a.minut) || 0) - (Number(b.minut) || 0));
  let hjemme = 0;
  let ude = 0;
  return sorteret.map((g) => {
    if (g.hold === 'home') hjemme += 1; else ude += 1;
    return { ...g, hjemme, ude };
  });
}
