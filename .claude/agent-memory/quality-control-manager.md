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
