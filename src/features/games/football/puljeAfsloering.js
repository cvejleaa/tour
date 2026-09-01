// ---------------------------------------------------------------------------
// Puljens afsløring — den rene regnedel.
//
// Reglerne har siden længe tilladt, at deltagerne ser hinandens pulje-tip
// EFTER deadline (firestore.rules, puljeBets), men ingen klient brugte det:
// puljen var et solo-væddemål, og reveal-øjeblikket var bygget uden aftager.
//
// Alt her er RENT. Komponenten henter dokumenterne og tegner; tallene regnes
// her, så de kan efterprøves uden at rendere noget.
// ---------------------------------------------------------------------------

import { puljeScore } from '../../../lib/superligaScoring';

/**
 * Er puljen AFGJORT, eller viser vi stadig "lige nu"?
 *
 * ÉN KILDE, ALDRIG TO. Klientens `facit` kræver kun, at tabellen er komplet;
 * serverens `settlePuljeBets` self-guarder på, at ALLE kampdokumenter har mål
 * (gameScoring.js). De to kan være uenige — og så ville facit-kortet vise
 * "0/6 rigtige · +0" mens listen lige nedenunder sagde "4 af 6" for samme
 * spiller (QC-fund). Serveren afregner hele feltet i én omgang, så
 * `correct` på ALLE dokumenter er det ærlige signal: enten er alt afgjort,
 * eller også er intet det.
 *
 * Tomt felt er IKKE afgjort. `[].every()` er sand, og uden vagten ville en
 * tom liste blive kaldt endelig.
 */
export function erAfgjort(bets) {
  const liste = bets || [];
  return liste.length > 0 && liste.every((b) => Number.isFinite(b?.correct));
}

/**
 * Hvor mange har valgt hvert hold — regnet på HELE spillet.
 *
 * IKKE på liga-fællerne. "Alene om Vejle" blandt fem liga-fæller er
 * statistik, ikke en bedrift — og kan være direkte forkert, hvis tre i en
 * anden liga også har Vejle (Spilfører-fund). Klienten læser alligevel hele
 * samlingen, så aggregatet koster nul ekstra.
 *
 * `enesteUid` sættes kun, når præcis ÉN har valgt holdet — kalderen afgør,
 * om navnet må vises (liga-fælle) eller det skal hedde "kun én spiller".
 *
 * @param {Array<{uid:string, championship?:string[]}>} bets alle spillets tip
 * @param {Array<{name:string}>} teams spillets hold
 */
export function holdTilslutning(bets, teams) {
  const antal = new Map();
  const eneste = new Map();
  for (const b of bets || []) {
    // Sæt, ikke liste: et dublet-hold i ét tip må ikke tælle to gange.
    for (const navn of new Set(Array.isArray(b?.championship) ? b.championship : [])) {
      antal.set(navn, (antal.get(navn) || 0) + 1);
      // INGEN VAGT HER — den hører ét sted, og det er antal-tjekket nedenfor.
      // `eneste` LÆSES kun, når præcis én har valgt holdet, og så har netop
      // én iteration skrevet til den: "første" og "sidste" er samme person.
      // En `if (!eneste.has(navn))` ville derfor være en ækvivalent mutation
      // væk fra ingenting — prøvet, og den kunne ikke gøres rød. Første udgave
      // nulstillede desuden her ved antal > 1, hvilket gjorde antal-vagten til
      // død kode; samme form som husets `if (!dryRun)`-lektie.
      eneste.set(navn, b.uid);
    }
  }
  return (teams || []).map((t) => ({
    navn: t.name,
    antal: antal.get(t.name) || 0,
    enesteUid: antal.get(t.name) === 1 ? eneste.get(t.name) : null,
  })).sort((a, b) => b.antal - a.antal || a.navn.localeCompare(b.navn, 'da'));
}

/**
 * Ranglisten for ÉN liga — aldrig for unionen af mine ligaer.
 *
 * En rangliste på unionen matcher INGEN ligas stilling. Den fejl er sket før:
 * et bot-opslag påstod, at én førte med 40 point, mens ligaens egen stilling
 * viste en anden i spidsen (gameRecap.js). Kalderen vælger derfor præcis én
 * liga, og listen skæres mod dens medlemmer.
 *
 * "TIPPEDE IKKE" ER IKKE "0 RIGTIGE". Fravær af et dokument er noget andet
 * end et dårligt tip, og de to må ikke se ens ud på skærmen. De uden tip
 * lægges sidst, uanset sortering.
 *
 * @param {Array<{uid:string, championship?:string[], correct?:number, points?:number}>} bets
 * @param {Array<{uid:string, name:string}>} medlemmer ligaens spillere, med navn
 * @param {Set<string>|string[]} facitHold holdene der står der (lige nu eller endeligt)
 * @param {{antal:number, perTeam:number, perfectBonus:number}} valg
 * @param {boolean} afgjort brug serverens `correct`/`points` i stedet for at regne
 */
export function puljeRangliste(bets, medlemmer, facitHold, valg, afgjort = false) {
  const tipAf = new Map((bets || []).map((b) => [b.uid, b]));
  return (medlemmer || []).map((m) => {
    const tip = tipAf.get(m.uid) || null;
    if (!tip) return { uid: m.uid, navn: m.name, tippede: false, rigtige: null, point: null };
    const s = afgjort
      ? { correct: tip.correct, points: tip.points }
      : puljeScore(tip.championship, facitHold, valg);
    return {
      uid: m.uid,
      navn: m.name,
      tippede: true,
      rigtige: Number(s.correct) || 0,
      point: Number(s.points) || 0,
      picks: Array.isArray(tip.championship) ? tip.championship : [],
    };
  }).sort((a, b) => {
    // ÉN VAGT: uden tip altid sidst — ellers ville de ligge blandt dem med 0
    // rigtige, og de to tilstande ville se ens ud i rækkefølgen. Første udgave
    // havde DESUDEN `?? -1` i talsammenligningen, som gjorde nøjagtig det
    // samme; så kunne denne linje fjernes med grøn suite. Efter vagten er
    // begge `tippede`, og `rigtige` er derfor et tal for dem begge.
    if (a.tippede !== b.tippede) return a.tippede ? -1 : 1;
    if (!a.tippede) return a.navn.localeCompare(b.navn, 'da');
    return (b.rigtige - a.rigtige) || a.navn.localeCompare(b.navn, 'da');
  });
}

/**
 * Vinderen, når puljen er afgjort — sæsonens udbetaling.
 *
 * Puljen afregnes ÉN gang på otte måneder, og planen behandlede først det
 * øjeblik som en tekstrettelse (Spilfører-fund). Ved delt førsteplads
 * navngives alle: en delt sejr er stadig en sejr.
 *
 * Returnerer null, når ingen har tippet, eller ingen har point.
 */
export function puljeVindere(raekker) {
  const med = (raekker || []).filter((r) => r.tippede);
  if (!med.length) return null;
  const bedst = Math.max(...med.map((r) => r.rigtige ?? 0));
  if (bedst <= 0) return null;
  return med.filter((r) => (r.rigtige ?? 0) === bedst);
}
