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

## `maalModXg`/xG på kampkort + holdside (commit 57a5221, aug. 2026)

- **`m.result &&` i kampkortets xG-vagt kan fjernes helt uden at én test
  fejler.** `FootballTip.jsx:692` gater xG-linjen på
  `m.result && typeof m.xgHome === 'number' && Number.isFinite(...)`. Ingen
  fixture i `tipPil.test.jsx` sætter `xgHome`/`xgAway` på en kamp UDEN
  `result` — så den branch, der forhindrer en xG-linje på en endnu ikke
  afgjort kamp (fx et facit, der er fortrudt/ryddet, mens xG-feltet stadig
  ligger tilbage — "hvad hvis handlingen fortrydes igen"), er 100 % udækket.
  Mutationsbevist ved at fjerne `m.result &&` — alle 11 tests forblev grønne.
- **`typeof m.xgHome === 'number'` er redundant ved siden af
  `Number.isFinite(m.xgHome)` — men det er IKKE symmetrisk med den anden
  vagt.** `Number.isFinite` afviser (per spec) alt, der ikke er af typen
  Number, FØR den tjekker finite — så `typeof === 'number' &&` bidrager intet
  ekstra, og fjernes det, forbliver alle tests grønne (bevist). Den vagt, der
  IKKE er redundant, er `Number.isFinite` selv: fjern DEN og behold kun
  `typeof`, og NaN/Infinity ville slippe igennem til `fmtDec`, hvor
  `Number(NaN) || 0` bliver til **"0,0"** — præcis den løgn, kode-kommentaren
  eksplicit forbyder ("aldrig 0,0 for et tal, vi mangler"). Ingen test sætter
  `xgHome: NaN`, så denne mutation overlever OGSÅ (bevist). To forskellige
  fund under samme linje: den ene halvdel er dødvægt, den anden er den reelle
  vagt og er udækket for sit eget canonical failure-case.
- **`XG_PROVIDERE` (`src/features/games/spilEvner.js:30`) har NUL direkte
  tests.** I modsætning til søskende-konstanterne `KICKOFF_PROVIDERE` og
  `RESULTAT_PROVIDERE` (som i `spilEvner.test.js` hver har en
  `[...SET].sort()).toEqual([...])`-test OG en games.mjs-spejlingstest),
  mangler `XG_PROVIDERE`/`harXg` helt i `spilEvner.test.js`. Den eneste
  dækning er indirekte via `FootballHelp`-guidens render-test i
  `xgFlade.test.jsx` (superliga→vist, 'ukendt'→skjult). Mutationsbevist:
  `XG_PROVIDERE = new Set(['pulselive','superliga','en-tredje-uden-hentXg'])`
  overlever HELE suiten (spilEvner.test.js + xgFlade.test.jsx +
  FootballHelp.test.jsx alle grønne) — den præcise "puljeLockRound"-fælde fra
  CLAUDE.md: en gate, der i dag tilfældigt matcher de rigtige providere (begge
  eksisterende har faktisk `hentXg` i `functions-platform/syncProviders.js`),
  men ingen paritetstest binder den dertil. `KICKOFF_PROVIDERE` har SAMME
  mangel på den ægte server-parity (ingen test i `functions-platform` binder
  den til `hentKickoffs`-tilstedeværelse) — det er altså et eksisterende,
  bredere hul, ikke noget denne ændring alene indførte, men `XG_PROVIDERE`
  mangler oveni den simple set-indholds-test, søskende-konstanterne HAR.
- **En betinget "mangler-data"-sætning i UI-teksten kan mangle sin negative
  gren.** `HoldSide.jsx:185-187`: `xgTal.kampe < xgTal.spillede ? "...holdet
  har spillet X kampe..." : '.'`. Ingen test bekræfter, at teksten IKKE viser
  "holdet har spillet X kampe"-sætningen, når `kampe === spillede` (intet
  data mangler). Mutationsbevist: hardkoder man betingelsen til `true` (så
  advarslen ALTID vises, også når intet mangler), forbliver alle 10 tests i
  `xgFlade.test.jsx` grønne.
- **To fraværs-tests for det forbudte ordforråd (`FORBUDTE`) er trivielt
  grønne, hvis HELE kortet forsvinder.** Både 'ingen dom om kampen'
  (`tipPil.test.jsx`) og 'fælder INGEN dom' (`xgFlade.test.jsx`) asserterer
  kun `not.toContain(ord)` på `document.body.textContent` — ingen positiv
  `toBeInTheDocument()` ved siden af. Mutationsbevist isoleret
  (`{false && xgTal && (...)`}`i HoldSide.jsx): kørt ALENE med `-t "fælder
  INGEN dom"` består testen trivielt (kortet renderes aldrig, så der er intet
  forbudt ord at finde). Kørt som HELE filen fanges mutationen dog af
  søskende-tests (4/10 fejler) — så det er ikke et blokerende hul i sig selv,
  men et skrøbeligt mønster: en fremtidig sletning af netop DENNE ene test
  (fx ved en "oprydning") ville ikke i sig selv gøre nogen anden test rød for
  akkurat dette scenarie. Tjek næste gang en forbudt-ordliste-test skrives:
  parr den altid med en positiv assertion i SAMME test, ikke kun i naboer.
- **De fire hjemme/ude-ombytninger i `maalModXg` (mål/imod/xg/xgImod) er
  ALLE fanget**, fordi testens fixture er bevidst asymmetrisk (AGF
  hjemme 2-0 / xG 1,4-0,7, AGF ude 1-3 / xG 0,9-2,2) — ingen af de fire felter
  har samme værdi hjemme og ude. God fixture-praksis, værd at genbruge:
  et symmetrisk fixture (fx samme scoreline hjemme og ude) ville have skjult
  alle fire.
- **Selve invarianten "begge kolonner samme kampe" ER mutationsbevist på
  rette lag.** At flytte `maal += …; imod += …;` til FØR xG-tjekket (så mål
  tælles for en kamp uden xG) fanges direkte af
  `holdStatistik.test.js`-testen "BEGGE tal dækker samme kampe" (6 mod
  forventet 2). Denne del af planens kernepåstand er altså bevist, i
  modsætning til de fund ovenfor.

## `livescoreHold.js` — kortlægning til livescore.com (commit 9d7c1fa, aug. 2026)

- **En 14-cifre-regex, der kun tester NEDRE grænse, lader ØVRE grænse
  overleve.** `kampNoegle`s `/^\d{14}$/`-vagt (`functions-platform/livescoreHold.js:81`)
  har et testbatteri (`livescoreHold.test.js` "afviser en tid, der ikke er 14
  cifre") med kun FOR KORTE/forkerte strenge (`''`, `null`, `undefined`,
  `'2026083119'` (10 cifre), `'20260831190000Z'`, `'abc'`) — ingen for LANG
  numerisk streng. Mutationsbevist: at bytte regex til `/^\d{14,30}$/` lader
  alle 10 tests i filen forblive grønne, fordi ingen fixture nogensinde giver
  en ren, udelukkende-cifret streng på 15+ tegn. Samme mønster som "et bånd,
  der rummer både før og efter" i CLAUDE.md, blot på strenglængde i stedet
  for et tal. Tjek næste gang en `{N}`-regex bruges som validering: findes
  der et REJECT-testtilfælde på begge sider af grænsen (for kort OG for
  langt), ikke kun den ene?
- **En redundant vagt, der er "dækket" af en senere falsy-check, kan fjernes
  ubemærket.** `livescoreKode`s guard `typeof kode !== 'string' || kode === ''`
  (linje 55) — fjern kun `|| kode === ''`, og funktionen returnerer `''`
  (fra `AFVIGER[''] || ''`) i stedet for `null` for tom streng. Alle 10 tests
  forbliver grønne, fordi INGEN test kalder `livescoreKode('')` direkte;
  den eneste vej er via `kampNoegle`, hvor `!h`/`!u` behandler `''` og `null`
  ens (begge falsy). Funktionens egen dokumenterede kontrakt
  (`@returns {string|null}`) er dermed ubevist for netop det tilfælde, JSDoc'en
  nævner. Tjek næste gang en hjælpefunktion har en direkte unit-kontrakt
  ("returnerer X for tomt/ugyldigt input"): er der en test, der kalder
  funktionen SELV med det input — ikke kun en wrapper, der tilfældigvis
  behandler resultatet ens uanset hvad?
- **"Denne test er den vigtigste, fordi den dækker fald-tilbagen" holdt IKKE
  ved mutation — tjek altid selv, hvilken test der rent faktisk dør.**
  Påstanden var, at "de hold, tabellen IKKE nævner, har SAMME kode begge
  steder" (test 2) er vigtigst, fordi test 1 "bruger netop fald-tilbagen til
  sit opslag" og derfor ikke kan afsløre en fejl i den. Mutationsbevist er
  det MODSATTE: test 2 kalder ALDRIG `livescoreKode()` — den genberegner
  fald-tilbagen manuelt (`kode in AFVIGER` / rå `deres.has(kode)`). Muterede
  jeg selve funktionen (`return AFVIGER[kode] || (kode + 'X')` — en reel
  fald-tilbage-fejl), fejlede test 1 for fire hold (AGF, FCN, OB, ACH), mens
  test 2 forblev 100 % GRØN, fordi den aldrig ser funktionens output. Test 1
  er altså den, der reelt beviser fald-tilbagen i PRODUKTIONSKODEN; test 2
  beviser kun en DATA-invariant (at livescores egne koder for de 24 hold
  matcher vores rå tabel), uafhængig af om `livescoreKode` selv er korrekt
  implementeret — og er for den invariant redundant med test 1 ved ægte
  drift (livescore omdøber et hold rammes lige hårdt af begge). Test 3
  ("stadig en afvigelse") har sin egen unikke fangst: en fejlagtig
  AFVIGER-post, der peger et allerede-matchende hold over på et ANDET gyldigt
  livescore-hold (fx `OB: 'AGF'`), slipper forbi BÅDE test 1 og test 2, men
  fanges af test 3's `deres.has(vor)`-check. Konklusion: ranger aldrig
  tests efter et ræsonnement om hvad de "burde" dække — kør mutationen og
  se hvilken der rent faktisk bliver rød.
- **`ctx.skip()` er en bekræftet bedre mekanisme end `console.warn` + tidligt
  `return` for en netværksafhængig test.** Testet direkte i vitest 1.6.1:
  kalder man `ctx.skip()` i test-body'en (test skal modtage `ctx` som
  parameter), viser reporteren "N skipped" adskilt fra "passed" i selve
  sammendraget (`Tests  1 skipped (1)`) — synligt i selv den korte
  CI-hale, uden at nogen behøver læse hele loggen. `console.warn` + `return`
  giver derimod stadig "passed", og beskeden drukner (og forsvinder helt med
  `--silent`, som er husets DOKUMENTEREDE kommando for netop denne mappe).
  Bemærk dog: CI's `ci.yml`-job (`functions`) kører `npm test` UDEN
  `--silent` for `functions-platform` — så selve advarslen ER synlig i rå
  CI-logs. Problemet er ikke `--silent` i CI, men husets egen regel om
  ALDRIG at læse et grønt testoutput: en grøn CI-tjekmærke skjuler et skip
  lige så effektivt som `--silent` ville, fordi ingen åbner loggen når den
  er grøn. `ctx.skip()` retter det ved at gøre skippet synligt i selve
  PASS/FAIL-optællingen, ikke kun i logteksten.

## Live-målscorere på kampkortet (opgave #78, delopgave 5–7, commit f607272, sept. 2026)

- **En duplikeret hjælpefunktion, der genberegner den SAMME hjemme/ude-
  selvmåls-logik som en allerede mutationstestet komponent, kan selv være
  100 % udækket for netop den gren.** `FootballTip.jsx`s `MaalPost` (kortets
  synlige tekst) og `liveMaalOplaesning` (dens `aria-label`) har HVER SIN
  kopi af `g.hold === 'home' ? (g.selvmaal ? a.navn : h.navn) : (g.selvmaal ?
  h.navn : a.navn)`. `MaalPost`s udgave er solidt dækket — de GAMLE
  selvmåls-tests fra før udtrækningen ("viser SCORERENS EGET hold ved et
  selvmål", "vender også den anden vej") binder stadig den udtrukne
  komponent (mutationsbevist: fjernes selvmåls-grenen i `MaalPost`, fejler
  2 tests præcist). Men INGEN fixture i hele live-mål-testblokken
  (`FootballTip.test.jsx` linje ~713+) sætter `selvmaal: true` på et
  `LIVE_MAAL.maal`-element — mutationsbevist: at fjerne selvmåls-grenen i
  `liveMaalOplaesning` ALENE (`g.hold === 'home' ? h.navn : a.navn`, ingen
  selvmåls-check) lader ALLE 138 tests i filen forblive grønne. Mønster at
  huske: når en visning UDTRÆKKES og en NY, parallel sti (her: oplæsningen)
  genimplementerer samme forgrening i stedet for at kalde den fælles logik,
  arver den nye sti IKKE den gamle dækning — den skal bevises for sig selv.
  Mangler: en test i "kampen er i gang"-blokken med
  `liveMaal: { maal: [{ hold:'home', selvmaal:true, ... }], ... }`, der
  asserterer at aria-label nævner det MODSATTE holds navn (spejler den
  eksisterende `MaalPost`-test), og gerne også `', selvmål'`-mærket i samme
  streng.
- **En test, der importerer den ægte `pendingMatches` (ikke en stub) via en
  generisk fake-Firestore `where`-kæde, ER et reelt bevis for tidsvinduet —
  bekræftet ved mutation, ikke antaget.** `liveMaal.test.js`s
  `syncLiveMaalForSpil`-test bruger `fakeDb()`s `collection().doc().collection()`
  med en ægte `.where(felt,op,v)`-kæde (`medFiltre`), og kalder den RIGTIGE
  `pendingMatches` fra `superligaSync.js` — ikke en hånd-rullet stub, der
  omgår filtreringen (modsat det tidligere fundne pulselive-kickoff-mønster).
  Mutationsbevist: at fjerne den øvre kickoff-grænse i `pendingMatches`
  (`superligaSync.js:65`, `<=` mod `nowMs`) gør testen rød (den "fremtidige"
  kamp bliver forkert talt med). God præcedens at genkende: en fake, der
  implementerer den generiske Firestore-forespørgselssemantik i stedet for
  at stubbe SVARET, beviser rent faktisk kalderens brug af den.
- **`ud.forsoegt`-tællingen og batch-commit-vagten (`if (iBatch > 0)`) i
  `syncLiveMaalCore` er begge mutationsbeviste isoleret** (flyt
  `forsoegt += 1` til FØR `ukendte`-tjekket → rød; fjern `iBatch > 0`-vagten
  → rød på "skriver IKKE, når listen er uændret"-testen, som forventer
  `db.commits === 0`). Samme for stage-listens `if (valgte.some(...))`-vagt
  (gjort ubetinget → 3 tests røde, inkl. "intet stage-kald"-påstanden) og
  `liveMaalNiveau`s `d.forsoegt > 0 &&`-klausul (fjernet → testen for
  "intet forsøgt, kun ukendte, stadig ok" bliver rød).
- **`LIVE_BUDGET_MS`s selvtest ligner en tautologi, men er det kun delvist.**
  `expect(LIVE_BUDGET_MS).toBe(Math.floor(((LIVE_TIMEOUT_S*1000)*2)/3/SYNCED_GAMES.length))`
  genskriver KILDENS formel med hardkodet `2` og `3` direkte i testen (ikke
  udledt af en importeret konstant), så en ændring af selve brøken i kilden
  (`liveMaal.js:254`, fx til `1/2`) FANGES (mutationsbevist: testen bliver
  rød). Det, testen IKKE binder, er om `2/3` selv er den rigtige brøk — den
  tredje assertion (`LIVE_BUDGET_MS * SYNCED_GAMES.length <
  LIVE_TIMEOUT_S*1000`) er sand for enhver brøk under 1, så den
  forretningsmæssige begrundelse ("to tredjedele") er en påstand i
  kommentaren, ikke i testen. Lavere risiko end en ægte tautologi (en
  glemt/forkert opdatering af brøken FANGES stadig), men værd at kende
  mønsteret: en formel duplikeret ordret ind i testen beviser kun "kilden og
  testen er enige", ikke "værdien er den rigtige".
- **Racen mellem minut-synken (skriver `live`) og live-mål-jobbet (læser
  `live` via `pendingMatches`, skriver `liveMaal`) er sporet og er
  BEVIDST tolereret, ikke en fejl.** To sekvenser afprøvet i koden (ikke i
  testsuiten — dette er en analyse, ikke en kørt mutation): (1) hvis
  minut-synken ruller `live` videre til et nyt mål EFTER live-mål-jobbets
  `pendingMatches`-læsning, men FØR dets `batch.commit()`, skrives en
  `liveMaal`-liste, der er ét mål "bagud" ift. den friskeste `live` —
  præcis den tilstand, `liveMaalTilstand`s `bagud`-felt er bygget til at
  detektere og dæmpe (`FootballTip.jsx`: `--doed`-klassen), og ER
  mutationsbevist (`stillingAfListe`/`liveMaalTilstand`-testene). (2) Værre
  race: facit-skrivningen (`syncResultsCore`) SLETTER `liveMaal` samtidig
  med at den sætter `result` — lander live-mål-jobbets batch, der blev
  forberedt FØR facit landede, EFTER facit-commit'et, kan `liveMaal`
  genopstå på en allerede afgjort kamp. Dette er eksplicit forudset og
  dækket: testen "viser PRÆCIS én liste på en afgjort kamp med et efterladt
  liveMaal" (`FootballTip.test.jsx`) beviser, at klienten aldrig viser
  live-listen, når `result` er sat, uanset hvad der ligger i `liveMaal`
  (gaten er `liveScore()`, som returnerer `null` på facit — ikke fraværet af
  feltet). Konklusion: racen kan skrive et "forkert" (forældet) `liveMaal`-
  felt, men aldrig et forkert SKÆRMBILLEDE — begge sider af racen er
  dækket af eksisterende, mutationsbeviste tests. Ingen ny test krævet, men
  værd at vide, hvis feltet nogensinde læses et andet sted end
  `liveMaalTilstand`+`liveScore`-parret.
- **`DriftTab.jsx`s `TYPE_NAVN`-opslag har en fallback (`|| forventet.type`),
  så en ny, utestet nøgle (`livemaal`) højst viser den rå type-streng i
  stedet for det pæne navn — aldrig en fejl eller et skjult kort.** Ingen
  test i `DriftTab.test.jsx` dækker `TYPE_NAVN` for NOGEN nøgle (heller ikke
  de eksisterende `sweep`/`minut`/`kickoff`), så hullet er systemisk og ikke
  nyt for denne PR. Vurderet IKKE-blokerende. Bekræftet også: `livemaal`
  optræder bevidst IKKE i `forventede`-listen (samme udeladelse som `minut`,
  med samme begrundelse i kommentaren — "et fraværende minut-dokument er
  normalt", og live-mål er kun forventet på kampdage).

## Pulje-overskrift + låst pokal (commit 2046eb6, PR #201, sept. 2026)

- **Ni "røde" mutationer i commit-beskeden var alle reelt røde — men OR'et
  imellem dem havde en tiende, udokumenteret gren, der IKKE var det.**
  `PuljeTip.jsx:176`: `const laast = ikkeAabnet || locked;`. Suiten har to
  fixtures for `--laast`-klassen ("låst gitter" og "ÅBENT gitter"), men BEGGE
  bruger kun `puljeLockAt` sat (fortid hhv. fremtid) — ingen bruger
  `puljeLockAt: undefined` (den tredje, reelle tilstand: `ikkeAabnet`).
  Mutationsbevist: `const laast = locked;` (dropper `ikkeAabnet ||` helt)
  lader alle 18 tests forblive grønne. Den omvendte mutation
  (`const laast = ikkeAabnet;`, dropper `locked`) DØR på "låst gitter
  mærkes"-testen — så kun den ene gren af OR'et er dækket, præcis
  CLAUDE.md's "to grene skal dræbes hver for sig"-fælde, denne gang på et
  boolesk OR i stedet for en tekst-ternary. Reelt lavrisiko (et spil uden
  deadline sat viser næppe pokaler at dæmpe), men suiten beviser det ikke.
- **En CSS-"kontrakt-test", der kun regex-matcher SELEKTOR-TEKSTEN, beviser
  ikke at reglen VINDER i cascaden.** `PuljeTip.test.jsx`s sidste describe
  ("et LÅST felt dæmpes slet ikke") tjekker kun at strengen
  `.pulje-team--laast:disabled > * { opacity: 1; }` findes i `theme.css` —
  ikke at den rent faktisk overskriver `.pulje-team:disabled > *:not(.pulje-team__actual) { opacity: 0.55; }`.
  Verificeret empirisk med en ægte Chromium-instans (Playwright,
  `getComputedStyle`): specificiteten for `.pulje-team:disabled > *:not(...)`
  er (0,3,0) — tre klasse-niveau-selektorer (`.pulje-team`, `:disabled`,
  `:not(.pulje-team__actual)` tæller som sit arguments klasse) — mod
  `.pulje-team--laast:disabled > *`s (0,2,0). Den MERE specifikke 0.55-regel
  VINDER over 1.0-reglen for alt andet end pokalen (som allerede er undtaget
  af `:not()` i den første regel, uanset låst-tilstand). Reelt resultat:
  holdnavn og ✓-mærke forbliver dæmpet til 0.55 på et låst felt, selvom
  commit-teksten eksplicit hævder "ER TIPPET LÅST, DÆMPES INTET" — kun
  pokalen (som allerede var reddet af den FØRSTE regel) er upåvirket af
  hele `--laast`-tilføjelsen. `--laast`-klassen er dermed reelt en no-op i
  browseren for alt undtagen det, der allerede var løst. Ikke fundet af
  suiten, fordi jsdom-baserede tekst-match-tests strukturelt IKKE kan se
  cascade-specificitet — kommentaren i testfilen advarer endda selv om
  præcis dette ("Jsdom anvender ingen CSS"), men løsningen (regex på
  selektor-tekst) løser ikke det problem, den selv navngiver. Tjek næste
  gang en CSS-"kontrakt-test" hævder at én regel overskriver en anden:
  regn specificiteten af begge selektorer i hånden (klasser/pseudoklasser/
  attributter vs. id vs. elementer), eller verificér med en ægte browser
  (Playwright `getComputedStyle`) — en regex-match på selektor-TEKSTEN
  beviser kun at reglen EKSISTERER, aldrig at den VINDER.

## Eftergennemgang af #192/#193/0cf45e6 (livescore-nøgle, efterslæbere, mållinjer — sept. 2026)

Landet uden rollegennemgang efter ejerens beslutning. Fem NYE huller fundet ved
egen mutationstest, oven i ejerens egne (som alle var døde og forblev det):

- **`isChance` skiftede fra runde-scopet til tip-scopet UDEN at nogen test
  binder forskellen.** `FootballTip.jsx:637` gik fra
  `m.id === chanceMatchId` til `Number(bet?.chanceStake) > 0` netop for at en
  ⚡ på en efterslæber (kamp fra en anden runde, vist på denne) ikke skulle
  forsvinde fra kortet — kommentaren siger det eksplicit. Mutationsbevist: at
  sætte den TILBAGE til `m.id === chanceMatchId` lader alle 122 tests i
  `FootballTip.test.jsx` forblive grønne, fordi INGEN test sætter
  `chanceStake > 0` på en efterslæber-kamp og tjekker `match-card--chance`.
  Dette er den samme klasse fejl som ejerens egen produktionsfund ("point
  flytter sig ikke") — bare på Chance-badget i stedet for pointudregningen.
- **`activeRound`s fallback-loop (footballRounds.js, "faldt ALT ud som
  efterslæb") er UDEN DÆKNING, fordi dens eget testnavn lyver om fixturet.**
  Testen "falder tilbage til den rå regel, hvis ALT er efterslæb" bruger to
  runder, hvor INGEN kampe rent faktisk er efterslæbere (`efterslaebere()`
  returnerer `[]` for begge — bekræftet ved direkte kald). Første loop finder
  derfor en `naeste` uden filtrering, og fallback-loopet nås aldrig.
  Mutationsbevist: sletter man HELE fallback-blokken (10 linjer), forbliver
  alle 52 tests i `footballRounds.test.js` grønne. Samme mønster som CLAUDE.md's
  "en test uden data beviser ingenting" — bare med et testnavn, der aktivt
  påstår det modsatte af, hvad fixturet gør.
- **Ental/flertal i `combi-efterslaeb`-teksten har kun sin ENTAL-gren
  dækket.** `FootballTip.jsx:614-618` har tre ternary-grene
  (`efterslaeb.length === 1 ? … : …`), men ALLE tests bruger et fixture med
  netop ÉN efterslæber (`UGE`-fixturet har kun `'udsat'`). Mutationsbevist:
  hardkoder man alle tre ternaries til deres ental-gren (fjerner flertals-
  grenen helt), forbliver alle 122 tests grønne. Præcis den faldgrube CLAUDE.md
  nævner eksplicit ("to grene skal dræbes hver for sig").
- **Badge-farven (`kind: 'err'`/`'ok'`) på "Synk kampdetaljer nu"-beskeden er
  UDEN DÆKKELSE — for HELE feltet, ikke kun den ændrede del.**
  `GameScheduleTab.jsx` linje ~400: `kind: (d.uparsede || d.ukendte) ? 'err' :
  'ok'`. Denne ændrede sig i #192 (`uenige` blev fjernet fra betingelsen — en
  ukoblet kamp skal stadig give rødt, en uenig ikke). INGEN test i
  `GameScheduleTab.test.jsx` læser `badge--red`/`badge--green` for
  kampdetalje-synken overhovedet. Mutationsbevist to gange: at fjerne
  `d.ukendte` fra betingelsen OG at hardkode `kind: 'ok'` uanset input
  overlever BEGGE alle 70 tests.
- **Mållistens DOM-STRUKTUR (0cf45e6) er delvist bundet — label-til-liste-
  forældreskabet er det ikke.** Commit-beskeden begrunder linjeskiftet med, at
  "Mål"-labelen skal stå INDE i samme `.match-card__maal-liste`-blok som
  posterne (ellers bliver den ikke venstrestillet på linje med dem — CSS,
  ikke testbart direkte). Men DOM-*strukturen* (er label et BARN af
  `.match-card__maal-liste`, eller en SØSKENDE uden for den?) ER testbar i
  jsdom og er det ikke: at flytte labelen til at være søskende af
  `.match-card__maal-liste` i stedet for dens første barn lader testen
  "viser stillingen EFTER hvert mål" (og alle andre) forblive grøn — kun
  antal `.match-card__maal-post` og fravær af "·" er bundet, ikke selve
  parent/child-forholdet, som er halvdelen af den visuelle påstand.

Alle fem blev rapporteret som ikke-blokerende observationer, IKKE fjernet
eller rettet af Test Manager selv (rollen retter ikke kode). Genkendelses-
mønster for #2: et testnavn, der beskriver et scenarie ("ALT er efterslæb"),
skal efterprøves ved at KALDE funktionen, funktionen selv afhænger af
(`efterslaebere()` her), ikke antages ud fra navnet.

## `kortlaegEids`/`liveMaalAf` — Eid på kampdokumentet + regnedelen til live-mål (delopgave 2-4, opgave #78, commit f398627, sept. 2026)

- **En guard, der har en NAVNESØSTER i naboFUNKTIONEN med sin egen test, er
  ikke selv testet, bare fordi navnet/formen går igen.** `kortlaegEids`s
  `if (noegler.size === 0) return ud;` (`kampDetaljer.js:542`) er en direkte
  kopi af samme linje i `syncKampDetaljerCore` (linje 677, DÉR dækket af
  "kilden svarede, men uden kampe"-testen). Ingen af `kortlaegEids`s syv egne
  tests lader `fetchFn`/stage-svaret give et TOMT `Events`-array — alle bruger
  enten `fakeFetch()` (ét event) eller en medgivet `noegler`-Map. Mutationsbevist:
  fjern linjen ALENE fra `kortlaegEids` → 950/950 stadig grønne. Tjek næste
  gang to funktioner deler en linje/vagt ved copy-paste: har BEGGE deres eget
  fixture, der rammer den — eller "arver" den ene bare naboens grønne test?
- **Et `.sort()` efter en løkke, der SAMLER hændelser i naturlig gennemløbs-
  rækkefølge, kan være udækket, selv når fixturet har flere elementer.**
  `liveMaal.js:74`, `annullerede.sort((a,b) => a.minut - b.minut)`. Den eneste
  test med TO annullerede mål ("en giftig post kaster ikke ud af regnedelen")
  bygger den anden ved `gift.Incs['1'].push(...)` — dvs. TILFØJER den efter
  den eksisterende i samme array, så `fladeHaendelser`s gennemløb (som
  bevarer indsætningsrækkefølgen) allerede leverer dem i stigende minuttal
  UDEN sortering. Mutationsbevist: fjern `.sort()`-linjen helt → 950/950
  grønne. Hullet er reelt (en kilde, der leverer et sent VAR-opslag FØR et
  tidligere i samme array, ville vise dem i forkert rækkefølge), men ingen
  test tvinger `unshift`/omvendt indsættelsesrækkefølge. Tjek næste gang en
  `.sort()` står efter en `push`-løkke: er der et fixture, hvor kilde-
  rækkefølgen allerede er "forkert" (sidste kommer først), ikke kun hvor der
  er flere end ét element?
- **En NY testfil, der genbruger et gammelt, committet fixture, lukker ikke
  automatisk gamle huller i den funktion, den kalder igennem.** `liveMaal.js`
  kalder `maalAf` (fra `kampDetaljer.js`, urørt af denne PR), og
  `liveMaal.test.js` bruger PRÆCIS samme `livescore-kampe.json`-fixture som
  `kampDetaljer.test.js` allerede gjorde. `maalAf`s dedup-linje
  (`kampDetaljer.js:315`: `if (!gl || (gl.scorer == null && kand.scorer !=
  null)) set.set(...)`) har en "erstat, hvis den gamle mangler scorer, men den
  nye har en"-gren, som INGEN test i nogen af filerne rammer — hverken den nye
  eller den gamle. Mutationsbevist: forenkl linjen til kun `if (!gl)
  set.set(...)` (dropper erstatnings-grenen helt) → 950/950 grønne,
  liveMaal.test.js's egne "container"/"annulleret"-tests inklusive. Ikke
  introduceret af denne PR (funktionen er urørt), men værd at kende: et nyt
  testfil, der arver et gammelt fixture, arver IKKE automatisk det gamle
  fixtures teoretiske dækning af en funktion længere nede i kaldekæden — kun
  det, testens EGNE assertions rent faktisk låser fast.
- **En "én vagt pr. skrivesti"-test på to literal-arrays kan være en ren
  tautologi, hvis den ene liste endnu ikke har en forbruger.**
  `liveMaal.test.js`s sidste describe ("LIVE_SKRIVBARE — én vagt pr.
  skrivesti") asserterer kun at to hardkodede arrays (`LIVE_SKRIVBARE` i
  `liveMaal.js` og `SKRIVBARE_FELTER` i `kampDetaljer.js`) ikke overlapper.
  Bekræftet ved grep: `LIVE_SKRIVBARE` bruges INGEN steder i ikke-test-kode —
  ingen funktion plukker felter af den til en `batch.update`, som
  `kampDetaljer.js`s egen "rører ALDRIG et forbudt felt"-test gør for
  `SKRIVBARE_FELTER` (den ægte vagt: læser `db.skrevet[].felter`-NØGLERNE og
  slår dem op i listen). Testen beviser derfor kun, at to strengarrays som
  skrevet i dag ikke deler et element — intet om at en fremtidig skriver
  rent faktisk vil overholde grænsen. Når skriveren (delopgaven, der bruger
  `LIVE_SKRIVBARE`) lander, skal den have SIN EGEN indholds-test, parallel til
  `kampDetaljer.test.js`s "rører ALDRIG et forbudt felt i en skrivning" — ikke
  antage at nærværende test allerede dækker den. Tjek næste gang en "frossen
  liste, der endnu ikke har en skriver" får sin egen indholds-test: grep om
  listen konsumeres af noget, der rent faktisk skriver til en `batch`/`set` —
  ellers er testen kun en fastfrysning af to litteraler, ikke et bevis om
  adfærd.
- **`eidForKamp`s `noegler.get(n) || null` overlever en `?? null`-mutation —
  men det er en ÆKVIVALENT mutation, ikke et hul.** `noegler` bygges udelukkende
  af `hentNoegler`, som kun gemmer id'er der bestod `/^\d{1,12}$/` (mindst ét
  ciffer) — en tom streng kan derfor aldrig ligge som værdi i Map'en, og
  `undefined` (manglende nøgle) opfører sig ens under begge operatorer. Modsat
  de øvrige fund her: ingen ny test bør kræves, fordi der ikke findes noget
  input i produktionens datavej, der kan skelne dem. Nævnt for kontrast til de
  andre fund i dette afsnit — ikke alle overlevende mutationer er huller.
- **Et cachet id, der er GYLDIGT FORMET men ikke længere findes hos KILDEN, har
  hverken test eller fallback — vurderet reelt, ikke blokerende.**
  `eidForKamp` (`kampDetaljer.js:498`) returnerer `data.livescoreEid`, så snart
  `gyldigEid()` er sand, uanset om id'et stadig er gyldigt hos livescore. Sker
  det (kilden reindekserer/fjerner en kamp), vil `hentJson('incidents/soccer/
  {gammelt-eid}')` få et ikke-ok svar, og koden tæller det som `utilgaengelige`
  — samme kategori som "kilden var nede" — der if. `detaljeNiveau`s kommentar
  "retter sig selv". Det gør den IKKE her: uden en fallback til nøgle-opslag
  ville kampen stå i den advarsels-kategori for evigt. Intet fixture i
  `kortlaegEids`- eller `syncKampDetaljerCore`-testene sætter et gyldigt-formet
  men opdigtet `livescoreEid` og lader `incidents`-kaldet fejle. Minimumstest,
  hvis det skal lukkes: `data:{livescoreEid:'999999999999'}` (12 ciffer,
  aldrig i fixturet) + `fetchFn`, der svarer `ok:false` KUN på det Eid → forvent
  enten `utilgaengelige` (dokumentér som bevidst) eller en ny fallback-gren.

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

## `selvmaal` — IT=39 mærkes rødt på kampkortet (commit 218373b, sept. 2026)

- **En committet fixture kan allerede dække en NY gren, uden at nogen
  assertion bruger det.** `functions-platform/fixtures/livescore-kampe.json`
  (valgt på "kode-dækning", ifølge filens egen docstring) indeholder allerede
  et ægte IT=39-selvmål (Eid 1793566, CRY–MCI, minut 56, `Nm:1`, scorer
  Donnarumma) — det blev IKKE hentet til denne ændring, det lå der i forvejen
  (brugt af en helt anden test, om manglende tilskuertal). Kørt manuelt
  gennem `detaljerAf` giver det `selvmaal: true` korrekt, men INGEN testfil
  asserterer på det — hele selvmåls-dækningen i `kampDetaljer.test.js` bruger
  håndbyggede events. Når en fixture-fil hævder at være valgt på
  kode-dækning, så tjek ved hver ny gren om fixturen allerede INDEHOLDER et
  eksempel (grep/parse den rå JSON for hændelseskoden), før du konkluderer at
  den mangler — og læg en assertion på det ægte tilfælde, ikke kun det
  håndbyggede.
- **Mutationer, der DØDE (egen kørsel, bekræftet):** `selvmaal: h.IT === X`
  vendt til `!==`; `SELVMAAL_IT` ændret fra 39 til 36 (et almindeligt måls
  kode); skrivningen i `detaljerAf` ændret fra "altid sæt feltet" til "kun
  sæt ved true" (fanget af `Object.hasOwn`-testen); `{g.selvmaal && …}` i
  `FootballTip.jsx` vendt om til `{!g.selvmaal && …}`; ordet flyttet til FØR
  holdnavnet i DOM'en (fanget af `post.indexOf('selvmål') >
  post.indexOf(holdnavn)`); `detaljeNiveau`'s `ukendte`-led fjernet fra
  OR-kæden. Ingen mutation overlevede.
- **Farven (`var(--c-err)` vs. en ikke-eksisterende `--c-danger`) er reelt
  ubundet af nogen test.** `theme.test.js` binder kun accent-temaets EGNE
  variable (`TEMA_VARIABLE`), ikke en generel "findes hver `var(--c-x)` brugt
  i src/ i theme.css"-kontrol — den findes slet ikke i repoet. Lavrisiko (ville
  fejle synligt i browseren, ikke i testen), men værd at bygge en gang som en
  udvidelse af `theme.test.js`, der scanner alle `.jsx`-filer for
  `var(--c-[a-z-]+)` og krydstjekker navnet mod `:root`-blokken.

## Pulje-reglen: `puljeLockAt: null` + deltager-gate (commit 5c4b9e0, PR #202, sept. 2026)

- **`RULES_FILE` findes allerede i `functions/rules.test.js:39` — brug den.**
  Testen læser reglerne fra `process.env.RULES_FILE || <repo>/firestore.rules`,
  netop for at mutationstest kan køre mod en KOPI. Mutér ALDRIG `firestore.rules`
  selv: emulatorens fil-vagt genindlæser midt i kørslen, og en anden rolle kan
  have din fil under sig. Opskrift, der virkede:
  `cp firestore.rules /tmp/m.rules; sed -i … /tmp/m.rules;
   RULES_FILE=/tmp/m.rules firebase emulators:exec --only firestore "RULES_FILE=… npm run test:rules"`.
- **To Firestore-emulatorer i samme container destabiliserer suiten.** Security
  Reviewer kørte på 8080 mod hovedarbejdstræet, mens jeg kørte i egen worktree.
  Første kørsel døde med `Firestore Emulator has exited with code: 143`, den
  næste gav FIRE urelaterede røde ("KAN gemme sit hold (kontrol)", "en global
  admin KAN stadig godkende en bruger (kontrol)") — ren flake. Flyt egne porte i
  worktree'ens `firebase.json` (firestore/hub/logging/ui), og KØR ALTID EN REN
  BASELINE IGEN, før du melder en mutation for "overlevet"/"dræbt".
- **`request.time >= X` mod `>` kan ikke mutationstestes.** Grænsen "præcis PÅ
  deadline" kræver, at emulatorens serverur rammer millisekundet — der findes
  ingen vej til det fra en regel-test. Ækvivalent i praksis; skriv det som
  utestbart, ikke som et hul.
- **Tre vagter på samme regel gør to af dem u-mutérbare.** Pulje-reglen har nu
  (1) direkte opslag `…data.puljeLockAt` (evalueringsfejl ved manglende felt),
  (2) `gameLock() != null &&` i `beforeDeadline()` og (3) samme i
  `afterDeadline()`. Både at fjerne (3) og at bytte (1) til
  `.get('puljeLockAt', null)` OVERLEVER hele suiten (241 grønne), fordi
  `request.time >= null` selv er en evalueringsfejl → deny. Konsekvens: testen
  "MANGLENDE puljeLockAt afviser listen" kan ikke gøres rød af nogen
  ét-punkts-mutation — dens LÆSE-halvdel er overdetermineret. Kun dens
  SKRIVE-halvdel dør (og da sammen med naboen `:3013`). Husets regel "Én vagt
  pr. sikkerhedsregel" gælder også, når den redundante vagt er selve sprogets
  fejlsemantik.
- **En `isApproved()`-vagt ved siden af en `deltager()`-vagt er ubevist, indtil
  én test har en SUSPENDERET deltager.** `isApproved() && deltager() && …`:
  fjern `isApproved() &&`, og alle 241 tests bliver grønne — for i alle
  fixtures er "deltager" og "godkendt" samme personer. Hullet er reelt:
  en bruger, der har et `players`-dokument, men hvis `users/{uid}.status`
  senere sættes til `pending`/`rejected`, beholder dokumentet. Bevist med en
  fire-linjers probe (createUser(uid,'player','pending') + seedMembership +
  assertFails(liste)) — grøn på den rigtige regel, RØD på mutationen. Samme
  form som `puljeLockAt`-hullet selv: en gate, der i dag tilfældigvis følges
  ad med en anden. Tjek hver gang to gates står i AND: findes der ét fixture,
  hvor de er UENIGE?
- **En eksisterende assertFails kan blive overdetermineret af en ny gate.**
  `functions/rules.test.js:3013` ("uden deadline kan hverken skrives eller
  læses andres") lader pb2 læse pb1's tip UDEN at give pb2 et players-dokument.
  Efter `deltager()` er den assertion rød af to grunde, og deadline-grunden er
  ikke længere den, der bærer den. En ny gate svækker altså gamle
  fraværs-assertions tavst — søg efter dem, når en gate tilføjes, ikke kun
  efter fraværs-assertions der skal VENDES.
- **`expect(snap.size).toBe(2)` fortjener sin plads — men af en anden grund end
  kommentaren siger.** Kommentaren begrunder den med "en regel, der tavst
  filtrerede fremmede dokumenter væk". Det kan ikke ske i Firestore (regler er
  ikke filtre — en list fejler HELT). Beviste værdi: den er den ENESTE
  assertion, der fanger et TOMT/HALVT fixture. Mutation af selve fixturet
  (`for (const u of ['pb1','pb2'])` → `['pb2']`) gør præcis den ene test rød og
  ingen andre.
- **Mutationsmatrix (241 tests, én ad gangen, gendannet imellem):**
  DØDE — `deltager()` fjernet (1 rød), `afterDeadline()` → `!beforeDeadline()`
  (1 rød), hele læsegrenen → `false` (2 røde), tidssammenligningen ud af
  `afterDeadline` (2 røde), `gameLock() == null || …` i `beforeDeadline` (1 rød),
  samme spejlvending i `afterDeadline` (1 rød), egen-tip-grenen brudt (1 rød),
  gammel regel i sin helhed (præcis 2 røde — de to, commit-beskeden nævner).
  OVERLEVEDE — `>=` → `>`; `gameLock() != null &&` ud af `afterDeadline`;
  `.get('puljeLockAt', null)`; `isApproved() &&` ud af læsegrenen.

## `navnGyldigt()`/`ingenIdNoegle()` på top-niveau `leagues` + profilfelter (commit 6d14243, sept. 2026)

- **To vagter, der begge står i `hasOnly`-listen, er allerede "Én vagt pr.
  regel" — `ingenIdNoegle()` behøves IKKE tilføjes på en gren, hvis
  `affectedKeys().hasOnly([...])` allerede udelukker feltet.** Liga-admin-
  update-grenen (`firestore.rules` ~L402) har kun `navnGyldigt()`, ikke
  `ingenIdNoegle()`, fordi `hasOnly(['memberUids', 'name'])` allerede gør et
  `id`-felt umuligt at skrive dér. Mutationsbevist (egen kørsel): fjern
  `navnGyldigt()` ALENE fra netop DEN gren → "en liga-admin KAN omdøbe, men
  ikke til et ikke-streng navn" bliver rød, resten grøn (254/255) — dør
  korrekt, isoleret til sin egen gren. Samme mønster for ejer-update-grenen:
  fjern `ingenIdNoegle()` ALENE derfra (behold på create) → "ejeren KAN IKKE
  skrive et id-felt eller et ikke-streng navn" bliver rød, resten grøn
  (254/255) — også korrekt isoleret. Begge bekræfter: hver gren har sin egen,
  ikke-redundante vagt, og suiten fanger en gren-specifik regression uden at
  andre grene "låner" beskyttelse fra hinanden.
- **En regex, der blev udvidet efter et Test Manager-fund (bredere `[^}]*`
  mellem id-nøgle og spread), er selv mutationsbevist via sin egen
  selvtest.** `src/lib/dokumentId.test.js`s `GAMMEL`-konstant blev udvidet fra
  at kræve `...SAMME_VAR.data()` lige efter id-nøglen til `[^}]*\.\.\.` (vilkårligt
  indhold, vilkårlig spread-kilde). Indsnævres den tilbage til den gamle,
  snævre form (`,\s*\.\.\.` uden `[^}]*`), fejler selvtestens EGEN assertion
  (`'({ id: d.id, ref: d.ref, ...d.data() })'` skal matche `true`) — testen
  dør på sig selv, uden at røre nogen anden fil. Værd at bemærke: her ER
  selvtesten (assertions på literal-strenge) selve mutationsbeviset, fordi
  regexens "input" er hardkodet i testfilen, ikke i den skannede kildekode —
  en sjælden situation, hvor testens fixture OG det, den beviser, er samme
  linjer.
- **En `for (const hook of [...])`-løkke over to hooks med SAMME mockDocs
  dækker begge uafhængigt — bekræftet, ikke antaget.** `useLeagues.test.jsx`
  kører `useLeagues('me')` og `useAllLeagues(true)` i én `it`, samme fixture,
  med assertion INDE i løkken efter hver `renderHook`. Mutationsbevist to
  gange isoleret: (1) kun `useAllLeagues.js`s normalisering fjernet → testen
  fejler præcis på den forventede assertion (viser `TB`/rå objekt for det
  ikke-strengede navn i stedet for `TA`/`''`); (2) kun `useLeagues.js`s
  fjernet, `useAllLeagues.js` urørt → samme fejl, samme sted. Ingen af de to
  hooks "låner" den andens dækning — hver iterations assertion kører reelt.
  Generelt mønster værd at genkende: en løkke over flere implementeringer med
  fælles fixture er IKKE i sig selv mistænkelig, hvis assertionen ligger
  INDE i løkken (ikke akkumuleret og tjekket én gang efter) — men verificér
  det altid med en isoleret mutation af hver gren, for navnet "for-løkke med
  delt fixture" er præcis den form, CLAUDE.md advarer mod ved pulje-testen.
- **`league.name || 'Liga uden navn'`-fallback (4 nye steder: GameLeagues.jsx,
  LeaguesPage.jsx, LeaderboardPage.jsx, BroadcastTab.jsx) har INGEN
  render-test noget sted — heller ikke i de to eksisterende forekomster
  (PuljeAfsloering.jsx, GameStandings.jsx), som ikke blev rørt af denne
  ændring.** Vurderet IKKE-blokerende: det er en ren streng-fallback (ingen
  gren-logik ud over `||`), og de data, den beskytter mod, er allerede
  mutationsbevist ét lag nedenfor — `useLeagues.test.jsx`/`useAllLeagues`
  garanterer, at `name` er enten en ægte streng eller `''` (aldrig et objekt),
  så `||`-fallback'en har kun ÉT input, den reelt kan blive ramt af (tom
  streng), og det er den simpleste mulige gren. Konsistent med eksisterende
  konvention, ikke en ny, udækket risiko.

## `efterFacitDetaljer` — målscorere straks efter facit (commit 61a6e71, sept. 2026)

- **En påstået "ækvivalent mutation" kan efterprøves mod den ÆGTE SDK, ikke
  kun mod faken — og bør.** `kampDetaljer.js:715-725`s kommentar hævder
  eksplicit, at en `exists`-vagt på et Firestore-opslag er "en ækvivalent
  mutation væk" fra kernens `!d.result`-filter. Mutationsbevist i TO styrker:
  (1) kun `typeof snap?.data === 'function'`-tjekket fjernet — overlevede;
  (2) OGSÅ `|| {}`-fald-tilbagen fjernet (`data: snap.data()` råt) —
  overlevede OGSÅ, fordi `syncKampDetaljerCore`s egen `const d = m.data || {}`
  er et TREDJE, uafhængigt lag. Efterprøvede SELVE PÅSTANDEN (ikke kun
  fakeDb'en) ved at læse `node_modules/@google-cloud/firestore/types/firestore.d.ts`
  direkte: `data(): AppModelType | undefined` med kommentaren "Returns
  'undefined' if the document doesn't exist" — bekræfter, at fakeDb'ens
  `{exists:false, data: () => undefined}` er tro mod den ægte SDK (ikke en
  fake, der tilfældigvis er for venlig). Genkendelsesmønster: når en
  kode-kommentar hævder en SDK-kontrakt ("kaster aldrig", "returnerer X for
  manglende dokument"), så tjek typedefinitionen i node_modules i stedet for
  at stole på træningsviden ELLER på at faken "ser rigtig ud" — begge kan
  være forkerte på samme måde.
- **Et OR med to grene, der begge går gennem den SAMME nedstrøms
  dobbelt-vagt, kan stadig dø hver for sig — bekræft det, antag det ikke.**
  `if (!ids.length || !opts.livescore?.land) return null;`. Fjernes den ene
  klausul isoleret (behold den anden), dør BEGGE mutationer uafhængigt — men
  IKKE af den grund man ville tro: uden efterFacitDetaljers egen vagt falder
  kaldet igennem til `syncKampDetaljerCore`, som har SIN EGEN
  `!livescore?.land`-vagt og returnerer `tom`-objektet (ni felter, alle 0/false)
  i stedet for `null`. `expect(...).toBeNull()` fanger forskellen på
  objekt-identitet, ikke på at ydervagten faktisk forhindrede et kald. Værd at
  vide: en sådan test kan bestå "af den rigtige grund" (rigtig gren dræbt) men
  af en ANDEN mekanisme end kommentaren beskriver — kør mutationen, læs
  fejlbeskeden, tjek at forklaringen stemmer, konkludér ikke kun på grønt/rødt.
- **To input-valideringer uden egen test (`Array.isArray`-tjek og
  `.filter(Boolean)` på `opts.rettede`) overlevede begge — vurderet lavrisiko,
  IKKE rapporteret som blokerende.** Sporet til kilden: `rettede` bygges
  udelukkende af `syncResultsCore` (`superligaSync.js:198`, `rettede.push(id)`),
  hvor `id` allerede er guardet af `if (!cur) continue` nogle linjer over —
  kan aldrig være falsy eller ikke-en-streng ved den ENESTE kaldevej i
  produktion. Mønster: en overlevet mutation er kun et REELT hul, hvis der
  findes en sandsynlig kaldevej, den ikke fanger — spor altid kilden til
  inputtet, før du rapporterer et unit-niveau-hul som blokerende.
- **`index.js`s halvårs-gamle blinde vinkel (ingen testfil for
  `onSchedule`/`onCall`-håndteringer) gentog sig for en NY funktion, samme
  form som xG-sweep-fundet.** Den nye hale (linje 428-453 i
  `syncSuperligaResults`) er 100 % udækket: hverken "alarmen fyrer, når
  `d.afbrudt`" eller "et `out.gameId`, der ikke findes i `SYNCED_GAMES`, vælter
  ikke kørslen" er unit-bevist. Bekræftet SYSTEMISK, ikke nyt for denne PR:
  `SYNCED_GAMES.find((x) => x.gameId === …)` optræder 4 steder i index.js (ny
  linje 430 + tre eksisterende ved 835/897/940), alle lige udækkede. `meldAlarm`
  SELV er grundigt testet generisk i `driftlog.test.js` (dæmpning, dedup) —
  det er kun WIRING'EN ("kalder index.js den med de rette argumenter, når den
  skal") der mangler, ikke selve alarm-mekanismen. Vurderet IKKE-blokerende,
  konsistent med tidligere præcedens for samme fundklasse (se xG-sweep-notatet
  ovenfor) — men nævnt konkret med fil:linje og minimumstest, hvis den skal
  lukkes: udtræk halen til en ren funktion i kampDetaljer.js/superligaSync.js,
  injicér `efterFacitDetaljer`+`meldAlarm` som parametre, og skriv mindst:
  (a) tomt `rettede` → intet kaldes, (b) `gameId` uden for `SYNCED_GAMES` →
  ingen kast, (c) stub der resolver `{afbrudt:true}` → `meldAlarm` kaldt
  præcis én gang med `type:'detaljerLukket'`, (d) stub der REJECTER → loopet
  fortsætter til næste spil uden at vælte.
- **Et nyt `describe`-blok indsat MELLEM en eksisterende kommentar og dens
  oprindelige mål efterlader kommentaren foran den forkerte blok.**
  `kampDetaljer.test.js:829-841` ("detaljeNiveau — Drift-kortets dom …")
  stod oprindeligt lige over `describe('detaljeNiveau', …)`; den nye
  `describe('efterFacitDetaljer', …)` blev indsat IMELLEM dem, så kommentaren
  nu introducerer den forkerte blok. Ren læsbarheds-nit (ingen testeffekt),
  men værd at scanne efter ved enhver diff, der indsætter et nyt `describe`
  midt i en fil: står der en forklarende kommentar lige før indsætningspunktet,
  der egentlig hørte til blokken EFTER?

## `public/testsetup.html` — statisk rundvisningsside uden app-kode (commit 60396bc, sept. 2026)

- **En ren statisk HTML-side har intet at mutere — "mutationstest kernen" må
  erstattes af direkte tælling/verifikation af hver konkret talpåstand, ikke
  droppes.** Siden har ingen JS-logik; der findes ingen vagt at vende om.
  I stedet: kørte alle fire suiter og talte selv (frontend `npx vitest run`,
  `npm --prefix functions test`, `npm --prefix functions-platform test`,
  `grep -c "it(\|test(" functions/rules.test.js`, `find … -name "*.test.*"`),
  og verificerede CI-varighederne mod GitHub API
  (`curl https://api.github.com/repos/<org>/<repo>/commits/<sha>/check-runs`,
  `completed_at − started_at`), fordi siden navngiver en præcis commit-sha for
  dem. Alle FIRE hovedtal i "Kort sagt"-stripen (3.156 frontend, 1.187 Cloud
  Functions [204+983], 256 rules, 4 E2E) og alle FIRE CI-varigheder
  (2:48/2:28/1:59/0:25) var eksakt korrekte — inkl. varighederne, som matchede
  til sekundet.
- **MEN den detaljerede nedbrydningstabel (som ingen af hovedtallene fanger)
  havde to reelle talfejl, allerede den dag siden blev skrevet — ikke
  fremtidig drift, men forkert ved forfatterskabet.** "Scripts"-rækkens
  Testfiler stod som 10, reelt 13 (`find scripts -name "*.test.mjs"` —
  forfatteren talte kun `scripts/`-rodmappen og glemte `scripts/lib/*.test.mjs`
  — doubleChance, roller, teamsOnly — hvoraf `roller.test.mjs` endda er nævnt
  eksplicit længere nede på SAMME side som "Rolle-udvælgeren (testet)").
  "Cloud Functions"-rækkens Testfiler stod som 45, reelt 44 (18
  `functions/*.test.js` fra `vitest.config.js`s include-liste + 26
  `functions-platform/*.test.js` — rules.test.js er allerede talt for sig i
  Rules-rækken, så 45 kan ikke forklares ved at inkludere den). Lærdom: en
  side, der EKSPLICIT advarer mod netop "et hardkodet tal om noget levende er
  en løgn med forsinkelse" og peger på en levende kilde (Admin → Tests), kan
  stadig have forkerte tal i sit eget øjebliksbillede — dateringen beviser
  intet om at tallet blev talt korrekt DEN dag. Tæl altid selv, uanset om der
  står en dato ved siden af.
- **Ingen hemmeligheder fundet** ved `grep -inE` for e-mail-mønstre,
  API-nøgle-mønstre (`AIza…`), `firebaseapp.com`, lange hex-strenge, uid'er,
  `localhost`, tokens/secrets/passwords — siden nævner kun offentlige
  produkt-hostnames (tip.vejleaa.dk, tour.vejleaa.dk), som allerede er
  offentligt kendte.
- **`dist/testsetup.html` bekræftet til stede efter BEGGE builds** (`npx vite
  build --logLevel error` og `VITE_PLATFORM_MODE=true npx vite build
  --logLevel error`) — Vite kopierer `public/` uændret, ingen custom
  `publicDir`-konfiguration rørt af denne diff. Vurderet lavrisiko som
  fremtidig regressionstest (tautologi-fælde: en test, der kun tjekker at en
  committet fil findes, beviser intet nyt ud over hvad `git status` allerede
  garanterer) — IKKE anbefalet som blokerende krav.
- **E2E's 404-test (`e2e/smoke.spec.js`, "ukendt rute viser 404-siden") bruger
  `/findes-ikke-12345`** — ingen kollision med `/testsetup.html`. Testen
  forbliver meningsfuld: en statisk fil i `public/` rammes af Firebase
  Hosting FØR SPA-rewrite'en og påvirker aldrig React Router-fallbacket, som
  testen dækker.
