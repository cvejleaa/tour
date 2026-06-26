# Tour de France Tip 🚴

Tippekonkurrence til Tour de France. Spillere tipper på alle etaper, får point
efter præcision, og dyster i en samlet rangering samt private mini-ligaer.

> Bygget på samme motor som VM 2026-tippeligaen (`cvejleaa/vm`). Fodbold-domænet
> (kampe/hold/scoring) erstattes trinvist af cykel-domænet (etaper/ryttere/klassementer).

## Stack
- **Frontend:** React + Vite (statiske filer, hostes på Firebase Hosting)
- **Backend:** Firebase — Authentication (email/adgangskode), Cloud Firestore,
  Cloud Functions (autoritativ pointberegning + knockout-progression),
  Security Rules
- **Sprog/tid:** Dansk UI, `Europe/Copenhagen`

## Kom i gang
```bash
npm install
cp .env.example .env        # udfyld med din Firebase web-config
npm run dev                 # udviklingsserver
npm test                    # unit-tests
npm run emulators           # lokale Firebase-emulatorer
```
Se **[docs/firebase-setup.md](docs/firebase-setup.md)** for fuld opsætning af
Firebase-projektet og deploy.

## Roller
| Rolle | Kan |
|---|---|
| **Ejer** (super-admin) | Alt — godkende brugere, tildele roller, kampe, resultater |
| **Kamp-admin** | Kampe, resultater, bonus-facit (IKKE brugergodkendelse/roller) |
| **Spiller** | Tippe, se stilling, oprette/tilmelde ligaer |

## Pointmodel
| Situation | Point |
|---|---|
| Eksakt score | 5 |
| Korrekt udfald + målforskel | 3 |
| Korrekt udfald | 2 |
| Forkert | 0 |
| Knockout: korrekt videregående hold | +2 |
| Bonus (topscorer / gruppevinder) | 10 pr. stk |

Tip låses ved kampens kickoff. Bonus-spørgsmål låses når den første relevante
kamp starter.

## Dokumentation
- [Arkitektur & datamodel](docs/architecture.md)
- [Firebase-opsætning & deploy](docs/firebase-setup.md)
- [Testplan & testrapport](docs/testing.md)
- [Admin-vejledning](docs/admin-guide.md)
- [Vedligeholdelse & opdatering af afhængigheder](docs/maintenance.md)
