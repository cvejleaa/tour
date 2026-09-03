# Security Reviewer — varig hukommelse

> **Loft: højst fem sag-afsnit.** Filen blev 2026-08-24 destilleret fra 18
> sag-afsnit (83 KB) ned til fem. Alt, der var værd at bære, ligger nu i de
> varige lister nedenfor — sag-afsnittene er kun til det, der stadig er ÅBENT
> eller bærer et PoC-mønster, der ikke kan koges ned til én linje.
> De tre lister `Angrebsveje der VIRKER`, `Angrebsveje der IKKE virker` og
> `Afprøvet og RENT` beskæres ALDRIG.

## PoC-opsætning der virker (genbrug den)

- **Emulatoren startes UDEN firebase-CLI** (den er ikke installeret):
  `java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar --host=127.0.0.1 --port=8080 --rules=/home/user/tour/firestore.rules`
  Kør derefter repoets egen suite direkte mod den:
  `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run --config vitest.rules.config.js --silent`
  **Brug ALDRIG `firebase-tools@latest emulators:exec`** — den henter en nyere
  emulator med strammere null-semantik, og 35 af 227 regel-tests fejler FALSK
  med "Null value error" (også kontroltests). Mod jar v1.22.0: alt grønt.
- **`@firebase/rules-unit-testing` er IKKE længere i `functions/node_modules`**
  (sep 2026: `find -name rules-unit-testing` = tomt). Hurtigste vej nu:
  `npm install --no-save --prefix <scratchpad>/poc @firebase/rules-unit-testing firebase`
  (~23 s gennem proxyen), `package.json` med `"type":"module"`, og kør PoC'en som
  et **almindeligt node-script** — `assertSucceeds/assertFails` behøver ikke
  vitest, en lille `t(navn, fn)`-wrapper med try/catch printer OK/FEJL pr. case.
  Fordelen: intet i repoet, `git status` er ren pr. konstruktion.
  **Port 8080 kan være optaget** af en anden agents emulator — brug 8085 og sæt
  `port:` i `initializeTestEnvironment` (ikke kun `FIRESTORE_EMULATOR_HOST`).
- **Regel-PoC'er skal ligge i `functions/`** — `@firebase/rules-unit-testing`,
  `firebase` og `vitest` findes KUN i `functions/node_modules`. Lav
  `functions/__poc__/x.test.js` + en lille `vitest.poc.js` med
  `include: ['__poc__/*.test.js']`, og **slet mappen bagefter** (`git status`
  skal være ren, når du returnerer). Alternativt symlink `node_modules` i
  scratchpad — men i-repo-mappen er hurtigere og mindre skrøbelig.
- **Kerne-PoC med Admin SDK** (omgår rules — tester dét, callable'en gør):
  `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` + `node_modules/firebase-admin` som
  SYMLINK til `functions-platform/node_modules/firebase-admin` i scratchpad
  (ESM/CJS slår ikke op i repoets node_modules udefra), så `require()` kernen
  direkte med en absolut sti og kald den med `(db, FieldValue, {...})`.
- **Kør callable'en ÆGTE:** v2-`onCall` har `.run({auth:{uid}, data, rawRequest:{}})`,
  og `firebase-functions@7` sætter `func.run = handler` også på `onSchedule`
  (lib/v2/providers/scheduler.js L70) — så et helt minut-job kan drives
  ende-til-ende. Opskrift: `GCLOUD_PROJECT=demo-x`, `require('functions-platform/index.js')`
  FØR `admin.firestore()`, kald ALDRIG selv `initializeApp` ("app already exists"),
  kør fra `cd functions-platform`. Spol tiden med `Date.now = () => T0 + off`.
- **Instrumentér forbruget i samme proces:** monkey-patch
  `DocumentReference/CollectionReference/Query.prototype.get` og
  `set/update/create/delete` + `WriteBatch.prototype.commit` fra
  `functions-platform/node_modules/@google-cloud/firestore`, og
  `global.fetch = () => { kald++; throw }`. Det afgør, om en afvist kalder når
  det DYRE arbejde — svaret på "står autorisationen foran læsningerne?".
- **Admin SDK mod emulatoren HÆNGER i dette miljø** (metadata-opslag går i
  proxyen; en falsk service-account får `initializeApp` igennem, men første
  skrivning står stille til timeout). Skal en PoC bare bevise DATA-semantik
  (fx at et `id`-felt skygger i `{ id: d.id, ...d.data() }`), så brug
  `env.withSecurityRulesDisabled(c => c.firestore())` fra
  `@firebase/rules-unit-testing` i stedet — det er ægte Firestore-snapshots
  uden regler, altså samme udsigt som Admin SDK'en har.
- **Rene kerner kan PoC'es uden emulator** med en fake db:
  `{ collection: () => ({ doc: () => ({ collection: () => col }) }), batch: ... }`
  (kopiér `fakeDb` fra `functions-platform/syncProviders.test.js` L27-70).
  Providers testes med en `fetchFn`, der returnerer et FJENDTLIGT JSON-svar.
- **URL-vagter PoC'es med en fetch-SPION og altid med en muteret kopi.**
  Kopiér modulet + dets naboer til scratchpad, streng-erstat guarden med en
  svagere (`typeof v === 'string' && /re/` → `v != null`), og kør SAMME PoC mod
  begge. Uden mutationen ved du ikke, om spionen kan se en læk — og en
  URL-injektion ser ud som en tom `fetch`-liste, ikke som en fejl. Fjendtlige
  værdier, der har afsløret ægte forskelle: sti-traversal, `//vært/x`,
  `%2e%2e%2f`, CRLF (headerinjektion), ikke-ASCII-cifre, `{toString:()=>...}`.
- **Workflow-steps køres som bash:** kopiér `run:`-blokken ORDRET til en `.sh`
  og kør den mod et `process.argv`-dump. Quoting-fejl kan kun ses ved at køre dem.
  Falsk service-account laves med `openssl genrsa` — `cert()` validerer kun
  formatet, og `FIRESTORE_EMULATOR_HOST` omgår auth.
- **Læk-PoC:** kør funktionen mod fjendtlige dokumenter og kør
  `JSON.stringify(svar)` mod en liste forbudte regexer. **Kør ALTID samme PoC
  mod en MUTERET udgave bagefter** — ellers ved du ikke, om PoC'en kan se en læk.
  Husk at escaped tekst (`&lt;`, `&quot;`) er falsk positiv i XSS-PoC'er.
- **LIST-PoC mod en regel med wildcard-uid:** test ALTID fire former, ikke én —
  `getDocs(hele samlingen)`, `getCountFromServer`, `where(documentId(),'==',mig)`
  og `where('felt','==',mig)`. De giver FORSKELLIGE svar (målt på puljeBets), og
  en `getDoc`-test beviser intet om nogen af dem. Skalér til 60 dokumenter for
  at afgøre, om `get()`-budgettet i rules rammes.
- **Regel-rettelser efterprøves med RULES_FILE:** skriv den rettede regel til en
  kopi i scratchpad, kør PoC'en mod kopien, og kør derefter
  `RULES_FILE=<kopi> FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run
  --config vitest.rules.config.js --silent` for at bevise, at de 233
  eksisterende tests stadig er grønne. Er de grønne både FØR og EFTER, har du
  samtidig målt, at suiten ikke dækker hullet.
- **Fælder i mine egne PoC'er, der har kostet falske konklusioner:**
  - `kickoff` skal seedes som **Timestamp**, ikke som tal. `request.time < kickoff`
    med et tal giver "Unsupported operation: timestamp < int" → PERMISSION_DENIED
    af FORKERT grund, og et hul ser lukket ud.
  - `myLeagueIds()` (firestore.rules ~L596) læser
    `games/{gameId}/players/{uid}.leagueIds` — IKKE `leagues/{id}/members`. Uden
    `leagueIds` på player-dokumentet fejler ALLE læsninger af andres tips.
  - Tidsoffset skal nulstilles FØR seedning, ellers ligger kickoff et andet sted
    end tiltænkt, og en tidsgrænse nås aldrig.
  - En `catch` uden for `Promise.allSettled` fanger ikke en transaktion, der
    udløber senere — pak hver fjendtlig værdi ind hver for sig.
  - **Den værdi, en flade BYGGER, er ikke den værdi, basen FÅR.** Jeg meldte
    `puljeLockAt: null` og "et TAL" som admin-fladens skrivninger ud fra
    `byggSchedulePatch` — men patchen går gennem `setGameSchedule` →
    `toScheduleValue`, som laver tal om til `Timestamp` og null om til
    `deleteField()`. Spor ALTID kæden fra komponenten til det kald, der rører
    Firestore, før du kalder en type- eller null-vej "ét klik væk".

- **"Hvilken vært taler scriptet med?" måles med en SINK, ikke ved læsning.**
  En 10-liniers `http.createServer` på 127.0.0.1:9911, der logger `method+url`
  og svarer `200 {}`, plus `FIRESTORE_EMULATOR_HOST=127.0.0.1:9911` foran
  scriptet. Beviste på første forsøg, at `seed-e2e.mjs` sender BÅDE sine
  `DELETE /emulator/v1/...` og `POST .../accounts` (med adgangskoden i klartekst)
  til den vært, miljøvariablen peger på. Genbrug den, hver gang "kan ikke ramme
  produktion" hviler på en env-var.

## Bekræftede antagelser om reglerne (emulator-verificeret)

- **Tip-vinduet er ÉN betingelse:** `request.time < matches/{matchId}.kickoff`
  (firestore.rules L820 create, L843 update). Der er INGEN "kampen er
  begyndt"-hukommelse. Flyttes `kickoff` frem i tiden, åbner vinduet igen — også
  for en spillet kamp. Læsning af andres tips er den omvendte betingelse (L799),
  så en fremflytning SKJULER samtidig sporet igen.
- **Rolle-eskalering er lukket.** Bruger kan kun oprette sig som
  `role:'player'/status:'pending'` (L99-104); `writingProtectedUserFields()`
  (L56) spærrer `role`/`status`/point-felter på egen profil; en globalAdmin kan
  ikke ændre roller (L116-119) — kun owner. Admin-porten i callables
  (`users/{uid}.role in {owner, globalAdmin}`) er derfor holdbar.
- **`isGlobalAdmin()` ser IKKE på `status`.** En globalAdmin med status
  `pending` kan læse alt admin-only og pause spil. Præeksisterende, konsistent
  med callables' rolle-kun-port.
- **`ProtectedRoute require="admin"`** (src/components/ProtectedRoute.jsx L13) er
  PRÆCIS samme prædikat som rules' `isGlobalAdmin()` (owner ∪ globalAdmin,
  AuthContext L47-49). Tjek det igen, hvis nogen indfører en tredje rolle.
- **`games/{gameId}` og `games/{gameId}/matches/{matchId}` har INGEN
  affectedKeys-liste** (L666 / L751): `allow create, update: if isGlobalAdmin()`
  (+ `gyldigtTeamStyles()`). ETHVERT nyt felt på spil- eller kamp-dokumentet er
  dermed admin-skrivbart uden regel-ændring — inkl. `kickoff`, `paused`,
  `puljeLockAt`, `round`. Det er i orden, mens skribent-kredsen er den samme som
  knap-kredsen, men skal spørges eksplicit, når et nyt felt STYRER maskineri.
- **`games/{gameId}/bets/{betId}`:** doc-id bundet til `uid_matchId` ved create;
  `uid` og `matchId` uforanderlige ved update; `points` spærret begge veje;
  `allow delete: if false`; `claimsOnlyOwnLeagues()` forhindrer at man skriver
  en fremmed ligas id på sit tip. Siden 2026-08-24 også de tre chance-felter
  (`writingChanceFields()` L88-106 + create-grenen L909-916 — 38 PoC-checks, alle
  skriveformer afvist, mutationstestet: hver vagt → `true` gør præcis én test rød). Der findes **intet rekursivt `{document=**}`-wildcard** i
  filen og ingen `isGlobalAdmin`-skrivegren på bets.
- **`driftlog/{id}` + `driftAlarmer/{id}`** (L383-390): `read: isGlobalAdmin()`,
  `write: false`. Verificeret for LIST/QUERY, ikke kun getDoc — reglen er
  dokument-uafhængig, så klientens `where('loestAt','==',null)` virker.
  Selv admin kan ikke skrive driftAlarmer; kun callablen.
- **`puljeBets` — TYPEMATRIX, målt punkt for punkt (2026-09-01, efter 5c4b9e0).**
  Læsegrenen for andres tip er `isApproved() && deltager() && afterDeadline()`,
  hvor `afterDeadline()` er `gameLock() != null && request.time >= gameLock()`;
  skrivegrenen bruger stadig `beforeDeadline()`. Kørt for 12 værdier af
  `puljeLockAt` (læs/skriv): **Timestamp i fortiden → læs JA, skriv nej;
  Timestamp i fremtiden → læs nej, skriv JA; eksplicit null, manglende felt,
  tal (fortid/fremtid/0), streng (ISO/tom), bool, map og liste → læs NEJ og
  skriv NEJ.** Der findes altså ingen værdi, der åbner begge, og ingen der
  åbner læsningen uden en gyldig, passeret Timestamp. Kontrol: findes
  spil-dokumentet slet ikke, afvises alt.
  `poolSize == 0` gør `size() == 0` uopfyldelig → intet kan gemmes.
  **DEN GAMLE TYPEFÆLDE ER LUKKET VED KILDEN — og påstanden om `null` var
  forkert.** `GameScheduleTab.byggSchedulePatch` (L70-71) sender ganske vist et
  TAL og et `null`, men det er ikke det, der skrives: `setGameSchedule` →
  `toScheduleValue` (gameActions.js L24-29, uændret siden 08223f9) gør tal/ISO
  til `Timestamp.fromMillis(...)` og `null`/`''`/uparselig til
  **`deleteField()`**. Målt i emulatoren: et tømt datofelt FJERNER feltet
  (`'puljeLockAt' in data === false`) — det er "manglende", ikke "null", og har
  altid fejlet lukket. Ingen skribent i repoet kan skrive eksplicit `null` eller
  et rå tal; kun Firebase-konsollen eller et ad hoc admin-SDK-script kan.
  Rette-kommentaren i firestore.rules (~L840) og i
  `scripts/audit-spiller-point.mjs` påstår begge det modsatte.
- **`puljeBets` LIST er emulator-kortlagt (2026-09-01, 29 PoC-checks).** `allow read`
  DÆKKER `list`: efter deadline lykkes `getDocs` på HELE samlingen for enhver
  `isApproved()` — også en der IKKE deltager i spillet, og også på et spil man
  ikke er med i. Ingen `get()`-budgetgrænse rammes: 60 dokumenter × 2 opslag
  (`users/{mig}`, `games/{g}`) gik igennem, fordi begge stier er KONSTANTE
  på tværs af dokumenterne — samme egenskab som `myLeagueIds()`-kommentaren
  bygger på. FØR deadline fejler hele listen (dokument-uafhængigt led falsk),
  MEN `where(documentId(),'==',mig)` lykkes (wildcard'et binder), mens
  `where('uid','==',mig)` FEJLER — reglen kan kun bevises via doc-id'et.
  `getCountFromServer` følger præcis samme regel som `getDocs`.
  **IDENTITETSKILDEN DIVERGERER MELLEM KLIENT OG SERVER.** Serveren bruger
  `d.id` (gameScoring.js L441-455, index.js L1330); `PuljeAfsloering.jsx` L74
  skriver `{ uid: d.id, ...d.data() }` — spreadet står SIDST, så `data().uid`
  VINDER over doc-id'et. Målt i emulatoren: et dokument med id `u3` og feltet
  `uid:'u2'` bliver til `uid:'u2'` i fladen. Ingen klient kan lave et sådant
  dokument (`request.resource.data.uid == uid` har stået der siden 9e90d70, og
  fremmed uid, tom uid, manglende uid, uid som liste og fremmed doc-id blev
  alle afvist — kontrol grøn), og `settlePuljeBets` rører aldrig `uid`. Kun
  Firebase-konsollen/et admin-SDK-script kan. Konsekvensen VILLE være, at
  fladen tilskriver en andens tip — inkl. "kun dig" på et hold, man ikke har
  valgt. Rettelsen er ét tegn-ombytning: `{ ...d.data(), uid: d.id }`, som
  binder klienten til samme identitet som serveren.
  `collectionGroup('puljeBets')` fejler (ingen collectionGroup-gren).
  **Skala målt igen efter deltager-gaten (2026-09-01): LIST på 200 dokumenter
  lykkes.** De tre opslag i læsegrenen (`users/{mig}`, `games/{g}`,
  `players/{mig}`) er alle KONSTANTE stier og koster tilsammen ét sæt, uanset
  antal dokumenter — der er intet get()-loft at ramme her.
  **Modprøve, der afgør spørgsmålet en gang for alle:** ændres `deltager()` til
  `exists(.../players/$(uid))` — altså en sti, der afhænger af dokumentet —
  så virker `getDoc` og `where(documentId(),'==',x)` STADIG, mens ENHVER
  fler-dokument-query afvises **allerede ved `limit(1)`**, selv når hvert
  dokument semantisk opfylder reglen. Et dokumentafhængigt opslag er altså
  ikke "dyrt indtil 10" i en query — det er forbudt. (Kommentaren ved
  `bets`/`detalje` om "ét opslag PR. DOKUMENT, sprænger loftet efter 10 kampe"
  beskriver derfor konsekvensen for mildt.)
  Kontroltests grønne: pending, anonym, bruger uden users-dok og globalAdmin
  (ingen admin-gren) afvises; skrivning efter deadline afvises; doc-id ≠ uid
  og andens uid afvises; `delete` afvises.
- **`bets` LIST kan kun bevises MED `where('matchId','==',…)` (målt 2026-09-03,
  identisk på 76c5e9b og 27cb861 — altså ikke en regression).** Læsegrenen slår
  kampens kickoff op via `resource.data.matchId`. Målt for fem former:
  `getDoc` på en andens tip OK; appens egen query
  (`matchId ==` + `leagueIds array-contains-any`, useMatchLeagueBets.js:74) OK;
  `where('uid','==',mig)` (useGameBets.js:29) OK; men **`leagueIds`-filteret
  ALENE og hele samlingen uden filter fejler begge** med
  `evaluation error … Property uid is undefined on object` — også når hvert
  dokument semantisk opfylder reglen. Kommentaren i reglen advarer kun om
  `leagueIds`; sandheden er, at BEGGE filtre skal med. Skriv aldrig en
  bets-PoC uden `matchId`-filteret, ellers måler du din egen query.
- **`questions`/`questionAnswers`:** `answerId == questionId + '_' + auth.uid`
  binder svaret til afsenderen. `botFacitAt`-vagterne holder i alle fire
  skriveformer (update, `= null`, fuld setDoc-overskrivning, `deleteField()` —
  `affectedKeys().hasAny` fanger også sletning).
- **`games/{gameId}/leagues/{leagueId}`: ingen admin-laesegren.** `allow read` (L952)
  er KUN `isApproved() && uid in memberUids` - modsat top-niveau `leagues` (L344).
  Emulator-bekraeftet: en globalAdmin naegtes. Derfor ER admin-callablen hele
  graensen. Skrivning: ejer-grenen (medlemmer/ownerUid/code uaendret) eller
  "fjern praecis mig selv"; begge kontroltestet som lukkede for at skrive en ny
  medlemsliste. `name`s TYPE valideres kun ved create - se aabne angrebsveje.
- **`users/{uid}` L136-139: en globalAdmin MAA saette `status`** (kun `role` og
  point-felterne er spaerret for hen; `role` kraever owner). En callable, der
  auto-godkender med Admin SDK, er derfor ikke rettighedseskalering - men den
  maa aldrig roere `role`. Verificeret maalt: `role` uaendret efter godkendelsen.
- **Et nyt liga-medlemskab afsloerer IKKE tips foer kickoff.** bets-read (L879-883)
  kraever BAADE `request.time >= kickoff` OG delt liga, saa en tredjepart, der
  aendrer medlemskab, kan ikke aabne kortene. Emulator-koert begge veje + kontrol
  efter udmeldelse (liga, stilling og begyndte kampes tips alle naegtet igen).
  Bemaerk til gengaeld, at den nyindmeldte straks kan laese hele liga-dokumentet
  INKLUSIVE `code` - at udelade koden fra et callable-svar er hygiejne, ikke en
  fortrolighedsgraense.
- **`messages` create** validerer BEGGE participants mod enten
  `games/{g}/leagues/{l}.memberUids` (gameId sat) eller top-niveau `leagues/{l}`
  (gameId fraværende) — `bothShareLeague`/`privateLeagueMembers`, L448-472.
  Grenforvirring er umulig: `gameId` sat TVINGER game-stien.
- **`users/{uid}` type-tjekker IKKE `displayName`** — en spiller må skrive `42`,
  `{a:1}`, `['a']` eller 100k tegn på sig selv. Se griefing-posten nedenfor.

## Angrebsveje der VIRKER (åbne eller kun delvist afbødet)

- **Deltager-gaten på `puljeBets` kan man SELV opfylde med ét dokument
  (BEKRÆFTET, 2026-09-01, efter 5c4b9e0).** Læsegrenen kræver nu
  `deltager()` = `exists(games/$(gameId)/players/$(request.auth.uid))`. Men
  `players`-create (firestore.rules ~L704) kræver KUN `isApproved()` +
  eget uid + ingen point-/liga-felter — der er INGEN betingelse på
  `game.joinable` eller `game.status`. Kæden er kørt i emulatoren mod et spil
  med `joinable:false, status:'finished'`: liste afvist → `setDoc(players/mig,
  {uid})` lykkes → hele `puljeBets` listes (alle tip + server-satte
  `points`/`correct`) → `deleteDoc(players/mig)` lykkes (delete er tilladt
  ved `totalPoints == 0`/fraværende) → læsningen er lukket igen. Gaten er
  altså en SCOPING-beslutning ("puljen er spillets"), ikke en
  fortrolighedsgrænse: prisen for en fremmed er én skrivning, og sporet kan
  fjernes igen. Vil man have grænsen, skal `players`-create bindes til
  spillets tilstand (`joinable == true && status != 'finished'`) — den
  betingelse findes i dag KUN i fladen.
- **`puljeBets` er IKKE liga-afgrænset — modsat `bets` og `players`.** Efter
  deadline kan enhver DELTAGER i spillet (efter 5c4b9e0; før: enhver
  `isApproved()`) læse ethvert pulje-tip inkl. server-satte `points`/`correct`,
  og `users/{uid}` (L114) giver uid→displayName. En "kun liga-fæller får
  navne"-visning er derfor ren pynt: devtools giver hele spillets
  navn→tip-tabel, og pulje-POINT er stadig en omvej uden om liga-gaten på
  `players/{uid}` (L697). EJERENS BEVIDSTE AFGRÆNSNING (5c4b9e0): puljen er
  åben for spillets deltagere — men se posten over: "deltager" er noget, man
  selv kan blive.
- **Genåbning af puljen = perfekt-information-kopiering (KÆDE KØRT).** Kæden
  målt ende-til-ende: deadline passeret → u2 `getDocs` alles tip → `users/u1`
  giver navnet → globalAdmin sætter `puljeLockAt` frem i tiden → u2 gemmer u1's
  tip som sit eget → læsningen er lukket igen, så kopieringen er usporlig.
  Genåbnings-forbuddet findes KUN i den runde-udledte sti (superligaSync.js
  L694-697) — altså PL. Superligaen har `pulje` men INGEN `puljeLockRound`
  (scripts/games.mjs L69-76), så dens deadline sættes i hånden via
  GameScheduleTab, hvor `byggSchedulePatch` har NUL vagt mod fortid→fremtid.
  Admin-only og præeksisterende, men først skadeligt når en klient VISER
  tippene. **Kæden er kørt igen mod den RETTEDE regel (2026-09-01): uændret.**
  EJEREN HAR AFVIST en vagt mod fortid→fremtid. Beslutningen betyder: for et
  spil uden `puljeLockRound` (Superligaen) kan en globalAdmin med to
  skrivninger genåbne puljen, efter afsløringen har vist alle tip — og der
  findes hverken alarm, driftlog eller felt-historik, der viser det bagefter,
  fordi læsningen lukker igen samtidig. Kredsen er ejeren + globalAdmins, og
  det er dét, der bærer beslutningen — ikke en teknisk grænse.

- **Liga-ejer: slet + genopret spørgsmålet med SAMME doc-id.** `questions` har
  `allow delete: if qOwner()` (firestore.rules L999), mens `questionAnswers` har
  `allow delete: if false` og doc-id `qid_uid`. Kæden (emulator-kørt, begge
  varianter): sæt facit → læs alles svar → slet spørgsmålet → opret samme id med
  `facit:null` → overskriv sit EGET svar → sæt facit = 100 point. Deadline-vejen
  virker tilsvarende. De DIREKTE veje (nulstil facit, rul deadline tilbage) er
  korrekt lukkede; omvejen er ikke. Samme omvej giver ubegrænsede AI-kald og
  "botten siger hvad ejeren vil" (det genoprettede spørgsmål har intet
  `botFacitAt`, så de GAMLE svar afsløres under en NY label og et NYT facit).
  Fix: `allow delete: if isApproved() && qOwner()==uid && resource.data.get('facit',null)==null && (resource.data.get('deadline',null)==null || request.time.toMillis() < resource.data.deadline)`.
- **Liga-ejer: point på et AFGJORT spørgsmål.** questions-update (L1017-1030)
  kræver kun `points 1-100` UBETINGET — ingen facit-/deadline-betingelse. Ejer
  hæver 5→100 med alle svar i hånden; stillingen beregnes LIVE på klienten af
  `q.points`. Dertil: **første-gangs deadline i FORTIDEN** er tilladt (grenen
  `old deadline == null`) → åbner alles svar for hele ligaen, og **`type`
  text→number EFTER deadline** er ikke begrænset → "nærmest vinder"-scoring
  aktiveres med svarene synlige. Alle tre BEKRÆFTET i emulator.
- **Invitations-mailen: HTML-injektion i 300 mails.** `<a href="${cta}">`
  (inviteTemplate.js L189) flettes RÅT — `esc()` bruges kun til den synlige
  kopi (L192). `https://tip.vejleaa.dk/x" style="…` er attribut-breakout, og
  `…/"></a></td></tr></table><a href="https://phish/">…` er fuld injektion.
  Begge kørt. Og `joinLink.startsWith(APP_URL)` (index.js L664, APP_URL uden
  skråstreg) slipper `https://tip.vejleaa.dk.evil.dk/…` og
  `https://tip.vejleaa.dk@evil.dk/` igennem. Sammen: en globalAdmin (= en af
  vennerne) sender en officiel tip@vejleaa.dk-mail med en phishing-knap.
  Fix: `href="${esc(cta)}"` + `startsWith(APP_URL + '/')`.
- **`id`-FELTET SKYGGER FOR DOC-ID'ET — spil-ligaer LUKKET (74ff02d), men
  KLASSEN er kun lukket hos LÆSEREN andre steder.** Mønstret
  `{ id: d.id, ...d.data() }` lader et `id`-FELT i dataen vinde over
  dokument-id'et. Alle 70 forekomster er vendt til data-først, og
  `src/lib/dokumentId.test.js` holder dem der. Reglen forbyder nu feltet på
  `games/{g}/leagues/{l}` (create, ejer-update, forlad-gren). Men feltet er
  STADIG skrivbart to steder (emulator-målt 2026-09-02):
  `users/{uid}` (enhver, også `pending`, på egen profil) og top-niveau
  `leagues/{id}` (ejeren; ejer-grenen fryser kun `status`/`adminUids`).
  Tre BEKRÆFTEDE kæder, alle kørt ende-til-ende i emulatoren:
  (a) *Stillingen slukkes* — spil-liga-ejer skriver `id:'<fremmed liga>'` →
      offerets `useGameStandings`-query rammer en fremmed liga → hele
      stillingen forsvinder. LUKKET i både regel og læser.
  (b) *Administratorens klik omdirigeres* — en PENDING bruger skriver
      `users/mig.id = '<offer>'`; `useUsers.js` L29 gav så rækken "Angriber"
      id'et `offer`, og HVER handling i `UserRow.jsx` tager `user.id`:
      `setUserStatus` (L90), `setGlobalAdminRole` (L111), `callSetUserEmail`
      (L128), `callDeleteUser` (L141), `sendAdminPasswordReset` (L74) samt
      `approveUsers(u.id)` i UsersTab L52. Målt: ét klik "Afvis" på
      angriberens række satte `offer.status='rejected'`, mens angriberen
      blev stående `pending`. Adressen på en mail-ændring er en
      kontoovertagelse. Lukket hos læseren; reglen mangler stadig vagten.
  (c) *Bottens opslag lander på en FREMMED ligas væg* — `functions/index.js`
      L1872 (`runGenerateLeagueRecaps`) læste top-niveau-ligaen med den gamle
      rækkefølge, og L1897-1903 skriver med `league.id`. Målt mod ægte
      Firestore-data: opslaget "Stillingen i Min liga: offer 412 point …"
      landede med `leagueId='TB'` og blev læst af TB's medlem, og
      `lastRecapAt` blev sat på TB (som derved MISTER sit eget morgenopslag),
      mens den egne liga aldrig fik markøren. Det var altså et ægte
      server-hul — ikke kun en klient-detalje. Samme form i
      `runRegenerateRecaps` og `buildThankYouContext`. Lukket af sweep'et.
  Restrisiko: vagten er nu ÉN grep-test. Læg `!('id' in request.resource.data)`
  på `users` og på top-niveau `leagues` for at få den anden vagt tilbage.
- **Grep-vagten mod `{ id: d.id, ...x }` er nu BRED — og har falske positiver
  (målt 2026-09-02).** Regexen i `src/lib/dokumentId.test.js` er
  `/\{\s*u?id:\s*[A-Za-z_]+\.id\s*,[^}]*\.\.\./` — id-nøgle før ETHVERT spread
  i samme objekt. Den fanger nu også de tre variabel-former, der slap før
  (`useMyStageBets`, `useBonusData`, `fix-double-chance`). Men `[^}]*` kan ikke
  skelne et objekt-spread fra et array-spread eller en rest-parameter. Målt
  MATCH på fire LEGITIME former: `{ id: d.id, tags: [...arr] }`,
  `{ id: d.id, items: [...a, ...b] }`, `{ id: d.id, fn: (...args) => args }` og
  `{ id: d.id, ...KONSTANT }` (spread af noget der IKKE er dokumentdata).
  0 forekomster i repoet i dag, så prisen er en fremtidig falsk rød — billig at
  omgå (skriv id sidst) og langt billigere end en falsk grøn. Behold bredden;
  men hvis nogen fjerner en assertion her, så tjek at det ikke er vagten selv.
- **Navne-/profilgiften er LUKKET, men vagten dækker kun 3 af 6 update-grene
  på top-niveau `leagues` (BEKRÆFTET 2026-09-02, 6d14243).** `navnGyldigt()` +
  `ingenIdNoegle()` står på create, ejer-update og (kun navn) liga-admin-update
  — men **IKKE** på forlad-grenen, `isGlobalAdmin()`-grenen eller
  `isOwner()`-grenen (firestore.rules ~L419-427). Emulator-målt: en globalAdmin
  må stadig skrive `id: 'TB'` OG `name: {a:1}` på enhver Tour-liga. Forlad-grenen
  er dækket indirekte af `hasOnly(['memberUids'])` (målt: DENIED). Skaden er i
  dag inert, fordi ALLE læsere er id-først og normaliserer navnet
  (`useLeagues`/`useAllLeagues` → `name: typeof … === 'string' ? … : ''`), og
  fordi `functions/index.js:1872` nu er `{ ...ld.data(), id: ld.id }`. Men
  kommentaren i reglen lover "samme to vagter" og leverer dem kun på ejer-grenen
  — modsat `games/{g}/leagues`, hvor der slet ikke FINDES en admin-skrivegren.
  Vil man have vagten hel, skal `navnGyldigt() && ingenIdNoegle()` også på de to
  admin-grene.
- **`questions.label` er type-vagtet ved CREATE, men ikke ved UPDATE
  (BEKRÆFTET).** `firestore.rules` create kræver `label is string`, 3-120 tegn;
  update-grenen (L1164-1186) kræver kun `points`-båndet. Liga-ejeren kan
  bagefter skrive `label: {toString:null}` (og `facit` ligeså). Præcis den
  faldgrube, huset allerede har skrevet ned — og som `navnGyldigt()` lukkede
  for liganavnet i samme fil.
- **Liga-navnet ved UPDATE på SPIL-ligaer er LUKKET (74ff02d).** Historik:
  `name is string` stod kun ved create, så en spiller, der ejede en liga,
  kunne skrive `{toString:null}` og dermed dræbe `hentLigaMedlemmer`
  (gameLeagues.js L281) for HELE spillet plus `{league.name}` i
  GameLeagues.jsx L195. `navnGyldigt()` gælder nu create OG ejer-update
  (mutationstestet, se RENT-listen).
- **Den afviste kan ikke meldes UD af en liga.** `saetLigaMedlemCore`
  (gameLeagues.js L340-341) tjekker `status === 'rejected'` FOER forgreningen paa
  `medlem` (L347), saa vagten mod "luk den bortviste ind ad bagdoeren" ogsaa
  spaerrer OPRYDNINGEN. Emulator-bekraeftet: admins "Meld ud" paa en rejected
  bruger -> `permission-denied` "Din adgang er afvist. Kontakt en
  administrator." (en besked om MAALETS status vist til ADMINISTRATOREN), og
  `memberUids` uaendret. Den afviste bliver dermed staaende i `memberUids`,
  beholder `leagueIds` paa players-dok og paa alle sine tips, taeller i ligaens
  stilling og serveres stadig af `leagueQuestionStatus`. Fix: flyt vagten ind i
  `if (medlem)`-grenen. Testen (ligaMedlem.test.js L147-152) daekker kun
  `medlem: true`, saa adfaerden er IKKE frosset fast.
- **`leagueQuestionStatus`: intet `isApproved`-tjek.** Callablen kræver kun
  `request.auth` + medlemskab. Et medlem med `status:'rejected'` står stadig i
  `memberUids` — INTET fjerner dem — og får fuldt svar: liganavn, alle åbne
  spørgsmåls-labels, alle medlemsnavne, hvem der har svaret. Rules kræver
  `isApproved()` HVERT sted i leagues-træet, så callablen er strengt mere
  tilladende end klientvejen. Dertil: **læse-forstærkning før autorisation** —
  30 medl × 10 sp = 341 læsninger, 100×60 = 6161, også for en kalder der ender
  med `permission-denied`. Fix begge i ét greb: læs ligaen, tjek medlemskab,
  læs SÅ resten.
- **Griefing via `displayName`/`answer` (type ikke tjekket i rules).**
  `{toString: null}` er et lovligt Firestore-map → `String(...)` i
  `lqNorm`/`rensTekst` kaster `TypeError: Cannot convert object to primitive
  value` → triggeren fejler tavst, og ejerens knap svarer `internal` for altid.
  `a.navn.localeCompare` (gameLeagues.js L112) kaster tilsvarende → knappen er
  død for HELE ligaen. Samme gift rammer KLIENTEN hårdere: `scoreLeagueQuestion`
  kaldes i render, og et map som React-child → hvid side for alle medlemmer.
  Fix ét sted: `String()`-konverteringen i en try, eller filtrér ikke-strenge fra.
  **MÅLT IGEN 2026-09-01 på pulje-fanen (4ee45aa):** giften har ÉT
  fælles knudepunkt på klienten — `rankStandings` (gameStandings.js L17
  `name: u.displayName || 'Ukendt spiller'`, L37 `a.name.localeCompare`). Ingen
  typevagt. Typematrix målt: `42`/`{a:1}`/`['x']`/`true` overlever som streng,
  men `{toString:null, valueOf:null}` KASTER allerede i sorteringen, og et
  almindeligt map (`{a:1}`) kaster i React som child ("Objects are not valid as
  a React child") — begge bekræftet med render-PoC. Efter 4ee45aa kalder
  `PuljeTip` (L130) `useGameStandings` UBETINGET, så en forgiftet liga-fælle
  hvidner nu også pulje-fanen — og FØR deadline, hvor afsløringen slet ikke
  er monteret. Samme gift via liganavnet rammer to NYE render-steder:
  `PuljeAfsloering.jsx` L198 (`{valgtLiga.name || 'ligaens'}`) og L217
  (`<option>{l.name}`). Fix ÉT sted, der dækker alle forbrugere:
  `typeof u.displayName === 'string' ? u.displayName : 'Ukendt spiller'` i
  `rankStandings` — hver render-side hver for sig er en tabt kamp.
- **Bot-forfalskning på liga-væggen.** `messages`-reglen binder KUN `uid` — ikke
  `displayName`, `avatarEmoji`, `system` eller `questionId`. Et medlem kan gemme
  `{uid: sig selv, displayName:'Runde-Botten', avatarEmoji:'🤖', system:true}`.
  Fladen (GameLeagues.jsx L96) viser `byUid[m.uid] || {name: m.displayName, …}`,
  og `byUid` bygges af STILLINGEN. Forlader forfalskeren bagefter ligaen,
  forsvinder hen fra `byUid` → opslaget står som "Runde-Botten 🤖" for alle.
  Fix: rendér efter `m.system === true` + et fast bot-uid, eller kræv
  `!('system' in request.resource.data)` i reglen.
- **Ubegrænsede betalte AI-kald uden admin-port.** `leagueQuestionRecapNow` er
  den første AI-kaldende callable, en ikke-admin (liga-ejer) kan nå. `tvingNy:true`
  springer `botFacitAt` over — 3 opslag + 3 modelkald i træk, ingen cooldown,
  ingen `maxInstances`, ingen App Check. En ejer, der har FORLADT sin liga,
  beholder `ownerUid` og kan spamme en væg, hen ikke selv må læse.
- **xG-synken kan vælte sweep'et — altså facit-nettet selv (BEKRÆFTET, 58e6bc7).**
  `syncSuperligaSweep` (functions-platform/index.js L440) har INGEN
  `timeoutSeconds` og der er intet `setGlobalOptions` → GCF gen2-default 60 s
  (minut-synken har eksplicit 120 s, L380). xG-blokken (L482-508) er lagt FØR
  standings og strandet-alarmen og laver op til `XG_LOFT`=30 SEKVENTIELLE
  HTTP-kald pr. spil à `AbortSignal.timeout(10000)` (syncProviders.js L90) =
  300 s værste fald pr. spil × 2 spil. Målt sekventialitet: 30 kald à 30 ms =
  912 ms, intet samlet ur. Rammer funktionen sit budget, dør HELE løkken: spil
  nr. 2 i `SYNCED_GAMES` får hverken `syncResultsCore`, standings eller
  strandet-alarm, og `skrivDriftStatus` (L549) står SIDST i løkkekroppen, så
  kortet aldrig skrives → tavst. Præcis den fejlform, xG blev flyttet ud af
  minut-synken for at undgå. Fix: eksplicit `timeoutSeconds` på sweep'et, et
  wall-clock-budget ind i `hentXg`, og xG SIDST i løkkekroppen.
- **XG_LOFT er et loft på ØNSKEDE KAMPE, ikke på KALD (BEKRÆFTET).**
  `superliga.hentXg` (syncProviders.js L186-205) løber kildens `data.events`
  igennem og fyrer ét `opta-stats`-kald pr. event, hvis nøgle står i `oenskede`
  — Set'et tømmes aldrig. PoC: 600 dubletter af SAMME event for ÉN ønsket kamp
  → **601 fetch-kald og 600 batch-ops** mod ét dokument. Firestores 500-grænse
  ville afvise commit'en (hele xG-skrivningen tabt), og driftlog-kortet melder
  `xG: 600 hentet, -599 mangler endnu` (`xgMangler: -599`). Testen
  (syncXg.test.js L340-349) måler kun hvor mange id'er KERNEN sender ind, aldrig
  hvor mange kald provideren laver → usynlig for suiten. Fix uden en anden vagt:
  `if (!oenskede.delete(key)) continue;`.
- **`Number(null) === 0` → xG 0,0 skrives og prøves ALDRIG igen (BEKRÆFTET).**
  Kontrakten (syncProviders.js L50) siger "aldrig 0 for ved-ikke", men
  `Number(xg.home)` (L215-216) og pulselives `tal()` (L467-469) gør `null`, `''`,
  `[]` og `false` til et FINITE 0, som `Number.isFinite`-vagten i
  syncXgCore (superligaSync.js L130) lukker igennem. Prøvefiltret er
  `!Number.isFinite(Number(m.data?.xgHome))` (L106), så 0 tæller som "har xG" →
  kampen genforsøges aldrig, og kortet melder GRØNT ("alle færdige kampe har
  tal") på forgiftede data. PoC bekræftet for BEGGE kilder. Fix: afvis
  `null/''/bool/array` før `Number()` (HAR-optagelsen viser, at PL leverer
  rigtige tal, så `typeof v === 'number'` er nok dér).
- **Fremmed kilde → deadline flyttet TIDLIGERE (by-design residual).**
  Genåbnings-forbuddet (superligaSync.js ~L653-659) lukker past→future for ALLE
  kampe — filteret ser på `fraMs`/`tilMs`, IKKE på `result` (rettet 2026-09-03;
  den gamle formulering her var forkert). Men fremtid→TIDLIGERE er TILLADT (legitime reschedules
  kræver det). Backstop er KUN <48t-alarmen; et move på >48t tidligere (7d→3d)
  skrives TAVST — en kompromitteret kilde kan lukke tips tidligt uden alarm.
- **Alarm-druknen.** `mangler` i syncKickoffsCore samler ALLE kilde-kampe uden
  dokument. Kilden leverer hele sæsonens 380 PL-kampe, mens `pl2627-efteraar`
  kun har 180 → 200 poster i alarmen hver dag. Seed-vejen har `--runder 1-18`;
  synk-vejen har intet filter, og `mangler` bygges UDEN for den spejlede
  `kickoffPlan`, så paritetstesten kan ikke fange det.
- **Argument-smugling gennem et tekst-input i et workflow.**
  `.github/workflows/fix-double-chance.yml` L67-72 bygger `args` og kalder
  `node script.mjs $args` UDEN anførselstegn. Med apply-fluebenet på **false**
  og spil-feltet sat til `" --apply"` blev argv `["--game=", "--apply"]` →
  apply=true OG kunSpil="" → skrev i **alle** spil (kørt mod emulator: en
  uvedkommende spillers point gik 99 → 3,3). Ikke RCE — `env:`-værdier
  ordsplittes men kommandosubstitueres ikke — men glob (`*`) ekspanderer.
  Fix: `${GAME:+--game="$GAME"}` eller send alt via env (mønstret i
  rescore-bets.mjs har slet ikke problemet). **Samme fælde er LUKKET i
  seedTeams-trinnet**, hvor `--game "$SPIL"` er i anførselstegn.
- **`sendGameTipRemindersNow` har ingen server-pendant til fanens gates.**
  Hverken `forventerPaamindelser` eller `paused` tjekkes server-side — en admin
  kan mail-spamme et 'finished' spils deltagere med en håndlavet payload.
  Admin→deltagere, inden for admins autoritet, men den eneste kendte gate uden
  server-pendant.
- **15 %-bank-loftet på Chancen håndhæves INGEN steder server-side.**
  `gameScoring.js` L527/L650 kalder `scoreBet(bet, result, odds)` uden `bank`,
  og `clampStake(s, undefined)` klipper kun til MAX_ABS. Ejerens beslutning
  (2026-08-24) er, at loftet bliver en KLIENT-vejledning; `chanceMaxStake` og
  fladens "af maks N" er derfor ikke en regel. MAX_ABS = 8 er det eneste loft,
  og det håndhæves nu af `normaliserIndsats`.
- **`fix-double-chance.mjs`: hårdkodet `{dryRun:false}` i tørkørslens egen sti.**
  To `if (apply)` om SAMME sikkerhedsregel (L118 bet-skrivningen, L128
  `rescoreAllBets({dryRun:false})`). Erstattes L128 med `if (true)`, SKRIVER en
  tør-kørsel i basen, mens den udskriver "der skrives intet" — og ingen test
  bliver rød (scriptet har ingen testfil; vite.config.js L56 kører kun
  `scripts/**/*.test.mjs`). Rettelsen er heller ikke atomar: nedbrud mellem L118
  og L128 efterlader `chanceStake:0` UDEN genscorede point, og en genkørsel melder
  grønt, mens spilleren beholder point. Intet `concurrency:`. Blast radius:
  `rescoreAllBets` omskriver `points` på HVERT bet + alle totaler i spillet.
  Fix: `{dryRun: !apply}`. Sammenlign med `rescore-bets.yml` (kræver
  `skriv == "SKRIV"`, backup som artefakt, GENDAN-vej) — samme primitiv, rigtig indpakning.
- **Doku-drift, der afgør om et audit-fund kan bruges:** `docs/drift.md` ~L457-480
  og `scripts/lib/doubleChance.mjs` L171 påstår begge stadig, at firestore.rules
  ikke nævner chance, så spilleren selv kan skrive `chanceStake`/`chanceSatAt`.
  Falsk siden trin 3. En operatør, der læser det, tør ikke stole på sit eget audit.
- **Én giftig post i STAGE-LISTEN vælter hele kampdetalje-synken (BEKRÆFTET,
  trin 2).** `hentNoegler` (kampDetaljer.js L355-371) kalder `String(e?.Eid ?? '')`
  og `kampNoegle(e?.Esd, …)` UDEN for nogen try. PoC: ét event med
  `Eid: {"toString":null}` (eller samme i `Esd`) blandt 380 → `TypeError:
  Cannot convert object to primitive value` kastes ud af `syncKampDetaljerCore`
  → alle spillets kampe mister detaljer, hver kørsel, for evigt. Den indre
  try/catch (L476-480) dækker KUN `detaljerAf`, altså det ENE kampsvar — ikke
  kortlægningen. Samme gift i `m.data.kickoff` (`noegleAfKamp` L327,
  `new Date({toString:null})` kaster) rammer identisk, men er admin-only, fordi
  rules ikke type-tjekker `kickoff`. Fejler LUKKET og ses som `st.fejl` på
  Drift-kortet. Testfilen dækker `{toString:null}` KUN i `Pn` (L159-161).
  Fix: læg pr. event-kroppen i `hentNoegler` i en try/continue.
- **HTTP-udfald tælles som `uparsede` og udløser den FORKERTE alarm
  (BEKRÆFTET, trin 2).** `hentJson` returnerer `null` ved 5xx (kampDetaljer.js
  L351), og kaldstedet gør `if (!incidents) { ud.uparsede += 1; continue; }`
  (L471). PoC med HTTP 500: `forsoegt=1, skrevet=0, ukendte=0, uparsede=1` →
  sweep-grenen (index.js ~L613) fyrer `detaljerAfvist` med teksten "Kilden har
  sandsynligvis skiftet form — se kampDetaljer.js". En kildenedetid får altså
  en alarm med det forkerte remedie. Fix: eget felt `utilgaengelige`.
  (Samme sted: `batch.commit()` kaldes på en TOM batch, når alle afvisninger
  kom af 5xx — `if (ud.skrevet || ud.uenige || ud.uparsede)` L512.)
- **Drift-kortet skrives EFTER det dyreste led, så en platform-timeout er
  tavs.** `skrivDriftStatus` (index.js ~L668) står efter både xG- og
  detalje-blokken i løkkekroppen. Kommentaren over detalje-blokken påstår
  "hvad der ligger FØR den, er allerede gjort" — det gælder skrivningerne, men
  IKKE statuskortet. Dør invocation'en i detalje-synken, mister spillet sit
  kort OG hele det næste spil sin kørsel. Ny worst-case pr. spil: stage-kaldet
  (10 s, UDEN for budget-tjekket) + `DETALJE_BUDGET_MS` 25 s + ét kald-sæt over
  budgettet ≈ 45 s, oven i xG's 50 s, i et sweep på 300 s for to spil.
- *(delvist lukket 9d7c1fa-tid: xG-sweep-posten ovenfor har nu fået
  `SWEEP_TIMEOUT_S = 300` (index.js L443/L452) og et afledt `XG_BUDGET_MS`
  (L447). Verificér selv, om xG stadig ligger FØR standings/alarm i løkkekroppen
  — dét led er ikke efterprøvet.)*
- **Vagten kan FRYSE et allerede forgiftet liga-dokument (BEKRÆFTET
  2026-09-02, 6d14243).** `ingenIdNoegle()` på ejer-update er UBETINGET og ser
  på `request.resource.data` — altså HELE resultatdokumentet, ikke kun de
  ændrede felter. Har en Tour-liga allerede et `id`-felt (og det KUNNE den få,
  indtil 6d14243 — hullet var bekræftet åbent), er ejeren låst ude for evigt:
  emulator-målt `ejer-joinCode=DENIED, ejer-omdøb=DENIED`. Liga-admin kan
  stadig omdøbe (den gren har ikke `ingenIdNoegle()`), medlem kan stadig
  forlade, og globalAdmin kan alt — men INGEN flade fjerner selve `id`-feltet;
  det kræver Firebase-konsollen. Samme form, mildere: en liga UDEN `name` giver
  `ejer-joinCode=DENIED`, men `ejer-sæt-navn=OK`, og ejeren HAR omdøbnings-UI
  (`LeaguesPage.jsx:217`), så den helbreder sig selv med ét klik. **Lære:** en
  ubetinget felt-vagt på update er en RATCHET, ikke et filter — den rammer
  historiske dokumenter, ikke kun nye skrivninger. Spørg altid: "kan det
  dokument, vagten afviser, allerede findes — og kan nogen så rette det?"
- **Det frie `id`-felt: kortet pr. 2026-09-02 (emulator-målt med kontrol).**
  Reglen forbyder `id` KUN på `games/{g}/leagues` og top-niveau `leagues`
  (create + ejer-update). Feltet accepteres frit på: **`users/{uid}`** (enhver
  logget ind, også `pending`, på egen profil — create afvises kun fordi
  `creatingWithUserEmail()` fanger `email`, ikke `id`), **`games/{g}/players`**,
  **`games/{g}/bets`**, **`bonusBets`**, **`stageBets`**, **`messages`**,
  **`leagueComments`** og **`leagueActivity`**. Alle otte er inerte i dag, fordi
  hver læser er vendt til data-først og holdes der af `dokumentId.test.js` —
  men det er ÉN vagt, og den er en grep-test, ikke en regel.

- **Et 429 på STAGE-kaldet mister sin alarm, når kortlægningen fyrer først
  (BEKRÆFTET, f398627).** `kortlaegEids` (kampDetaljer.js L488-560) laver nu
  stage-kaldet FØR `syncKampDetaljerCore`, og index.js L681-687 RETHROWER
  `KildenLukkerOs` ud i det ydre catch (L768-776) → `st.fejl(...)`, men
  `meldAlarm({type:'detaljerLukket'})` fyrer ALDRIG, for den hænger på
  `d.afbrudt`, og kernen blev aldrig kaldt. PoC kørt: 429 på stage → kortlæg
  KASTER; samme 429 direkte mod kernen → `afbrudt:true` (alarmen fyrer).
  Vinduet er "mindst én kamp uden cachet Eid", altså hver sweep indtil cachen
  er varm og hver gang nye kampe seedes. Med VARM cache rammer 429'en
  incidents, og alarmen fyrer som før (kørt). Konsekvens: Drift-KORTET bliver
  rødt (overskrives næste kørsel), men det vedvarende, kvitterbare
  `driftAlarmer`-dokument med NAT-forklaringen udebliver. Samme klasse som
  5xx→uparset: rigtig farve, forkert remedie. Fix: fang `KildenLukkerOs` i det
  ydre catch og kald samme `meldAlarm` — én vagt, ét sted.
- **`annullerede[]` i `liveMaalAf` har INTET loft (BEKRÆFTET, f398627).**
  `maal[]` er bundet af `kaedeOk` mod VORES stilling (målt: kan ikke sprænges),
  men annullerede mål tælles ikke mod noget: PoC med 20.000 IT-62-hændelser →
  `annullerede.length = 20001`, `JSON.stringify` = **1.580.450 bytes**, altså
  over Firestores 1 MiB pr. dokument. Ingen størrelsesgrænse på `res.json()` i
  `hentJson` heller. Skriver delopgave 5 listen råt i kampdokumentet, fejler
  hele batchen (INVALID_ARGUMENT) — og en batch dækker flere kampe.
  Fix hører i liveMaal.js, ikke i skrivestien: `.slice(0, 25)` efter sorteringen.

- **[LUKKET i 6ed49aa — genkørt, se RENT-listen]** ~~Live-mål-jobbet henter STAGE-LISTEN hvert minut, når én kamp i gang ikke
  kan kobles (BEKRÆFTET, f607272).~~ `syncLiveMaalCore` (liveMaal.js) gør
  `if (valgte.some((m) => !gyldigEid(m.data?.livescoreEid)))` → `hentNoegler`,
  og id'et gemmes FØRST efter et vellykket incidents-svar
  (`if (!cached) skriv.livescoreEid = eid;` står EFTER `if (!incidents) …
  continue`). PoC over 150 simulerede minutter (ét spil, én kamp i gang):
  (a) cachet id → 404 → **149 stage-kald + 150 incidents-kald**, id'et slettet
  ÉN gang og aldrig gencachet; (b) kampen findes slet ikke i stage-listen →
  **150 stage-kald**; (c) kontrol, varm cache + 200 → **0 stage-kald**.
  Stage-listen er 260 KB for PL, så ét ukobleligt levende kamp-dokument koster
  ~39 MB og 150 anmodninger pr. 2,5-timers vindue mod en kilde uden aftale —
  mod 12 kald i døgnet før. Kredsløbsafbryderen fanger det IKKE: 404/5xx er
  ikke 429/403. Det er præcis den adfærd, Eid-cachen blev bygget for at undgå
  (kampDetaljer.js L518-521 skriver det selv), og risikoen er delt NAT:
  bliver egress-IP'en spærret, rammer det api.superliga.dk og pulselive, som
  intet har med livescore at gøre. Fix (vælg én): gem id'et FØR incidents-
  kaldet, eller husk "ingen kobling" på dokumentet med et tidsstempel og slå
  kun op hvert N. minut, eller lad kortlægningen blive i sweep'et og tæl
  kampen `ukendt` i live-jobbet.
- **[LUKKET i 6ed49aa: `livescoreLukketTil`, 1 t pause]** ~~Kredsløbsafbryderen har ingen PERSISTENT nedkøling — og det betyder nu
  60× mere.~~ Et 429 giver `afbrudt` + alarm (dæmpet 6 t), men næste minut
  banker jobbet på igen. Før lå de dyre livescore-kald i sweep'et (12/døgn);
  nu kører de 720 gange i døgnet. Alarmen fortæller ejeren én gang; kaldene
  fortsætter. Overvej et felt (`livescoreLukketTil`) og et spring i toppen af
  jobbet.
- **[LUKKET i 6ed49aa — genmålt til 109,99 s]** ~~`syncGameKampdetaljerNu` kan overskride sin egen `timeoutSeconds`
  (BEKRÆFTET med simuleret ur, f607272).~~ De to kerner har hver sit budget —
  detaljer 90 s, live 20 s — men et budget-tjek i toppen af en løkke kan ikke
  afbryde et `await`, så loftet pr. kerne er `budget + ét kald-sæt` (kaldene
  har `AbortSignal.timeout(10000)`). Målt: detaljer **99,99 s**, live
  **29,997 s**, i alt **129,99 s** mod `timeoutSeconds: 120` (index.js
  L1020/L1041/L1048). Kommentaren fem linjer over callablen advarer selv mod
  netop dette ("brugeren ser en fejl, mens serveren skriver videre") — og
  detalje-batchen ER committet ved ~100 s, mens live-batchen tabes. Krav:
  `B_detaljer + B_live + 20 s ≤ 120 s`. Samme regnestykke rammer det
  SCHEDULEDE job: `LIVE_BUDGET_MS = (60 s × 2/3)/N`, men loftet er
  `40 s + 10 s × N` — 60 s ved to spil (præcis timeouten), **70 s ved tre**.
  En afledt konstant, hvis udledning glemmer overskridelsen, holder kun ved
  det antal spil, den blev skrevet ved.


- **[LUKKET i 27cb861 — genkørt, se RENT]** ~~`forladt`-flaget kunne SÆTTES af
  spilleren selv~~ (BEKRÆFTET åbent i 76c5e9b: players-update spærrede kun
  point-felterne). Skaden var rang-manipulation: serveren springer forladte
  over i `snapshotRoundRanks`/`runGameRoundRecap`, mens `leagueIds` var urørt,
  så klienten (`useGameStandings.js:63`) blev ved med at vise hende og regne
  `rank` selv — falsk rang-pil for hele ligaen, hendes egen pil frosset.
  Rettelsen er asymmetrisk og er den form, der skal genbruges:
  `!(request.resource.data.get('forladt', false) == true
     && resource.data.get('forladt', false) != true)` — klienten må FJERNE,
  aldrig SÆTTE — plus `forladt`/`forladtAt` på create-blacklisten.
- **[LUKKET i 27cb861]** ~~Ejer-vagten i `forladSpil` spurgte på MEDLEMSKAB~~
  (`array-contains memberUids` + filter på `ownerUid`), mens
  `firestore.rules:1113` lader ejeren fjerne sig selv fra `memberUids`.
  **Den regel-egenskab står STADIG** (genkørt mod 27cb861: ejeren kan forlade
  sin egen medlemsliste, kan så ikke LÆSE ligaen, men kan stadig sætte
  `startRound`, omdøbe og SLETTE den). Callablen spørger nu direkte med
  `where('ownerUid','==',uid)` — men enhver ANDEN vagt, der udleder ejerskab af
  medlemskab i spil-ligaer, har det samme hul.
- **[LUKKET i 27cb861]** ~~De to server-veje ind i et spil ryddede ikke
  arkiv-flaget~~ (`redeemLeagueCodeCore`, `saetLigaMedlemCore`), så en forladt
  spiller kunne komme "halvt tilbage": i `memberUids`+`leagueIds` og synlig i
  klientens stilling, mens serveren regnede hende for ude. Begge veje rydder nu
  `forladt`/`forladtAt` (+ `joinedAt`) på et eksisterende dokument, og
  `hentLigaMedlemmer` tilbyder ikke længere forladte som "deltagere".

## Angrebsveje der IKKE virker (afprøvet, gentag ikke)

- **alarmId-fuzz mod `kvitterDriftAlarm`** (functions-platform/index.js L495-508).
  16 fjendtlige værdier mod ægte admin-SDK + emulator: `../users/p1`,
  `..%2Fusers%2Fp1`, backtick-varianter, NUL-byte, 1600 tegn, objekt/array/tal/
  bool, `__proto__`, `constructor`, `prototype`. **Ingen** forlader
  `driftAlarmer/`; kontrol-dokumentet `users/p1` var urørt. Prototype-tricks er
  umulige: værdien bliver aldrig en objektnøgle, kun `String()` → doc-id.
- **Sti-fuzz mod `adminHentLigaMedlemmer`/`adminSaetLigaMedlem`.** 23 fjendtlige
  vaerdier x 3 parametre (`maalUid`, `leagueId`, `gameId`): `../users/OFFER`,
  `users/OFFER`, `g1/leagues/L1`, `L1/x`, `L1/x/y`, `__proto__`, `__name__`,
  `constructor`, NUL-byte, 1600 tegn, tal/bool/objekt/array, `.`, `..`, `/`,
  `a//b`, trailing space. INTET forlader sin collection; kontroldokumentet
  `users/OFFER` stod uroert paa `status:'pending'` og `L1.memberUids` uaendret.
  Raa Firestore-fejl mappes til `internal` med fast dansk tekst - stien laekker
  ikke. `gameId` med skraastreger kan ramme et EKSISTERENDE dokument (fx
  `g1/leagues/L1`), men dets under-collections er tomme -> tomt svar.
- **IDOR mod chance-callable'en** (`setGameChance`/`setChanceCore`):
  `matchId` = `../m1`, `m1/x` → Firestore-argumentfejl (mappes til `internal`);
  `m1/sub/x` → `no-match`; `''` → `bad-input`; `__proto__` → INVALID_ARGUMENT.
  `gameId` = fremmed spil eller med skråstreg → `not-member` (players-opslaget
  er første vagt). Skrivninger rammer KUN `${uid}_${k.id}`, og `k.id` kommer fra
  serverens egen runde-forespørgsel, ikke fra klienten. Offerets bet urørt efter
  alle angreb.
- **Forfalskning af en ANDENS "har svaret"** er umulig: rules binder
  `answerId == questionId + '_' + auth.uid`, så doc-id'et ender ALTID på
  angriberens eget uid. Kollision med `Q_offer` kræver at offerets uid er
  suffiks af angriberens (samme længde, forskellige) → udelukket. 4 varianter
  kørt, alle nægtet, kontroltest (eget svar) grøn.
- **Skrive i en fremmeds indbakke (`messages`)**: afvist i alle former — liga
  hvor angriber ikke er med, liga kun angriber er med, top-liga uden angriber.
  Vagten er at BEGGE participants skal være i member-listen, og angriber ER
  altid participants[0] via `from`-tjekket. `privateLeagueMembers` kaldes to
  gange, men begge læser SAMME `request.resource.data` → ingen TOCTOU.
- **puljeBets-smugling.** Forkert antal top/bund, points/correct/nedPoints/
  nedCorrect i payloaden, SAMME hold i top OG bund, andens uid — alle afvist,
  også for globalAdmin (ingen isGlobalAdmin-gren). Uden `puljeLockAt` fejler
  BÅDE skrivning og andres-læsning lukket (åbner ikke alt).
- **Forfalskning af live-pulsen.** Spiller/pending/anon kan ikke sætte, flytte,
  fremdatere eller SLETTE `games/{id}.liveHeartbeatAt`, ikke skrive `live` på en
  kamp, ikke oprette et kamp-dok (så en fremmed kilde-event kunne resolve), og
  ikke skrive/læse `driftAlarmer`. 16/16 checks, kontroltest (admin KAN) grøn.
- **Lækage via driftlog-beskeder.** Provider-fejl formuleres som
  `HTTP ${res.status}` (syncProviders.js L137/154/186/250/302) — URL'en når
  ALDRIG en fejlbesked. Superliga-ACCESS_TOKEN (L55-56) er et OFFENTLIGT
  app-token, hardkodet med kommentar — ikke en secret.
- **XSS i alarm-/status-/mail-tekster.** React escaper; `whiteSpace:'pre-line'`
  er ren CSS; intet `dangerouslySetInnerHTML` i DriftTab. Intet SPILLER-skrevet
  indhold når driftlog: `gameNavn` kommer fra games-dokumentet (admin-skrevet),
  `kampId` fra provider-id/doc-id, `m.id` fra `games/{g}/matches` (admin-only).
  `broadcastHtml` (mailer.js L55-57) er sikker: auto-link-regexen kører EFTER
  `escapeHtml`. `mailMarkdown` er generate-safe (link/img kræver `https?://`, så
  `javascript:`/`data:` matcher aldrig).
- **Composite index til tre LIGHEDS-filtre er ikke nødvendigt** (zigzag merge
  join). Prior art: functions/index.js L771-772 kører i produktion uden
  index-def. Kun ulighed/orderBy/array-contains kombineret med andet kræver en.
- **Skrive-forstærkning til driftlog via callables findes ikke.** Alle
  driftlog-/driftAlarmer-skrivninger sker fra `onSchedule`. `kilde:'manuel'`
  (driftlog.js L84) kaldes ALDRIG fra produktionskode. Ingen bruger kan spamme
  ejerens statusflade.
- **Sti-/proto-injektion gennem provider-navne.** `matchDocId`
  (syncProviders.js L67-74) slugger med `.replace(/[^a-z0-9]/g,'')` →
  `../../../etc/passwd`→`etcpasswd`, `__proto__`→`proto`, intet `/` overlever.
  `resolveDocs` sætter kun `map[k]=k` for EKSISTERENDE doc-id'er → et fabrikeret
  id skriver INTET. Suffiks-forveksling findes ikke (eksakt `get()`, ikke
  `endsWith`). Prototype-fælden i `plLiveStatus` er lukket (alle giver `'ukendt'`).
- **Fjendtlige EKSTRA felter fra en kilde** (`result`, `homeGoals`, `points`,
  `kickoff`, `evil:<script>`) når ALDRIG et dokument: mapperne bygger objektet
  felt for felt, og skrivningerne er `batch.update` (kan ikke oprette).
- **Stored XSS via broadcast-billeder.** `uploadBroadcastImage` passerer SAMME
  `contentType` til validering og til `.save()`; kun 4 raster-typer kan gemmes →
  objektet kan aldrig serveres som text/html eller image/svg+xml. Stien er
  server-genereret (`Date.now()-randomBytes(6)`) + saniteret → ingen traversal.
- **Chancen: to samtidige kald i samme runde.** 15 par + 10 tripler kørt mod
  emulatoren: ALDRIG mere end én åben chance. Transaktionen i `setChanceCore`
  bærer dedup'en — den ene kalder retryer og ser den andens skrivning.

- **Et forgiftet `livescoreEid` på kampdokumentet i en URL.** 14 former mod
  `syncKampDetaljerCore` (f398627): `../../admin`, `1784451?x=1`,
  `1784451/../../v1/api/app/admin`, `//evil.example.com/x`, `%2e%2e%2fadmin`,
  ` 1784451`, 13 cifre, CRLF (`1784451\r\nX-Evil: 1`), arabisk-indiske cifre,
  tal i stedet for streng, `{toString:null}`, `{toString:()=>'../../admin'}`,
  array, tom streng. **INGEN** nåede `fetch`; alle faldt tilbage til
  nøgle-opslaget i stage-listen, og kampen blev skrevet korrekt.
  `gyldigEid` (L489) er vagten: `typeof v === 'string' && /^\d{1,12}$/`.
  MUTATIONSKONTROL kørt (guarden → `v != null && v !== ''`): så nåede
  sti-traversal, `//evil.example.com`, CRLF-header-injektion og
  `{toString:()=>'../../admin'}` ALLE frem i URL'en, og `{toString:null}`
  kastede ud af hele kernen. PoC'en KAN altså se en læk — den var ren.
- **Et forgiftet Eid fra stage-listen ind i `kortlaegEids`.** 12 former
  (`../../admin`, `1784451?x=1`, 13 cifre, ` 1784451`, `{toString:null}`,
  `{toString:()=>...}`, null/true/array/tal): kun cifre slipper igennem, fordi
  `hentNoegler` whiteliste'r (L520-521) FØR kortlægningen ser værdien.
  `kortlaegEids` omgår altså ikke filteret. Én giftig post blandt sunde vælter
  ikke længere kørslen (pr-post-try'et er landet).
- **En fjendtlig `noegler`-Map fra en fremtidig kalder.** `kortlaegEids`
  re-validerer IKKE map-værdien før den skrives, så `../../admin` KAN havne i
  `livescoreEid` — men `eidForKamp` validerer ved LÆSNING, så værdien aldrig
  når en URL (kørt: opslaget faldt tilbage til stage-listen og skrev kampen
  rigtigt). Fejler lukket. Kun kalderen i index.js findes i dag, og den giver
  hentNoegler-mappet videre.

## Afprøvet og RENT (gentag ikke arbejdet uden grund)

- **Liga-spørgsmålenes afsløring (destilleret fra eget sag-afsnit):** væggens
  læsekreds er en DELMÆNGDE af svarenes læsekreds efter facit — også for et
  medlem, der kommer til efter opslaget — og `sov`-listen kan ethvert medlem
  regne ud af `memberUids` selv. `skalAfsloere` er ufølsom: rettelse, bottens
  egen markør og sletning giver alle `false`.
- **Invitations-mailens ØVRIGE felter (destilleret fra eget sag-afsnit):**
  `esc()` på `shortName || name` virker (kontroltestet — PoC'en ville have set
  den rå værdi), admins fritekst `intro` escapes, resten er faste konstanter,
  `poolSize = Number(x) || 6` kan aldrig blive en streng, og spil-opslaget er
  admin→admin (`read: isApproved()`, `create,update: isGlobalAdmin()`).
  Kun `href="${cta}"` var hullet — se VIRKER.
- **Forlad-modellen er genkørt mod 27cb861: 20/20 grønne PoC-checks.** Lukket:
  flaget kan ikke sættes (update, merge-set og create alle DENIED), ejer uden
  medlemskab giver `owns-league` og skriver intet, og `laast` er nu det delte
  `erKampLaast` (målt for seks kamptyper: facit-med-fremtidig-kickoff,
  live-med-fremtidig-kickoff, uden kickoff, ukendt kamp og passeret kickoff
  BEHOLDES nu; kun ægte kommende tips slettes). Positive kontroller grønne, og
  de er dem, der gør fundet troværdigt: en forladt spiller kan stadig FJERNE
  flaget (vende tilbage) og opdatere `favoriteTeam` med flaget uændret, og en
  ny spiller kan tilmelde sig rent.
- **`erAktivDeltager()` (27cb861) åbner intet og bryder ingen query.** Alle fire
  brugssteder er SKRIVE-grene (puljeBets create/update, bets create, bets
  update, liga-create) — ingen `allow read`/list, så der er intet
  "regler er ikke filtre"-problem og ingen get()-budget pr. dokument i en
  forespørgsel. Målt: fire lovlige skrivninger fra en aktiv deltager lykkes
  (bets create + update, puljeBet, liga-oprettelse), tre fra en forladt
  afvises, og hun kan stadig læse sit eget arkiv.
- **Et ikke-boolsk `forladt` (`'ja'`, `1`) kan stadig skrives af klienten og er
  INERT.** Serveren (`erForladt`) og de tre klient-gates
  (`useGame.js:103`, `useGames.js:126/128`) bruger alle `=== true`/`!== true`.
  `GamePage.jsx:123/140` er truthy-tjek, men de sidder inde i `{!isMember ? …}`,
  og `isMember` er `!== true` — grenen er uopnåelig. Hygiejne, ikke et hul.
- **`forladSpil`-callablen selv er ren på identitet og rækkefølge (2026-09-03,
  76c5e9b).** `index.js:1097` tager KUN `gameId` fra `data`; uid kommer fra
  `request.auth?.uid`, og `forladSpilCore` kaster `unauthenticated` som
  ALLERFØRSTE linje — ingen læsning betales for en anonym kalder. Ingen sti i
  data kan overstyre uid. `gameId` er ikke whitelistet, men fejler lukket:
  ulige sti-segmenter → argumentfejl → `internal`; et lige antal (fx
  `g1/players/u1`) rammer et players-dokument uden `status` → `not-open`.
  Fejlteksten `owns-league` afslører kun ligaer, hun selv ejer og er medlem af.
- **Forlad + vend tilbage giver IKKE en ny Chance i samme runde.**
  `setChanceCore` (chanceVagt.js:280-291) tæller åbne chancer på BETS i runden,
  og `forladSpil` beholder netop de tips, hvis kickoff er passeret — altså den
  brugte chance. Divergensen ligger et andet sted, se faldgruben om
  `erKampLaast`.
- **`syncPlayerLeagues`/`applyMembershipDelta` knækker ikke på et forladt
  players-dokument** (playerLeagues.js:43-52): den gør `ref.update({leagueIds})`
  på et dokument, den lige har `get`'et; `forladt` er uden betydning.
  Rækkefølgen i kernen (slet tips → arrayRemove → sæt flag) betyder, at
  bet-sletningerne er FÆRDIGE, før triggeren fyrer, så `applyBetLeagueDelta`s
  `batch.update` ikke rammer et slettet dokument.
- **Regel-vagterne i 74ff02d er MÅLT, ikke læst (2026-09-02).** 250/250 grønne
  mod emulatoren, og SEKS mutationer mod `RULES_FILE`-kopier — alle dræbt:
  `ingenIdNoegle()→true` (3 røde), `navnGyldigt()→true` (1), `ingenIdNoegle`
  fjernet fra UPDATE men beholdt i create (2), `navnGyldigt` fjernet fra
  ejer-update-grenen alene (1), `displayNameGyldigt` fjernet fra egen-update
  (1) og fra create (1). Hver vagt har altså sin EGEN røde test — placeringen
  er dækket, ikke bare eksistensen. Kontroltests grønne: ejer omdøber, ejer
  sætter `startRound`, create uden `id`, medlem forlader rent, displayName som
  streng. 16 egne PoC-checks oveni.
- **To bivirkninger af `navnGyldigt()`/`ingenIdNoegle()` — begge målt, begge
  uden for rækkevidde i dag.** (a) En spil-liga UDEN `name`-felt kan slet ikke
  opdateres af ejeren mere (`navnGyldigt()` er ubetinget, modsat
  `startRoundGyldig()`/`displayNameGyldigt()`, der begge er
  `!('x' in …) || …`). Alle spil-ligaer skabes af `createLeague`
  (gameLeagueActions.js L57-64) med `name` som streng, og create-reglen har
  altid krævet det — så feltet kan kun mangle via konsollen/Admin SDK.
  (b) Et dokument, der ALLEREDE har et `id`-felt, er frosset: ejeren kan ikke
  omdøbe, og et medlem kan IKKE FORLADE ligaen (`ingenIdNoegle()` står foran
  begge grene). `updateDoc(ref, {id: deleteField()})` virker (målt), men der
  er ingen knap for den. Findes der forgiftede dokumenter i produktion, er
  deres medlemmer låst inde — et scan af `games/*/leagues/*` for nøglen `id`
  hører til i udrulningsplanen.

- **Rettelsen 5c4b9e0 (pulje-reglen) HOLDER — efterprøvet, ikke læst
  (2026-09-01).** 241/241 i `functions/rules.test.js` + 30 egne PoC-checks mod
  emulatoren. Mutationstestet på fire måder, alle røde og alle fanget af
  repoets EGNE nye tests: (a) `afterDeadline()` → `!beforeDeadline()` → rød på
  null-testen; (b) `deltager()` fjernet → rød på ikke-deltager-testen;
  (c) tidssammenligningen fjernet → 4 røde; (d) den forkerte rettelse inde i
  `beforeDeadline()` (`gameLock() == null || …`) → rød på
  "null-deadline lukker STADIG skrivningen". Læse- og skrivevinduet har altså
  hver sin vagt, og det er BEVIST, ikke skrevet. Ingen anden regel i filen
  bruger en negeret tidsvagt (grep: alle `request.time`-sammenligninger er
  positive; de resterende `!`-led står på `request.resource`-prædikater i
  skrivegrene, hvor en evalueringsfejl fejler lukket).
- **`PuljeAfsloering.jsx` — den FØRSTE klient på cross-user-vejen — passer
  reglen (2026-09-01, 23 PoC-checks + 244/244 i repoets suite).** Klientens
  form er `getDocs(collection(games/{g}/puljeBets))` UDEN `where`, og den er på
  den rigtige side af asymmetrien: efter deadline lykkes den for en deltager
  (målt også ved 60 og 250 dokumenter — de tre `get()` i læsegrenen er
  konstante stier), før deadline afvises den, og det gør ALLE former uden
  `where(documentId())`. Kontroller grønne: manglende/`null`/tal-`puljeLockAt`,
  ikke-deltager, `pending`, anonym → afvist; eget dokument læsbart før deadline;
  skrivning efter deadline, `delete` og `points`/`correct`/`nedPoints`/
  `nedCorrect` i payloaden afvist. Klientens ur er irrelevant: `locked`
  (PuljeTip.jsx L148, `Date.now()`) styrer kun MONTERINGEN — reglen bruger
  `request.time`, så et ur stillet frem giver `permission-denied`, og et ur
  stillet tilbage viser bare ingenting. Komponenten mounts kun bag
  `isMember`-gaten i GamePage.jsx L121, så kalderen har altid et players-dok.
- **En AFVIST `getDocs` er TAVS i browserkonsollen — modsat en afvist skrivning.**
  Målt: en nægtet `getDocs` gav NUL `console.*`-output og ingen
  unhandledRejection med `.then/.catch` (uden `await`), mens hver nægtet
  `setDoc` printer `GrpcConnection RPC 'Write' stream error … PERMISSION_DENIED`
  med regel-LINJENUMMER. Et "fejl stille"-design på en LÆSNING er derfor ægte
  tavst; på en SKRIVNING er det ikke. Ingen tip-data i støjen.
- **`championship`-ELEMENTERNE er ikke type-vagtet i rules** (kun `is list` +
  `.size() == poolSize()`). Målt: en spiller KAN gemme
  `[{toString:null}, {a:1}, 'A'.repeat(50000)]`. `puljeAfsloering.js` er immun,
  og det er efterprøvet, ikke læst: `holdTilslutning` nøgler outputtet på
  spillets `teams` (giften bliver aldrig en række), `puljeScore` bruger kun
  `Set.has` (ingen `String()`, ingen `localeCompare` på picks), og
  `erAfgjort`/`enegaengerTekst` rører kun tal og uid'er. Fire PoC-checks grønne.
  Husk formen ved NÆSTE forbruger af `championship` — den er den klassiske
  `{toString:null}`-gift, og reglen stopper den ikke.
- **Navne-grænsen i afsløringen holder.** `navnAf` slår op i `useGameStandings`,
  hvis players-query er `where('leagueIds','array-contains-any', mine ligaer)`
  — målt: en deltager i en ANDEN liga er ikke i svaret, så en enegænger uden
  for ligaen bliver `'kun én spiller'`, aldrig et navn. Aggregatet ("1 af 13")
  er spillets, navnene er ligaens, og fladen siger kredsen ærligt
  ("Efter deadline er puljen åben for alle i spillet", PuljeAfsloering.jsx L114
  + FootballHelp.jsx). Udledning fra fladen ALENE kan ikke navngive en
  ikke-liga-fælle: ranglisten viser `rigtige`, aldrig picks. Devtools kan
  stadig (uid → `users/{uid}.displayName`), men det er den kendte, accepterede
  åbning — fladen tilføjer intet.

- **Identitets-bindingen i afsløringen er RETTET og mutationstestet
  (2026-09-01, 4ee45aa).** `PuljeAfsloering.jsx` L95 er nu
  `{ ...d.data(), uid: d.id }` — doc-id'et vinder, som på serveren
  (`functions-platform/gameScoring.js` L453/455 bruger `d.id`). Render-PoC:
  et dokument med id `u3` og feltet `uid:'me'` giver "kun Carla", ikke
  "kun dig", og ranglisten får tre forskellige rækker. Mutationen tilbage til
  `{ uid: d.id, ...d.data() }` gør PRÆCIS angrebstesten rød og lader
  kontroltesten (ægte enegænger → "kun dig") være grøn — PoC'en måler altså
  rettelsen og ikke sig selv. Samme mønster i `useGameStandings` L66/L85 er
  dækket ved kilden: players-reglen binder `uid` BÅDE ved create (L706) og
  update (L735).
- **Spilleren kan IKKE skrive sine egne pulje-point (16 PoC-checks, emulator,
  2026-09-01).** `firestore.rules` L907
  `!request.resource.data.keys().hasAny(['points','correct','nedPoints','nedCorrect'])`
  gælder BEGGE skriveformer: hvert felt for sig og alle fire på én gang afvist,
  ved create og ved update — også `points: 0` (nøglen, ikke værdien). Efter
  deadline afvises update, championship-ændring og delete, mens `getDoc` stadig
  lykkes (kontrol: PoC'en kan skelne "lukket" fra "alt er lukket"). Derfor kan
  `erAfgjort` (som kun ser på `correct`) ikke tvinges, og `puljeVindere`, der
  nu kårer på POINT, kan ikke forfalskes. Kun `Points` med stort P slipper
  igennem — der findes ingen læser af den nøgle.
- **Dubletter i `championship` kan ikke inflatere score.** Reglen tjekker kun
  `size() == poolSize()`, så `['A','A','A','A']` GEMMES (emulator-målt) — men
  `puljeScore` (src/lib/superligaScoring.js L502) dedupliker med
  `[...new Set(picks)]`, og `perfect` kræver desuden `valgte.length === antal`.
  Serveren bruger SAMME funktion (functions-platform/gameScoring.js L443/448),
  så klient og server er enige. Målt: 4×'A' mod facit {A,B} → `{correct:1,
  points:5}`; kontrol med fire ægte → `{correct:4, points:30}`.
- **Fremmede holdnavne i `championship` kan hverken skabe en række eller
  injicere markup.** `holdTilslutning` (puljeAfsloering.js L64) nøgler
  outputtet på spillets `teams`, så `'FC Onde'` og
  `'<img src=x onerror=alert(1)>'` forsvinder sporløst (render-PoC: præcis
  `teams.length` rækker, intet `<img>`, intet `onerror` i markup'en;
  kontrol: et ægte holdnavn giver en række). Talnævneren `antalTip` er
  `bets.length` og kan ikke pilles ved.
- **Fejltilstanden i afsløringen er tavs.** `PuljeAfsloering.jsx` L96
  `.catch(() => setBets([]))` logger intet og viser intet; L128 gør "afvist",
  "tom" og "henter" til samme skærmbillede. `PuljeTip` destrukturerer kun
  `{ standings, leagues }` fra `useGameStandings` (L130) og viser ALDRIG
  hookens `error`. Den ENESTE nye støj på pulje-fanen er hookens egen
  `console.error('useGameStandings (deltagere) fejl:', err)` — en FirebaseError,
  ingen tip-data.
- **Ingen anden forbruger mistede adgang ved deltager-gaten.** De eneste
  læsere af `puljeBets` er `PuljeTip.jsx` (eget dokument — egen-grenen er
  urørt, målt også uden players-dokument) og den nye afsløring; serveren læser
  med Admin SDK (`gameScoring.js` L400, `index.js` L1309) og rammes ikke.
  BEMÆRK dog: der er ingen admin-gren, så en globalAdmin UDEN players-dokument
  afvises — bygges der nogensinde en admin-flade over pulje-tippene, skal den
  gå gennem en callable.

- **`syncGameKickoffsNow`** (functions-platform/index.js L371): auth → rolle →
  `SYNCED_GAMES.find` → `Object.hasOwn(PROVIDERS, …)`. Intet bruger-input når
  skrivningen. `dryRun` fejler lukket i begge ender (kernens er den bærende).
  Selv med `dryRun:false` kan callablen IKKE genåbne en pulje.
- **Målt adgangsmatrix for synk-callables:** anon → `unauthenticated`, 0
  læsninger. pending, approved player og bruger UDEN users-dok →
  `permission-denied` efter PRÆCIS 1 læsning, 0 skrivninger, 0 fetch.
  owner/globalAdmin (også pending) når netværket (kontroltest grøn).
  Ondt gameId `../users/ejer` → `invalid-argument` efter 1 læsning, 0 fetch.
  → **timeoutSeconds ændrer ikke angrebsfladen**: budgettet er kun nåbart efter
  rolle-porten. Generelt: et hævet timeout er kun farligt, hvis autorisationen
  står EFTER det dyre arbejde.
- **Adgangsmatrix for admin-liga-medlemsstyringen** (`tjekMedlemsstyringAdgang`,
  gameLeagues.js L149-152): 17 afviste kaldere mod BEGGE kerner - uden auth,
  ukendt uid, `pending`, manglende `status`, `rejected`, godkendt spiller,
  liga-EJER, og en `pending` globalAdmin. Alle afvist efter PRAECIS 1 laesning og
  0 skrivninger; `memberUids` og maalets `status` verificeret uaendret bagefter.
  Kontroltest groen: approved `globalAdmin` og `owner` kommer igennem. Vagten har
  den rigtige form (`status !== 'approved'`, ikke `=== 'rejected'`), saa et
  manglende brugerdokument fejler lukket, og den staar FORAN de dyre laesninger.
  Kryds-spil: `leagueId` fra et andet spil -> `no-league`, det andet spils
  `memberUids` uroert. Liga-EKSISTENSEN tjekkes foer auto-godkendelsen, saa et
  ugyldigt leagueId ikke kan godkende nogen (som `redeemLeagueCodeCore`).
  Svaret bygges felt for felt (intet `...data`): `code` og `startRound`
  verificeret fravaerende, `displayName` type-vagtet og klippet.
- **`hentTipStatus`** er stærk-ved-konstruktion: `betByUid` er
  `Map<uid, Set<matchId>>` (picket kommer aldrig ind i processen), og både
  output og `manglende` bygges felt-for-felt — INGEN `...m`/`...u`-spread.
  Intet pick, ingen points, ingen privat e-mail forlader svaret. Samme gælder
  AI-fakta i `leagueQuestionRecap`.
- **`fieldMask: []` er en ÆGTE, bærende vagt.** Målt på wire-niveau:
  `readOptions.fieldMask = []` er TRUTHY → `request.mask = {fieldPaths: []}` →
  backend returnerer `exists:true` og `data() === {}`. Det hemmelige felt findes
  ikke engang i det RÅ snapshot-objekt.
- **`requireAdmin` er FØRSTE linje** i `sendBroadcastEmail`,
  `uploadBroadcastImage` og `sendGameTipRemindersNow` — ingen pending/menig når
  hverken data, SMTP eller Storage.
- **`syncXgCore`s skrive-omfang er RENT (PoC, 58e6bc7).** Objektet bygges felt
  for felt (`xgHome`, `xgAway`, `xgSyncedAt` — målt: præcis de tre), så fjendtlige
  ekstrafelter fra kilden (`result`, `odds`, `locked`, `points`) når aldrig
  dokumentet. `gameId` kommer fra `SYNCED_GAMES`, aldrig fra en kalder — ingen
  callable, ingen klientvej. En fabrikeret `sourceKey` (`../../users/offer`)
  skriver INTET: begge `resolveDocs` binder mod de indsendte `docIds`.
  `recomputeGameMatch` (index.js L118 `if (prevResult === nextResult) return;`)
  returnerer FØR alt arbejde, så en xG-skrivning udløser hverken point, Elo
  eller Runde-Bot. Ingen nøgle/URL i fejltekster (`HTTP ${status}`, `continue`).
  ÉN hærdning tilbage: skrivningen er `set(..., {merge:true})` og kan derfor
  OPRETTE et kamp-dokument; `batch.update` er husets vane netop som den vagt.
- **`teamsVagt`** (src/lib/seedFootball.js L348-374) er en ægte backstop, ikke
  pynt: forkert spil-fil, subcollection-sti, `../users/offer`, smuglet elo og
  fjernet hold gav alle ⛔ + exit 1 med intet skrevet. Kontroltest grøn: legitim
  farverettelse skriver PRÆCIS `teams` + `updatedAt`.
- **`londonTilUtcMs`/`kickoffMs`-regexerne** er fuldt ankrede med faste
  kvantorer → lineære. Målt: 500 000 tegn på ~1 ms. Ingen ReDoS.
- **Zone-vagten i `pulselive.hentKickoffs`** kaster FØR planen bygges → ingen
  delvis skrivning. Fanges pr. spil; andre spil kører videre.
- **Ingen hemmeligheder i synk-koden** (pulselive kræver kun Origin/Referer).
  App Check håndhæves ingen steder i functions-platform (konsistent,
  præeksisterende).
- **NaN-hærdningen af puljeLock-genåbningen holder** (6/6 kanter):
  `game.puljeLockAt !== undefined && (!Number.isFinite(nuMs) || nuMs <= nowMs)`.
  Fraværende felt → skriver (første udledning); `null`, uparselig streng, `0`,
  Timestamp med `toMillis()=NaN` → alle AFVIST.
- **Loop'et i `gameTipReminders`** (index.js L1078-1113) kan ikke dræbes af ét
  spil: hver del fanger sin egen fejl, OG kadence-beregningen er givet som
  FUNKTION → evalueres inde i try'et. **Brug det som reference** — modsat
  `naesteSweepFoerMs(Date.now())` (index.js L394), hvor argumentet evalueres FØR
  kaldet og uden for try'et, så et kast dræber sweepet for de resterende spil.
- **`runGameTipReminders` returnerer kun TAL** — ingen modtager-identiteter.
  Adresser går kun til console.error.
- **`getDocs(games/{g}/matches)`** er tilladt for enhver `isApproved()`,
  dokument-uafhængigt → ingen "regler er ikke filtre"-fælde.
- **Data er adskilt pr. Firebase-projekt**, så den delte regelfil giver ingen
  krydskontaminering (top-niveau `leagues` er tom på platformen → Tour-grenen
  dér fejler bare lukket).
- **`setChanceCore` er BEKRÆFTET RENT.** approved slipper igennem; pending,
  rejected, manglende `status`, manglende users-dok og manglende players-dok
  afvises. `stake`-fuzz (20 værdier: 9, 1e21, MAX_SAFE_INTEGER, '4', true, [],
  {}, NaN, 1e-7, 4n, 0.5) → kun heltal 0 og 1..8. Alle låse-varianter holder
  (kickoff passeret, ETHVERT live-felt inkl. 'afbrudt', facit i begge former,
  manglende/uparseligt kickoff, manglende runde). Gentaget identisk kald →
  `uaendret: true`, ingen skrivning.
- **Livescore trin 1 (9d7c1fa) rører IKKE produktion.** `livescoreHold.js` er en
  ren tabel + to rene funktioner; grep over hele repoet: den `require`'es KUN af
  `livescoreHold.test.js`. Ingen Cloud Function, ingen callable, ingen klient
  importerer den. Eneste netværkskald ligger i testen og i
  `scripts/maal-livescore.mjs`. `kampNoegle` kaldes ingen steder i produktionskode.
- **`kampDetaljer.js` (livescore trin 2) er BEKRÆFTET RENT på skriveomfanget.**
  MUTATIONSTESTET, ikke bare læst: erstattes `for (const felt of
  SKRIVBARE_FELTER)` (L494-496) med `Object.assign(skriv, svar.felter)`, lander
  `result`/`homeGoals`/`kickoff` i skrivningen; med filteret gør de det ikke.
  Den frosne liste ER altså vagten, og der er ÉN af dem. Begge skrivninger er
  `batch.update` — intet `set(merge:true)`, så en fremmed post kan ikke OPRETTE
  et kampdokument. Doc-id'et er `m.id` fra `allMatches`, aldrig fra kilden.
  Fjendtlige ekstrafelter i BÅDE `incidents/` og `info/` (`result`, `homeGoals`,
  `awayGoals`, `kickoff`, `points`, `evil`) når aldrig dokumentet.
- **`maal[]` kan ikke sprænges af kilden.** `kaedeOk` kræver
  `maal.length === facit` OG numrene 1..facit, og `facit` er VORES egne
  `homeGoals`/`awayGoals`. PoC: 999 fabrikerede mål mod facit 2-1 → `uenig`,
  intet skrevet. Kun hvis vores EGET dokument sagde 999-0, blev listen 999 lang
  (79 KB, scorernavne klippet til 40 tegn) — altså langt under 1 MiB, og kun
  admin kan skrive `homeGoals`. `heltal` er `/^\d{1,3}$/`, `tilskuertal`
  `1..999999`.
- **Kredsløbsafbryderen på 429/403 virker.** PoC: 403 på stage-kaldet → 1 kald
  i alt, `afbrudt:true`, intet skrevet. 429 på `incidents` med 3 kampe i køen →
  3 kald i alt (parret `Promise.all` når at fyre begge), resten sprunget over,
  allerede validerede kampe i batchen bevaret. Ingen unhandled rejection.
  RESIDUAL: afbryderen er PR. SPIL og PR. KØRSEL — nabospillet i samme sweep
  laver stadig sit eget stage-kald (og rammer så selv 429), og der er ingen
  persistent nedkøling mellem kørsler.
- **`syncGameKampdetaljerNu` lækker intet.** Svaret er `syncKampDetaljerCore`s
  tælleobjekt: otte tal + en boolean, ingen identiteter, ingen URL'er, ingen
  kilde-fritekst. Rolleporten (`owner`/`globalAdmin`) står efter PRÆCIS 1
  læsning og før `allMatches` og alt netværk; `gameId` slås op i den STATISKE
  `SYNCED_GAMES`, så et frit id ikke kan ramme et vilkårligt spil.
- **Kilde-fritekst når ALDRIG AI-prompten.** `gameRecap.js` L192-207 bygger
  `matches`/`udsatte` felt for felt (`home`, `away`, `score`, `surprise`) — der
  er intet `...m`-spread. `maal`, `scorer` og `oplaeg` findes ikke i fakta.
  Målscorernavne bruges kun i `FootballTip.jsx` som React-børn (escapes).
- **`selvmaal` + `detaljerVersion` (584d845) er BEKRÆFTET RENT bortset fra ét
  kast.** PoC kørt uden emulator (fake db + fetchFn, se PoC-opsætningen):
  `selvmaal` er `h.IT === 39` og derefter `m.selvmaal === true` — typeof
  BOOLEAN for alle giftige `IT` jeg prøvede (`'39'`, `' 39'`, `{}`,
  `{toString:null}`, `[39]`, `true`, `null`, `undefined`) og immun over for
  `Object.prototype.selvmaal = true`. Skrivningen indeholder præcis
  `detaljerSyncedAt, detaljerVersion, halvleg*, tilskuere, maal` — en kilde,
  der returnerer `result/homeGoals/awayGoals/kickoff` i incidents- eller
  info-svaret, får dem IKKE med (kørt). Loft (8 af 20 kandidater = 17 fetch),
  wall-clock-budget og 429-kredsløbsafbryder virker uændret EFTER versions-
  bumpet. En genhentning, hvor kilden har mistet `Incs`, skriver kun
  `detaljerAfvistAt/Grund` — de gamle `maal` overlever (kørt).

- **Efter-facit-detaljer i minut-jobbet (61a6e71) er BEKRÆFTET RENT — PoC kørt
  uden emulator (fake db + fetchFn).** `efterFacitDetaljer` er kun en
  genlæsnings-indpakning om `syncKampDetaljerCore`; ingen ny skrivesti.
  Målt: (a) 12 kampe med facit i SAMME minut → `valgte=8`, **17 livescore-kald**
  (1 stage + 2×8), altså præcis sweep'ets eget pr.-spil-loft — ingen ny
  kvote-spids; (b) en kamp, der ALLEREDE har `detaljerSyncedAt` + version 2,
  giver **0 livescore-kald** (filteret ligger FØR stage-kaldet, L556), så et
  flappende facit kan ikke lave en kald-storm; (c) 429 på 3. kamp →
  `afbrudt=true`, 2 skrevet, ÉT commit, ingen kald efter; (d) en kilde, der
  lægger `result/homeGoals/awayGoals/kickoff` i incidents-svaret, får dem IKKE
  med; scorernavnet er `rensTekst`'et (`Ondt <script>Navn` → `Ondt scriptNavn`).
- **Kilden kan ikke styre HVILKE dokumenter der røres.** `syncResultsCore`
  (superligaSync.js L166) gør `provider.resolveDocs(sourceKeys, current.keys())`,
  og SL's implementation (syncProviders.js L348-353) er `new Set(docIds)` +
  `kendte.has(k)` — værdierne er altså ⊆ vores egne pending-dokument-id'er.
  `rettede` arver den binding. PoC: `rettede: ['../../users/offer','r1-a']` →
  kun `r1-a` skrives (det fremmede id koster ét spildt `doc().get()` og falder
  på `!d.result`). `pendingMatches` filtrerer `result == null`, så en kamp kan
  kun stå i `rettede` ÉN gang — ingen genkaldsløkke.
- **Detalje-skrivningen kan ikke gen-udløse en afregning.** `recomputeGameMatch`
  (index.js L120-122) returnerer på `prevResult === nextResult`, og
  forbudslisten holder `result` ude af skrivningen. Ingen skrivekonflikt med
  Elo-vejen heller: `recomputeSeasonElo` (gameScoring.js) springer spillede
  kampe over (`if (matchOutcome(m)) continue;`) og rører kun FREMTIDIGE kampes
  `odds`/`elo*` — den netop afgjorte kamp skrives aldrig af begge veje.
- **Et livescore-429 kan ikke ramme facit-synken.** Trinnet ligger efter HELE
  `runScheduledSyncAll` og efter driftlog + `tjekLivePuls` for alle spil
  (index.js L389-453), afbryderen er per-invocation uden delt tilstand, og de
  andre kilder er andre værter. `meldAlarm` dæmper 6 t på doc-id
  `{gameId}_detaljerLukket`, som minut- og sweep-grenen DELER — ingen spam,
  men den først fyrede besked vinder i 6 timer.

- **Eid-cachen + liveMaalAf (f398627, delopgave 2-4) er BEKRÆFTET RENT bortset
  fra de to poster i VIRKER-listen.** PoC uden emulator (fake db + fetch-spion,
  se PoC-opsætningen). Målt:
  (a) **Skriveomfang:** `kortlaegEids` skriver KUN `{livescoreEid}` — også når
  stage-svaret bærer `result/homeGoals/awayGoals/kickoff/points/maal/
  detaljerVersion/livescoreEid:'../../admin'` på både stage- og event-niveau.
  Doc-id'et er `m.id` fra vores egen liste, aldrig kildens. `batch.update`,
  ikke `set` — en fremmed nøgle kan ikke OPRETTE en kamp.
  (b) **`SKRIVBARE_FELTER.includes('livescoreEid')`-vagten i kortlaegEids er
  en ÆKVIVALENT mutation** (samme form som forbudslistens tautologi): fjernes
  `if`'et, sker der intet. Fjernes derimod feltet fra listen, bliver `skriv`
  tomt, og Admin SDK'ens `update({})` KASTER (verificeret mod
  @google-cloud/firestore) → fanget af index.js' warn-catch, fallback til
  gammel vej. Fejler lukket og støjende.
  (c) **Giftigt kickoff på VORES kampdokument** (admin-skrivbart, ingen
  feltliste i rules) → kampen tælles `ukendt`, kørslen fortsætter (try'et i
  `noegleAfKamp`).
  (d) **`liveMaalAf` er ren og kaster ikke** på 13 fjendtlige `Pn`
  (XSS, ANSI-escape, RTL-override, nulbredde, NUL-byte, prompt-injektion,
  500 tegn) eller 9 ikke-streng-typer (`{toString:null}`,
  `{toString:()=>{throw}}`, Symbol, Object.create(null), array, tal, bool).
  Alt går gennem `navn()` → `rensTekst` (max 40, `<>{}[]\`` og kontroltegn
  væk). RESTEN ER UÆNDRET: `"`, `&`, U+202E og nulbredde overlever — ufarligt
  i React, farligt i et HTML-attribut eller en mail.
  (e) **Fremmede koder fejler i den SIKRE retning:** `IT:'62'` (streng),
  `Nm:3`, `Min:-5`, `Min:'9999'` giver alle ingen annulleret post.
  Uenighed pr. SIDE afviser (kørt: 1-0 mod 0-1 = uenig).
  (f) **`liveMaal: FieldValue.delete()` i syncResultsCore (L203) tilføjer
  INGEN ny eksponering.** Feltet ryddes i NØJAGTIG samme `batch.set` som
  `result/homeGoals/awayGoals/status:'finished'` — en kilde, der kan lyve om
  `finished`, skriver allerede FACIT, hvilket er uendeligt værre end at rydde
  en live-liste. Den nye `cur.liveMaal == null`-vagt giver højst ÉN ekstra
  skrivning pr. kamp (`delete` gør feltet fraværende → næste kørsel springer
  over), og `recomputeGameMatch` returnerer på `prevResult === nextResult`.
  (g) **Kald-regnskabet (påstand efterprøvet, ikke antaget):** kold cache =
  1 stage + 8x2 = **17 kald** (uændret fra før); VARM cache = **16** (stage-
  kaldet forsvinder helt, `mangler.length===0` returnerer FØR `fetch` og før
  `gameRef.get()`). Efter-facit-vejen: 7 → **6** kald for 3 kampe. Ingen nye
  kald nogen steder; kortlægningen genbruger sweep'ets ene stage-kald og
  giver mappet videre, så det aldrig hentes to gange i samme kørsel.
  (h) **Første sweep efter udrulning skriver Eid på HELE sæsonen i ÉN batch**
  — 132 ops (SL) / 380 (PL). Under Firestores 500-grænse, men kun 120 docs'
  headroom, og klienten validerer ikke selv (målt: 600 ops accepteres lokalt,
  serveren afviser). Samme kørsel fyrer 132/380 `recomputeGameMatch`-triggere,
  der alle returnerer på `prevResult === nextResult`. Chunk batchen, hvis et
  spil nogensinde får >500 kampe.
  (i) **`live`-stillingen kan ikke forgiftes af kilden:** begge providere
  filtrerer på `Number.isFinite(score.home/away)` (syncProviders.js L274,
  L554) FØR `live` skrives. `liveMaalAf` KASTER ganske vist på
  `live:{home:{toString:null}}` (`heltal` → `String()` uden try) — men vejen
  dertil er admin/script, ikke kilden. Samme klasse som `detaljerVersion`.
  Delopgave 5 bør pakke kaldet pr. kamp i try/catch, så ét forgiftet dokument
  ikke dræber live-løkken for hele spillet.
  (j) **`livescoreEid` og `liveMaal` kræver INGEN regel-ændring og lækker
  intet:** `games/{g}/matches` er `read: isApproved()` / `create,update:
  isGlobalAdmin()` (firestore.rules L194-203, L862-866) — en spiller kan ikke
  skrive dem, og indholdet er offentlige kendsgerninger (et fremmed kamp-id,
  målscorere i en kamp, der spilles lige nu). Ingen ny læse-query, så
  "regler er ikke filtre" er ikke i spil.

- **Live-mål-synken (f607272, delopgave 5-7) er BEKRÆFTET RENT på alt andet
  end de tre poster ovenfor.** PoC uden emulator (fake db + fetch-spion,
  se PoC-opsætningen); alle tal målt, ikke læst:
  (a) **Skriveomfang:** giftig stage-liste (`result/homeGoals/points`,
  `__proto__`, `Eid: '../../x' | {toString:null} | '1784451?x=1'`) + giftige
  incidents (`result/homeGoals/awayGoals/kickoff/points/locked/
  detaljerVersion/livescoreEid:'../../admin'/evil`, `toString:null`,
  `__proto__:{liveMaal:'PWN'}`) → skrevne feltnøgler PRÆCIS
  `['liveMaal','livescoreEid']`, URL'en kun cifre, ingen
  prototype-forurening, scorernavn `rensTekst`'et.
  MUTATIONSKONTROL kørt: svækkes `hentNoegler`s `/^\d{1,12}$/` til
  `eid == null || eid === ''`, når `../../v1/api/app/admin` BÅDE i URL'en og
  i `livescoreEid` — PoC'en kan altså se en læk. Bemærk: `noegler.get(n)`
  re-valideres IKKE i live-løkken (og heller ikke i `eidForKamp`), så
  `hentNoegler` er ÉN vagt for begge stier. En `gyldigEid`-linje i
  `eidForKamp` ville give den anden.
  (b) **Dokumentstørrelse er bundet.** `heltal` er `/^\d{1,3}$/`, så
  `live.home/away` ≤ 999 og `maal.length` ≤ 1998; `annullerede` klippes til
  `ANNULLERET_LOFT = 25` (loftet fra sidste gennemgang er landet — kørt med
  20.000 IT-62-hændelser). Målt værste dokument: **195.826 bytes** (999-999,
  40-tegns navne), altså under 1 MiB; 10 sådanne kampe i ÉN batch = 1,87 MiB,
  under commit-grænsen. Normal kamp: 2,7 KB.
  (c) **Giftige dokumenter fejler pr. kamp, ikke pr. kørsel.**
  `live:{home:{toString:null}}` blandt tre → `uparsede:1`, de to andre
  skrevet, ét commit. Giftigt `kickoff` → `ukendte:1`. `liveMaal` på
  dokumentet som `'x'`, `[]`, `{maal:{toString:null}}` → ingen kast.
  Et 6,6 MiB incidents-svar × 10 kampe: 668 ms, +107 MiB heap, skrivning
  stadig 2 KB pr. dokument. 50.000 niveauers nesting → `uparsede:1`
  (RangeError fanges).
  (d) **`erIGang` kaster aldrig** (11 typer kørt), men er sand for `live:{}`
  og `live:[]` — kun admin/script kan skrive dem; provideren skriver kun
  finite tal.
  (e) **Kredsløbsafbryderen dækker BEGGE kald — sweep-fejlen er IKKE
  gentaget.** 429/403 på STAGE-kaldet giver `afbrudt:true` efter 1 kald
  (stage-kaldet ligger inde i samme try, der sætter flaget), så index.js'
  `meldAlarm({type:'detaljerLukket'})` fyrer — modsat `kortlaegEids`, hvor
  alarmen forsvandt. 429 på 3. incidents-kald: 3 kald i alt, de to første
  kampe bevaret i batchen, ét commit. Kontrol grøn.
  (f) **Ingen felt-kollision mellem de to jobs.** Minut-synken skriver
  `live` med `batch.set(..., {merge:true})` og en felt-for-felt-payload
  (superligaSync.js L188/L272/L342); live-jobbet `batch.update` med kun
  `liveMaal`/`livescoreEid`. Ingen af dem skriver hele dokumentet. Racen
  "facit rydder `liveMaal`, live-jobbet skriver det bagefter" er mulig, men
  usynlig (klientens gate er `liveScore`, der er null ved facit) og heles af
  sweep'et, der kalder `syncResultsCore` UDEN `only` og har
  `cur.liveMaal == null` i skip-vagten.
  (g) **Reglerne er uændrede og skal ikke ændres.** `games/{g}/matches` er
  `read: isApproved()` / `create,update: isGlobalAdmin()` (L194-203,
  L862-866); `liveMaal` er offentlige kendsgerninger, og der er ingen ny
  klient-query — "regler er ikke filtre" er ikke i spil.
  (h) **`lv.fejl` i GameScheduleTab kan bære ~10 tegn KILDE-tekst.**
  `hentJson` fanger ikke `res.json()`, og Node skriver et udsnit af kroppen
  i SyntaxError'en: målt `"Unexpected token '<', \"<h1>Fejl: \"... is not
  valid JSON"` (55 tegn). React escaper, admin-only, ingen URL og ingen
  identiteter — noteret, ikke et fund. `rensTekst` slipper stadig U+202E og
  nulbredde igennem til `MaalPost` og til `aria-label`, som før.
  (i) **Loftet virker:** 25 kampe i gang → 10 valgte, 10 kald. Udvælgelsen
  er `slice(0, loft)` på `pendingMatches`-rækkefølgen (kickoff), så kampe
  nr. 11+ sultes deterministisk. Ikke aktuelt (PL's samtidige slutrunde er
  præcis 10). Callable-stien giver `only: alle` (hele sæsonen, ikke
  vinduet), så en kamp, der står fast med `live` sat og uden facit, æder en
  plads i loftet for evigt dér.

- **Genkørsel mod 6ed49aa: begge blokerende fund og alle bør-punkter fra
  f607272 er LUKKET (samme PoC'er, samme tal).**
  (a) **Stage-løkken er væk ved KILDEN, ikke afbødet:** live-løkken importerer
  ikke længere `hentNoegler`/`noegleAfKamp` og rører aldrig `livescoreEid` —
  kortlægning og #82-sletning er sweep'ets alene. Samme 150-minutters PoC:
  A (cachet id → 404) **0 stage-kald** (var 149), B (ukobbelig kamp) **0 kald
  i alt** (var 150 stage), C (kontrol, varm cache) uændret 150 incidents.
  En kamp uden gyldigt id tælles `ukendte` og er synlig i driftlinjen.
  (b) **Budgetterne summer nu under timeouten MED overløb.** Målt med
  simuleret ur: callable 89,99 s + 19,998 s = **109,99 s** mod 120 (var
  129,99); jobbet, to spil = **39,996 s** mod 60. Formlen
  `(T − N·KALD_TIMEOUT_MS − 5 s)/N` giver samme loft (55 s) for N=1..4 —
  overløbet er indregnet, så et tredje spil ikke længere sprænger den.
  RESTKANT: ved N≥6 bliver budgettet NEGATIVT → løkken bryder straks, 0 kald,
  og `liveMaalNiveau` siger 'ok' (den kræver `forsoegt > 0` for at advare) →
  tavs nul-kørsel. Langt ude, men det er den eneste vej, jeg fandt, hvor
  jobbet gør intet og melder grønt. Sæt et gulv på budgettet.
  (c) **`eidForKamp` whitelister nu map-værdien** (10 fjendtlige værdier →
  `null`; kontrol `'9999999'` → igennem), så URL-vagten står ét sted for
  begge stier i stedet for kun i `hentNoegler`.
  (d) **Skriveomfanget er smallere:** `LIVE_SKRIVBARE = ['liveMaal']`.
  Giftige incidents (`result/homeGoals/kickoff/points/locked/livescoreEid/
  __proto__:{liveMaal:'PWN'}/toString:null`) → skrevne feltnøgler præcis
  `['liveMaal']`, ingen prototype-forurening. Giftig kamp blandt tre →
  `uparsede:1`, de to andre skrevet, ét commit (uændret med ÉN try).
  (e) **Mutationstestet (30 grønne i baseline, 4 mutationer, alle røde):**
  per-kamp-try'et fjernet → 2 røde, heraf den NYE "et svar, der ikke er JSON,
  koster én kamp" — netop den vagt, der før kunne fjernes med grøn suite;
  `LIVE_SKRIVBARE = []` → rød; nedkølings-tjekket ignoreret → rød; pausen
  skrives aldrig → rød. Plukket er STADIG en ækvivalent mutation
  (`{ ...skriv }` = grøn), men kommentaren siger det nu selv.
  (f) **Nyt felt `livescoreLukketTil` på `games/{g}`** — endnu et felt uden
  affectedKeys-liste, der STYRER maskineri. En admin kan pause live-målene
  vilkårligt langt; det ses som `advarsel` på Drift-kortet, men
  `klokkeslaet()` viser kun HH.MM, så en pause til år 2099 læses som "prøver
  igen kl. 14.32". `Number({toString:null})` KASTER → jobbet dør for DET spil
  og bliver synligt som `st.fejl`. Fejler lukket, admin/script-only.
  Platform-suiten i arbejdstræet efter rettelsen: **983/983 grønne**.

### E2E mod emulatorer (destilleret sep 2026 fra to sag-afsnit)
- **Emulator-fixturen kan ikke nå produktion — målt, ikke læst.** `.env.e2e`
  gælder kun `--mode e2e`, og begge deploy-workflows kører `npm run build` uden
  mode og skriver deres egen `.env`; emulator-grenen (`src/firebase.js:40-43`)
  tree-shakes væk ved `VITE_USE_EMULATORS=false`. `dist-e2e-*/` og `e2e/.auth/`
  er gitignored. CI's e2e-job har NUL `secrets.`-referencer. App Check er
  dobbelt-gated (site-key OG ikke-emulator).
- **Gemte e2e-logins er værdiløse uden for emulatoren:** `{"alg":"none"}`,
  `aud`/`iss` = `demo-vm2026`, `apiKey: demo-key` — de ægte projekter er
  `tour-85928`/`spil-89af9`. De KAN lække via `playwright-report/`-traces i et
  PUBLIC repo; accepteret, fordi der ikke er prod-data i dem.
- **To varige lærdomme fra fixturen** (resten var engangs-fakta):
  EJEREN kan læse ALLE players-dokumenter (`allow read` starter med
  `isGlobalAdmin()`), så "ejeren mangler i stillingen" beviser INTET om en
  læseregel. Og en negativ assertion på en fixture uden ofre er tom:
  `stilling.spec` består stadig, hvis `where('leagueIds','array-contains-any')`
  fjernes fra `useGameStandings.js:63`, fordi begge dokumenter i fixturen
  opfylder reglen. En "regler er ikke filtre"-test SKAL have et dokument, som
  reglen ville afvise.

## Åbne observationer (ikke sårbarheder, men kend tallene)

- **Invitations-mailen falder TAVST tilbage til Superliga-profilen uden
  `gameId`** (`functions/index.js` ~L668, `if (gameId)`): en håndlavet payload
  med `template:'invitation'` og uden gameId sender SL-salgstalen om PL. Kræv
  `gameId` ved `'invitation'`. (`String(game.name)` kaster desuden TypeError på
  `{name:{toString:null}}` → `internal`.)

- **N+1 i `hentLigaMedlemmer`:** et sekventielt `users`-opslag pr. deltager.
  Maalt: 61 deltagere = 65 laesninger, 304 ms lokalt. Fanen genhenter efter HVERT
  klik (GameLeagueMembersTab.jsx L65) -> ~300 sekventielle round-trips pr. klik
  ved platformens brugertal. Bag admin-porten, saa ingen angriber kan forstaerke
  det; `db.getAll(...refs)` ville goere det til et RPC.
- **`medlem: medlem === true`** (index.js L743) goer enhver ikke-boolsk vaerdi til
  en FJERNELSE (maalt: `undefined`, `'true'`, `1`, `{}`, `[]`, `null` fjernede
  alle uden fejl). Fladen sender altid en boolean, saa det er ikke naabart i dag -
  men "destruktiv som standard" er den forkerte vej at fejle for et felt, der
  afgoer, hvem der ser hvis tips.
- `strandedMatches` (superligaSync.js L91-101) har INGEN nedre tidsgrænse. Ved
  længerevarende kildenedbrud vokser mængden til hele kampprogrammet;
  `meldAlarm` skriver ubetinget pr. alarm pr. kørsel × 12 sweeps/døgn →
  180 strandede kampe ≈ 2160 skrivninger dagligt (~11 % af gratiskvoten).
- **Én giftig post kan vælte hele partiet.** `{"period":{"toString":null}}` er
  JSON-nåbart og får `String(m.period)` til at kaste i `plIGang` → hele
  minuttets live-synk dør for spillet. Samme i `matchDocId` for et navn.
  Fejler lukket, men blast radius er hele listen, ikke posten.
- `hentFaerdige` matcher `m.period === 'FullTime'` CASE-FØLSOMT, mens
  `plIGang`/`plLiveStatus` lowercase-normaliserer. Ændrer kilden bogstavering,
  bliver kampen stille i BEGGE ender.
- **Dobbelt hentning:** `hentFaerdige` OG `hentLive` kalder hver sin
  `plAlleKampe` = 4+4 sider pr. minut. Værste tilfælde 100 s > `onSchedule`'s
  60 s default. Afbødning: memoiser pr. kørsel.
- `runGameRoundRecap` (gameRecap.js L308-309/L439) er read-then-write om
  `game.recappedRounds` uden transaktion. To samtidige triggere for samme runde
  → dobbeltopslag på alle vægge + to betalte AI-kald. Kræver ingen angriber, kun
  timing. Hærdning: claim-then-post i en transaktion.
- **Eksistens-orakel** i liga-callables (`not-found` = 1 læsning vs
  `permission-denied` = 87) skelnes også på LATENS, så ens fejlkoder alene ville
  ikke lukke det — kun rækkefølge-fixet gør. Praktisk ufarligt: leagueId er et
  auto-id (~62^20).
- `navn`/`shortName` i invitations-mailen har intet længdeloft (modsat
  `leagueName`, der `.slice(0,60)`): 50 000 tegn → 111 KB HTML × 300 mails.
- storage.rules `allow read: if true` på `broadcast/{fil}` giver også LIST —
  kun enumeration af allerede-offentlige URL'er. Ingen sletning/cleanup.

- **`e2e/fixtures/seed-e2e.mjs:56-58 + 66-72` validerer ikke værten.** `||=`
  betyder, at en allerede sat `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST`
  bestemmer, hvor `DELETE .../documents` og `DELETE .../accounts` lander
  (BEKRÆFTET med sink-PoC). Produktion er uden for rækkevidde — endpointet
  findes kun i emulatoren, og admin-SDK'en kører helt uden credentials — men en
  ANDEN emulator kan tømmes. Billig vagt: afvis værter, hvis hostname ikke er
  localhost/127.0.0.1/::1.
- **`.env` på arbejdsmaskinen blev overskrevet med `.env.e2e`** under E2E-arbejdet
  (identisk mtime, identisk header-kommentar). `.firebaserc` default =
  `tour-85928` (PRODUKTION), så et manuelt `npm run build && firebase deploy`
  fra sådan et arbejdstræ ville lægge en app med `VITE_USE_EMULATORS=true` på
  tour.vejleaa.dk. Gitignored, så det når aldrig en PR — men kopiér ALDRIG
  `.env.e2e` oven i `.env`; brug `--mode e2e`.

## Testhuller værd at huske

- `functions/rules.test.js` L3010-3053 (puljeBets-læsning) dækker `getDoc` på
  ÉT fremmed dokument og et spil UDEN `puljeLockAt` — men hverken `getDocs`
  (list) eller `puljeLockAt: null`. Hele suiten er GRØN både med og uden
  null-hullet ovenfor (kørt: 233/233 mod den rettede regelfil). Skal en klient
  liste samlingen, hører der en list-test til FØR og EFTER deadline plus en
  eksplicit null-test — ellers er "regler er ikke filtre" udækket her.
- `functions/rules.test.js` L1320-1358 (driftlog/driftAlarmer) tester kun
  `getDoc`, mens klienten bruger en collection-listener med
  `where('loestAt','==',null)`. Skærper nogen reglen med et `resource.data`-led,
  bliver fladen tom UDEN at suiten bliver rød. Samme hul i emailLog-testene.
- `hentTipStatus` har NUL tests. Testen "grænsen står i selve datastrukturen"
  kalder `byggTipStatus`, hvis input pr. konstruktion er Sets — den kan ikke
  fejle. Mutation kørt: `add(b.matchId)` → `add(b)` + et `raaBets`-felt lækker
  alle spilleres 1X2-valg med **12/12 tests grønne**.
- `advarsel(besked, tal)`/`fejl(besked, tal)` i driftlog.js er UDÆKKET —
  fjernes `Object.assign(s.tal, tal||{})` begge steder, er alle 646
  platform-tests grønne.
- `scripts/fix-double-chance.mjs` har INGEN testfil (kun
  `scripts/lib/doubleChance.test.mjs`), og vite.config.js L56 kører kun
  `scripts/**/*.test.mjs`. En mutation af dens `if (apply)` bliver aldrig rød.
- `ADMIN_OWNED`-tripwiren i seed-payload.test.mjs tjekker kun retningen
  ADMIN_OWNED ⊆ games.mjs — intet bliver rødt, hvis nogen tilføjer `paused` til
  games.mjs uden at tilføje det til ADMIN_OWNED.

- **Forbudslisten i `kampDetaljer.js` er UDÆKKET — og dens test er en tautologi.**
  Mutation kørt (61a6e71): pluck-løkken `for (const felt of SKRIVBARE_FELTER)`
  → `Object.assign(skriv, svar.felter)` giver **95/95 grønne**, også den nye
  test "respekterer forbudslisten — facit rører den aldrig". Grunden er, at
  `detaljerAf` kun sætter LITERALE nøgler (`halvlegHome`, `halvlegAway`,
  `tilskuere`, `maal`) — ingen kilde-data bliver til et feltnavn, så pluck'et
  er en ÆKVIVALENT mutation i dag. Vagten er altså ægte forsvar i dybden mod en
  fremtidig ændring af `detaljerAf`, men INTET binder den. Vil man binde den,
  skal testen injicere et forbudt felt i `svar.felter` (spy/stub på
  `detaljerAf`), ikke i kilde-JSON'en. Generelt: **en test, der asserterer på
  fraværet af noget, produktionskoden strukturelt ikke kan producere, måler
  ingenting** — samme form som "et bånd, der rummer både før og efter".
  Kontrol kørt: `loft: Math.min(only.length, DETALJE_LOFT)` → `only.length`
  BLIVER rød (1 fejl), så loftet er bundet; at fjerne `loft` helt er derimod
  ækvivalent (kernen defaulter til samme 8).

- **Live-mål-kernens to try/catch er REDUNDANTE — hver især ubundet
  (mutationstestet, f607272).** `liveMaal.js`: den indre try om `liveMaalAf`
  og den ydre per-kamp-try om hele kroppen. Kørt mod `liveMaal.test.js`
  (27 grønne i baseline): den indre → `catch (e) { throw e; }` = **GRØN**;
  den ydre → `throw err` (uden `uparsede += 1`) = **GRØN**; BEGGE fjernet =
  rød ("ét giftigt dokument koster én kamp"). Testen bruger kun én giftform
  (`live.home = {toString:null}`), som den indre fanger. Det er husets
  "Én vagt pr. sikkerhedsregel" i live: den ydre er den eneste, der dækker
  kast fra `hentJson`/`res.json()` og `batch.update`, og den kan fjernes med
  grøn suite. Bind den med en kamp, hvis incidents-svar er UGYLDIG JSON.
- **`LIVE_SKRIVBARE`-plukket er en ÆKVIVALENT mutation.** Erstattes
  pluk-løkken med `const plukket = { ...skriv };` er suiten **grøn** — `skriv`
  får kun literale nøgler (`liveMaal`, `livescoreEid`), så intet fra kilden
  kan blive et feltnavn. Kommentaren "Bundet af en mutationstest" gælder
  listens INDHOLD (fjernes `livescoreEid`, bliver to tests røde), ikke
  plukket. Præcis samme form som forbudslisten i `kampDetaljer.js`: ægte
  forsvar i dybden, men intet binder det. Vil man binde det, skal testen
  injicere et forbudt felt i `skriv` (spy/stub), ikke i kilde-JSON'en.

## Faste faldgruber i dette repo (vedligeholdes her)

- **Et arkiv-/skjul-flag, klienten kan SÆTTE, er en rangerings-knap.** Et felt,
  der får serverens læsere til at springe et dokument over, hører på
  server-only-listen i reglerne — ellers kan den enkelte spiller løfte alle
  andre en plads i den PERSISTEREDE `previousRank` og fryse sin egen pil.
  Spørg ved ethvert nyt boolsk felt på et dokument, klienten må opdatere:
  hvilken serverløkke ændrer adfærd af det? Formen, der virker, er ASYMMETRISK
  (fjerne ja, sætte nej) — en almindelig blacklist ville have spærret vejen
  tilbage: `!(ny.get(f,false) == true && gammel.get(f,false) != true)`.
- **Et privat låse-prædikat, der dubler et delt, fejler altid i den ene
  retning.** `forladSpil.js:104` (`kickoff != null && kickoff <= now`) mod
  `chanceVagt.erKampLaast` (facit ELLER live-status ELLER ulæseligt kickoff
  ELLER passeret kickoff): fire målte tilfælde, hvor det delte siger LÅST og
  det private SLETTER tippet — og et slettet tip er en frigivet Chance og et
  forsvundet minus-point ved næste `recalcPlayerTotal`. Genbrug prædikatet;
  skriv aldrig "kampen er låst" to gange.
- **En vagt på MEDLEMSKAB fanger ikke EJERSKAB.** `array-contains uid` finder
  ikke den liga, hvis ejer har meldt sig selv ud af sin egen medlemsliste — og
  rules tillader netop det. Ejerskab er et EGET felt; spørg på feltet.
- **En tilstand med to indgange skal ryddes i BEGGE.** Flaget sættes af
  serveren og fjernes kun af klientens joinGame; de to server-veje til
  medlemskab (kode-indløsning, admin melder ind) efterlod en halv tilstand.
  Optæl alle veje IND i tilstanden og alle veje ud, når du indfører et flag.
- **Et loft på én liste er ikke et loft på nabolisten.** `maal[]` er bundet af
  `kaedeOk` mod vores egen stilling og kan ikke sprænges — og netop derfor blev
  `annullerede[]` født uden loft i samme funktion: forsvaret var allerede
  "bevist" for det felt, læseren havde i hovedet. Returnerer en funktion FLERE
  lister fra samme fremmede svar, så spørg efter loftet på hver enkelt, og
  mål bytes med `JSON.stringify` mod Firestores 1 MiB.
- **`{ uid: d.id, ...d.data() }` giver dokumentet det SIDSTE ord.** Mønstret
  ser ud som "doc-id'et er identiteten", men spreadet overskriver det, hvis
  feltet findes. Skal doc-id'et bære identiteten — og det er hele pointen med
  `uid_matchId`- og `uid`-doc-id-bindingen — skal det stå SIDST. Grep efter
  `uid: d.id, ...` hver gang en ny cross-user-læser landes.

- **En grep-vagt fanger kun den STAVEMÅDE, den er skrevet for.**
  `dokumentId.test.js` kræver `{ id: X.id, ...X.data() }` med SAMME variabel;
  tre steder med `...b` / `...data` / `...m.data` gik fri. Skriv vagten mod
  FORMEN (id-nøgle før et spread af hvad som helst), eller accepter, at den
  kun er en tripwire mod copy-paste — og sig det i kommentaren.
- **En typevagt skal dække ALLE felter fra samme forgiftede kilde, ikke kun
  det, fundet handlede om.** `rankStandings` fik `displayName` vagtet og
  sendte `avatarEmoji`/`favoriteTeam` videre urørt fra præcis samme
  bruger-dokument. Når du hærder ét felt i et normaliserings-knudepunkt, så
  optæl HVER nøgle, funktionen udsender fra den kilde, og afgør hver enkelt.
- **En rettelse, der lukker et hul på ét datasæt, skal spørges om SØSKENDE-
  datasættet.** `games/{g}/leagues` fik både `id`- og navnevagt; top-niveau
  `leagues` (samme begreb, samme ejer-rolle, samme render-mønster) fik ingen
  af delene, og `useLeagues` fik ikke klientens normalisering. To ligabegreber
  i samme fil skal have samme vagter, eller forskellen skal stå skrevet.
- Regler er ikke filtre. En strammet læseregel uden matchende query = tom liste.
- Klient-validering er ikke håndhævelse.
- Doc-id'er skal bindes (`uid_matchId`) — ellers dublet-dokumenter.
- Callables kan kaldes af enhver, der er logget ind, også `pending`.
- Hemmeligheder i `defineSecret`, aldrig i kode/logs/`process.env`.
- AI-prompter kan forgiftes af brugerskrevne navne — saniter.
- **En tidsværdi, der ER en deadline, må ikke kunne bevæge sig frit i begge
  retninger fra en fremmed kilde.** Spørg: hvad sker der, hvis den nye værdi
  flytter et LUKKET vindue tilbage til åbent?
- **Et loft, der tælles på ØNSKER, er ikke et loft på ARBEJDE.** `slice(0, LOFT)`
  i kernen begrænser hvor mange id'er der SENDES ind; hvor mange kald kilden får
  lov at udløse, afgøres af kildens eget svar. Tæl loftet dér, hvor kaldet sker,
  eller gør nøglerne engangs (`Set.delete`).
- **`Number(v)` er ikke en validering.** `null`, `''`, `[]` og `false` bliver
  alle til et FINITE `0`, og `Number.isFinite` lukker dem igennem. Er 0 en
  gyldig værdi i domænet, kan "ved ikke" ikke skelnes fra "nul" bagefter — og et
  filter, der bruger feltets tilstedeværelse som "klaret", genforsøger aldrig.
- **Et nyt led i et løkke-job arver ikke jobbets tidsbudget.** Læg altid det
  nye, netværkstunge led SIDST i løkkekroppen og efterprøv `timeoutSeconds`
  eksplicit: en hård timeout dræber hele løkken for de RESTERENDE spil, og en
  status, der skrives til sidst, bliver aldrig skrevet.
- **En selvhelende sletning uden hukommelse er en løkke.** "404 → slet det
  cachede id → slå op igen" heler kun, hvis opslaget kan give et ANDET svar.
  Giver kilden samme id (eller intet), betaler man opslaget igen hver eneste
  kørsel — og jo hyppigere jobbet kører, jo dyrere. Spørg ved enhver
  selvheling: hvad er tilstanden, hvis rettelsen ikke virker, og hvor mange
  gange prøver vi så? Cachen skal kunne huske et NEGATIVT svar.
- **Et budget pr. LED er ikke et budget for KALDET.** To kerner med 90 s og
  20 s budget under ét `timeoutSeconds: 120` løber til 130 s, fordi et
  budget-tjek i toppen af en løkke ikke kan afbryde et `await`: loftet pr.
  kerne er `budget + ét kald-sæt`. Regn altid
  `Σ(budget_i) + Σ(kald-timeout_i) ≤ timeout` — og gør det igen, når endnu et
  led lægges i samme funktion. En afledt konstant `(T·k)/N` skjuler
  problemet: loftet er `T·k + timeout_kald·N` og vokser med N. Den rigtige
  form er `(T − N·timeout_kald − slack)/N` (landet i liveMaal.js) — den
  holder loftet konstant for ethvert N, men bliver NEGATIV, når N vokser
  nok, og et negativt budget er en tavs nul-kørsel. Sæt et gulv.
- **En alarm, der altid råber, er ingen alarm.** Tæl posterne på en normal dag,
  før du godkender den som afbødning.
- **En alarm skal måle det SYMPTOM, brugeren ser — ikke en proxy for det.**
  `pending > 0` var proxy for "kampe i gang" og `out.live` for "kilden svarede";
  begge knækkede præcis i de to yderpunkter, alarmen fandtes for. Spørg: hvilken
  linje i KLIENTEN viser det, jeg alarmerer om — og læser serveren samme tilstand?
- **En regel-test på getDoc beviser ikke, at LISTEN virker.** Test
  `getDocs(collection(...))` og den PRÆCISE query — både at admin må, og at en
  menig nægtes.
- **Doc-id fra bruger-input skal whitelistes, ikke blacklistes.** Komplet form er
  `/^[A-Za-z0-9_-]{1,200}$/` **plus** `!/^__.*__$/` — regexen alene slipper
  `__proto__`/`__name__` igennem, og de er reserverede: `.doc('__proto__')` er OK
  ved KONSTRUKTION og kaster først ved `.get()` → ubehandlet `internal`.
- **Når vagten er kodens FORM og ikke en regel, skal testen angribe formen.**
  En test på det rene mellemled (hvis input pr. konstruktion er harmløst) kan
  ikke fejle. Muter LÆSEREN og se, om suiten bliver rød.
- **En fremmed kilde skal valideres pr. POST, ikke kun pr. felt** — én giftig
  post må ikke kunne vælte hele partiet. `String()` på et rå JSON-objekt kan
  kaste; læg konverteringen i en try eller filtrér posten fra.
- **Escaping, der bor hos PRODUCENTEN i stedet for hos forbrugeren, er en
  tidsindstillet bombe.** `ligaProfil` returnerer et færdig-escapet `navn`, mens
  `invitationsHtml` fletter det råt ind; kontrakten står kun i en kommentar.
  Escap ved indsættelsen, ikke ved dannelsen.
- **Rækkefølgen i en callable-port er selv en vagt:** `leagueQuestionRecapNow`
  tjekker `status === 'approved'` FØR den svarer `not-found`, så en pending
  ikke kan sondere liga-id'er. Brug den som reference-form; `leagueQuestionStatus`
  mangler den stadig (se VIRKER).
- **En callable, der bevidst er mere tilladende end reglerne, arver ikke
  reglernes forudsætninger.** Spørg: hvilke prædikater står FORAN denne data i
  firestore.rules, og har callablen dem alle? Admin SDK omgår rules helt, så
  `isApproved()` beskytter INTET inde i en callable — status-tjekket skal
  kopieres ind i hver enkelt, og det skal skrives `!== 'approved'` (ikke
  `=== 'rejected'`), for et MANGLENDE brugerdokument slipper ellers igennem.
- **Autorisationen skal stå FORAN de dyre læsninger** — ellers betaler projektet
  for en afvist kalder, og fejlkoderne bliver et eksistens-orakel.
- **En type-vagt, der kun staar ved CREATE, gaelder ikke ved UPDATE.** `name is
  string` ved create og intet ved update betyder, at feltet kan blive et map
  senere - og saa kaster `String()` hos hver eneste forbruger. Grep efter
  `is string`/`is int` i rules og hold hver enkelt op mod BEGGE skriveformer.
- **En vagt, der er skrevet for EN gren, skal staa i den gren.** Et
  `status === 'rejected'`-tjek foran forgreningen spaerrede baade "luk ind" (som
  det skulle) og "smid ud" (som det ikke skulle). Spoerg for hver forudsaetning:
  gaelder den ogsaa for den MODSATTE operation? Og: er den modsatte operation
  overhovedet daekket af en test?
- **En uforanderlighed, der bygger på et dokuments tilstand, holder kun hvis
  dokumentet ikke kan genopstå.** Er sletning tilladt, og overlever børnene
  forælderen på deterministiske id'er, så er "må ikke nulstilles" i praksis
  "må nulstilles i to skridt". Spørg: hvad sker der, hvis ejeren SLETTER
  dokumentet og opretter det igen med samme id?
- **En klient-gate, der "lukker" et QC-sikkerhedsfund, er teater**, hvis det, den
  beskytter, kan nås med rå `updateDoc`. Kun rules tæller mod devtools-angriberen.
- **En regel uden affectedKeys-liste gør hvert fremtidigt felt admin-skrivbart
  pr. automatik.** I orden, mens skribent-kredsen = knap-kredsen; men når et nyt
  felt STYRER maskineri (mails, point, synlighed), skal spørgsmålet stilles.
- **Et input i `env:` er sikkert mod kommando-injektion, men IKKE mod
  argument-injektion.** Uquoted `$args` er hullet. Gennemgå
  `workflow_dispatch`-workflows med en service-account som callables: eneste
  autorisation er "hvem har write-adgang til repoet", og shell er argument-parseren.
- **`kraeverKvittering: true` og `loesDriftAlarmer` er gensidigt udelukkende** —
  ellers forsvinder et selvhelbredende udfald efter ét grønt minut.
- **En URL-parameter er ikke en vagt mod en kompromitteret kilde**
  (`status=notstarted` styrer hele svaret). Den reelle vagt er downstream.
- **En feltbaseret regel er TYPE-streng, og en gruppenøgle er det også.**
  `request.time < kickoff` kræver Timestamp; `where('round','==',5)` matcher ikke
  `'5'`. Skriver to kodeveje samme felt i hver sin type, splittes en gruppe eller
  låses en regel — tavst. Emulator-bekræftet for både `puljeLockAt` og `round`.
- **`diff().affectedKeys()` er den rigtige form til et FELT-FRYS ved update, og
  `keys().hasAny()` til create.** `keys()` ved update ville afvise enhver
  opdatering af et dokument, der allerede HAR feltet. Diff sammenligner værdier,
  så uændret felt og fravær-i-begge-ender ikke er berørte nøgler — men
  **fravær → 0 ER en berørt nøgle**, og det er dét, der rammer en gammel fane.
- **Regler må ALDRIG deployes før den callable, de forudsætter.**
  `deploy-platform.yml` L121 ruller `ONLY="hosting,firestore:rules"` ud, mens
  functions kun deployes af L228-229 bag `inputs.deployFunctions`, der
  **defaulter til `false`** og kører BAGEFTER. Strammer man reglerne, så den
  direkte vej spærres, og den eneste tilladte vej er en funktion, der ikke er
  live, er featuren død for alle. Efterprøv ALTID, at callable'en svarer, før
  reglerne rulles ud.
- **En opslagstabel arver Object.prototype.** `TABEL[kode] || kode` returnerer en
  FUNKTION for `'constructor'`/`'toString'`/`'valueOf'`/`'hasOwnProperty'` og
  `Object.prototype` for `'__proto__'` — målt i `livescoreKode`. Værdien
  overlever `typeof x === 'string'`-vagter, den er jo aldrig lavet, og ender som
  `"function Object() { [native code] }"` i en template-streng. Skriv altid
  `Object.hasOwn(TABEL, k) ? TABEL[k] : k` — samme familie som
  `__proto__`/`__name__`-fælden i doc-id'er.
- **En sammensat nøgle skal have en tegnsæt-vagt på HVER del, ikke kun på én.**
  `${t}|${h}|${u}` er kollisions-fri kun hvis ingen del kan indeholde `|`.
  Målt: `noegle(t,'A|B','C') === noegle(t,'A','B|C')`. Valider hver del
  (`/^[A-Z0-9]{2,5}$/`), ikke bare den ene, der tilfældigvis blev mistænkt.
- **En URL-STI kan omdefinere betydningen af data uden at ligne en parameter.**
  Livescores `stage/soccer/england/premier-league/2`: det afsluttende `2` er
  UTC-OFFSET I TIMER og forskyder hvert `Esd`-felt i svaret. `/0` = ægte UTC,
  `/2.5` = +2:05, `/abc` fejler ÅBENT tilbage til 0. Et magisk stisegment uden
  kommentar er en semantisk landmine: samme kode i to miljøer kan få to
  forskellige tider. Skriv ALTID ud, hvad hvert segment i en fremmed URL betyder.
- **En test, der `return`'er ved fejl, er GRØN — ikke sprunget over.** Målt på
  `livescoreHold.test.js` mod en død vært: 6 netværkstests rapporteret
  `✓ passed`, `Tests 10 passed (10)`, `0 skipped`. `console.warn` er usynlig,
  fordi husets kommando kører `--silent` og husets regel er "læs aldrig et grønt
  testoutput". Brug `ctx.skip()`/`it.skipIf`, så et ikke-kørt tjek rapporteres
  som SKIPPED.
- **En paritetstest, der PARSER sin egen side, skal bevise at parsingen ramte.**
  `voresHold()`-regexen (`/name:\s*'…',\s*short:\s*'…'/`) giver en TOM Map, hvis
  datafilen skifter citationstegn eller feltrækkefølge — og så er
  `expect(mangler).toEqual([])` grøn med nul hold tjekket. Målt: 2 af 3 tests
  bliver fuldstændig vakuøse; kun `expect(uden.length).toBeGreaterThan(0)`
  fanger det. Læg det antal-tjek i HVER test, der parser.
- **Et loft, der tælles på VORES liste, ER et loft på kald** — modsat
  `XG_LOFT`, der talte kildens events. `valgte = mangler.slice(0, loft)` og
  derefter 2 kald pr. element er den rigtige form: kildens svar kan ikke
  multiplicere arbejdet. Spørg altid: løber løkken over VORES kø eller over
  KILDENS svar?
- **En budget-konstant, der PÅSTÅS afledt, skal være afledt.**
  `XG_BUDGET_MS = 300000/3/SYNCED_GAMES.length` skrumper af sig selv ved et
  spil mere; `DETALJE_BUDGET_MS = 25000` gør ikke, selv om kommentaren regner
  den ud af de samme 300 s. To spil i dag = 2×25 s; tre spil = 75 s uden at
  nogen har taget stilling. Et tal uden kode er en påstand — også når det
  ligger i en konstant.
- **En SELVVALIDERENDE udledning slår en kode-whitelist.** Jeg krævede en
  `IT`-whitelist (36/63/43); den blev målt til at ramme 14 af 20 kampe og
  fejle TAVST. Løsningen blev at udlede mål af stillingen `Sc[Nm-1]` og kræve
  den ubrudte kæde 1..`Tr_i` mod VORES facit. Accepteret som strengt bedre:
  en ukendt kode kan ikke blive til et mål, og et annulleret mål falder ud af
  sig selv. Krav en whitelist, når der ikke findes et invariant at måle mod —
  ikke når der gør.
- **En krydsvalidering mod vores EGNE tal er også et STØRRELSESLOFT.** Kravet
  `maal.length === homeGoals + awayGoals` gør en liste fra en fremmed kilde
  umulig at blæse op. Se efter den slags dobbeltvirkning, før du beder om en
  separat `MAX_LEN`.
- **Et delvist svar må ikke markeres som færdigt.** Fejler `info/` alene,
  skrives kampen alligevel med `detaljerSyncedAt`, og filteret er netop
  tilstedeværelsen af det felt → `tilskuere` kommer aldrig igen for den kamp.
  Skriv "færdig"-markøren først, når ALLE de kilder, markøren dækker, svarede.

---

## Livescore.com som kilde (trin 1 + trin 2 — LUKKET, med tre rester)

Kildevalget (DIREKTE mod `prod-cdn-public-api.lsmedia1.com`, ikke via `proxy/`)
er efterprøvet og holder: proxyen bruger en ANDEN leverandør
(`proxy/flashscore_client.py:37-39` → livescore.in / 50.flashscore.ninja),
dækker kun Superligaen (`tdf_api.py:175-204`), og `functions-platform/` har nul
afhængighed af den. En proxy foran ville tilføje et led, ikke en grænse.

**Endpointet:** `stage/soccer/{land}/{liga}/{OFFSET}` (hele sæsonen, 260 KB PL),
`incidents/soccer/{Eid}` (1,3 KB: `Tr1`/`Tr2`, `Trh1`/`Trh2`, `Incs` nøglet på
halvleg), `info/soccer/{Eid}` (182 B: `Vsp` tilskuere, `Vnm` stadion,
`Refs[0].Nm` dommer). Kræver `Referer: https://www.livescore.com/`. Ingen nøgle,
ingen `defineSecret`, intet at lække: kaldene bærer hverken uid, e-mail, cookie
eller token — kun vores egress-IP og kadence.

**Det sidste stisegment er et UTC-OFFSET I TIMER, ikke en version** (`/0`→19:00,
`/2`→21:00, `/2.5`→21:05, `/abc`→0 — målt på Eid 1793530). Det var mit
blokerende fund i trin 1. Trin 2 henter med `/0`, `noegleAfKamp` formaterer
vores `kickoff` med `getUTC*`, og BEGGE dele er testet:
`kampDetaljer.test.js:376` asserterer den præcise URL, og
`livescoreHold.test.js:140-179` kører en SOMMER- og en VINTERKAMP mod den
levende kilde (med `ctx.skip()`, ikke `return`).

**Mine ti trin-2-krav: 1-4 og 6-9 opfyldt, 5 og 10 delvist.** De to rester og
sweep-timeout-resten står i `Angrebsveje der VIRKER` (giftig post i
stage-listen; 5xx tælles som `uparsede` og fyrer alarmen med det forkerte
remedie; Drift-kortet skrives efter det dyreste led). Krav 6 (`IT`-whitelist)
blev bevidst erstattet af den selvvaliderende `Sc`-udledning — accepteret, se
faldgruberne. Med `selvmaal` (218373b) læses `IT` igen semantisk, men i den
SIKRE retning: kun 39 → selvmål, ukendt kode → almindeligt mål, og flaget
rører hverken kæde-tjek, måltal eller point. En fjendtlig kilde kan sætte
"selvmål" på en ægte scorer — ære, ikke point, og samme tillid vi allerede
giver kildens scorernavne. Skriveomfang, `maal[]`-loft, kredsløbsafbryder, callable-adgang og
AI-prompten er BEKRÆFTET RENT (se dén liste).

**Genbrugelig PoC:** `kampDetaljer.js` kræver kun `rensTekst` + `livescoreHold`
og kan `require`'es direkte fra node uden emulator. Fake db =
`{collection:()=>({doc:()=>gameRef}), batch:()=>({update:(r,o)=>skriv.push(...),
commit:async()=>{}})}`, `FV = {serverTimestamp:()=>'<<ts>>', delete:()=>'<<del>>'}`,
og en `fetchFn`, der matcher på `stage/` / `incidents/` / `info/` i URL'en og kan
returnere et TAL som HTTP-status. Mutationstesten køres ved at kopiere filen,
strenge-erstatte vagten og køre samme harness mod begge kopier.

**`rensTekst` fjerner `<>{}[]\``, kontroltegn og klipper til 40 — men IKKE `"`,
`&`, U+202E (RTL-override) eller nulbredde-tegn.** Ufarligt i React (escapes),
men et navn herfra i et HTML-ATTRIBUT ville kunne bryde ud
(`x"onmouseover="…`). Escap ved indsættelsen, hvis navnene nogensinde skal i
en mail.

**`detaljerVersion` er et NYT FELT PÅ KAMPDOKUMENTET, DER STYRER MASKINERI** —
præcis det tilfælde, `games/{id}/matches` "ingen affectedKeys-liste"-noten siger
skal spørges eksplicit. Filteret er
`d.detaljerSyncedAt && Number(d.detaljerVersion) >= DETALJE_VERSION`
(kampDetaljer.js L513). Målt: `Number({toString:null})` KASTER, og kastet ryger
ud af hele `syncKampDetaljerCore` — ét forgiftet kampdokument dræber dermed
detalje-synken for HELE spillet i hver kørsel (kørt: 1 giftig blandt 20 sunde →
0 skrevet). Kun globalAdmin/owner (eller et script) kan skrive feltet, og
sweep'ets catch gør det synligt som et rødt Drift-kort, så det er robusthed,
ikke en spillervej. Samme klasse som `Eid: {toString:null}`. Et for HØJT tal
(`'999'`, `Infinity`) fryser kampen for evigt OG fjerner den fra `manglede`, så
Drift-kortet viser 0 og ser sundt ud. Ét-linjes hærdning:
`const ver = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);`.
`>=` frem for `===` er stadig det rigtige valg: `===` ville få et TILBAGERUL til
at genhente alt og skrive FÆRRE felter oven i nyere data.

**Versions-bumpet genåbner ALLEREDE SYNKEDE kampe — og det er dem, kilden
først taber.** Går incidents for gamle kampe tabt (sæsonskifte), tælles de som
`uparsede`; er alle 8 valgte i en kørsel af den slags, fyrer index.js'
`detaljerAfvist`-alarm "kilden har sandsynligvis skiftet form" på en kilde, der
ikke har skiftet form. Samme fejl-remedie-forveksling som 5xx→uparset-resten.
Målt 1/9-2026: alle 54 færdigspillede kampe svarer stadig, så risikoen er
sæsongrænse-bunden, ikke aktuel.

**Efter-facit-vejen (61a6e71) — tallene, så de ikke skal måles igen.** Minut-
jobbet (`syncSuperligaResults`, hvert minut 12-23) kalder `efterFacitDetaljer`
ALLERSIDST, kun for `out.rettede`. Loft pr. spil pr. kørsel: 1 stage + 2×8 = 17
kald (målt), altså identisk med sweep'ets. Frekvensen er bundet af, hvor mange
kampe der får facit, ikke af minutterne: `pendingMatches` filtrerer `result`
væk, så en kamp optræder én gang. Værste realistiske aften (PL's samtidige
sidste runde, 10 kampe i samme minut) = 17 kald for PL + 13 for SL i ÉN kørsel;
resten falder til sweep'et.

**Budget-kommentaren i index.js L457-463 er et TAL UDEN KODE BAG.** Den siger
"15 s pr. spil er … et loft". Målt med et simuleret ur (stage 10 s, hvert
kald-sæt 10 s): reelt forløbet vægur = **20.000 ms**, fordi stage-kaldet ligger
FØR den første løkke-kontrol og budget-tjekket sidder i toppen af løkken —
ceiling er stage-timeouten (10 s) + ét kald-sæt over budgettet (10 s), ikke 15.
For to spil er værste tilfælde altså ~40 s af minut-jobbets 120 s. Ikke
farligt i dag, men skriv 20 s i planen, ikke 15.


**Live-mål-jobbet (f607272) — tallene, så de ikke skal måles igen.**
`syncLiveMaal` er et EGET onSchedule (`* 12-23 * * *`, 720 kørsler/døgn,
`timeoutSeconds: 60`), som pr. spil kører `pendingMatches` → `erIGang` →
højst `LIVE_LOFT = 10` incidents-kald. Varm cache = N kald; kold/404/ukobbelig
cache = 1 stage-kald (260 KB PL) OVENI, hvert minut — se VIRKER-listen.
Kredsløbsafbryder og alarm (`detaljerLukket`, doc-id `{gameId}_detaljerLukket`,
6 t dæmpning) DELES nu af tre producenter — sweep, efter-facit og live-jobbet
— med hver sin remedie-tekst, og den først fyrede vinder i seks timer.
`erIGang` (superligaSync.js) er det delte prædikat mellem puls-alarmen og
live-jobbet; det kaster aldrig, men er sandt for `live: {}` og `live: []`.
Drift-kortet hedder `livemaal` og skrives KUN, når `iGang > 0` (bevidst: 720
stille minutter må ikke koste 720 skrivninger) — så et kort fra en tidligere
kampaften bliver stående på Drift-fladen imens.

**Homoglyf-fælden (fundet i `scripts/maal-livescore.mjs`, siden rettet):** en
identifikator med U+0430 CYRILLIC A virker og linter rent. Grep efter ikke-ASCII
i identifikatorer, når en fil er skrevet ud fra en HAR-fil eller en browser.
---

## Live-tavs-alarmen (5e51155 → d5cc5e4) — EN ALARM, DER SKAL KUNNE STOLES PÅ

Bevaret, fordi den er det stærkeste eksempel på, at **en alarm selv skal
efterprøves med de to yderpunkter, den findes for** — og fordi begge huller
fandtes med grøn suite.

- **HUL 1 (lukket):** alarmen fyrede IKKE ved det udfald, den er bygget til.
  `hentLive` KASTER ved HTTP-fejl → `live = null` → betingelsen
  `out.pending > 0 && out.live && !out.live.pulsSkrevet` er falsk i BEGGE grene.
  40 minutters HTTP 500 midt i en kamp: kortet frosset, `driftAlarmer` TOM,
  grønt igen ved genkomst → intet spor.
- **HUL 2 (lukket):** alarmen fyrede, når INTET var galt. `pending` = kampe i
  2,5t-vinduet uden facit, ikke kampe i gang → efter slutfløjt er pulsen tavs
  pr. definition → alarm hver kampaften, hvor facit er >5 min forsinket. Mens
  klienten i samme tilstand med vilje kalder "Opdatering afbrudt" en LØGN
  (FootballTip.jsx L535-538).
- **Rettelsen:** tæl `kampeMedLevendeStilling(venter)` (kampe med skrevet `live`,
  status hverken 'slut' eller 'afbrudt', uden facit), og læs pulsen som
  `!!(ud?.live && ud.live.pulsSkrevet)`. 11/11 PoC-checks efter.
- **Målt forbrug:** stille minut = 1 query, 0 læsninger, 0 skrivninger. Tavst
  minut med kampe = +2 læsninger. 149 minutters udfald → `antal=1`
  (6-timers dæmpningen holder). Flapping kan ikke koste mere end ~1 åbning/6 min.
- **ACCEPTERET RESIDUAL:** er kilden nede FØR kickoff, skrives `live` aldrig,
  `liveIGang` er 0, og der kommer ingen live-alarm. Backstop er strandet-alarmen
  i sweep'et (kickoff + 2,5 t, 12×/døgn).
- `liveHeartbeatAt` bumpes af `events.length > 0`, og PL's `hentLive` er ikke
  matchweek-filtreret → en kamp UDEN FOR spillets runder kan holde pulsen frisk
  for et spil, den ikke tilhører. Kun i overlappende runde-weekender.

---

## Workflows som privilegie-grænse (seedTeams ca47a20 + fix-double-chance)

**Et `workflow_dispatch`-workflow med en fuld Admin-SDK-service-account ER en
callable** — bare med "hvem har write-adgang til repoet" som eneste
autorisation og shell som argument-parser. Gennemgå dem som callables.

- **Quoting afgør alt, og kan kun ses ved at KØRE run:-blokken.** seedTeams er
  ren: `--game "$SPIL"` og hele `$( … )` i `--teams` står i anførselstegn, så
  hverken resultatet eller variablen ordsplittes. 16 fjendtlige `SPIL`-værdier
  (` --skriv`, `$(touch …)`, backticks, `*`, newline/tab + flag, `-o`,
  sti-flugt) blev til NUL ekstra argv-elementer. `SPIL="--skriv"` fejler LUKKET
  i parseArgs. fix-double-chance har samme form UDEN anførselstegn og er hullet
  (se Chancen-afsnittet).
- **`[ "$APPLY" = "true" ] && args=…` fejler ikke åbent** og vælter ikke steppet
  under `bash -e` (AND-listen er ikke sidste kommando). Non-boolean API-værdier
  fejler LUKKET. `${{ inputs.X && '--flag' || '' }}` er sikkert FORDI inputtet er
  `type: boolean` — var det en streng, ville enhver ikke-tom værdi være truthy.
- **Godt håndværk værd at kopiere:** secret'en sendes via `env: SA:` og skrives
  med `printf '%s' "$SA"` (fix + audit + seedTeams). De ældre workflows
  (backfill-player-leagues L41/44, strip-public-user-emails L36/39,
  migrate-users L45-52) interpolerer `'${{ secrets… }}'` direkte i shell — et
  apostrof i secret'en ville bryde ud af strengen. De tre mangler også
  `permissions:`-blokken.
- **`{merge:true}` på et ARRAY erstatter det helt:** et felt, der findes i prod
  men ikke i filen, blev SLETTET af kørslen (vist i tør-kørslen som `→ —`).
  Ufarligt i dag, fordi `teams` kun har to skrivere og admins farve-overrides
  bor i `games/{id}.teamStyles`.
- **`games/{gameId}` har INGEN Cloud-Function-trigger** (kun matches, leagues,
  questions), så en skrivning dér kan ikke forstærkes.
- **CI (`ci.yml`) har ingen `permissions:`-blok** og installerer `firebase-tools`
  globalt og UPINNET i to jobs (rules, og fra sep 2026 også e2e). Alle fire jobs
  er læse-only i deres formål; `permissions: contents: read` på workflow-niveau
  ville forhindre, at en kompromitteret afhængighed i det store CLI-træ arver en
  skrive-token. Ingen `secrets.` i ci.yml i dag.
- **`roller.mjs`s nye SIKKERHED-mønster `/^\.github\/workflows\//` er for snævert:**
  `.github/dependabot.yml` findes i repoet og styrer automatiske afhængigheds-PR'er,
  og `.github/CODEOWNERS` ville styre review-krav. Brug `/^\.github\//`. Samme
  familie: `.env*` matcher INTET mønster, selv om `.env.e2e` afgør, om App Check
  springes over.
