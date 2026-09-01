# Quality Control — varig hukommelse

Kun MØNSTRE. Et afsnit navngivet efter en commit hører i PR-teksten.
(Destilleret 1/9-2026: 38 KB / 6 sag-afsnit → mønstre. Anden destillering.)

## Plan-gennemgange: de dyre fund er designfejl, ikke kodefejl

- **Modsiger tallet noget lige ved siden af?** Et kampkort viste "hvem er
  stærkest" af ren ratingforskel, mens odds lægger 60 point hjemmebanefordel
  oveni — pilen modsagde 1X2-knapperne under sig.
- **Lover teksten mere end handlingen giver?** "Åbn ligaen →" landede på en
  liste over ALLE ligaer, foldet sammen.
- **Et NYT tal, der duplikerer et tal fladen allerede viser fra en ANDEN
  kilde, er en modsigelse med forsinkelse.** Konkret: livescores `stadion`
  (`info.Vnm`) mod `h.venue` fra `games/{id}.teams[].venue`, som kampkortet
  allerede tegner (`FootballTip.jsx:578`). To stavemåder af samme sted i samme
  kort. Svaret er sjældent "vis begge" og sjældent "drop det nye": vis det nye
  KUN hvor det afviger — så bærer det information (kampen blev flyttet) i
  stedet for støj.
- **Fladen har som regel allerede sagt det.** Optæl kortets eksisterende udsagn
  FØR nyt lægges på. Kampkortet bærer i dag: kickoff, kupon-mærke, venue,
  Ramt/Ikke ramt/Spillet, Chancen-pille, live-badges, score, holdnavne+logo,
  xG-linje, `MatchElo`, pick-grid med point, `LeagueBets`. Nyt indhold skal
  fortrænge noget eller lægge sig som en kvalifikator på et tal, der allerede
  står der (halvlegsstilling i parentes efter scoren er en kvalifikator;
  tilskuertal og dommer er trivia og hører på holdsiden eller ingen steder).
- **Et statusfelt, der overskrives, kan ikke bære en alarm.** Kræver hændelsen
  en menneskelig handling, skal den persisteres og kvitteres. **En alarm må
  aldrig kombinere `kraeverKvittering: true` med selv-lukning** (fundet på
  `livetavs`): næste normale tick lukker kortet, og udfaldet bliver hverken
  set eller kvitteret. Vælg én model.
- **ALARM eller ADVARSEL?** Spørg: kan tilstanden være PERMANENT og legitim?
  Kan den det, hører den i drift-kortets linje (`st.advarsel` + et tal, der
  skal gå mod nul), ikke i alarmen — ellers fyrer den 12 gange i døgnet for
  evigt, og ejeren lærer at ignorere fladen (`index.js` siger det selv om
  strandede kampe). Alarmen tager det SYSTEMISKE: kredsløbsafbrud, "alle
  fejler", "tælleren står stille over flere kørsler".
- **Flere skrivepunkter i ét dokument = sidste skriv vinder.** Saml status i
  hukommelsen, skriv ÉN gang til sidst med `niveau = værste(...)`
  (`driftlog.js` `statusSamler`/`vaerste` er mønstret).
- **En dashboard-side, der kun tegner kort for dokumenter, der FINDES, er blind
  for den værste fejl.** Tegn kort pr. FORVENTET type (`DriftTab.jsx:108`
  `forventede` + en fallback-liste for uventede dokumenter).
- **Tør-kørsel må aldrig kvittere som en rigtig kørsel.** De manuelle callables
  har dryRun som default; skriver de i en "sidst kørt"-status, melder fladen en
  kørsel, der ikke skete.
- **Tærskler hører dér, hvor sandheden bor** — serveren skriver
  `naesteForventetFoer`, klienten hardkoder ikke cron'en.
- **En admin-flade over PRIVATE data: efterprøv LÆSE-vejen, ikke kun
  skrive-vejen.** `games/{gameId}/leagues/{leagueId}` (`firestore.rules:952`)
  har INGEN `isGlobalAdmin`-gren, modsat top-niveau `leagues:344`. Spørg altid:
  hvilken query fylder listen, og hvilken regel-gren tillader den?
- **En ny admin-fane skal navne-tjekkes mod spillets EGEN fanerække.**
  `👥 Ligaer` findes som spil-fane (`GamePage.jsx:50`).
  `scripts/fanebredde.mjs:36` er en hardkodet KOPI af admin-fanerækken, og
  `docs/admin-guide.md:20` er et ANDET spejl af samme række. To spejle, begge
  skal med i samme PR.
- **Et symptom, en alarmtekst citerer ("spilleren ser X"), skal spores til den
  faktiske render-betingelse i klienten.**

## Gates, evner og proxier

- **En proxy-gate findes ikke ved grep — den indeholder ikke evnens navn.**
  `puljeLockRound` som proxy for "har kickoff-synk"; en klient der hardkoder
  `provider === 'pulselive'`, mens serveren tjekker
  `typeof provider.hentKickoffs === 'function'`. Gate på en delt evne-funktion
  i `src/features/games/spilEvner.js`, med spejlings-tripwire mod
  `scripts/games.mjs` (`spilEvner.test.js:70-89`).
- **En evne, hvis konfiguration er PR. SPIL, må ikke gates på PROVIDER.** Ny
  form af samme fejl: en allowlist `{'pulselive','superliga'}` ser rigtig ud,
  når de to eneste spil begge har evnen — men provideren er hvor FACIT kommer
  fra, og en tredje kilde (fx livescore) er ortogonal. Nøglen skal være den
  samme som serverens: `SYNCED_GAMES` i `functions-platform/syncProviders.js`
  er nøglet på **gameId** og er STATISK med vilje (kommentaren dér:
  "et produktionsdokument uden sync-felt kan ikke tabe et spil ud af synken").
  En serverside-gate, der i stedet læser `game.sync.X` fra dokumentet, bryder
  det design OG kræver en produktions-seed, før evnen virker.
- **Klient og server skal gates på SAMME nøgle.** Læser klienten game-doc'et og
  serveren en statisk liste, kan de to divergere i begge retninger: knap uden
  server (kald der kun kan fejle) eller server uden knap (ingen udløser).
- **En test kan fastfryse en fejl.** Søg `not.toBeInTheDocument`, `toBeNull`,
  `understoettet:false`, `toEqual([])` om netop det, du udvider, og vend dem
  bevidst. Strukturelle "præcis ét element"-assertions er derimod nyttige
  tripwires (`FootballTip.test.jsx:407` `.match-card__score` toHaveLength(1);
  `tipPil.test.jsx:253` "xG-linjen ligger IKKE i `.match-card__meta`", fordi
  meta-rækken er inline-flex uden wrap og klipper venue-teksten).
- **"Kan startes med vilje" og "kan ikke fejle tavst" efterprøves pr. SPIL.**
  Callable uden knap = ingen udløser; kørsel uden driftlog-linje = tavs.

## Data, kilder og målinger

- **Et felt i en plan-tabel uden en målt kilde er en påstand.** En kildetabel,
  hvor kolonnen "kilde" siger `incidents.Incs` for et felt som `maal[].hold`,
  har ikke identificeret feltet — og hvis krydsvalideringen HVILER på den
  attribution (mål pr. side mod `Tr1`/`Tr2`), er hele sikkerhedsmekanismen
  uverificeret. Kræv fil:linje i måle-scriptet eller en committet payload.
- **En prøve på ÉN post beviser en kildes eksistens, ikke dens dækning.**
  `scripts/maal-livescore.mjs` prøvede detaljer på én færdig kamp pr. spil.
  Det svarer på "findes felterne", ikke på "hvor ofte parser vi dem rigtigt".
- **En whitelist plus "ét brud → afvis hele posten" gør whitelisten til en
  DÆKNINGSGRAD.** Observerede koder er ikke alle koder (straffe, selvmål,
  VAR-annullering). Kræv afvisningsraten målt over en hel sæson, før
  konstruktionen landes — ellers ved ingen, om fladen er tom for 2 % eller
  40 % af kampene, og alarmen fyrer i stedet for at oplyse.
- **Et "har-vi-det-allerede"-filter uden en AFVIST-markering er en giftpille.**
  Filtreres på "har facit OG mangler `…SyncedAt`", bliver en post, der
  permanent fejler valideringen, hentet igen ved HVER kørsel for evigt og æder
  loftet forrest i køen. Skriv et `…AfvistAt` (markeringen, ikke dataen), så
  retryet backer af — og så tælleren betyder "NYE uenigheder", hvilket er dét,
  der kan bære en alarm.
- **Skil FEJLARTERNE i tælleren.** "Vores facit ≠ deres facit" (en datahændelse,
  menneske skal kigge) og "vi kunne ikke parse deres data" (vores kode/whitelist)
  er to forskellige incidents. Ét fælles tal kan ikke fortælle, hvilken det er.
- **Et tal uden kode er en påstand** — også i et JSDoc. Og et PRÆCIST tal ældes
  ("13 ud af 37"); vælg den kvalitative form ("rammer forbi hver tredje gang"),
  med mindre tallet regenereres automatisk.
- **En test med HÅNDSKREVET fixture kan bekræfte sig selv.** Importér den ægte
  kilde (`GAMES` fra `scripts/games.mjs`, den spejlede lib, en committet
  payload) i mindst ét tilfælde.
- **En ny evne på `games/{id}.NYTFELT` rammer flere læse-flader end planen
  nævner.** Målte optællinger: `game.pulje` = 2 admin/klient + 3 hjælpetekster
  + en mail-skabelon; `chanceStake` = seks steder; `games/{id}.teams` rører
  point OG farver på ni komponenter. Grep FØR koden, dispositionér på skrift.
- **En afløst datamodel skal have et forbrugs-eftersyn** (Beskeder-fanen døde
  tavst som ikke-dispositioneret læser af top-niveau `leagues`).
- **Virker det for EKSISTERENDE rækker?** Kræver ændringen et nyt felt på
  game-dokumentet, skal `seedGames` køres i produktion først — det er en
  skrivning i produktionsdata og hører til Release Manager, ikke til deployet.
  `perRound`-udrulningen er præcedensen (`docs/drift.md:417`).
- **Dokumentation er en spejlet fil**: `docs/drift.md`, `docs/admin-guide.md`,
  `FootballHelp.jsx`, og `scripts/games.mjs`' egen felt-beskrivelse i toppen.

## Nye TAL på en eksisterende flade

- **`MatchElo.jsx:8-15` er husets skrevne præcedens:** en "favorit" skal komme
  af `m.odds`, aldrig af ratingforskellen (odds har `ELO.HFA = 60` oveni).
- **Retrospektivt må aldrig klistres ind i det prospektive.** xG-linjen står
  som egen blok OVER `MatchElo` og UNDER scoren, netop for ikke at blande
  "hvad skete" med "hvem er favorit". Et nyt retrospektivt tal (halvleg,
  målscorere) hører samme sted, gatet på `m.result` + felternes eksistens.
- **To gates om to spørgsmål:** TALLET pr. kamp gates på felterne (en netop
  afsluttet kamp mangler dem, til sweep'et har kørt); FORKLARINGEN i guiden
  gates på EVNEN (`FootballHelp.jsx:359`, `harXg(game)`) — en regelbog må ikke
  forklare et tal, spillet aldrig får.
- **Et aggregat af ODDS-VÆRDIER er model-blandet; en FAVORIT-IDENTITET er
  model-invariant.** `recomputeSeasonElo` genpriser kun ULÅSTE kampe;
  `ODDS.MAX` blev fjernet og `DRAW_BASE` gik 0,26 → 0,305 midt i sæsonen. Tæl
  favoritter frit — gennemsnit aldrig odds over tid. "Markedets syn" findes
  ikke: `outcomeOdds` er FAIR odds af vores egen Elo, uden vig.
- **Et "overraskelses"-tal uden fortegn måler ANSEELSE, ikke præstation.**
  Samme klasse som "Modigst i minus", der viste en positiv værdi, fordi vagten
  var "forskellig fra bedst" og ikke "faktisk negativ".
- **Procent-reglen, som koden bærer den:** procent om DIG SELV tilladt
  (`TipsHistorik.jsx:119`), om NAVNGIVNE ANDRE forbudt (`h2h.js:20-23`);
  kollektive tal som brøk. Et tal om et HOLD er uden for reglen.
- **Et "ligaens tal" er PR. SEER** — skriv skalaen i labelen, eller udled
  tallet af kampdata.
- **"Runden er færdig" har TRE definitioner, der svarer forskelligt samtidig:**
  (1) `faerdigeRunder(matches)` (`rundeSejre.js:35`), (2)
  `rc.combiSettled === rc.combiCount` (rundens UGE — pilen i stillingen følger
  DENNE), (3) at der findes en nøgle i `perRound`. En udsat kamp river dem fra
  hinanden i ugevis. Sig hvilken en ny flade bruger.
- **`perRound` kan IKKE skelne "0 point" fra "deltog ikke"**
  (`pointOpdeling.js:339` `if (!v) return;`). Og `ligaPoint`/serverens total
  gulves begge ved 0, så `total − total_uden_runde ≠ perRound[r]`.
- **Spil-evne-matrix til enhver ny fodbold-flade:** `tour2026` er cycling;
  `vm2026` er finished/externalUrl; `pl2627-efteraar` har INGEN
  `game.standings` og er runde 1-18 af 38. Kun `superliga2627` har alt.
- **Fane-prisen kan MÅLES** (`scripts/fanebredde.mjs`) — argumentet mod fane
  nr. 10 er pladsen, ikke usynligheden.
- **Ny rute under `/spil/:gameId` findes ikke** — fanen er en query-param, og
  en ny rute skal genskabe `GameLayout`, fanerække og `isMember`-gaten
  (`GamePage.jsx:107`). **Et delt link overlever ikke login**
  (`ProtectedRoute.jsx:9` uden `from`-state).
- **Et holdnavn er ikke en URL-nøgle** — `teamInfo()` matcher eksakt på `name`,
  fladen viser `vis`, og `short` er den unikke nøgle. Bliver `short` en URL,
  skal `teamsVagt` (`seedFootball.js:363`) udvides samtidig; den afviser i dag
  kun ændret `elo`, tilføjede, forsvundne og dubletter.
- **Ethvert HOLDNAVN i en ny visning skal bruge visningsnavnet.**
  `visningsnavnFlader.test.jsx` ER listen over flader; en ny (fx en
  målscorerlinje, der nævner hvilket hold der scorede) hører derind. Bedst er
  at undgå navnet helt og gemme siden (`'home'|'away'`), så visningen løses af
  kortets egne `h`/`a`.
- **`game.eloHistory` har huller pr. konstruktion** — snapshot kun ved en HEL
  spillet runde. **En N-dokument-læsning må ikke blankes af ét afslag**
  (`useSpillerOpdeling` gør ét `permission-denied` til hele panelets fejl).
- **Et regnelag uden forbruger kan være rigtigt at lande**, hvis den REVIDEREDE
  plan sekventerede det, og commit/PR-teksten ikke overclaimer omfanget.
- **En bar `<table>` uden `.table-wrap` arver mobil-bredde-risikoen**; jsdom
  ser ikke ombrydning. **To identiske emoji med forskellig betydning på samme
  skærm løses ikke af en hjælpetekst** — svaret er et andet symbol.

## Skala-fælden: ét tal, to regnestykker

- **En gate på "er der noget at VÆLGE" er en proxy for "hvilken SKALA gælder".**
  `leagueCount <= 1` er sandt om HVEM, falsk om POINT (spillets `totalPoints`
  mod `ligaPoint` fra ligaens `startRound`). Spørg: identiske i VÆRDI eller kun
  i MÆNGDE?
- **En forklaring, gate't på det samme som fænomenet, vises aldrig, hvor den
  behøves.** Læs render-betingelsen for FORKLARINGEN og FÆNOMENET side om side.
- **Retter man skalaen ét sted, skal ALLE flader med samme spillers tal tælles
  op.** Otte i dette repo; `FootballTip.jsx:259` (facit + delingstekst) er den
  farligste, for dens tal FORLADER appen.
- **En mocket hook kan skjule, at den nye gren aldrig kører** (`leagues: []`
  overalt i tipPil/FootballTip-testene gjorde hele liga-skala-grenen grøn uden
  at være kørt).
- **Samme vagt, ny fil, glemt duplikat:** findes en guard mod et skævt
  liga-dokument ét sted, så spørg om enhver anden bruger af samme `leagues`
  har brug for den.

## Faste steder og konkrete tal (efterprøv, gæt ikke)

- **`firestore.rules` er ÉN fil for BEGGE projekter.**
  `games/{gameId}/matches/{matchId}` (`firestore.rules:805-809`) er
  `read: isApproved()`, `create/update: isGlobalAdmin()`, ingen felt-allowlist
  — nye felter på kampdokumentet kræver ingen regelændring.
- **`recomputeGameMatch` (`functions-platform/index.js:106-117`) er vagten
  mellem en felt-skrivning og en fuld rescore + `recomputeSeasonElo` +
  Runde-Botten.** Den returnerer, hvis `result` ikke ændrer sig — derfor er
  regelen "livescore må aldrig skrive `result`/`homeGoals`/`awayGoals`" den
  dyreste i huset: `matchOutcome()` udleder facit AF MÅLENE.
- **`kickoff` er tip-vinduet** (`request.time < kickoff` i rules). Ingen
  berigelses-kilde må skrive det; en fremflytning genåbner vinduet.
- **Sweep-budget:** `SWEEP_TIMEOUT_S = 300` (`index.js:~530`),
  `XG_BUDGET_MS = 300000/3/SYNCED_GAMES.length` (= 50 s pr. spil i dag). Nyt
  arbejde i sweep'et skal have SIT tal skrevet ud af de 300 s — en
  platform-timeout kan ikke fanges af try/catch, og så mister BÅDE dette og
  det næste spil alarm, tabel og driftlog-kort. Dyreste trin lægges SIDST i
  løkkekroppen, efter sikkerhedsnettene. Et loop-budget, der kun tjekkes i
  toppen af løkken, kan overskrides med ét helt kald-sæt.
- **`syncSuperligaSweep`: cron `25 2,13-23`** — største NORMALE hul er 11 timer.
  `syncSuperligaResults`: `* 12-23` = 720 kørsler/dag × 2 spil, bevidst
  optimeret til ét tomt opslag. `syncGameKickoffs`: `10 6 * * *`.
  Sweep'et ER alarmen for minut-synken.
- **Manuelle "kør nu"-callables skal have SAMME timeout i klient og server** —
  fundet forkert to gange.
- **En kommentar, der PÅSTÅR en udledning ('halvdelen af xG's budget'), uden at koden faktisk udregner den, er en skjult kobling.** `DETALJE_BUDGET_MS = 25000` i `kampDetaljer.js` er en literal, ikke et udtryk som `XG_BUDGET_MS/2` — ændres `XG_BUDGET_MS` (fx flere `SYNCED_GAMES`), bliver kommentarens regnestykke stille forkert, og ingen test kan se det. Samme klasse som "et tal uden kode er en påstand", men på en KOMMENTAR i stedet for en UI-tekst.
- **Et PRÆCIST målt tal i en KODE-kommentar ældes lige så let som ét i UI.** "Udfaldet skifter i 48 % af kampene" (`FootballTip.jsx`, halvlegslinjen) er en påstand om en levende kilde (livescore.com), ikke et fastfrosset facit — modsat den qualitative UI-tekst samme sted ("næsten hver anden kamp"), som fulgte husets regel korrekt. Tjek BEGGE steder, ikke kun det brugeren ser.
- **Manuelle synk-knapper bor i `GameScheduleTab.jsx`:** `🗓️ Synk kamptider nu`
  (:611, `harKickoffSynk`), `⬇️ Synk resultater nu` (:635, `harResultatSynk`).
  Det er dér en administrator leder efter en kampdata-knap.
- **Kampkortets venue:** `FootballTip.jsx:578`, `h.venue` fra
  `games/{id}.teams[].venue` via `badges.js:56`.
- **`games/{id}.teams` bærer POINT, ikke kun farver:** `teams[].elo` er seed for
  `recomputeSeasonElo`, `teams.length` styrer `expectedPlayed`, og array-orden
  er brugersynlig i `PuljeTip`. `short` findes for alle 20 PL- og 12 SL-hold i
  `src/data/*Teams2026.js` og skrives med `{merge:true}` af
  `scripts/seed-football.mjs:315`. Kampdokumenter skrives også med merge
  (:288-300), så et re-seed sletter ikke berigede felter.
- **Farve-overrides (`teamStyles`) slår kun igennem, hvor `badgeFor` bruges** —
  FootballTable, EloTable, PuljeTip og eloHistory læser rå `t.color`.
- **Liga-medlemskab: én skrivning, tre afledte flader.** `memberUids` skrives
  kun server-side; `syncPlayerLeagues` spejler til `players/{uid}.leagueIds` OG
  til `leagueIds` på ALLE spillerens `bets`. `applyMembershipDelta` springer
  TAVST over en uid uden players-dokument. `useGameStandings.js:54` viser TOM
  stilling ved nul ligaer.
- **`redeemLeagueCodeCore` AUTO-godkender og AUTO-tilmelder spillet.**
- **Mønster for en log-flade:** `emailLog` + `useEmailLog.js` + `EmailLogTab.jsx`
  + `allow read: if isGlobalAdmin(); allow write: if false;`.
- **Badge på Admin-linket** (`Layout.jsx` `CountBadge`) er allerede rødt — et
  nyt rødt badge samme sted kan ikke skelnes.
- **Global admin har klient-læse-bypass på de fleste samlinger, men IKKE på
  `questionAnswers`.** Skriv den rigtige begrundelse for en admin-callable.
- **En tæller bygget på en query, indsnævret for at matche en læseregel, tæller
  "hvad jeg må se", ikke "hvad der findes".**
- **Tour-appen er på pause, men dens 7 `onSchedule` kører videre.**
- **Kampprogrammet ligger i repoet og kan tælles:**
  `scripts/premier-league-fixtures-2627.json` (R1 21/8-2026),
  `scripts/superliga-fixtures.json` (R1 24/7-2026). 380 + 132 = 512 kampe.
