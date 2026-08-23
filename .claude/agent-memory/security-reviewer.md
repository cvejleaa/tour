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

- **Fremmed kilde → genåbnet deadline (RETTET, verificeret 2026-08-21).**
  DEN GAMLE post her var forældet: genåbnings-forbuddet
  (superligaSync.js L515-517: `fraMs<=now && tilMs>now → afvist`) LUKKER nu
  past→future for ENHVER kamp uden `result`, ikke kun kampe med facit. PoC kørt
  mod ægte kerne (scratchpad/poc-kickoff.js, case 2): past→future giver
  `genaabninger:[id]`, INTET skrevet, kickoff står. meldAlarm(genaabning,
  kraeverKvittering) fyrer (index.js L540). Retningen er derfor lukket.
  RESIDUAL (åben, by-design, pre-existing PL-klasse): fremtid→TIDLIGERE tid er
  TILLADT (legitime reschedules skal kunne rykke en deadline frem). Backstop er
  KUN <48t-alarmen (`tilMs-now < 48t`, kraeverKvittering). Et move på >48t
  tidligere (fx 7d→3d) skrives TAVST — en kompromitteret kilde kan lukke tips
  tidligt på en fjern kamp uden alarm. PoC case 3 bekræfter: future→nearPast
  skrives + snart-alarm; et >48t-move ville ikke give snart.
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

## puljeBets konfig-styret (#8, cc7edb6) — BEKRÆFTET RENT (emulator, 21+4 tests)

Reglen (firestore.rules L767-816) binder nu antal hold til `game.pulje.poolSize`/
`.nedSize` via `.get('pulje',{}).get(nøgle,0)`. Angreb kørt mod ægte emulator
(PoC: scratchpad/poc8/run.mjs + admin.mjs), ALLE lukket:
- Forkert antal top (5/7/4 i et 6-spil) afvist; smugling af
  points/correct/nedPoints/nedCorrect afvist.
- nedSize>0 (PL 4+3): kræver BEGGE lister; kun-top afvist; forkert antal i
  hver liste afvist; SAMME hold i top OG bund afvist (`championship.hasAny(relegation)`).
- poolSize==0 (spil uden pulje-config): `size()==0` uopfyldelig → INTET kan gemmes.
- Uden `puljeLockAt`: `gameLock()` (BEVIDST direkte opslag uden default) er
  evalueringsfejl → fejler LUKKET for BÅDE skrivning OG andres-læsning
  (bekræftet: andres tip IKKE læsbart uden lock — åbner ikke alt).
- Læsning: eget tip altid; andres FØR deadline nægtet, EFTER deadline åbent for
  isApproved(). Matcher intentionen.
- INGEN admin-omgåelse: puljeBets har ingen isGlobalAdmin-gren og der er intet
  rekursivt `{document=**}`-wildcard. globalAdmin nægtes efter deadline, forkert
  antal, andens uid, points-smugling. Kontroltests grønne → opsætningen måler noget.
- Repoets 213 rules-tests grønne (inkl. 10 nye puljeBets).

**Type-fælde (præeksisterende, IKKE #8, men #8 gør den mere relevant nu PL bruger pulje):**
`beforeDeadline()` sammenligner `request.time < gameLock()`. Reglen kræver at
`puljeLockAt` er en **Timestamp**. Seed (scripts/games.mjs L110) skriver en
`Date` → Timestamp (virker). MEN admin-UI'et GameScheduleTab.jsx L172 skriver
`new Date(x).getTime()` = et **TAL** → `timestamp < int` er "Unsupported
operation" → reglen fejler LUKKET for ALLE pulje-skrivninger i det spil, hvis
en admin redigerer deadline via skema-fanen. Availability-bug, ikke sikkerhed.
Emulator-bekræftet: seed med tal → alle writes/reads-efter-deadline nægtes.

## updateLeagueQuestion / liga-spørgsmåls-rettelse (#40, cc7edb6)

**Rules UÆNDREDE** (eneste rules-hunk i denne branch er puljeBets L767; questions/
questionAnswers 100% urørt). #40 er en KLIENT-only action + UI. Klient-vagten
(gameLeagueActions.js updateLeagueQuestion) er IKKE håndhævelse — en angribende
liga-ejer bruger rå `updateDoc`. Tre PRÆEKSISTERENDE regel-huller BEKRÆFTET via
emulator (scratchpad/poc8/q40.mjs + q40b.mjs), alle kun for `qOwner()`:
1. **Point på AFGJORT spørgsmål.** Update-reglen (L1017-1030) kræver kun
   `points 1-100` UBETINGET — ingen facit/deadline-betingelse. Ejer hæver
   5→100 på et spørgsmål med facit sat. Stillingen beregnes LIVE på klienten af
   `q.points` (leagueQuestionScoring.js L44-101) → direkte manipulation af
   liga-stillingen med alle svar i hånden. Dette er QC's blokerende fund #1,
   "lukket" med en klient-gate der IKKE lukker det.
2. **Første-gangs deadline i FORTIDEN.** Deadline-klausulen tillader ENHVER værdi
   når `old deadline == null` (grenen `resource.data.get('deadline',null)==null`).
   Ejer sætter deadline=fortid → questionAnswers åbnes for læsning for HELE
   ligaen (bekræftet: MEM læste MEM2s hemmelige svar bagefter). Envejs-lås
   (deadline kan ikke ændres igen), så ikke en svar-ændrings-cheat, men
   info-disclosure/griefing.
3. **type text→number EFTER deadline.** Update-reglen begrænser IKKE `type`.
   Ejer ændrer text→number → "nærmest vinder"-scoring aktiveres med svar synlige.

Kontroltests grønne (opsætning måler noget): ikke-ejer kan ikke hæve points,
ejer kan ikke nulstille facit, ikke sætte points>100, ikke rykke deadline
tidligere. Klient-gaten selv er velskrevet MOD en ærlig bruger — men irrelevant
mod en devtools-angriber.

**Kontekst der dæmper "blocking":** liga-ejeren kan ALLEREDE snyde sin egen
liga via slet+genopret-med-samme-id (memory #39/leagueQuestionRecap, BEKRÆFTET,
uafhjulpet). #40 tilføjer ingen regression på rules-niveau. Men QC's præmis
("point-efter-lukning er håndteret") er FALSK. Anbefalet rules-stramning til
questions/update, hvis liga-ejer-grænsen skal lukkes ægte:
- points: `resource.data.points == request.resource.data.points ||
  (facit==null && (deadline==null || now < deadline))`
- type: `request.resource.data.get('type','text') == resource.data.get('type','text')`
- første deadline: kræv `new deadline > request.time.toMillis()` når old==null
- PLUS delete+genopret-hullet fra #39-memory.

**Faldgrube til listen:** *en klient-gate, der "lukker" et QC-sikkerhedsfund, er
theater, hvis den ting den beskytter kan nås med rå updateDoc. Spørg altid: er
vagten i rules eller kun i vores JS? Kun rules tæller mod devtools-angriberen.*

## Pulje-deadline som RUNDE (commit 84002c5, #8) — emulator+kerne-verificeret

- **puljeBets-kontrakten HOLDER (10/10 emulator-checks, PoC scratchpad/poc.mjs).**
  `gameLock()` (firestore.rules L781-790) læser `puljeLockAt` DIREKTE (ingen
  default). Bekræftet trebenet:
  - Fremtidig deadline: eget tip skrives, andres-læsning NÆGTET (kontrol virker).
  - PASSERET deadline: skrivning NÆGTET (kan ikke ændre tip efter at have set
    andres), andres tips LÆSBARE (netop dét genåbning ville misbruge).
  - MANGLENDE puljeLockAt: fejler LUKKET — skrivning + andres-læsning nægtet
    ("Property puljeLockAt is undefined"), EGET tip stadig læsbart. Dvs. et PL-
    spil med puljeLockRound men endnu ingen udledt puljeLockAt er LÅST (ingen
    kan tippe), ikke åbent. Fail-closed = sikker retning.
  - En spiller (ikke-admin) kan IKKE skrive `game.puljeLockAt`/`puljeLockRound`
    (games L646 kræver isGlobalAdmin). Kun admin kan skubbe feltet direkte —
    sync-forbuddet er derfor et værn mod den AUTOMATISKE sti, ikke mod en ond
    admin (som i forvejen er betroet, jf. matches create/update uden feltguard).
- **Genåbnings-forbuddet i syncKickoffsCore (L556-578) virker (PoC core.mjs).**
  - Passeret deadline + rundekamp i fremtid → AFVIST, intet skrevet, log.
  - Q1 BEKRÆFTET: tømmes runden for gyldigt kickoff (nyMs=null), STÅR den
    passerede deadline — `nyMs != null`-vagten gør null til en no-op. Godt.
- **LATENT (ikke reachable af deltager, ikke-blokerende): NaN-kanten i
  re-åbnings-vagten.** L568 `nuMs != null` fanger IKKE NaN. Er `puljeLockAt`
  eksplicit `null` (felt til stede = null → rules eksponerer alles tips), giver
  `kickoffMs(null)=NaN`, `genaabner` bliver false, og synken OVERSKRIVER med en
  fremtidig deadline → puljen GENÅBNES efter eksponering. Bevist i core.mjs
  (case 5). MEN: intet kodepunkt skriver puljeLockAt=null (synken skriver altid
  `new Date(finite)`; PL-seed sætter den slet ikke), så kun en admin kan nå
  tilstanden. Hærdning hvis linjen røres: `Number.isFinite(nuMs)` i stedet for
  `nuMs != null`. Samme mønster bør bruges hvis nogen tilføjer flere vagter.
- **Tavs fejl (Q5): null-udledning (runde uden kickoff) logges IKKE** — kun
  genaabner-grenen logger. Men retningen er fail-closed (puljen forbliver låst,
  ikke åben), så det er tilgængelighed, ikke integritet; manglende round-kampe
  fanges desuden af `mangler`-alarmen.

## NaN-hærdning af puljeLock-genåbning (commit 73639fa, #8) — BEKRÆFTET lukket

- **Hullet fra forrige gennemgang er lukket (PoC, 6/6 kanter grønne).**
  `nuEksponeret = game.puljeLockAt !== undefined && (!Number.isFinite(nuMs) ||
  nuMs <= nowMs)` (superligaSync.js L577-578). Verificeret mod den ægte
  `syncKickoffsCore` med fake-db, alle med rundekamp i fremtiden (nyMs>now):
  - FRAVÆRENDE felt (`undefined`) → SKRIVER (første udledning, trygt). Rigtigt:
    firebase-admin `.data()` giver `undefined` for et fraværende felt, `null`
    for et null-felt — så `!== undefined` skelner dem præcist.
  - `null` → AFVIST (var netop hullet). `kickoffMs(null)=NaN` (L43-47), fanges nu.
  - uparselig streng → AFVIST. `0`/epoch → AFVIST (passeret). Timestamp med
    `toMillis()=NaN` → AFVIST. Alt ikke-fremtidigt = eksponeret = fail-closed.
  - fremtidig gyldig deadline (før eksponering) → opdateres frit. Korrekt: før
    deadline er ingen tips synlige, så flytning i begge retninger er ufarlig.
- **Kontroltesten holder:** rules.test.js "EFTER deadline: eget tip afvises, men
  andres BLIVER læsbart" (den load-bearing egenskab bag forbuddet).
- **syncGameKickoffsNow (index.js L569-591): rolle-porten holder.** owner/
  globalAdmin (L575), ellers permission-denied — en `pending`/`player` afvises.
  `dryRunFraKald` defaulter til SAND (skriver kun ved eksplicit `dryRun:false`).
  gameId slås op i SYNCED_GAMES → manipuleret id afvises. Selv med dryRun:false
  kan callablen IKKE genåbne en pulje: kernen har genåbnings-forbuddet uanset
  kalder. Klient-UI'ens læse-only felt er kosmetik, ikke en server-vagt.
- **LATENT (uændret, ikke-blokerende, admin er betroet):** games create/update
  kræver kun `isGlobalAdmin()` UDEN feltguard på puljeLockAt (rules L646). En
  admin kan `updateDoc` en vilkårlig fremtidig puljeLockAt direkte og genåbne
  en eksponeret pulje uden om synken. Men: (a) admin er betroet (kan i forvejen
  flytte kickoff/matches), og (b) den DAGLIGE sync heler det — næste kørsel
  skriver nyMs = rundens ægte (passerede) tidligste kickoff, som !== den
  manuelle fremtidsværdi og !genaabner (nuMs fremtid ⇒ nuEksponeret false), så
  deadlinen sættes tilbage til fortiden og puljen lukker igen inden for 24t.
- **Alarm `puljeLockGenaabning` (kraeverKvittering:true) er sund.** meldAlarm-id
  = `gameId_puljeLockGenaabning` (kampId null filtreres væk) → stabil dedup,
  bumper `antal` i stedet for nye docs. kvitterDriftAlarm er TYPE-AGNOSTISK
  (sætter bare kvitteretAt på alarmId), så den KAN kvitteres; alarmId'et matcher
  regex `^[A-Za-z0-9_-]{1,200}$` (slug-gameId + suffiks). Ingen loesDriftAlarmer-
  kald bruger denne type, så den auto-lukkes ikke fejlagtigt. Persisterer
  problemet, re-fyrer den daglige sync og nuller kvitteringen igen (korrekt).

## Send mail: billeder + Markdown (commit ba42150, 2026-08-20) — INGEN blokerende fund

- **mailMarkdown er ægte generate-safe (PoC-bekræftet).** Parser til kendte noder,
  al brugertekst gennem `escapeHtml` (escaper `& < > " '`). Al href/src escapes
  → attribut-breakout via `"` i URL bliver til `&quot;`, ingen on*=-injektion.
  Link/img-regex kræver `https?://`-præfiks, så `javascript:`/`data:`/`vbscript:`
  matcher aldrig og ender som inert escaped tekst. PoC-mønster (genbrug):
  `node -e` med payload-liste, flag på `<script|on\w+=|javascript:|data:text` i
  output — MEN husk at escaped tekst (`&lt;`, `&quot;`) er falsk positiv; verificér
  manuelt at det farlige ligger i escaped tekst, ikke i live tag/attribut.
- **Mirror-paritet skal tjekkes på RUNTIME, ikke kun tekst-diff.** src/lib-versionen
  bruges i `dangerouslySetInnerHTML`-preview; kør begge mod samme cases og assert
  `A(c)===B(c)`. Var identiske her.
- **Content-Type på Storage-objekt = den validerede variabel.** uploadBroadcastImage
  passerer SAMME `contentType` til `validerBroadcastBillede` og til `.save()`.
  Kun 4 raster-typer (png/jpeg/gif/webp) kan gemmes → objektet kan ALDRIG serveres
  som text/html eller image/svg+xml. Stored-XSS-vejen er lukket. Bytes sniffes IKKE,
  men er ligegyldigt: SVG-bytes gemt som image/png serveres som image/png (broken
  image, ingen script-eksekvering).
- **Sti-binding:** `unik` er server-genereret (`Date.now()-randomBytes(6)`), og
  `broadcastBilledeSti` saniterer med `[^a-zA-Z0-9_-]`-fjernelse + ext fra whitelist.
  Klienten styrer ikke stien → ingen traversal.
- **requireAdmin er første linje** i callablen (owner/globalAdmin), før data læses.
  Pending/normal bruger → permission-denied.
- **Latent (ikke blokerende):** storage.rules `allow read:if true` på broadcast/{fil}
  giver også LIST på broadcast/ — men billederne er offentlige by-design (i massemail),
  så kun en enumeration af allerede-offentlige URLer. Ingen sletning/cleanup →
  betroet admin kan fylde Storage (permanent, dokumenteret). Uppercase `HTTPS://`
  autolinker ikke (kun UX).

## messages-create forgrenet på gameId (ecb561f) — BEKRÆFTET RENT (emulator, 227 + 14 PoC)

Ændring: `messages` create validerer nu BEGGE participants mod enten
`games/{gameId}/leagues/{leagueId}.memberUids` (gameId sat, platform) eller
top-niveau `leagues/{leagueId}` (gameId fraværende/null, Tour). Samlet i
`bothShareLeague`/`privateLeagueMembers` (firestore.rules L448-472). Læse-,
update- (false), delete-reglerne URØRT.

**Kritisk emulator-fælde (ny, til listen): `firebase-tools@latest emulators:exec`
downloader en NYERE firestore-emulator med strammere null-semantik → 35 af 227
regel-tests fejler falsk med "Null value error" på get()-kald (også kontroltests
som "KAN rette visningsnavn"). Kør ALTID mod den dokumenterede jar v1.22.0
direkte** (`java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar
--port=8085 --rules=...` + `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npx vitest run
--config vitest.rules.config.js`). Mod jar: 227/227 grønne.

**BEKRÆFTET RENT (14 PoC-checks, scratchpad/poc/attack.mjs, alle som forventet):**
- Skrive i fremmeds indbakke: AFVIST i alle former — liga hvor angriber ikke er
  med (offer+andre), liga kun angriber er med, top-liga uden angriber. Vagten er
  at BEGGE participants (ikke from/to) skal være i member-listen, og angriber ER
  altid participants[0] via `from`-tjekket → kan aldrig nå en member-liste uden
  selv at stå i den. Self-som-'to'-hul lukket (participants[1]=fremmed afvist).
- Grenforvirring vandtæt: `gameId` sat TVINGER game-stien; et gyldigt top-niveau-
  leagueId hvor begge er med kan IKKE lånes (games/GX/leagues/TL findes ikke →
  Null value error → afvist). Determinismen holder.
- `privateLeagueMembers` kaldes to gange, men begge læser SAMME
  `request.resource.data` i én create-evaluering → ingen TOCTOU.
- Fejler lukket: manglende game-league-dok, `gameId=''` (tom streng → games//… →
  fejl), `gameId=null` → korrekt top-niveau-gren.
- Tour-regression: gameId=null/udeladt + delt top-liga → TILLADT (uændret); top-
  liga uden afsender → afvist. Ingen svækkelse af top-niveau-stien.
- Standardvagter intakte: pending afvist (isApproved), from-forfalskning,
  size!=2, to ikke i participants, participants-dublet — alle afvist.
- Læsereglen (participants) intakt: tredjepart kan ikke læse; participant kan.
- get()-tal: isApproved(1) + 2 liga-get = 3 pr. create, langt under 10-loftet;
  identisk med den GAMLE regel (som også lavede 2 liga-get) → ingen DoS-regression.

**Ingen blokerende fund.** Fladen er tæt. Data er adskilt pr. Firebase-projekt,
så delt regelfil giver ingen krydskontaminering (top-niveau leagues er tom på
platformen → Tour-grenen dér fejler bare lukket, uden lækage).

## Superliga hentKickoffs (14db489) — angrebsflade: FREMMED KILDE → TIP-DEADLINE. INGEN blokerende fund.

Ny SL-kickoff-provider henter `status=notstarted`-events og mapper `startDate`
→ kickoff (= tip-deadline). Angriber = kilden er kompromitteret (samme offentlige
api.superliga.dk-token som results/live/standings). PoC: scratchpad/poc-kickoff.js
(ægte `superliga.hentKickoffs` + ægte `syncKickoffsCore` + fake db, 10 cases,
ingen emulator/node_modules-dans — kør fra `cd functions-platform && node ...`).

**BEKRÆFTET RENT (alle 10 cases kørt):**
- **Ingen sti-/proto-injektion, intet fremmed doc.** `matchDocId`
  (syncProviders.js L67-74) slugger home/away med `.replace(/[^a-z0-9]/g,'')`
  → `../../../etc/passwd`→`etcpasswd`, `__proto__`→`proto`, intet `/` overlever.
  `resolveDocs` (L248-253) sætter kun `map[k]=k` hvis `k` ER et EKSISTERENDE
  doc-id → fabrikeret id droppes til `mangler`, skriver INTET. Navnet NÅR ALDRIG
  en skrivning eller render: det bruges kun til at udlede doc-id og kasseres.
- **Kun `kickoff` (Date) + `kickoffSyncedAt` skrives** (superligaSync.js
  L538-541, `batch.update` — kan ikke oprette). Fjendtlige EKSTRA event-felter
  (`result`, `points`, `kickoff`, `evil:<script>`) når ALDRIG doc'et: mapperen
  returnerer felt-for-felt `{sourceKey, kickoff}`. Case 9 + case 3 beviser det
  (skrevne doc havde kun kickoff+kickoffSyncedAt). Ingen auth/rules rørt.
- **Genåbning lukket** (se opdateret post ovenfor, case 2/2b).
- **Fejler LUKKET i alle format-brud:** HTTP-fejl (`!res.ok` throw), `{}`-svar
  (`!Array.isArray(data.events)` throw), ugyldig startDate (throw m. kamp-id),
  MANGLENDE startDate → kickoff:null → kickoffPlan KASTER
  (`tilMs==null && fraMs!=null`, seedFootball.js L60-61: rydder ALDRIG en
  deadline som bivirkning). Alle 5 cases: INTET skrevet.

**RESIDUAL A (åben, by-design, pre-existing PL-klasse — IKKE blokerende):**
fremtid→tidligere-end-48t deadline skrives + kraeverKvittering-alarm; fremtid→
tidligere-MEN->48t skrives TAVST. Kompromitteret kilde kan lukke tips tidligt.
Legitime reschedules kræver retningen; samme som PL. Se opdateret post ovenfor.

**RESIDUAL B (åben, availability ikke integritet — IKKE blokerende, dokumenteret
faldgrube):** ÉN giftig post vælter HELE spillets kickoff-synk for dagen.
`{toString:null}` som homeName → `String()` i matchDocId KASTER
`Cannot convert object to primitive value` (case 6) → hele hentKickoffs kaster →
intet skrevet (fail-closed), men blast radius = hele listen, ikke kun posten.
`runder.has(e.round)`-filteret (superligaSync.js L492-493) dæmper: en giftig
`round` (objekt) droppes FØR matchDocId, men navnene når stadig `String()`.
Fix hvis nogen rører linjen: `String()` i try, eller filtrér ikke-streng-navne
fra (samme modgift som PL-live-faldgruben øverst). Ugyldig/manglende startDate
har samme blast radius (hele planen kaster).

**Slug-kollision (case 10):** `A.G.F.`/`O.B.!!!` slugger til `r5-agf-ob` og
rammer den ægte kamp — men kun en kamp, hvis navn angriberen kan reproducere
(for en kompromitteret kilde trivielt kampens EGET navn). Giver ingen NY magt
ud over "flyt en deadline jeg alligevel kan navngive". Pre-existing matchDocId-
egenskab (bruges identisk til results/live/standings), ikke introduceret her.

**Faldgrube bekræftet på listen:** *`status=notstarted` i URL'en er IKKE en
vagt mod en kompromitteret kilde* (den styrer hele svaret) — den reelle
integritetsvagt er downstream: `result`-skip + genåbnings-forbud + kickoffMs-
throw. Commit-beskedens "et facit kan aldrig flyttes" holder pga. DEM, ikke pga.
URL-filteret.

## timeoutSeconds på synk-callables + alarm-remedie (f26d8f8) — INGEN blokerende fund

Ændring: `timeoutSeconds: 300` på `syncSuperligaResultsNow` og `120` på
`syncGameKickoffsNow` (functions-platform/index.js L593, L654), længere
alarm-tekst i sweep'et (L485-491), ny klient-knap i GameScheduleTab.

**Nyt, hurtigt PoC-mønster (BEDSTE til adgangs+omkostnings-spørgsmål):** kør
callablen ægte mod emulator-jar'en med `.run({auth:{uid},data,rawRequest:{}})`
OG instrumentér forbruget i samme proces:
- `global.fetch = () => { fetchKald++; throw ... }` → beviser om kalderen når
  det DYRE arbejde (netværk) eller stoppes før.
- monkey-patch `DocumentReference/CollectionReference/Query.prototype.get` og
  `set/update/create/delete` + `WriteBatch.prototype.commit` fra
  `functions-platform/node_modules/@google-cloud/firestore` → læse-/skrivetal
  pr. kald.
- `require(index.js)` FØR `admin.firestore()`; kald ALDRIG selv
  `initializeApp` (index.js gør det → "app already exists").
Fil: scratchpad/poc/gate.js. Kør fra `cd functions-platform`.

**Målt adgangsmatrix (begge callables, emulator):**
anon → `unauthenticated`, 0 læsninger. pending, approved player og bruger UDEN
users-dok → `permission-denied` efter PRÆCIS 1 læsning, 0 skrivninger, 0 fetch,
~10 ms. owner/globalAdmin (også `status:'pending'`) når netværket (kontroltest
grøn → gaten måler noget). Ondt gameId `../users/ejer` → `invalid-argument`
efter 1 læsning, 0 fetch (SYNCED_GAMES-allowlisten).
→ **timeoutSeconds ændrer IKKE angrebsfladen:** budgettet er kun nåbart efter
rolle-porten, så en ikke-admin kan ikke brænde 300 s. Generelt: et hævet
timeout er kun farligt, hvis autorisationen står EFTER det dyre arbejde —
tjek rækkefølgen, ikke tallet.

**Alarm-teksten er ren.** `besked` renderes som JSX-tekstbarn i DriftTab
(L51, L81) — React escaper, `pre-line` er CSS. Eneste interpolation er `m.id`
= doc-id i `games/{g}/matches`, hvor create/update kræver `isGlobalAdmin()`
(firestore.rules L786) → ingen spiller-skrevet tekst kan nå ejerens flade.
Ingen andre forbrugere af `besked` end DriftTab + driftlog-linjerne.

**Observation (ikke fra denne diff, men nu lettere at udløse med vilje):**
`runGameRoundRecap` (gameRecap.js L308-309 / L439) er read-then-write om
`game.recappedRounds` — markøren skrives EFTER AI-kaldet og alle væg-opslag,
uden transaktion. To samtidige `recomputeGameMatch`-triggere for samme runde
(fx to af rundens kampe får facit i SAMME batch) kan begge passere
`done.includes(round)` → dobbeltopslag på alle liga-vægge + to betalte
AI-kald. Kræver ingen angriber, kun timing. Hærdning: sæt markøren i en
transaktion FØR opslagene (claim-then-post).

**Nit (ikke sikkerhed):** alarm-teksten navngiver nu en knap og en fane
("⬇️ Synk resultater nu (Admin → 🗓️ Spil-tidsplan)") uden nogen test, der
binder strengen til fladen — et senere knap-omdøb driver tavst. Label
verificeret korrekt i dag (AdminPage.jsx L72).

## games.paused — påmindelses-nødstoppet (ef3f549) + PL-live-fixturen (d111b89)

**Emulator-verificeret 2026-08-23** (16 tests, 0 fail, PoC:
scratchpad/poc/paused.mjs — genbrug den, mønstret er rent node uden vitest:
`initializeTestEnvironment` + eget PASS/FAIL-array, ingen testrunner):
- `games/{gameId}: allow create, update: if isGlobalAdmin() && gyldigtTeamStyles()`
  (firestore.rules L666) har INGEN affectedKeys-liste → ETHVERT nyt felt på
  spil-dokumentet er skrivbart for globalAdmin uden regel-ændring. Det gælder
  `paused`. Planer, der hviler på "admin må allerede skrive feltet", er
  korrekte — men de er også blanko-checks til NÆSTE felt.
- Nægtet for: godkendt spiller (både sætte, fjerne og slette feltet),
  pending-bruger, uautentificeret, og spiller kan ikke oprette et spil-dok.
  Spiller kan heller ikke ændre `status` (= kan ikke omgå
  `forventerPaamindelser`-gaten ved at flytte spillet ind/ud af den).
- PENDING globalAdmin KAN pause (isGlobalAdmin ser ikke status) — kendt klasse.
- **MUTATIONSTESTET REGLEN, ikke bare kørt den:** `isGlobalAdmin()` →
  `isApproved()` i L666 vender præcis de 5 spiller-assertions til rødt og lader
  alle kontroltests stå grønne. Repoets to nye tests i functions/rules.test.js
  (L1579-1604) har samme form → de er load-bearing, ikke pynt. Kørt med
  `npx vitest run --config vitest.rules.config.js -t "påmindelser"` fra
  repo-roden mod en manuelt startet emulator-jar: 2 passed.

**Afprøvet og RENT (gentag ikke):**
- driftlog-id'et `reminder-${gameId}` kan ikke forgiftes: gameId ER et
  Firestore-doc-id (ingen '/'), og prefixet gør `__x__`/`.`/`..` umulige.
  Kun globalAdmin kan overhovedet skabe et spil-dok.
- Loop'et i `gameTipReminders` (index.js L1078-1113) kan IKKE dræbes af ét
  spil: `koerPaamindelserForSpil` fanger sin egen fejl, `skrivDriftStatus` sin,
  og den "luk kortet"-gren har egen try/catch. Modsat den gamle
  `naesteSweepFoerMs`-fælde er kadence-beregningen her givet som FUNKTION →
  evalueres inde i try'et. Mønstret er nu rigtigt; brug det som reference.
- `runGameTipReminders` returnerer kun TAL (`sent/fejlede/upcoming/members`) —
  ingen modtager-identiteter. Adresser går kun til console.error (Cloud-log).
  `sendGameTipRemindersNow` har `requireAdmin` som første linje.
- `Kørslen fejlede: ${fejl}` (reminders.js L134) kan kun bære Firestore-/
  nodemailer-fejltekster: alt spiller-skrevet indhold (tips) berøres ikke, og
  per-modtager-fejl fanges INDE i send-loopet. DriftTab renderer `besked` som
  JSX-tekst (L52) → React escaper; intet dangerouslySetInnerHTML.
- `paused` er læsbar for enhver godkendt bruger (`games: allow read:
  isApproved()`). Vurderet harmløst: den røber kun, at mails er slået fra.

**Observationer (ikke blokerende):**
- `kanPaamindes`/`paused` gates KUN i klienten. `sendGameTipRemindersNow`
  tjekker hverken `forventerPaamindelser` eller `paused` server-side — en admin
  kan mail-spamme et 'finished' spils deltagere med en håndlavet payload.
  Admin→deltagere, inden for admins autoritet; men det er stadig den eneste
  vej, hvor fanens gate ikke har en server-pendant.
- `advarsel(besked)`/`fejl(besked)` i driftlog.js tager IKKE `tal` — så
  `st[linje.niveau](linje.besked, linje.tal)` taber tallene på præcis de
  linjer (delvist SMTP-nedbrud), hvor de er mest interessante. Kosmetisk.
- ADMIN_OWNED-vagten mod at seedGames genstarter en pause er en KOMMENTAR
  (seed-payload.mjs L19-24). Testen L77 tjekker kun retningen
  ADMIN_OWNED ⊆ games.mjs — intet bliver rødt, hvis nogen tilføjer `paused`
  til games.mjs uden at tilføje det til ADMIN_OWNED.
- Fixturen `functions-platform/fixtures/pl-live-runde1.json` er ren: 10 kampe,
  7 KB, kun offentlige kampdata. INGEN headere, cookies, tokens, e-mails, IP'er
  (grep'et for authorization/bearer/cookie/token/secret/@domæne → 0 hits).
  MEN: kommentaren i syncProviders.js L307-315 påstår "hele sæson-listen
  indeholdt PRÆCIS FirstHalf/SecondHalf/FullTime/PreMatch"; den committede
  fixture indeholder kun FullTime/PreMatch/SecondHalf — `firsthalf` er STADIG
  uobserveret i repoet ("et tal uden kode er en påstand").

**Faldgrube til listen:** *en regel uden affectedKeys-liste gør hvert fremtidigt
felt admin-skrivbart pr. automatik.* Det er i orden, så længe skribent-kredsen
er den samme som den, der må trykke på knappen — men når et nyt felt STYRER
maskineri (mails, point, synlighed), skal spørgsmålet stilles eksplicit:
hvem må egentlig trykke på DENNE knap, og er det den samme kreds som
`isGlobalAdmin()`? Her: ja.

## Live-tavs-alarmen (5e51155, #47) — angrebsflade: EN ALARM, DER SKAL KUNNE STOLES PÅ

**Nyt PoC-mønster, det stærkeste til skemalagt maskineri: kør ONSCHEDULE-jobbet
ÆGTE.** `firebase-functions@7` sætter `func.run = handler` også på `onSchedule`
(node_modules/firebase-functions/lib/v2/providers/scheduler.js L70), så hele
minut-jobbet kan drives ende-til-ende:
`exports.syncSuperligaResults.run({})` mod emulator-jar'en (port 8099) +
`global.fetch`-stub pr. URL + `Date.now = () => T0 + off` for at spole tiden
frem minut for minut. Instrumentér forbruget ved at wrappe
`DocumentReference.prototype.get/set/update/delete` og `Query.prototype.get`.
Filer: scratchpad/poc/{livetavs,selvheal,slut,blast,nu}.js + gate2.js + puls.mjs.
Seed de ÆGTE gameId'er fra SYNCED_GAMES — jobbet tager ingen opts.

**MÅLT forbrug (emulator, pr. minut pr. spil):**
- Stille minut (pending=0): 1 query pr. spil, 0 læsninger, 0 skrivninger — den
  nye gren koster INTET. (Bekræftet: spil-dok-læsningen sker kun i den
  mistænkelige gren.)
- Live-minut med puls: +1 query (loesDriftAlarmer i else-grenen) pr. spil pr.
  minut. ~300 live-minutter × 2 spil × ~120 kampdage ≈ 72.000 ekstra læsninger
  om året = under 1,2 % af ÉN dags gratiskvote. Ikke et problem.
- Tavs minut med kampe i vinduet: +2 læsninger (spil-dok + alarm-dok).
  149 minutters udfald → `antal=1`: 6-timers dæmpningen HOLDER (målt).
- Flapping kan ikke koste mere end ~1 alarm-åbning pr. 6 min, fordi
  LIVE_STALE_MS selv virker som rate-limit på genåbning.

**BEGGE HULLER LUKKET i d5cc5e4 — efterprøvet med de samme PoC'er (11/11).**
Alarmen tæller nu `kampeMedLevendeStilling(venter)` (kampe med skrevet `live`,
status hverken 'slut' eller 'afbrudt', uden facit) i stedet for `pending`, og
`tjekLivePuls` læser `!!(ud?.live && ud.live.pulsSkrevet)`, så et null-kildesvar
tæller som "ikke skrevet". Målt mod d5cc5e4: HTTP 500 i 40 min midt i kampen →
ALARM (før: intet); ægte 110-minutters kampforløb + slutfløjt uden facit i 40
min → INGEN alarm og `live.status` bliver 'slut' i samme minut (før: falsk
alarm); kickoff passeret uden at kilden har flippet kampen → ingen falsk alarm
(kickoff-slækket kunne fjernes, fordi `live` slet ikke findes endnu); <5 min
tavshed → ingen alarm; alarmen består efter at pulsen kom igen. Forbruget faldt
også: else-grenens `loesDriftAlarmer` er væk, så live-minuttet er tilbage på
2 queries/0 læsninger (de ~72.000 læsninger/år bortfaldt). Blast radius stadig
indeholdt (kastende vagt for SL → PL får sin alarm, begge minut-kort skrives).
ACCEPTERET RESIDUAL, dokumenteret i koden: er kilden nede FØR kickoff, skrives
`live` aldrig, `liveIGang` er 0, og der kommer ingen live-alarm — backstop er
strandet-alarmen i sweep'et (kickoff + 2,5 t, sweep 12×/døgn).
FÆLDE I MIN EGEN PoC (kostede en falsk FAIL): tidsoffset skal nulstilles FØR
seedning, ellers ligger kickoff et andet sted end tiltænkt, og
MIN_SPILLETID_MS-grænsen (95 min) nås aldrig — så udebliver 'slut'-markeringen,
og alarmen fyrer HELT KORREKT. Sæt `off = 0` før `nulstil()`.

**BEKRÆFTET HUL 1 (i 5e51155/e230775, nu lukket) — alarmen fyrede IKKE ved det udfald, den er bygget til.**
`hentLive` KASTER ved HTTP-fejl/timeout/format-brud → `runScheduledSync` sætter
`live = null` → betingelsen `out.pending > 0 && out.live && !out.live.pulsSkrevet`
(index.js) er FALSK i begge grene. PoC: 40 minutters HTTP 500 midt i en kamp →
kampkortet står frosset (spillerne SER "Opdatering afbrudt"), `driftAlarmer` er
TOM, og minut-kortet bliver grønt igen ved genkomst → intet spor. Fix:
`const puls = !!(out.live && out.live.pulsSkrevet); if (out.pending > 0 && !puls)`.
Gælder BÅDE 5e51155 og arbejdstræets nyere udgave.

**BEKRÆFTET HUL 2 (i 5e51155/e230775, nu lukket) — alarmen fyrede, når INTET var galt.** `pending` = kampe i
2,5t-vinduet UDEN facit, ikke kampe i gang. Efter slutfløjt (kilden dropper
kampen, facit ikke landet endnu) er pulsen tavs pr. definition → alarm efter
5 min med `kraeverKvittering:true`. PoC (kickoff 100 min siden): kampens
`live.status` er `'slut'` — klienten viser med vilje "Slut · afventer facit" og
kalder eksplicit "Opdatering afbrudt" en LØGN i den tilstand
(FootballTip.jsx L535-538) — mens alarmen påstår "OPDATERING AFBRUDT". Rammer
hver kampaften, hvor facit er >5 min forsinket. Fix: udled tælleren af KAMPENES
egne dokumenter (live sat, status ikke `slut`/`afbrudt`), ikke af `pending`.

**BEKRÆFTET (5e51155, rettet i arbejdstræet): auto-lukningen slettede sporet.**
`loesDriftAlarmer(livetavs)` i else-grenen + klientens `where('loestAt','==',null)`
= et selvhelbredende udfald forsvandt efter ét grønt minut. PoC selvheal.js:
20 min tavshed → alarm åben; 1 grønt minut → 0 åbne alarmer.
GENEREL REGEL: `kraeverKvittering: true` og `loesDriftAlarmer` er gensidigt
udelukkende. Alle øvrige kvitteringsalarmer (genaabning, kickoff48t,
puljeLockGenaabning) auto-lukkes aldrig — livetavs var den første, der gjorde
begge dele.

**Afprøvet og RENT (gentag ikke):**
- **Ingen kan forfalske pulsen** (16/16 emulator-checks, kontroltests grønne,
  scratchpad/poc/puls.mjs): spiller/pending/anon kan ikke sætte, flytte,
  fremdatere eller SLETTE `games/{id}.liveHeartbeatAt`, ikke skrive `live` på
  en kamp, ikke oprette et kamp-dok (så en fremmed kilde-event kunne resolve),
  og ikke skrive/læse `driftAlarmer`. Selv admin kan ikke skrive driftAlarmer
  (kun callablen). Kontrol: admin KAN sætte liveHeartbeatAt.
- **Alarm-id er ikke injicerbart:** `gameId` kommer fra `SYNCED_GAMES`
  (hardkodet allowlist), `kampId` er null, `out.pending` er `venter.length`
  (tal). `besked` renderes som JSX-tekstbarn i AlarmKort (DriftTab.jsx L84).
- **Blast radius er indeholdt (d):** monkeypatchet spil-dok-læsning til at
  KASTE for superliga2627 → kun SL's alarm droppes ("Live-puls-tjek …
  (ignoreret)"), PL får sin alarm, begge minut-kort skrives. try/catch +
  `.catch()` sidder rigtigt.
- `sendGameTipRemindersNow`-gaten (index.js L928-935) er MÅLT korrekt placeret:
  anon 0 læsninger, pending/spiller `permission-denied` efter præcis 1, ejer +
  ukendt/afsluttet/ikke-fodbold spil → `failed-precondition` efter 2 læsninger,
  0 queries, 0 mails. Manglende spil-dok KRASHER ikke (`gSnap.exists ? … : null`
  → `game?.type`). Kontrol grøn: åbent spil når arbejdet. `paused` tjekkes
  bevidst IKKE — fladen holder "Send nu" aktiv under pause (GameReminderTab
  L286-289), så paritet er korrekt.

**Nit:** `sendGameTestReminderToMe` (index.js L1010) har stadig ingen
forventerPaamindelser-gate, mens fanens knap har (`kanPaamindes`). Harmløst
(mailen går kun til kalderen selv). Og gameId'et valideres stadig ikke som
doc-id: `..`/`a/b`/`__proto__` giver `internal` i stedet for `invalid-argument`
(fjerde callable med samme kosmetiske fælde).

**Testhul (mutationsbekræftet):** `advarsel(besked, tal)`/`fejl(besked, tal)`-
rettelsen i driftlog.js er UDÆKKET — fjernes `Object.assign(s.tal, tal||{})`
BEGGE steder, er alle 646 platform-tests grønne. `ADMIN_OWNED`-tripwiren i
seed-payload.test.mjs er derimod load-bearing: `paused: false` tilføjet til
games.mjs L69 gør den RØD (kørt, derefter gendannet).

**Faldgrube til listen:** *en alarm skal måle det SYMPTOM, brugeren ser — ikke
en proxy for det.* `pending > 0` var proxy for "kampe i gang", og `out.live`
var proxy for "kilden svarede". Begge proxier knækker præcis i de to
yderpunkter, alarmen findes for: den tier ved totalt kildesvigt og råber ved
en helt normal slutfløjt. Spørg altid: hvilken linje i KLIENTEN viser det, jeg
alarmerer om — og læser serveren den samme tilstand?

---

## setGameChance + chanceVagt.js (commit fdcf465, branch claude/multi-game-player-collection-21mc1w)

**Opsætning der virkede (genbrug den):** ingen firebase CLI i miljøet, men
emulator-jar'en ligger i `~/.cache/firebase/emulators/cloud-firestore-emulator-*.jar`.
Start den direkte: `java -jar <jar> --host=127.0.0.1 --port=8080 --rules=/home/user/tour/firestore.rules`.
Derefter to angrebsveje i samme kørsel:
1. **Kernen** (Admin SDK, omgår rules) — `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`
   + `require('functions-platform/node_modules/firebase-admin')`, kald
   `setChanceCore(db, FieldValue, {...})` direkte. Tester det, callable'en gør.
2. **Reglerne** — `@firebase/rules-unit-testing` findes KUN i
   `functions/node_modules`, så testfilen skal ligge i `functions/`, ellers
   kan vite ikke resolve den. Egen vitest-config med `include`.
   **Fælde:** fixtures skal skrive `kickoff` som `Timestamp`, ikke som tal —
   rules laver `request.time < kickoff` og et tal giver "Unsupported operation:
   timestamp < int" → PERMISSION_DENIED af FORKERT grund, så et hul ser lukket ud.

**BEKRÆFTEDE fund:**
- **Kernen tjekker ikke `users/{uid}.status`.** Eneste vagt er, at
  `games/{g}/players/{uid}` findes — og en afvisning (`adminActions.setUserStatus`)
  rører kun users-dokumentet, så players-dokumentet overlever. Kørt i emulator:
  `rejected`, `pending` OG en bruger uden users-dokument overhovedet fik alle
  `{ok:true}`. `redeemLeagueCodeCore` (gameLeagues.js L60) har vagten;
  chanceVagt havde den ikke. **Mønster til listen: hver ny callable skal have
  status-tjekket kopieret ind — rules' isApproved() findes ikke for Admin SDK.**
- **`erKampLaast` frigav en AFBRUDT kamp med kendt stilling.** LIVE_STATUS
  bunter interrupted/abandoned/postponed under ét ord, og kilden skriver kun
  `live` for kampe, den melder `inprogress` — så 'afbrudt' kan KUN stå på en
  kamp, der rullede. Grenen frigav altså det ene tilfælde, der skulle låses.
  PoC: ⚡ 8 sat 1 time efter kickoff på en kamp med `live:{home:2,away:1}`.
  Rettet i arbejdstræet under gennemgangen (live-felt → låst).
- **15 %-bank-loftet håndhæves INGEN steder server-side.** `gameScoring.js`
  L527/L650 kalder `scoreBet(bet, result, odds)` uden `bank`, og
  `clampStake(s, undefined)` klipper kun til MAX_ABS. Målt: `clampStake(8,10)=1`
  men `clampStake(8)=8`; `scoreBet({chanceStake:8},'1',{'1':4.0})` = **28** point
  til en spiller med saldo 10. Filhovedet i chanceVagt.js påstår det modsatte.
- **Rules begrænser ikke feltnavne på `games/{g}/bets`** ud over
  points/uid/matchId/leagueIds. Emulator-bekræftet: klienten kan skrive
  `chanceStake: 8` på to kampe i samme runde, `chanceStake: 99`, og forfalske
  `chanceSatAt`/`chanceFlytninger`. Callable'en er derfor ren dekoration,
  indtil reglen lukkes.

**Afprøvet og RENT (gentag ikke):**
- IDOR via `matchId`: `../m1`, `m1/x` → Firestore-argumentfejl (mappes til
  `internal`, ingen lækage); `m1/sub/x` → `no-match`; `''` → `bad-input`;
  `__proto__` → INVALID_ARGUMENT. Ingen skrivning uden for eget spil.
- IDOR via `gameId`: et fremmed spil → `not-member` (players-opslaget er første
  vagt). `gameId` med skråstreg → `not-member`.
- **Skrivninger rammer kun `${uid}_${k.id}`**, og `k.id` kommer fra serverens
  egen runde-forespørgsel — ikke fra klienten. Offerets bet stod urørt efter
  alle angreb. `flyttetFra` kan pr. konstruktion ikke indeholde andres docs
  (gælder kun fordi Auth-uid'er aldrig indeholder `_`).
- `normaliserIndsats`: 9, 8.5, -3, '8', null, [] afvises alle.
