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

## Mønster at genkende

Alle tre fund ovenfor deler samme form: en test, der ser ud til at dække en
invariant ("aldrig set", "andet gennemløb", "zone-vagt"), dækker i
virkeligheden kun DEN VEJ, testens fixtures rent faktisk rammer — ikke
invarianten selv. Spørg altid: hvilket konkret input ville denne kode-gren
faktisk blive nået af, og findes det input i noget fixture?
