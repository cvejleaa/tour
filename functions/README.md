# Functions — VM 2026 Tippekonkurrence

Cloud Functions til VM 2026 tippekonkurrence (Firebase Functions v2, Node 20, region europe-west1).

## Funktioner

| Funktion | Trigger | Beskrivelse |
|---|---|---|
| `onUserCreate` | Auth: beforeUserCreated | Opretter `users/{uid}` med rolle og status |
| `recomputeMatch` | Firestore: onWrite `matches/{id}` | Beregner point for alle bets når resultat sættes |
| `recomputeBonus` | Firestore: onWrite `bonusQuestions/{id}` | Beregner bonuspoint når facit sættes |
| `buildKnockout` | Callable (owner/matchAdmin) | Bygger knockout-bracket fra grupperesultater |

## Deploy

```bash
# Installer afhængigheder
cd functions && npm install

# Deploy alle functions
firebase deploy --only functions

# Deploy kun én funktion
firebase deploy --only functions:recomputeMatch
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
# Scoring/standings-tests (kræver IKKE emulator)
cd functions
npx vitest run scoring.test.js standings.test.js

# Firestore rules-tests (KRÆVER emulator):
# 1. Start emulator: firebase emulators:start --only firestore
# 2. I nyt terminalvindue:
npm run test:rules
# eller fra projektets rod:
# FIRESTORE_EMULATOR_HOST=localhost:8080 npx vitest run --config vitest.rules.config.js
```

## Miljøvariabler

| Variabel | Beskrivelse |
|---|---|
| `OWNER_EMAIL` | Owner-email (default: `cvejleaa@gmail.com`) |
| `FIRESTORE_EMULATOR_HOST` | Emulator-host til lokal udvikling |
| `GOOGLE_APPLICATION_CREDENTIALS` | Sti til serviceAccount-fil (seed-script) |

## Filer

- `index.js` — Cloud Functions definitioner
- `scoring.js` — Autoritativ pointlogik (spejler `src/lib/scoring.js`)
- `standings.js` — Grupperangerings-logik (testbar ren funktion)
- `scoring.test.js` — Tests for scoring (ingen emulator)
- `standings.test.js` — Tests for standings/tiebreak (ingen emulator)
- `rules.test.js` — Tests for Firestore-regler (kræver emulator)
