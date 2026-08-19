# Security Reviewer — varig hukommelse

## PoC-opsætning der virker (genbrug den)

- Firestore-emulatoren kan startes UDEN firebase-CLI (den er ikke installeret):
  `java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar --host=127.0.0.1 --port=8080 --rules=/home/user/tour/firestore.rules`
- `@firebase/rules-unit-testing` + `firebase` ligger i `functions/node_modules`
  (IKKE i rod-`node_modules`). Kør PoC uden for repoet ved at lave en
  `node_modules/` i scratchpad-mappen med symlinks til `@firebase`, `firebase`,
  `vitest` og `tinypool` — ellers finder vitest en ødelagt `vitest` længere oppe
  i scratchpad-træet ("No handler function exported from .../worker.js").
- Fælde i regel-PoC'er: `myLeagueIds()` (firestore.rules ~L596) læser
  `games/{gameId}/players/{uid}.leagueIds` — ikke `leagues/{id}/members`. Uden
  `leagueIds` på player-dokumentet fejler ALLE læsninger af andres tips, og man
  tror fejlagtigt, at reglen er stram.
- Server-kerner (`superligaSync.js` m.fl.) kan PoC'es rent i node med en fake db:
  `{ collection: () => ({ doc: () => ({ collection: () => col }) }), batch: ... }`.

## Bekræftede antagelser om reglerne (emulator-verificeret)

- Tip-vinduet er ÉN betingelse: `request.time < matches/{matchId}.kickoff`
  (firestore.rules L820 create, L843 update). Der er INGEN "kampen er begyndt"-
  hukommelse. Flyttes `kickoff` frem i tiden, åbner vinduet igen — også for en
  kamp, der er spillet. Læsning af andres tips er den omvendte betingelse
  (L799), så en fremflytning SKJULER samtidig sporet igen.
- Rolle-eskalering er lukket: bruger kan kun oprette sig som
  `role:'player'/status:'pending'` (L99-104), `writingProtectedUserFields()`
  (L56) spærrer `role`/`status`/point-felter på egen profil, og en globalAdmin
  kan ikke ændre roller (L116-119) — kun owner. Admin-porten i callables
  (`users/{uid}.role in {owner, globalAdmin}`) er derfor holdbar.
- `games/{gameId}/matches/{matchId}: allow create, update: if isGlobalAdmin()`
  (L751) er UDEN feltbegrænsning: en globalAdmin kan sætte `kickoff` frit fra
  klienten. Kendt og accepteret, men husk det, når nye felter lægges på matches.
- Spiller kan ikke sætte `points` på eget tip, ikke flytte kickoff, ikke
  opdatere eget tip efter kickoff. (Kontroltests kørt — de er GRØNNE, så
  opsætningen måler noget.)

## Angrebsveje der VIRKER (åbne eller kun delvist afbødet)

- **Fremmed kilde → genåbnet deadline.** `syncKickoffsCore`
  (functions-platform/superligaSync.js L467-517) springer kun kampe over, hvis
  de har `result`. En kamp, der er i gang / spillet, men uden facit endnu, kan
  få sin `kickoff` flyttet fra FORTID til FREMTID af den daglige 6.10-kørsel.
  48-timers-alarmen (L498-499) filtrerer på `tilMs - nowMs < 48t` og fanger
  derfor IKKE den retning. Bekræftet både i kernen og i emulatoren.
  Den symmetriske retning (fremtid → fortid) fanges af alarmen, men eksponerer
  alles tips med det samme (L799) — halvdelen af en tur-retur er dækket.
- **Alarm-druknen.** `mangler` i syncKickoffsCore samler ALLE kilde-kampe uden
  dokument. Kilden (pulselive competition=8) leverer hele sæsonens 380 kampe,
  mens `pl2627-efteraar` kun har 180 (runde 1-18) → 200 poster i alarmen hver
  dag. Seed-vejen har `--runder 1-18`; synk-vejen har intet filter, så
  paritets-påstanden gælder ikke `mangler` (den bygges UDEN for den spejlede
  `kickoffPlan` og kan derfor ikke fanges af paritetstesten).

## Afprøvet og RENT (gentag ikke arbejdet uden grund)

- `londonTilUtcMs`- og `kickoffMs`-regexerne er fuldt ankrede med faste
  kvantorer → lineære. Målt: 500 000 tegn på ~1 ms. Ingen ReDoS. Input kommer
  desuden kun fra provider-API'et, aldrig fra en bruger.
- `syncGameKickoffsNow` (functions-platform/index.js L371): auth → rolle →
  `SYNCED_GAMES.find` → `Object.hasOwn(PROVIDERS, ...)`. Intet bruger-input når
  skrivningen: `gameId` bruges kun via det fundne `g.gameId`, doc-id'er kommer
  fra `resolveDocs` over EKSISTERENDE doc-id'er, og skrivningen er `batch.update`
  (kan ikke oprette). `dryRun` fejler lukket i BEGGE ender
  (`dryRunFraKald` = `!== false`, og `opts.dryRun !== false` i kernen) — men de
  er to vagter om samme beslutning; kernens er den bærende.
- Zone-vagten i `pulselive.hentKickoffs` kaster FØR planen bygges → ingen delvis
  skrivning. Fanges pr. spil i det daglige skema; andre spil kører videre.
  Konsekvensen er tilgængelighed (tider rettes ikke den dag), ikke integritet.
- Ingen hemmeligheder i den nye kode: pulselive kræver kun Origin/Referer-headere.
- App Check håndhæves ingen steder i functions-platform (konsistent, præeksisterende).

## Bekræftede antagelser om reglerne (fortsat — c19dca7, driftstatus)

- `driftlog/{id}` + `driftAlarmer/{id}` (firestore.rules L383-390):
  `read: isGlobalAdmin()`, `write: false`. Emulator-verificeret med 26 tests,
  heraf 5 kontroltests der ALLE er grønne (spiller kan ikke hæve totalPoints,
  ikke blive globalAdmin, ikke læse emailLog) → opsætningen måler noget.
  Verificeret UD OVER repoets egne tests: **LIST/QUERY**, ikke kun getDoc —
  `getDocs(collection(...))` og `query(..., where('loestAt','==',null))` er
  tilladt for owner/globalAdmin og nægtet for spiller, pending-spiller og
  uautentificeret. Ingen "regler er ikke filtre"-fælde: reglen er
  dokument-uafhængig, så listen virker.
- `ProtectedRoute require="admin"` (src/components/ProtectedRoute.jsx L13) er
  PRÆCIS samme prædikat som rules' `isGlobalAdmin()` (owner ∪ globalAdmin,
  AuthContext L47-49). Admin-faner må derfor gerne læse admin-only data uden
  ekstra gate — men tjek det igen, hvis nogen indfører en tredje rolle.
- `isGlobalAdmin()` ser IKKE på `status`. En globalAdmin med status `pending`
  kan læse alt admin-only. Præeksisterende og konsistent med callables'
  rolle-kun-port.

## Angrebsveje der IKKE virker (afprøvet, gentag ikke)

- **alarmId-fuzz mod `kvitterDriftAlarm`** (functions-platform/index.js
  L495-508). 16 fjendtlige værdier kørt mod ægte admin-SDK + emulator:
  `../users/p1` (afvist af `.includes('/')`), `..%2Fusers%2Fp1`, `\`-varianter,
  NUL-byte, 1600 tegn, objekt/array/tal/bool, `__proto__`, `constructor`,
  `prototype`. **Ingen** forlader `driftAlarmer/`; kontrol-dokumentet
  `users/p1` var urørt bagefter. Prototype-tricks er umulige: værdien bliver
  aldrig en objektnøgle, kun `String()` → doc-id.
  Restnit (kosmetisk): `.`, `..` og `__proto__` giver en UBEHANDLET
  INVALID_ARGUMENT fra SDK'en → klienten får `internal` i stedet for
  `invalid-argument`. Rettelse hvis nogen alligevel rører linjen:
  `/^[A-Za-z0-9_-]{1,200}$/`.
- **Lækage via driftlog-beskeder.** Provider-fejl formuleres som
  `HTTP ${res.status}` (syncProviders.js L137/154/186/250/302) — URL'en når
  ALDRIG en fejlbesked, så `access_token` kan ikke lække den vej. (Og
  superliga-ACCESS_TOKEN, syncProviders.js L55-56, er et OFFENTLIGT app-token,
  hardkodet med kommentar — ikke en secret.)
- **XSS i alarm-/statusbeskeder.** React escaper; `whiteSpace: 'pre-line'` er
  ren CSS; intet `dangerouslySetInnerHTML` i DriftTab. Og intet
  SPILLER-skrevet indhold når driftlog: `gameNavn` kommer fra games-dokumentet
  (admin-skrevet), `kampId` fra provider-id/doc-id.
- **Composite index til `loesDriftAlarmer`** (driftlog.js L130-134,
  gameId== + type== + loestAt==) er IKKE nødvendigt: tre LIGHEDS-filtre løses
  af Firestore uden composite index (zigzag merge join). Prior art i drift:
  functions/index.js L771-772 (joinCode== + status==) kører i produktion uden
  index-def. Ingen fail-silent i produktion. Gælder generelt: kun
  ulighed/orderBy/array-contains kombineret med andet kræver en index-def.
- **Skrive-forstærkning via callables til driftlog:** findes ikke. Alle
  driftlog-/driftAlarmer-skrivninger sker fra `onSchedule` (index.js L281,
  334, 377, 385, 394, 413, 429, 435, 441, 446, 454). `kilde: 'manuel'`-grenen
  i driftlog.js L84 kaldes ALDRIG fra produktionskode — kun fra testen. Ingen
  bruger kan spamme ejerens statusflade.

## Åbne observationer (ikke sårbarheder, men kend tallene)

- `strandedMatches` (superligaSync.js L91-101) har INGEN nedre tidsgrænse:
  ved længerevarende kilde-nedbrud vokser mængden til hele kampprogrammet.
  `meldAlarm` skriver UBETINGET pr. alarm pr. kørsel, og sweepet kører 12×
  i døgnet → 180 strandede kampe = ~2160 skrivninger + ~2160 læsninger dagligt
  (~11 % af gratis-kvotens 20 000 skrivninger), plus at admin-fladens live-
  listener henter alle åbne alarmer. Afbødning hvis det nogensinde bider:
  spring skrivningen over, hvis `sidstSetAt` er nyere end X timer.
- `naesteSweepFoerMs(Date.now())` (index.js L394) evalueres UDEN FOR
  `skrivDriftStatus`' try/catch (argument evalueres før kaldet) og uden for
  loop-kroppens try'er. Kaster den, dør hele sweepet for de RESTERENDE spil.
  Ren aritmetik i dag → teoretisk, men vagten sidder et hak for langt inde.

## Testhuller værd at huske

- `functions/rules.test.js` L1320-1358 (driftlog/driftAlarmer) tester kun
  `getDoc`. Klienten bruger `collection()`-listener og
  `where('loestAt','==',null)`. Skærper nogen reglen med et `resource.data`-led,
  bliver fladen tom UDEN at suiten bliver rød. Samme hul findes formentlig i
  emailLog-testene, som mønstret er kopieret fra.

## Faste faldgruber i dette repo (vedligeholdes her)

- Regler er ikke filtre. En strammet læseregel uden matchende query = tom liste.
- Klient-validering er ikke håndhævelse.
- Doc-id'er skal bindes (`uid_matchId`) — ellers dublet-dokumenter.
- Callables kan kaldes af enhver, der er logget ind, også `pending`.
- Hemmeligheder i `defineSecret`, aldrig i kode/logs/`process.env`.
- AI-prompter kan forgiftes af brugerskrevne navne — saniter.
- **Nyt: en tidsværdi, der ER en deadline, må ikke kunne bevæge sig frit i
  begge retninger fra en fremmed kilde.** Spørg altid: hvad sker der, hvis den
  nye værdi flytter et LUKKET vindue tilbage til åbent?
- **Nyt: en alarm, der altid råber, er ingen alarm.** Tæl, hvor mange poster
  den vil indeholde på en normal dag, før du godkender den som afbødning.
- **Nyt: en regel-test på getDoc beviser ikke, at LISTEN virker.** Klienten
  lytter på collections; test `getDocs(collection(...))` og den PRÆCISE query
  med `where(...)` — både at admin må, og at en menig nægtes.
- **Nyt: doc-id fra bruger-input skal whitelistes, ikke blacklistes.** `'/'`
  lukker sti-flugt, men `.`/`..`/`__x__` er reserverede og giver en ubehandlet
  SDK-fejl. Et ankret regex er ét udtryk mod tre fælder.
  RETTELSE (emulator-bekræftet på gameTipStatus): det ankrede regex
  `[A-Za-z0-9_-]` lukker `.` og `..`, men slipper `__proto__`/`__name__`
  igennem — de er stadig reserverede. Komplet form er regexen PLUS `!/^__.*__$/`.
- **Nyt: når vagten er kodens FORM og ikke en regel, skal testen angribe
  formen.** En test på det rene mellemled (hvis input pr. konstruktion er
  harmløst) kan ikke fejle. Muter LÆSEREN og se, om suiten bliver rød.

## PL-live (690829a) — angrebsflade: FREMMED KILDE → felter alle kan læse

PoC-mønster der virker og kan genbruges (ingen emulator nødvendig):
ÆGTE provider + ÆGTE `syncLiveCore` + fake db (kopiér `fakeDb` fra
`functions-platform/syncProviders.test.js` L27-70) + `fetchFn` der returnerer
et FJENDTLIGT JSON-svar. Kør fra scratchpad, kræver ingen node_modules.

**Afprøvet og RENT (bekræftet, gentag ikke):**
- Fjendtlige EKSTRA felter i API-svaret (`result`, `homeGoals`, `status`,
  `kickoff`, `points`) når ALDRIG dokumentet. `syncLiveCore` (superligaSync.js
  L262-274) bygger objektet felt for felt — kun `live`. Kilden kan ikke røre
  point.
- Skrivningen er bundet i to led: `resolveDocs` fodres med `current.keys()`
  (= `opts.only` = `pendingMatches`, kickoff inden for 2,5 t BAGUD), og
  `if (!cur) continue` (L255). Et matchId uden for `only` skriver intet.
  Live kan derfor aldrig stå på et kort, der stadig tager tips.
- **Suffiks-forveksling findes ikke.** `resolveDocs` (syncProviders.js L399-412)
  bygger et Map på det EKSAKTE suffiks efter sidste `-` og slår op med `get()`,
  ikke `endsWith`. `'101'` rammer ikke `r1-9101`. (Kollision KAN opstå, hvis to
  doc-id'er deler samme suffiks — sidste vinder — men PL-id'erne er
  `r{runde}-{matchId}` med unikke matchIds.)
- Prototype-fælden i `plLiveStatus` er lukket: `constructor`, `__proto__`,
  `toString`, `hasOwnProperty`, `valueOf`, `prototype` giver alle `'ukendt'`
  (streng). Kontrol: `FirstHalf`/`FIRSTHALF`/` firsthalf ` → `foerste`.
- `status` er ALTID fra det lukkede sæt → intet kilde-ord når skærmen ad den
  vej. `statusRaw` er altid `String(...).slice(0,40)` og renderes ingen steder
  (kun `live.status`/`home`/`away` læses i footballRounds.js L192-210).
- `Number.isFinite` filtrerer `'5'`, `{}`, `true`, `null` væk. **Men** `1e308`,
  `-7` og `1.5` slipper igennem til `live.home/away` (kosmetisk; rører ikke point).
- 200 uden `data`-liste kaster i BÅDE hentLive og hentFaerdige; dokumentet
  urørt. Kontroltests grønne: tom liste → `slut`-markering (ikke sletning),
  og facit slår live.

**Nye angrebsveje/observationer (ikke-blokerende, kend dem):**
- `{"period":{"toString":null}}` er JSON-nåbart og får `String(m.period)` til at
  kaste `TypeError: Cannot convert object to primitive value` i `plIGang`
  (syncProviders.js L305) — ÉN dårlig post dræber hele minuttets live-synk for
  spillet. Fejler lukket (fanget i `runScheduledSync` L432), men blast radius er
  hele listen.
- `console.warn` logger `raw` UKLIPPET (L291) — modsat `statusRaw`. 5000 tegn
  pr. kamp pr. minut, hvis kilden sender skrald.
- `kampe.push(...data.data)` (L258) kaster RangeError ved ~300k elementer
  (målt). Fejler lukket.
- **Dobbelt hentning:** `hentFaerdige` OG `hentLive` kalder hver sin
  `plAlleKampe` = 4+4 sider pr. minut pr. kampvindue. Værste tilfælde med
  `AbortSignal.timeout(10000)`: 40 s + 40 s + superligaens 20 s = 100 s > de
  60 s, `onSchedule` har som DEFAULT (ingen `timeoutSeconds` i
  functions-platform/index.js L262). Rate-limit fra pulselive rammer FACIT-vejen,
  ikke kun live. Afbødning: memoiser `plAlleKampe` pr. kørsel.
- `hentFaerdige` matcher `m.period === 'FullTime'` CASE-FØLSOMT (L312), mens
  `plIGang`/`plLiveStatus` lowercase-normaliserer. Ændrer kilden kun bogstavering,
  bliver kampen stille i BEGGE ender (ingen live, intet facit) — kun sweep-alarmen
  fanger det. Én normaliseret prædikat ville være "én vagt pr. regel".
- `liveHeartbeatAt` bumpes af `events.length > 0` (superligaSync.js L344) — og
  PL's `hentLive` er med vilje IKKE matchweek-filtreret, så en kamp UDEN FOR
  spillets runder kan holde pulsen frisk for et spil, den ikke tilhører →
  `forældet` bliver falsk-frisk. Kun relevant i overlappende runde-weekender.

**Faldgrube til listen:** *en fremmed kilde skal ikke bare valideres pr. felt,
men pr. POST — én giftig post må ikke kunne vælte hele partiet.* `String()` på
et rå JSON-objekt kan kaste; læg `String()`-konverteringen i en try eller filtrer
posten fra, hvis den ikke er en streng.

## Invitations-mailen (eaa7836) — angrebsflade: ADMIN-INPUT → HTML i 300 mails

PoC-mønster (ingen emulator, ingen node_modules): `inviteTemplate.js` er rene
funktioner — `require()` dem direkte fra en scratchpad-fil og kald
`ligaProfil(fjendtligtSpilDok)` + `invitationsHtml({...})`. Doc-path-adfærd kan
testes offline: `cd functions-platform && node -e "...initializeApp({projectId:'demo-x'})..."`
— `db.collection(c).doc(id)` validerer stien UDEN netværk.

**BEKRÆFTEDE svagheder (pre-existing, admin-gated, ikke lukket):**
- `joinLink.startsWith(APP_URL)` (index.js L664, APP_URL = `'https://tip.vejleaa.dk'`
  UDEN skråstreg, mailer.js L14) slipper `https://tip.vejleaa.dk.evil.dk/…` OG
  `https://tip.vejleaa.dk@evil.dk/` igennem. Vagtens erklærede formål ("knappen
  kan aldrig pege ud af huset") holder ikke. Fix: `startsWith(APP_URL + '/')`.
- `<a href="${cta}">` (inviteTemplate.js L189) flettes RÅT — `esc()` bruges kun
  til den synlige kopi af linket (L192). `https://tip.vejleaa.dk/x" style="…` er
  attribut-breakout, og `…/"></a></td></tr></table><a href="https://phish/">…`
  er fuld HTML-injektion i mailen. Begge kørt, begge virker.
  Sammen: en globalAdmin (= en af vennerne) kan sende en officiel
  tip@vejleaa.dk-mail til 300 med en phishing-knap. Fix: `href="${esc(cta)}"`.
- `gameId` fra klienten er ikke valideret som doc-id: `'a/b/c'` bliver til
  `games/a/b/c` (subcollection-dok). `'.'`/`'..'` accepteres ved konstruktion.
  Ingen lækage (kalderen er admin), men samme mønster som kvitterDriftAlarm →
  ankret regex `/^[A-Za-z0-9_-]{1,200}$/`.

**Afprøvet og RENT (gentag ikke):**
- `requireAdmin` (index.js L607-615) er FØRSTE linje i sendBroadcastEmail →
  ingen pending/menig når hverken gameId-opslaget eller SMTP.
- `esc()` på `shortName || name` i ukendt-provider-grenen virker
  (`<img src=x onerror=…>` → entiteter). Kontroltest kørt: PoC'en ville have
  set den rå værdi, hvis den var der.
- `poolSize = Number(x) || 6` kan ALDRIG blive en streng → ingen injektion.
  `'<img …>'`→6, `{}`→6, `true`→1, `'1e400'`→Infinity (kosmetisk i mailen).
- `intro` (admins fritekst) escapes; alle andre profilfelter (overskrift,
  periode, chip3, navn i PL/SL-grenene) er faste konstanter i koden.
- `broadcastHtml` (ikke-skabelon-grenen, mailer.js L55-57) er sikker: den
  auto-linkende regex kører EFTER `escapeHtml`, så `"` er allerede `&quot;`
  → ingen attribut-breakout. Modsat invitations-grenen.
- `games/{id}: allow read: if isApproved()` (firestore.rules L619) → gameId-
  opslaget kan ikke lække noget, en admin ikke måtte se. `allow create,update:
  if isGlobalAdmin()` (L646) → spil-dokumentets indhold er admin→admin.
- Omkostning: ét ekstra `get()` pr. kald, bag admin-porten, max 300 modtagere.

**Observationer:**
- `String(game.name)` kaster TypeError på `{name: {toString: null}}` (et lovligt
  Firestore-map) → callable svarer `internal`. Admin→admin, kosmetisk.
- Serveren falder TAVST tilbage til Superliga-profilen, hvis `gameId` mangler
  (`if (gameId)`, index.js L668) → forkert mail, ikke ingen mail. Klienten kan
  ikke ramme det (`canSend` kræver liga, liga kræver gameId), men en håndlavet
  payload med `template:'invitation'` uden gameId sender SL-salgstalen om PL.
  Kræv gameId ved `'invitation'`; behold `'superliga'` som den gamle vej.
- `navn` har intet længdeloft (modsat `leagueName`, der `.slice(0,60)`).
  50 000 tegns `shortName` → 111 KB HTML × 300 mails (målt).

**Faldgrube til listen:** *escaping, der bor hos PRODUCENTEN i stedet for hos
forbrugeren, er en tidsindstillet bombe.* `ligaProfil` returnerer et FÆRDIG-
ESCAPET `navn`, mens `invitationsHtml` fletter `l.navn` råt ind. Kontrakten står
kun i en kommentar. Næste profil-gren, nogen tilføjer uden `esc()`, er en
injektion — og suiten bliver grøn. Escap ved indsættelsen, ikke ved dannelsen.

## gameTipStatus (26e9dea/8b3f404) — angrebsflade: ADMIN-CALLABLE MED ERKLÆRET GRÆNSE

Ny type sag: en callable, hvis eneste eksistensberettigelse ER en grænse
(reglerne TILLADER admin at læse alle bets — callablen findes for at picks ikke
skal ned i admins browser). Her er vagten *koden selv*, ikke firestore.rules,
og så skal man spørge: hvad beviser, at vagten stadig står i morgen?

**PoC-mønster (genbrug):** `hentTipStatus` kan køres HELT uden emulator med en
fake db, der returnerer FJENDTLIGE bet-dokumenter (`pick`, `points`,
`hemmelig`, `__proto__`) og fjendtlige user-docs (privat email, XSS-navn), og
så `JSON.stringify(svar)` mod en liste forbudte regexer. Kør ALTID samme PoC
mod en MUTERET udgave bagefter — ellers ved du ikke, om PoC'en kan se en læk.
Fil: scratchpad/poc/leak.js-mønstret.

**BEKRÆFTET RENT:** intet pick, ingen points, ingen privat e-mail, intet ukendt
bet-felt forlader svaret. Grunden er stærk-ved-konstruktion: `betByUid` er
`Map<uid, Set<matchId>>` (picket kommer aldrig ind i processen), og BÅDE
`byggTipStatus`' output og `manglende` bygges felt-for-felt — INGEN
`...m`/`...u`-spread nogen steder. `emails` bruges kun som `!!`-boolean.

**BEKRÆFTET TESTHUL (samme klasse som CLAUDE.md's "tests bekræfter sig selv"):**
`hentTipStatus` har NUL tests. Testen der hedder "grænsen står i selve
datastrukturen" (reminders.test.js) kalder `byggTipStatus`, hvis input pr.
konstruktion er Sets — den kan ikke fejle. Mutation kørt på 8b3f404:
`add(b.matchId)` → `add(b)` PLUS et `raaBets`-felt i svaret ⇒ alle spilleres
1X2-valg i svaret, **12/12 tests grønne**. Modgift, hvis nogen rører linjen:
en test der kører `hentTipStatus` mod en fake db med et `pick`-felt og
assertérer `JSON.stringify(...)` uden `pick`.
→ **Faldgrube til listen: når vagten er kodens FORM, skal testen angribe
formen — en test på det rene mellemled beviser intet om læseren.**

**Regel-kontroltests (emulator, kørt mod firestore.rules på denne branch):**
- `getDocs(games/{g}/matches)` (klientens nye direkte læsning): tilladt for
  globalAdmin, godkendt deltager OG godkendt ikke-deltager; nægtet for pending,
  pending-globalAdmin og uautentificeret. `allow read: if isApproved()` (L764)
  er dokument-uafhængig → ingen "regler er ikke filtre"-fælde.
- Kontroltests GRØNNE (opsætningen måler noget): menig kan ikke læse andens tip
  før kickoff, ikke liste alle bets, ikke sætte `points`, ikke hæve
  `totalPoints`, ikke flytte `kickoff`.
- Admin KAN liste alle bets med picks direkte fra klienten — grænsen er altså
  frivillig disciplin, ikke håndhævelse. Det står ærligt i koden; husk det, hvis
  nogen nogensinde påstår, at fladen *forhindrer* admin i at se picks.

**Doc-id-regexen er stadig ikke helt tæt.** `/^[A-Za-z0-9_-]{1,200}$/` (den jeg
selv anbefalede efter kvitterDriftAlarm) lukker `.`, `..` og `/` — men IKKE
`__proto__`/`__name__`/`__id__`. Emulator-bekræftet: `.doc('__proto__')` er OK
ved KONSTRUKTION (SDK 12.x kaster ikke der) og kaster først ved `.get()`:
`INVALID_ARGUMENT: Resource id "__proto__" is invalid because it is reserved`
→ ubehandlet → callablen svarer `internal` i stedet for `invalid-argument`.
Kosmetisk, admin-gated. Komplet form: regexen **plus** `!/^__.*__$/`.

**Skala målt (emulator, ægte admin-SDK + ægte hentTipStatus):**
0 deltagere OK (`db.getAll()` er vagtet med `memberUids.length ? ... : []`),
1000 deltagere × 38 kampe = 3,5 MB svar / 272 ms, 380 kampe i én runde × 30
deltagere = 1,1 MB. `chunk(...,30)` klarer 380 id'er (13 `in`-queries).
Svaret er O(deltagere × rundens kampe) UDEN loft → ~10 MB callable-grænsen
nås først ved ~1000 deltagere × 110 kampe. Ikke et problem i en vennekreds.
Pris pr. klik (30 spillere, 380 kampe i spillet): ~800 server-læsninger +
klientens egne ~380 på matches; hvert rundeskift i dropdown'en koster ~800 igen.
`emailByUidMap` scanner HELE `userContacts` for at udlede én boolean pr.
spiller — arvet fra påmindelsesvejen, og forbeholdet står ærligt i koden.

## leagueQuestionStatus (78b69ea) — angrebsflade: MEDLEMS-CALLABLE MED SVAR-LÆK-GRÆNSE

Ny klasse: en callable, der bevidst er MERE tilladende end firestore.rules
(rules har ingen læsegren for andres åbne `questionAnswers` — heller ikke for
admin), og som derfor ER hele grænsen. Alt herunder emulator-verificeret.

**BEKRÆFTET RENT — `fieldMask: []` er en ÆGTE, bærende vagt.**
Målt på wire-niveau mod emulatoren (`@google-cloud/firestore` 7.11.6):
`readOptions.fieldMask = []` er TRUTHY (transaction.js L546) → `request.mask =
{fieldPaths: []}` (document-reader.js L112-114) → backend returnerer
`exists:true` og `data() === {}`. Kontrol UDEN mask: fulde data. Det hemmelige
felt findes ikke engang i det RÅ snapshot-objekt (`JSON.stringify(snap)`).
→ Mutation af KUN `.exists`→`.data()` lækker INTET (mask'en fanger det);
mutation af KUN mask'en lækker heller intet (`.exists` fanger det). To
UAFHÆNGIGE vagter — godt for dybden, men ingen af dem bliver rød alene i en
mutationstest. Testene i gameLeagues.test.js asserterer heldigvis BEGGE
(`sidste.fieldMask` toEqual `[]` + `db._kaldteData` toEqual `[]`) — den
modgift, jeg efterlyste efter gameTipStatus, er faktisk skrevet.

**BEKRÆFTEDE huller (rapporteret, ikke lukket i 78b69ea):**
- **Ingen `isApproved`-ækvivalent.** Callablen kræver kun `request.auth` +
  medlemskab. Et medlem med `status:'rejected'` (bortvist) står stadig i
  `memberUids` — INTET fjerner dem (redeemLeagueCodeCore L57 spærrer kun for
  gen-tilmelding) — og får fuldt svar: liganavn, alle åbne spørgsmåls-labels,
  alle medlemsnavne, hvem der har svaret. Rules kræver `isApproved()` HVERT
  sted i leagues-træet, så callablen er strengt mere tilladende end klientvejen.
- **Læse-forstærkning før autorisation.** `hentSpoergsmaalStatus` køres FØR
  medlems-tjekket. Målt: 30 medl × 10 åbne sp = 341 læsninger, 60×40 = 2501,
  100×60 = 6161 — pr. kald, også for en kalder der ender med
  `permission-denied` (målt 87 vs. 1 for ukendt liga). Ingen App Check, ingen
  rate limit. Fix: læs ligaen, tjek medlemskab, læs SÅ questions/svar/brugere.
- **Eksistens-orakel.** `not-found` (1 læsning) vs `permission-denied` (87) for
  ENHVER authenticated — også `pending`. Praktisk ufarligt: leagueId er et
  auto-id fra `doc(collection(...))` (~62^20). Skelnes desuden på LATENS, så
  ens fejlkoder alene ville ikke lukke det — kun rækkefølge-fixet gør.
- **Griefing via `displayName`.** `users/{uid}` update-reglen (L107) type-tjekker
  IKKE `displayName` — emulator-bekræftet at en spiller må skrive `42`, `{a:1}`,
  `['a']`, 100k tegn på sig selv. `a.navn.localeCompare` (gameLeagues.js L112)
  kaster da `TypeError` → callablen svarer `internal` → knappen er død for HELE
  ligaen. `navn` har heller intet længdeloft (modsat `label`, der `.slice(0,120)`).
  Fix: `String(...).slice(0, 60)`.
- **"Kopierer skrivereglen" gør den ikke helt.** Koden: `q.facit == null` (dvs.
  manglende nøgle = åbent). Reglen: `question(qid).facit == null` UDEN
  `.get('facit', null)` → en manglende nøgle er en EVALUERINGSFEJL → nægtet.
  Emulator-bekræftet: et spørgsmål uden `facit`-nøgle kan INGEN svare på (heller
  ikke ejeren), men callablen lister alle som "mangler". Kun nåbar med håndlavet
  skrivning (den ægte klient skriver altid `facit: null`).

**Afprøvet og RENT (gentag ikke):**
- Forfalskning af en ANDENS "har svaret" er umulig. Rules binder
  `answerId == questionId + '_' + auth.uid`, så doc-id'et ender ALTID på
  angriberens eget uid; kollision med `Q_offer` kræver at offerets uid er
  suffiks af angriberens (samme længde, forskellige) → udelukket. 4 varianter
  kørt, alle nægtet, kontroltest (eget svar) grøn.
- Et EKS-medlems svar kan ikke give "5 af 4" (refs bygges af `memberUids`).
- Ingen læk af `svar`, `points`, `facit`, `role`, `status` eller privat e-mail —
  PoC med forbudte regexer + MUTERET udgave, der lækker (kontrollen virker).
- Id-valideringen er identisk med gameTipStatus (`/^[A-Za-z0-9_-]{1,200}$/` PLUS
  `!/^__.*__$/`), anvendt på BEGGE id'er, alle 7 fjendtlige værdier afvist med
  0 læsninger. `label: {map}` → `''`; `deadline: {map}` → spørgsmålet skjules
  (fejler lukket). `facit: false` → behandles som lukket, ligesom i reglen.

**PoC-filer:** scratchpad/poc/{1-fieldmask,2-flow,3-adgang,4-oedelaeg,7-skala}.js
+ {5-rules,6-kontrol,9-forfalsk2}.mjs. Emulator startes som beskrevet øverst;
`node_modules` symlinkes til functions-platform/node_modules.

**Faldgrube til listen:** *en callable, der bevidst er mere tilladende end
reglerne, arver ikke reglernes forudsætninger.* Rules siger `isApproved()` i
hver eneste gren; callablen sagde kun "er du i listen". Spørg altid: hvilke
prædikater står FORAN denne data i firestore.rules, og har callablen dem alle?
**Og:** *autorisationen skal stå foran de dyre læsninger — ellers betaler
projektet for en afvist kalder.* Rækkefølgen lukker eksistens-orakel og
omkostning i ét greb.

## leagueQuestionRecap / #39 (0657068) — Runde-Botten afslører et liga-spørgsmål

**Nyt PoC-mønster, det bedste hidtil: KØR CALLABLEN ÆGTE mod emulatoren.**
v2-`onCall` har `.run({ auth:{uid}, data, rawRequest:{} })`. Kombineret med en
`Module._load`-hook, der returnerer en FAKE `@anthropic-ai/sdk`-klasse (tæller
kald + fanger `messages[0].content` = de FAKTA, modellen ser), giver det hele
adgangsmatrixen + prompt-input i ét kørt script. Opskrift:
`process.env.FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, `GCLOUD_PROJECT=demo-x`,
`ANTHROPIC_API_KEY=test-key`, `require('functions-platform/index.js')`, kør fra
`cd functions-platform`. Filer: scratchpad/poc/lq39-{callable,gift2}.js,
lq39-{rules,gift,deadline}.mjs, lq39-fakta.js.

**BEKRÆFTET HUL (pre-existing, IKKE lukket): "kortene kan ikke lukkes igen"
holder ikke — slet + genopret spørgsmålet med SAMME doc-id.**
`questions` har `allow delete: if qOwner()` (firestore.rules L999), mens
`questionAnswers` har `allow delete: if false` og doc-id `qid_uid`. Kæden
(emulator-kørt, BEGGE varianter):
facit-vejen: sæt facit → læs alles svar → slet spørgsmålet → opret samme id med
`facit:null` → overskriv sit EGET svar med det rigtige → sæt facit = 100 point.
deadline-vejen: vent på deadline → læs alles svar → slet → opret samme id med
FREMTIDIG deadline → ret sit svar → sæt facit. Begge de direkte veje (nulstil
facit, rul deadline tilbage) er korrekt lukkede — omvejen er ikke.
Fix: `allow delete: if isApproved() && qOwner()==uid && resource.data.get('facit',null)==null && (resource.data.get('deadline',null)==null || request.time.toMillis() < resource.data.deadline)`.
Samme omvej giver også ubegrænsede AI-kald og "botten siger hvad ejeren vil":
det genoprettede spørgsmål har intet `botFacitAt`, så de GAMLE svar afsløres
igen under en NY label og et NYT facit (kørt: modellen fik
`{"spoergsmaal":"HELT ANDET SPOERGSMAAL","facit":"9","vindere":["M2"]}` over
svar afgivet på det oprindelige spørgsmål).

**BEKRÆFTET RENT (gentag ikke):**
- `botFacitAt`-vagterne holder i ALLE fire skriveformer, jeg kunne finde:
  `update`, `= null`, `setDoc`-overskrivning af hele dokumentet, og
  `deleteField()` (`affectedKeys().hasAny` fanger også sletning). Kontroltest
  grøn: ejeren må stadig sætte facit. Repoets 203 regel-tests er grønne.
- Adgangsmatrix for `leagueQuestionRecapNow` (alle kørt): pending,
  pending-globalAdmin, **rejected/bortvist medlem**, menigt medlem og admin
  UDEN medlemskab nægtes alle forhåndsvisningen (= svar+navne). Kun ejer-og-
  medlem får den. Dette er den FØRSTE callable med et rigtigt
  `status === 'approved'`-tjek — #38's `leagueQuestionStatus` mangler det
  stadig (bortvist medlem får svar-status dér).
- Rækkefølgen er rigtig: approved-tjek FØR `not-found` → en pending kan ikke
  sondere liga-id'er. (En APPROVED ikke-ejer kan stadig skelne
  `permission-denied` fra `not-found` — auto-id'er, praktisk ufarligt.)
- Id-validering: `/^[A-Za-z0-9_-]{1,200}$/` + `!/^__.*__$/` på alle TRE id'er,
  før enhver læsning. 10 fjendtlige værdier afvist med 0 læsninger.
- Ingen læk i AI-fakta: felt-for-felt bygget, intet spread. E-mail, `role`,
  `status`, ukendte svar-/spørgsmålsfelter og `acceptedAnswers` når ALDRIG
  prompten (PoC med forbudte regexer).
- `skalAfsloere` er ren og ufølsom: rettelse (`a→b`), bottens egen
  markør-skrivning og sletning giver alle `false`. `''`/`'  '` → `'x'` fyrer
  præcis én gang.

**Nye angrebsveje (rapporteret, ikke blokerende):**
- **Ubegrænsede betalte AI-kald uden admin-port.** `leagueQuestionRecapNow` er
  den første AI-kaldende callable, en ikke-admin kan nå (liga-ejer).
  `tvingNy:true` springer `botFacitAt` over → kørt: 3 opslag + 3 modelkald i
  træk, ingen cooldown, ingen `maxInstances`, ingen App Check. Bemærk: en ejer,
  der har FORLADT sin egen liga, beholder `ownerUid` (update-reglens gren (b)
  kræver kun uændret ownerUid) og kan spamme en væg, hen ikke selv må læse.
  Afbødning: cooldown på `botFacitAt` (afvis `tvingNy` < N min efter sidste
  opslag) eller forbehold `tvingNy` for admin.
- **Ét medlem kan dræbe afsløringen for hele ligaen (griefing).** `answer` og
  `displayName` type-tjekkes ikke af reglerne (emulator-bekræftet: begge kan
  være et map). `{toString: null}` → `String(...)` i `lqNorm`/`rensTekst`
  kaster `TypeError: Cannot convert object to primitive value` → triggeren
  fejler tavst (kun `console.error`), og ejerens knap svarer `internal` for
  altid, uden at nogen kan se hvorfor. Samme gift rammer KLIENTEN endnu
  hårdere (pre-existing #150): `scoreLeagueQuestion` kaldes i render, og et map
  som React-child kaster → hvid side for alle medlemmer.
  Fix ét sted: `String()`-konverteringen i `lqNorm`/`rensTekst` i en try, eller
  filtrér ikke-strenge svar fra ved indlæsningen.
- **Bot-forfalskning på væggen.** `messages`-reglen binder KUN `uid` — ikke
  `displayName`, `avatarEmoji`, `system` eller `questionId` (emulator: et
  medlem kan gemme `{uid: sig selv, displayName:'Runde-Botten',
  avatarEmoji:'🤖', system:true}`). Fladen (GameLeagues.jsx L96) viser
  `byUid[m.uid] || { name: m.displayName, emoji: m.avatarEmoji }`, og `byUid`
  bygges af STILLINGEN (players med `leagueIds`). Forlader forfalskeren
  bagefter ligaen, forsvinder hen fra `byUid` → opslaget står som
  "Runde-Botten 🤖" for alle. Fix: rendér navnet efter `m.system === true` og
  et fast bot-uid, eller kræv `!('system' in request.resource.data)` i reglen.

**Ikke ny eksponering (efterprøvet):** væggens læsekreds (nuværende medlemmer)
er en delmængde af svarenes læsekreds efter facit — også for et medlem, der
kommer til EFTER opslaget. `sov`-listen kan enhver medlem allerede regne ud af
`memberUids` + svar-dokumenterne.

**Faldgrube til listen:** *en uforanderlighed, der bygger på et dokuments
tilstand, holder kun hvis dokumentet ikke kan genopstå.* Er sletning tilladt,
og overlever børnene forælderen på deterministiske id'er, så er "må ikke
nulstilles" i praksis "må nulstilles i to skridt". Spørg altid: hvad sker der,
hvis ejeren SLETTER dokumentet og opretter det igen med samme id?
