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
- **En AFSLØRING skæres pr. LIGA, aldrig pr. union af mine ligaer.** Husets
  skrevne præcedens er `gameRecap.js:340-347`: ét opslag PR. LIGA, fordi et
  spil-bredt fakta-sæt satte navne på "Familien"s væg fra folk, dens medlemmer
  ikke deler liga med, og påstod en fører, ligaens egen stilling modsagde.
  `useGameStandings().standings` er UNIONEN af mine ligaer — den er rigtig som
  læse-afgrænsning, men forkert som RANGLISTE: rækkefølgen matcher da ingen
  ligas stilling. `GameStandings.jsx:250-254` løser det med `enesteLiga` +
  vælger; en ny rangliste uden vælger genskaber fejlen. Og ved nul ligaer
  bliver listen ÉN række (dig selv) — `gameRecap` har `< 2 medlemmer → spring
  over`, `LeagueBets.jsx:91-97` siger i stedet "Bliv med i en liga". Vælg ét af
  de to; en etrækkers rangliste er ingen af delene.
- **En ny udfoldning skal måles mod opgave #60, ikke mod bekvemmelighed.**
  `LeagueBets.jsx:128-131` bærer indrømmelsen på skrift: den ene sætning, man
  kan læse højt ("kun du så det komme"), ligger bag en fold. Et forslag om
  `<details>` PR. SPILLER er samme fejl gange N — pointen (enegængeren) kan
  kun findes ved at åbne alle. Løft det interessante ud som én sætning over
  listen; fold kun det, ingen leder efter.
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
- **En CSS-"kontrakttest", der asserterer REGEL-TEKST, kan ikke se kaskaden.**
  Klassen stod på elementet, reglen stod i filen, testen var grøn — og reglen
  var død. `.pulje-team:disabled > *:not(.pulje-team__actual)` er (0,3,0),
  fordi `:not()` arver argumentets specificitet; undtagelsen
  `.pulje-team--laast:disabled > *` er kun (0,2,0) og taber uanset rækkefølge.
  Skriv undtagelsen som et `:not()` PÅ BASISREGLEN (én vagt ét sted) i stedet
  for en bredere regel bagefter — og MÅL effekten: jsdom kan faktisk regne
  kaskaden for `opacity` + `:not()` + `>` (indsæt theme.css i en `<style>` og
  brug `getComputedStyle`). Sammenlign MED og UDEN den nye regel: er outputtet
  identisk, er reglen dekoration.
- **`opacity` danner stacking context — et barn kan aldrig være mere
  uigennemsigtigt end sin forælder.** Skal ét ikon overleve en dæmpning, skal
  dæmpningen flytte fra forælderen til børnene. Men så holder BORDER og
  BAGGRUND op med at dæmpe: tjek, om "kan ikke vælges"-signalet stadig læses.
- **"Kan startes med vilje" og "kan ikke fejle tavst" efterprøves pr. SPIL.**
  Callable uden knap = ingen udløser; kørsel uden driftlog-linje = tavs.

- **En hook, der samler DATA og et LOADING-flag, skal give begge videre —
  ikke kun dataet.** `useGameStandings` returnerer `{standings, leagues, loading}`;
  `standings` starter tomt og fyldes async. `GameStandings.jsx:296` gater sit
  tomme-state bag `if (loading) return spinner`, FØR den tomme-tekst på :567.
  `PuljeAfsloering.jsx:152` bruger samme hooks `standings` til at afgøre
  "ingen liga-fæller", men hverken `PuljeTip.jsx` eller `PuljeAfsloering.jsx`
  læser `loading` — så en liga MED fæller kan vise "ingen fæller endnu" i det
  øjeblik, standings' egne lyttere (players, users) endnu ikke har svaret.
  Kopieres et mønster fra en søsterfil, skal gaten kopieres med, ikke kun
  teksten.

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
- **Klient-beregnet facit og server-skrevet facit er TO kilder til samme tal —
  og de skifter ikke samtidig.** `PuljeTip.jsx:110-133` regner `facit` af
  `game.standings` (SL: alle hold har `played == expectedPlayed`), mens
  `settlePuljeBets` (`gameScoring.js:392-397`) self-guarder på at ALLE
  kampdokumenter har mål. Den officielle tabel kan være komplet, mens ét af
  vores kampdokumenter mangler et resultat: klienten siger "sæsonen er slut",
  serveren har ikke afregnet, og facit-kortet viser `bet.correct ?? 0` = 0/6.
  Enhver NY flade, der viser et pulje-tal ved sæsonslut, skal vælge ÉN kilde —
  og siger den noget andet end nabokortet, er det en modsigelse, ikke en
  forsinkelse.
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
- **En normaliserings-fix på tværs af render-steder rammer sjældent alle på
  én gang — og en `?? 'fallback'` skrevet FØR normaliseringen fanger ikke den
  nye tomme streng.** Da liganavne blev normaliseret til '' i
  `useLeagues`/`useAllLeagues`/`useGameLeagues`, blev fire filer rettet med
  `league.name || 'Liga uden navn'` — men `LeaguesAdminTab.jsx` (top-niveau-
  ligaernes EGEN admin-side, den mest oplagte af alle) stod ikke på listen,
  og `useLeagueBonusTasks.js:63` brugte `l.name ?? 'Liga'`, som er blind for
  tom streng (kun `undefined`/`null` udløser `??`). Spørg ved enhver
  streng-normalisering: (1) er ALLE forbrugere af kilden på listen, ikke kun
  dem en tidligere krasch pegede på? og (2) rammer en downstream-fallback
  (`??`/`||`) den PRÆCISE tomme værdi, normaliseringen nu sender?

- **Filhoved-kommentarens tal skal matche DEN kørsel, koden i samme commit selv
  producerede — ikke en tidligere håndkørsel med samme påstand.**
  `maal-livescore-detaljer.mjs`s nye `--live`-header citerede en ad-hoc måling
  fra FØR flaget var skrevet (123 ms, 68', kl. 21.30), mens commit-beskeden og
  selve `--live`-kørslen gav et andet, ægte tal (140 ms, 70', kl. 21.28,
  stage=incidents). Begge er sande målinger, men kun ét er det, den leverede
  kode faktisk viser ved kørsel — match filhovedet mod commit-beskedens tal
  for SAMME diff, ikke mod research, der gik forud for koden.

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

- **Et cachet id, der springer et opslag over, mister en gratis selvhelbredelse.**
  `livescoreEid` (`kampDetaljer.js:79-84`) foretrækkes altid over et frisk
  nøgle-opslag, hvis blot FORMATET er gyldigt — men formatgyldig ≠ stadig
  korrekt. Før caching blev id'et genberegnet hver kørsel og healede sig selv,
  hvis kilden omdøbte/genudstedte det; nu fejler en forældet cache for evigt i
  den gren, der IKKE har karantæne (`utilgaengelige`/404, adskilt fra
  `detaljerAfvistAt`s 7-dages karantæne for `uenig`/`uparset`). Spørg ved
  enhver ny cache af et FREMMED id: hvilken gren rammer et forældet men
  gyldigt-formateret id, og har DEN gren en udgang?
- **To kald, samme fejlkilde, ulige alarm-vej.** Et nyt opslag lagt FØRST i en
  kørsel (fx `kortlaegEids` før `syncKampDetaljerCore`, `index.js:682-688`)
  fik sin egen `KildenLukkerOs`-fangst, der re-kaster til en GENERISK ydre
  catch (`st.fejl`, intet `meldAlarm`) — mens den samme fejl inde i det
  oprindelige kald stadig udløser den navngivne alarm. To steder, der burde
  give samme signal ved samme fejl, gør det ikke, fordi det nye kald blev
  indsat med sin egen fangst i stedet for at dele den eksisterende. Spørg:
  rammer et nyt kald, indsat FØR et eksisterende sikret kald, den SAMME
  alarm-vej, eller har det fået sin egen?


- **`firestore.rules` er ÉN fil for BEGGE projekter.**
  `games/{gameId}/matches/{matchId}` (`firestore.rules:805-809`) er
  `read: isApproved()`, `create/update: isGlobalAdmin()`, ingen felt-allowlist
  — nye felter på kampdokumentet kræver ingen regelændring.
- **En rules-test på `getDoc` beviser ikke en `getDocs`.**
  `functions/rules.test.js:3033-3053` beviser, at andres pulje-tip kan læses
  ENKELTVIS efter deadline (`puljeBets`, `firestore.rules:838-839`). En flade,
  der henter HELE samlingen, er en `list`: hele forespørgslen falder, hvis ét
  dokument fejler, og `gameLock()` er et `get()` inde i regel-evalueringen.
  Kræv en emulator-test på selve `getDocs` — før OG efter deadline.
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

- **En sætning, der navngiver et objekt med `{navn}` foran et substantiv, skal
  bøjes.** "Ingen af {liga.name} medlemmer" mangler genitiv-s ("Kontorets",
  ikke "Kontoret") — og fejlen er usynlig for grep, fordi fallback-strengen
  ("ligaens") tilfældigvis ER korrekt bøjet. Husets egen præcedens
  (`GameStandings.jsx:567`) undgår problemet helt ved ALDRIG at navngive:
  "Ingen af ligaens medlemmer er med i stillingen endnu." Skal en ny sætning
  navngive et dansk ord foran et substantiv, sæt `{navn}s` eller undgå navnet.

## Delt tæller, to domme

- **To skrivepunkter, der læser SAMME tæller, skal give SAMME sværhedsgrad.**
  `d.ukendte` fik i PR #192 sin klient-tekst rettet til `kind:'err'` og en
  docs-linje, der siger "retter sig ALDRIG selv" (`GameScheduleTab.jsx:385`,
  `docs/drift.md:360`) — men det automatiske sweep, der skriver samme tal til
  Drift-kortet (`functions-platform/index.js:668-672`), klassificerer stadig
  et rent `ukendte`-udfald som `st.ok()` (grøn), fordi dens advarselsbetingelse
  kun tjekker `uenige||uparsede||utilgaengelige`. Samme evne (en permanent,
  ikke-selvhelende fejl), to flader, to domme. Retter man ÉN aflæsning af en
  delt tæller, så find den ANDEN, der læser samme felt, og spørg om den
  drager samme konklusion.

## Ny genvej med et eksisterende sikkerhedsnet

- **En hurtig-vej, der er sekventeret EFTER facit er committet, er en anden
  risikoklasse end en hurtig-vej PÅ FACIT-STIEN.** `efterFacitDetaljer` i
  minut-synken citerer xG-kontraktens forbud ("aldrig fra minut-synken"), men
  bryder det sikkert: den kører i et SEPARAT loop efter `runScheduledSyncAll`
  allerede har committet facit for ALLE spil (`index.js:389` vs. den nye kode
  ved 416+). xG var farlig, fordi den lå PÅ VEJEN til facit og var ubundet
  (hele sæsonen); genvejen her er bundet (`rettede`, typisk 1-3) og kan ikke
  røre en allerede-skrevet facit. Spørg ved en lignende "kør det tidligere"-PR:
  er det NYE trin før eller efter den skrivning, det gamle forbud beskyttede?
- **En optimering med et eksisterende sikkerhedsnet (sweep'et samler op om en
  time) fritager IKKE for "kan ikke fejle tavst".** `efterFacitDetaljer` har
  bevidst INGEN egen driftlog-linje — begrundelsen er, at sweep'ets kort
  allerede viser efterslæbet. Men fejler genvejen KONSEKVENT (ikke kun
  429/403, som har sin egen alarm), er der intet, der skelner "virker" fra
  "altid død": sweep'ets `detaljerMangler` går mod nul i begge tilfælde, bare
  en time langsommere. `docs/drift.md` bekræfter selv, at det ENESTE
  driftkort for evnen hedder "Times-sweep · <spil>". Konsekvensen er bundet
  (ingen data-/pointtab), så det er ikke automatisk blokerende — men er en
  reel afvigelse fra husregelen og bør have et letvægts-signal EFTER trinnet
  (aldrig FØR — det ville bryde ordenen, sikkerheden hviler på).
- **Et "målt i scripts/X"-citat skal efterprøves ved at LÆSE scriptet, ikke
  ved at tro på filnavnet.** `EFTERFACIT_BUDGET_MS = 15000`s kommentar (og en
  søster-kommentar i `kampDetaljer.js`) citerede
  `scripts/maal-livescore-detaljer.mjs` for latenstal (295 ms/128 ms/171 ms).
  Scriptet indeholder ZERO tidsmåling — det tæller dækningsgrader (halvleg,
  tilskuertal, IT-koder), ikke ms. Et præcist tal med en fil:linje-henvisning
  SER ud som husets egen regel overholdt, men er lige så meget en påstand som
  et helt umærket tal. Åbn filen; grep efter `Date.now`/`performance.now`/
  `ms` i selve scriptet, ikke kun i kommentaren, der citerer det.
