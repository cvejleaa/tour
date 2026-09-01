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
 * BEGGE SPØRGSMÅL TÆLLER. PL har både top (4) og bund (3); Superligaen kun
 * top. Første udgave regnede kun toppen, og for PL kunne vinderen dermed
 * blive udråbt FORKERT og med et for lavt tal (Security-fund). Serveren
 * skriver `points`/`correct` for toppen og `nedPoints`/`nedCorrect` for
 * bunden hver for sig; udbyttet er summen (gameScoring.js). `rigtige` og
 * `point` her er derfor altid SUMMEN over begge spørgsmål — for et spil uden
 * bund er bund-delen 0.
 *
 * @param {Array} bets  alle spillets tip
 * @param {Array<{uid:string, name:string}>} medlemmer ligaens spillere, med navn
 * @param {{top:Set|string[], bund?:Set|string[]|null}} facit holdene der står der
 * @param {{antal:number, perTeam:number, perfectBonus:number, nedSize?:number}} valg
 * @param {boolean} afgjort brug serverens tal i stedet for at regne
 */
export function puljeRangliste(bets, medlemmer, facit, valg, afgjort = false) {
  const tipAf = new Map((bets || []).map((b) => [b.uid, b]));
  const topFacit = facit?.top ?? [];
  const bundFacit = facit?.bund ?? null;
  const nedSize = Number(valg?.nedSize) || 0;
  return (medlemmer || []).map((m) => {
    const tip = tipAf.get(m.uid) || null;
    if (!tip) return { uid: m.uid, navn: m.name, tippede: false, rigtige: null, point: null };
    let rigtige; let point;
    if (afgjort) {
      rigtige = (Number(tip.correct) || 0) + (Number(tip.nedCorrect) || 0);
      point = (Number(tip.points) || 0) + (Number(tip.nedPoints) || 0);
    } else {
      const top = puljeScore(tip.championship, topFacit, valg);
      const bund = nedSize > 0 && bundFacit
        ? puljeScore(tip.relegation, bundFacit, { ...valg, antal: nedSize })
        : { correct: 0, points: 0 };
      rigtige = top.correct + bund.correct;
      point = top.points + bund.points;
    }
    return {
      uid: m.uid, navn: m.name, tippede: true, rigtige, point,
      picks: Array.isArray(tip.championship) ? tip.championship : [],
    };
  }).sort((a, b) => {
    // ÉN VAGT: uden tip altid sidst — ellers ville de ligge blandt dem med 0
    // rigtige, og de to tilstande ville se ens ud i rækkefølgen. Første udgave
    // havde DESUDEN `?? -1` i talsammenligningen, som gjorde nøjagtig det
    // samme; så kunne denne linje fjernes med grøn suite.
    if (a.tippede !== b.tippede) return a.tippede ? -1 : 1;
    // Point først: det er udbetalingen (perfekt-bonus tæller). Rigtige som
    // tie-break, så to med samme point ikke bytter plads tilfældigt; navn
    // sidst. To UDEN tip lander også her: null - null er 0, så de falder
    // igennem til navnet — en særskilt gren for dem var en ækvivalent
    // mutation væk (Test Manager-fund) og er fjernet.
    return (b.point - a.point) || (b.rigtige - a.rigtige) || a.navn.localeCompare(b.navn, 'da');
  });
}

/**
 * Vinderen, når puljen er afgjort — sæsonens udbetaling.
 *
 * Puljen afregnes ÉN gang på otte måneder, og planen behandlede først det
 * øjeblik som en tekstrettelse (Spilfører-fund). Ved delt førsteplads
 * navngives alle: en delt sejr er stadig en sejr.
 *
 * Kåres på POINT, ikke på rigtige: pointene ER udbetalingen, og perfekt-
 * bonussen kan skille to med samme antal rigtige.
 *
 * Returnerer null, når ingen har tippet, eller ingen har point.
 */
export function puljeVindere(raekker) {
  const med = (raekker || []).filter((r) => r.tippede);
  if (!med.length) return null;
  const bedst = Math.max(...med.map((r) => r.point ?? 0));
  if (bedst <= 0) return null;
  return med.filter((r) => (r.point ?? 0) === bedst);
}
