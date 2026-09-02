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
  Genåbnings-forbuddet (superligaSync.js L515-517) lukker past→future for enhver
  kamp uden `result`. Men fremtid→TIDLIGERE er TILLADT (legitime reschedules
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

## Afprøvet og RENT (gentag ikke arbejdet uden grund)

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

## Åbne observationer (ikke sårbarheder, men kend tallene)

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

## Faste faldgruber i dette repo (vedligeholdes her)

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

**Homoglyf-fælden (fundet i `scripts/maal-livescore.mjs`, siden rettet):** en
identifikator med U+0430 CYRILLIC A virker og linter rent. Grep efter ikke-ASCII
i identifikatorer, når en fil er skrevet ud fra en HAR-fil eller en browser.
---

## Liga-spørgsmål (#38 leagueQuestionStatus, #39 recap, #40 updateLeagueQuestion)

Samlet: tre gennemgange af den samme flade. **De konkrete åbne huller står i
`Angrebsveje der VIRKER`** (slet+genopret, points-efter-facit, deadline i
fortiden, type-skift, rejected medlem, displayName-gift, bot-forfalskning,
ubegrænsede AI-kald). Her står kun det, der ikke kan koges ned:

- **Klassen er ny og går igen:** en callable, der bevidst er MERE tilladende end
  firestore.rules (rules har INGEN læsegren for andres åbne `questionAnswers` —
  heller ikke for admin), og som derfor ER hele grænsen.
- **`leagueQuestionRecapNow` er den FØRSTE callable med et rigtigt
  `status === 'approved'`-tjek**, og rækkefølgen er rigtig (approved FØR
  `not-found`, så en pending ikke kan sondere liga-id'er). Brug den som
  reference; `leagueQuestionStatus` mangler det stadig.
- **"Kopierer skrivereglen" gør den ikke helt.** Koden: `q.facit == null` (dvs.
  manglende nøgle = åbent). Reglen: `question(qid).facit == null` UDEN
  `.get('facit', null)` → manglende nøgle er en EVALUERINGSFEJL → nægtet. Et
  spørgsmål uden `facit`-nøgle kan INGEN svare på, men callablen lister det som
  "mangler". Kun nåbar med håndlavet skrivning.
- **Ikke ny eksponering (efterprøvet):** væggens læsekreds er en delmængde af
  svarenes læsekreds efter facit — også for et medlem, der kommer til EFTER
  opslaget. `sov`-listen kan ethvert medlem allerede regne ud af `memberUids`.
- **`skalAfsloere` er ren og ufølsom:** rettelse, bottens egen markør-skrivning
  og sletning giver alle `false`; `''`/`'  '` → `'x'` fyrer præcis én gang.

---

## Invitations-mailen (eaa7836) — ADMIN-INPUT → HTML i 300 mails

**Hullerne står i `Angrebsveje der VIRKER`.** Resten:

- **Afprøvet og RENT:** `esc()` på `shortName || name` i ukendt-provider-grenen
  virker (kontroltest kørt: PoC'en ville have set den rå værdi). `intro` (admins
  fritekst) escapes; alle andre profilfelter er faste konstanter.
  `poolSize = Number(x) || 6` kan aldrig blive en streng. `games/{id}` er
  `read: isApproved()` og `create,update: isGlobalAdmin()` → opslaget er
  admin→admin. Omkostning: ét ekstra `get()` bag admin-porten, max 300 modtagere.
- **Observation:** serveren falder TAVST tilbage til Superliga-profilen, hvis
  `gameId` mangler (`if (gameId)`, index.js L668) → en håndlavet payload med
  `template:'invitation'` uden gameId sender SL-salgstalen om PL. Kræv gameId
  ved `'invitation'`.
- `String(game.name)` kaster TypeError på `{name:{toString:null}}` → `internal`.

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
