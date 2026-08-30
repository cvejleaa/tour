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
 * KRONEN ER FORELØBIG. RUNDEKONGEN ER ENDELIG. De ligner hinanden og er det
 * ikke: rundeSejre.js kårer først, når HVER kamp i runden har facit
 * (faerdigeRunder), fordi en pokal ikke må skifte hånd hver dag. Kronen her
 * afgøres på det levende tal og flytter sig med vilje i løbet af weekenden —
 * man skal kunne se, man er ved at miste den, mens den sidste kamp spilles.
 * RET IKKE DEN ENE TIL DEN ANDEN. Forskellen er hele grunden til, at kronen
 * findes ved siden af pokalen.
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
 * Hvem bærer kronen? Sættet af uid'er med rundens højeste point.
 *
 * UAFGJORT DELES — to med samme tal får begge kronen. Alternativet, at ingen
 * får den, lader en kåring forsvinde netop når to var lige gode.
 *
 * NUL VINDER IKKE — ramte hele feltet forbi, er der ingen krone. Ellers ville
 * en runde, alle tabte, krone samtlige deltagere.
 *
 * EN MANGLENDE NØGLE ER IKKE NUL — den, der ikke er i runden, kan hverken
 * vinde kronen eller trække feltet ned. Følger af, at rundensPoint giver null.
 *
 * Regnes af det VISTE felt, fordi stillingen er liga-filtreret
 * (useVisibleGameStandings). Ellers ville kronen forsvinde for alle, fordi
 * vinderen står i en liga, man ikke deler.
 *
 * @returns {Set<string>} tom, hvis ingen kan bære den
 */
export function kronebaerere(raekker, runde) {
  if (runde == null) return new Set();
  let bedst = null;
  for (const r of raekker || []) {
    const p = rundensPoint(r, runde);
    if (p == null) continue;
    if (bedst == null || p > bedst) bedst = p;
  }
  // Nul vinder ikke. Gælder også negative tal: en tabt chance er ikke en sejr.
  if (bedst == null || bedst <= 0) return new Set();
  const ud = new Set();
  for (const r of raekker || []) {
    if (rundensPoint(r, runde) === bedst && r?.uid) ud.add(r.uid);
  }
  return ud;
}
