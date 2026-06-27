# Functions — Tour de France tippekonkurrence

Cloud Functions til Tour de France tippekonkurrence (Firebase Functions v2, Node 22, region europe-west1).

## Funktioner

| Funktion | Trigger | Beskrivelse |
|---|---|---|
| `recomputeStage` | Firestore: onWrite `stages/{id}` | Beregner point for alle `stageBets` når en etapes resultat sættes |
| `recomputeBonus` | Firestore: onWrite `bonusQuestions/{id}` | Beregner bonuspoint når facit sættes |
| `syncTipParticipation` | Firestore: onWrite `stageBets/{betId}` | Vedligeholder `tipParticipation/{stageId}` = hvem der har tippet på etapen |
| `backfillTipParticipation` | Callable (owner/globalAdmin) | Genopbygger `tipParticipation` ud fra alle `stageBets` |
| `syncTourResults` | onSchedule | Henter etaperesultater fra Tour-proxyen (letour.fr) og skriver etape-facit |
| `syncTourNow` | Callable (admin) | Kør resultat-synk manuelt (evt. dry-run) |
| `seedTourRoute` | Callable (admin) | Seeder sæsonens etaperute til `stages` |
| `tipReminders` | onSchedule | Sender e-mail til spillere der mangler at tippe på etaper det næste døgn |
| `sendTipRemindersNow` | Callable (admin) | Udløser etape-påmindelserne manuelt |
| `sendTestReminderToMe` | Callable (admin) | Sender en testmail med de første 3 etapedage til admin selv |
| `snapshotRanks` | onSchedule | Gemmer hver brugers placering som `previousRank` |
| `redeemInviteCode` | Callable | Selvbetjent godkendelse via en ligas join-kode |
| `generateLeagueRecaps` | onSchedule | AI-morgenopslag (Tour-Botten) pr. liga |
| `adminSendPasswordReset` | Callable (owner) | Sender nulstillingslink via egen SMTP |

## Deploy

```bash
# Installer afhængigheder
cd functions && npm install

# Deploy alle functions
firebase deploy --only functions

# Deploy kun én funktion
firebase deploy --only functions:recomputeStage
```

## Kør lokalt med emulator

```bash
# Start emulatorer (fra projektets rod)
npm run emulators
# eller: firebase emulators:start

# Seed data til emulator (nyt terminalvindue)
FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed.mjs
```

## Tests

```bash
# Scoring/sync-tests (kræver IKKE emulator)
cd functions
npm test

# Firestore rules-tests (KRÆVER emulator):
# 1. Start emulator: firebase emulators:start --only firestore
# 2. I nyt terminalvindue:
npm run test:rules
# eller fra projektets rod:
# FIRESTORE_EMULATOR_HOST=localhost:8080 npx vitest run --config vitest.rules.config.js
```

## Miljøvariabler / secrets

| Variabel | Beskrivelse |
|---|---|
| `OWNER_EMAIL` | Owner-email (default: `cvejleaa@gmail.com`) |
| `SMTP_PASSWORD` | Secret: adgangskode til SMTP (e-mailudsendelse) |
| `ANTHROPIC_API_KEY` | Secret: API-nøgle til AI-morgenopslag (Tour-Botten) |
| `FIRESTORE_EMULATOR_HOST` | Emulator-host til lokal udvikling |
| `GOOGLE_APPLICATION_CREDENTIALS` | Sti til serviceAccount-fil (seed-script) |

## Filer

- `index.js` — Cloud Functions definitioner
- `tourScoring.js` — Autoritativ pointlogik for etape-tips (`scoreStageBet`)
- `tourSync.js` — Mapper proxy-resultater til etape-facit (`buildStageUpdate`)
- `tourTeams.js` — Hold-/rytter-opslag for Tour-sæsonen
- `pcsMapping.js` — Mapping mod ProCyclingStats-data
- `leagueRecap.js` — Fakta/logik bag AI-morgenopslag
- `invites.js` — Selvbetjent ligatilmelding via join-kode
- `*.test.js` — Vitest-tests (ingen emulator, undtagen `rules.test.js`)
- `rules.test.js` — Tests for Firestore-regler (kræver emulator)
