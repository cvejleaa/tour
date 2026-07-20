# Sammenligning: VM-appen vs. Tour-appen

**Version 2 — opdateret 20/7 2026** (VM 2026 sluttede 19/7; Touren kører til 26/7).
Systematisk sammenligning af `cvejleaa/vm` og `cvejleaa/tour` med fokus på
forbedringer på tværs og input til den fælles platform (`samlet-platform.md`).
Siden version 1 (5/7) er der landet ~40 betydelige commits i HVER app.

---

## 1. Status på version 1-anbefalingerne

| Anbefaling (5/7) | Status 20/7 |
|---|---|
| Tipping krævede kun `isSignedIn()` i Tour | **Løst i VM** — `bets`/`bonusBets` kræver nu `isApproved()`. Tour bør følge med (afklaring udestår stadig). |
| `sanitizeName()` + afvist-bruger-blok til VM | **Landet** (porteret via PR #140-branchen, nu i VM main). |
| Point-felter kunne selv-skrives | **Løst i VM** — `writingProtectedUserFields` dækker nu alle pointfelter; profil-create kræver 0-point. |
| Liga-kapring (memberUids overskrivning) | **Løst i VM** — append-only join-regel som Tour. |
| E-mail-privatliv | **Løst i VM — men med en ANDEN model end Tour:** VM holder e-mail helt ude af Firestore (kun i Firebase Auth); Tour bruger `userContacts`-collection. Platformen skal vælge: `userContacts` er mere fleksibel (admin/broadcast kan læse), Auth-only er mest lukket. Anbefaling: `userContacts` (platformen arver Tours broadcast). |
| Doc-ID-pinning (`uid_matchId`) i VM | **Stadig ikke løst** — VM håndhæver kun `uid`-feltet, ikke dokument-ID'et. Tour pinner. Tages i platform-rules. |
| Dependabot-oprydning | Gennemført (VM: kun security; Tour: minor/patch merget, majors venter på platformen). |

## 2. Vigtigste NYE fund (20/7)

### 2.1 VM har Tours netop-fiksede race condition — u-fikset ⚠️
Tour fandt og fiksede tre alvorlige scoring-fejl, som VM's motor deler arkitektur med:

1. **Race på total-beregning** (Tour-fix `4f4a60b`): to kampe/etaper afgjort tæt
   på hinanden → parallelle `recalcUserTotal`-kald → last-writer-wins skriver
   en forældet sum. Tour kører nu i `runTransaction`; **VM's `recalcUserTotal`
   (functions/index.js ~L680) har stadig ingen transaktion** og kaldes fra
   flere parallelle onWrite-stier. VM 2026 er slut, men lav en efterkontrol med
   Tours `recalcAllTotals`-mønster, hvis slutstillingen betvivles — og
   platformen SKAL arve transaktions-varianten.
2. **Genscoring ved config-ændring** (Tour-fix `b79cfa6`): server-totaler frøs
   med gammel pointtabel, når admin ændrede den. Platform-krav: genscor alle
   afgjorte runder ved facit- OG config-ændringer.
3. **Aggregering tabte docs uden season-felt** (Tour-fix `021a172`) — relevant
   så snart platformen bliver flersæsonet.

### 2.2 Nyt i VM siden 5/7 (og hvad platformen skal bruge)

- **FIFA-datakilde med kildeskift (GENERISK mønster, høj værdi):** komplet
  adapter-lag (`fifaData.js` → `fifaMap.js` (ren mapping) → `fifaResultsSync.js`
  (ren beslutning) → `fifaSync.js` (orkestrering)) bag ét config-flag
  `config/settings.dataSource`, med skygge-scoring/dry-run side om side med
  football-data før omlægning. **Det er præcis mønstret, platformen skal bruge
  til flere spil/datakilder — inkl. Superligaen via Flashscore** (se
  `samlet-platform.md` §8).
- **Statistik-universet** (spillersider, skudkort, stil-radar, xG, power-index,
  Turneringens Hold, målmands-/straffetavler, landeoversigt): fodbold-indhold,
  men `PlayerLink`/detaljeside-mønstret og "foldbare statistikgrupper" er
  generisk UX, platformen bør standardisere.
- **Afslutnings-feature (pause-kontakt + takke-mail):** generisk pause-kontakt
  `config/automation.paused` der gater ALLE schedulede jobs + afsluttende
  takke-mail med slutstilling pr. liga (standard-konkurrencerangering ved
  delte placeringer), medaljer og turneringsfakta. **Porteres til Tour nu**
  (se §3) og bliver platform-standard for alle spil.
- **Server-spejl af liga-bonus-scoring** (`leagueBonusScoring.js`) så mails/
  server-beregninger matcher klientens liga-stilling.

### 2.3 Nyt i Tour siden 5/7 (og hvad VM/platformen skal bruge)

- **Scoring-robusthed** (§2.1) — transaktion + `recalcAllTotals`-reparation +
  genscoring ved config-ændring. **Platform-krav nr. 1.**
- **LeagueAwards** (`leagueBonusAwards`-collection): liga-bestyrer kan tildele
  manuelle point pr. medlem på fælles bonusspørgsmål — fuldt generisk, direkte
  portérbar.
- **AI-berigelse med fri-tags** (`riderTags.js` + kanonisering af synonymer +
  idempotent merge + live-redigerbart overlay-doc): generisk mønster —
  "AI udtrækker entitets-tags fra tekstfeed" — kan genbruges på spillere/hold.
- **Holdnavne-audit + remap** på tværs af historiske tips inkl. genscoring:
  generisk mønster for enhver entitets-omdøbning.
- **Autoritativ tidsplan-synk** (`stageTimes.js`): officielle starttider
  overskriver seedede, og tip-låsen følger med — generisk mønster (VM gør
  reelt det samme via fixtures; platformen bør have ét fælles mønster).
- **Diagnose-callables** (`debugUserPoints`, `debugStageSync`): "dump en
  spillers point-fordeling" og "stored vs. live kilde-diff" — generiske
  admin-mønstre.
- **Selfheal-værn i synk** (delta-mod-manglende-forrige-etape-guard) og
  force-refresh af proxy-cache: cykel-specifik mekanik, men lærdommen
  (delta-beregninger skal nægte at regne mod et hul) er generel.

### 2.4 SyncHealthBanner: begge har nu halvdelen hver
Tour SKRIVER `config/tourSyncStatus` (lastRunAt/lastSuccessAt/lastError), men
har **ingen UI** der viser det. VM har banneret (`SyncHealthBanner.jsx` +
`useSyncStatus`) og har haft det hele tiden. **Portér VM's banner til Tour**
(lille indsats — datakilden findes allerede) og gør det til platform-standard.

## 3. Igangværende port: afslutnings-featuren VM → Tour

Porteres på branch `claude/multi-game-player-collection-21mc1w`:
- Generisk 1:1: `automationPaused`-gate på Tours 7 schedulede jobs,
  `setAutomationPaused`, mail-plumbing (Tour bruger sin egen
  `userContacts`-baserede `emailByUidMap` i stedet for VM's Auth-opslag),
  liga-slutstilling med 1224-delt-placering, medaljer/"· dig", admin-panelet
  "🏁 Afslutning" med udkast-til-mig (dryRun) og dobbelt-bekræftet send-til-alle.
- Omskrevet til cykel-domænet: `tourSummary.js` (samlet klassement-podie,
  trøjevindere, etapesejrs-optælling, Tour-fakta) erstatter VM's
  `tournamentSummary.js` (verdensmester, topscorer, Turneringens Hold).

## 4. Fælles huller (uændret siden 5/7)

- Ingen lazy loading/code-splitting og ingen error boundaries i nogen af
  apperne. Skal ind i platform-skelettet fra dag 1.
- E2E er stadig kun det uautentificerede smoke-spec i begge.

## 5. Testtal (20/7)

| | Unit-testfiler | E2E |
|---|---|---|
| Tour | ~115 | 1 (smoke) |
| VM | ~101 | 1 (smoke) |

Integrationstest-disciplinen (VM: pipeline/knockout mod emulator) er fortsat
kun i VM — stadig et punkt, platformen skal arve.

## 6. Prioriteret platform-arv (revideret)

1. **Scoring-kernen fra Tour** (transaktion, recalcAllTotals, genscoring ved
   config-ændring, season-robust aggregering).
2. **Sikkerhedsmodellen som fælles superset:** VM's isApproved-gate +
   pointfelt-lockdown + append-only medlemskab, Tours doc-ID-pinning +
   `userContacts` + invite-hardening + sanitizeName.
3. **VM's adapter-mønster for datakilder** (kildeskift-flag, ren mapping/
   beslutning/orkestrering, skygge-kørsel) — genbruges til Superligaen.
4. **Afslutnings-featuren** (pause + takke-mail) som standard-livscyklus for
   ethvert spil: åbn → kør → afslut → tak.
5. **SyncHealthBanner + diagnose-callables** som standard driftsudstyr pr. spil.
6. **LeagueAwards, broadcast, joinlinks, presence** — engagement-laget.
7. Lazy loading + error boundaries + autentificeret e2e i skelettet.
