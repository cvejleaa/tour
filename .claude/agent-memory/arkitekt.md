# Arkitekt — genbrugskatalog

Konsultér FØR du grep'er. Hver post: hvad den løser, sti, og hvad man ellers
ville have bygget forfra.

## Scoring / rene beregninger
- `outcomePoints(pick, result, odds)` — `src/lib/superligaScoring.js` ⇄
  `functions-platform/superligaScoring.js`. 1X2-point af odds. Brug den frem for
  at genberegne "hvad var tippet værd".
- `puljeScore(pick, facitSet)` + `PULJE {POOL_SIZE, PER_TEAM, PERFECT_BONUS}` +
  `leagueTable(matches)` + `championshipTeams(matches, poolSize)` —
  `src/lib/superligaScoring.js:445-507`. "Vælg N hold, tæl rigtige, point pr.
  hold + perfekt-bonus" ER allerede bygget. Al multi-valg hold-tipning bør
  generalisere DETTE, ikke starte forfra.
- `scoreLeagueQuestion / leagueQuestionPointsByUid / lqSettled / lqPoints /
  LQ_TYPES ('text','yesno','number','team')` —
  `src/features/games/leagueQuestionScoring.js`. KUN klient-side (august 2026);
  intet spejl i `functions-platform/` endnu.
- `ligaPoint(perRound, startRunde, puljeBonus)` + `puljenTaeller()` +
  `PULJE_MAKS_STARTRUNDE = 3` — `src/lib/ligaPoint.js` ⇄
  `functions-platform/ligaPoint.js`. Liga-total når ligaen starter senere.
  MAGISK TAL: 3 er bundet til Superligaens `puljeLockAt` — et andet spils pulje
  med senere deadline rammer forkert.
- `buildRoundContext / combiBonus` — `functions-platform/pointOpdeling.js`
  (kuponvindue, combi). `gatedeKampe / startRundeFor` — `startGate.js`.

## Server-mekanik (functions-platform)
- `runGameRoundRecap(db, FieldValue, anthropic, gameId, round, {dryRun})` —
  `gameRecap.js:264`. Runde-Botten: fakta → prompt → ét opslag PR. LIGA på
  `games/{g}/leagues/{l}/messages` (uid:'runde-bot', system:true, round, text).
  Idempotens: `game.recappedRounds` (arrayUnion) + `game.aiRecaps === false`
  slår botten fra. `sanitizeName()` værner mod prompt-injection.
  `generateRecapText()` = Claude-kald med retry på 429/500/503/529.
- Tre indgange til botten: trigger (`recomputeGameMatch`, index.js:84, kalder
  ved `roundCompleted`), callable `generateGameRecapNow` (index.js:122,
  dryRun default TRUE), admin-flade `src/features/admin/GameRecapBotTab.jsx`.
  Mønsteret "automatik + manuel knap + forhåndsvisning" er skabelonen for alt
  nyt bot-maskineri.
- `hentSpoergsmaalStatus / byggSpoergsmaalStatus / tjekSvarStatusAdgang /
  erAabent(q, nowMs)` — `functions-platform/gameLeagues.js:107-220`. Læser svar
  via DETERMINISTISKE id'er `${qId}_${uid}` for ligaens NUVÆRENDE medlemmer
  (`db.getAll(..., {fieldMask: []})` = eksistens uden data). Genbrug det greb,
  når noget skal opgøres pr. liga-medlem uden at kunne komme til at røre
  fremmede eller tidligere medlemmer.
- `settlePuljeBets` — `functions-platform/gameScoring.js:379`. Self-guardet
  (alle kampe skal have mål), idempotent, kræver `game.pulje`, skriver
  `bonusPoints` på spilleren og genberegner totaler. BUG: `expectedPlayed =
  matches.length / 6` antager 12 hold — for 20-holds-ligaer rammer den officielle
  stilling aldrig, og der falder tilbage på `championshipTeams(matches)`.
- Driftstatus: `statusSamler / meldAlarm / skrivDriftStatus` —
  `driftlog.js` + `index.js:42`. Svaret på "må ikke kunne fejle tavst".
  Nye typer dukker op af sig selv i Admin → Driftstatus (DriftTab.jsx:138).
- Skemalagte kørsler i dag: `syncSuperligaResults` (hvert min. 12-23),
  `syncSuperligaSweep` ('25 2,13-23'), `syncGameKickoffs` ('10 6'),
  `gameTipReminders` ('0 9'). Ingen af dem er en naturlig ophængning for
  spørgsmåls-deadlines (for grov kadence / forkert ansvar).

## Flader
- `PointOpdeling.jsx` (+ `RUBRIKKER`) — én opdeling, flere flader. Tallene
  kommer FÆRDIGE fra serveren (`players/{uid}.opdeling`).
- `BreakdownTable.jsx` (Tour) — point brudt op i kilder.
- `MyTips.jsx` — kampe med tip, facit og point, runde for runde.
- `LeagueQuestions.jsx` + `useLeagueQuestions.js` — liga-spørgsmål: svar-input,
  status, facit, vindere. Hooket viser mønsteret "regler er ikke filtre":
  ét abonnement på egne svar, ét pr. gruppe af LUKKEDE spørgsmål, med
  `CLOCK_SKEW_MS = 60s` mod urforskel.
- `PuljeTip.jsx` — vælg N hold-flade med badges, deadline-badge, facit-visning.
- `BroadcastTab.jsx` — Send mail. Har ALLEREDE spil-scopede modtagere
  ("🎯 Indsæt deltagerne i {spil}", `useGamePlayerUids`) + invitations-skabelon.
  En ny "puljen er åben"-mail kræver ingen kode.
- `GameLeagues.jsx` liga-væg: system-/bot-beskeder renderes generisk (bærer selv
  navn+emoji) → et nyt bot-opslag kræver INGEN klientændring.
- Faner gates af DATA, ikke flag: `GAME_TABS[].kraever` i `src/pages/GamePage.jsx:32`
  ('pulje', 'standings'). Skriv feltet på spillet → fanen dukker op.

## Data/konfiguration
- `scripts/games.mjs` — spillenes definition (sync-provider, `pulje: {poolSize}`).
  `scripts/seed-payload.mjs:19` `ADMIN_OWNED = ['status','joinable']` (kun de to
  er admin-ejede; alt andet overskrives af seed = produktions-skrivning).
- PL-spillet er `pl2627-efteraar` (pulselive, competitionId 8, season 2026),
  180 kampe, INTET pulje-felt. Superligaen er `superliga2627`.
- Test-attrap for Firestore i server-tests: `makeDb()` i
  `functions-platform/gameRecap.test.js:136` (rammer navne på subcollections og
  kræver `{merge:true}`). Nye testfiler SKAL med i `vitest.config.js`-include.
- Rules-tests: `functions/rules.test.js` (emulator).

## Fælder set i praksis
- Rules `puljeBets` (firestore.rules:773-791) kræver `puljeLockAt != null` for
  at kunne SKRIVE, men `PuljeTip.jsx:91` viser "🟢 Åbent" når feltet mangler →
  åben flade, afvist skrivning. Sæt `pulje` og `puljeLockAt` i SAMME skrivning.
- `questions`-reglen (firestore.rules:979) tillader kun én vej: facit må rettes,
  aldrig nulstilles; deadline må kun rykkes FREM og aldrig fjernes — fordi
  "kortene må ikke kunne lukkes igen".
