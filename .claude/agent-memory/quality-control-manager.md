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
