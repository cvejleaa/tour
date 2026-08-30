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
  **En alarm må aldrig kombinere `kraeverKvittering: true` med selv-lukning**
  (fundet konkret på `livetavs`): næste normale tick, hvor tilstanden retter
  sig selv, lukker kortet ubetinget, og et transient udfald bliver aldrig set
  ELLER kvitteret — præcis den fejl, alarmen skulle løse, blot flyttet.
  Vælg én model: kræver kvittering, eller lukker selv — aldrig begge.
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
- **En admin-flade over PRIVATE data: efterprøv LÆSE-vejen, ikke kun
  skrive-vejen.** En plan kan korrekt konkludere "skrivning kræver en
  callable, reglerne røres ikke" og helt overse, at fanen heller ikke må
  LÆSE. `games/{gameId}/leagues/{leagueId}` (`firestore.rules:952`) har
  **ingen** `isGlobalAdmin`-gren — modsat top-niveau `leagues:344`, som er
  grunden til at Tour-admin-fanen virker. Enhver spil-scoped admin-flade over
  ligaer skal derfor have BÅDE en læse-callable og en skrive-callable.
  Spørg altid: hvilken query fylder listen, og hvilken regel-gren tillader den?
- **En ny admin-fane skal navne-tjekkes mod spillets EGEN fanerække.**
  `👥 Ligaer` findes allerede som spil-fane (`GamePage.jsx:50`), og
  `docs/admin-guide.md:127` slår husets præcedens fast: liga-scopede
  funktioner bor på ligaens kort i spillet, "for spørgsmålene ejes af
  liga-ejeren, ikke af platformen". Et andet `👥 Liga-…` i admin er to flader
  med samme navn i to navs.
- **Fane-harnesset er en hardkodet KOPI uden paritetstest.**
  `scripts/fanebredde.mjs:36` lister admin-fanerne i hånden (10 i dag). En ny
  fane, der ikke tilføjes dér, gør harnessets tal tavst forkert — samme klasse
  som "et spejl af levende data".
- **Et symptom, en alarmtekst citerer ("spilleren ser X"), skal spores til den
  faktiske render-betingelse i klienten** — ikke antages ud fra hvornår
  serverfeltet skifter. En live-alarm påstod "spillerne ser 'OPDATERING
  AFBRUDT'", men klientens egen betingelse viste i den præcise tilstand
  badget "Låst" — det modsatte af alarmens påstand.

## Mønstre, destilleret fra tidligere sag-gennemgange

- **En proxy-gate findes ikke ved grep — den indeholder ikke evnens navn.**
  Gentaget konkret flere gange i dette repo: en synk-knap gatet på
  `puljeLockRound` i stedet for "har kickoff-synk", en klient, der hardkoder
  `provider === 'pulselive'`, mens serveren tjekker
  `typeof provider.hentKickoffs === 'function'`. Gate altid på en DELT
  evne-funktion (`harKickoffSynk`, `harResultatSynk` — allowlist over
  IMPLEMENTEREDE providere), aldrig på et felt, der blot plejer at følges ad.
  Når en sådan helper laves, giv den en spejlings-tripwire-test mod
  `scripts/games.mjs` (mønster: `spilEvner.test.js`, `syncProviders.test.js`).
- **En ny evne på et spil (`games/{id}.NYTFELT`) rammer typisk mange
  læse-flader, ikke kun den planen nævnte.** Konkrete optællinger i dette
  repo: `game.pulje` rørte 2 admin/klient-steder OG 3 hjælpetekst-steder OG en
  mail-skabelon; `chanceStake` læses seks steder; `games/{id}.teams` rører
  point (Elo-seed, pulje-`expectedPlayed`) OG farver på ni forskellige
  komponenter. Grep FØR koden skrives, dispositionér hver træffer på skrift.
- **En test, der bruger en HÅNDSKREVET fixture i stedet for den ægte
  datakilde, kan bekræfte sig selv.** To konkrete tilfælde: en Superliga-
  fixture med en opfundet `pulje.labels`, som den RIGTIGE `scripts/games.mjs`-
  post ikke har (skjulte at pulje-teksten reelt forsvandt for SL); og en
  gammel `GameScheduleTab.test.jsx`-test, der beviste en bug grønt ved at
  assertere fraværet af en knap. Importér den ægte kilde (`GAMES` fra
  `scripts/games.mjs`, eller den spejlede lib) i mindst ét testtilfælde, når
  nøjagtig den post allerede findes i repoet.
- **Symmetriske UI-grene skal have symmetriske tests.** "Kun du"/"kun ham" i
  et opgørs-panel delte ét verbum, og den ene gren manglede det ordret i
  output — ingen test satte den anden gren positiv i UI-laget, kun i den rene
  funktion. En dækket gren beviser intet om sin søster.
- **Et "bedst/værst"-ord med indbygget fortegn er en PÅSTAND om dataen, ikke
  kun en etiket.** "Modigst i minus" viste en POSITIV værdi, fordi den eneste
  vagt var "forskellig fra bedst", aldrig "faktisk negativ" — en nabo-kort i
  samme fil (Rundekongen) havde netop den `> 0`-vagt, dette kort manglede.
  Spørg specifikt ved ord som "i minus", "underskud", "tabte": er der en
  eksplicit fortegns-vagt, eller kun en forskellig-fra-vagt?
- **Dokumentations-/tekst-drift er systemisk, ikke enkeltstående.** En
  misvisende sætning findes ofte flere steder end den fane, ændringen rørte —
  grep den PRÆCISE gamle ordlyd på tværs af `docs/`, hjælpesider OG andre
  live UI-tekster (ikke kun den komponent, testen dækker) i samme PR. Se
  Chancen-fundet nedenfor for et konkret, ikke-lukket eksempel.
- **Et felt, der flytter ejerskab fra klient til server, er trygt for
  eksisterende LÆSERE (samme værdi-form), men CREATE-vagten og eventuelle nye
  revisions-/audit-felter skal tjekkes særskilt** — en update-only-vagt lader
  feltet smugles ind ved oprettelsen, og et nyt revisionsfelt (fx et
  tidsstempel, der beviser rækkefølge) skal fryses lige så hårdt som selve
  værdien, ellers kan sporet forfalskes efter at hullet er lukket.

- **Et design, der flytter arbejde væk fra sted A "for at undgå fejl X", skal
  efterprøves for om sted B kan give X via en ANDEN mekanisme.** xG-sweep'et
  (`syncXgCore`) flyttede eksplicit væk fra minut-synken, fordi
  `hentFaerdige` kaster ved timeout med fejlen slugt. Men sweep'et
  (`syncSuperligaSweep`, `functions-platform/index.js:438`) har INGEN
  eksplicit `timeoutSeconds` — modsat alle sine søskende, der sætter den
  bevidst (minut-synk 120s, `syncGameKickoffsNow` 120s,
  `syncSuperligaResultsNow` 300s) — mens den nye kode tilføjer op til
  `XG_LOFT` SEKVENTIELLE eksterne kald PR. SPIL, hver enkelt kun bundet af
  et PER-KALD-timeout (`AbortSignal.timeout(10000)` i `hentOpt()`), ikke af
  et loop-timeout. Værste tilfælde (langsom, ikke-nede kilde) er
  `XG_LOFT × 10s × antal spil` — langt over en typisk 60s-standardtimeout —
  og en platform-timeout kan IKKE fanges af try/catch: hele kørslen dræbes,
  og `skrivDriftStatus` for det spil (og ethvert spil efter det i loopet)
  skrives aldrig. Samme symptom som det, designet eksplicit undgik — bare
  via en anden dør. Spørg altid ved nyt maskineri i en EKSISTERENDE
  scheduled function: har værtsfunktionen et eksplicit tidsbudget, sat ud
  fra den NYE arbejdsmængde (worst-case sekventielle kald), ikke kun den
  gamle?
## Konkrete tal i dette repo (efterprøv, gæt ikke)

- `syncSuperligaSweep`: cron `25 2,13-23 * * *`. Største NORMALE hul er
  02:25 → 13:25 = **11 timer**, ikke 2. En "forældet efter 2 timer"-regel
  ville lyse rødt 10 timer hver eneste nat.
- `syncSuperligaResults`: cron `* 12-23 * * *` = 720 kørsler/dag × 2 spil i
  `SYNCED_GAMES`. Kørslen er BEVIDST optimeret til at koste ét tomt opslag på
  et stille minut. Enhver ubetinget skrivning pr. minut river optimeringen i
  stykker.
- `syncGameKickoffs`: cron `10 6 * * *` → >26 timer er en rimelig tærskel.
- Sweep'et ER i forvejen alarmen for minut-synken ("N facit som minut-synken
  IKKE nåede"). Minut-synken behøver derfor ikke sin egen hjerteslags-måler.
- Manuelle "kør nu"-callables skal have SAMME timeout i klient og server —
  fundet forkert to gange (`syncGameKickoffsNow`, `syncSuperligaResultsNow`
  havde v2-default 60 s, mens klienten ventede 120-300 s). Tjek altid begge
  ender, når en knap kobles på en callable.
- `AdminPage.jsx` i PLATFORM_MODE viser **10** faner (talt aug. 2026), ikke
  12 — i en `display:flex` UDEN `flexWrap`. Hver ny fane presser bjælken.

## Faste steder at kigge

- **Badge på Admin-linket:** `src/components/Layout.jsx` `CountBadge` — allerede
  rødt (`var(--c-err)`) og brugt til ventende godkendelser. Et nyt "rødt badge"
  samme sted er visuelt umuligt at skelne fra det gamle. Giv det egen form,
  egen `title` og egen `data-testid`.
- **Liga-medlemskab: én skrivning, tre afledte flader.** `memberUids` skrives
  KUN server-side; `syncPlayerLeagues` (`functions-platform/index.js:261`)
  spejler den ned i `players/{uid}.leagueIds` OG i `leagueIds` på ALLE
  spillerens `bets` (`playerLeagues.js:70-87`). Genimplementér den aldrig i en
  ny callable — arrayUnion på liga-dokumentet er hele arbejdet. To
  konsekvenser, en plan skal skrive højt: (1) tilføjelse afslører spillerens
  HELE tip-historik for ligaen og omvendt (rules-kommentar 774-780), (2)
  `applyMembershipDelta` SPRINGER TAVST OVER en uid uden players-dokument
  (`playerLeagues.js:48`) — medlem i memberUids, men uden `leagueIds`.
  Fjernelse er derimod fuldt fortrydelig: gen-tilføjelse rører alle bets igen,
  ikke et øjebliksbillede. `useGameStandings.js:54` viser TOM stilling ved nul
  ligaer — det er hvad et fjernet medlem ser.
- **`redeemLeagueCodeCore` AUTO-godkender og AUTO-tilmelder spillet**
  (`gameLeagues.js:67-76`). En ny liga-tilmeldingsvej, der i stedet AFVISER
  ikke-deltagere, er en anden adfærd for samme handling — vælg bevidst og
  begrund det, ellers har huset to svar på "må han være med?".
- **Mønster for en log-flade:** `emailLog` + `useEmailLog.js` + `EmailLogTab.jsx`
  + rules `allow read: if isGlobalAdmin(); allow write: if false;`. Genbrug
  det frem for at opfinde et nyt.
- **`firestore.rules` er ÉN fil for BEGGE projekter** (tour-85928 og spil-89af9)
  — enhver regelændring rammer begge apps.
- **Tour-appen er på pause, men dens 7 `onSchedule` i `functions/index.js`
  kører videre** (syncTourResults, syncStartlist, snapshotRanks, tipReminders,
  generateLeagueRecaps, syncStageTimes, enrichRiderTags). "Appen er på pause"
  er ikke det samme som "maskineriet er stoppet".
- **Global admin har allerede en klient-læse-bypass på de fleste samlinger**
  (`games/{g}/bets`, `players/{uid}/detalje/{d}` starter med
  `allow read: if isGlobalAdmin()`), men IKKE på `questionAnswers`
  (liga-spørgsmål) — der er en callable ægte nødvendig. Skriv den rigtige
  begrundelse for en admin-callable ("vi vil ikke have andres data i admins
  browser, ikke fordi reglen forbyder det"), ellers "forenkler" en senere
  ændring den til en klient-query, hvor det rent faktisk ville lække.
- **En tæller bygget på en query, der er indsnævret for at matche en
  læseregel, tæller "hvad jeg må se", ikke "hvad der findes".** Fundet
  konkret på et svar-antal, der altid var 0 eller 1 på et åbent spørgsmål.
- **Dokumentation der historisk er drevet fra virkeligheden:**
  `docs/admin-guide.md`, `docs/drift.md` — begge er rettet flere gange for at
  love en knap eller et vindue, koden ikke (længere) gav. Efterprøv enhver ny
  docs-sætning med et tal (cron, vindue, "sendt på aftenen hvor X pauser") mod
  den faktiske kode, ikke mod øjemål.

## Holdfarver & `games/{id}.teams` (aug. 2026)

- **`games/{id}.teams` bærer POINT, ikke kun farver.** `teams[].elo` er SEED
  for `recomputeSeasonElo` og genprissætter alle ulåste kampes odds;
  `teams.length` styrer `expectedPlayed`, dvs. om den officielle tabel
  godtages ved pulje-afregning. Et script der "kun skriver teams" rører altså
  point — vagten skal være en hård afvisning ved ændret `elo` eller
  tilføjet/forsvundet hold, ikke kun en udskrift i en diff.
  `teams`-arrayets RÆKKEFØLGE er desuden brugersynlig (`PuljeTip.jsx` tegner
  i array-orden), mens andre flader sorterer selv.
- **Farve-overrides (`games/{id}.teamStyles`, `TeamStylesTab.jsx`) slår kun
  igennem, hvor `badgeFor` bruges** — en liste af "med" (FootballTip,
  TroejeOversigt, GameProfile, useKlubFarver, useSpilTema) og "uden" (læser rå
  `t.color`: FootballTable, EloTable, PuljeTip, eloHistory). En beholdt
  override kan derfor give samme klub to farver på to skærme.
  `TeamStylesTab` viser den EFFEKTIVE farve (override flettet ind), ikke den
  rå `games/{id}.teams`-værdi — fanen kan altså selv maskere den tilstand, man
  prøver at aflæse. Den eneste rå aflæsning er tør-kørslen af
  `scripts/lib/teamsOnly.mjs --teams-only`.
  Blind plet: `↺`-nulstil sammenligner formularens FLETTEDE state mod
  defaults, så et felt uden standardværdi i holdlisten (fx et fremtidigt
  `troejer`) hverken kan ses eller nulstilles som "afviger". Og "Nulstil alle"
  kan slette en BEVIDST override (kildefilen selv anviser nogle, fx Leeds'/
  Spurs' tredjetrøje, som "skal sættes i admin").
  `eloCurrent` har fortsat INGEN læser i repoet (kun skrivere) — advarsler om
  at "ikke røre eloCurrent" peger på det ufarlige felt; faren er `teams[].elo`.

## Nye TAL på en eksisterende flade (plan-gennemgange)

- **Fladen har som regel allerede sagt det.** Kampkortet i `FootballTip.jsx`
  bærer tre udsagn om samme kamp: `MatchElo` (styrke), pick-knappernes point
  (odds) og `LeagueBets` (ligaens tips, egen sammenklappelig sektion efter
  kickoff). Optæl hvad fladen allerede siger, FØR nyt panel lægges på.
- **`MatchElo.jsx:8-15` er husets skrevne præcedens:** Elo-forskellen må ikke
  vises som "hvem er stærkest", fordi odds lægger `ELO.HFA = 60` oveni. Enhver
  "favorit" skal komme af `m.odds`, aldrig af ratingforskellen.
- **Frosne odds har en MODEL-VERSION.** `recomputeSeasonElo` genpriser kun
  ikke-låste kampe (`gameScoring.js:80-82`); spillede beholder oddsene fra
  modellen ved seeding, og `ELO.DRAW_BASE` gik 0,26 → 0,305 midt i en sæson.
  Et sæson-aggregat af "hvad oddsene sagde" blander to modeller — og er
  præcis det tal, model-ændringen blev afgjort på.
- **Procent-reglen, som koden bærer den:** procent om DIG SELV er tilladt
  (`TipsHistorik.jsx:119`), om NAVNGIVNE ANDRE forbudt (`h2h.js:20-23`, og
  testen `Pokaler.test.jsx:159` "viser ALDRIG en procent"). Kollektive tal
  skrives som brøk (`h2h.js:141`: "et opgør er 5-3"). Et tal om et HOLD er
  uden for reglen — indtil det kan klikkes ned på navngivne spillere.
  `Pokaler.jsx:14-18`: et tal om andre kræver, at NEDERST er en historie.
- **Et "ligaens tal" er PR. SEER.** Aggregater over liga-kammerater giver to
  venner i hver sin liga to forskellige tal. Skriv skalaen i labelen
  (`Pokaler.jsx:25-31`), eller udled tallet af kampdata, så det er ens for alle.
- **Spil-evne-matrix til enhver ny fodbold-flade** (`faneVises`,
  `GamePage.jsx:55-61` + `scripts/games.mjs`): `tour2026` er cycling → alle
  `football: true`-faner falder væk, og en fodbold-rute skal gate på
  `game.type`; `vm2026` er finished/externalUrl → ingen kampe i platformen;
  `pl2627-efteraar` har INGEN `game.standings` og er runde 1-18 af 38 — et
  "sæson"-tal dér skal hedde "i dette spil". Kun `superliga2627` har alt.
- **Fane-prisen kan MÅLES:** `scripts/fanebredde.mjs`. `GAME_TABS` = 9 poster
  (`GamePage.jsx:32-52`), 3 synlige ved 375 px, 2 rækker på desktop.
  `ScrollRaekke.jsx` HAR løst "skjult uden markering" — argumentet mod fane
  nr. 10 er pladsen, ikke usynligheden. Citer harnessets tal.
- **Ny rute under `/spil/:gameId` findes ikke.** `App.jsx` har kun bladet
  `/spil/:gameId`; fanen er en query-param (`gameTabPath`). Et dybt link kan
  laves som parameter og beholder GameLayout, fanerække og tilbage-knap — en
  ny rute skal genskabe alt det OG `isMember`-gaten (`GamePage.jsx:107`).
- **Et holdnavn er ikke en URL-nøgle.** `teamInfo()` matcher EKSAKT på `name`,
  mens fladen viser `vis`. `short` er unikt pr. spil og er den rigtige nøgle.
- **`game.eloHistory` har huller pr. konstruktion** — snapshot kun når en HEL
  runde er spillet (`gameScoring.js:127-134`). En udsat kamp giver intet
  punkt; en kurve, der bare forbinder punkterne, lyver om tidsaksen.
- **En N-dokument-læsning må ikke blankes af ét afslag.** `detalje/opdeling`
  læses pr. uid med en rules-`get()` (`firestore.rules:790-794`);
  `useSpillerOpdeling` kan ÉT uid og gør ét `permission-denied` til hele
  panelets fejl. En flade over 13 spillere skal tåle, at én forlod ligaen.
- **Et regnelag uden forbruger kan være rigtigt at lande.** `holdStatistik.js`
  (trin 1) landede med fire eksporterede funktioner, kun én af dem kaldt
  (`ensomRet` via `ensomRetLinje`) — resten venter til trin 3/4. Ikke en halv
  rettelse, fordi den REVIDEREDE plan eksplicit sekventerede det sådan, og
  commit-teksten sagde "trin 1+2" ærligt (overclaimede ikke "hold- og
  kampstatistik" som færdig). Spørg i stedet: matcher PR-teksten det faktiske
  omfang, og er den ubrugte del enhedstestet mod de afgørelser (B1-B4-typen),
  senere trin skal holde?
- **Et gulv (`ENSOM_MINIMUM`-typen) kan sjældent efterprøves mod ægte
  ligastørrelser** — de er brugerdata, ikke i repoet. Eneste proxy fundet:
  `docs/drift.md` "Runde-Botten poster ikke ... ligaen har under 2 medlemmer",
  dvs. ligaer helt ned til 2 findes. Et gulv på 3 vil altså ALDRIG binde for de
  mindste ligaer — acceptabelt, hvis det er en bevidst, begrundet konstant
  (som her: "2 tips er en mønt"), men nævn eksplicit at det ikke kan verificeres
  mod produktionstal, kun mod ræsonnementet.
- **Et aggregat af ODDS-VÆRDIER er model-blandet; en FAVORIT-IDENTITET er
  model-invariant.** Skellet er skarpt og afgør, hvad der må aggregeres.
  Værdierne har skiftet skala midt i en sæson (`ODDS.MAX 6,0` fjernet og
  `DRAW_BASE` 0,26 → 0,305 den 7/8-2026, commit `3cedbd3`), og
  `recomputeSeasonElo` genpriser kun ULÅSTE kampe — spillede beholder deres
  frosne pris. Superligaens runde 1-2 (spillet 24/7 og 1/8) bærer derfor den
  gamle model, resten den nye. Men hvem der er FAVORIT er uændret: loftet
  klipper kun høje odds, `MIN` kan kun binde ét udfald, og DRAW_BASE flytter
  kun X. Tæl favoritter frit — gennemsnit aldrig odds over tid.
- **"Markedets syn" findes ikke i dette hus.** `outcomeOdds` er FAIR odds af
  vores egen Elo (`superligaScoring.js:367`, ingen vig — `1/odds` summerer til
  1 og kan bruges direkte som sandsynlighed). Et gennemsnit af holdets odds er
  derfor en omskrivning af Elo-tabellen, ikke en ekstern kilde: målt på PL's
  180 efterårskampe med seed-Elo følger snit-sejrsodds (Arsenal 1,90 → Hull
  City 10,02) Elo-rækkefølgen på nær to bytninger. Et "nyt" tal, der rangerer
  som fanen ved siden af, er ikke nyt.
- **Et "overraskelses"-tal uden fortegn måler holdets ANSEELSE, ikke dets
  præstation.** Odds på det faldne udfald er høj både når holdet chokerer og
  når det kollapser, og den er strukturelt høj for et svagt hold. Det
  retningsbestemte alternativ er point over/under forventning (faktiske
  tabelpoint minus Σ(3·p_sejr + 1·p_uafgjort)) — det har fortegn og kan
  sammenlignes. Samme klasse som "Modigst i minus".
- **Et felt, der bliver URL-nøgle, skal ind i den vagt, der beskytter
  dataen.** `short` er målt unik (20 PL, 12 SL) og er den rigtige nøgle, MEN
  `teamsVagt` (`seedFootball.js:363`) afviser kun ændret `elo`, tilføjede,
  forsvundne og dubletter — `short` passerer som en linje i en udskrift. Bliver
  short en delbar URL, dør hvert delt link tavst ved en kosmetisk
  `--teams-only`-kørsel. Udvid vagten SAMTIDIG med nøglen.
- **Et delt link overlever ikke login.** `ProtectedRoute.jsx:9` gør
  `<Navigate to="/login" replace />` uden `from`-state, så en modtager, der
  ikke er logget ind, mister URL'en helt. Lover en plan "delbart", er det kun
  sandt for en allerede logget-ind bruger. (Efter Deltag bevares query'en
  derimod — `GamePage` re-renderer på samme URL.)
- **"Runden er færdig" har TRE forskellige definitioner i dette repo, og de
  giver forskellige svar samtidig.** (1) `faerdigeRunder(matches)`
  (`rundeSejre.js:35`): HVER kamp i runden har facit — bruges af Rundekongen.
  (2) `rc.combiSettled === rc.combiCount` (kuponen = rundens UGE, `iVindue` i
  `pointOpdeling.js`): bruges af `snapshotRoundRanks` (`gameScoring.js:557`),
  af Runde-Botten og af `roundSettled` i `tipsHistory.js:120`. (3) At der
  overhovedet findes en nøgle i `perRound`. En udsat kamp (SL runde 3 strakte
  sig 7/8–3/9) river (1) og (2) fra hinanden i ugevis. Enhver ny flade med et
  rundetal skal sige HVILKEN definition den bruger — og især: pilen i
  stillingen følger (2), så et rundetal efter (1) eller (3) kan stå og
  modsige pilen lige ved siden af.
- **`perRound` kan IKKE skelne "0 point" fra "deltog ikke".**
  `opdelPoint`s `laegTil` (`pointOpdeling.js:339`) har `if (!v) return;`, så
  en runde, hvor alle spillerens afgjorte tips gav præcis 0 (et forkert 1X2-tip
  uden Chancen giver 0 — `outcomePoints`), får slet INGEN nøgle. En plan, der
  skriver "manglende nøgle = `–`, nul = `0`", er derfor uimplementerbar af
  `perRound` alene; skellet kræver en anden kilde (bets/detalje) eller at
  reglen skrives om. Harmløst for `rundeSejre` (nul vinder alligevel ikke) —
  farligt for ethvert tal, der VISES.
- **`ligaPoint` og serverens total gulves begge ved 0** (`ligaPoint.js:69`,
  `opdelPoint`s `Math.max(0, …)`). `total − total_uden_runde` er derfor IKKE
  lig `perRound[r]`, når summen er negativ. Et "delta"-tal og et
  "rundens point"-tal er to forskellige tal nær gulvet.
- **Spørg "hvor mange kampe er der SPILLET i dag?", ikke "hvor mange rundet
  har spillet?"** Kampprogrammet ligger i repoet og kan tælles:
  `scripts/premier-league-fixtures-2627.json` (nøgle `fixtures`, R1 21/8-2026)
  og `scripts/superliga-fixtures.json` (R1 24/7-2026). Ved en flade født i
  august 2026 er n=1 kamp pr. PL-hold og n≈5 pr. SL-hold NORMALTILFÆLDET, ikke
  kanten — en "tom tilstand" er så hele fladen på lanceringsdagen.
- **Opfølgning (kode, samme feature):** alle tre plan-fund blev lukket
  konsekvent — `–` (ikke et gættet 0) står ÉT sted (`RundeCelle`, delt af
  podie og liste), Rundekongens og den foreløbige krones tekster er skrevet
  side om side i `FootballHelp.jsx`, og `rundePoint.js` bruger udelukkende
  definition (3) uden at blande (1)/(2) ind. Pilen er IKKE rettet — i stedet
  en overskrift, der binder rundetallet til "tallet ved siden af totalen" og
  dermed ikke til pilen. En reel mitigation, ikke en fjernelse af problemet:
  spørg stadig ved fremtidige rundetal, om pilen (definition 2) står i samme
  række.
- **To identiske emoji med forskellig betydning på samme skærm er IKKE løst
  af en hjælpetekst alene.** `Pokaler.jsx:112` (👑 Rundekongen, ENDELIG) står
  direkte OVER podiet/listen, der nu også bruger 👑 for en FORELØBIG
  rundeleder (`GameStandings.jsx`) — kun tooltip/aria-label/hjælpetekst
  skelner, ingen visuel forskel (farve, form). Spørg ved en ny inline-emoji:
  findes glyffen allerede på samme skærm med en anden betydning, og er svaret
  et andet symbol, ikke kun tekst?
- **En bar `<table>` uden `.table-wrap` (`GameStandings.jsx`, liste under
  podiet) arver hele mobil-bredde-risikoen forstærket, hver gang en kolonne
  føjes til.** `SpillerNavn` har hverken trunkering eller `nowrap`. Rundens
  point-kolonne blev tilføjet uden at rette dette — kommentaren i koden
  erkender det ("en kolonne æder bredde på en telefon") men løser det ikke.
  jsdom-tests kan ikke se ombrydningen. Enhver ny kolonne her skal enten
  begrunde bredden eksplicit eller lukke `.table-wrap`-hullet.

## Holdsiden — koden efter plan-blokeringen (6b1cbb9, aug. 2026)

- **En hjælper, der bliver lavet FORDI planen kræver den, kan stå ubrugt ved
  siden af sin egen genopfindelse.** `teamByShort()` blev skrevet i
  `teamInfo.js` netop for hold-URL-opslaget, men `HoldSide.jsx` genopfinder
  samme `find`-udtryk inline i stedet for at importere den. Grep for kaldere
  af en ny eksporteret funktion, ikke kun for dens eksistens.
- **En testfils docstring kan love en dækning, filen ikke har.**
  `holdIndgange.test.jsx` skriver eksplicit, at "pulje-tippet og det indbyrdes
  opgør ... står her som fraværs-assertions" — men filen har ingen test for
  hverken `PuljeTip` eller `Indbyrdes`. Den dispositionerede listes NEJ-linjer
  var kun i planen, aldrig kodet. Læs testfilens EGEN påstand om, hvad den
  dækker, og efterprøv den mod de faktiske `it`-blokke — en overclaimet
  kommentar er lige så farlig som en overclaimet PR-tekst.
- **Et tal, der begrunder en gate, hører til reglen "et tal uden kode er en
  påstand" — også når det står i et kode-JSDoc, ikke kun i en PR-tekst.**
  `favoritTal`s dokumentation citerer "Hull City er favorit i 0 af sine 18 PL-
  kampe, Arsenal i 17 af 18" som begrundelse for at SKJULE kortet ved nævner
  nul. Tallet forudsætter enten hele efterårets 18 runder spillet, eller er
  regnet på fixturelisten + odds-modellen uden faktiske resultater — og der
  findes intet script i `scripts/`, der reproducerer det. Et sådant tal skal
  enten have et harnest, eller formuleres som eksempel/illustration, ikke som
  en målt kendsgerning.
- **`docs/admin-guide.md:20` ("Kun platformen: ...") er selv et spejl af
  `AdminPage.jsx`s fane-liste, uden test.** Liga-medlemmer-fanen (#61) landede
  helt korrekt i koden — samme emoji i nav og kortoverskrift, gate't rigtigt,
  paritetstest i `scripts/fanebredde.test.mjs` — men denne linje i docs blev
  ikke rettet, selv om alt andet var grønt. En ny/fjernet PLATFORM- eller
  Tour-fane skal grep'es mod denne linje i SAMME PR, ikke kun mod
  `fanebredde.mjs`. To spejle af samme fanerække, ikke ét.

## `scripts/maal-xg.mjs` — xG mod facit, hele sæsonen (aug. 2026)

- **Reproduceret præcist:** 26/50 (52 %) uenige, 13/37 (35 %) reel 1-mod-2-
  vending, SL 8/23 (35 %), PL 5/14 (36 %). Scriptet bruger de ÆGTE providere
  (`functions-platform/syncProviders.js`), ingen Firestore, ingen kopi-fixture.
- **En "mister afgjorte"-kolonne, der ikke trækker allerede-forkerte fra, er
  inflateret.** `baandtabel()` tæller enhver afgjort kamp, båndet nu kalder X,
  som "prisen for at ramme X" — men halvdelen af dem var allerede forkerte FØR
  båndet (xG pegede allerede på det forkerte hold), så båndet kun ændrede
  HVILKEN forkert gætning, ikke fra rigtig til forkert. Målt konkret ved
  d=0,25: `misterAfgjort=4`, men kun 2 var reelt korrekt→ødelagt. Den samlede
  "uenige i alt"-kolonne er stadig korrekt (sammenligner direkte, uafhængigt
  af historik), så hovedkonklusionen ("intet bånd forbedrer billedet") holder
  — men enhver, der citerer "båndet ødelagde N korrekte gæt", overciterer.
  Spørg ved fremtidige båndtabeller: tæller "prisen" kun kampe, der gik fra
  RIGTIGT til FORKERT, eller alle kampe der endte som X uanset udgangspunkt?
- **n=37 afgjorte kampe giver en 95 %-konfidens på ca. ±15 procentpoint**
  (35 % ± 15, dvs. reelt ca. 20-51 %) — 25 % vs. 35 % kan sagtens være støj
  ved denne stikprøvestørrelse. For at presse båndet ned til ±5 point kræves
  groft 300-350 afgjorte kampe, dvs. en hel sæson eller mere i begge ligaer.
  Et sådant tal må konkluderes RETNINGSBESTEMT ("xG er for ofte uenig til at
  bære en prognose-flade"), aldrig som en præcis procent, før n er markant
  større.
- **xG findes KUN for FÆRDIGE kampe** (`docs/drift.md:115`) — det er
  retrospektiv "chancekvalitet", ikke en prognosemodel. En "alternativ
  stilling" bygget på streng xG-sammenligning tvinger ALLE uafgjorte kampe
  (26 % af datasættet) om til et opfundet vinderhold — garanteret forkert for
  netop de kampe, ikke bare usikkert — oveni den 35 % reelle vendingsrate på
  de afgjorte. Det gør "alternativ stilling" til den mest sårbare af xG's
  planlagte flader. Et kampkort er tryggere, FORDI xG kun kan vises
  retrospektivt (findes ikke før kampen er spillet) og derfor ikke kan
  forveksles med en prognose, hvis teksten holder sig til "chancerne pegede
  på …", aldrig "burde have vundet" (samme fælde som `MatchElo.jsx`).

## Pilen (`previousRank`) — fire forbrugere af ét afledt tal

- **`previousRank` har FIRE forbrugere; ret aldrig kun den ene.** Serverens
  snapshot (`snapshotRoundRanks`, `gameScoring.js:343`) skrives kun når en
  rundes KUPON er afgjort, og kun én gang pr. runde — det kan ligge FLERE
  runder tilbage. Læserne er: (1) listens ▲▼ i `GameStandings.jsx:329` —
  **podiet (`:499-531`) viser aldrig pil**, kun listen; (2)
  `FootballTip.jsx:247-256` → `:363-378`, rundens facit ("▲2", "⬆ Du
  overhalede X") OG delingsteksten `buildFacitShare`; (3) `gameRecap.js`
  Runde-Botten via `lokaleRanger` — den ER frisk, for snapshottet tages i
  samme trigger lige før botten fyrer; (4) Tour-appens `StandingsTable.jsx`
  (egne data). Dertil gen-regner `ligaRanking` (`gameStandings.js:109-128`)
  pilen af `_foer`, og `gameRecap.js:373` har sin EGEN kopi af samme greb.
  Ændrer man pilens betydning ét sted, siger to faner det modsatte om samme
  runde. Grep på `previousRank` finder alle seks — brug den listen, ikke ét
  fund.
- **En hjælpetekst om et symbol skal efterprøves dér, hvor symbolet ALDRIG
  vises.** "Står der ingen pil, har du holdt din plads" er falsk for top tre,
  fordi podiet ikke tegner pile: nr. 2 og 3 kan bytte plads uden mærke — det
  skete i selve PR'ens testfixture. Spørg ved enhver "hvis der ikke står X,
  betyder det Y": findes der en flade, hvor X aldrig KAN stå?
- **"Totalen uden rundens bidrag" er ikke "stillingen, da runden begyndte".**
  Point, der lander i en ANDEN rundes nøgle undervejs (udsat kamp — SL runde 3
  strakte sig 7/8-3/9 — eller `UDEN_RUNDE`-nøglen), sidder i BEGGE totaler og
  bliver dermed usynlige for pilen, selv om spilleren reelt rykkede. Vælg
  ordlyd derefter ("hvad runden gjorde ved din placering"), ikke "siden runden
  begyndte".
- **En per-kilde-opdeling, tilføjet for ikke at argumentere af gennemsnittet,
  skal også rette KONKLUSIONSTEKSTEN.** `scripts/maal-xg.mjs`: efter
  opdelingen viser PL-tabellen 9 → 8 → 7 → 7 uenige ved bånd 0-0,75 (båndet
  FORBEDRER altså billedet dér), mens sluttekstens "ingen af de prøvede bånd
  forbedrer uenige i alt" kun er sand for det samlede tal. Regnskabet selv er
  efterprøvet: for alle 15 rækker gælder
  `uenige(d) = uenige(0) − vundetX + mistetRigtig`, og de to spil summer
  additivt til totaltabellen.

## Efterprøvning af de fem B1-B5-fund (commit 57a5221, aug. 2026)

Alle fem lukket og bekræftet i koden (navn "xG (målchancer)" er ledigt —
"Chancen" bruges udelukkende om pointmekanikken overalt i repoet; xG-linjen er
en sibling UNDER `.match-card__lineup`, OVER `<MatchElo>`, uden for
`.match-card__meta`; `maalModXg` regnet efter i hånden — hjemme/ude byttes
korrekt, `xgImod` er modstanderens xG; gulv er `if (!kampe) return null`, ikke
`FORDELING_MINIMUM`; `harXg`/`XG_PROVIDERE` er en allowlist, spil-bred, ikke
pr. kamp). To ting var IKKE fuldt lukket, selv om alt er grønt:

- **Tripwire-testen, jeg efterlyste her, findes nu — rettet efter PR #186.**
  `spilEvner.test.js:81-89` spejler `harXg` mod `GAMES` (`scripts/games.mjs`),
  side om side med `harKickoffSynk`/`harResultatSynk` (samme describe-blok,
  `'spejling mod scripts/games.mjs'`, linje 70). Testens egen kommentar
  begrunder hvorfor de tre allowlister kan divergere lovligt: `hentXg` er
  VALGFRI i provider-kontrakten, modsat `hentFaerdige`. Lærdom for næste gang:
  bekræft en påstået mangel ved at LÆSE testfilen (grep på beskrivelsen, ikke
  kun på funktionsnavnet) — en tripwire kan lande i en SENERE PR end den, der
  først bar fundet, og en gammel hukommelses-post skal ikke gen-flages uden at
  være tjekket frisk.
- **"13 ud af 37" ældes uden vagt.** `FootballHelp.jsx` citerer nu et PRÆCIST
  optalt tal fra `scripts/maal-xg.mjs` — sandt i dag, reproduceret. Men
  scriptets EGEN konklusion siger ±15 procentpoint og "citér som RETNING,
  ikke præcis rate — kør igen, når sæsonen er længere fremme". Teksten har
  hverken forbeholdet, en målt-dato, eller en test der binder den til en
  frisk kørsel (kan ikke — scriptet rammer eksterne API'er, ikke lokale
  fixtures). Om nogle måneder er "13 ud af 37" bare forkert, og intet
  bliver rødt. Spørg ved næste tal af denne slags: er det en KVALITATIV
  påstand ("rammer forbi hver tredje gang" — tåler at ældes) eller en
  PRÆCIS optælling ("13 ud af 37" — ældes cifret)? Vælg det første, med
  mindre tallet regenereres automatisk.
