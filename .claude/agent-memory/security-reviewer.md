# Security Reviewer — varig hukommelse

## PoC-opsætning der virker (genbrug den)

- Firestore-emulatoren kan startes UDEN firebase-CLI (den er ikke installeret):
  `java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar --host=127.0.0.1 --port=8080 --rules=/home/user/tour/firestore.rules`
- `@firebase/rules-unit-testing` + `firebase` ligger i `functions/node_modules`
  (IKKE i rod-`node_modules`). Kør PoC uden for repoet ved at lave en
  `node_modules/` i scratchpad-mappen med symlinks til `@firebase`, `firebase`,
  `vitest` og `tinypool` — ellers finder vitest en ødelagt `vitest` længere oppe
  i scratchpad-træet ("No handler function exported from .../worker.js").
- Fælde i regel-PoC'er: `myLeagueIds()` (firestore.rules ~L596) læser
  `games/{gameId}/players/{uid}.leagueIds` — ikke `leagues/{id}/members`. Uden
  `leagueIds` på player-dokumentet fejler ALLE læsninger af andres tips, og man
  tror fejlagtigt, at reglen er stram.
- Server-kerner (`superligaSync.js` m.fl.) kan PoC'es rent i node med en fake db:
  `{ collection: () => ({ doc: () => ({ collection: () => col }) }), batch: ... }`.

## Bekræftede antagelser om reglerne (emulator-verificeret)

- Tip-vinduet er ÉN betingelse: `request.time < matches/{matchId}.kickoff`
  (firestore.rules L820 create, L843 update). Der er INGEN "kampen er begyndt"-
  hukommelse. Flyttes `kickoff` frem i tiden, åbner vinduet igen — også for en
  kamp, der er spillet. Læsning af andres tips er den omvendte betingelse
  (L799), så en fremflytning SKJULER samtidig sporet igen.
- Rolle-eskalering er lukket: bruger kan kun oprette sig som
  `role:'player'/status:'pending'` (L99-104), `writingProtectedUserFields()`
  (L56) spærrer `role`/`status`/point-felter på egen profil, og en globalAdmin
  kan ikke ændre roller (L116-119) — kun owner. Admin-porten i callables
  (`users/{uid}.role in {owner, globalAdmin}`) er derfor holdbar.
- `games/{gameId}/matches/{matchId}: allow create, update: if isGlobalAdmin()`
  (L751) er UDEN feltbegrænsning: en globalAdmin kan sætte `kickoff` frit fra
  klienten. Kendt og accepteret, men husk det, når nye felter lægges på matches.
- Spiller kan ikke sætte `points` på eget tip, ikke flytte kickoff, ikke
  opdatere eget tip efter kickoff. (Kontroltests kørt — de er GRØNNE, så
  opsætningen måler noget.)

## Angrebsveje der VIRKER (åbne eller kun delvist afbødet)

- **Fremmed kilde → genåbnet deadline.** `syncKickoffsCore`
  (functions-platform/superligaSync.js L467-517) springer kun kampe over, hvis
  de har `result`. En kamp, der er i gang / spillet, men uden facit endnu, kan
  få sin `kickoff` flyttet fra FORTID til FREMTID af den daglige 6.10-kørsel.
  48-timers-alarmen (L498-499) filtrerer på `tilMs - nowMs < 48t` og fanger
  derfor IKKE den retning. Bekræftet både i kernen og i emulatoren.
  Den symmetriske retning (fremtid → fortid) fanges af alarmen, men eksponerer
  alles tips med det samme (L799) — halvdelen af en tur-retur er dækket.
- **Alarm-druknen.** `mangler` i syncKickoffsCore samler ALLE kilde-kampe uden
  dokument. Kilden (pulselive competition=8) leverer hele sæsonens 380 kampe,
  mens `pl2627-efteraar` kun har 180 (runde 1-18) → 200 poster i alarmen hver
  dag. Seed-vejen har `--runder 1-18`; synk-vejen har intet filter, så
  paritets-påstanden gælder ikke `mangler` (den bygges UDEN for den spejlede
  `kickoffPlan` og kan derfor ikke fanges af paritetstesten).

## Afprøvet og RENT (gentag ikke arbejdet uden grund)

- `londonTilUtcMs`- og `kickoffMs`-regexerne er fuldt ankrede med faste
  kvantorer → lineære. Målt: 500 000 tegn på ~1 ms. Ingen ReDoS. Input kommer
  desuden kun fra provider-API'et, aldrig fra en bruger.
- `syncGameKickoffsNow` (functions-platform/index.js L371): auth → rolle →
  `SYNCED_GAMES.find` → `Object.hasOwn(PROVIDERS, ...)`. Intet bruger-input når
  skrivningen: `gameId` bruges kun via det fundne `g.gameId`, doc-id'er kommer
  fra `resolveDocs` over EKSISTERENDE doc-id'er, og skrivningen er `batch.update`
  (kan ikke oprette). `dryRun` fejler lukket i BEGGE ender
  (`dryRunFraKald` = `!== false`, og `opts.dryRun !== false` i kernen) — men de
  er to vagter om samme beslutning; kernens er den bærende.
- Zone-vagten i `pulselive.hentKickoffs` kaster FØR planen bygges → ingen delvis
  skrivning. Fanges pr. spil i det daglige skema; andre spil kører videre.
  Konsekvensen er tilgængelighed (tider rettes ikke den dag), ikke integritet.
- Ingen hemmeligheder i den nye kode: pulselive kræver kun Origin/Referer-headere.
- App Check håndhæves ingen steder i functions-platform (konsistent, præeksisterende).

## Faste faldgruber i dette repo (vedligeholdes her)

- Regler er ikke filtre. En strammet læseregel uden matchende query = tom liste.
- Klient-validering er ikke håndhævelse.
- Doc-id'er skal bindes (`uid_matchId`) — ellers dublet-dokumenter.
- Callables kan kaldes af enhver, der er logget ind, også `pending`.
- Hemmeligheder i `defineSecret`, aldrig i kode/logs/`process.env`.
- AI-prompter kan forgiftes af brugerskrevne navne — saniter.
- **Nyt: en tidsværdi, der ER en deadline, må ikke kunne bevæge sig frit i
  begge retninger fra en fremmed kilde.** Spørg altid: hvad sker der, hvis den
  nye værdi flytter et LUKKET vindue tilbage til åbent?
- **Nyt: en alarm, der altid råber, er ingen alarm.** Tæl, hvor mange poster
  den vil indeholde på en normal dag, før du godkender den som afbødning.
