# Admin-panel audit — de rigtige funktioner de rigtige steder (juli 2026)

> ⚠️ **HISTORIK (juli 2026).** Alle de beskrevne mangler er siden løst:
> platform-codebasen har nu 17 funktioner, Send mail og kodeord-nulstilling er
> synlige igen, og påmindelser/recap er per spil. Bevaret, fordi den forklarer
> HVORFOR der er to adskilte functions-codebases.

Dette repo bygger BÅDE standalone-Tour (tour-85928, `PLATFORM_MODE=false`) og
den samlede platform "Vejleaa Tip" (spil-89af9, `PLATFORM_MODE=true`) fra samme
kode. Flere admin-funktioner blev bygget til én-spils-apps (Tour/VM) og stod
globalt i platform-panelet, hvor de var malplaceret eller direkte i stykker.

## Rodårsag: to Cloud Functions-kodebaser
`firebase.json` mapper `functions/` → tour-85928 og `functions-platform/` →
spil-89af9. **Platform-kodebasen har kun 4 funktioner:** `recomputeGameMatch`,
`syncSuperligaResults`, `syncSuperligaResultsNow`, `redeemGameLeagueCode`.

Enhver admin-knap der kalder en *anden* callable rammer en URL uden funktion på
spil-89af9 → 404 → callable-SDK'en mapper det til koden `internal` → UI viser
**"Fejl: internal"** (fx "Send påmindelser nu"). Callablen `sendTipRemindersNow`
findes kun i `functions/index.js`, ikke i `functions-platform/`.

## Klassificering

**✅ Korrekt platform-globalt (behold):** Brugere (godkend/roller), Mail-log,
Aktivitet, Tests, 🗓️ Spil-tidsplan, 🎨 Hold-farver. De to sidste er allerede
per-spil (spil-vælger / alle spil vist) — mønsteret for resten.

**🔴 Spil-specifikke, stod globalt på platformen** (skal per-spil):
- 🎯 Straf for manglende tip — scoring er pr. spil.
- 🔔 Tip-påmindelser (test + "send nu") — spil-specifik **og** backend mangler.
- 🏁 Afslutning: pause + takke-mail — global pause ville stoppe **alle** spil.
- 🤖 Morgen-bot-tidspunkt (recap) — ingen platform-backend læser det.

**🟠 Platform-globale, men backend mangler** (portér for at virke): 📣 Send mail
(`sendBroadcastEmail`), 🔑 Nulstil kodeord (`adminSendPasswordReset`),
🔒 e-mail-migrering (`migrateEmailPrivacy`).

**🗑️ Dødt:** `RecapBackfillPanel` (renderes ingen steder).

## Handlingsplan

### P0 — gjort (juli 2026): panelet er korrekt på platformen
- Skjult **⚙️ Indstillinger** og **📣 Send mail** på platformen (`AdminPage`) —
  alt indhold var Tour-specifikt eller backend-løst.
- Skjult **🔑 Nulstil kodeord** i `UserRow` på platformen.
- Fjernet dødt `RecapBackfillPanel`.

Resultat: en ejer på platformen ser ikke længere knapper der fejler med
"internal" eller globale indstillinger der rammer det forkerte spil.

### P1 — udestående: byg de spil-specifikke funktioner per-spil
Følg `GameScheduleTab`/`TeamStylesTab`-mønsteret: en **spil-vælger** øverst, og
skriv/kald pr. `gameId`. Vis kun afsnit der giver mening for spillets `type`.
- **Straf** → `games/{gameId}.points.untippedPenalty` (ikke global config).
- **Påmindelser** → per-spil callables i `functions-platform` (`{ gameId }`) +
  en per-spil skemalagt påmindelses-pendant. Kun spil med runde-deadlines.
- **Afslutning** (pause + takke-mail) → per-spil (`games/{gameId}.paused`) og
  takke-mail bygget på det valgte spils data.
- **Morgen-bot/recap** → `games/{gameId}.recapTime` + portér recap-genereringen.

### P1b — portér de platform-globale callables (for at genaktivere)
`sendBroadcastEmail`, `adminSendPasswordReset`, `migrateEmailPrivacy` til
`functions-platform`. Password-reset er mest oplagt at genaktivere nu, da
VM-migreringen tilføjede kodeord-brugere.

### P2 — oprydning
- Lad `adminActions` behandle fejlkoden `internal` lige så pænt som
  `functions/not-found`, mens portering pågår.
