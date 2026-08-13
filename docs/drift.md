# Drift: de manuelle workflows

Alt her køres i hånden fra **GitHub → Actions → vælg workflow → Run workflow**.
De rører produktionsdata direkte (Admin SDK, uden om security rules), så de
fleste har et **`dryRun`-flueben, der som standard er slået TIL**. Kør altid
tør-kørslen først og læs loggen, før du slår den fra.

> `dryRun` fejler **åbent**: glemmer man at sætte miljøvariablen i et script,
> skrives der rigtigt. Brug altid workflow-formularen frem for at køre
> scriptsene manuelt.

## Oversigt

| Workflow | Hvad den gør | Hvornår | Secrets |
|---|---|---|---|
| **Deploy platform** (`deploy-platform.yml`) | Bygger og udruller tip.vejleaa.dk: hosting, `firestore.rules`, indexes — og valgfrit Cloud Functions | Efter hver merge til base-branchen | `FIREBASE_SERVICE_ACCOUNT_SPIL` |
| **Deploy** (`deploy.yml`) | Samme for tour.vejleaa.dk | Når Tour-appen ændres | `FIREBASE_SERVICE_ACCOUNT` |
| **Backfill liga-adgang** (`backfill-player-leagues.yml`) | Genopbygger `leagueIds` på både `players/{uid}` og `bets/{uid_matchId}` ud fra ligaernes `memberUids` | Hvis stillingen står tom, hvis ligaens tips ikke vises efter kickoff, eller efter en dataimport | `FIREBASE_SERVICE_ACCOUNT_SPIL` |
| **Tjek for dublet-tips** (`audit-duplicate-bets.yml`) | LÆS-ONLY: finder flere tips fra samme spiller på samme kamp | Ved mistanke om snyd | `FIREBASE_SERVICE_ACCOUNT_SPIL` |
| **Ryd e-mails fra offentlige profiler** (`strip-public-user-emails.yml`) | Fjerner `email` fra `users/{uid}`; sikrer først adressen i `userContacts` | Engangs — kørt 27/7 2026 | `FIREBASE_SERVICE_ACCOUNT_SPIL` |
| **Eksportér gamle liga-slutstillinger** (`export-legacy-leagues.yml`) | Top 5 pr. liga fra Tour + VM → `legacyLeagueResults`. Driver "Indsæt top 5" i Send mail | Før en invitationsrunde | `FIREBASE_SERVICE_ACCOUNT`, `…_VM`, `…_SPIL` |
| **Migrér brugere (Tour)** (`migrate-users.yml`) | tour-85928 → spil-89af9 **med bevarede kodeord** | Engangs — kørt | `FIREBASE_SERVICE_ACCOUNT`, `…_SPIL`, `TOUR_HASH_CONFIG` |
| **Migrér brugere (VM)** (`migrate-vm-users.yml`) | vm2026-tip → spil-89af9, **fletter på e-mail** | Engangs — kørt | `FIREBASE_SERVICE_ACCOUNT_VM`, `…_SPIL`, `VM_HASH_CONFIG` |

`*_HASH_CONFIG` er SCRYPT-parametrene fra kildeprojektets Auth-eksport. Uden dem
kan kodeord ikke følge med — så brugerne skal nulstille. De findes kun som
repo-secrets; kan de ikke fremskaffes igen, er en ny migrering ikke mulig med
bevarede kodeord.

## Rækkefølge ved en ny sæson / et nyt spil

1. **Deploy platform** med `seedGames` (opretter/opdaterer spil-dokumenterne).
2. **Deploy platform** med `seedSuperliga`, hvis kampprogrammet skal ind
   (132 kampe + odds fra `scripts/superliga-fixtures.json`).
   For **Premier League** findes der intet workflow-step — begge steps er
   hårdkodet til `superliga2627`. Første seed køres derfor lokalt; se
   "Seed et nyt fodbold-spil" nedenfor.
3. Sæt **startrunde** og **puljeLockAt** i Admin → Spil-tidsplan. Startrunden
   vælges fra en liste over spillets runder med datointerval; vælger man
   ingen, udledes den af den gamle startdato.
4. Inviter spillere. Ligaer oprettes af spillerne selv; koden i invitationslinket
   tilmelder dem i ét klik.
5. **Backfill liga-adgang** — kun nødvendig hvis liga-medlemskaber er kommet ind
   uden om appen (dataimport). Triggeren holder det ellers selv opdateret.

## Seed et nyt fodbold-spil

`scripts/seed-football.mjs` seeder ét spil. Premier League er skåret i to spil
efter runde, så `--runder` bestemmer, hvilken halvdel der kommer med:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json node scripts/seed-football.mjs \
  --game pl2627-efteraar \
  --teams src/data/premierLeagueTeams2026.js \
  --fixtures scripts/premier-league-fixtures-2627.json \
  --runder 1-18
```

Tør-kørsel er default. Ser tallene rigtige ud, køres den igen med `--skriv`.

`--teams` og `--fixtures` opløses mod **repoets rod**, ikke mod den mappe du står
i, så kommandoen virker uanset hvorfra den køres. Men **selve scriptet** skal
findes: står du et andet sted, så skriv den fulde sti til
`scripts/seed-football.mjs`, ellers svarer Node med `Cannot find module` — en
fejl, der ligner en mangel i repoet og ikke er det.

`/sti/sa.json` ovenfor er en **pladsholder**. Sæt din egen sti til
service-account-nøglen ind; scriptet siger fra med det samme, hvis filen ikke
findes.

Scriptet nægter at skrive, hvis et holdnavn i kampprogrammet ikke findes i
holdlisten. Det er med vilje: `teamElo()` giver **tavst 1500** for et ukendt
navn, så hele klubben ville få odds som et midterhold uden en eneste fejlbesked.

**Spillet skal findes først** (`seedGames`). Peger `--game` på et spil, der ikke
er oprettet, siger `--kickoffs-only` pænt `✅ 0 kickoff-tider opdateret` uden at
fejle — så tjek, at tallene ikke er nul hele vejen ned.

**Et rettet holdnavn eller en rettet runde kan ikke seedes ind bagefter.**
Dokument-id'et udledes af runde+hold (Superligaen) eller kommer fra kilden (PL),
så en rettelse opretter en **ny** kamp ved siden af den gamle. Runden får så 11
kampe i stedet for 10, og afregningen venter for evigt på et resultat, der aldrig
kommer. `firestore.rules` har `allow delete: if false` på kampe, og ingen
admin-flade rører `matches`. Den slags kræver et skræddersyet script.

## Kickoff-tider, der flytter sig (Premier League)

Premier League udgiver programmet **før** TV-udvælgelsen. Kun runde 1–5 har
fastlagte tidspunkter; runde 6–38 står med alle ti kampe i samme standard-slot
og bliver flyttet hen over sæsonen — typisk 5–6 uger før kampen.

### Den daglige automatik (primærvejen)

`syncGameKickoffs` retter tiderne **hver morgen kl. 6.10** for de spil, hvis
provider kan levere dem (pt. kun pulselive/PL — Superligaen bruger stadig
workflow-vejen nedenfor). Beslutningerne er SPEJLET fra `--kickoffs-only`
(paritetstestet i `functions-platform/seedFootball.test.js`), så de to veje
giver samme svar: spillede kampe røres aldrig, en tid der står kan aldrig
RYDDES af en rutinekørsel, og en kilde-kamp uden dokument er en alarm.

- **Manuel udløsning:** callablen `syncGameKickoffsNow` (admin) — tør-kørsel
  er default; kun `{ dryRun: false }` skriver. Det er forhåndsvisningen.
- **Stempelfelter:** automatikken skriver `kickoff` + `kickoffSyncedAt`; den
  manuelle seed-vej skriver `kickoff` + `updatedAt`. To felter med vilje —
  så man i Firestore kan se, OM en tid sidst blev rørt af automatik eller
  af et menneske.
- **<48-timers-alarmen:** flyttes en kamp til et tidspunkt under 48 timer ude
  (eller i fortiden), gennemføres ændringen, men der logges en ERROR — et
  menneske skal vurdere, om nogen har nået at tippe med facit i hånden.
  Rules kan ikke annullere tips, der var lovlige under den gamle deadline.
- **Fejlmodellen:** melder kilden en kamp UDEN tid, mens dokumentet har en,
  stopper HELE det spils kørsel den dag (fejlen står som
  "Kickoff-synk … fejlede (ignoreret)" i functions-loggen) — ingen delvis
  plan skrives. De andre spil fortsætter. Den ene kamp skal håndteres
  bevidst (udsat kamp uden ny dato), før spillets synk kører igen.
- **Spillerne får ingen "kampen er flyttet"-notits** — deadline følger bare
  med, og tip-påmindelsen samler kampe op, der flytter ind i dens vindue.
  Det er en bevidst beslutning, ikke en glemt feature.

Det er ikke kosmetik. **Kickoff er tip-deadlinen** (`firestore.rules`), så en
forkert tid lukker kuponen på det forkerte tidspunkt. Og resultat-synken leder
kun efter kampe i et vindue omkring tidspunktet, så et facit ville aldrig lande.

For **Superligaen** er der et workflow-input: `seedKickoffs` (og `seedKickoffsSkriv`,
som er tør-kørsel, indtil den tikkes af). For **Premier League** findes der intet
step — den køres lokalt. Tør-kørsel først; den skriver intet og viser hver
enkelt ændring, i dansk tid:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json node scripts/seed-football.mjs \
  --game pl2627-efteraar \
  --fixtures scripts/premier-league-fixtures-2627.json \
  --kickoffs-only
```

Ser listen rigtig ud, køres den igen med `--skriv`.

Læs især linjen **IKKE SEEDET**. Den tæller kampe, der står i filen, men ikke i
spillet. Aftenen før en runde er det en alarm, ikke en detalje: sådan en kamp har
ingen deadline og kan ikke tippes.

Scriptet **nægter at fjerne** et tidspunkt, der allerede står. En udsat kamp uden
ny dato ser harmløs ud i loggen (`→ —`), men gør tre ting på én gang: reglerne
sammenligner tiden mod `null` og afviser hvert tip, `isLocked` returnerer alligevel
`false`, så knapperne står åbne, og påmindelsen springer kampen over. Det skal
håndteres bevidst, ikke som bivirkning af en rutinekørsel.

`--kickoffs-only` skriver **kun** `kickoff` og `updatedAt`. Den rører aldrig
odds, Elo eller resultat, og den lader en kamp med facit helt være — dens
tidspunkt er historie, ikke en deadline. Den bruger `update`, ikke `set`, så
den kan heller ikke oprette en kamp, der ikke er seedet endnu.

## Rækkefølge ved ændringer i security rules

Reglerne deployes **sammen med hosting**. Strammer man en regel, der kræver et
nyt felt i data, skal feltet udfyldes **først**:

1. Merge ændringen.
2. Kør det backfill-workflow, som udfylder feltet (fortsat på de gamle regler —
   feltet er bare ubrugt indtil videre).
3. Deploy platformen, så de nye regler går live.

Gør man det omvendt, er der et vindue, hvor brugerne ser tomme lister.

## Deploy-inputs, der er værd at kende

`deploy-platform.yml`:
- `deployFunctions` (default **false**) — Cloud Functions udrulles **ikke** ved
  en almindelig deploy. Har du ændret noget i `functions-platform/`, skal det
  sættes til true, ellers kører den gamle backend videre.
- `seedGames` (default false) — skriver spil-dokumenter i produktion.
  På spil, der **allerede findes**, springer seedet `status` og `joinable` over.
  De to felter ejes af Admin → 🗓️ Spil-tidsplan, og listen i scriptet er ældre
  end virkeligheden. Uden den undtagelse ville en seed-kørsel stille rulle et
  spil fra "Afsluttet" tilbage til "I gang" — den skriver med merge, så det
  hverken fejler eller efterlader spor.
- `seedSuperliga` (default false) — skriver hele kampprogrammet. Kører
  `scripts/seed-football.mjs` (som afløste `seed-superliga.mjs`, der var
  hårdkodet til Superligaen). Kampe, der **allerede har odds**, springes over:
  fra seedet og frem er det `recomputeSeasonElo`, der ejer oddsene — de friskes
  op efter hvert resultat frem til kickoff og låses dér. Et gen-seed ville
  skrive dem tilbage til Elo fra den dag, programmet blev lagt ind.
  **Bemærk:** spil-dokumentet (`teams`, `eloCurrent`) skrives altid, også når
  nul kampe skrives. Kørslen er altså ikke en ren no-op midt i en sæson.
  `eloCurrent` sættes tilbage til sæsonstart-værdierne og genberegnes først, når
  `recomputeSeasonElo` kører. Den kører af sig selv **kun**, når en kamps
  resultat ændrer sig — men kan nu også startes manuelt med 💰 **Ompris
  kampene** i Spil-planlægning. Uden den knap kunne Elo-tabellen under en
  landskampspause vise sæsonstart-værdier i op mod to uger, mens grafen
  (`eloHistory`, som ikke røres) viste det rigtige forløb. Holdfarver **og
  visningsnavne** redigeret i admin ligger begge i `teamStyles` og røres ikke.
- `seedKickoffs` (default false) — retter **kun** kickoff-tider. Skriver
  hverken odds, Elo eller resultat, og lader kampe med facit være. Findes,
  fordi `seedSuperliga` efter ovenstående ikke længere kan rette et tidspunkt
  midt i sæsonen: alle kampe har odds, så alle springes over. Uden dette input
  ville en flyttet kamp kræve en produktionsnøgle på en bærbar.

## Hvis noget ser tomt ud

| Symptom | Sandsynlig årsag |
|---|---|
| Stillingen er tom for alle | `players/{uid}.leagueIds` mangler → kør backfill, eller brug 🔐 **Genopbyg liga-adgang** i Admin → Spil-planlægning |
| "Ingen tips at vise fra dine ligaer" på en spillet kamp | `bets.leagueIds` mangler (tip skrevet før feltet fandtes) → samme backfill |
| "Kunne ikke hente ligaens tips" | Composite-indexet `bets` (matchId + leagueIds) er ikke bygget færdigt → tjek Firestore → Indexes |
| Stillingen viser kun dig selv | Du er ikke med i en liga endnu — det er den forventede visning |
| Runde 1 mangler i spillet | `game.startRound` er 2 eller højere. Det er tilsigtet; vælg "ingen gate" for at vise alt |
| Point mangler for tidlige runder | Samme gate. Efter et skift i `startRound`: tryk 🔄 **Genberegn point** |
| En runde vises halvt | Kan ikke ske længere — gaten tæller hele runder. Sker det, er `m.round` ikke sat på nogle af kampene |
| Point er forkerte efter en ændring af selve POINTREGLEN | 🔄 **Genberegn point** hjælper IKKE — se afsnittet nedenfor |
| Ingen påmindelser sendt | Kampene ligger i en runde før `startRound`, eller `SMTP_PASSWORD` mangler i `spil-89af9` |
| Runde-Botten poster ikke | `ANTHROPIC_API_KEY` mangler, ligaen har under 2 medlemmer, eller runden er allerede recappet (`game.recappedRounds`) |

## To slags genberegning — de retter IKKE det samme

Den vigtigste skillelinje i drift, og den nemmeste at falde i: de to knapper
ligner hinanden, men den ene kan ikke rette det, den anden retter.

| Hvad er ændret | Værktøj | Hvorfor |
|---|---|---|
| `game.startRound` STRAMMET (fx 2 → 3), en liga, en puljeafregning | 🔄 **Genberegn point** (`recomputeGameScores`) | `bets.points` er allerede rigtige; kun totalerne skal lægges sammen forfra |
| `game.startRound` LØSNET (fx 3 → 2) | **`rescoreGameBets`** — ikke Genberegn point | Kampe, hvis facit faldt, MENS de var gatet, står med `points: 0`. `recomputeGameMatchCore` returnerer tidligt for en gatet kamp og skriver aldrig et point på den, så der er intet at lægge sammen. Stillingen ville vise for lave tal uden en eneste fejlbesked |
| En LIGAS `startRound` (sat/ændret af ejeren) | Ingenting | Ligaens total regnes i fladen af `players.perRound` — der er intet server-tal at genberegne. MEN: spillere, der aldrig er genberegnet efter udrulningen af `perRound`, mangler vektoren og vises som "ikke klar" — kør 🔄 **Genberegn point** for spillet én gang efter udrulning |
| **Selve pointreglen** i `superligaScoring.js` — fx træf-bonussen eller combi-formlen | **`rescoreGameBets`** | `bets.points` er kilden til totalen, og de står med det GAMLE tal |
| **Odds-modellen** — `ELO.DRAW_BASE`, `DRAW_DECAY`, `ODDS.MIN`, seed-Elo | 💰 **Ompris kampene** (`repriceGameOdds`) | Odds er frosne på kamp-dokumentet. Hverken de to andre knapper eller et deploy rører dem — se nedenfor |

`bets/{id}.points` skrives kun af `recomputeGameMatchCore`, som kun kaldes, når
en kamps **facit ændrer sig**. Ændrer man pointreglen, rører den derfor ikke et
eneste eksisterende bet.

**Fælden:** `recomputeGameScores` er ren aggregering. Efter en regelændring
returnerer den et pænt `{players, gatedMatches}` og ser ud, som om den virkede —
men den retter ingenting, fordi den lægger de gamle bet-point sammen. Symptomet
er, at skærmene modsiger hinanden uden en fejlbesked: Tip-fladen regner den nye
regel live, Mine tips viser det gemte tal, og ⚡ Chancen — som udledes som
(gemte point − 1X2-point) — går i **minus** for alle, der har ramt noget.

### Sådan køres bagfyldningen

**GitHub → Actions → "Genscor bets efter regelændring (spil-89af9)".**

| Felt | Tør-kørsel | Skrivning | Gendan |
|---|---|---|---|
| `gameId` | `superliga2627` | `superliga2627` | `superliga2627` |
| `skriv` | **tom** | præcis `SKRIV` | tom |
| `gendan` | tom | tom | filnavnet fra en backup-artefakt |

`skriv` er en tekst og ikke et flueben med vilje: et flueben er for nemt at
komme til. Alt andet end præcis `SKRIV` tørkører.

**Backup tages ALTID** — også ved tør-kørsel — og lægges op som artefakt på
kørslen (`bets-backup-<gameId>-<run_id>`, gemt i 90 dage). Den indeholder hvert
bets `points` FØR kørslen. De gamle værdier findes ikke i noget andet felt og
ingen historik, så filen er den eneste vej tilbage uden PITR.

**Læs tør-kørslen, før du skriver.** Ved en ren træf-bonus-ændring flytter hvert
ændret bet sig præcis lige meget, fordi combi-formlen ikke rører `bets.points`,
og Chancen afregnes uændret til de rene odds. Sæt derfor `forventetPrBet` til
**(ny bonus − gammel bonus)** — `+1` da den gik 0→1, `-1` da den gik 1→0 — og
kontrollér, at `delta` er `antal ændrede × forventetPrBet`. Scriptet siger det
selv med ✓ eller ⚠️. Passer det ikke, har noget andet flyttet sig: **stop og
find ud af hvad**.

Lades feltet tomt, lyser ✓ aldrig. Det er med vilje: den første udgave af
kontrollen sammenlignede uden fortegn, fordi bonussen dengang gik op. Da den gik
ned igen dagen efter, advarede den på en helt korrekt kørsel — og ✓ kunne kun
lyse, hvis pointene bevægede sig opad. Vi gætter ikke på retningen.

**Tripwiren ser kun på summen.** Havde halvdelen af tippene flyttet sig −2 og
den anden halvdel 0, ville totalen stadig se rigtig ud. Brug derfor
`combi-sammenligning`-workflowet som forkontrol — det er læs-only og giver et
facit **pr. spiller**. Bemærk, at dens "i dag"-kolonne modellerer combi-reglen
fra før 5. august 2026 og er forældet: læs kun "ny"-kolonnen.

**Kørsler indtil nu** — tallene gør den næste kørsel kontrollerbar:

| Dato | Ændring | Ændrede | Delta |
|---|---|---|---|
| 5. aug. 2026 | træf-bonus 0 → 1 | 48 | +48,0 |
| 6. aug. 2026 | træf-bonus 1 → 0 | 48 | −48,0 |

**Kør den ikke, mens en kamp er i gang, eller mens du retter et facit.**
Bagfyldningen læser alle bets, regner, og skriver bagefter. Ændrer et facit sig
imens, ville den skrive sit forældede tal ovenpå — derfor skriver den med en
`lastUpdateTime`-precondition, så et rørt bet får hele batchen til at fejle med
`FAILED_PRECONDITION`. Det er den rigtige reaktion: kørslen er idempotent, så
kør den bare igen, når kampen er afgjort.

Den kalder selv `recomputeAllPlayerTotals` til sidst — **tryk ikke på
🔄 Genberegn point bagefter**, det er allerede gjort.

### Hvis noget skal fortrydes

Hent backup-artefakten fra kørslen, læg filen i repoet, og kør samme workflow
med `gendan` udfyldt. Den skriver hvert bets gamle `points` tilbage og
genberegner totalerne.

Skal selve **reglen** rulles tilbage, er det ikke nok at gendanne: både
functions og hosting skal vendes, ellers regner skærmene stadig den nye regel
mod gamle tal. Rækkefølgen er den samme som frem — kode først, så data.

### Der findes også en callable

`rescoreGameBets` (samme funktion, kaldt over HTTPS med et owner-token). Den er
der, hvis workflowet ikke kan bruges, men **workflowet er den normale vej**: det
tager backup, har tripwiren indbygget, og efterlader et spor. `dryRun` er default
sand, og kun boolean `false` skriver.

## Gendan et rettet bot-opslag

Runde-Bottens allerførste opslag blev bygget af hele spillets felt og nævnte
derfor spillere fra andre ligaer. De blev **taget ned den 5. august 2026** og
erstattet af en fast tekst. Engangs-panelet, der gjorde det, er fjernet igen —
men de ramte beskeder bærer stadig felterne `oprindeligTekst` og `rettetAt`, og
det er dem, en gendannelse bygger på.

**Gendannelse** sker i hånden i Firestore-konsollen — det er typisk under ti
dokumenter. For hver besked under `games/{gameId}/leagues/{leagueId}/messages`
med `uid == 'runde-bot'` og feltet `oprindeligTekst`:

1. Kopiér `oprindeligTekst` ind i `text`.
2. **Slet** `oprindeligTekst` og `rettetAt`.

Trin 2 er ikke pynt: står `oprindeligTekst` tilbage ved siden af en gendannet
`text`, kan man ikke længere se, om beskeden er den oprindelige eller den
rettede. Væggen er live, så spillerne ser ændringen med det samme.

Rør ikke `createdAt`: væggen henter beskeder med `orderBy('createdAt')`, og et
opslag uden det felt forsvinder helt fra tråden.

## Secrets pr. projekt

Cloud Functions-secrets sættes **pr. Firebase-projekt** — de skal altså sættes
to gange, hvis begge apps skal bruge dem:

| Secret | Projekt | Bruges til |
|---|---|---|
| `SMTP_PASSWORD` | begge | Udgående mail |
| `ANTHROPIC_API_KEY` | `spil-89af9` | Runde-Botten |
| `TDF_REFRESH_TOKEN` | `tour-85928` | Tour-datasynk |
