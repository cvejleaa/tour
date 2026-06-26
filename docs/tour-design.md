# Tour de France-spil – designbeslutninger

> Levende dokument. Fastholder de beslutninger vi har truffet, så de ikke går
> tabt mellem sessioner. Bygget på VM 2026-tippemotoren (`cvejleaa/vm`).

## Grundkoncept: et HOLD-spil

I modsætning til VM (hvor man tipper kampresultater) og i modsætning til det
oprindelige grundlag (der antog rytter-tips), tipper man her primært på
**cykelhold**. Pr. etape svarer man på op til fire spørgsmål:

| # | Felt | Spørgsmål | Afgøres af |
|---|---|---|---|
| Q1 | `winnerTeam` | Hvilket hold kommer etapevinderen fra? | Holdet for rytter nr. 1 i mål |
| Q2 | `gcTeam` | Hvilket hold har samlet bedste resultat på de **XX første ryttere**? | Placerings-point pr. hold blandt top-XX |
| Q3 | `mountainTeam` | Hvilket hold tager flest **bjergpoint** på etapen? | Sum af bjergpoint pr. hold |
| Q4 | `sprintTeam` | Hvilket hold tager flest **sprintpoint** på etapen? | Sum af sprintpoint pr. hold |

**XX (top-N til Q2)** sættes af admin i `config/settings.gcTopN` (default 10).

### Q2-aggregering (åben til finjustering)
Default: nr. 1 blandt de XX første giver XX point, nr. 2 giver XX-1 … nr. XX
giver 1 point. Holdet med flest samlede placerings-point vinder. Det belønner
både høje placeringer OG flere ryttere højt oppe. Tie-break: flest tællende
ryttere → alfabetisk holdnavn (deterministisk). *Kan ændres — bekræftes med
konkret talcase.*

## Besluttede punkter (fra §11 i grundlaget)

1. **Datakilde:** Hybrid. Manuel admin-indtastning først (smart indsæt:
   rytter→hold slås op fra seedet startliste, motoren beregner Q1–Q4).
   Auto-sync tilføjes bagefter bag samme `syncResultsNow`-mønster.
2. **Tip-omfang:** Hold-tips Q1–Q4 pr. etape (se ovenfor).
3. **Kategori-lag:** Nej – holdt enkelt, fokus på hold-tips.
4. **Pointsystem:** Forslag A som start, men **alle point er admin-redigerbare**
   i `config/settings` (ikke hardcodet). Standard: Q1=5, Q2=4, Q3=3, Q4=3,
   utippet etape = −1.
5. **Repo:** Genbrug VM-motoren i `cvejleaa/tour`. Firebase-projekt `tour-85928`.

## Datakilde – undersøgelse

| Kilde | Dækning | Vurdering |
|---|---|---|
| ProCyclingStats (scrape) | Alt (resultat m. hold, point/bjerg/hold-klassement, startliste) | Gratis, men 403-blokerer bots → skrøbeligt + ToS-gråzone direkte fra Functions |
| Apify-aktør (PCS/letour) | Samme data som managed JSON-API | Håndterer bot-blokering; billigt gratis-niveau → **valgt auto-kilde** |
| Sportradar / Enetpulse / Sportbex | Officielle, live | Erhvervspriser – overkill til privat liga |
| LeTourDataSet (GitHub CSV) | Historik t.o.m. 2025 | Gratis, men ikke live – god til seed/test |

**Valgt løsning:** Brugerens egen **PCS-proxy** (FastAPI + `procyclingstats`,
filerne i `userfiles/`). Ét request pr. etape giver resultat + alle 5 klassementer
med `rank`/`rider_name`/`team_name`/`points`. Finalitets-logik henter hver etape
én gang. Endpoints: `/api/stages`, `/api/stages/{n}`, `/api/standings`, `/api/refresh`.

**Integration:** Cloud Function (`syncResultsNow`) henter `/api/stages/{n}` →
`src/lib/pcsMapping.js` mapper til `resolveStageResult`-input → skriver
`stages/{id}.result` → recompute. Holder scoring server-side. Proxyen hostes
separat (Cloud Run anbefalet, så Functions kan nå den over offentlig HTTPS;
alternativt Raspberry Pi + tunnel).

**Q3/Q4-nuance:** PCS' bjerg/sprint-blok er KUMULATIV klassement-stilling.
`pcsMapping.deltaPointsList()` kan udregne ægte point PÅ etapen ved at trække
forrige etape fra — vælges via `prevPayload`. Default uden delta = "holdet der
fører klassementet". Afklares med bruger.

## Datamodel (Firestore) – planlagt

Genbruges uændret fra VM: `users`, `leagues`, `leagueComments`, `messages`,
`reactions`, `config`, `tipParticipation`.

Nyt/erstattet:
- `teams/{teamCode}` – cykelhold `{ name, code, country }`.
- `riders/{riderId}` – `{ name, team, nationality, bib?, active }`.
- `stages/{stageId}` – `{ number, date, kickoff, type, startCity, finishCity, km, status, result }`
  hvor `result = { winnerTeam, gcTeam, mountainTeam, sprintTeam }` (+ evt. rå data).
- `stageBets/{uid_stageId}` – `{ uid, stageId, winnerTeam, gcTeam, mountainTeam, sprintTeam }`.
  `points` sættes server-side. Låses ved etapestart (`kickoff`).
- `bonusQuestions` / `bonusBets` – sæson-/klassement-bonus (genbrugt struktur).
- `leagueBonus` / `leagueBonusAnswers` – ligaens egne spørgsmål (genbrugt 1:1).

## Firebase-aktivering (tjekliste — udfyldes når vi deployer)

> Brugeren vil have **eksplicit besked** før hver aktivering. Intet af dette er
> nødvendigt endnu; det aktiveres når vi wirer backend + deployer.

- [ ] **Blaze-plan** (pay-as-you-go) — kræves til Cloud Functions Gen2 + Scheduler.
- [ ] **Authentication** → slå **Email/adgangskode** til.
- [ ] **Firestore Database** → opret (region `europe-west1`).
- [ ] **Web-app** registreret → kopiér `VITE_FIREBASE_*` til GitHub **Variables**.
- [ ] **Hosting** → init + deploy af frontend.
- [ ] **Service-account** (deploy) → JSON i GitHub **Secret** `FIREBASE_SERVICE_ACCOUNT`.
- [ ] **Cloud Scheduler / Functions API** → typisk auto med Blaze (til sync-cron).
- [ ] *(valgfrit)* **App Check** (reCAPTCHA Enterprise) — kan vente.

## Status / rækkefølge

- [x] Skelet: motor kopieret, branding VM→Tour, Firebase `tour-85928`, CI grøn.
- [x] Scoring-kerne: `src/lib/tourScoring.js` + eksempel-tests (hold-model Q1–Q4).
- [x] PCS-bro: `src/lib/pcsMapping.js` + tests (payload → resolveStageResult + trøjer + meta).
- [x] Hosting valgt: **Cloud Run + Postgres**. Scaffold i `proxy/` (Dockerfile,
  `pg_cache.py`, `requirements.txt`, `DEPLOY.md`). Cloud Scheduler poller
  `/api/refresh` hvert 5. min 17–22 (Europe/Copenhagen).
- [x] Spejlet scoring + mapping til `functions/` (CommonJS) + tests.
- [ ] Cloud Function: planlagt sync (hvert 5. min fra 17:00) der henter proxy →
  mapper → skriver etape-facit → genberegner point.
- [ ] Datamodel + seed: `teams`, `riders` (2025-startliste), `stages` (2026-rute fra `/api/stages`).
- [ ] Datamodel + seed: `teams`, `riders` (2025-startliste), `stages` (2026-rute).
- [ ] Tip-flow: etape-side med fire hold-felter; lås ved etapestart.
- [ ] Admin: redigér point + `gcTopN`; manuel resultat-indtastning (smart indsæt).
- [ ] Stilling: etaper/bonus/total + gns.; klassement-visning.
- [ ] Bonus: sæson-/klassement-spørgsmål.
- [ ] Auto-sync via Apify bag `syncResultsNow`.
