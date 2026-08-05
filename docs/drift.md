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
3. Sæt **startAt** og **puljeLockAt** i Admin → Spil-planlægning.
4. Inviter spillere. Ligaer oprettes af spillerne selv; koden i invitationslinket
   tilmelder dem i ét klik.
5. **Backfill liga-adgang** — kun nødvendig hvis liga-medlemskaber er kommet ind
   uden om appen (dataimport). Triggeren holder det ellers selv opdateret.

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
- `seedSuperliga` (default false) — skriver hele kampprogrammet.

## Hvis noget ser tomt ud

| Symptom | Sandsynlig årsag |
|---|---|
| Stillingen er tom for alle | `players/{uid}.leagueIds` mangler → kør backfill, eller brug 🔐 **Genopbyg liga-adgang** i Admin → Spil-planlægning |
| "Ingen tips at vise fra dine ligaer" på en spillet kamp | `bets.leagueIds` mangler (tip skrevet før feltet fandtes) → samme backfill |
| "Kunne ikke hente ligaens tips" | Composite-indexet `bets` (matchId + leagueIds) er ikke bygget færdigt → tjek Firestore → Indexes |
| Stillingen viser kun dig selv | Du er ikke med i en liga endnu — det er den forventede visning |
| Runde 1 mangler i spillet | `game.startAt` ligger efter runde 1. Det er tilsigtet; ryd feltet for at vise alt |
| Point mangler for tidlige runder | Samme gate. Efter et skift i `startAt`: tryk 🔄 **Genberegn point** |
| Point er forkerte efter en ændring af selve POINTREGLEN | 🔄 **Genberegn point** hjælper IKKE — se afsnittet nedenfor |
| Ingen påmindelser sendt | Kampene ligger før `startAt`, eller `SMTP_PASSWORD` mangler i `spil-89af9` |
| Runde-Botten poster ikke | `ANTHROPIC_API_KEY` mangler, ligaen har under 2 medlemmer, eller runden er allerede recappet (`game.recappedRounds`) |

## To slags genberegning — de retter IKKE det samme

Den vigtigste skillelinje i drift, og den nemmeste at falde i: de to knapper
ligner hinanden, men den ene kan ikke rette det, den anden retter.

| Hvad er ændret | Værktøj | Hvorfor |
|---|---|---|
| `game.startAt` (gaten), en liga, en puljeafregning | 🔄 **Genberegn point** (`recomputeGameScores`) | `bets.points` er allerede rigtige; kun totalerne skal lægges sammen forfra |
| **Selve pointreglen** i `superligaScoring.js` — fx træf-bonussen eller combi-formlen | **`rescoreGameBets`** | `bets.points` er kilden til totalen, og de står med det GAMLE tal |

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

**Læs tør-kørslen, før du skriver.** Ved en ren træf-bonus-ændring skal `delta`
være nøjagtig lig antal ændrede — hvert ændret bet flytter sig præcis +1, fordi
combi-formlen ikke rører `bets.points`, og Chancen afregnes uændret til de rene
odds. Scriptet siger det selv med ✓ eller ⚠️. Er de ikke ens, har noget andet
flyttet sig: **stop og find ud af hvad**.

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

**✍️ Ret de gamle opslag** (Admin → 🤖 Runde-Botten) skriver i noget, spillerne
allerede har læst, og der er **ingen fortryd-knap**. Gør derfor to ting, før du
trykker:

1. Forhåndsvis, og gem svaret. DevTools → Network → kaldet til
   `retGamleRundeOpslag` → **Copy response** → gem filen. Den indeholder
   `gammelTekst` for hvert eneste opslag og er din rigtige backup — der
   dannes ingen artefakt, som `rescore-bets`-workflowet ellers gør.
2. Kontrollér i forhåndsvisningen, at antallet passer, at tidspunkterne ligger
   før rettelsen blev rullet ud, og at der faktisk står **fremmede navne** i
   hver gammel tekst. Sidder tallene ikke lige, så skriv ikke.

**Gendannelse** sker i hånden i Firestore-konsollen — det er typisk under ti
dokumenter. For hver besked under `games/{gameId}/leagues/{leagueId}/messages`
med `uid == 'runde-bot'` og feltet `oprindeligTekst`:

1. Kopiér `oprindeligTekst` ind i `text`.
2. **Slet** `oprindeligTekst` og `rettetAt`.

Trin 2 er ikke pynt. Bliver `oprindeligTekst` stående, springer en senere kørsel
beskeden over — og står den med den *rettede* tekst, er originalen væk for
altid. Væggen er live, så spillerne ser ændringen med det samme.

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
