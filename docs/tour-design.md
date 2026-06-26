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

**Plan:** manuel smart-indtastning nu (ingen eksterne konti) → Apify auto-sync senere.

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

## Status / rækkefølge

- [x] Skelet: motor kopieret, branding VM→Tour, Firebase `tour-85928`, CI grøn.
- [x] Scoring-kerne: `src/lib/tourScoring.js` + eksempel-tests (hold-model Q1–Q4).
- [ ] Spejl scoring til `functions/tourScoring.js` + Cloud Function der genberegner.
- [ ] Datamodel + seed: `teams`, `riders` (2025-startliste), `stages` (2026-rute).
- [ ] Tip-flow: etape-side med fire hold-felter; lås ved etapestart.
- [ ] Admin: redigér point + `gcTopN`; manuel resultat-indtastning (smart indsæt).
- [ ] Stilling: etaper/bonus/total + gns.; klassement-visning.
- [ ] Bonus: sæson-/klassement-spørgsmål.
- [ ] Auto-sync via Apify bag `syncResultsNow`.
