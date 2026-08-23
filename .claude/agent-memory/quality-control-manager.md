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

## Bot-afsløring af liga-spørgsmål (0657068): implementering mod planens 6 krav — konkrete fund

Alle 6 checkpoints fra plan-gennemgangen er bekræftet, ikke kun læst:

- **Create-vagten på `botFacitAt`** findes i `firestore.rules` (~957) OG er
  eksplicit rules-testet (`functions/rules.test.js`, 4 nye tests: update,
  smuglet update, create-med-markør afvist, create-uden-markør ok). Update-
  vagten alene (som QC/Security fandt på planen) var netop hullet.
- **Scoring over HELE svarsættet** er bevist, ikke kun kommenteret:
  `byggSpoergsmaalRecapFakta` tager `svar` uden medlems-filter, `scoreLeague-
  Question` regner over `alleSvar`; en direkte test (`leagueQuestionScoring.
  test.js`, "at udelade et svar kan ændre vinderen") viser at et eks-medlems
  svar skifter vinderen. Eks-medlemmer navngives `'et tidligere medlem'`, og
  `JSON.stringify(fakta)` er assertion-testet for at UDELUKKE uid'et
  (`leagueQuestionRecap.test.js` linje ~82).
- **`skalAfsloere` er ren og mutationstestet på netop de to farlige stier:**
  facit-RETTELSE (afgjort→afgjort) og bottens egen markør-skrivning giver
  begge `false` — begge har hver sin test.
- **`tvingNy` findes på callablen** (`leagueQuestionRecapNow`), server- og
  klient-testet (post-igen-knappen kræver `window.confirm` og kalder med
  `tvingNy: true`).
- **`questionId` sidder på væg-beskeden** (`messages.add({..., questionId})`),
  testet direkte.
- **Prompten skelner eksplicit fra puljen**: `LQ_RECAP_SYSTEM` indeholder
  ordret "LIGAENS EGNE spørgsmål (liga-ejerens spørgsmål — ikke spillets
  pulje eller kampene)" — assertion-testet på INDHOLD, ikke kun "prompt
  findes".
- **A4 (fejningen) er faktisk skåret**, som planen bad om: ingen
  `onSchedule` for spørgsmål i `functions-platform/index.js`, ingen
  48-timers-vindue nogen steder i koden eller kommentarerne. Bekræftet med
  grep — kun trigger (`onDocumentWritten`) + bevidst callable-start.
- **`generateRecapText(anthropic, facts, system = RECAP_SYSTEM)`**: default-
  parameteren betyder det GAMLE kaldsted (`runGameRoundRecap`, ét argument
  mindre) er uændret i adfærd — bekræftet ved at læse begge kaldsteder.
  `sanitizeName()` i `gameRecap.js` delegerer nu til `rensTekst.js`, med
  identisk default (`max: 40, fallback: 'Spiller'`) — ren udtræk, ingen
  adfærdsændring for runde-opslagene.
- **Server-side håndhævelse af forhåndsvisning er ægte, ikke kun klient:**
  `leagueQuestionRecapNow` kræver liga-medlemskab for `dryRun`, uafhængigt af
  om kalderen er ejer/admin — en global admin uden for ligaen må poste
  blindt, men aldrig se svarene via preview. Testet i koden (server-logik),
  ikke kun antaget.

**Fund, ikke blokerende:**
- **`FootballHelp.jsx`s "Runde-Botten 🤖"-afsnit (linje ~374) er STADIG kun om
  runde-resuméet** — nævner intet om den nye liga-spørgsmåls-afsløring.
  Samme dokumentations-hul som blev noteret (ikke rettet) for Chancen ved
  a889bb1: en spiller, der ser et bot-opslag om et liga-spørgsmål første
  gang, har ingen hjælpetekst der forklarer det. `docs/admin-guide.md` blev
  derimod korrekt opdateret (afsnit om 🤖-knapperne, med begrundelse for
  hvorfor de bor på liga-fladen og ikke i admin). To dokumentations-mål,
  kun ét ramt — spørg specifikt om FootballHelp.jsx næste gang en bot får en
  ny afsløringstype.
- **Eksisterende spørgsmål med facit sat FØR deploy udløser ALDRIG triggeren
  bagudrettet** (`onDocumentWritten` fyrer kun på fremtidige writes). Ejeren
  ser korrekt "Botten har ikke postet afsløringen endnu" med virkende
  Forhåndsvis/Post-knapper (recovery-vejen dækker det) — men parentesen
  "(den poster selv, kort efter facit er sat)" er vildledende for disse
  rækker, for det skete aldrig automatisk. Ikke en fejl (handlingen virker),
  men en tekst der antyder en hændelse, der ikke fandt sted. Værd at
  overveje en anden formulering, hvis det generer i praksis.

## Ret liga-spørgsmål (#40, plan-gennemgang): indsatsen kan hæves EFTER kortene er vist

- **Point-rettelse efter deadline er "kortene kan ikke lukkes igen" med
  indsatsen i stedet for kortet.** `firestore.rules:1049-1064` åbner ALLE svar
  for læsning, så snart deadline er passeret — og update-grenen (`:1017`)
  tillader `points` 1-100 ubetinget, også bagefter. Ejeren kan altså se hvem
  der vandt og derefter skrue spørgsmålet fra 5 til 100 point. Fladen skal
  gate point-feltet med NØJAGTIG samme betingelse som ✕-knappen
  (`!locked && !settled`, `LeagueQuestions.jsx:127`). Generelt: **spørg altid,
  om et felt sætter INDSATSEN, og om den kan røres efter udfaldet er kendt.**
- **`lqPoints(q)` læses live i `GameLeagues.jsx:132`** → et rettet point-tal
  ændrer liga-stillingen for alle medlemmer med tilbagevirkende kraft, uden
  spor og uden besked.
- **Bottens væg-opslag er UFORANDERLIGT og indeholder både point og label**
  (`leagueQuestionRecap.js:83` bager `lqPoints` + `label` ind i teksten;
  `messages` har `allow update: if false`, rules ~965). Og `LeagueQuestions`
  renderes direkte over `LeagueWall` i samme kort. En rettelse af tal eller
  tekst modsiger derfor et opslag få centimeter under sig — kampkort-fælden
  igen. Label-rettelse er stadig OK (påvirker ikke scoring), men nævn prisen.
- **Deadline fra null må sættes til ENHVER værdi, også fortiden** (rules:1027,
  `resource.data.get('deadline', null) == null` er en betingelsesfri gren).
  Konsekvensen er øjeblikkelig OG uigenkaldelig: `settledQuestionIds()` tager
  spørgsmålet med, abonnementet på andres svar åbner, alle ser alt — og
  bagefter kan deadline aldrig rettes (gren 3 kræver ikke-passeret gammel
  deadline), aldrig fjernes, og spørgsmålet kan ikke slettes (`:1041`). Én
  tastefejl i årstallet lukker spørgsmålet for evigt. **Fortids-spærring skal
  ligge i handlingen, ikke kun i `min`** — browseren håndhæver `min` kun ved
  formular-submit og slet ikke ved programmatisk værdi.
- **ms → datetime-local skal være LOKAL tid.** `toISOString().slice(0,16)` er
  UTC og rammer 1-2 timer forkert i DK; sat som `min` accepterer browseren et
  tidspunkt FØR den rigtige deadline → rules afviser → knap der fejler
  garanteret. Mønsteret findes ALLEREDE to gange, identisk:
  `toLocalInput(ms)` i `GameScheduleTab.jsx:29` og `tsToLocalInput(ts)` i
  `LeagueBonus.jsx:24`. Tredje kopi er én for meget → `src/lib/daDate.js`.
  Bemærk: opret-formen i `LeagueQuestions.jsx:363` bruger kun den MODSATTE
  retning (`new Date(str).getTime()`), så "mønsteret findes i samme fil" er
  kun det halve mønster.
- **Update-grenen begrænser hverken `label`-længde eller `type`** (create gør
  begge). `type`-skift `text` → `number` efter deadline ville lade ejeren
  aktivere "nærmest vinder"-scoringen med alle svar i hånden — så et
  type-felt i en redigeringsform er en cheat-vej, ikke en bekvemmelighed.
  Skriv udeladelsen ned som en beslutning, ikke en forglemmelse.
- **Update-reglen kræver `points is number` i RESULTATET.** En patch, der kun
  rører label, arver feltet — men mangler feltet på dokumentet, viser
  `lqPoints`-fallbacken "5 point" i en række, hvis gem-knap altid fejler. Send
  altid `points: lqPoints(q)` med. Generelt: **en update-regel, der validerer
  et felt patchen ikke rører, gør fallback-visninger til usynlige spærringer.**
- **`deadlinePassed()` bruger `Date.now()` beregnet ved render** og rækken
  opdaterer sig ikke selv → en "Udskyd"-form kan stå åben, efter serverens
  `request.time` er forbi. `permission-denied` skal have forskellig dansk
  tekst alt efter, hvad formen forsøgte (deadline vs. tekst/point).
- **Væggen notificerer stadig ingen** (ingen `onDocumentCreated` i
  `functions-platform/index.js`). En deadline sat på et spørgsmål, folk
  allerede har svaret på, ses kun af den, der tilfældigvis kigger — værst for
  den, der endnu ikke har svaret og mister chancen tavst. Billig ærlig
  lukning: kvittering + "Skriv på væggen"-knap, der kalder det eksisterende
  `postLeagueMessage`. Ingen ny kanal, ingen ny sikkerhedsgennemgang.
- **Én tekst kan ikke dække både "sæt" og "udskyd".** "Deadline kan kun
  udskydes" er meningsløs over et felt, der hedder "Sæt deadline". Del i to.

## Pulje-deadline som RUNDE (84002c5, #8): korrekt derivation, brudt "live med det samme"

- **Tekst peger på en knap, der ikke findes — igen.** `docs/admin-guide.md:56`
  ("kør **🗓️ Synk kamptider nu**") bruger PRÆCIS samme emoji+fed-konvention
  som to ÆGTE knapper i samme afsnit (`🔄 Genberegn point efter start-ændring`,
  `💰 Ompris kampene`, begge bekræftet i `GameScheduleTab.jsx:408,428`), men
  `syncGameKickoffsNow` (`functions-platform/index.js:557`, indført allerede i
  b778efa) har INGEN klient-kobling nogen steder i `src/` — grep-bekræftet
  (`adminActions.js`s liste af `httpsCallable(...)` mangler den helt). Samme
  klasse fejl som "Åbn ligaen →": teksten lover en handling, koden ikke giver.
  Konsekvens her er skarpere end normalt: den lovede knap er den ENESTE
  dokumenterede vej til at gøre en runde-udledt pulje "live med det samme".
- **Et manuelt felt, der overlever ved siden af en ny automatisk kilde, er en
  fælde uden advarsel.** `GameScheduleTab.jsx:311-320`s `🎖️ Bonus-/pulje-
  deadline`-felt er STADIG frit redigerbart for ethvert spil med `game.pulje`
  — også Premier League, der nu har `puljeLockRound`. En admin KAN altså rent
  faktisk gøre puljen "live med det samme" ved selv at skrive en dato der og
  trykke Gem (`setGameSchedule`, client-write, tilladt for `isGlobalAdmin`).
  Men værdien er kun midlertidig: næste kickoff-synk (dagligt job ELLER
  `syncGameKickoffsNow`) genudregner og OVERSKRIVER den ubetinget, SÅ LÆNGE
  admins dato stadig ligger i fremtiden ved synk-tidspunktet. Ingen tekst
  nogen steder siger, at feltet er "overstyret" for et `puljeLockRound`-spil.
- **Konkret, alvorligt hul: sætter admins placeholder-dato PASSERER FØR næste
  synk kører, låser genåbnings-forbuddet puljen FOR EVIGT ved den forkerte
  dato.** `superligaSync.js:568` (`genaabner = nuMs <= nowMs && nyMs > nowMs`)
  kan ikke skelne "en admin-sat placeholder, der nåede at passere" fra en
  ægte tidligere afsløring — den behandler begge som "nogen har allerede set
  hinandens tip", og nægter for altid at rette til den rigtige runde-udledte
  deadline. ENESTE spor er `console.error` (superligaSync.js:576) — modsat
  søster-forbuddet for kickoffs, hvor `ud.genaabninger` FAKTISK får en
  `meldAlarm(..., kraeverKvittering: true)` i `index.js:523-528` og dukker op
  på Driftstatus. `ud.puljeLock` kan desuden ikke engang SKELNE "spil uden
  puljeLockRound" fra "afvist genåbning" — begge giver `null`
  (`superligaSync.js:556,575`) — så der er ikke engang datagrundlag til at
  bygge alarmen bagefter uden først at rette returformen. Ren "en funktion,
  der kun kan fejle tavst, er ikke færdig"-fælde, på helt nyt maskineri.
- **To runbooks, kun det ene rettet.** `docs/drift.md:38`s
  "Rækkefølge ved en ny sæson"-trin 3 ("Sæt **startrunde** og **puljeLockAt**
  i Admin → Spil-tidsplan") er stadig generisk for ALLE fodboldspil og blev
  IKKE opdateret i 84002c5 — modsiger nu `admin-guide.md`s nye afsnit for spil
  med `puljeLockRound`. Følger man drift.md's egen opskrift (den, der bruges
  til netop dette: "et nyt spil"), lander man direkte i fælden ovenfor uden
  advarsel.
- **God fangst, efterprøvet mod ægte data, ikke kun logik.** Den nye afledte
  deadline er BEDRE end den gamle, ikke kun anderledes: `scripts/premier-
  league-fixtures-2627.json` viser rundeE 3's TIDLIGSTE kickoff er
  **2026-09-04T19:00Z**, mens den GAMLE hårdkodede `puljeLockAt`
  (`2026-09-11T18:55+02:00`, fjernet i denne commit) reelt lå EFTER hele
  runde 3 (spillet 4.-6. september; runde 4 starter 12. september) — den
  gamle faste dato brød altså allerede spillets egen "aldrig senere end runde
  3"-regel, ubemærket. Den nye mekanisme kan aldrig gøre det (den ER per
  konstruktion lig det tidligste runde-3-kickoff). God skabelon for "Et tal
  uden kode er en påstand": tjek datoen mod den FAKTISKE fixture-fil, ikke
  kun mod kommentarens påstand om hvornår runde 3 starter.
- **Kernen selv er solid.** `puljeLockFraRunde` (ren funktion,
  `pointOpdeling.js:383`) og dens brug i `syncKickoffsCore`
  (`superligaSync.js:556-578`) er korrekt, veltestet (9 nye tests, inkl. SL
  urørt via eksplicit `puljeLockRound == null`-gate, og "sætter puljeLockAt
  ved FØRSTE synk uden eksisterende felt" — netop det scenarie, der er
  farligt i praksis). Ikke mirroret til `src/lib/pointOpdeling.js` — korrekt
  undtagelse, for klienten (`PuljeTip.jsx:58`) læser kun `game.puljeLockAt`,
  den udleder aldrig selv.

## Runde-udledt pulje-deadline (#8) — synk-knap i Spil-tidsplan

- **Grøn kvittering på en no-op ligner succes.** `synkTekst` i
  `GameScheduleTab.jsx` er TAVS om pulje-deadlinen, når `puljeLockFraRunde`
  returnerer null (runden har endnu ingen kampe med kickoff). Så viser badget
  "0 kamptider rettet." (grøn) MENS oplysnings-feltet stadig siger "Endnu ikke
  sat" — en selvmodsigelse uden vejledning. Spørg ved enhver tør→skriv-flade:
  hvad står der, når kernehandlingen IKKE kunne udføres, men heller ikke fejlede?
  Teksten skal sige "kunne ikke udledes — runden har ingen kampe endnu", ikke tie.
- **`harPuljeRunde = Number.isFinite(game.puljeLockRound)`** styrer BÅDE at
  deadline-feltet bliver read-only OG at synk-knappen vises. Feltet leveres af
  `useGames` som `{id, ...data()}`, så `puljeLockRound` fra `scripts/games.mjs`
  er med. Rører man den seed-feltdefinition, forsvinder hele UI'et tavst.
- **Placering:** knappen sidder i Spil-tidsplan ved siden af deadline-feltet den
  påvirker; read-only-feltet peger eksplicit "kør 🗓️ Synk kamptider nu nedenfor".
  Navnet er "kamptider", ikke "pulje-deadline", men konteksten bygger broen. OK.

## SL kickoff-synk (14db489): kernen solid, men den forudsagte fælde fra egen hukommelse blev IKKE undgået

- **Selvopfyldt advarsel:** linje ~95-98 i denne fil sagde allerede "klienten
  hardkoder `provider === 'pulselive'`, serveren tjekker
  `typeof provider.hentKickoffs === 'function'` — konsistent i dag, men endnu
  et sted der skal følges ad i hånden." 14db489 gjorde SERVEREN understøtte
  superliga.hentKickoffs, men rørte IKKE `DriftTab.jsx:106`
  (`g.sync.provider === 'pulselive' ? [kickoff-kort] : []`) eller kommentaren
  linje 100-102 ("kun kilder med flytbare tider (pulselive) har kickoff-synk").
  Konsekvens: intet "afventer"-kort for SL-kickoff, før den daglige synk har
  skrevet mindst ét statusdokument. REDDET af en TIDLIGERE QC-rettelse
  (samme fil, linje 133-141: "ALLE status-dokumenter uden et forventet kort
  vises også") — den fanger et RØDT dokument, når det først findes, så en
  vedvarende SL-kickoff-fejl bliver synlig fra og med første kørsel (6:10
  dagen efter deploy, `skrivDriftStatus` kaldes ubetinget selv i catch-grenen,
  `functions-platform/index.js:577`). Men gabet mellem deploy og første
  kørsel giver INTET kort overhovedet — hverken "afventer" eller fejl — for
  et nyt provider/type-par, indtil det er kørt mindst én gang. Spørg NÆSTE
  gang en provider får en ny kilde-evne (`hentKickoffs`, `hentLive` osv.):
  er `DriftTab.jsx`s `forventede`-filter opdateret til at matche, ikke kun
  om et fallback-net fanger det bagefter?
- **Dobbelt stale-kommentar samme mønster, ingen af dem rettet i diffen:**
  `functions-platform/syncProviders.js:29-30` (modul-kontrakten) og
  `functions-platform/superligaSync.js:481-483` (`syncKickoffsCore`s egen
  guard-kommentar) siger BEGGE stadig "Superligaen — rettes ad
  seedKickoffs-vejen", som var sandt FØR denne commit og er usandt nu.
  Ingen funktionel skade (koden selv er korrekt), men næste udvikler, der
  læser kontrakten for at forstå hvornår `hentKickoffs` er valgfri, får et
  forkert eksempel.
- **Den alvorligste dokumentationsdrift er i driftsrunbogen, ikke i kode-
  kommentarer:** `docs/drift.md:112-114` siger stadig "provider kan levere
  dem (pt. kun pulselive/PL — Superligaen bruger stadig workflow-vejen
  nedenfor)" — den PRIMÆRE kilde en admin læser for at forstå, om en flyttet
  SL-kamp fanges automatisk. Uændret i denne commit. En admin, der følger
  drift.md efter en flyttet SL-kamp, vil tro automatikken ikke dækker SL og
  blive ved med kun at bruge `seedKickoffs`-workflowet — harmløst (seed-vejen
  virker stadig), men det modsiger lige netop det, commit-beskeden hævder at
  løse ("fang flyttede kampe automatisk").
- **Kernen selv (`kickoffsUrl` med `status=notstarted`, dobbelt-forsvar mod en
  API-status-race via `kickoffPlan`s egen `nu.result`-check, genåbnings-vagt,
  `puljeLockRound`-gaten uændret) er korrekt og veltestet** — 6 nye
  counter-proofs, alle beståede, ingen mutationsfælde fundet ved læsning
  (notstarted-endpoint bevist eksplicit i test, ikke kun antaget).

## Synk-knap gates på kickoff-synk, ikke pulje-model (1ff476c, #161): den forudsagte fælde blev rettet denne gang

- **Lukker et reelt hul, fuldt ud.** `harPuljeRunde`-gaten på "🗓️ Synk kamptider
  nu" (indført i #8, se ovenfor) udelukkede Superligaen efter SL fik sin egen
  kickoff-synk (14db489/#160): SL har `puljeLockAt` (fast dato), aldrig
  `puljeLockRound`, så knappen forsvandt sammen med den ENESTE måde at hente en
  flyttet SL-kamp med vilje — man måtte vente til jobbet kl. 06:10. Ny gate
  `harKickoffSynk(game)` (provider-baseret) er korrekt: `superliga2627` i
  `scripts/games.mjs:69` har `sync.provider === 'superliga'`, serverens
  `PROVIDERS.superliga.hentKickoffs` findes (`syncProviders.js`), og
  `syncGameKickoffsNow` (`functions-platform/index.js:585`) var allerede
  owner-gated og understøtter SL siden #160 — ren klient-fix, bekræftet ved
  læsning af hele kæden, ikke kun antaget.
- **De to gates blev korrekt AFKOBLET, ikke bare omdøbt.** `harPulje &&
  !harPuljeRunde` (linje 388) styrer STADIG det redigerbare deadline-felt for
  SL (fast dato, sættes i hånden); `harKickoffSynk(game)` (linje 580) styrer
  STADIG kun knappens synlighed. For SL er begge sande samtidig (redigerbart
  felt + synk-knap, der IKKE rører feltet — kun kamptiderne); for PL er begge
  sande men synken sætter OGSÅ `puljeLockAt`. Ingen spil fundet, hvor kun den
  ene er sand og den anden burde være det (Touren har intet `sync.provider` og
  intet `pulje` — ingen af delene vises, korrekt).
- **Selvopfyldt advarsel denne gang UNDGÅET.** Egen tidligere note (SL
  kickoff-synk, 14db489) forudsagde netop denne klasse fejl: "et hardkodet
  provider-navn spredt i fladen". Denne commit retter det strukturelt —
  `KICKOFF_PROVIDERE` udtrukket til `src/features/games/kickoffSync.js` og
  brugt af BÅDE `DriftTab.jsx` og `GameScheduleTab.jsx` (grep-bekræftet: intet
  tredje hardkodet `'pulselive'`/`'superliga'`-gate tilbage i
  `src/features/admin/` eller `src/features/games/` — kun display-navne i
  `FootballTable.jsx`s `KILDER`, som er en ANDEN ting, ikke en gate).
- **Testen, der før KODEDE selve bugget, blev vendt — ikke bare duplikeret.**
  `GameScheduleTab.test.jsx`s gamle test asserterede eksplicit "knappen vises
  IKKE for et spil uden puljeLockRound" med SL som fixture — dvs. testen
  BEVISTE bugget grønt. Nu vendt til "knappen VISES", med kommentar der
  forklarer hvorfor (samme mønster som CLAUDE.md's "et bånd der rummer både
  før og efter" — her var det en PÅSTAND, ikke et bånd, men samme lære:
  spring aldrig let hen over en fixture, der ser forkert overbevisende ud).
- **Ingen dokumentationsdrift fundet.** `docs/drift.md:112-114` er allerede
  rettet (fra en tidligere commit) til "nu både Premier League og
  Superligaen" — ikke længere den stale tekst denne fils tidligere note
  fangede. `docs/admin-guide.md:52-60` beskriver kun puljeLockRound-scenariet
  og nævner ikke SL's nye brug af samme knap til at rette kamptider uden
  pulje-kobling — men påstår heller intet forkert om det; ren udeladelse, ikke
  en modsigelse. Ingen blokerende dokumentationsfejl.
- Lint, build og relevante tests (`kickoffSync.test.js`, `DriftTab.test.jsx`,
  `GameScheduleTab.test.jsx`, 62 tests) grønne ved egen gennemkørsel.

## Hjælpesiden (#43): når en hardkodet liste afledes af levende data

- **`splitGames` er IKKE "alle spil" — den er "de spil, DENNE bruger ser".**
  `src/features/games/useGames.js:35-40`. Et spil, der hverken er mit, joinable
  eller eksternt, falder ud af ALLE TRE lister. Konkret i dag: `vm2026`
  (`status:'finished'`, `joinable:false`, INGEN `externalUrl`) og VM-spildata
  blev aldrig migreret (`docs/platform-status.md:56` er uafkrydset) → ingen har
  et players-doc → VM er usynlig for ALLE. Afleder man hjælpesiden af
  `[...mine, ...open, ...external]`, forsvinder "VM 2026" og linket til
  vm.vejleaa.dk helt. Spørg altid ved en afledning: hvilke rækker i kilden
  falder ud af filteret — og var de synlige før?
- **Kur, hvis et afsluttet spil skal blive ved med at kunne slås op:** giv det
  `externalUrl` i `scripts/games.mjs`. `splitGames`' egen kommentar siger, at
  eksterne spil vises "uanset medlemskab OG uanset status" netop derfor.
  `externalUrl` er ikke i `ADMIN_OWNED` (`scripts/seed-payload.mjs:20`), så en
  seed-kørsel må skrive det — men seedGames mod produktion kræver tørkørsel og
  et ja fra ejeren.
- **`joinable` afgør, om et spil overhovedet kan nævnes for en ikke-deltager.**
  `pl2627-efteraar` seedes bevidst med `joinable:false` ("oprettes skjult").
  En afledt liste nævner derfor kun PL, hvis admin har slået `joinable` til i
  produktion. Et plan-løfte om "nu nævnes PL" skal verificeres mod prod-feltet,
  ikke mod `games.mjs`.
- **"Fuld guide inde i spillet under ❓ Guide" er et løfte, en ikke-deltager
  ikke kan indfri.** `src/pages/GamePage.jsx:107` — er man ikke medlem, vises
  KUN et Deltag-kort; ingen faner. Og Guide-fanen er `football:true`
  (`GamePage.jsx:51`), så den findes slet ikke for et cykel-spil. Sætningen
  står i dag i Superliga-blurben på hjælpesiden — altså præcis på det spil, man
  typisk IKKE er med i.
- **Evne-tekst skal gates på evnen, også i en blurb.** `FootballHelp.jsx:356`
  er facit-mønstret: pulje-afsnittet renderes kun `if (pulje)` og henter ALLE
  ord fra `game.pulje.labels` (`overskrift`/`top`/`ned`/`facit`). En håndskrevet
  hjælpe-blurb, der lover "pulje-tip" eller "tabel", er et nyt spejl af
  `game.pulje` / `game.standings` — de to felter, `GamePage.jsx:44` og `:49`
  gater fanerne på. Genbrug labels frem for at skrive tallene af.
- **`useGames()` giver ingen fejl ud.** Fejler games-lytteren, sættes
  `games = []` og `loading = false` — ingen fejlbesked. En sektion, der
  renderer listen råt, bliver en tavs tom overskrift. Kræv altid en
  tom-tilstands-sætning + en loading-tilstand, når useGames flyttes til en ny
  flade.
- `/hjaelp` ER bag `ProtectedRoute` uden `require` → kræver `isApproved`
  (`ProtectedRoute.jsx:10`), og `firestore.rules:639` giver `allow read` på
  games til `isApproved()`. Ingen auth-fælde dér.

## Hjælpesiden (6341f42): implementering mod planens 5 punkter — ét bekræftet, blokerende fund

Fire af fem punkter landede korrekt (VM-`externalUrl`; medlemskabs-hale;
loading/tom-tilstand; intro-sætning). Ét blev IKKE fulgt:

- **`HelpPage.jsx`s `SpilleneLigeNu` læser `g.pulje?.labels` RÅT — i stedet
  for at genbruge `puljeKonfig(game)` (`src/lib/superligaScoring.js:524`),
  det NETOP DEN FUNKTION planen selv pegede på ("FootballHelp-mønstret").**
  `puljeKonfig` giver default-labels (`top: 'mesterskabsspillet'`,
  `ned: 'nedrykningsspillet'`, osv.), når `game.pulje.labels` mangler —
  `FootballHelp.jsx:356-365` bruger den, og derfor virker SL's pulje-afsnit
  DÉR. Men Superligaens rigtige `pulje`-felt i `scripts/games.mjs` er kun
  `{ poolSize: 6 }` — INGEN `labels`-nøgle (bekræftet ved at køre
  `import('./scripts/games.mjs')` direkte). `SpilleneLigeNu`s betingelse
  `labels?.top` er derfor `undefined` for Superligaen, og HELE
  "Dertil et pulje-tip: …"-linjen forsvinder — bekræftet med en render af
  `HelpPage` mod de ÆGTE `GAMES` (ikke test-fixturen): `screen.queryByText(/Dertil et pulje-tip/)`
  er `null` for Superligaen. Den statiske `BLURBS.superliga2627`-tekst nævner
  heller ikke puljen/mesterskabsspillet i ord — så resultatet er, at
  Superligaens pulje-tip (som hjælpesiden FØR commit'en eksplicit nævnte:
  "et pulje-tip om, hvem der når mesterskabsspillet") er helt væk fra
  platform-hjælpesiden. Commit-beskeden hævder det modsatte ("PL's juletabel
  OG SL's mesterskabsspil får hver deres ord uden håndskrift") — påstanden er
  faktuelt forkert for SL.
- **Testen der skulle fange det, bekræftede sig selv.** `SL`-fixturen i
  `HelpPagePlatform.test.jsx` er HÅNDSKREVET med en opfundet
  `pulje.labels: { top: 'mesterskabsspillet' }` — et felt, Superligaens
  RIGTIGE `games.mjs`-post ikke har. Testen beviser derfor, at koden virker
  for data, der ikke findes i produktion, og er blind for netop den kilde,
  den påstår at teste imod (CLAUDE.md: "antag, at dine egne tests bekræfter
  sig selv"). Retten er at importere `GAMES` fra `scripts/games.mjs` direkte
  i mindst ét testtilfælde (som `FootballHelp.jsx`s paritetsmønster gør), ikke
  en frithændig fixture, når nøjagtig DEN post allerede findes i repoet.
- **Rettelsen er lille og lokal:** importér `puljeKonfig` fra
  `src/lib/superligaScoring.js` i `HelpPage.jsx`, kald
  `puljeKonfig(g)` i stedet for at læse `g.pulje?.labels`/`g.pulje.poolSize`/
  `g.pulje.nedSize` direkte, og brug de garanterede default-labels. PL, der
  allerede har eksplicitte labels, er upåvirket (samme output).
- **Pulje-sætningens ordlyd med PL's rigtige labels er læsbar, men
  redundant:** "Dertil et pulje-tip: de 4 hold i **top 4 juleaften** — og de 3
  i **nedrykningszonen juleaften**." — tallet ("4"/"3") gentages unødigt lige
  før label-teksten, der selv indeholder tallet ("top 4"). Ikke volapyk, men
  værd at stramme ("hvem der ligger i **top 4 juleaften**" uden det
  indledende talgentag), hvis teksten røres igen.
- **Intro-sætningen "Dine spil — og dem, du kan tilmelde dig" dækker ikke helt
  det, der faktisk vises:** listen inkluderer altid `external`-spil (VM, Tour)
  UANSET medlemskab og UANSET `joinable` (begge har `joinable:false`) — de er
  hverken "dine" eller "noget du kan tilmelde dig". Ikke en modsigelse af
  nabo-sektionen "Én bruger, flere spil" (den taler kun om `/spil`, ikke om
  denne liste), og ikke blokerende — men sætningen underdriver en tredje
  kategori (spil, der kun kan slås op via link).
- Fire eksplicit efterprøvede, ikke fundet nogen fejl: VM-`externalUrl`
  (bekræftet i `scripts/games.mjs`), medlemskabs-hale (Guide kun for
  `myGameIds.has(g.id)`, ellers Deltag), BLURBS-tekstens fire løfter
  (kupon/Chancen/Elo/mini-ligaer) — alle fire er UNGATEDE generiske
  fodbold-features (`FootballTip.jsx`, `EloTable.jsx`, `GAME_TABS`), så SL og
  PL kan begge holde løftet, og loading/tom-tilstand (begge grene testet og
  bekræftet ved manuel render).

## Drift for påmindelser + bots + resultat-synk-knap (#47+#48, plan-gennemgang)

- **En manuel synk-knap arver serverens timeout, ikke klientens.**
  `syncSuperligaResultsNow` (`functions-platform/index.js:643`) har INGEN
  `timeoutSeconds` → v2-default 60 s. `repriceGameOdds` har 300, minut-synken
  120 ("to spil × fuld sæson × to veje"). En klient-wrapper med
  `timeout: 300000` lyver derfor: serveren dræber kaldet efter 60 s. Samme
  latente fejl findes allerede på `syncGameKickoffsNow` (klient 120 s, server
  60 s). Tjek ALTID begge ender, når en "kør nu"-knap kobles på en callable.
- **Sweep'et kører allerede fuld sæson hver time** (`only: alle` fra
  `allMatches`, cron `25 2,13-23`). En manuel resultat-synk gør derfor intet
  nyt inden for sweep-timerne — dens værdi ligger i hullet 02:25→13:25. Følge:
  en alarm, hvis remedie er knappen, vil ofte få svaret "intet manglede", for
  strandet betyder som regel "kilden HAR ikke facit". Rapporten for
  `updated === 0` skal sige, hvad man så gør (sæt facit i hånden) — ellers er
  alarm→knap→"intet manglede" en løkke. Callablen returnerer ikke de STADIG
  manglende kampe; skal rapporten navngive dem, er det serverarbejde.
- **Tør-kørsel kan udelades, når cron'en gør det samme uovervåget.** Det er
  argumentet, ikke "idempotent": der findes ingen beslutning, en
  forhåndsvisning kunne ændre. Men så må confirm-teksten heller ikke lyde som
  en advarsel MOD at gøre det, alarmen lige har bedt om — skriv "du fremrykker
  det, automatikken selv ville gøre".
- **⚙️ Indstillinger findes IKKE i PLATFORM_MODE** (`AdminPage.jsx`:
  `isOwner && !PLATFORM_MODE`), og `setAutomationPaused`/`config/automation`
  bor kun i `functions/` (Tour). En platform-hjælpetekst, der advarer mod at
  forveksle noget med "den globale pause i ⚙️ Indstillinger", sender ejeren
  efter en fane, der ikke findes. Tjek altid fane-gaten i AdminPage, før en
  tekst henviser til en anden fane.
- **`GameReminderTab` er ikke kun påmindelser.** Den rummer også 🎯 Tip-status
  og 🎖️ Pulje-status. Strammer man fanens `eligible`-filter for at matche
  09-jobbets gate, ryger de to andre evner med. Vil man fjerne modsigelsen
  (manuel knap aktiv, mens automatikken er tavs), så deaktivér KNAPPEN, ikke
  hele spillet i vælgeren.
- **En pause-kontakt skal rette nabo-teksten.** `GameScheduleTab.jsx:25`
  siger "I gang. Påmindelser sendes." og fanens egen hjælpetekst
  (`GameReminderTab.jsx:134-137`) "Deltagere får automatisk en mail kl. 09.00".
  Begge bliver halve løgne for et paused spil — to nabosætninger, der modsiger
  hinanden, er præcis den fælde CLAUDE.md navngiver.
- **`ADMIN_OWNED = ['status','joinable']`** (`scripts/seed-payload.mjs`) og
  `seed-payload.test.mjs:70` asserterer listen EKSAKT. Et nyt admin-skrevet
  spil-felt (fx `paused`) er ufarligt, så længe det ikke står i `games.mjs` —
  men i det øjeblik det gør, ruller en seed admins valg tavst tilbage.
  Dispositionér nye spil-felter mod ADMIN_OWNED på skrift.
- **Klik-stier i alarm-tekster skal spores.** Knappen i 🤖 Runde-Botten hedder
  "Post runde-opslag nu" / "🧪 Forhåndsvis runde-opslag" — ikke "Generér nu".
  Og `leagueQuestionRecapNow` har INGEN admin-knap: den bor på
  `LeagueQuestions.jsx` hos LIGA-EJEREN inde i spillet. En alarm i 🩺
  Driftstatus, der beder platform-ejeren køre den, peger på en andens flade.
- **En kollapset alarm (`kampId: null` → ét doc pr. spil+type) mister nøglen,
  når remediet er per-instans.** Fint for rundeBot (recovery vælger runde i
  fladen), forkert for lqBot (recovery kræver liga+spørgsmål). Beskeden skal da
  bære nøglen på den seneste fejl.
- **Kvittering fjerner ikke et alarm-kort** — `kvitterDriftAlarm` sætter kun
  `kvitteretAt`; `loestAt` forbliver null, og `useDriftStatus` viser stadig
  kortet (dæmpet). Alarmer uden en `loesDriftAlarmer`-kalder står for evigt
  (samme som `genaabning`/`kickoff48t` i dag). Etableret mønster, men sig i
  planen, hvad der får kortet til at forsvinde.
- **`runGameTipReminders` er utestet** (kun `upcomingMatches`/`byggTipStatus`
  har dækning i `reminders.test.js`). En udvidelse af dens returkontrakt
  (`fejlede`) kræver et db-fake, der ikke findes endnu — ellers er selve
  tælleren udækket, selv om den rene afbildning er testet. Kaldere er kun to
  (`index.js:883`, `index.js:1077`) plus `GameReminderTab.sendNow()`, som selv
  skal bruge det nye felt, ellers retter man kun den automatiske vej.
- `sent: 0` er OGSÅ det normale "alle har tippet" — teksten må ikke bruge
  samme formulering til "ingen at rykke" og "alle mails fejlede".

## Drift for påmindelser + bots + resultat-synk-knap (f26d8f8): PR 1 af 3 — B1/B2 fra planen bekræftet løst

Begge blokerende plan-fund er rettet og efterprøvet, ikke kun læst:

- **B1 (timeoutSeconds)**: `syncSuperligaResultsNow` fik `timeoutSeconds: 300`,
  `syncGameKickoffsNow` fik `timeoutSeconds: 120` (`functions-platform/index.js`).
  Klientens `callSyncGameResults`/`callSyncGameKickoffs` (`adminActions.js`)
  matcher med 300000/120000 ms. Begge ender tjekket — den latente fejl,
  hukommelsen selv navngav ("serveren dræber kaldet efter 60 s"), er væk for
  BEGGE callables, ikke kun den nye.
- **B2 (alarm→knap-blindgyden)**: strandet-alarmens besked
  (`functions-platform/index.js` ~487) OG `resultatSynk()`s rapport ved
  `updated === 0` (`GameScheduleTab.jsx`) siger nu ordret det samme: knappen
  først, "sæt facit i hånden (admin-guiden → Resultater)" som næste skridt.
  Testet på INDHOLD (`screen.getByText(/sæt facit i hånden/)`), ikke kun på
  at et badge vises.
- **Omdøbningen `kickoffSync.js → spilEvner.js` er komplet** — grep for
  `kickoffSync` i `src/` giver nul træf. Ny `harResultatSynk`-allowlist
  (samme mønster som `harKickoffSynk`: allowlist over IMPLEMENTEREDE
  providere, aldrig `!!sync.provider`) har sin egen spejlings-tripwire mod
  `scripts/games.mjs` i `spilEvner.test.js` — samme mønster som
  `syncProviders.test.js`s games.mjs⇄SYNCED_GAMES-tripwire på serversiden.
- **Ét ikke-blokerende dokumentationsfund**: `docs/admin-guide.md`s nye sætning
  "sent på aftenen hvor sweep'et holder pause" er FAKTUELT FORKERT. Sweep-cron
  (`25 2,13-23`, TZ Europe/Copenhagen) kører hver time HELE aftenen (13:25→
  23:25) — den reelle pause er om natten/formiddagen (23:25→02:25, og navnlig
  02:25→13:25, jf. "Konkrete tal i dette repo"-afsnittet ovenfor i denne fil).
  En eksempel-parentes, ikke en kerneprocedure — men et godt eksempel på at
  "efterprøv med tal, ikke øjemål" gælder ALLE nye docs-sætninger, ikke kun
  dem med et eksplicit tal i.
- DriftTab.jsx's `forventede`-liste for `sweep`-kort bruger stadig rå
  `g.sync?.provider` (truthy), IKKE den nye `harResultatSynk`-allowlist — men
  det er urørt, pre-eksisterende kode i denne commit, og de to sæt er i dag
  identiske (samme to spil). Spørg igen, hvis en tredje provider nogensinde
  seedes uden fuld resultat-synk-implementering: sweep-kortet ville da vises
  for et spil, der reelt ikke sweepes for resultater.

## Drift for påmindelser + pause-nødstop (ef3f549, #47 PR2): implementering mod planens 6 krav + spilfører-tærskel — konkrete fund

Alle 6 nummererede krav fra plan-gennemgangen holder, efterprøvet i koden, ikke
kun læst: (1) `paamindelsesGate.js`/`spilEvner.forventerPaamindelser` er et
ægte spejlet par med matrix-paritetstest (`paamindelsesGate.test.js`, alle
kombinationer + `paused` bekræftet IKKE en del af gaten); GameReminderTab
deaktiverer kun knapperne (`disabled={... || !kanPaamindes}`), Tip-status og
Pulje-status forbliver aktive. (2) `GameScheduleTab.jsx`s "I gang"-hjælpetekst
nævner nu pausen. (3) `GameReminderTab`s 09.00-tekst er et `paused ? … : …`
skifte, ordret testet på INDHOLD i `reminders.test.js`
(`not.toContain('Sendte')` osv.). (4)+(5) `paamindelsesLinje()` (ren funktion,
`reminders.js`) returnerer `fejlede` og har EGEN ordlyd for "sent:0 = alle har
tippet" vs. "delvist/totalt nedbrud" — begge grene mutationssikret med
eksplicitte `not.toContain`-assertions. (6) `paused` er disponeret i
`seed-payload.mjs`s kommentar mod `ADMIN_OWNED` (feltet er bevidst IKKE i
`games.mjs`, så ingen konflikt i dag). Spilførerens tærskel (rødt kort ved
pause + kampe inden for de næste 24 timer) bruger SAMME `upcomingMatches`
+ `DAY_MS`-vindue som selve påmindelses-jobbet — ikke en ny, uafhængig
tærskel — og server-håndhævelsen af `paused`-skrivning er den EKSISTERENDE
`allow create, update: if isGlobalAdmin()` på `games/{gameId}` (ingen
rules-ændring nødvendig), nu eksplicit testet i `functions/rules.test.js`
("global admin KAN sætte paused" / "spiller kan IKKE").

- **En ny admin-kontrol kan lande med server- og gate-tests i topklasse, men
  NUL UI-tests.** `GameReminderTab.test.jsx` er UÆNDRET (stadig 4 tests,
  ingen af dem rører `paused`, pause-knappen, badge'en, den betingede
  hjælpetekst eller den disablede knap-tilstand). Al den nye 78-linjers UI
  (`kanPaamindes`/`paused`-betinget rendering) er læst og bekræftet KORREKT
  ved manuel kodelæsning, men intet automatisk tjek ville fange et ombyttet
  `!kanPaamindes` → `kanPaamindes`, en forkert prop, eller at hjælpeteksten
  aldrig skifter. Spørg specifikt om dette FILNAVN, når Test Manager
  mutationstester — server-siden (reminders.js/paamindelsesGate.js) er solidt
  dækket; klient-komponentens WIRING er det ikke.
- **`doc.tal` går tabt for 'advarsel'/'fejl'-niveauer.** `driftlog.js`s
  `statusSamler().advarsel(besked)`/`.fejl(besked)` tager kun ÉT argument —
  `index.js`s `st[linje.niveau](linje.besked, linje.tal)` sender `tal` med,
  men det bliver stille droppet, når niveauet er advarsel/fejl (kun `.ok()`
  merger `tal` ind i `s.tal`). Harmløst i dag: `DriftTab.jsx` læser aldrig
  `doc.tal` — alle tal står allerede inline i `besked`-strengen. Værd at rette
  for konsistens, hvis `tal` nogensinde bruges strukturelt (fx et fremtidigt
  tal-baseret filter/sortering på Driftstatus-fanen).
- **Dokumentations-drift, konkret og i den PRÆCISE scenarie funktionen findes
  for.** `docs/admin-guide.md`s status-tabel (linje ~67, "I gang | ... Påmindelser
  sendes.") blev IKKE opdateret, selvom kode-pendanten
  (`GameScheduleTab.jsx` STATUS_HELP) fik pausens forbehold tilføjet i samme
  commit — direkte spejlet-fil-brud. Hele "Påmindelser (platformen)"-afsnittet
  (linje 111-127) nævner slet ikke den nye ⏸/▶-knap. Og `docs/drift.md`s
  fejlfindingstabel "Hvis noget ser tomt ud" (linje 264, "Ingen påmindelser
  sendt | Kampene ligger i en runde før startRound, eller SMTP_PASSWORD
  mangler") nævner ikke `paused` som årsag — den manglende linje er netop i
  den tabel, en admin ville slå op i, når en glemt pause er PRÆCIS problemet,
  hele PR'en blev bygget for at gøre synligt. Ikke blokerende for landing
  (ren dokumentation, ingen kodeafhængighed), men bør rettes i samme PR eller
  en hurtig opfølger — spørg specifikt efter disse tre steder ved en
  eventuel opfølgende dokumentations-commit.

## Drift for påmindelser (dc1e7af, #47 rolle-fund): alle tre forbehold lukket

Alle tre punkter fra forrige "land med forbehold" er efterprøvet lukket, ikke
kun læst: `GameReminderTab.test.jsx` fik 10 nye tests (pause-badge begge veje,
fejlvisning, hjælpetekst INDHOLD med `not.toContain`, gate mod jobbet, Send
nu-rapportens to udfald hver med egen ordlyd); `docs/admin-guide.md` +
`docs/drift.md` fik pausen ind i status-tabellen, et helt nyt "⏸ Sæt
påmindelser på pause"-afsnit, og fejlsøgningsrækken "Ingen påmindelser sendt";
`statusSamler().advarsel(besked, tal)`/`.fejl(besked, tal)` tager nu `tal`.
Samme commit rettede desuden en PL-live-påstand i `drift.md` fra "hele
sæson-listen bar præcis FirstHalf/SecondHalf/FullTime" til præcist "SecondHalf
set på KAMP-niveau, FirstHalf STADIG kun på hændelses-niveau" — god skabelon
for "efterprøv en påstand mod PRÆCIS hvad beviset dækker, ikke mere".

## Live-puls-alarm (5e51155, #47): kraeverKvittering kolliderer med auto-luk — BLOKERENDE

Ny alarm (`skalMeldeLiveTavs` i `superligaSync.js`, kaldt fra
`syncSuperligaResults` i `index.js`) skal fange "live-pulsen står stille, mens
kampe er i vinduet" — den fejl, hvor et 20-minutters udfald tidligere
forsvandt sporløst, fordi minut-kortet overskrives. To konkrete,
sammenhængende fund, begge bekræftet i koden (ikke antaget):

- **`kraeverKvittering: true` + selv-lukning er en NY, uprøvet kombination —
  og den TABER kvitteringen, ikke vinder den.** Alle andre `kraeverKvittering:
  true`-alarmer i `index.js` (`genaabning`, `kickoff48t`,
  `puljeLockGenaabning`) lukkes ALDRIG automatisk — kun `kvitterDriftAlarm`.
  Alarmer der selv-lukker (`strandet`, `mangler`) kræver omvendt ALDRIG
  kvittering. `livetavs` er den FØRSTE, der gør begge dele: næste tick, hvor
  pulsen igen skrives (dvs. praktisk talt NÆSTE MINUT, ethvert normalt minut
  under en kamp), kalder index.js `loesDriftAlarmer(..., { type: 'livetavs',
  aktuelleKampIds: [] })` ubetinget. Både `useDriftStatus.js` (linje ~36+63)
  OG `useDriftAlarmCount` filtrerer PÅ `where('loestAt', '==', null')` — så et
  auto-lukket kort forsvinder fra BÅDE Driftstatus-listen og ⚠-badget i
  navigationen, UANSET `kvitteretAt`. Der findes ingen historik-visning i
  klienten (`useDriftStatus.js`s egen kommentar: "lukkede er historie, og
  historik bor i functions-loggen" — som ejeren "ALDRIG skal lære at åbne",
  jf. `driftlog.js`s modul-kommentar). Konsekvens: et udfald, der selv-heler
  FØR ejeren tilfældigvis kigger på Driftstatus (dvs. de fleste transiente
  udfald, inklusive netop det 20-minutters-udfald, PR'en er bygget for), bliver
  ALDRIG set og ALDRIG kvitteret — nøjagtig samme "kan ikke efterprøves
  bagefter"-fejl som featuren skal løse, blot flyttet fra minut-kortet til
  alarm-kortet. Commit-beskeden selv siger begge ting i forlængelse af
  hinanden ("en alarm, der består, til den kvitteres" / "Alarmen lukker sig
  selv, når pulsen slår igen") uden at se modsætningen. **Rettelsen er enten:
  drop `kraeverKvittering` for denne type (den er så reelt kun `advarsel`-agtig
  med `loesDriftAlarmer` som den etablerede model), ELLER drop auto-lukningen
  og lad den blive stående til kvittering som sine `kraeverKvittering`-søskende
  — men aldrig begge dele på én gang.**
- **`skalMeldeLiveTavs` har NUL grace for "pulsen har aldrig (for nylig) været
  frisk" — og det er langt den ALMINDELIGE sti, ikke en sjælden fejltilstand.**
  `if (!Number.isFinite(pulsAtMs)) return true` OG (i praksis oftere)
  `nowMs - pulsAtMs > LIVE_STALE_MS` når `pulsAtMs` er dage gammel (sidste
  kampdag) fyrer med ÉT tick, mens den "var-frisk-for-nylig"-vejen har en
  5-minutters buffer. `liveHeartbeatAt` sidder på SPIL-dokumentet (ikke pr.
  kamp), så feltet er så godt som ALTID "finite men gammelt" mellem
  kampdage — den reneste alarmerings-vej er derfor den FØRSTE kamp, der
  sparker i gang i en ny runde: `pendingMatches` gør `pending>0` fra selve
  kickoff-minuttet (`kickoff <= now`, intet slæk), mens kildens `hentLive`
  kun returnerer events for kampe kilden SELV allerede regner for
  'inprogress' — et gab på (mindst) den tid, det tager kilden at flippe
  status efter den faktiske fløjt. I det gab: `pending>0`, `pulsSkrevet:
  false`, `pulsAtMs` ugammelt → alarm på FØRSTE tick, ingen grace.
  **Bevist forkert symptombeskrivelse i netop dette gab:** alarmteksten
  påstår "spillerne ser 'OPDATERING AFBRUDT'" — men klientens `liveScore()`
  (`footballRounds.js:177-210`) returnerer `null`, indtil `match.live`
  overhovedet er skrevet FØRSTE gang, og `FootballTip.jsx:551-552` viser i
  det tilfælde badget **"Låst"**, ikke "Opdatering afbrudt" (det kræver
  `live` sat OG `forældet`). Alarmen kan altså fyre, mens spillerne ser en
  helt normal "Låst"-kamp uden noget som helst der ligner et problem — det
  modsatte af hvad alarmteksten hævder. Spørg NÆSTE gang en server-alarm
  citerer, hvad brugeren ser: findes der en render-betingelse, der beviser
  præcis DEN tilstand, eller er det en antagelse om hvornår symptomet
  indtræder?
- **Ikke-blokerende doc-overclaim, samme rod som ovenstående:** kommentaren
  ved læsningen i `index.js` ("et normalt minut koster derfor ingen ekstra
  læsning") dækker kun opslaget på `games/{id}` (korrekt: sker kun i den
  mistænkelige gren). Den nævner ikke, at `loesDriftAlarmer`s egen QUERY
  (`driftAlarmer`, 3 betingelser) køres UBETINGET i else-grenen — dvs. hvert
  ENESTE tick, en kamp er bekræftet live (`pulsSkrevet: true`), som er
  langt de FLESTE minutter under en kamp, ikke kun "den mistænkelige gren".
  Samme mønster (ubetinget `loesDriftAlarmer`-query) findes allerede i
  sweep'et for `strandet`, men KUN én gang i timen — her er det op til
  ~90-120 gange PR KAMP. Sandsynligvis billigt i absolutte tal, men
  kommentaren er unøjagtig om HVOR grænsen for "ingen ekstra læsning" går.
- **Pure-funktionen selv (`skalMeldeLiveTavs`) er velskrevet og
  mutationstestet på sin EGEN specifikation** (båndet 4:59/5:01, alle
  NaN/null/undefined-varianter, paritetstest mod klientens `LIVE_STALE_MS`).
  Fundene ovenfor er ikke i den rene funktions logik — de er i hvad
  specifikationen selv antager om, hvornår "aldrig/for længe siden frisk"
  reelt indtræffer, og i hvordan resultatet bruges i `index.js`.

## Live-puls-alarm — opfølgning (e230775): begge blokerende fund korrekt rettet

Efterprøvet i egen worktree mod `e230775` (ikke kun læst): `superligaSync.test.js`
130/130 grønne, ingen anden `loesDriftAlarmer('livetavs', …)` tilbage noget sted
(`grep` bekræftet, kun ét `livetavs`-sted i `index.js`: selve `meldAlarm`-kaldet).

- **Auto-luk væk, ingen anden vej ud.** Hele `else if (out.live &&
  out.live.pulsSkrevet) { loesDriftAlarmer(...) }`-grenen er slettet — ikke
  gjort betinget. `livetavs` følger nu PRÆCIS samme mønster som
  `genaabning`/`kickoff48t` (kræver kvittering, ingen selv-luk). Bekræftet:
  ingen anden funktion i `functions-platform/` kalder `loesDriftAlarmer` med
  `type: 'livetavs'`.
- **Kickoff-gabet lukket rigtigt, ikke bare flyttet.** `tidligsteKickoffMs`
  (min af venters kickoff-tider) bæres nu med ud af `runScheduledSync` og
  bruges som EGEN grace (`nowMs - tidligsteKickoffMs <= LIVE_STALE_MS →
  false`), FØR pulsAtMs-tjekket. `Math.min(...[])`-kanten (alle kickoffs
  ulæselige) giver `Infinity` — eksplicit dækket af egen test
  (`tidligsteKickoffMs: Infinity` → false). At bruge MIN (ikke seneste/første
  fundne) er korrekt: en ægte overtids-kamp i samme vindue som en lige
  kickoffet kamp maskerer ikke hinanden, fordi den TIDLIGSTE afgør slækket —
  efterprøvet manuelt, ikke kun antaget.
- **Symptom-teksten (`liveTavsSymptom`) er sand mod `liveScore()`/
  `FootballTip.jsx` i begge sine grene** — bekræftet ved læsning af begge
  filer, ikke kun af testen. Én resterende, IKKE-blokerende unøjagtighed:
  symptomet er PR SPIL, ikke pr. kamp, og bruges til at beskrive ALLE
  `out.pending`-kampe med ét ord. Ved to samtidige pending-kampe i forskellig
  tilstand (én frosset efter tidligere live, én der aldrig kom i gang) kan
  teksten vælge 'frosset' (fordi `pulsAtMs` stammer fra den ANDEN kamps
  tidligere puls) og dermed beskrive en kamp forkert, der reelt står "Låst".
  Smalt vindue (kræver netop den kombination), ikke fundet blokerende — men
  værd at nævne, hvis nogen udvider alarmen til at navngive den enkelte kamp.
- **Punkt (d) er ikke bare afbødet, men bortfaldet:** hele forespørgslen
  `loesDriftAlarmer` lavede hvert tick under en sund, kørende kamp er væk med
  grenen. Ingen ekstra Firestore-operation i noget normalt minut længere —
  kommentaren i `index.js` er nu korrekt, ikke kun mere korrekt.
- **Docs præcise i begge filer:** `admin-guide.md` og `drift.md` siger nu
  eksplicit at alarmen "bliver stående, til du kvitterer — også når udfaldet
  for længst er ovre", og `drift.md` nævner fem-minutters-slækket fra kickoff.
  Ingen rest af den gamle "lukker sig selv"-antagelse nogen steder (grep).

Konklusion: ingen nye blokerende fund. Landbar.

## Chancen-vagten (PR1 af 3, fdcf465): server-kerne, INERT — konkret fund

- **`erKampLaast` bunker tre semantisk FORSKELLIGE `live.status`-tilstande
  under ét `'afbrudt'`.** `syncProviders.js` mapper interrupted/abandoned/
  postponed til samme streng. Koden FRIGIVER Chancen på alle tre, med
  begrundelsen "en udsat kamp blev aldrig spillet". Det er sandt for
  `postponed`, men IKKE for `interrupted`/`abandoned`: de har allerede rullet
  (comment i `syncProviders.js:82` — "en afbrudt kamp har stadig statusType
  'inprogress'"), og `hentLive` skriver den VIRKELIGE live-stilling
  (`live.home/away`) på kampen, mens den er afbrudt. `harFacit()` tjekker kun
  `result`/`homeGoals`/`awayGoals` — ikke `live.home/away` — så en kamp
  afbrudt ved fx 3-0 efter 70 min tæller som "intet facit" og FRIGIVER
  chancen, mens stillingen 3-0 allerede er synlig på kortet (`FootballTip.jsx`
  viser live-pillen). En spiller med ⚡ på den tabende side kan altså flytte
  chancen til en kamp, der endnu ikke er sparket i gang, MED facit i hånden —
  præcis den asymmetri, filens egen kommentar advarer imod for "en kamp der
  ruller". Testen (`chanceVagt.test.js:151-158`) dokumenterer bevidst kun
  "FRIGIVER en udsat kamp" — ingen test for interrupted-med-synlig-stilling
  eller for at kampen senere GENOPTAGES (skifter status tilbage til fx
  'anden' og låser igen — hvilket virker korrekt, men kun blev efterprøvet
  ved gennemlæsning, ikke af en test). Rejst som konkret, ikke-blokerende fund
  (PR1 er inert; ingen produktion rammes endnu) — bør besvares FØR PR2
  forbinder klienten, fordi det er billigst at rette nu.
- **Fuld optælling af `chanceStake`-flader lykkedes med grep + læsning, ingen
  proxy-gate fundet.** Kun ÉN klient-skriver (`betActions.js:setBet`, kaldt
  fra `FootballTip.jsx` to gange pr. flyt: nulstil gammel, sæt ny — det ER
  mekanismen bag det oprindelige hul). Alle andre forbrugere
  (`tipsHistory.js`, `TipsHistorik.jsx`, `LeagueBets.jsx`, `gameRecap.js`,
  `ligaPoint.js`, `gameScoring.js`-detalje-snapshot) er REN LÆSNING uden egen
  dedup-logik — de vil automatisk vise korrekt data, når skrivestien lukkes i
  PR2/PR3. `superligaScoring.scoreBet` afregner PR KAMP uden kendskab til
  runde-dedup (med vilje, jf. filens egen kommentar) — det er netop DERFOR
  server-vagten skal sidde ved SKRIVNINGEN, ikke ved afregningen.
- **`firestore.rules` begrænser IKKE hvilke felter et bet-dokument må have.**
  `bets`-reglen (linje 843-908) validerer kun `uid`/`matchId`/`points`/
  `leagueIds` — en klient kan i dag frit skrive `chanceSatAt`/
  `chanceFlytninger` med vilkårlige værdier. Lavt akut risiko nu (intet læser
  felterne endnu — de er "foder til Runde-Botten, ingen ny UI"), men PR3's
  beskrevne scope ("lukker døren for klientens skrivning af chanceStake")
  nævner ikke de to nye felter — spørg eksplicit ved PR3, om de også skal
  låses, ellers kan en klient forfalske revisionssporet (chanceFlytninger),
  selv efter chanceStake er låst.
- **To nye felter uden forbruger er begrundede, ikke en påstand:** de erstatter
  `audit-double-chance.mjs`s eksplicitte gæt på rækkefølge via `updatedAt`
  (scriptets egen kommentar hedder "ÆRLIGT FORBEHOLD OM TIDSSTEMPLET"). Men
  scriptet er IKKE opdateret til at bruge `chanceSatAt` i denne PR — ingen af
  de tre beskrevne PR'er nævner det heller. Værd at spørge, hvornår det sker.
- Mønster genkendt fra tidligere: en ny server-kerne, der er RENT ADDITIV og
  INERT (ingen klient kalder den), tilføjer ingen ny risiko ved deploy, FORDI
  den nye vej er strengere end den gamle, ikke løsere — men selve callable'en
  ER live og kaldbar af enhver godkendt bruger, så "inert" gælder kun
  "ubrugt af UI", ikke "ikke deployeret/ikke eksponeret".

## Indbyrdes opgør (dc6d629): implementering mod plan — konkrete fund

- **Én genuin sprogfejl, upåagtet af nogen test:** `Indbyrdes.jsx:138-140`s
  "Uden for opgøret"-sætning har KUN ét verbal ("tippede") og deler det med
  BEGGE halvdele: `{kunMig} kamp(e) tippede kun du, {kunDem} kun {dueNavn}.`
  Anden halvdel mangler "kamp(e) tippede" helt — for `kunDem>0` renderes
  fx "0 kampe tippede kun du, 2 kun Morten." (grammatisk ufuldstændig,
  verificeret direkte: `node -e` gav præcis den streng). INGEN test i
  `Indbyrdes.test.jsx` sætter `kunDem>0` i UI-laget — testen på linje ~116-125
  ("nævner kampe, kun den ene tippede") bruger en fixture, hvor kun `kunMig`
  bliver positiv (`deres` tipper alt det `mine` også tipper). `h2h.test.js`
  tester `kunDem` på RENFUNKTIONS-niveau, aldrig i renderingen. Generel lære,
  samme klasse som CLAUDE.md's "en test der kun tjekker at noget blev VIST":
  en test, der dækker den ene af to symmetriske grene ("kun du" / "kun ham"),
  beviser intet om den anden — symmetriske sætninger skal testes symmetrisk.
- **Tre kommentarer (ikke koden) kalder gaten "ligaens startrunde", men den
  ER spillets.** `h2h.js:36-38`, `Indbyrdes.jsx:43-44`, `SpillerDetalje.jsx:
  80-81` siger alle "gate't til ligaens startrunde" — men `rounds` bygges i
  `SpillerDetalje.jsx:30-32` af `startRundeFor(game, matches)`
  (`src/lib/startGate.js:104-107`), som ALDRIG kender til nogen liga: den
  bruger kun `game.startRound`/`game.startAt`, uafhængigt af hvilken liga der
  er valgt i `GameStandings`-filteret. "Ligaens startrunde" er et RIGTIGT,
  ANDET begreb i samme fil (`valgt.startRound` i `GameStandings.jsx:279`,
  brugt af `ligaRanking`) — så ordvalget er ikke en unøjagtighed uden
  modpart, det navngiver en konkurrerende, eksisterende ting forkert.
  Funktionelt harmløst (opgøret er internt konsistent med, at panelet i
  forvejen viser spil-skala data — `spilTotal`-override i
  `GameStandings.jsx:452`), men ret ordlyden til "spillets startrunde" i alle
  tre kommentarer, før nogen bygger videre på den forkerte antagelse.
- **Synlighed korrekt genbekræftet, ikke kun antaget:** premissen "kun
  afgjorte-og-begyndte kampe" i `players/{uid}/detalje/opdeling` er
  efterprøvet i selve kilden (`functions-platform/pointOpdeling.js:182-210`s
  `taeller`/`maaVises`, `gameScoring.js:301-309`s `kampe`-bygning), ikke kun
  troet på kommentaren i `firestore.rules:765-768`. `Indbyrdes` er nået via
  `aabenRow = standings.find(...)` (`GameStandings.jsx:298`), og `standings`
  kommer fra `useVisibleGameStandings` (liga-kammerater + selv) — samme
  kreds som selve `detalje`-læsereglen. Ingen ny eksponering: et opgør er
  allerede udledeligt manuelt af en liga-kammerat via kamp-for-kamp-visning
  efter kickoff (samme mønster som chance-eksponeringen i Runde-Botten,
  a889bb1) — h2h samler kun, viser intet nyt.
- **"Bot-linje i stedet for stående tavle" (Spilførers indvending) er et
  ægte svar, ikke kun retorik.** Verificeret konkret: panelet kræver TO
  bevidste klik (navn i Stilling → ⚔️-knap, `aaben` default `false`,
  `Indbyrdes.jsx:47`), og data hentes først ved anden klik
  (`useSpillerOpdeling(aaben ? game?.id : null, ...)`, linje 50-51) — modsat
  en ambient synlig tavle, ingen automatisk post, intet der viser sig for
  taberen uden en aktiv beslutning fra en anden om at kigge. Ingen bot,
  ingen notifikation, ingen `onDocumentCreated`-trigger involveret.
- **"Din sæson i tal" korrekt droppet — bekræftet, ikke kun læst i commit-
  teksten:** træfprocent findes allerede i `TipsHistorik.jsx:119`
  (`{fmtDec(totals.hitRate)}%`), chance-netto i `PointOpdeling.jsx:28,114`
  (rubrikken `chance`), begge allerede rendered inde i SAMME
  `SpillerDetalje`-panel (`TipsHistorik`-kald linje 57-77, der videresender
  `opdeling`). At bygge "Din sæson i tal" oveni ville have været en ægte
  ny sandhed om samme data — droppet med rette.
- **Dokumentations-hul, ikke blokerende:** `FootballHelp.jsx:87-90` beskriver
  allerede "klik på et navn i 🏆 Stilling og se den spillers tip på ALLE
  afgjorte kampe" — men nævner intet om den nye ⚔️ "Jer to imellem"-linje
  under panelet. Ikke forkert (loves intet, koden ikke giver), men samme
  mønster som Chancen/liga-spørgsmåls-hullerne: første gang en spiller folder
  opgøret ud, er der ingen hjælpetekst der forklarer det. `docs/` (admin-
  guide.md, drift.md) kræver intet — ren klientfunktion, ingen ny
  server-/admin-flade.
- **Tomme tilstande gennemgået, alle testdækkede undtagen én kombination:**
  ny spiller/spil uden afgjorte kampe (`afgjorteSammen===0` →
  "I har endnu ikke tippet nogen af de samme afgjorte kampe."), aldrig
  uenige (`uenige.length===0 && afgjorteSammen>0` → "tippet ens hver gang"),
  aldrig mødtes vs. altid enige er eksplicit adskilt og testet
  (`Indbyrdes.test.jsx:97-114`). IKKE testet i UI: `afgjorteSammen===0` MEN
  `kunMig>0 || kunDem>0` samtidig (to spillere, der aldrig har tippet den
  samme afgjorte kamp) — logisk konsistent ved gennemlæsning, men ingen
  rendering-test viser hovedlinje + "Uden for opgøret" sammen i den tilstand.

## Tre pokaler (4c20a14, PR #173): "Modigst i minus" kan vise en POSITIV værdi — BLOKERENDE

Efterprøvet mod plan-gennemgangens tre krav: alle tre er fulgt, ikke kun i
ordlyd. `Pokaler.jsx` bruger kort (`<div className="card">`), ikke kolonner
(`GameStandings`s stillingsliste er en bar `<table>` uden `.table-wrap`,
bekræftet). Rundekongen viser KUN en topvisning (`konge`), ingen rangliste.
Skalaen ("hele sæsonen" / "fra runde N") står i selve titel-linjen
(`Pokaler.jsx:47-51`), ikke i en fodnote — testdækket begge veje
(`Pokaler.test.jsx`, "SKRIVER 'hele sæsonen'" / "skriver det IKKE"). Mobil
verificeret ved læsning: `flex: '1 1 14rem'` + `flexWrap: 'wrap'` +
`minWidth: 0` på to kort (à 224px) stables korrekt under ~460px bred skærm,
ingen `.card`-CSS-konflikt (theme.css:100-106 har intet `width`).

- **BLOKERENDE, bevist ved rendering (ikke kun læsning):** `chance.vaerst`
  (`Pokaler.jsx:83-90`) er blot `sorteret[sorteret.length - 1]` — den eneste
  vagt før "Modigst i minus" vises er `chance.vaerst.uid !== chance.bedst.uid`
  (linje 120), ALDRIG at værdien faktisk er negativ. Med to spillere, der
  BEGGE har brugt Chancen med positivt resultat (fx Anne +12,5, Bo +3 — ingen
  har nogensinde tabt på Chancen, meget almindeligt tidligt på sæsonen eller i
  en lille liga), renderer koden bogstaveligt "Modigst i minus: Bo +3" —
  fortegnet er korrekt (`fmtSignedPoints` giver "+3"), men PÅSTANDEN er falsk:
  Bo står IKKE i minus. Gengivet med `render()` + `screen.debug()`, ikke kun
  simuleret. `Pokaler.test.jsx`s eneste test af sektionen
  ("viser bedst og modigst-i-minus med fortegn") sætter altid en reel negativ
  værdi (-31,5) og fanger derfor ikke dette. `FootballHelp.jsx:280` ("hvem er
  dybest i minus?") arver samme fejlantagelse. **Rettelsen er én vagt:**
  skjul/omdøb linjen når `chance.vaerst.v >= 0` (fx "Mindst i plus" eller slet
  ingen anden linje, når INGEN har tabt på Chancen) — samme mønster som
  Rundekongens `flest > 0`-krav, som IKKE har denne fejl. Spørg NÆSTE gang en
  "bedst/værst"-visning bruger et ord med indbygget fortegn ("i minus",
  "underskud", "tabte") om det ord er en PÅSTAND om dataen eller kun en
  ETIKET — kun det første kræver en eksplicit vagt.
- **Rundekongen HAR den vagt, Chance-kongen mangler:** `konge`
  (`Pokaler.jsx:71-79`) kræver eksplicit `flest > 0`, og "(delt)" håndterer
  uafgjort korrekt og testet. Samme fil, samme forfatter, to ensartede
  "kår en vinder blandt lige"-opgaver — den ene fik en fuld vagt, den anden
  ingen. Værd at spørge specifikt om symmetri næste gang to "topspiller"-kort
  lander i samme commit.
- **Flytning af `rundeSejre.js` UD af spejlet `src/lib/ligaPoint.js`
  (begrundelse: "serveren har ingen brug for rundesejre") holder for I DAG,
  men er skrøbelig, IKKE forkert:** `functions-platform/gameRecap.js`
  ("Runde-Botten") har ALLEREDE sin egen, uafhængige implementering af
  PRÆCIS samme regel — `roundWinners = rows.filter((r) => r.roundPoints ===
  best && best > 0)` (gameRecap.js:187, "standout"/"standoutTie" for ÉN
  runde) — bare for én runde ad gangen, ikke akkumuleret over sæsonen. Regnes
  Runde-Botten nogensinde ud til at nævne SÆSONENS rundekonge (fx "Anne
  udvidede sin føring til 4 rundesejre"), vil nogen enten genopfinde
  `rundeSejre`s løkke en TREDJE gang i functions-platform (uspejlet), eller
  først da flytte den ind i den spejlede lib — begge dyrere end at vide det nu.
  Ikke blokerende (ingen kode i dag kræver det), men spørg eksplicit ved en
  fremtidig Runde-Bot-udvidelse, der nævner Rundekongen: "flyt logikken til
  det spejlede lib FØR den kodes i functions-platform, ikke efter."
- **"Tre definitioner af runde færdig" — den tredje er dødt, uforbundet
  facit-felt, ikke en aktiv konkurrent:** `src/lib/pointOpdeling.js`s
  `buildRoundContext` har ALLEREDE `rounds[round].count`/`.settledCount`
  (linje 175-188) — "alle rundens kampe har facit", PRÆCIS samme begreb som
  `rundeSejre.js`s nye `faerdigeRunder`. Modulets EGEN kommentar (linje
  137-140) advarer eksplicit imod "en TREDJE rundetælling i appen — og
  modulet blev netop lavet for at fjerne den anden". `count`/`settledCount`
  bruges dog IKKE af nogen UI i dag (kun i tests) — så `faerdigeRunder` er
  reelt en uafhængig geninopfindelse af et begreb, modulet allerede
  producerer, men ingen bruger. Forskel i implementering: `settledCount`
  bruger `matchOutcome(m)` (facit ELLER udledt af homeGoals/awayGoals — se
  `outcomeFromScore`), mens `faerdigeRunder` kun tjekker `m.result != null &&
  m.result !== ''` — INGEN score-fallback. Harmløst i dag, fordi
  `superligaSync.js:174-192` altid skriver `result` og `homeGoals/awayGoals`
  i samme batch (`if (!result) continue`), så et facit uden `result`-felt
  ikke forekommer i produktion — men det er en antagelse om skrivestien, ikke
  en garanti i typen. `tipsHistory.js:120`s `roundSettled` (kupon-vindue,
  `combiSettled === combiCount`) er derimod tydeligt adskilt — intet sted i
  koden forveksler de to, og ingen kommentar refererer den anden ved navn i
  nogen retning. Ikke blokerende, men værd at nævne, hvis nogen bygger en
  fjerde "er runden færdig"-funktion: brug `buildRoundContext`, gen-opfind
  den ikke.
- **Ingen ny data-eksponering:** `rows` til `Pokaler` er allerede
  `standings` (liga-filtreret af `ligaRanking`/`subsetRanking`, samme kreds
  som `OpdelingsTabel` viser). Chance-kongen og opdelings-tabellen er samme
  kilde (`opdeling.chance`), ikke to sandheder — kortet er en opsummering,
  ikke en konkurrerende beregning. `GameStandings.test.jsx`s
  "Chancen"→"Combi"-rettelse er reelt korrekt: "Combi" findes KUN i
  `PointOpdeling.jsx`s RUBRIKKER-navn, aldrig i Pokaler eller andetsteds i
  GameStandings, og `OpdelingsTabel` renderes slet ikke, når `visOpdeling`
  er false (linje 424-454) — testen måler præcis det, den påstår.
- **FootballHelp.jsx:274-289** (Rundekongen/Chance-kongen/Jer to imellem) er
  faktuelt korrekte mod koden, bortset fra at arve "modigst i minus"-fejlen
  ovenfor. Lukker desuden et tidligere fundet, IKKE-blokerende hul (⚔️ "Jer
  to imellem" manglede i hjælpen efter Indbyrdes-opgør-commit dc6d629).

## Trøjefarver i prod (plan B, aug. 2026): `games/{id}.teams` er ikke kosmetik

- **`games/{id}.teams` bærer POINT, ikke kun farver.** To kæder, begge målt i
  koden: (1) `teams[].elo` er SEED for `recomputeSeasonElo`
  (`functions-platform/gameScoring.js:102`) → `eloHistory`, `eloCurrent` OG
  ny prissætning af alle ulåste kampes odds (samme fil, l. 162-187); den er
  altså langt mere end "Start"-kolonnen i `eloHistory.js:16`. (2)
  `teams.length` → `kampePrRunde` → `expectedPlayed` → om den OFFICIELLE
  tabel godtages ved pulje-afregning (`gameScoring.js:422-436`). Et script,
  der "kun skriver teams", rører derfor point. Vagten skal være en HÅRD
  afvisning under `--skriv` ved ændret `elo` eller tilføjet/forsvundet hold —
  en udskrift i en diff er ikke en vagt.
- **`eloCurrent` har INGEN læser** (grep i hele repoet: kun skrivere —
  `seed-football.mjs:261`, `gameScoring.js:143` — plus docs). Elo-tabellen
  bygger på `teams[].elo` + `eloHistory`. Advarsler om "rør ikke eloCurrent"
  peger altså på det ufarlige felt; faren er `teams[].elo`.
- **`teams`-ARRAYETS RÆKKEFØLGE er brugersynlig:** `PuljeTip.jsx:149`
  (`teams.map`) tegner pulje-gitteret i array-orden. Alle andre flader sorterer
  selv. En diff, der matcher hold på navn, er blind for en omrokering.
- **Ét symptom, flere datatilstande.** "Randers stod i marine" er forenelig med
  BÅDE (a) `thirdColor` mangler → `badgeFor` falder tilbage til `awayColor`
  #33384F, og `matchBadges` sammenligner en værdi med sig selv, OG (b)
  `thirdColor` = den gamle, målt-væk værdi #003C7E (afstand 130,3 > ude 95,3 →
  vinder og ER marineblå). En reproduktion, der viser at en mekanisme KAN give
  symptomet, beviser ikke, at prod er i den tilstand. Kræv den diskriminerende
  observation, ikke bekræftelsen.
- **Hurtigste prod-aflæsning af `teams`: Admin → 🎨 Hold-farver.**
  `TeamStylesTab.jsx:34,61-66` læser `game.teams` levende og viser hver farve
  som hex pr. hold. Bedre end en swatch-flade, når spørgsmålet er "hvad står
  der egentlig i prod".
- **Samme fane er også en fix-vej uden deploy** (skriv hex → Gem → `teamStyles`
  vinder i `badgeFor`), men den kan KUN farver — `troejer` (mønster/sekundær/
  ærme) findes ikke i admin, og en override skygger permanent for datafilen.
- **`TroejeOversigt` er en indbygget prod-alarm, ingen har læst.** Mangler
  `thirdColor` for alle, giver `ubrugteTredjetroejer` (TroejeOversigt.jsx:89-99)
  "3. trøje · bruges aldrig" på SAMTLIGE hold, og `findEksempel` returnerer
  null, så "Fx X–Y"-sætningen forsvinder. Testen `markerer ingen i Superligaen`
  (TroejeOversigt.test.jsx:238) er grøn, fordi den kører på REPOETS liste —
  klassisk repo-vs-prod-paritetshul, som ingen frontend-test kan lukke.
- **Rækkevidde, målt:** med repoets lister ændrer `thirdColor` udetrøjen i
  **35 af 132** ordnede SL-par og **67 af 380** i PL, og FC Midtjyllands
  side-tema skifter fra app-grøn til #E4002B (`klubAccentAf` går hjemme→ude→
  tredje). "Kun kampkortet" undervurderer altid: `useSpilTema.js:61`,
  `useKlubFarver.js:50`, `GameProfile.jsx` (inkl. teksten "Ingen af … tre
  trøjer har kulør nok"), `TroejeOversigt`, `FootballTable`, `EloTable`,
  `PuljeTip`, `MyTips`, `SpillerDetalje`, `Avatar`.
- **`src/lib/seedFootball.js` ER en spejlet fil** (`functions-platform/
  seedFootball.js`, paritetstest i begge `seedFootball.test.js`). Nye flag i
  `KENDTE_FLAG` og nye eksporter skal vurderes mod spejlet.
- **`.github/workflows/deploy-platform.yml` `seedSuperliga` skriver `teams`
  ubetinget med hardkodet `--skriv` (l. 150-167) og har INGEN tør-kørsels-
  input** — modsat `seedKickoffs`, der har `seedKickoffsSkriv`. Vejen findes
  altså allerede; det er forhåndsvisningen, der mangler.
