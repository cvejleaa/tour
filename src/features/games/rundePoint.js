/**
 * rundePoint.js — RUNDENS POINT I STILLINGEN, og kronen der følger med.
 *
 * Rene funktioner, ingen Firebase. Regner udelukkende af `perRound`, som
 * stillingen ALLEREDE har på hvert spillerdokument (gameStandings.js:32) —
 * derfor nul nye læsninger og intet behov for kampprogrammet.
 *
 * HVILKEN RUNDE. Den seneste, NOGEN i det viste felt har point fra. Ejeren har
 * valgt det LEVENDE tal frem for kun færdigspillede runder, med åbne øjne:
 * midt i en runde kan tallet vise en anden fører end den, runden ender med.
 * Prisen betales for at tallet er levende netop søndag aften, hvor folk kigger.
 *
 * Valget er ikke bare en smagssag. Totalen i rækken er i forvejen levende —
 * serveren skriver point pr. afgjort kamp — så et tal fra sidste færdigspillede
 * runde ville sætte to ure i samme række. Og Superligaens runde 3 strakte sig
 * 7. august til 3. september; "seneste FÆRDIGE runde" ville have vist en måned
 * gammel runde i en måned.
 *
 * FØRINGEN ER FORELØBIG. RUNDEKONGEN ER ENDELIG. De ligner hinanden og er det
 * ikke: rundeSejre.js kårer først, når HVER kamp i runden har facit
 * (faerdigeRunder), fordi en pokal ikke må skifte hånd hver dag. Føringen her
 * afgøres på det levende tal og flytter sig med vilje i løbet af weekenden —
 * man skal kunne se, man er ved at miste den, mens den sidste kamp spilles.
 * RET IKKE DEN ENE TIL DEN ANDEN. Forskellen er hele grunden til, at
 * markeringen findes ved siden af pokalen.
 *
 * HVORFOR IKKE ET UDREGNET DELTA. Man kunne fristes til "total minus total
 * uden runden". Det er FORKERT: både ligaPoint og opdelPoint gulver ved 0, så
 * de to tal er ikke lig rundens bidrag nær gulvet. Vi viser perRound[r] råt.
 */

/**
 * Den seneste runde, nogen i feltet har point fra.
 *
 * `UDEN_RUNDE` er ikke en runde — kampe uden rundenummer tæller altid med i
 * totalen, men kan ikke være "rundens" point. Der står IKKE en egen vagt for
 * den: `Number('uden')` er NaN, så `Number.isFinite` nedenfor kaster den ud.
 * En vagt mere ville være en anden vagt om samme regel, og den inderste kunne
 * så fjernes med grøn suite (husreglen "én vagt pr. sikkerhedsregel" — netop
 * det skete, da denne fil blev mutationstestet). I stedet er ANTAGELSEN
 * testet: en test asserterer, at Number(UDEN_RUNDE) ikke er et tal, så en
 * fremtidig ændring af nøglen bliver rød her og ikke tavs.
 *
 * Runder FØR ligaens startrunde findes ikke for den liga: en liga, der tæller
 * fra runde 20, må ikke vise runde 3 — så ville to venner i hver sin liga se
 * hvert sit tal for det samme og ikke kunne tale om det.
 *
 * @param {Array<{perRound?:object|null}>} raekker  det VISTE felt
 * @param {number|null} startRunde                  ligaens startrunde, hvis nogen
 * @returns {number|null}
 */
export function sidsteRunde(raekker, startRunde = null) {
  const gulv = Number.isFinite(startRunde) ? startRunde : null;
  let sidste = null;
  for (const r of raekker || []) {
    for (const noegle of Object.keys(r?.perRound || {})) {
      const n = Number(noegle);
      if (!Number.isFinite(n)) continue;
      if (gulv != null && n < gulv) continue;
      if (sidste == null || n > sidste) sidste = n;
    }
  }
  return sidste;
}

/**
 * Én spillers point i en bestemt runde — eller null for "ingen".
 *
 * NULL BETYDER "INGEN POINT I RUNDEN ENDNU", IKKE "DELTOG IKKE".
 * De to kan ikke skelnes, og det er ikke et valg: serveren springer nul-værdier
 * over, når vektoren bygges (functions-platform/pointOpdeling.js:339,
 * `if (!v) return;`). Den, der ramte ALT forbi, får derfor ingen nøgle og er
 * umulig at skelne fra den, der aldrig tippede.
 *
 * Vi viser dem ens frem for at gætte. Et synligt 0 hos den, der glemte at
 * tippe, ville være en anklage om noget andet, end der skete — og det er den
 * dyrere af de to fejl.
 */
export function rundensPoint(raekke, runde) {
  if (runde == null || !raekke?.perRound) return null;
  const v = raekke.perRound[String(runde)];
  const tal = Number(v);
  return Number.isFinite(tal) ? tal : null;
}

/**
 * Hvem fører runden? Sættet af uid'er med rundens højeste point.
 *
 * NAVNGIVET EFTER BETYDNINGEN, ikke efter symbolet. Fladen markerer dem med
 * 🔥 i dag; hed funktionen `kronebaerere`, ville et skift af tegnet efterlade
 * kroner i en kode uden kroner — præcis den navne-drift, opgave #36 findes
 * for. Symbolet vælges ÉT sted, i fladen.
 *
 * UAFGJORT DELES — to med samme tal fører begge. Alternativet, at ingen gør,
 * lader en kåring forsvinde netop når to var lige gode.
 *
 * NUL FØRER IKKE — ramte hele feltet forbi, er der ingen fører. Ellers ville
 * en runde, alle tabte, markere samtlige deltagere.
 *
 * EN MANGLENDE NØGLE ER IKKE NUL — den, der ikke er i runden, kan hverken
 * føre den eller trække feltet ned. Følger af, at rundensPoint giver null.
 *
 * Regnes af det VISTE felt, fordi stillingen er liga-filtreret
 * (useVisibleGameStandings). Ellers ville markeringen forsvinde for alle,
 * fordi den bedste står i en liga, man ikke deler.
 *
 * @returns {Set<string>} tom, hvis ingen fører
 */
export function rundeFoerende(raekker, runde) {
  if (runde == null) return new Set();
  let bedst = null;
  for (const r of raekker || []) {
    const p = rundensPoint(r, runde);
    if (p == null) continue;
    if (bedst == null || p > bedst) bedst = p;
  }
  // Nul fører ikke. Gælder også negative tal: en tabt chance er ikke en sejr.
  if (bedst == null || bedst <= 0) return new Set();
  const ud = new Set();
  for (const r of raekker || []) {
    if (rundensPoint(r, runde) === bedst && r?.uid) ud.add(r.uid);
  }
  return ud;
}

/** Vektoren UDEN én bestemt runde — grundlaget for "stillingen før runden". */
function udenRunde(perRound, runde) {
  const ud = {};
  for (const [k, v] of Object.entries(perRound || {})) {
    if (Number(k) === runde) continue;
    ud[k] = v;
  }
  return ud;
}

/**
 * Gen-tildel `previousRank`, så PILEN måler DEN VISTE RUNDE.
 *
 * HVORFOR DEN FINDES. Serverens `previousRank` er et øjebliksbillede, der kun
 * skrives, når en rundes KUPON er helt afgjort (gameScoring.js:557), og kun
 * én gang pr. runde (`snappedRounds` spærrer for gentagelser). Falder en runde
 * ud af den betingelse, bliver billedet stående, og pilen sammenligner mod
 * noget, der ligger FLERE runder tilbage.
 *
 * Det gik ubemærket, indtil rundens point kom på skærmen ved siden af pilen:
 * ejeren havde rundens næsthøjeste tal og en pil NED. Regnet på ligaens egne
 * tal var han slet ikke rykket. To tal om hver sin periode, side om side.
 *
 * Nu regnes pilen af SAMME vektor som rundetallet: rangen efter totalen uden
 * rundens bidrag, på den skala der vises. Så betyder pil og tal altid det
 * samme — også under et liga-filter, hvor de før kunne betyde hver sit.
 *
 * IKKE `total − perRound[runde]`. Både ligaPoint og opdelPoint lægger gulvet
 * ved 0 PÅ SUMMEN, så et delta er forkert nær gulvet. Før-totalen regnes
 * derfor forfra af vektoren, præcis som ligaRanking allerede gør det.
 *
 * En spiller uden vektor får `previousRank: null` — ingen pil, frem for en
 * falsk en. Samme valg som subsetRanking træffer for en ny spiller.
 *
 * @param {Array<object>} raekker    rangeret stilling (rank er allerede sat)
 * @param {number|null} runde        den viste runde
 * @param {number|null} startRunde   ligaens startrunde, hvis nogen
 * @param {(perRound, startRunde, bonus) => number} regn   ligaPoint
 * @param {(perRound) => boolean} harVektor                harRundeVektor
 */
export function rundePile(raekker, runde, startRunde, regn, harVektor) {
  if (runde == null) return raekker || [];
  const foer = [];
  for (const r of raekker || []) {
    if (!harVektor(r?.perRound)) continue;
    foer.push({
      uid: r.uid,
      navn: r.name || '',
      point: regn(udenRunde(r.perRound, runde), startRunde, r.bonusPoints || 0),
    });
  }
  // Samme sortering og uafgjort-regel som stillingen selv: ens point giver
  // ens placering, og næste springer over. Ellers ville pilen bruge en anden
  // rangorden end den, tallene ved siden af er sorteret efter.
  foer.sort((a, b) => (b.point - a.point) || a.navn.localeCompare(b.navn, 'da'));
  const rang = new Map();
  let r = 0;
  let forrige = null;
  foer.forEach((x, i) => {
    if (x.point !== forrige) { r = i + 1; forrige = x.point; }
    rang.set(x.uid, r);
  });
  return (raekker || []).map((row) => ({
    ...row,
    previousRank: rang.has(row.uid) ? rang.get(row.uid) : null,
  }));
}
