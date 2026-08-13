# Quality Control — varig hukommelse

## Plan-gennemgange: de dyre fund er designfejl, ikke kodefejl

- **Modsiger tallet noget lige ved siden af?** Et kampkort viste "hvem er
  stærkest" ud fra ren ratingforskel, mens odds lægger 60 point hjemmebane-
  fordel oveni — pilen modsagde 1X2-knapperne under sig på de fleste kampe.
- **Lover teksten mere end handlingen giver?** "Åbn ligaen →" landede på en
  liste over ALLE ligaer, foldet sammen.
- **Et statusfelt, der overskrives, kan ikke bære en alarm.** Spørg altid ved
  overvågnings-/statusflader: hvad sker der med en hændelse, der opstår og
  bliver overskrevet, FØR nogen kigger? Kræver hændelsen en menneskelig
  handling, skal den persisteres separat og kvitteres — ikke merges væk.
- **Flere skrivepunkter i ét dokument = sidste skriv vinder.** En kørsel med
  tre try/catch-blokke, der hver merge-skriver `niveau` i samme dokument,
  ender grøn, selv om den første blok fejlede. Saml status i hukommelsen,
  skriv ÉN gang til sidst med `niveau = værste(...)`.
- **En dashboard-side, der kun tegner kort for dokumenter, der FINDES, er
  blind for den værste fejl:** funktionen der aldrig kørte, eller hvis
  status-skrivning selv er i stykker → intet dokument → intet kort → siden
  ser beroligende ud. Tegn kort pr. FORVENTET type, dokument eller ej. Det er
  "tom liste uden fejlbesked"-fælden, flyttet til en statusside.
- **Tør-kørsel må aldrig kvittere som en rigtig kørsel.** De manuelle callables
  (`syncGameKickoffsNow`, `repriceGameOdds`, `rescoreGameBets`) har dryRun som
  default. Skriver de i en "sidst kørt"-status, melder fladen en kørsel, der
  ikke skete.
- **Tærskler hører til dér, hvor sandheden bor.** Skal en flade vurdere "er
  den holdt op med at køre?", så lad SERVEREN skrive `naesteForventetFoer` i
  dokumentet — den kender sin egen cron. En tærskel hardkodet i klienten
  driver fra cron'en uden at nogen test bliver rød.

## Konkrete tal i dette repo (efterprøv, gæt ikke)

- `syncSuperligaSweep`: cron `25 2,13-23 * * *`. Største NORMALE hul er
  02:25 → 13:25 = **11 timer**, ikke 2. En "forældet efter 2 timer"-regel
  ville lyse rødt 10 timer hver eneste nat.
- `syncSuperligaResults`: cron `* 12-23 * * *` = 720 kørsler/dag × 2 spil i
  `SYNCED_GAMES`. Kørslen er BEVIDST optimeret til at koste ét tomt opslag på
  et stille minut (kommentaren i `functions-platform/index.js` regner det ud).
  Enhver ubetinget skrivning pr. minut river den optimering i stykker.
- `syncGameKickoffs`: cron `10 6 * * *` → >26 timer er en rimelig tærskel.
- Sweep'et ER i forvejen alarmen for minut-synken ("N facit som minut-synken
  IKKE nåede"). Minut-synken behøver derfor ikke sin egen hjerteslags-måler.

## Faste steder at kigge

- **Admin-faner:** `src/pages/AdminPage.jsx` — 12 faner i PLATFORM_MODE, i en
  `display:flex` UDEN `flexWrap`. Hver ny fane presser bjælken.
- **Badge på Admin-linket:** `src/components/Layout.jsx` `CountBadge` — allerede
  rødt (`var(--c-err)`) og brugt til ventende godkendelser. Et nyt "rødt badge"
  samme sted er visuelt umuligt at skelne fra det gamle. Giv det egen form,
  egen `title` og egen `data-testid`.
- **Mønster for en log-flade:** `emailLog` + `useEmailLog.js` + `EmailLogTab.jsx`
  + rules `allow read: if isGlobalAdmin(); allow write: if false;` (linje ~372).
  Genbrug det frem for at opfinde et nyt.
- **`firestore.rules` er ÉN fil for BEGGE projekter** (tour-85928 og spil-89af9)
  — enhver regelændring rammer begge apps.
- **Tour-appen er på pause, men dens 7 `onSchedule` i `functions/index.js`
  kører videre** (syncTourResults, syncStartlist, snapshotRanks, tipReminders,
  generateLeagueRecaps, syncStageTimes, enrichRiderTags). "Appen er på pause"
  er ikke det samme som "maskineriet er stoppet".
- **Dokumentation der skal følge med:** `docs/admin-guide.md` (linje ~19 lister
  fanerne), `docs/drift.md` (alarmerne beskrives som "står i loggen").
