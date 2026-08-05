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

### Sådan køres `rescoreGameBets`

Der er ingen admin-knap. Kald den direkte med et owner-ID-token:

```bash
# TØR-KØRSEL (default — skriver intet)
curl -sS -X POST https://europe-west1-spil-89af9.cloudfunctions.net/rescoreGameBets \
  -H "Authorization: Bearer $ID_TOKEN" -H "Content-Type: application/json" \
  -d '{"data":{"gameId":"superliga2627"}}'
```

**Læs svaret, før du skriver.** Ved en ren træf-bonus-ændring skal `delta` være
nøjagtig lig `aendrede` — hver ændring er præcis +1,0. Er de ikke ens, har noget
andet end bonussen flyttet sig: **stop**. `eksempler` viser fem konkrete bets med
før/efter.

```bash
# SKRIVNINGEN — kun efter ejerens ja
  -d '{"data":{"gameId":"superliga2627","dryRun":false}}'
```

Kun et eksplicit `dryRun: false` skriver; alt andet tørkører. Den committer i
batches og kalder selv `recomputeAllPlayerTotals` til sidst — **tryk ikke på
🔄 Genberegn point bagefter**, det er allerede gjort.

**Der er ingen vej tilbage i data.** De gamle `bets.points` findes ikke i noget
felt og ingen historik. Tag en `gcloud firestore export` af
`games/{id}/bets` eller bekræft, at PITR er slået til, FØR du kører med
`dryRun: false`. Den praktiske vej tilbage er ikke en restore, men at rulle
koden tilbage og køre `rescoreGameBets` igen — den scorer altid mod den kode,
der er live, og er idempotent.

## Secrets pr. projekt

Cloud Functions-secrets sættes **pr. Firebase-projekt** — de skal altså sættes
to gange, hvis begge apps skal bruge dem:

| Secret | Projekt | Bruges til |
|---|---|---|
| `SMTP_PASSWORD` | begge | Udgående mail |
| `ANTHROPIC_API_KEY` | `spil-89af9` | Runde-Botten |
| `TDF_REFRESH_TOKEN` | `tour-85928` | Tour-datasynk |
