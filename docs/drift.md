# Drift: de manuelle workflows

Alt her køres i hånden fra **GitHub → Actions → vælg workflow → Run workflow**.
De rører produktionsdata direkte (Admin SDK, uden om security rules), så de
fleste har et **`dryRun`-flueben, der som standard er slået TIL**. Kør altid
tør-kørslen først og læs loggen, før du slår den fra.

> `dryRun` fejler **åbent**: glemmer man at sætte miljøvariablen i et script,
> skrives der rigtigt. Brug altid workflow-formularen frem for at køre
> scriptsene manuelt.

## Oversigt

| Workflow | Hvad den gør | Hvornår | Secrets |
|---|---|---|---|
| **Deploy platform** (`deploy-platform.yml`) | Bygger og udruller tip.vejleaa.dk: hosting, `firestore.rules`, indexes — og valgfrit Cloud Functions | Efter hver merge til base-branchen | `FIREBASE_SERVICE_ACCOUNT_SPIL` |
| **Deploy** (`deploy.yml`) | Samme for tour.vejleaa.dk | Når Tour-appen ændres | `FIREBASE_SERVICE_ACCOUNT` |
| **Backfill liga-adgang** (`backfill-player-leagues.yml`) | Genopbygger `leagueIds` på både `players/{uid}` og `bets/{uid_matchId}` ud fra ligaernes `memberUids` | Hvis stillingen står tom, hvis ligaens tips ikke vises efter kickoff, eller efter en dataimport | `FIREBASE_SERVICE_ACCOUNT_SPIL` |
| **Tjek for dublet-tips** (`audit-duplicate-bets.yml`) | LÆS-ONLY: finder flere tips fra samme spiller på samme kamp | Ved mistanke om snyd | `FIREBASE_SERVICE_ACCOUNT_SPIL` |
| **Ryd e-mails fra offentlige profiler** (`strip-public-user-emails.yml`) | Fjerner `email` fra `users/{uid}`; sikrer først adressen i `userContacts` | Engangs — kørt 27/7 2026 | `FIREBASE_SERVICE_ACCOUNT_SPIL` |
| **Eksportér gamle liga-slutstillinger** (`export-legacy-leagues.yml`) | Top 5 pr. liga fra Tour + VM → `legacyLeagueResults`. Driver "Indsæt top 5" i Send mail | Før en invitationsrunde | `FIREBASE_SERVICE_ACCOUNT`, `…_VM`, `…_SPIL` |
| **Migrér brugere (Tour)** (`migrate-users.yml`) | tour-85928 → spil-89af9 **med bevarede kodeord** | Engangs — kørt | `FIREBASE_SERVICE_ACCOUNT`, `…_SPIL`, `TOUR_HASH_CONFIG` |
| **Migrér brugere (VM)** (`migrate-vm-users.yml`) | vm2026-tip → spil-89af9, **fletter på e-mail** | Engangs — kørt | `FIREBASE_SERVICE_ACCOUNT_VM`, `…_SPIL`, `VM_HASH_CONFIG` |

`*_HASH_CONFIG` er SCRYPT-parametrene fra kildeprojektets Auth-eksport. Uden dem
kan kodeord ikke følge med — så brugerne skal nulstille. De findes kun som
repo-secrets; kan de ikke fremskaffes igen, er en ny migrering ikke mulig med
bevarede kodeord.

## Rækkefølge ved en ny sæson / et nyt spil

1. **Deploy platform** med `seedGames` (opretter/opdaterer spil-dokumenterne).
2. **Deploy platform** med `seedSuperliga`, hvis kampprogrammet skal ind
   (132 kampe + odds fra `scripts/superliga-fixtures.json`).
   For **Premier League** findes der intet workflow-step — begge steps er
   hårdkodet til `superliga2627`. Første seed køres derfor lokalt; se
   "Seed et nyt fodbold-spil" nedenfor.
3. Sæt **startrunde** i Admin → Spil-tidsplan. Startrunden vælges fra en liste
   over spillets runder med datointerval; vælger man ingen, udledes den af den
   gamle startdato.
   - **Pulje-deadline:** har spillet en **fast** dato-deadline (Superligaen),
     sættes den i deadline-feltet samme sted. Er spillet sat op med en
     **rundebaseret** deadline (`puljeLockRound` i `scripts/games.mjs` — sådan
     er Premier League), er feltet ren oplysning: kør i stedet
     **🗓️ Synk kamptider nu** samme sted, så udledes `puljeLockAt` af rundens
     tidligste kickoff. **Sæt ALDRIG en placeholder-dato i deadline-feltet på et
     rundebaseret spil** — passerer den, inden synken kører, låser
     genåbnings-forbuddet, og deadlinen kan så aldrig sættes til den rigtige
     runde-dato (fejlen ender som en drift-alarm, ikke tavst).
4. Inviter spillere. Ligaer oprettes af spillerne selv; koden i invitationslinket
   tilmelder dem i ét klik.
5. **Backfill liga-adgang** — kun nødvendig hvis liga-medlemskaber er kommet ind
   uden om appen (dataimport). Triggeren holder det ellers selv opdateret.

## Seed et nyt fodbold-spil

`scripts/seed-football.mjs` seeder ét spil. Premier League er skåret i to spil
efter runde, så `--runder` bestemmer, hvilken halvdel der kommer med:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json node scripts/seed-football.mjs \
  --game pl2627-efteraar \
  --teams src/data/premierLeagueTeams2026.js \
  --fixtures scripts/premier-league-fixtures-2627.json \
  --runder 1-18
```

Tør-kørsel er default. Ser tallene rigtige ud, køres den igen med `--skriv`.

`--teams` og `--fixtures` opløses mod **repoets rod**, ikke mod den mappe du står
i, så kommandoen virker uanset hvorfra den køres. Men **selve scriptet** skal
findes: står du et andet sted, så skriv den fulde sti til
`scripts/seed-football.mjs`, ellers svarer Node med `Cannot find module` — en
fejl, der ligner en mangel i repoet og ikke er det.

`/sti/sa.json` ovenfor er en **pladsholder**. Sæt din egen sti til
service-account-nøglen ind; scriptet siger fra med det samme, hvis filen ikke
findes.

Scriptet nægter at skrive, hvis et holdnavn i kampprogrammet ikke findes i
holdlisten. Det er med vilje: `teamElo()` giver **tavst 1500** for et ukendt
navn, så hele klubben ville få odds som et midterhold uden en eneste fejlbesked.

**Spillet skal findes først** (`seedGames`). Peger `--game` på et spil, der ikke
er oprettet, siger `--kickoffs-only` pænt `✅ 0 kickoff-tider opdateret` uden at
fejle — så tjek, at tallene ikke er nul hele vejen ned.

**Et rettet holdnavn eller en rettet runde kan ikke seedes ind bagefter.**
Dokument-id'et udledes af runde+hold (Superligaen) eller kommer fra kilden (PL),
så en rettelse opretter en **ny** kamp ved siden af den gamle. Runden får så 11
kampe i stedet for 10, og afregningen venter for evigt på et resultat, der aldrig
kommer. `firestore.rules` har `allow delete: if false` på kampe, og ingen
admin-flade rører `matches`. Den slags kræver et skræddersyet script.

## Kickoff-tider, der flytter sig (Premier League)

Premier League udgiver programmet **før** TV-udvælgelsen. Kun runde 1–5 har
fastlagte tidspunkter; runde 6–38 står med alle ti kampe i samme standard-slot
og bliver flyttet hen over sæsonen — typisk 5–6 uger før kampen.

### Driftstatus i Admin — loggen, ejeren faktisk kan finde

Alle alarmer i dette afsnit står OGSÅ under **Admin → 🩺 Driftstatus**:
seneste status pr. kørsel (sweep, kickoff-synk, minut-synk på kampdage) og
åbne alarmer (strandede kampe, genåbnings-afvisninger, <48t-flytninger,
manglende kampdokumenter, og **live-pulsen der står stille**). Alarmer, der ikke kan løse sig selv, kræver en
kvittering i fladen — ⚠-markøren på Admin-knappen står, til de er set.
Functions-loggen er stadig sandheden for historik; fladen viser NU-billedet.
En strandet-alarm peger selv på sit remedie: **⬇️ Synk resultater nu** under
🗓️ Spil-tidsplan — og finder den intet, har kilden ikke facit endnu, så er
hånd-vejen i admin-guiden (Resultater) svaret.

### Den daglige automatik (primærvejen)

`syncGameKickoffs` retter tiderne **hver morgen kl. 6.10** for de spil, hvis
provider kan levere dem — nu **både Premier League og Superligaen**. En kamp,
hvis FORKERTE tid allerede er PASSERET, kan automatikken ikke flytte
(genåbnings-vagten); den rettes ad workflow-vejen nedenfor. Beslutningerne er
SPEJLET fra `--kickoffs-only`
(paritetstestet i `functions-platform/seedFootball.test.js`), så de to veje
giver samme svar: spillede kampe røres aldrig, en tid der står kan aldrig
RYDDES af en rutinekørsel, og en kilde-kamp uden dokument er en alarm.

- **Manuel udløsning:** callablen `syncGameKickoffsNow` (admin) — tør-kørsel
  er default; kun `{ dryRun: false }` skriver. Det er forhåndsvisningen.
- **Stempelfelter:** automatikken skriver `kickoff` + `kickoffSyncedAt`; den
  manuelle seed-vej skriver `kickoff` + `updatedAt`. To felter med vilje —
  så man i Firestore kan se, OM en tid sidst blev rørt af automatik eller
  af et menneske.
- **<48-timers-alarmen:** flyttes en kamp til et tidspunkt under 48 timer ude
  (eller i fortiden), gennemføres ændringen, men der logges en ERROR — et
  menneske skal vurdere, om nogen har nået at tippe med facit i hånden.
  Rules kan ikke annullere tips, der var lovlige under den gamle deadline.
- **Genåbnings-forbuddet:** en PASSERET kickoff flyttes ALDRIG til fremtiden
  af automatikken — det ville genåbne tips på en kamp i gang, efter at alles
  tips har været synlige. Ændringen afvises med ERROR i loggen; en ægte
  genopsat kamp rettes bevidst ad seed-vejen nedenfor.
- **Kun spillets runder tolkes:** kilden leverer hele sæsonen (380 kampe),
  spillet har sine (efterår: 180). Resten droppes før tolkning, så
  MANGLER-alarmen kun kan indeholde ægte fund.
- **Fejlmodellen:** melder kilden en kamp UDEN tid, mens dokumentet har en,
  stopper HELE det spils kørsel den dag (fejlen står som
  "Kickoff-synk … fejlede (ignoreret)" i functions-loggen) — ingen delvis
  plan skrives. De andre spil fortsætter. Den ene kamp skal håndteres
  bevidst (udsat kamp uden ny dato), før spillets synk kører igen.
- **Spillerne får ingen "kampen er flyttet"-notits** — deadline følger bare
  med, og tip-påmindelsen samler kampe op, der flytter ind i dens vindue.
  Det er en bevidst beslutning, ikke en glemt feature.

Det er ikke kosmetik. **Kickoff er tip-deadlinen** (`firestore.rules`), så en
forkert tid lukker kuponen på det forkerte tidspunkt. Og resultat-synken leder
kun efter kampe i et vindue omkring tidspunktet, så et facit ville aldrig lande.

For **Superligaen** er der et workflow-input: `seedKickoffs` (og `seedKickoffsSkriv`,
som er tør-kørsel, indtil den tikkes af). For **Premier League** findes der intet
step — den køres lokalt. Tør-kørsel først; den skriver intet og viser hver
enkelt ændring, i dansk tid:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json node scripts/seed-football.mjs \
  --game pl2627-efteraar \
  --fixtures scripts/premier-league-fixtures-2627.json \
  --kickoffs-only
```

Ser listen rigtig ud, køres den igen med `--skriv`.

Læs især linjen **IKKE SEEDET**. Den tæller kampe, der står i filen, men ikke i
spillet. Aftenen før en runde er det en alarm, ikke en detalje: sådan en kamp har
ingen deadline og kan ikke tippes.

Scriptet **nægter at fjerne** et tidspunkt, der allerede står. En udsat kamp uden
ny dato ser harmløs ud i loggen (`→ —`), men gør tre ting på én gang: reglerne
sammenligner tiden mod `null` og afviser hvert tip, `isLocked` returnerer alligevel
`false`, så knapperne står åbne, og påmindelsen springer kampen over. Det skal
håndteres bevidst, ikke som bivirkning af en rutinekørsel.

`--kickoffs-only` skriver **kun** `kickoff` og `updatedAt`. Den rører aldrig
odds, Elo eller resultat, og den lader en kamp med facit helt være — dens
tidspunkt er historie, ikke en deadline. Den bruger `update`, ikke `set`, så
den kan heller ikke oprette en kamp, der ikke er seedet endnu.

## Hvis en trøjefarve er forkert på kampkortet

Symptomet ser kosmetisk ud og er det ikke: et hold tegnes i en farve, der
clasher med hjemmeholdets, fordi produktionens holdliste er ældre end repoets.

`badgeFor` falder tilbage `thirdColor || awayColor || color`. Mangler
tredjefarven, bliver tredje **lig med** ude, og `matchBadges` — som vælger den
FJERNESTE af de to — kommer til at sammenligne en værdi med sig selv. `>` er
strengt, så udetrøjen bliver stående, uanset hvor tæt den ligger. Det var
præcis dét, der skete for Randers ude mod FC Midtjylland.

**Aflæs produktionen først — men kend instrumentet.** Admin → 🎨 **Hold-farver**
viser hver farve som hex, og det er den hurtigste vej til et overblik. Men den
viser den **effektive** farve: fanen fletter admin-overrides fra
`games/{id}.teamStyles` ind over datafilen, så en override kan skjule, at
`teams` mangler farven. Har nogen brugt nødbremsen nedenfor, ser feltet altså
rigtigt ud, mens `teams` stadig er forældet.

Den **rå** aflæsning af `teams` er tør-kørslen selv — `fra →`-kolonnen viser,
hvad der faktisk står i produktionen, og den skriver ingenting.

To forskellige tilstande i `teams` giver samme syn på skærmen, og de skal ikke
forveksles:

| Hvad der står i prod | Hvad kortet viser |
|---|---|
| `thirdColor` mangler | udetrøjen (`#33384F` for Randers) |
| `thirdColor` er den gamle `#003C7E` | tredjetrøjen — som også er marineblå |

Er det den gamle værdi, er holdlisten drevet; er feltet væk, er den ældre endnu.
Begge rettes samme sted.

**Rettelsen:** GitHub → Actions → **"Deploy platform (tip.vejleaa.dk)"** →
`seedTeams` + vælg spil. Der tørkøres, indtil du sætter fluebenet i
`seedTeamsSkriv` — sæt det først, når du har læst loggen igennem.

Bemærk, at kørslen som alle de andre seed-input først bygger og deployer hele
platformen (frontend, regler, indexes) og derefter retter holdlisten. Det er
samme vilkår som `seedKickoffs`, men det er værd at vide, når tør-kørslen
bruges som ren diagnose. Lokalt koster det ingenting:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json node scripts/seed-football.mjs \
  --game superliga2627 \
  --teams src/data/superligaTeams2026.js \
  --teams-only
```

`--teams-only` skriver **kun** `teams` og `updatedAt`. Den rører hverken kampe,
odds, Elo-historik eller resultater — og den kræver ikke `--fixtures`.

**Den afviser hårdt**, hvis holdlisten ville ændre `elo`, ændre `short`,
antallet af hold, eller hvis et holdnavn står to gange i filen — og skriver
ikke noget som helst.
Afvisningen sker også i en tør-kørsel: står den tilstand, er svaret at rette
holdlisten, ikke at prøve igen med `--skriv`. Det er ikke pedanteri: `teams[].elo` er
seed for `recomputeSeasonElo`, så et ændret tal ville få næste facit til at
omskrive sæsonens Elo-historik **og** prisen på hver ulåst kamp. Og
`teams.length` afgør, om den officielle tabel godtages ved pulje-afregningen.
Skal noget af det ændres, hører det til et fuldt seed mellem to sæsoner.

`short` kom til listen, da holdsiden gjorde kortkoden til en URL-nøgle:
`/spil/{spil}?fane=elo&hold=BIF`. Ændres den, dør hvert delt hold-link tavst —
modtageren får "Holdet ⟨BIF⟩ er ikke med i dette spil", uden at nogen har rørt
spillet. Det var netop en kosmetisk rettelse af en kortkode, vagten er skrevet
for at stoppe.

Tør-kørslen advarer også, hvis holdene står i en anden RÆKKEFØLGE end i
produktionen. Ingen point flytter sig, men pulje-gitteret tegnes i array-orden,
så holdknapperne ville flytte sig for alle spillere.

**Læs tør-kørslen igennem.** Den er den eneste vagt, der findes mod at repoets
holdliste og produktionens er drevet fra hinanden — ingen test kan se det,
for de kører alle sammen på repoets liste. Hvor meget der er på spil, kan måles:
`npx vite-node scripts/troeje-raekkevidde.mjs` viser, at en manglende
tredjefarve i Superligaen ændrer udetrøjen i **35 af 132** kampkort (og
**67 af 380** i Premier League) — ikke kun det ene, man fik øje på.

**Nødbremse i en aktiv runde:** Admin → 🎨 Hold-farver kan rette en enkelt farve
med det samme, uden deploy og uden produktionsnøgle. Men den kan kun farver
(ikke mønstre), og en override dér skygger permanent for datafilen.

## Live-stilling på kampkortene (minut-synken)

Begge ligaer leverer nu live: minut-synken skriver stilling + halvleg til
kampens `live`-felt på kampdage, og facit rydder det. For **Premier League**
er `period` nu delvist efterprøvet mod en ægte live-capture (runde 1,
23/8-2026, to kampe i gang): på **kamp-niveau** sås `PreMatch`, `SecondHalf`
og `FullTime` — og **ingen ukendte tokens**. Capturen ligger som
`functions-platform/fixtures/pl-live-runde1.json` og er bundet af en test, så
tolkningen ikke kan skride ubemærket. `FirstHalf` er derimod **stadig kun set
på hændelses-niveau** (begge kampe var forbi pausen, da capturen blev taget) —
en capture fra en kamps første halvleg ville lukke det punkt. `halftime`,
`extratime`, `shootout`, `abandoned` m.fl. er uobserverede naboer.

For **Superligaen** er `statusFull` efterprøvet på samme vis: en live-capture
fra runde 5 (`functions-platform/fixtures/sl-live-runde5.json`, AC Horsens–
Lyngby) bekræfter `2nd half` → "2. halvleg" og — vigtigere — at kampens `id`
er **null**, mens den er i gang. Nøglen SKAL derfor bygges af runde +
holdnavne (`matchDocId`); et id-opslag ville lade live-vejen dø tavst. Et token, vi ikke kender, fejler SIKKERT: kampen vises som blot
"DIREKTE", regnes stadig som i gang (aldrig et falsk "Slut"), og der logges
`pulselive: ukendt live-period` — dukker det op i loggen, tilføjes ordet i
`PL_PERIOD_STATUS` (`functions-platform/syncProviders.js`).

**Står live-visningen stille midt i en kamp** ("⏸ Opdatering afbrudt" på
kortet), er spillets puls (`liveHeartbeatAt`) over 5 minutter gammel. Selve
stillingen er stadig den sidst kendte — vi sletter aldrig, vi dæmper. Kig i
**Admin → 🩺 Driftstatus** på *Minut-synk · <spil>*: rødt kort navngiver det
fejlende led (`opslag:` / `resultater:` / `live:`), et gammelt grønt kort
betyder, at jobbet slet ikke kører. Facit går ikke tabt uanset hvad —
times-sweep'et henter det. Bemærk, at minut-synken slipper en kamp 2½ time
efter kickoff (`WINDOW_MS`).

## Rækkefølge ved ændringer i security rules

Reglerne deployes **sammen med hosting**. Strammer man en regel, der kræver et
nyt felt i data, skal feltet udfyldes **først**:

1. Merge ændringen.
2. Kør det backfill-workflow, som udfylder feltet (fortsat på de gamle regler —
   feltet er bare ubrugt indtil videre).
3. Deploy platformen, så de nye regler går live.

Gør man det omvendt, er der et vindue, hvor brugerne ser tomme lister.

## Deploy-inputs, der er værd at kende

`deploy-platform.yml`:
- `deployFunctions` (default **false**) — Cloud Functions udrulles **ikke** ved
  en almindelig deploy. Har du ændret noget i `functions-platform/`, skal det
  sættes til true, ellers kører den gamle backend videre.
- `seedGames` (default false) — skriver spil-dokumenter i produktion.
  På spil, der **allerede findes**, springer seedet `status` og `joinable` over.
  De to felter ejes af Admin → 🗓️ Spil-tidsplan, og listen i scriptet er ældre
  end virkeligheden. Uden den undtagelse ville en seed-kørsel stille rulle et
  spil fra "Afsluttet" tilbage til "I gang" — den skriver med merge, så det
  hverken fejler eller efterlader spor.
- `seedSuperliga` (default false) — skriver hele kampprogrammet. Kører
  `scripts/seed-football.mjs` (som afløste `seed-superliga.mjs`, der var
  hårdkodet til Superligaen). Kampe, der **allerede har odds**, springes over:
  fra seedet og frem er det `recomputeSeasonElo`, der ejer oddsene — de friskes
  op efter hvert resultat frem til kickoff og låses dér. Et gen-seed ville
  skrive dem tilbage til Elo fra den dag, programmet blev lagt ind.
  **Bemærk:** spil-dokumentet (`teams`, `eloCurrent`) skrives altid, også når
  nul kampe skrives. Kørslen er altså ikke en ren no-op midt i en sæson.
  `eloCurrent` sættes tilbage til sæsonstart-værdierne og genberegnes først, når
  `recomputeSeasonElo` kører. Den kører af sig selv **kun**, når en kamps
  resultat ændrer sig — men kan nu også startes manuelt med 💰 **Ompris
  kampene** i Spil-tidsplan. Uden den knap kunne Elo-tabellen under en
  landskampspause vise sæsonstart-værdier i op mod to uger, mens grafen
  (`eloHistory`, som ikke røres) viste det rigtige forløb. Holdfarver **og
  visningsnavne** redigeret i admin ligger begge i `teamStyles` og røres ikke.
- `seedTeams` (default false, med `seedTeamsSpil` og `seedTeamsSkriv`) — retter
  **kun** holdlisten: trøjefarver, kortkoder, stadion. Rører hverken kampe,
  odds, Elo eller resultater. Findes af samme grund som `seedKickoffs`:
  `seedSuperliga` skriver ganske vist `teams`, men også `teams[].elo` og
  `eloCurrent`, og uden nogen forhåndsvisning. `seedTeams` tørkører som
  default og **nægter at skrive**, hvis `elo` eller antallet af hold ville
  ændre sig. Se "Hvis en trøjefarve er forkert på kampkortet".
  **Vælg spillet bevidst:** `seedTeamsSpil` er en fast liste, der er et spejl af
  `scripts/games.mjs` uden paritetstest. Oprettes et nyt fodboldspil (fx
  `pl2627-foraar`), får det ikke evnen af sig selv, og vælges det uden at
  filvalget i workflowet rettes, køres det med Superligaens holdliste — dér
  afviser vagten med 20 forsvundne og 12 tilføjede hold.
- `seedKickoffs` (default false) — retter **kun** kickoff-tider. Skriver
  hverken odds, Elo eller resultat, og lader kampe med facit være. Findes,
  fordi `seedSuperliga` efter ovenstående ikke længere kan rette et tidspunkt
  midt i sæsonen: alle kampe har odds, så alle springes over. Uden dette input
  ville en flyttet kamp kræve en produktionsnøgle på en bærbar.

## Hvis noget ser tomt ud

| Symptom | Sandsynlig årsag |
|---|---|
| Stillingen er tom for alle | `players/{uid}.leagueIds` mangler → kør backfill, eller brug 🔐 **Genopbyg liga-adgang** i Admin → Spil-tidsplan |
| "Ingen tips at vise fra dine ligaer" på en spillet kamp | `bets.leagueIds` mangler (tip skrevet før feltet fandtes) → samme backfill |
| "Kunne ikke hente ligaens tips" | Composite-indexet `bets` (matchId + leagueIds) er ikke bygget færdigt → tjek Firestore → Indexes |
| Stillingen viser kun dig selv | Du er ikke med i en liga endnu — det er den forventede visning |
| Runde 1 mangler i spillet | `game.startRound` er 2 eller højere. Det er tilsigtet; vælg "ingen gate" for at vise alt |
| Point mangler for tidlige runder | Samme gate. Efter et skift i `startRound`: tryk 🔄 **Genberegn point** |
| En runde vises halvt | Kan ikke ske længere — gaten tæller hele runder. Sker det, er `m.round` ikke sat på nogle af kampene |
| Point er forkerte efter en ændring af selve POINTREGLEN | 🔄 **Genberegn point** hjælper IKKE — se afsnittet nedenfor |
| Ingen påmindelser sendt | Se **Admin → 🩺 Driftstatus** → *Daglig tip-påmindelse · <spil>*: spillet kan være sat **på pause** (⏸ under 🔔 Påmindelser), `SMTP_PASSWORD` kan mangle i `spil-89af9`, eller kampene ligger i en runde før `startRound`. Kortet siger hvilken |
| Live-stillingen opdateres ikke ("⏸ Opdatering afbrudt" på kampkortene) | Se om der står en **livetavs-alarm** under 🩺 Driftstatus. **Gør der det**, er det serveren; alarmen bliver stående, til du kvitterer — også efter udfaldet er ovre, så et selv-helet udfald ikke sletter sit eget spor. Fejlteksten står på minut-kortet, mens udfaldet står på. **Gør der det IKKE**, er serverens puls frisk, og det er browserens forbindelse — genindlæs siden. Facit og point rammes ikke; de lander via sweep'et. Alarmen tæller kun kampe, der FAKTISK viser en levende stilling — en kamp markeret "Slut · afventer facit" eller en, live aldrig kom i gang for, udløser den ikke |
| Runde-Botten poster ikke | `ANTHROPIC_API_KEY` mangler, ligaen har under 2 medlemmer, eller runden er allerede recappet (`game.recappedRounds`) |

## To slags genberegning — de retter IKKE det samme

Den vigtigste skillelinje i drift, og den nemmeste at falde i: de to knapper
ligner hinanden, men den ene kan ikke rette det, den anden retter.

| Hvad er ændret | Værktøj | Hvorfor |
|---|---|---|
| `game.startRound` STRAMMET (fx 2 → 3), en liga, en puljeafregning | 🔄 **Genberegn point** (`recomputeGameScores`) | `bets.points` er allerede rigtige; kun totalerne skal lægges sammen forfra |
| `game.startRound` LØSNET (fx 3 → 2) | **`rescoreGameBets`** — ikke Genberegn point | Kampe, hvis facit faldt, MENS de var gatet, står med `points: 0`. `recomputeGameMatchCore` returnerer tidligt for en gatet kamp og skriver aldrig et point på den, så der er intet at lægge sammen. Stillingen ville vise for lave tal uden en eneste fejlbesked |
| En LIGAS `startRound` (sat/ændret af ejeren) | Ingenting | Ligaens total regnes i fladen af `players.perRound` — der er intet server-tal at genberegne. MEN: spillere, der aldrig er genberegnet efter udrulningen af `perRound`, mangler vektoren og vises som "ikke klar" — kør 🔄 **Genberegn point** for spillet én gang efter udrulning |
| **Selve pointreglen** i `superligaScoring.js` — fx træf-bonussen eller combi-formlen | **`rescoreGameBets`** | `bets.points` er kilden til totalen, og de står med det GAMLE tal |
| **Odds-modellen** — `ELO.DRAW_BASE`, `DRAW_DECAY`, `ODDS.MIN`, seed-Elo | 💰 **Ompris kampene** (`repriceGameOdds`) | Odds er frosne på kamp-dokumentet. Hverken de to andre knapper eller et deploy rører dem — se nedenfor |

`bets/{id}.points` skrives kun af `recomputeGameMatchCore`, som kun kaldes, når
en kamps **facit ændrer sig**. Ændrer man pointreglen, rører den derfor ikke et
eneste eksisterende bet.

**Fælden:** `recomputeGameScores` er ren aggregering. Efter en regelændring
returnerer den et pænt `{players, gatedMatches}` og ser ud, som om den virkede —
men den retter ingenting, fordi den lægger de gamle bet-point sammen. Symptomet
er, at skærmene modsiger hinanden uden en fejlbesked: Tip-fladen regner den nye
regel live, Mine tips viser det gemte tal, og ⚡ Chancen — som udledes som
(gemte point − 1X2-point) — går i **minus** for alle, der har ramt noget.

### Sådan køres bagfyldningen

**GitHub → Actions → "Genscor bets efter regelændring (spil-89af9)".**

| Felt | Tør-kørsel | Skrivning | Gendan |
|---|---|---|---|
| `gameId` | `superliga2627` | `superliga2627` | `superliga2627` |
| `skriv` | **tom** | præcis `SKRIV` | tom |
| `gendan` | tom | tom | filnavnet fra en backup-artefakt |

`skriv` er en tekst og ikke et flueben med vilje: et flueben er for nemt at
komme til. Alt andet end præcis `SKRIV` tørkører.

**Backup tages ALTID** — også ved tør-kørsel — og lægges op som artefakt på
kørslen (`bets-backup-<gameId>-<run_id>`, gemt i 90 dage). Den indeholder hvert
bets `points` FØR kørslen. De gamle værdier findes ikke i noget andet felt og
ingen historik, så filen er den eneste vej tilbage uden PITR.

**Læs tør-kørslen, før du skriver.** Ved en ren træf-bonus-ændring flytter hvert
ændret bet sig præcis lige meget, fordi combi-formlen ikke rører `bets.points`,
og Chancen afregnes uændret til de rene odds. Sæt derfor `forventetPrBet` til
**(ny bonus − gammel bonus)** — `+1` da den gik 0→1, `-1` da den gik 1→0 — og
kontrollér, at `delta` er `antal ændrede × forventetPrBet`. Scriptet siger det
selv med ✓ eller ⚠️. Passer det ikke, har noget andet flyttet sig: **stop og
find ud af hvad**.

Lades feltet tomt, lyser ✓ aldrig. Det er med vilje: den første udgave af
kontrollen sammenlignede uden fortegn, fordi bonussen dengang gik op. Da den gik
ned igen dagen efter, advarede den på en helt korrekt kørsel — og ✓ kunne kun
lyse, hvis pointene bevægede sig opad. Vi gætter ikke på retningen.

**Tripwiren ser kun på summen.** Havde halvdelen af tippene flyttet sig −2 og
den anden halvdel 0, ville totalen stadig se rigtig ud. Brug derfor
`combi-sammenligning`-workflowet som forkontrol — det er læs-only og giver et
facit **pr. spiller**. Bemærk, at dens "i dag"-kolonne modellerer combi-reglen
fra før 5. august 2026 og er forældet: læs kun "ny"-kolonnen.

**Kørsler indtil nu** — tallene gør den næste kørsel kontrollerbar:

| Dato | Ændring | Ændrede | Delta |
|---|---|---|---|
| 5. aug. 2026 | træf-bonus 0 → 1 | 48 | +48,0 |
| 6. aug. 2026 | træf-bonus 1 → 0 | 48 | −48,0 |

**Kør den ikke, mens en kamp er i gang, eller mens du retter et facit.**
Bagfyldningen læser alle bets, regner, og skriver bagefter. Ændrer et facit sig
imens, ville den skrive sit forældede tal ovenpå — derfor skriver den med en
`lastUpdateTime`-precondition, så et rørt bet får hele batchen til at fejle med
`FAILED_PRECONDITION`. Det er den rigtige reaktion: kørslen er idempotent, så
kør den bare igen, når kampen er afgjort.

Den kalder selv `recomputeAllPlayerTotals` til sidst — **tryk ikke på
🔄 Genberegn point bagefter**, det er allerede gjort.

### Hvis noget skal fortrydes

Hent backup-artefakten fra kørslen, læg filen i repoet, og kør samme workflow
med `gendan` udfyldt. Den skriver hvert bets gamle `points` tilbage og
genberegner totalerne.

Skal selve **reglen** rulles tilbage, er det ikke nok at gendanne: både
functions og hosting skal vendes, ellers regner skærmene stadig den nye regel
mod gamle tal. Rækkefølgen er den samme som frem — kode først, så data.

### Der findes også en callable

`rescoreGameBets` (samme funktion, kaldt over HTTPS med et owner-token). Den er
der, hvis workflowet ikke kan bruges, men **workflowet er den normale vej**: det
tager backup, har tripwiren indbygget, og efterlader et spor. `dryRun` er default
sand, og kun boolean `false` skriver.

## Dobbelt Chancen — find og ret

Chancen må bruges **én gang pr. runde**. Reglen stod indtil trin 3 kun i
browseren, og et hul i fladen (lukket 9/8-2026) lod en spiller sætte ⚡ på kamp
A, se den låse ved kickoff, og bagefter sætte den igen på kamp B i samme runde
— den første kunne ikke fjernes, fordi reglerne afviser skrivning efter eget
kickoff. Netop dét gør rækkefølgen bevislig.

**Find** (læs-only, skriver aldrig): Actions → **Tjek for dobbelt Chancen
(spil-89af9)**. Fejler med exit 1, hvis der findes nogen — det er meningen.

**Ret**: Actions → **Ret dobbelt Chancen (spil-89af9)**. Feltet `skriv` skal
indeholde ordet **SKRIV** — alt andet (også tomt) er tør-kørsel. Sæt `game` til
det konkrete spil-id: beslutningen om at rette gælder ét fund, ikke "enhver
fremtidig dublet, uanset hvor den findes".

**Backup tages altid**, også ved tør-kørsel, og lægges op som artefakt. Filen
har samme format som `rescore-bets.mjs`' backup, så en fortrydelse køres med
`GENDAN=<fil>` dér — der findes ikke et separat gendannelses-værktøj.

**En runde uden bevis rettes ikke.** Kan rækkefølgen ikke bevises af
kickoff-tiderne, hviler den alene på et tidsstempel. `firestore.rules` afviser
nu klientens skrivning af `chanceStake`, `chanceSatAt` og `chanceFlytninger`,
så nye chancer kan ikke forfalskes — men beviskravet består, fordi de bets, en
audit kigger på, kan være ÆLDRE end reglen. For dem gælder stadig, at den ramte
selv kunne have valgt, hvilken af sine chancer der overlever. Kickoff-tiderne
kommer fra synken og kan ikke forfalskes. Sådan en runde meldes `AFVIST` og
skal afgøres i hånden.

Reglen om, **hvilken** chance der beholdes, er den først lagte. Den bor i
`scripts/lib/doubleChance.mjs` og deles af begge scripts, så de aldrig kan give
hvert sit svar.

**Tør-kørslen er kvitteringen.** Den udskriver point før/efter pr. tip og total
før/efter pr. spiller — akkumuleret på tværs af runder, hvis samme spiller har
flere fund. Den har en **tripwire** som bagfyldningen ovenfor: den kører
`rescoreAllBets` i tør-kørsel FØRST og kræver, at `aendrede` er **0**. Er den
ikke det, er et andet tips point drevet af en ubeslægtet grund, og en `--apply`
ville feje det med ind i rettelsen, uden at nogen har besluttet det. Stop og
find årsagen først.

**Bagefter — tre ting, kørslen ikke gør:**

1. **Rundens historiske delta-pile rettes ikke.** `snapshotRoundRanks` er
   vogtet af `game.snapshottedRounds` og kører ikke igen for en gjort-op runde.
   Den levende stilling retter sig selv (den regnes af `totalPoints`), men
   bevægelsen for den runde fortæller fortsat den gamle historie. Det er med
   vilje: et fremtvunget nyt snapshot ville måle de FØLGENDE runders bevægelser
   fra et udgangspunkt, ingen stod ved.
2. **Et allerede postet Runde-Bot-opslag bærer de gamle tal.** Det er en
   statisk besked, ikke en levende visning — ret den i hånden efter mønstret i
   næste afsnit.
3. **Spilleren og ligaen får ikke besked af sig selv.** En stille pointændring
   er værre end ingen rettelse.

### Kørslen, trin for trin

Spil-id'et er **`superliga2627`** — ikke projekt-id'et `spil-89af9`. Sættes det
forkerte i `game`-feltet, matcher kørslen ingen spil og gør intet.

1. **Tør-kørsel:** `skriv` tom, `game` = `superliga2627`.
2. **Læs loggen.** Den skal sige `✓ Ingen anden pointdrift` — ellers stopper den
   selv med exit 1. Sammenhold `BEHOLDES`/`FJERNES` med auditens kørsel: samme
   spiller, samme runde, samme to kampe.
3. **Hent backup-artefaktet** og bekræft, at det fjernede tip står med
   `chanceStake > 0` — så ved du, at filen er taget FØR nulstillingen.
4. **Ejeren godkender tallene.** Total før/efter er dét, rettelsen koster.
5. **Skriv:** samme workflow, `skriv` = `SKRIV`, `game` = `superliga2627`.
   Tallene i denne log skal være de samme som i tør-kørslen.

### Verifikation efter skrivningen

Sporet til de render-betingelser, der faktisk findes:

| Hvad | Hvor | Betingelse |
|---|---|---|
| ⚡-mærket er væk fra kampen | Tip-fladen, spillerens egen runde 3 | `FootballTip.jsx:548` viser pillen, og `:111` vælger rundens chance-kamp på `chanceStake > 0` |
| Tabs-linjen er væk | Samme kampkort | `FootballTip.jsx:499-508` udleder teksten af DELTAET (`tipsHistory.js:59`), ikke af `chanceStake` — den forsvinder, når pointet er genscoret |
| Totalen er rettet | Stillingen i spillet | `GameStandings.jsx` sorterer LIVE på `totalPoints`; intet gemt rangfelt skal opdateres |

**Bemærk:** der findes **intet driftkort** for pointberegning. `DriftTab.jsx:18`
kender kun `sweep`, `minut`, `kickoff` og `reminder`. Kørslens eneste kvittering
er workflow-loggen og backup-artefaktet — så gem dem.

### Tilbagerulning

Backup'en har `rescore-bets.mjs`' format **plus** `chanceStake`. Derfor:

- **Kun point tilbage:** `GENDAN=<fil>` i `rescore-bets.mjs`. Den skriver kun
  `points` — `chanceStake` forbliver nulstillet.
- **Hele rettelsen tilbage:** sæt først `chanceStake` tilbage fra backup-filen i
  hånden (det er ét dokument pr. fjernet chance), og kør derefter
  `rescore-bets.mjs` uden `GENDAN`, så pointet regnes forfra ud fra den
  genskabte chance. `chanceSatAt` er **ikke** i backup'en; feltet må sættes i
  hånden, hvis det skal være der.

**Blev kørslen afbrudt midtvejs?** Så kan chancen være nulstillet, uden at
pointet er genscoret — og en genkørsel af *dette* workflow melder "ingen
dobbelt-chancer" og exit 0, mens spilleren beholder point for en chance, der er
væk. Ret det med `rescore-bets.yml` (tør-kørsel først), ikke ved at køre dette
workflow igen. Workflowet har en `concurrency`-gruppe, så to kørsler ikke kan
overlappe.

## Gendan et rettet bot-opslag

Runde-Bottens allerførste opslag blev bygget af hele spillets felt og nævnte
derfor spillere fra andre ligaer. De blev **taget ned den 5. august 2026** og
erstattet af en fast tekst. Engangs-panelet, der gjorde det, er fjernet igen —
men de ramte beskeder bærer stadig felterne `oprindeligTekst` og `rettetAt`, og
det er dem, en gendannelse bygger på.

**Gendannelse** sker i hånden i Firestore-konsollen — det er typisk under ti
dokumenter. For hver besked under `games/{gameId}/leagues/{leagueId}/messages`
med `uid == 'runde-bot'` og feltet `oprindeligTekst`:

1. Kopiér `oprindeligTekst` ind i `text`.
2. **Slet** `oprindeligTekst` og `rettetAt`.

Trin 2 er ikke pynt: står `oprindeligTekst` tilbage ved siden af en gendannet
`text`, kan man ikke længere se, om beskeden er den oprindelige eller den
rettede. Væggen er live, så spillerne ser ændringen med det samme.

Rør ikke `createdAt`: væggen henter beskeder med `orderBy('createdAt')`, og et
opslag uden det felt forsvinder helt fra tråden.

## Billeder i Send mail (Storage)

Uploader en admin et billede i **Send mail**, skrives det til Firebase Storage
(`spil-89af9`) under `broadcast/{unikt-navn}.{ext}` af `uploadBroadcastImage`-
callablen — **server-side via Admin SDK**, aldrig direkte fra browseren.
`storage.rules` nægter derfor ALLE klient-writes; adgangen sidder i callablen
(`requireAdmin`). Billed-URL'en bærer en download-token og er offentligt læsbar,
så den virker i en mail hos en modtager, der ikke er logget ind.

- **Storage skal være aktiveret** for `spil-89af9` (Firebase Console → Storage →
  Kom i gang) én gang. Er den ikke det, svarer callablen "Firebase Storage er
  ikke sat op for projektet", og ingen billeder kan uploades.
- **Billederne er PERMANENTE — der er ingen oprydning, og det er med vilje.**
  Et billede, der er refereret i en allerede sendt mail, må aldrig slettes:
  Gmails billed-proxy genhenter pr. URL, så en sletning ville brække gamle mails
  med tilbagevirkende kraft. Volumen er få billeder om året; lad dem ligge.
- Hvert upload får et UNIKT navn. Uden det ville to forskellige billeder kunne
  dele URL, og Gmails cache ville vise det gamle billede i en ny udsendelse.

## Secrets pr. projekt

Cloud Functions-secrets sættes **pr. Firebase-projekt** — de skal altså sættes
to gange, hvis begge apps skal bruge dem:

| Secret | Projekt | Bruges til |
|---|---|---|
| `SMTP_PASSWORD` | begge | Udgående mail |
| `ANTHROPIC_API_KEY` | `spil-89af9` | Runde-Botten |
| `TDF_REFRESH_TOKEN` | `tour-85928` | Tour-datasynk |
