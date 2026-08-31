// src/lib/ligaPoint.js — EN LIGAS POINT, NÅR DEN STARTER SENERE END SPILLET.
//
// SPEJLET FIL: functions-platform/ligaPoint.js skal følges ad (CLAUDE.md), og
// pariteten er testdækket i ligaPoint.test.js.
//
// HVORFOR DET IKKE BARE ER ET FRADRAG. En ligas stilling blev før FILTRERET,
// ikke beregnet: `subsetRanking` tog spillets færdige stilling og skar den ned
// til ligaens medlemmer. Skal to ligaer tælle fra hver sin runde, skal der
// findes to forskellige totaler for den samme spiller — og det gør der ikke
// plads til i ét `totalPoints`-felt.
//
// Man kunne fristes til at summere `players/{uid}/detalje/opdeling` i fladen,
// men den rummer kun {pick, points, chanceStake} for kampe, der er afgjort OG
// begyndt. Fire ting mangler: combi, puljen, kampe med ulæseligt kickoff, og
// gulvet ved 0, der lægges én gang på hele totalen. Derfor `perRound`, skrevet
// af serveren sammen med totalen.
//
// PULJEN ER IKKE EN RUNDE. Den tippes FØR sæsonen, lukker ved `puljeLockAt` og
// afregnes som en klump ved sæsonslut — op til 34 point
// (POOL_SIZE 6 × PER_TEAM 4 + PERFECT_BONUS 10). Et medlem, der først kom med
// i runde 20, KUNNE ikke have tippet den; reglerne afviser et puljetip efter
// deadline. Tæller den med, kan ligaen blive afgjort af point, halvdelen af
// dens medlemmer aldrig havde adgang til — og det er præcis den forsæsons-
// fordel, en startrunde skal fjerne.

/**
 * Den højeste startrunde, en liga må have og stadig få puljen med.
 *
 * ET VALG, IKKE EN MÅLING — og derfor står tallet her, ikke i en `if`.
 * Superligaens `puljeLockAt` er 1. august 15:59 UTC, altså lige før runde 2.
 * Strengt taget kunne kun en liga fra runde 2 have haft alle medlemmer inde
 * før deadline. Ejeren har valgt 3, altså ét rundes slæk: en liga, der samles
 * i sæsonens første uger, beholder puljen. `ligaPoint.test.js` binder tallet
 * til `puljeLockAt`, så slækket står sort på hvidt i stedet for at være en
 * tilfældighed.
 */
export const PULJE_MAKS_STARTRUNDE = 3;

/** Nøglen i `perRound` for kampe uden rundenummer. De tæller altid med. */
export const UDEN_RUNDE = 'uden';

/** Tæller puljen med i en liga, der starter ved `startRunde`? */
export function puljenTaeller(startRunde) {
  if (!Number.isFinite(startRunde)) return true;
  return startRunde <= PULJE_MAKS_STARTRUNDE;
}

/**
 * En spillers point i ÉN liga.
 *
 * @param {object|null} perRound     runde → point (inkl. rundens combi), fra serveren
 * @param {number|null} startRunde   ligaens startrunde; null = hele spillet
 * @param {number} puljeBonus        players/{uid}.bonusPoints
 * @returns {number}
 */
export function ligaPoint(perRound, startRunde, puljeBonus = 0) {
  let sum = 0;
  for (const [noegle, v] of Object.entries(perRound || {})) {
    const tal = Number(v) || 0;
    if (noegle === UDEN_RUNDE) { sum += tal; continue; }
    const r = Number(noegle);
    if (!Number.isFinite(r)) continue;
    if (Number.isFinite(startRunde) && r < startRunde) continue;
    sum += tal;
  }
  if (puljenTaeller(startRunde)) sum += Number(puljeBonus) || 0;
  // GULVET LÆGGES ÉN GANG, PÅ SUMMEN — præcis som `opdelPoint` gør for spillet.
  // Gulvedes hver runde for sig, kunne en tabt Chancen i runde 5 forsvinde, og
  // ligaens total ville blive HØJERE end spillets for den samme kampe.
  return Math.max(0, Math.round(sum * 10) / 10);
}

/**
 * Har spilleren overhovedet et grundlag at regne på?
 *
 * `perRound` skrives af serveren, og en spiller, der ikke er genberegnet endnu,
 * har feltet slet ikke. Fladen skal kunne sige "ikke klar" i stedet for at
 * påstå, at spilleren har nul point — samme mønster som `opdeling` allerede har.
 */
export function harRundeVektor(perRound) {
  return Boolean(perRound && typeof perRound === 'object' && !Array.isArray(perRound));
}

/**
 * Kan runde-vektoren gengive spillets EGEN total?
 *
 * `harRundeVektor` spørger kun, om feltet findes. Det er ikke nok: en vektor,
 * der mangler hele runder — en spiller, der ikke er genberegnet, siden de
 * runder blev afgjort — består den prøve og bliver til et FOR LAVT ligatal
 * uden en eneste fejlbesked. Ligaen ville vise en spiller langt nede, som i
 * virkeligheden fører. Det er den tavse fejl, `klar: false` findes for.
 *
 * Prøven er gratis, fordi svaret allerede ligger på rækken: regnes vektoren
 * UDEN startrunde, skal den give spillets total. Gør den ikke det, mangler
 * der noget.
 *
 * TOLERANCE, IKKE LIGHED — og det er ikke slaskethed. Serveren afrunder ÉN
 * gang på summen (`opdelPoint`: `round1(raw + combi + pulje)`), mens vektoren
 * afrunder HVER runde for sig (`perRunde[k] = round1(...)`). De to tal må
 * derfor lovligt afvige op til 0,05 pr. runde — pointOpdeling.js siger det
 * selv. Med streng lighed ville en stor del af feltet stå som "ikke klar" af
 * ren afrunding, og vagten ville koste mere, end den fanger.
 *
 * Gabet, den SKAL fange, er af en anden størrelsesorden: en manglende runde
 * er hele point, ikke tiendedele.
 *
 * KENDT BLIND VINKEL: gulvet. Er både spillets og vektorens sum negativ,
 * gulves begge til 0 og ser ens ud, uanset hvad der mangler. Det kræver en
 * spiller i minus, som stillingen alligevel viser som 0.
 *
 * @param {object|null} perRound
 * @param {number} spilTotal   serverens `totalPoints` for samme spiller
 * @param {number} puljeBonus  players/{uid}.bonusPoints
 * @returns {boolean}
 */
export function vektorStemmer(perRound, spilTotal, puljeBonus = 0) {
  if (!harRundeVektor(perRound)) return false;
  const total = Number(spilTotal);
  if (!Number.isFinite(total)) return false;
  // Én afrunding pr. nøgle, plus én for serverens egen. `1e-9` er
  // flydende-tal-støj, ikke slæk.
  const slaek = 0.05 * Object.keys(perRound).length + 0.05 + 1e-9;
  return Math.abs(ligaPoint(perRound, null, puljeBonus) - total) <= slaek;
}
