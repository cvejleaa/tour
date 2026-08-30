# Test Manager — hukommelse

## Faldgruber fundet ved mutationstest

- **`fakeDb.set(ref, data, {merge:true})` skelner ikke create fra update.**
  I `functions-platform/syncProviders.test.js` kaster `batch.update()` på et
  ukendt dokument-id (rigtigt — spejler ægte Firestore), men `batch.set()`
  med `merge:true` gør IKKE — den skriver bare op'et uanset om id'et findes.
  En kildekode-mutation, der bytter `batch.update(...)` til
  `batch.set(..., {merge:true})`, overlever derfor suiten fuldstændig, selv
  om kommentaren og commit-beskeden eksplicit hævder "aldrig set (kan ikke
  oprette kampe)". Årsagen: alle testede write-mål findes allerede i fakeDb'et
  (resolved id'er kommer fra `alle.map(m => m.id)`, så de findes pr.
  definition), så create-vs-update-skellet aldrig bliver testet i praksis.
  Findes samme mønster igen (en `never set()`-påstand), tjek om fakeDb'ets
  `set()` reelt fejler på et ukendt id — ikke bare om testen "består".
  (Set ved: Kickoff-synk, commit ef65a8a, `functions-platform/superligaSync.js`.)

- **En "andet gennemløb fanger X"-kommentar kan være ubevist, selv med
  grønne grænsetests.** `londonTilUtcMs` i `functions-platform/seedFootball.js`
  itererer to gange for at ramme BST/GMT-skiftedøgnet korrekt. Testens fire
  skiftedøgn-punkter (00:59 og 02:00 på begge sider af springet) rammer
  IDENTISK resultat med kun ét gennemløb — fjern den anden iteration, og
  ALLE tests forbliver grønne. Den reelle forskel ligger kun i det
  ikke-eksisterende/tvetydige klokkeslæt under selve spring-forward
  (01:00-01:59 lokal tid, som slet ikke findes i London den dag) — et
  interval testen bevidst undgår. Konklusion: algoritmens ekstra
  robusthed er ikke fejlbevist for de faktisk anvendte input (kampe spiller
  aldrig i det tvetydige vindue), men selve KODEKOMMENTARENS påstand
  ("andet gennemløb fanger skiftedøgnet") er ikke mutationsbevist af
  testsuiten som den står. Tjek næste gang: findes der et input, hvor
  fjernelse af en "sikkerheds-iteration" rent faktisk ændrer et testet
  resultat — ikke kun et teoretisk resultat.

- **En stub-provider i core-tests kan skjule, at den RIGTIGE provider-metode
  aldrig køres.** `syncKickoffsCore`-testene i `syncProviders.test.js`
  bruger en hånd-rullet `provider(fixtures)`-hjælper med sin egen
  `async hentKickoffs() { return fixtures; }` — den kalder ALDRIG
  `PROVIDERS.pulselive.hentKickoffs`. Zone-vagten
  (`kickoffTimezoneString !== 'Europe/London'` → kast) og null-kickoff-vejen
  i den ægte pulselive-provider er derfor 100 % udækket: fjern hele
  guard-blokken i `syncProviders.js`, og samtlige 453 tests forbliver
  grønne. Testdata (`testdata/pulselive-matches.json`) har rigelig
  `kickoffTimezoneString: "Europe/London"` at teste imod, men ingen test
  bruger det. Tjek næste gang en provider får en ny metode: findes der en
  test, der kalder PROVIDERS.<navn>.<metode> direkte — ikke kun kernen med
  en stub der omgår den?

- **`String(m.matchId)` overlever, hvis alle fixtures allerede leverer
  matchId som streng.** `functions-platform/syncProviders.js`, pulselive
  `hentLive` (commit 690829a): både `sourceKey: String(m.matchId)` i
  events-mapningen OG `stadigIGang: new Set(iGang.map((m) => String(m.matchId)))`
  kan hver for sig droppes ned til `m.matchId` uden at en eneste test fejler
  — 470/470 grønne. Årsagen: `testdata/pulselive-matches.json` gemmer
  matchId som JSON-STRENG (`"matchId": "2645195"`), og alle håndskrevne
  test-fixtures (`iGangAf('FirstHalf', '801')`, `matchId: '901'`) følger
  samme vane. `String()` på en streng er en no-op, så coercion-formålet
  ("rå tal/objekt fra kilden må ikke blive en anden Set/Map-nøgle end den
  tilsvarende streng-baserede docId-opslagsnøgle") er reelt ubevist.
  `hentFaerdige` og `hentKickoffs` har samme mønster, samme ubeviste status.
  Tjek næste gang en `String(felt)`-coercion tilføjes: findes der ÉT fixture
  (rå JSON eller håndskrevet), hvor feltet rent faktisk IKKE allerede er en
  streng?

- **En "ombryd ved cursor"-test kan bevise INDHOLDET uden at bevise CURSOR-
  POSITIONEN.** `BroadcastTab.jsx`s `wrapSelection`/`insertBlock` flytter
  cursoren efter en programmatisk tekstændring via
  `requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); })`
  (samlet i `flytCursor(el, pos)` ved commit 935e32d). Den eneste test, der
  rører denne kode (`BroadcastTabPlatform.test.jsx`, "ombryder den markerede
  tekst ved cursor — ikke for enden"), asserterer kun `ta.value` lige efter
  `fireEvent.click` — ALDRIG `ta.selectionStart`/`selectionEnd` efter rAF er
  kørt. Mutationstestet: at gøre `flytCursor` til en total no-op (`return;`
  som første linje) OG at hardkode `setSelectionRange(0, 0)` uanset `pos`
  overlever BEGGE med alle 19 tests i BroadcastTab*.test.jsx grønne. Desuden
  klikker INGEN test nogensinde på "Overskrift"/"Punktliste"
  (`insertBlock`-vejen), så både dens kald til `flytCursor` og dens
  null-el-gren (`if (!el) return;`) er 100 % udækket. Gapet er ikke nyt (det
  gamle duplikerede kode havde samme mangel), men det gør en fremtidig
  cursor-position-regression usynlig for suiten. Tjek næste gang: findes der
  en test, der læser `el.selectionStart`/`selectionEnd` (evt. efter
  `await new Promise(requestAnimationFrame)` eller `vi.useFakeTimers` +
  `vi.advanceTimersToNextFrame`) — ikke kun værdien af feltet?

- **En fake-db, der aldrig kaster på `undefined`, beviser intet om "UDELAD
  frem for undefined".** `functions-platform/syncXg.test.js` (xG-sweep,
  commit 7a1f8b1) har en kommentar og en test ("UDELADER en kamp med
  ubrugelige tal") der eksplicit begrunder guarden med, at Admin SDK KASTER på
  `undefined` i en batch uden `ignoreUndefinedProperties`. Men `fakeDb().batch().set()`
  i samme fil gemmer bare objektet ukritisk — den kaster aldrig. Testen
  bestod kun, fordi guarden (`Number.isFinite(r.xgHome) || …`) også styrer
  HVILKE id'er der overhovedet skrives, så en fjernet guard viste sig som en
  ekstra id i `db.skrevet`, ikke som et kastet undefined. Bevist konkret ved
  mutation: hvis man i stedet lader guarden stå, men TILFØJER et nyt felt til
  `batch.set(...)`-objektet, der kan være `undefined` (fx et ekstra
  metadata-felt fra provideren) uden selv at være guardet, forbliver alle 8
  tests grønne — fake'en opdager det aldrig. Tjek næste gang en kommentar
  påstår "Admin SDK kaster på undefined": lad fake-db'ens `set()` rent
  faktisk kaste, hvis noget felt i det skrevne objekt er `undefined` — ellers
  er påstanden kun dokumentation, ikke bevist.

- **En kernefunktions try/catch-grænse kan være helt udenfor testsuiten,
  hvis dens WRAPPER (her `functions-platform/index.js`s `onSchedule`-handler)
  ikke har en testfil overhovedet.** For xG-sweepet (commit 7a1f8b1) er hele
  begrundelsen for at flytte xG-hentning ud af minut-synken, at "en fejl i
  xG-hentningen ikke må stoppe facit-synken" — men det er index.js's
  `try { … } catch { st.fejl(...) }` omkring `syncXgCore`-kaldet, der bærer
  det løfte, og index.js har INGEN testfil (`index*test*` findes slet ikke,
  og det gælder også de ældre blokke: resultat- og standings-synken i samme
  sweep er lige så udækkede). Mutationsbevist: at pakke `provider.hentXg(...)`
  ind i et internt `try/catch` i `syncXgCore` selv (så fejlen ALDRIG når
  index.js's catch, og driftlog-alarmen derfor aldrig udløses) lader alle 8
  tests i `syncXg.test.js` forblive grønne — fordi ingen test nogensinde
  lader `hentXg` kaste. Samme blinde vinkel gælder driftlog-linjens PRÆCISE
  tal og gren (`manglede`, `skrevet`, `manglede-skrevet`, de tre `st.ok`/
  `st.advarsel`-grene i index.js) — ingen test læser den streng eller det
  `{xgMangler:…}`-objekt. Tjek næste gang nyt maskineri lægges i en
  `onSchedule`-handler: findes der overhovedet en testfil for wrapperen, og
  hvis ikke — findes der i det mindste en test på core-niveau, hvor
  afhængigheden (her provideren) KASTER, så man beviser at fejlen propagerer
  ud i stedet for at blive slugt et sted på vejen?

- **En provider-implementations FELT-PARSING kan være 100 % udækket, selvom
  kernen der kalder den er grundigt testet.** `syncProviders.js`s nye
  `superliga.hentXg` og `pulselive.hentXg` (commit 7a1f8b1) har hver deres
  URL-opbygning, JSON-sti (`xg.home`/`xg.away` hhv.
  `stats.expectedGoals`) og side-matching (`x.side.toLowerCase() === 'home'`).
  `syncProviders.test.js` har INGEN `hentXg`-tests overhovedet —
  `syncXg.test.js` tester kun `syncXgCore` med hånd-rullede fake-providers,
  der aldrig kalder den rigtige implementation. Mutationsbevist: at ændre
  feltnavnet i begge providers (`xg.home` → `xg.homeXXX`,
  `stats.expectedGoals` → `stats.expectedGoalsXXX`) — hvilket i produktion
  ville betyde xG ALDRIG bliver hentet for nogen kamp nogensinde — lader hele
  `functions-platform`-suiten (199 relevante tests) forblive grøn. Tjek næste
  gang en provider får en ny metode: findes der en test, der kalder
  `PROVIDERS.<navn>.<metode>` direkte med en fetchFn-stub, der returnerer et
  fixture i kildens ægte form — ikke kun kernen med en fake, der omgår hele
  parsing-laget? (Samme mønster som "stub-provider i core-tests" ovenfor,
  men her mangler den ægte providers test FULDSTÆNDIGT, ikke kun delvist.)

- **Et loft (`XG_LOFT`), hvis test-fixture bruger konstanten selv til at
  udlede sin egen størrelse, tester kun MEKANISMEN "slice til N", aldrig at
  N ER 30.** `functions-platform/superligaSync.test.js` (nej,
  `syncXg.test.js`) bygger sit loft-fixture som
  `Array.from({length: XG_LOFT + 7}, …)` — muterer man `XG_LOFT` til 0,
  fejler suiten (mekanismen virker), men muterer man den til et vilkårligt
  STORT tal (999999), forbliver alle 8 tests grønne, fordi fixturet vokser
  med konstanten. Den forretningsmæssige begrundelse i kommentaren ("30 er
  valgt så en fuld sæsons efterslæb hentes på under et døgn") er derfor
  ubevist af suiten — kun selve loft-mekanismen er det. Tjek næste gang et
  loft/en grænseværdi testes med `KONSTANT + n`-fixtures: findes der ét
  hardkodet tal i testen (uafhængigt af selve konstanten), der ville
  fange, hvis nogen ændrede den forretningsmæssige værdi ved et uheld?

## Mønster at genkende

Alle tre fund ovenfor deler samme form: en test, der ser ud til at dække en
invariant ("aldrig set", "andet gennemløb", "zone-vagt"), dækker i
virkeligheden kun DEN VEJ, testens fixtures rent faktisk rammer — ikke
invarianten selv. Spørg altid: hvilket konkret input ville denne kode-gren
faktisk blive nået af, og findes det input i noget fixture?

## `rundePile` (src/features/games/rundePoint.js) — pilen af samme vektor som rundetallet (aug. 2026)

- **En fjernet navne-tiebreak i sorteringen OVERLEVER.** `rundePile` sorterer
  `foer.sort((a, b) => (b.point - a.point) || a.navn.localeCompare(b.navn, 'da'))`.
  Fjernes `|| a.navn.localeCompare(...)` helt, forbliver ALLE 44 tests i
  `rundePoint.test.js` + `rundePointFlade.test.jsx` grønne — inkl. testen
  "uafgjort før runden giver SAMME previousRank til begge", som eksplicit
  handler om uafgjorte point. Årsagen: V8's `Array.prototype.sort` er stabil,
  og ingen fixture har to spillere med ens `point`, hvor INSERTIONS-
  rækkefølgen (som den stabile sort så falder tilbage på) afviger fra den
  alfabetiske. Testen beviser derfor kun, at ens point giver samme RANG-TAL
  (næste springer over) — ikke at rækkefølgen inden for et sådant tal er
  alfabetisk og ikke bare "den rækkefølge, arrayet kom ind i". De øvrige
  mutationer (fjern `udenRunde`, byt sorteringsretning, returnér `raekker`
  uændret, `previousRank: rank`, drop `startRunde`, `visRunde` hårdkodet
  false) blev alle dræbt af den samme suite. Tjek næste gang en
  rangerings-funktion har en eksplicit tiebreak "for stabil orden": byg et
  fixture med ens point OG insertions-rækkefølge, der er omvendt af
  tiebreak-feltets orden (fx sidste spiller i arrayet har det alfabetisk
  FØRSTE navn) — ellers er stabil sort en gratis (og usynlig) stand-in for
  tiebreaken.
- **Delta-vs-forfra-mutationen kræver et fixture, hvor de to metoder giver
  FORSKELLIG rangorden — og branchens eget fixture gør netop det korrekt.**
  `regn(perRound) − perRound[runde]` (den forbudte "delta"-genvej,
  kommenteret eksplicit i filen som forkert pga. 0-gulvet) blev testet med
  Anne `{5: -10, 6: 12}` / Bo `{5: -1, 6: 0.5}`: forfra giver begge 0 (delt
  1.-plads), delta giver Bo enegang på 1. pladsen. Mutationen dræbes
  præcis af denne test ("regner FORFRA af vektoren, ikke som total minus
  rundens point"), ikke ved en tilfældighed — bekræftet ved at genindføre
  delta-koden og se netop DENNE test fejle (og ellers ingen).
- **Pilens fravær (`toBeNull()`) i `rundePointFlade.test.jsx` er ikke
  vakuøs.** Alle `pil(navn)`-assertions med `toBeNull()` (Bibamus, Team
  Sharkey, Erik, Dorte) peger på spillere i LISTEN (rang 4+), aldrig på
  podiet (top 3, som aldrig viser pile) — efterprøvet ved at regne
  podiepladserne ud fra fixturets `totalPoints`/ligapoint. En fraværs-
  assertion på en podie-spiller ville have bestået uanset om `rundePile`
  virkede.
