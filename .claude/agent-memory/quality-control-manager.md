# Quality Control — varig hukommelse

## Plan-gennemgange: de dyre fund er designfejl, ikke kodefejl

- **Modsiger tallet noget lige ved siden af?** Et kampkort viste "hvem er
  stærkest" ud fra ren ratingforskel, mens odds lægger 60 point hjemmebane-
  fordel oveni — pilen modsagde 1X2-knapperne under sig på de fleste kampe.
- **Lover teksten mere end handlingen giver?** "Åbn ligaen →" landede på en
  liste over ALLE ligaer, foldet sammen.
- **Et statusfelt, der overskrives, kan ikke bære en alarm.** Spørg altid ved
  overvågnings-/statusflader: hvad sker der med en hændelse, der opstår og
  bliver overskrevet, FØR nogen kigger? Kræver hændelsen en menneskelig
  handling, skal den persisteres separat og kvitteres — ikke merges væk.
- **Flere skrivepunkter i ét dokument = sidste skriv vinder.** En kørsel med
  tre try/catch-blokke, der hver merge-skriver `niveau` i samme dokument,
  ender grøn, selv om den første blok fejlede. Saml status i hukommelsen,
  skriv ÉN gang til sidst med `niveau = værste(...)`.
- **En dashboard-side, der kun tegner kort for dokumenter, der FINDES, er
  blind for den værste fejl:** funktionen der aldrig kørte, eller hvis
  status-skrivning selv er i stykker → intet dokument → intet kort → siden
  ser beroligende ud. Tegn kort pr. FORVENTET type, dokument eller ej. Det er
  "tom liste uden fejlbesked"-fælden, flyttet til en statusside.
- **Tør-kørsel må aldrig kvittere som en rigtig kørsel.** De manuelle callables
  (`syncGameKickoffsNow`, `repriceGameOdds`, `rescoreGameBets`) har dryRun som
  default. Skriver de i en "sidst kørt"-status, melder fladen en kørsel, der
  ikke skete.
- **Tærskler hører til dér, hvor sandheden bor.** Skal en flade vurdere "er
  den holdt op med at køre?", så lad SERVEREN skrive `naesteForventetFoer` i
  dokumentet — den kender sin egen cron. En tærskel hardkodet i klienten
  driver fra cron'en uden at nogen test bliver rød.

## Konkrete tal i dette repo (efterprøv, gæt ikke)

- `syncSuperligaSweep`: cron `25 2,13-23 * * *`. Største NORMALE hul er
  02:25 → 13:25 = **11 timer**, ikke 2. En "forældet efter 2 timer"-regel
  ville lyse rødt 10 timer hver eneste nat.
- `syncSuperligaResults`: cron `* 12-23 * * *` = 720 kørsler/dag × 2 spil i
  `SYNCED_GAMES`. Kørslen er BEVIDST optimeret til at koste ét tomt opslag på
  et stille minut (kommentaren i `functions-platform/index.js` regner det ud).
  Enhver ubetinget skrivning pr. minut river den optimering i stykker.
- `syncGameKickoffs`: cron `10 6 * * *` → >26 timer er en rimelig tærskel.
- Sweep'et ER i forvejen alarmen for minut-synken ("N facit som minut-synken
  IKKE nåede"). Minut-synken behøver derfor ikke sin egen hjerteslags-måler.

## Faste steder at kigge

- **Admin-faner:** `src/pages/AdminPage.jsx` — 12 faner i PLATFORM_MODE, i en
  `display:flex` UDEN `flexWrap`. Hver ny fane presser bjælken.
- **Badge på Admin-linket:** `src/components/Layout.jsx` `CountBadge` — allerede
  rødt (`var(--c-err)`) og brugt til ventende godkendelser. Et nyt "rødt badge"
  samme sted er visuelt umuligt at skelne fra det gamle. Giv det egen form,
  egen `title` og egen `data-testid`.
- **Mønster for en log-flade:** `emailLog` + `useEmailLog.js` + `EmailLogTab.jsx`
  + rules `allow read: if isGlobalAdmin(); allow write: if false;` (linje ~372).
  Genbrug det frem for at opfinde et nyt.
- **`firestore.rules` er ÉN fil for BEGGE projekter** (tour-85928 og spil-89af9)
  — enhver regelændring rammer begge apps.
- **Tour-appen er på pause, men dens 7 `onSchedule` i `functions/index.js`
  kører videre** (syncTourResults, syncStartlist, snapshotRanks, tipReminders,
  generateLeagueRecaps, syncStageTimes, enrichRiderTags). "Appen er på pause"
  er ikke det samme som "maskineriet er stoppet".
- **Dokumentation der skal følge med:** `docs/admin-guide.md` (linje ~19 lister
  fanerne), `docs/drift.md` (alarmerne beskrives som "står i loggen").

## Driftstatus-fladen (c19dca7): implementering mod plan — konkrete fund

- **Et felt, serveren defaulter, men aldrig rent faktisk sender, er en fælde
  for klienten.** `driftlog.js`s `statusSamler` sætter `gameNavn: gameNavn ||
  gameId`, men `functions-platform/index.js` sender ALDRIG `gameNavn` ved
  nogen af de tre kald (minut/sweep/kickoff) — så `doc.gameNavn` er altid
  `gameId` (fx `pl2627-efteraar`). `DriftTab.jsx` skriver
  `doc?.gameNavn || forventet.gameNavn`, dvs. FØR første kørsel vises det
  pæne navn (fra `games`-kollektionen), og EFTER første kørsel skifter titlen
  til det rå id. Spørg altid: virker fallback-kæden ens før og efter
  dokumentet findes, eller flipper den? Ret er at klienten altid foretrækker
  sit EGET kendte navn (`forventet.gameNavn`) over et serverfelt, den ved kan
  mangle.
- **Efterprøv "±N minutters slæk" med tal, ikke øjemål.** `naesteSweepFoerMs`
  i `functions-platform/index.js` er dokumenteret som "+45 min slæk", men
  giver reelt ~70 min (kørt for 13:25/23:25/02:25 dk-tid: deadline lander
  25 min senere end kommentaren lover). Fejlretningen er ufarlig (mere slæk,
  ikke mindre — under-alarmerer, alarmerer ikke falsk), men er et konkret,
  betalt eftersynsemne: ingen test dækker funktionen overhovedet (den
  eksporteres ikke, findes ingen `.test.js` for den).
- **To uafhængige kilder til "hvilke spil synkes" er en ny spejlet-fil-fælde,
  udenfor den kendte liste:** `functions-platform/syncProviders.js`s
  `SYNCED_GAMES` (server-sandhed, styrer HVAD der rent faktisk synkes og
  skriver driftlog) vs. `games/{id}.sync.provider` i Firestore (sat af
  `scripts/games.mjs`, klient-sandhed, styrer HVILKE kort `DriftTab.jsx`
  tegner). `DriftTab.jsx` tegner sweep/kickoff-kort UDELUKKENDE fra
  `forventede` (afledt af games-feltet) — aldrig direkte fra `status`-listen.
  Driver de to fra hinanden (spil i SYNCED_GAMES uden matchende sync-felt),
  bliver et RIGTIGT `niveau: 'fejl'`-dokument aldrig vist — den "hul i
  listen"-fælde, fladen selv er bygget for at undgå, genopstået én lags
  dybere. Samme mønster for kickoff-typen: klienten hardkoder
  `provider === 'pulselive'`, serveren tjekker
  `typeof provider.hentKickoffs === 'function'` — konsistent i dag, men endnu
  et sted der skal følges ad i hånden.
- **`docs/admin-guide.md`s "Faner"-liste skal efterprøves mod den faktiske
  `PLATFORM_MODE`-gating i `AdminPage.jsx`, linje for linje — ikke bare
  "nævnt et sted".** c19dca7 satte "🩺 Driftstatus" under "**Begge apps:**" i
  admin-guide.md, men koden gater fanen strengt til `PLATFORM_MODE` (og
  commit-beskeden siger det selv: "Driftstatus kun på platformen"). Enhver
  ny/flyttet admin-fane skal tjekkes op mod BÅDE tab-listen og teksten der
  beskriver den.

## PL-live (690829a): pulselive-provideren — konkrete fund

- **`plAlleKampe` har INGEN cache — to kaldere i samme minut-tick betaler
  hver deres fulde sæson-paginering.** `runScheduledSync` kalder ALTID
  `syncResultsCore` (→ `hentFaerdige` → `plAlleKampe`, ~4 sider) og derefter
  `syncLiveCore` (→ `hentLive` → `plAlleKampe` IGEN, ~4 sider til) i samme
  tick, uden at dele resultatet. Kode-kommentaren i `syncProviders.js`
  ("Fire sider i minuttet ... er prisen værd") beskriver kun `hentLive`s EGEN
  marginale pris — den samlede pris pr. minut i et kampvindue er **otte**
  paginerede kald til pulselive, ikke fire. Ikke opdaget af nogen test (ingen
  test kører `runScheduledSync` med den ÆGTE `PROVIDERS.pulselive` og tæller
  fetch-kald). Ikke blokerende (samme gating, samme loft på 10 sider), men
  værd at nævne næste gang nogen måler forbrug eller overvejer at cache
  `plAlleKampe` inden for én tick.
- **Et generisk hjælpetekst-løfte kan være ufuldbyrdet for ÉT spil uden at
  det ses noget sted.** `FootballHelp.jsx`s "Mens kampen spilles: ... DIREKTE
  og halvlegen, og den opdaterer sig selv hvert minut" er skrevet generisk
  (spil-agnostisk, commit 26d0d6c) længe FØR Premier League fik rigtig live
  (denne commit). Teksten var altså allerede vist til PL-brugere og loven
  noget, koden ikke leverede, indtil 690829a. God ting at tjekke ved en
  ny liga/nyt spil: findes der allerede en generisk hjælpetekst, der
  forudsætter en egenskab (live, tabel, kickoff-synk), det nye spil endnu
  ikke har?
- **Ukendte kilde-tokens i en period/status-oversættelse er sikre HVIS
  "i gang"-afgørelsen er UAFHÆNGIG af oversættelses-tabellen.** `plIGang()`
  spørger direkte på det rå `period`-felt (kun `prematch`/`fulltime` er
  hvile), mens `plLiveStatus()` (opslaget i `PL_PERIOD_STATUS`) kun styrer
  DANSK TEKST. Et nyt, ukendt token kan derfor aldrig give et falsk "Slut" —
  det giver højst en kamp uden halvlegs-tekst ("DIREKTE" uden ekstra ord).
  Spørg ved lignende oversættelser: er "er kampen i gang" afgjort af SAMME
  lukkede liste som viser teksten, eller af en bredere/uafhængig test? Det
  første er en fælde (nyt ord → falder ud af listen → regnes som hvile).

## Vandret-scrollende faner (6dfe150): implementering mod planens 7 fund

Alle 7 rettelser fra plan-gennemgangen blev fulgt. Konkrete efterprøvninger:

- **Skygge-til-transparent slår behovet for "variabel pr. baggrund" ihjel.**
  Planens bekymring (variabel pr. kontekst pga. to baggrunde × to temaer) var
  rettet mod Lea Verou-tricket (solid COVER, der skal matche baggrunden
  eksakt). Implementeringen bruger i stedet `linear-gradient(…, var(--scrollx-
  blaek), transparent)` — en halvgennemsigtig skygge, ikke et dækkende lag.
  Den slags kræver kun ÉN variabel PR TEMA (ikke pr. baggrund), fordi den
  aldrig skal matche noget eksakt — kun være synlig oven på det. Bekræftet: alle
  fire brugssteder (side-bg, card-bg, topnav-surface, begge temaer) er dækket
  af to variabler. God løsning at pege på næste gang "fade mod baggrund" dukker
  op — skygge-til-transparent slår altid variabel-pr-kontekst-problemet, en
  solid cover gør det aldrig.
- **`aktivNoegle` (scroll-aktiv-fane-i-syne) er KUN kablet på GamePage.**
  `AdminPage.jsx` og `Layout.jsx`s brug af `ScrollRaekke` sender ikke
  `aktivNoegle` — ingen effekt, ingen scroll. Harmløst i dag: AdminPage har
  ingen URL-deep-link til en fane (kun `useState`), så den aktive fane er
  altid den, brugeren lige klikkede, og dermed allerede i syne. Spørg igen,
  hvis AdminPage nogensinde får `?tab=`-deep-linking.
- **`LeaderboardPage.jsx` og `TestsTab.jsx` er bevidst UDEN `ScrollRaekke`**
  (bruger stadig bar `<div className="tabs">`), og de RAMMES af den nye
  `.tabs`-CSS (wrap ≥720px, scroll <720px) uden fade-hint. Efterprøvet:
  begge har kun 3 korte faner ("📊 Samlet stilling" / "📅 Dagens etape" /
  "🧮 Udspecificeret" hhv. "📊 Oversigt" / "🕸️ Afhængigheder" / "📋 Detaljer") —
  overflower aldrig, uanset bredde. Harmløst, men IKKE målt af
  `scripts/fanebredde.mjs` (den dækker kun GAME_TABS og ADMIN_FANER) — hvis en
  af disse to sider nogensinde får flere/længere faner, er der ingen automatisk
  advarsel.
- **Hul c2 (`.table-wrap`/`.elo-wrap`/`.sltab-wrap`/`TeamPage.jsx`) er stadig
  helt urørt** efter 6dfe150 — bekræftet uændret i theme.css. Forsvarlig
  scope-beslutning (tabeller er et andet mønster, elo-table har allerede en
  sticky holdkolonne som delvis affordance), MEN intet sted — hverken
  kode-kommentar, commit-besked eller doc — markerer det som en bevidst,
  udskudt beslutning frem for en overset rest. Sig det højt igen, hvis nogen
  rapporterer "kan ikke se hele tabellen på mobil".
- **Min egen note "12 faner i PLATFORM_MODE" (Faste steder at kigge) var
  FORÆLDET.** Talt efter i `AdminPage.jsx` (linje ~52-93, aug. 2026): en ejer
  i PLATFORM_MODE ser præcis **10** faner (Brugere, Spil-tidsplan,
  Hold-farver, Påmindelser, Runde-Botten, Tests, Driftstatus, Mail-log,
  Aktivitet, Send mail) — matcher `scripts/fanebredde.mjs`s `ADMIN_FANER`
  eksakt, kørt og bekræftet (2/10 synlige @390px scroll, 5/3/2 rækker ved
  hhv. 390/720/848px wrap). 12-tallet var enten forældet eller talte
  Tour-mode-fanerne (11, andet sæt) med. Ret fremtidige noter til 10.
- **theme.css's kommentar "Wrap koster 2 rækker på desktop" er kun bevist for
  GAME_TABS (9 faner)** — bekræftet 2 rækker ved 720/848/1024px. For
  ADMIN_FANER (10) giver samme wrap-CSS 3 rækker ved 720px og først 2 fra
  848px (målt med scriptet). Ikke en fejl (alt er stadig synligt, bare i 3
  rækker i et smalt bånd), men kommentaren generaliserer et tal, der er
  specifikt for spil-fanerne — værd at præcisere, hvis nogen citerer "2
  rækker" som en generel garanti.
- **AdminPage mistede en reel, ikke nævnt visuel forskel ved konverteringen
  til `.tab`:** den aktive fane var FØR fed (`fontWeight: 700` vs. 500); nu er
  `.tab` ensartet 600, og `.tab--active` ændrer kun farve/kant — ingen
  vægt-forskel længere. Padding faldt også (0.6rem/1.2rem → 0.55rem/0.7rem,
  nødvendigt for at 10 faner kan være med i wrap). Ingen test dækker
  font-weight/padding, så intet blev rødt. Acceptabel konsekvens af at dele
  systemet, men var ikke nævnt i commit-beskeden — værd at spørge om næste
  gang en håndrullet stil lægges over på et fælles system: "hvilken visuel
  egenskab forsvinder, og er den nævnt?"

## Invitations-mailen følger spillet (eaa7836): et ægte split-deploy-hul

- **`deploy-platform.yml` deployer HOSTING på hver kørsel, men functions kun
  bag et opt-in flueben (`deployFunctions`, default FALSE).** En klient-
  ændring, der begynder at sende en NY streng i et felt et `if (x === '...')`
  matcher på server-siden (her: `template: 'invitation'` i stedet for det
  gamle `'superliga'`), er derfor IKKE bagudkompatibel i praksis, selvom
  server-KODEN i denne commit håndterer begge — for produktion kører den
  GAMLE server, indtil nogen selv har tikket `deployFunctions` af. Gammel
  server + ny klient: `if (template === 'superliga')` matcher ikke
  `'invitation'`, falder til `else { html = broadcastHtml(body) }` — en
  BAR e-mail uden hero, uden feature-kort og uden gul CTA-knap, OG uden
  tilmeldingslink overhovedet (linket sidder normalt i knappen, ikke i
  brødteksten). Ingen fejlbesked nogen steder — mailen sender "succesfuldt".
  **Spørg fremover ved enhver ændring, der tilføjer en ny værdi til et felt,
  serveren matcher strengt på:** kan klienten og serveren deployes hver for
  sig (de kan her — hosting og functions er to forskellige deploy-trin/dage)?
  Hvis ja, er "gammel server + ny klient" en reel, ikke kun teoretisk,
  tilstand — test den eksplicit, og sig det til Release Manager: funktioner
  og hosting for denne slags ændring skal i SAMME kørsel med
  `deployFunctions: true`, ikke spredt over dage. Den sikre rækkefølge er
  også omvendt af hvad workflowet gør i dag (hosting FØR functions i samme
  run) — ideelt deployes functions før hosting, så en ny klient aldrig kan nå
  at møde en gammel server.
- **En regex på spillets NAVN til at style en salgstekst er en fælde, der kun
  viser sig ved GENBRUG.** `ligaProfil()`s `efter[åa]r`-regex styrer kun
  `periode`/`chip3`; `overskrift: 'Ny liga, blanke tavler'` er UBETINGET for
  enhver `sync.provider === 'pulselive'`-profil. Testet direkte: et
  fremtidigt forårs-spil (`pl2627-foraar`, en videreførelse af EFTERÅRETS
  stilling, jf. kommentar i `scripts/games.mjs`) ville stadig få "Ny liga,
  blanke tavler" — faktuelt forkert for en fortsættelse. Ikke en fejl i DAG
  (spillet findes ikke endnu), men værd at genoprette denne note, når
  forårsspillet oprettes: overskriften bør afgøres af SAMME regex/felt som
  periode, ikke stå fast for hele provideren.
- **God parathed ellers:** liga-spørgsmål (`LeagueQuestions.jsx` +
  `leagueQuestionScoring.js`) er allerede fuldt spil-agnostiske (ingen
  superliga-gating i `GameLeagues.jsx`), og Combi-bonus/Chancen bor i
  `src/lib/superligaScoring.js` — et vildledende filnavn, for filen ER den
  generiske fodbold-scoring-motor (bruges af `FootballTip`, `PuljeTip`,
  `betActions.js` for alle fodboldspil, ikke kun Superligaen). Så PL-mailens
  løfter om disse to var allerede sande uden ændring.

## Tip-status-fladen (#37, plan-gennemgang): hvem-ser-hvad + "knappen ved siden af"

- **"Send påmindelser nu" er et 24-TIMERS VINDUE, ikke en runde.**
  `functions-platform/reminders.js` `upcomingMatches(matches, now, now+24h,
  gatede)` — enhver ny status-visning PR RUNDE, der lægges i samme fane, viser
  et andet sæt navne, end knappen lige ovenover rammer (begge veje: en runde,
  der spilles fre–man, har mangler tirsdag, hvor knappen sender 0). Skal et tal
  stå ved siden af en handling, så beregn det med handlingens EGEN funktion.
  Mail-udsendelsen springer desuden `emailOptOut` og folk uden adresse over —
  en mangler-liste, der ikke markerer dem, forklarer ikke "Sendte 5 / Mangler 8".
- **En global admin kan ALLEREDE læse alt fra klienten.**
  `firestore.rules`: `games/{g}/bets/{b}` og `players/{uid}/detalje/{d}` starter
  begge med `allow read: if isGlobalAdmin()` (og `owner` tæller med, linje ~41).
  Begrundelsen "reglerne tillader ikke klienten at læse andres bets" er derfor
  FALSK for admin. En admin-callable er stadig rigtig — men fordi vi ikke vil
  have andres picks ned i admins browser, ikke fordi reglen forbyder det. Skriv
  den rigtige grund, ellers "forenkler" en senere ændring den til en klient-query.
- **"Alle kan alligevel se tips efter kampstart" er kun sandt for
  LIGA-KAMMERATER.** `useMatchLeagueBets` kræver
  `where('leagueIds','array-contains-any', mine)`, og
  `useVisibleGameStandings`/`leagueMateStandings` viser kun league mates — UDEN
  admin-undtagelse i klienten. Ejeren kan altså have deltagere, han slet ikke
  kan se i spil-fladen. Enhver admin-oversigt over ALLE deltagere er dermed
  ikke dobbeltarbejde, men første sted de navne overhovedet vises.
- **`activeRound`/`groupByRound` findes KUN i klienten**
  (`src/features/games/football/footballRounds.js`, ingen server-pendant). Et
  server-beregnet "aktiv runde" ville være en ny, uspejlet dublet, der kan pege
  et andet sted end Tip-fanen. Lad klienten vælge runden og sende `round` med.
- **`gamePuljeStatus` (index.js ~736) læser HELE `users` OG hele `userContacts`.**
  Kopiér ikke det mønster — `reminders.js` gør det rigtigt med
  `db.getAll(...memberUids)`. Prisen pr. klik for en runde-status er ellers
  ~350–600 reads (Superliga) / ~600–900 (PL); hele bets-kollektionen på én gang
  er ~2.600 hhv. ~7.600. Alt sammen billigt — MEN kun så længe det sidder bag
  en KNAP. Auto-hent ved fanens mount ville koste ved hvert besøg i den fane,
  der også rummer Send-knapperne.
- **`players/{uid}/detalje/opdeling` er den billige vej til sæson-totaler:**
  ét serverskrevet dokument pr. spiller med alle afgjorte+begyndte kampe
  (1 read pr. spiller i stedet for spillere×kampe). Kun afgjorte kampe, så det
  kan ikke bruges til "mangler nu".
- **`GameReminderTab.jsx` filtrerer `GAME_STATUS.FINISHED` fra** (linje ~19) —
  alt, der lægges i den fane, er utilgængeligt for et afsluttet spil. Rigtigt
  for ryk, men lukker historik-vejen helt.
- **Ny callable + klientkode = split-deploy-risiko** (se invitations-afsnittet):
  `functions/not-found` indtil `deployFunctions` er tikket af. Brug
  adminActions' eksisterende "…er ikke deployet endnu"-besked og sig det til
  Release Manager.

## Runde-Botten kender Chancen (a889bb1): plan mod implementering — konkrete fund

- **Alle 6 spilfører-krav holdt, efterprøvet konkret, ikke kun læst:**
  netto beregnes med `outcomePoints` fra SAMME `superligaScoring`-modul som
  `pointOpdeling.js`s `opdelPoint()` bruger (`chance += points − tip`, identisk
  formel, identisk `taeller()`-gate `!!(info && info.result)`), og et direkte
  test (`gameRecap.test.js` linje ~595) sammenligner bottens sum af
  `chancer[].netto` mod `opdelPoint(...).chance` — det er den rigtige måde at
  bevise "samme kilde" på, ikke bare en kommentar der siger det.
  `stoersteGevinst`/`stoersteTab` er forudberegnet i JS (samme delt→null-mønster
  som `standout`), og der er en test for netop den delte case. `ingenChancer`
  er kollektiv (`chancer.length === 0`), og prompten forbyder eksplicit navne
  ved den observation. De tre tone-grænser står ordret i `RECAP_SYSTEM` og er
  hver for sig assertion-testet på INDHOLD (ikke kun "findes prompten").
- **`players`-scoping af chancer er bevist, ikke antaget.** Der er en test,
  der lægger en bruger 'C' UDEN FOR `players`-listen ind i `betsByUid` (som om
  kaldstedet havde sendt en ikke-liga-scoped map) og bekræfter `chancer` bliver
  tom for den kamp. Kaldstedet (`runGameRoundRecap` linje ~405) sender allerede
  `players: lokaleRanger(medlemmer)`, hvor `medlemmer` er `memberUids ∩ perUid`
  — dobbelt sikret. Eneste kaldsted i produktionskoden (`grep` bekræftet).
- **`chanceMaxStake(bank)`-loftet er en FUNKTION AF SALDOEN VED BET-TIDSPUNKTET,
  ikke af bet-dokumentet.** Bet-dokumentet gemmer kun det allerede-klippede
  `chanceStake`, ikke banken før runden — så `maks` (spilførerens ønskede felt)
  kan IKKE udledes bagudrettet uden at genafspille hele spillerens historik.
  Beskyttelsen blev i stedet lagt som en REN prompt-regel ("Kommentér ALDRIG
  størrelsen af en indsats som fej eller lille"). Det er en acceptabel
  afvigelse — men bemærk at den ikke er en ny risikokategori: HELE tone-laget
  i denne bot (alle tre ufravigelige grænser, "mod måles i odds" osv.) er
  allerede udelukkende prompt-håndhævet, fri tekst har ingen kode-vagt. Vil
  man gøre `maks` kontrollerbart FREMOVER (ikke bagudrettet for eksisterende
  bets), er den rigtige rettelse at skrive banken/loftet ind på bet-dokumentet
  VED SKRIVNING (`betActions.js`/`functions-platform` bet-handler), ikke i
  gameRecap. Spørg dette igen, hvis nogen ønsker at gøre tone-reglerne
  kode-håndhævede i stedet for prompt-håndhævede.
- **Recapens chance-eksponering er IKKE ny eksponering — det er allerede
  synligt data, blot samlet.** `LeagueBets.jsx` viser allerede ⚡ (med
  `chanceStake` i title) for liga-kammeraters bets på en kamp, der er gået i
  gang; og `firestore.rules` `players/{uid}/detalje/{docId}` (kommentar linje
  ~706-720) tillader ALLEREDE læsning "eget dokument, eller en man deler liga
  med" — samme kreds som `useVisibleGameStandings`. Chance-netto pr. kamp var
  altså allerede udledeligt af en liga-kammerat FØR denne commit (kendt facit
  + kendte odds + synlig stake). God ting at tjekke ved lignende "AI-bot får
  nyt personligt felt"-ændringer: er feltet allerede synligt et andet sted i
  samme synlighedskreds, eller er det en NY eksponering?
- **Dokumentations-hul, ikke blokerende:** hverken `docs/admin-guide.md`s
  "Runde-Botten"-afsnit, `GameRecapBotTab.jsx`s egen brødtekst
  ("rundens resultater, stillingen og en kærlig stikpille til rundens
  bedste") eller `FootballHelp.jsx`s spiller-vendte beskrivelse ("hvem der
  løb med runden, hvem der brændte den...") nævner Chancen. Ikke FALSK (ingen
  af dem lover noget, koden ikke giver), men ufuldstændig — en admin, der
  forhåndsviser og ser en chance-kommentar første gang, har ingen tekst der
  forklarer det. Værd at rette ved næste tekstpas på nogen af de tre steder.

## Tip-status-fladen (26e9dea): implementering mod planens 7 krav — konkrete fund

Alle 7 rettelser fra plan-gennemgangen (se afsnittet ovenfor) er implementeret
og bevist, ikke kun læst i en kommentar: `byggTipStatus` genbruger bogstaveligt
`gatedeKampe`/`startRundeFor`/`upcomingMatches` fra samme modul som
`runGameTipReminders`, med en direkte test der viser `rammesAfKnappenNu`
afviger fra `kampeIRunden` (Bo mangler kun en kamp 30 t ude — knappen springer
ham over). Ingen ny per-person ryk-knap. `naaedeDetIkke`/`kanRykkes` er begge
UI- og server-testet. Klienten kalder `groupByRound`/`activeRound`/
`fraStartRunde`/`startRundeFor` — de SAMME importerede funktioner Tip-fanen
bruger, ingen server-dublet af "aktiv runde" (serveren tager blot imod
`round` og validerer `1–99`).

- **`emailByUidMap(db)` scanner HELE `userContacts`-kollektionen — også fra
  den nye `hentTipStatus`.** Kommentaren over `hentTipStatus` siger "kun
  deltagernes profiler læses (db.getAll), aldrig hele brugerkartoteket", hvad
  der er sandt for `users` (scoped via `db.getAll(...memberUids)`) men IKKE
  for e-mails: `emailByUidMap` gør `db.collection('userContacts').get()` —
  samme fulde scan som `gamePuljeStatus` kritiseres for at gøre på `users`
  OG `userContacts`. Ikke en regression i denne commit (mønstret er arvet fra
  det allerede eksisterende `runGameTipReminders`/`sendGameTestReminder`, som
  begge allerede kaldte `emailByUidMap`), og stadig bag en knap (accepteret
  efter reglen "kun så længe det sidder bag en KNAP"). Men kommentarens
  påstand "aldrig hele brugerkartoteket" er præcist forkert for e-mail-delen.
  Spørg næste gang nogen skriver "kun deltagernes data læses" ved siden af et
  kald til `emailByUidMap`: gælder påstanden ALT i funktionen, eller kun
  profilerne? Præcisér kommentaren, eller — hvis det nogensinde bliver dyrt —
  lav en `db.getAll`-variant af e-mail-opslaget.
- **To defensive fejl-veje er kodet rigtigt, men ikke testdækket:** "spillet
  har ingen runder" (tom `groupByRound`-liste → `activeRound` returnerer
  `null` → dansk fejlbesked, ikke et crash) og runde-0-fallback'en i
  `groupByRound` (kampe uden `round`-felt). Læst efter i koden: begge er
  korrekte, men INGEN test i `GameReminderTab.test.jsx` eller
  `reminders.test.js` dækker "ingen runder"-stien. Lavt reelt risiko, fordi
  `scripts/seed-football.mjs` linje 91 filtrerer `round == null` fra FØR
  skrivning, og `superligaSync.js`s invariant siger eksplicit at
  kickoff-synken ALDRIG rører `round` — så en kamp uden runde-nummer er en
  defensiv fallback for korrupt data, ikke en nåbar tilstand i normal drift.
  Server-loftet `round > 99` er af samme grund uskadeligt: ægte runde-tal for
  fodbold topper omkring 38-46, langt under loftet — vælgeren kan aldrig
  producere et tal, callablen afviser.
- **En "runde uden kampe efter gate" kan ikke vælges via UI'et overhovedet:**
  `tipRunder` bygges af `groupByRound(fraStartRunde(...))`, så en runde, hvor
  ALLE kampe er gatet væk, optræder aldrig som et `<option>` — kun
  `byggTipStatus` kaldt direkte (som i testen "gaten: runder før spillets
  startrunde har ingen kampe at mangle") kan producere `kampeIRunden: 0`.
  Ingen mismatch mellem hvad vælgeren viser og hvad serveren accepterer.
- **Ordvalget matcher Pulje-status-sektionen i samme fane** (samme
  "🔎 Tjek X-status"-knapmønster, samme "Alle har tippet ... 🎉"-badge). Den
  strukturelle forskel (ét aggregeret tal i Pulje-status vs. én række pr.
  spiller i Tip-status) er begrundet i datens form, ikke en tilfældig
  afvigelse — ikke et fund.
- **Testtal:** `npm --prefix functions-platform test` → 501/501 grønne
  (`reminders.test.js` 11 af dem, inkl. `byggTipStatus`). `npx vitest run
  src/features/admin` → 289/289 grønne (`GameReminderTab.test.jsx` 4 af dem).

## Liga-spørgsmåls-status (#38, plan-gennemgang): svar-synlighed + ærlige tællere

- **"X svar"-tælleren i `LeagueQuestions.jsx` (linje ~107) var ALTID løgn på et
  åbent spørgsmål.** `useLeagueQuestions` abonnerer på egne svar bredt, men på
  ANDRES svar kun for LUKKEDE spørgsmål (`settledQuestionIds`) — fordi
  `firestore.rules` linje ~1008 kun åbner andres svar ved facit/deadline, og
  regler ikke er filtre. `answersByQid[q.id].length` er derfor 0 eller 1 på et
  åbent spørgsmål. Generel lære: **enhver tæller, der bygger på en query, som
  er indsnævret for at matche en læseregel, tæller "hvad jeg må se" og ikke
  "hvad der findes" — og skal enten hedde det eller væk.**
- **Liga-spørgsmål er de ENESTE data, hvor global admin IKKE har en klient-
  bypass.** `games/{g}/bets`, `players/{uid}/detalje` starter med
  `allow read: if isGlobalAdmin()`; `questionAnswers` gør IKKE (kun medlemskab
  + lukket spørgsmål). En callable er derfor ægte nødvendig her — modsat
  tip-status-fladen, hvor begrundelsen "reglerne forbyder det" var falsk.
- **Svar-dokument-id'et `qId_uid` er RULE-HÅNDHÆVET** (`answerId ==
  request.resource.data.questionId + '_' + request.auth.uid`, rules ~1018), og
  spørgsmåls-id'er er `addDoc`-auto-id'er ([A-Za-z0-9], aldrig '_'). Derfor er
  det sikkert at udlede "hvem har svaret" af doc-id ALENE, uden at røre
  svar-feltet. Deterministiske id'er giver desuden den præcise opslagsform:
  `db.getAll(...åbneQ × memberUids, { fieldMask: [...] })` — eksakt pris, ingen
  kollektion-scan, svaret forlader aldrig databasen. Bemærk afhængigheden:
  lempes reglen, dør antagelsen tavst.
- **Tre steder definerer allerede "lukket", og de er IKKE ens.** Rules:
  `facit != null`. `lqSettled()` (leagueQuestionScoring.js): `facit != null &&
  trim() !== ''`. `settledQuestionIds()` (useLeagueQuestions.js): facit ELLER
  deadline + 60 s skew. Et fjerde, server-side, prædikat skal kopiere
  **skrivereglen** (`facit == null && (deadline == null || now < deadline)`) —
  det er den, der afgør, om nogen stadig KAN svare. Alt andet lister folk som
  "mangler" på noget, de er låst ude af.
- **Server-ur vs. klient-ur i samme række.** Callablens `Date.now()` er
  reglernes ur; `deadlinePassed()` i `LeagueQuestions.jsx` er brugerens. Et par
  minutters afvigelse giver "Deadline passeret" og "mangler: Bo" side om side.
  Lad serveren sende sit eget `aabent`-flag + hentetidspunkt, og vis "Hentet kl.
  HH:MM" — en hentet liste er ikke live, og skal ikke se live ud.
- **`memberUids` er NUVÆRENDE medlemmer; svar slettes aldrig** (`allow delete:
  if false`, og `leaveLeague` gør `arrayRemove`). "Besvaret X af Y" kan derfor
  blive "5 af 4". Snit altid besvarede ∩ memberUids.
- **Liga-væggen notificerer INGEN.** Der er ingen `onDocumentCreated`-trigger i
  hele `functions-platform/index.js` — en væg-besked sender ikke mail og giver
  ingen notifikation. "Væggen er nok som ryk" er derfor kun sandt, fordi ryk i
  praksis sker i WhatsApp. En liga-mail ville give hver liga-ejer en
  udsendelses-kanal til medlemmerne = ny kapacitet, ny sikkerhedsgennemgang.
  Den billige ærlige mellemvej er "Kopiér navne" (mønster findes i
  `LeaguesPage.jsx` og `UserRow.jsx`).
- **Placering: liga-ejerens flade slår admin-fanen, når rollen ikke er admin.**
  Trin 0b's "hvor ville en administrator lede?" gælder admin-funktioner. Her er
  aktøren LIGA-EJEREN (de fleste er ikke admins), så Admin → Påmindelser ville
  tjene én bruger og samtidig give globale admins indblik i alle private
  ligaers svar-status. Rigtig løsning: byg på liga-fladen, og luk
  genfindeligheds-hullet med en linje i `docs/admin-guide.md` + evt. en ren
  tekst-henvisning i Påmindelser-fanen. Ejeren ledte forkert — det er et
  vejvisnings-problem, ikke et placerings-problem.
- **Sæt statussen dér, hvor den påvirker den næste handling.** "Gem facit"
  sidder pr. spørgsmål (linje ~159), og facit kan aldrig nulstilles (rules
  ~984). En mangler-liste i en blok for sig lader ejeren lukke et spørgsmål
  uden at se, at tre endnu ikke har svaret. Knap ét sted, resultat i rækken.

## Bot-afsløring af liga-spørgsmål (#39) + PL-pulje (#8): plan-gennemgang

- **`game.pulje` er IKKE kun en fane-gate — den er en visuel kontakt fire
  steder til.** `GamePage.jsx:41` (`kraever: 'pulje'`) er den kendte. De
  ukendte: `FootballTable.jsx:70` (`Number(game?.pulje?.poolSize) || 0`)
  BYTTER hele Tabel-fanen ud — overskrift "⚽ Superligaen — grundspil",
  brødtekst "de øverste N om mesterskabet og de nederste N i
  nedrykningsspillet", og sektionerne "🏆 Mesterskabsspil (top N)" /
  "⬇️ Nedrykningsspil (bund N)" — OG den fjerner den flade tabels
  "⬇️ Nedrykning (bund 3)"-streg. `FootballHelp.jsx:111`, `:265`, `:294`
  ("den officielle **Superliga**-stilling ... top 6 og bund 6", hardkodede
  6-taller) og `:353`. `functions-platform/inviteTemplate.js:98,205`: mailens
  feature-kort #3 skifter fra "Liga-spørgsmål" til "Pulje-tippet 🏆 ...
  mesterskabsspillet ... +4 point ... +10 bonus" (hardkodet). Plus
  ryk-mailen i `index.js` ~857 og `GameReminderTab.jsx:227`, begge med ordet
  "mesterskabsspillet". **At skrive `pulje` på et spil er derfor en
  UI-udrulning, ikke en konfiguration** — spørg altid `grep -rn "\.pulje"`
  før nogen påstår "usynligt indtil vi tænder".
- **`PULJE_MAKS_STARTRUNDE` har fire klient-læsere, ikke én:**
  `FootballHelp.jsx:265`, `GameLeagues.jsx:223` + `:245`,
  `GameStandings.jsx:280`. Og `ligaPoint` sendes BY REFERENCE ind i
  `ligaRanking(standings, league, ligaPoint, harRundeVektor)` — gøres tallet
  spil-afhængigt, skal `game` tråges gennem alle fire plus spejlet i
  `functions-platform/ligaPoint.js` (paritetstesten binder tallet 3 til SL's
  `puljeLockAt`, linje 51-53 — den skal blive ved med det).
- **`PuljeTip.jsx:47-54` regner sit EGET facit** af `game.standings` med den
  samme `matches.length % 6`-antagelse som serveren (`gameScoring.js:407`).
  For 20 hold/180 kampe giver den `expectedPlayed = 30` → `officialTop6`
  returnerer null → serveren falder tilbage på egen tabel og afregner, mens
  klienten aldrig sætter `seasonDone` og ALDRIG viser facit-kortet. Point i
  PointOpdeling, tavshed på fanen. To facit-kilder = to sandheder; de skal
  drives af samme konfigurerede felt.
- **`PuljeTip.jsx:91` lover "🟢 Åbent — deadline fastsættes af admin", mens
  rules garanteret afviser.** `beforeDeadline()` kræver `gameLock() != null`,
  og `get(...).data.puljeLockAt` på et dokument UDEN feltet er en
  evalueringsfejl (samme fælde som kommentaren ved rules ~973 advarer om for
  `deadline`). Gem-knappen er tændt (`locked` er false når lockMs er null).
  Læse-grenen `(isApproved() && !beforeDeadline())` åbner desuden ALLES
  puljetips, når låsen mangler. `pulje` og `puljeLockAt` må aldrig eksistere
  hver for sig.
- **Liga-spørgsmåls-scoring er SÆT-afhængig for `type:'number'`**
  ("nærmest vinder", `leagueQuestionScoring.js:42-55`), og klienten scorer over
  ALLE svar-dokumenter den må læse — inklusive svar fra folk, der har FORLADT
  ligaen (`leaveLeague` gør `arrayRemove`, svar slettes aldrig, og læsereglen
  spørger kun om LÆSEREN er medlem). En server-scoring, der kun læser
  `${qId}_${uid}` for NUVÆRENDE `memberUids` (grebet fra
  `hentSpoergsmaalStatus`), kan derfor udnævne en anden vinder end den grønne
  badge i rækken ovenfor. Grebet er rigtigt til "hvem mangler", forkert til
  "hvem vandt".
- **`LeagueQuestions` renderes DIREKTE over `LeagueWall` i samme kort**
  (`GameLeagues.jsx:267-275`), og efter deadline viser rækken allerede alle
  svar, efter facit også point med grøn badge. Et bot-opslag om et spørgsmål
  står altså få centimeter under de samme data — dets værdi er stemmen, ikke
  oplysningen. Og væggen notificerer stadig ingen (ingen
  `onDocumentCreated` i `functions-platform/index.js`), så et opslag er ikke
  et ryk.
- **`allow create` på `questions` begrænser IKKE ekstra felter.** En
  regel-stramning, der kun rammer `update`-grenen (fx bot-markører), er
  omgåelig ved at sætte feltet allerede ved oprettelsen. Tjek altid BEGGE
  grene, når et felt skal reserveres til serveren.
- **Facit kan RETTES iflg. rules (kun ikke nulstilles), men fladen tilbyder
  det ikke:** facit-formen er gated på `!settled` (`LeagueQuestions.jsx:194`).
  En "facit ændret"-sti er altså ikke nåbar fra appen — men markør-felter uden
  override betyder, at et forkert bot-opslag kun kan SLETTES (liga-ejeren må
  slette enhver væg-besked, rules ~934), aldrig erstattes. Enhver
  én-gang-markør skal have en `tving`-vej i sin manuelle knap.
- **`DriftTab`s `forventede` bygges KUN af sweep/kickoff pr. synket spil.**
  Ukendte typer får nu et kort (QC-rettelsen er landet, linje ~138) — men
  først når dokumentet FINDES. En ny skemalagt funktion, der aldrig deployes
  eller aldrig kører, er stadig usynlig; skal den overvåges, skal dens type
  med i `forventede`.
- **`game.aiRecaps` har ingen UI nogen steder.** Afbryderen i
  `LeaguesPage.jsx:345` sidder på den GAMLE `leagues`-kollektion, ikke på
  `games`. Kill-switchen for botten kan kun sættes i hånden — "hvordan starter
  jeg det med vilje" har en tvilling: hvordan STOPPER jeg det?
