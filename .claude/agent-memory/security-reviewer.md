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
  (se sag-afsnittet). Der findes **intet rekursivt `{document=**}`-wildcard** i
  filen og ingen `isGlobalAdmin`-skrivegren på bets.
- **`driftlog/{id}` + `driftAlarmer/{id}`** (L383-390): `read: isGlobalAdmin()`,
  `write: false`. Verificeret for LIST/QUERY, ikke kun getDoc — reglen er
  dokument-uafhængig, så klientens `where('loestAt','==',null)` virker.
  Selv admin kan ikke skrive driftAlarmer; kun callablen.
- **`puljeBets`** (L767-816) binder antal hold til `game.pulje.poolSize`/`.nedSize`.
  `gameLock()` (L781-790) læser `puljeLockAt` DIREKTE uden default → manglende
  felt er en evalueringsfejl og fejler LUKKET for BÅDE skrivning og
  andres-læsning. `poolSize == 0` gør `size() == 0` uopfyldelig → intet kan gemmes.
  **Type-fælde:** reglen kræver en **Timestamp**. GameScheduleTab.jsx L172 skriver
  `new Date(x).getTime()` = et TAL → hele puljen låses for spillet.
- **`questions`/`questionAnswers`:** `answerId == questionId + '_' + auth.uid`
  binder svaret til afsenderen. `botFacitAt`-vagterne holder i alle fire
  skriveformer (update, `= null`, fuld setDoc-overskrivning, `deleteField()` —
  `affectedKeys().hasAny` fanger også sletning).
- **`messages` create** validerer BEGGE participants mod enten
  `games/{g}/leagues/{l}.memberUids` (gameId sat) eller top-niveau `leagues/{l}`
  (gameId fraværende) — `bothShareLeague`/`privateLeagueMembers`, L448-472.
  Grenforvirring er umulig: `gameId` sat TVINGER game-stien.
- **`users/{uid}` type-tjekker IKKE `displayName`** — en spiller må skrive `42`,
  `{a:1}`, `['a']` eller 100k tegn på sig selv. Se griefing-posten nedenfor.

## Angrebsveje der VIRKER (åbne eller kun delvist afbødet)

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

## Angrebsveje der IKKE virker (afprøvet, gentag ikke)

- **alarmId-fuzz mod `kvitterDriftAlarm`** (functions-platform/index.js L495-508).
  16 fjendtlige værdier mod ægte admin-SDK + emulator: `../users/p1`,
  `..%2Fusers%2Fp1`, backtick-varianter, NUL-byte, 1600 tegn, objekt/array/tal/
  bool, `__proto__`, `constructor`, `prototype`. **Ingen** forlader
  `driftAlarmer/`; kontrol-dokumentet `users/p1` var urørt. Prototype-tricks er
  umulige: værdien bliver aldrig en objektnøgle, kun `String()` → doc-id.
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

## Åbne observationer (ikke sårbarheder, men kend tallene)

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

- Regler er ikke filtre. En strammet læseregel uden matchende query = tom liste.
- Klient-validering er ikke håndhævelse.
- Doc-id'er skal bindes (`uid_matchId`) — ellers dublet-dokumenter.
- Callables kan kaldes af enhver, der er logget ind, også `pending`.
- Hemmeligheder i `defineSecret`, aldrig i kode/logs/`process.env`.
- AI-prompter kan forgiftes af brugerskrevne navne — saniter.
- **En tidsværdi, der ER en deadline, må ikke kunne bevæge sig frit i begge
  retninger fra en fremmed kilde.** Spørg: hvad sker der, hvis den nye værdi
  flytter et LUKKET vindue tilbage til åbent?
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

---

## Chancen ⚡ (trin 1-3, branch claude/multi-game-player-collection-21mc1w)

**Hullet:** sæt ⚡ på kamp A, lad den låse ved kickoff, sæt den igen på kamp B i
samme runde — begge blev afregnet. Reglen "én ⚡ pr. runde" er en FORESPØRGSEL,
og rules kan kun `get()` ét kendt dokument, så den kan aldrig håndhæves dér.

**Trin 3 (firestore.rules) — BEKRÆFTET LUKKET, 38 PoC-checks + 233 repo-tests.**
`writingChanceFields()` (L88-106) på `allow update` (L940) og "fraværende eller
0" + "revisionsfelter helt fraværende" på `allow create` (L909-916).
Alt afvist: `updateDoc`, `setDoc` med og uden merge, fravær→3, `increment(8)`,
`deleteField()`, `setDoc` der UDELADER feltet (= sletning), `'chanceStake.x'`,
chance-felt smuglet med i samme operation som et lovligt felt, streng/bool/null,
4→8, 4→99, bagdatering af `chanceSatAt`, nulstilling af `chanceFlytninger`,
og en anden spillers dokument i alle former. `allow delete: if false` lukker
slet-og-genopret. **Kontroltests grønne** (opret tip, ret 1X2 på et tip MED
chance, `points` afvist) → opsætningen måler noget.
**Mutationstestet:** hver af de tre vagter → `true` gør præcis én repo-test rød.
De er load-bearing, ikke pynt.

**Kernen (`setChanceCore`) — BEKRÆFTET RENT.** approved-kontrol slipper igennem;
pending, rejected, manglende `status`, manglende users-dok og manglende
players-dok afvises alle. `stake`-fuzz (20 værdier: 9, 1e21, MAX_SAFE_INTEGER,
'4', true, [], {}, NaN, 1e-7, 4n, 0.5) → kun heltal 0 og 1..8 accepteres.
Alle låse-varianter holder (kickoff passeret, ETHVERT live-felt inkl. 'afbrudt',
facit i begge former, manglende/uparseligt kickoff, manglende runde).
Selve hullet: gammel chance på LÅST kamp + ny på åben → `chance-laast`.
**Samtidighed: 15 par + 10 tripler → aldrig mere end én åben chance.**
Transaktionen bærer dedup'en. Gentaget identisk kald → `uaendret: true`, ingen
skrivning (klik-loop koster ikke kvote og støjer ikke i `chanceFlytninger`).

**RESTRISIKO (availability, ikke integritet): den stale fane.**
Den NYE `setBet` sender ikke længere `chanceStake`, så et tip oprettet efter
udrulningen har INTET `chanceStake`-felt. En fane fra FØR udrulningen sender
`Number(existing?.chanceStake) || 0` = 0 med hvert 1X2-klik → **fravær → 0 er en
berørt nøgle → PERMISSION_DENIED**, og `danishError` (betActions.js L29) siger
"deadline passeret eller ingen adgang" på en åben kamp. Samme gælder, hvis
fanens cache siger 0, mens serveren har sat 4. Begge BEKRÆFTET i emulator.
Rettes ved genindlæsning; der findes ingen version-/genindlæs-banner i appen.
Bemærk: `chanceStake: 0` UÆNDRET (0→0) og `chanceSatAt` sendt uændret med går
fint igennem — det er kun TRANSITIONEN, der rammes.

**DEPLOY-RÆKKEFØLGEN ER DEN FARLIGE DEL.** `chanceVagt.js` L22-28 påstår, at
hosting og regler ruller ud sammen, så der ikke findes en mellemtilstand. Det er
sandt for KLIENTEN og udelader FUNKTIONEN: `deploy-platform.yml` deployer
`ONLY="hosting,firestore:rules"` på L121, mens `setGameChance` kun deployes af
L228-229 — bag `inputs.deployFunctions`, som **defaulter til `false`** og kører
EFTER. Ruller man ud uden fluebenet, spærrer reglerne den direkte vej, mens den
eneste tilladte vej ikke findes → ⚡ er dødt for alle. Klientens
`functions/not-found`-gren giver en dansk besked, men er ikke en afbødning.
**Efterprøv ALTID, at callable'en er live, før regler, der forudsætter den,
udrulles.**

**Dokumentations-drift (ikke rettet i trin 3):** `docs/drift.md` ~L457-480 og
`scripts/lib/doubleChance.mjs` L171 siger begge stadig "indtil trin 3 er live,
nævner firestore.rules ikke ordet chance, så en spiller kan selv skrive både
`chanceStake` og `chanceSatAt`". Det er nu falsk, og det er præcis den sætning,
der afgør, om operatøren tør stole på et audit-fund.
`doubleChance.mjs` L52 læser `Number(bet?.chanceSatAt)`, og serveren skriver et
tal (`nowMs`) — audit-vejen er kompatibel.

**Fra fix-double-chance-workflowet (54c086c) — stadig åbent:**
to `if (apply)` om samme sikkerhedsregel (L118 bet-skrivningen og L128
`rescoreAllBets` med hårdkodet `{dryRun:false}`); erstattes L128 med `if (true)`,
skriver en TØR-KØRSEL i basen, mens den udskriver "der skrives intet". Ingen test
bliver rød. Fix: send `{dryRun: !apply}` videre. Rettelsen er heller ikke atomar
— nedbrud mellem L118 og L128 efterlader `chanceStake:0` uden genscorede point,
og en genkørsel melder GRØNT, mens spilleren beholder sine point. Intet
`concurrency:`. Blast radius: `rescoreAllBets` omskriver `points` på HVERT bet i
spillet og ALLE totaler — et spil med historisk pointdrift bliver omprist som
bivirkning. Sammenlign altid med `rescore-bets.yml`, der rammer samme primitiv,
men kræver `skriv == "SKRIV"`, tager backup som artefakt og har en GENDAN-vej.

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
