# Arkitektur & datamodel

Beskriver systemet **som det ser ud nu**. Ét repo bygger to apps (se README);
denne fil dækker begge, med vægt på platformen, der er den aktive.

## Overblik

```
React + Vite  ──VITE_PLATFORM_MODE──┬─ tip.vejleaa.dk   → projekt spil-89af9
                                    └─ tour.vejleaa.dk  → projekt tour-85928
   │  Firebase SDK (auth, firestore, functions)
   ▼
Firebase (region europe-west1)
   ├─ Authentication   e-mail/adgangskode + Google
   ├─ Cloud Firestore  data + firestore.rules (DELT af begge projekter)
   └─ Cloud Functions  to adskilte codebases:
        functions/           → tour-85928   (Tour-motoren)
        functions-platform/  → spil-89af9   (platformen)
```

De to functions-mapper kan ikke `require` hinanden — Firebase CLI'en validerer
en codebases secrets mod målprojektet. Fælles beregningslogik er derfor spejlet
mellem `src/lib/*.js` (ESM, browser) og `functions*/…js` (CommonJS, server).
**De skal holdes identiske.**

## Datamodel

### Globalt (deles af begge apps)

**`users/{uid}`** — den offentlige profil. Læsbar for alle godkendte brugere.
| Felt | Note |
|---|---|
| `displayName`, `avatarEmoji`, `favoriteTeam`, `teamTheme` | vises i lister |
| `role` | `owner` \| `globalAdmin` \| `player` — kun ejeren ændrer den |
| `status` | `pending` \| `approved` \| `rejected` |
| `emailOptOut` | fravalg af mails |

Ingen e-mail her. Reglerne afviser feltet.

**`userContacts/{uid}`** — `{ uid, email }`. Kun brugeren selv og admin kan
læse. Adskilt netop for at ingen kan trække alle deltageres adresser ud.

### Platformen: `games/{gameId}/…`

**`games/{gameId}`** — `name`, `type` (`football` \| `cycling`), `status`,
`season`, `order`, `startAt`, `puljeLockAt`, `standings` (officiel tabel),
`teamStyles`, `recappedRounds`, `snapshottedRounds`.

| Subcollection | Doc-id | Indhold |
|---|---|---|
| `players/{uid}` | uid | deltagelse + point: `totalPoints`, `roundBonus`, `bonusPoints`, `rank`, `previousRank`, **`leagueIds`** |
| `matches/{matchId}` | | `round`, `home`, `away`, `kickoff`, `odds`, `result`, `homeGoals`, `awayGoals` |
| `bets/{uid_matchId}` | **skal** være `uid_matchId` | `pick` (1/X/2), `chanceStake`, `points`, **`leagueIds`** |
| `puljeBets/{uid}` | uid | `championship` (6 hold), `correct`, `points` |
| `leagues/{leagueId}` | | `name`, `code`, `ownerUid`, `memberUids` |
| `leagues/…/messages` | | liga-væg (også Runde-Bottens opslag) |
| `leagues/…/questions` | | liga-ejerens egne spørgsmål + facit |
| `leagues/…/questionAnswers/{qId_uid}` | | medlemmernes svar |

Point skrives **kun** af serveren; reglerne afviser klienten. Det samme gælder
`leagueIds` på `players`. På **tippet** skriver klienten selv `leagueIds` — den
kan ikke slås op pr. dokument uden at sprænge Firestores grænse for opslag i én
forespørgsel — men reglen afviser ligaer, man ikke er med i (`hasOnly`), og
serveren retter feltet, når medlemskaber ændrer sig. `uid` og `matchId` er
uforanderlige efter oprettelsen.

### Tour (uændret siden 2026-spillet)
`stages`, `stageBets/{uid_stageId}`, `bonusQuestions`, `bonusBets`,
`leagues` + `leagueComments`/`leagueActivity`/`leagueBonus*`, `messages`,
`tipParticipation`, `riderProfiles`, `config`.

## To invarianter

**1. `game.startAt` gater alt.** Kampe med kickoff før spillets starttidspunkt
vises ikke (`footballRounds.afterStart`), giver ingen point (`gameScoring.gatedIds`)
og udløser ingen påmindelser (`reminders.upcomingMatches`). Så en sæson kan
starte midt i. Efter et skift i `startAt` skal totalerne genberegnes — knappen
🔄 **Genberegn point** i Admin → Spil-planlægning.

**2. `leagueIds` styrer, hvem der ser hvad.** Både stillingen og andres tips er
jeres indbyrdes opgør: man ser kun spillere, man deler mindst én liga med.
Feltet står to steder, fordi reglen skal kunne afgøres ud fra dokumentet alene.
Kæden er:

```
leagues.memberUids  ──syncPlayerLeagues (trigger)──▶  players/{uid}.leagueIds
                                                 └──▶  bets/{uid_matchId}.leagueIds
                                                        │
firestore.rules: læs players kun hvis leagueIds overlapper mine
                 læs andres bets kun EFTER kickoff og med samme overlap
                                                        │
useGameStandings:     where('leagueIds','array-contains-any', mine)
useMatchLeagueBets:   where('matchId','==',…) + samme array-contains-any
```

Firestore-regler er **ikke filtre**: kan reglen ikke afgøres for hvert dokument
i en forespørgsel, afvises hele forespørgslen. Derfor skal klientens query
matche reglen præcist. Brister ét led i kæden, ser brugerne en tom stilling
eller ingen tips fra ligaen — uden fejlbesked. Kør backfill, se
[drift.md](drift.md).

Samme mønster gælder liga-spørgsmålenes svar: andres svar er først læsbare, når
spørgsmålet er lukket, og `useLeagueQuestions` forespørger tilsvarende.

## Scoring

| Spil | Klient | Server | Regler |
|---|---|---|---|
| Superligaen | `src/lib/superligaScoring.js` | `functions-platform/superligaScoring.js` | 1X2-point = kampens frosne odds; combi-runde-bonus (loft 25/12); Chancen (indsats × odds−1, loft 8 og 15 % af saldo); pulje-tip (6 hold × 4 point + 10 i bonus); Elo-lite driver oddsene |
| Tour | `src/lib/tourScoring.js` | `functions/tourScoring.js` | etape-tips + klassementer |

Afregningen sker i `functions-platform/gameScoring.js`: når en kamps `result`
sættes, scores alle bets på kampen, og hver berørt spillers total genberegnes i
en transaktion (rå bet-point + combi-bonus + pulje-bonus, gulvet ved 0).

**Serveren er eneste autoritet.** Klientens validering (fx Chancens loft) kan
omgås, så den skal altid have en pendant på serveren.

## Baggrundsjobs (platformen)

| Funktion | Udløses af |
|---|---|
| `recomputeGameMatch` | skrivning til `games/{g}/matches/{m}` med nyt `result` → afregning + levende Elo + Runde-Botten |
| `syncPlayerLeagues` | skrivning til `games/{g}/leagues/{l}` → opdaterer `leagueIds` |
| `syncSuperligaResults` | tidsplan `*/15 14-23` → henter facit fra `api.superliga.dk` |
| `gameTipReminders` | daglig tidsplan → mailer dem, der mangler at tippe |

Runde-Botten (`gameRecap.js`) kalder Claude, når rundens sidste kamp er afregnet,
og poster et resumé på liga-væggene. Den er idempotent via `game.recappedRounds`,
og et AI-udfald må aldrig vælte selve afregningen — fejl logges kun.
