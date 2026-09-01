# Testplan & testrapport

Al kode og UI testes på flere niveauer. Tests køres automatisk i CI på hvert
push/PR (se `.github/workflows/ci.yml`).

## Testpyramide

ANTALLET STÅR IKKE HER. Det stod her — 855, 42, 37 — og var forkert i alle
tre kolonner, fordi suiten voksede og tabellen ikke gjorde. Et hardkodet tal
om noget levende er en løgn med forsinkelse (CLAUDE.md), og at skrive nye tal
ind ville blot nulstille uret på den samme løgn. Tallene findes ét sted, hvor
de er afledt af den faktiske kørsel: **Admin → Tests**, som selv advarer, når
øjebliksbilledet er for gammelt.

| Niveau | Værktøj | Hvad dækkes | Kræver |
|---|---|---|---|
| Unit + komponent/UI | Vitest + Testing Library | Al UI (sider, komponenter, hooks), delt logik — alle scenarier inkl. fejl/kanttilfælde (Firebase mocket) | — |
| Unit (functions, Tour) | Vitest | Autoritativ scoring (inkl. fuzzy bonus) + grupperangering/tiebreak | — |
| Unit (functions, platform) | Vitest | Platform-serveren: spil-scoring, ligaer, synk, kampdetaljer, mails | — |
| Security Rules | Vitest + `@firebase/rules-unit-testing` | Firestore-regler (roller, deadlines, ligaer) | Firestore-emulator |
| E2E | Playwright | UI-flows i rigtig browser | Browser (CI) |

Hele UI'et er dækket udtømmende — hver side/komponent testes i alle tilstande
(loading, fejl, tom, rollebaseret adgang, låst/åben, før/efter deadline,
godkendt/afventer, korrekte/forkerte tip, fuzzy bonus-matchning osv.).

## Oversigt i appen (kun admin)
Under **Admin → Tests** kan administratorer se en komplet oversigt over alle
gennemførte tests (pr. fil og pr. test, med bestået/fejlet-status) samt
afhængighedsdiagrammet. Begge er ØJEBLIKSBILLEDER — to committede JSON-filer,
ikke en måling af suiten lige nu:

```bash
npm run test:report   # skriver src/data/testReport.json OG src/data/depGraph.json
```

Kørslen dækker alle tre suiter: frontend, `functions/` (Tour) og
`functions-platform/` (platformen). Den sidste manglede, fra fanen blev
bygget, til september 2026 — hele platform-serveren var utalt, mens fanen
skrev "Cloud Functions" om Tourens tal.

**Det gøres normalt ikke i hånden.** Actions → *"Opdatér test-rapporten"*
kører den — hver mandag af sig selv, og på knappen når som helst — og
committer de to filer, hvis tallene har flyttet sig. Fanen skifter dog først
ved næste platform-deploy, fordi tallene bages ind i bundtet.

Holder kørslen op med at virke, siger fanen selv fra: er det ældste af de to
øjebliksbilleder over 14 dage gammelt — altså mindst to udeblevne ugekørsler
— står der en advarsel over underfanerne med dato, alder og vejen videre.
Uden den stod tallene fra 27. juni 2026 i over to måneder og påstod 73 filer,
mens suiten var vokset til 252.

## Sådan køres testene

Antallet står bevidst ikke i kommentarerne — se ovenfor.

```bash
# Frontend unit + komponent
npm test
npm run test:coverage          # med dækningsrapport (coverage/)

# Cloud Functions, Tour (ingen emulator)
npm --prefix functions test

# Cloud Functions, platform (ingen emulator)
npm --prefix functions-platform test -- --silent

# Security Rules — kræver Firestore-emulator
firebase emulators:exec --only firestore "npm run test:rules" --project demo-vm2026

# E2E (Playwright) — bygger appen og kører i Chromium
npx playwright install chromium     # første gang
npm run test:e2e
```

## Dækningsområder

### Udtømmende UI-dækning (alle scenarier)
Hver side og komponent testes i alle relevante tilstande. Testfiler (uddrag):
- **Auth/Admin:** LoginPage, PendingPage, AdminPage (rollebaserede faner),
  UsersTab, MatchResultForm, MatchCreateForm, MatchesTab, BonusTab,
  BonusSubmissions, LeaguesAdminTab, useAuthActions, adminActions, firebaseErrors.
- **Tipning/Bonus:** MatchCard (åben/låst/afgjort/knockout/pendingTeams),
  ScoreInput, matchHelpers, MatchesPage (filtre/loading/fejl/tom), MyBetsPage,
  BonusPage (sortering/åbne/låste), BonusQuestion, bonusHelpers, PointRules, Hero, Flag.
- **Ligaer/Rangering/Turnering:** LeaguesPage (opret/tilmeld/godkendelse/fejl),
  leagueActions, leagueUtils, StandingsTable, standingsUtils, LeaderboardPage,
  TournamentPage, computeStandings, teams, ThemeToggle.

Firebase mockes fuldt i alle komponent-tests (ingen netværk).

### Pointlogik (kerne)
- Eksakt score (5), målforskel (3), udfald (2), forkert (0)
- Uafgjort-tilfælde, manglende/ugyldige data
- Knockout: advance-bonus (+2) for korrekt videregående hold
- Bonus: 10 point for korrekt svar
- Functions-spejlet (`functions/scoring.js`) testes identisk, så frontend og
  backend altid er enige.

### Grupperangering (`functions/standings.js`)
- Point (3/1/0), målforskel, scorede mål som tiebreak
- Udvælgelse af de 8 bedste 3'ere til 1/16-finalen

### Auth & Admin
- Oversættelse af Firebase-fejlkoder til danske beskeder
- Login-validering og redirect-logik
- `PendingPage` viser korrekt besked pr. status (afventer/afvist/godkendt)
- **Rolle-adgang:** Brugere-fanen er synlig for globale admins (rolletildeling kun for ejer)

### Tippe-UI
- `ScoreInput` validerer ikke-negative heltal
- "Er kampen låst"-logik (før/efter kickoff)
- Gruppering af kampe efter dag
- `MatchCard` viser låst-tilstand + resultat/point når afgjort
- Bonus kan ikke besvares efter deadline

### Ligaer & rangering
- `StandingsTable` sorterer korrekt og fremhæver egen række
- Generering af unik join-kode
- Filtrering af stilling til ligamedlemmer
- Beregning af dagens point

### Security Rules (emulator)
- Spiller kan **ikke** skrive `points`, `role` eller `status`
- Spiller kan **ikke** ændre egen rolle/status
- Tip kan skrives **før** kickoff, men **ikke** efter
- Kun ejer kan godkende brugere

### E2E (Playwright)
- Uautentificeret bruger sendes til login
- Login-siden viser begge faner
- Validering viser danske fejlbeskeder
- 404-side for ukendt rute
- *(Fulde authentificerede flows — signup → godkend → tip → resultat → point —
  køres mod Firebase-emulatorer; udvides i `e2e/`.)*

## CI-pipeline
`.github/workflows/ci.yml` kører fire parallelle jobs på hvert push/PR:
1. **frontend** – lint + unit/komponent-tests (med dækning) + build
2. **functions** – scoring + standings-tests
3. **rules** – Security Rules mod Firestore-emulator
4. **e2e** – Playwright i Chromium (rapport uploades som artefakt)

## Kendte begrænsninger
- Browser-baseret E2E kan ikke køres i det aktuelle udviklingsmiljø (netværks-
  begrænsning på browser-download); det køres i CI hvor netværk er tilgængeligt.
- Dybe authentificerede E2E-flows kræver kørende emulatorer + seedet data.
