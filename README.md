# Vejleaa Tip 🏆

Tippekonkurrencer til vennekredsen. Ét repo bygger **to apps**:

| App | Domæne | Firebase-projekt | Cloud Functions |
|---|---|---|---|
| **Platformen** (aktiv) | [tip.vejleaa.dk](https://tip.vejleaa.dk) | `spil-89af9` | `functions-platform/` |
| **Tour de France Tip** (afsluttet spil) | [tour.vejleaa.dk](https://tour.vejleaa.dk) | `tour-85928` | `functions/` |

Platformen samler flere spil ét sted (`/spil/{gameId}`) — Superligaen kører der
nu. Tour-appen er det oprindelige, enkeltstående spil; koden ligger stadig her,
fordi platformen er bygget videre på den.

**Hvilken app der bygges, styres af `VITE_PLATFORM_MODE`:**

```bash
npm run build                           # Tour-udgaven (tour.vejleaa.dk)
VITE_PLATFORM_MODE=true npm run build   # platformen (tip.vejleaa.dk)
```

Flaget skifter routing, navigation, hjælpetekster, admin-faner og PWA-branding.
Deploy-workflowet for platformen sætter det selv.

De to functions-mapper kan **ikke** dele kode via `require`: Firebase CLI'en
validerer en codebases secrets mod målprojektet, så de skal være adskilte. Ren
beregningslogik er derfor spejlet — se nedenfor.

## Stack
- **Frontend:** React 18 + Vite, dansk UI, `Europe/Copenhagen`
- **Backend:** Firebase — Auth (e-mail + Google), Firestore, Cloud Functions,
  Hosting, Security Rules (`firestore.rules` deles af begge projekter)

## Kom i gang
```bash
npm install
cp .env.example .env        # udfyld med Firebase web-config
npm run dev                 # udviklingsserver
npm test                    # unit-tests
npm run test:rules          # security rules (kræver kørende emulator)
npm run emulators           # lokale Firebase-emulatorer
```

> ⚠️ `npm run seed` skriver **VM 2026-gruppespilskampe** og overskriver
> eksisterende data. Kør den aldrig mod et produktionsprojekt.

## Hvor tingene er
| Emne | Sted |
|---|---|
| Scoring, Superligaen (1X2, combi, Chancen, pulje, Elo) | `src/lib/superligaScoring.js` ⇄ `functions-platform/superligaScoring.js` |
| Scoring, Tour (etaper, klassementer) | `src/lib/tourScoring.js` ⇄ `functions/tourScoring.js` |
| Per-spil afregning + totaler | `functions-platform/gameScoring.js` |
| Sikkerhedsregler (begge apps) | `firestore.rules` |
| Spil-sider | `src/features/games/**` |
| Tour-sider | `src/features/{tour,leagues,leaderboard,bonus}/**` |

De spejlede scoring-filer skal holdes **identiske** — den ene bruges i browseren,
den anden på serveren. `functions-platform/superligaScoring.test.js` har en
paritetstest, der sammenligner de to udgaver.

## Roller
| Rolle | Kan |
|---|---|
| **Ejer** | Alt — inkl. at udpege/fjerne globale admins og skifte brugeres e-mail |
| **Global admin** | Daglig drift: godkende brugere, spil, resultater, mails |
| **Liga-admin** (pr. liga) | Ligaens egne spørgsmål, medlemmer og navn |
| **Spiller** | Tippe, se stilling, oprette/tilmelde ligaer |

## To invarianter, der er værd at kende
1. **`game.startRound`** gater både visning og pointgivning: kampe i runder
   FØR spillets startrunde vises ikke, giver ingen point og udløser ingen
   påmindelser. Så en sæson kan starte midt i (fx fra runde 2). En RUNDE og
   ikke en dato: en runde kan ligge spredt over en måned, og en dato midt i
   spændet ville tage rundens sene kampe med og lade de tidlige ligge.
   `game.startAt` er kun et fald-tilbage for spil uden startrunde — se
   `src/lib/startGate.js`.
2. **`players/{uid}.leagueIds`** afgør, hvem der må se hvis point — stillingen
   viser kun spillere, man deler liga med. Feltet skrives kun af serveren
   (`syncPlayerLeagues`-triggeren). Driver det fra ligaernes `memberUids`,
   bliver stillingen tom; så kør backfill-workflowet, se
   [docs/drift.md](docs/drift.md).

## Dokumentation
- [Arkitektur & datamodel](docs/architecture.md)
- [Drift: de manuelle workflows](docs/drift.md)
- [Admin-vejledning](docs/admin-guide.md)
- [Deploy af platformen](docs/platform-deploy.md)
- [Elo-metodik](docs/elo-metodik.md)
- [Spilbalance — hvem vinder, og hvorfor](docs/spilbalance.md)
- [Testplan](docs/testing.md)
- [Vedligeholdelse & afhængigheder](docs/maintenance.md)

Spillernes egne regler står i appen: **❓ Guide** inde i hvert spil
(`src/features/games/football/FootballHelp.jsx`) — den henter sine tal direkte
fra scoring-koden, så de ikke kan komme i utakt.
