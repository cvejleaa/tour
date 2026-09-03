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

/**
 * Stillingen, listen er nået til — det sidste måls stilling, eller 0-0.
 * Bruges til at se, om live-listen halter efter den levende stilling.
 */
export function stillingAfListe(maal) {
  const r = medStilling(maal);
  const sidste = r[r.length - 1];
  return sidste ? { home: sidste.hjemme, away: sidste.ude } : { home: 0, away: 0 };
}

/**
 * LIVE-listen: de tællende mål med stilling flettet med de annullerede — UDEN
 * stilling, for de tæller ikke (ejerens beslutning 2/9: et mål, VAR tager
 * tilbage, bliver stående som annulleret i stedet for at forsvinde). Sorteret
 * efter minut; stabilt, så et mål og en annullering i samme minut beholder
 * rækkefølgen mål først.
 *
 * @param {Array} maal        liveMaal.maal
 * @param {Array} annullerede liveMaal.annullerede
 * @returns {Array<{hold:string, minut:number, annulleret:boolean, hjemme?:number, ude?:number}>}
 */
export function liveRaekke(maal, annullerede) {
  const taellende = medStilling(maal).map((g) => ({ ...g, annulleret: false }));
  const ann = (Array.isArray(annullerede) ? annullerede : [])
    .filter((g) => g && (g.hold === 'home' || g.hold === 'away'))
    .map((g) => ({ ...g, annulleret: true }));
  return [...taellende, ...ann].sort((a, b) => (Number(a.minut) || 0) - (Number(b.minut) || 0));
}

/**
 * Hvad kortet skal vise af en kamps live-liste — eller null, hvis der intet
 * er at vise. `bagud` er sandt, når listen ikke er nået frem til den levende
 * stilling: så halter kilden et minut, og kortet dæmper listen i stedet for
 * at lade den modsige tallet lige over (enigheds-reglen).
 *
 * @param {{maal?:Array, annullerede?:Array}|null|undefined} liveMaal
 * @param {{home:number, away:number}} live  liveScore()-resultatet
 */
export function liveMaalTilstand(liveMaal, live) {
  if (!liveMaal || typeof liveMaal !== 'object' || !live) return null;
  const raekke = liveRaekke(liveMaal.maal, liveMaal.annullerede);
  if (!raekke.length) return null;
  const st = stillingAfListe(liveMaal.maal);
  return { raekke, bagud: st.home !== live.home || st.away !== live.away };
}
