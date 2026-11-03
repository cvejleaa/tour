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
| **Scan ligaer for frosne felter** (`scan-liga-felter.yml`) | LÆS-ONLY, begge projekter: liga-dokumenter med `id`-felt eller navn, der ikke er en streng (frosset af reglen), og liga-spørgsmål, svar og væg-beskeder, som reglerne fra #234 afviser. Exit 2 = noget fundet (rødt), exit 1 = scriptet døde. Linjer mærket MURET INDE kan kun rettes i Firebase-konsollen — notér værdien fra loggen først; konsol-rettelser kan ikke rulles tilbage, og de er en skrivning i produktionsdata. `::warning::` om 0 læste dokumenter betyder, at scanningen ikke har kigget | Efter en regel-stramning og ved sæsoneftersynet | `FIREBASE_SERVICE_ACCOUNT`, `…_SPIL` |
| **Ryd e-mails fra offentlige profiler** (`strip-public-user-emails.yml`) | Fjerner `email` fra `users/{uid}`; sikrer først adressen i `userContacts` | Engangs — kørt 27/7 2026 | `FIREBASE_SERVICE_ACCOUNT_SPIL` |
| **Eksportér gamle liga-slutstillinger** (`export-legacy-leagues.yml`) | Top 5 pr. liga fra Tour + VM → `legacyLeagueResults`. Driver "Indsæt top 5" i Send mail | Før en invitationsrunde | `FIREBASE_SERVICE_ACCOUNT`, `…_VM`, `…_SPIL` |
| **Migrér brugere (Tour)** (`migrate-users.yml`) | tour-85928 → spil-89af9 **med bevarede kodeord** | Engangs — kørt | `FIREBASE_SERVICE_ACCOUNT`, `…_SPIL`, `TOUR_HASH_CONFIG` |
| **Migrér brugere (VM)** (`migrate-vm-users.yml`) | vm2026-tip → spil-89af9, **fletter på e-mail** | Engangs — kørt | `FIREBASE_SERVICE_ACCOUNT_VM`, `…_SPIL`, `VM_HASH_CONFIG` |

`*_HASH_CONFIG` er SCRYPT-parametrene fra kildeprojektets Auth-eksport. Uden dem
kan kodeord ikke følge med — så brugerne skal nulstille. De findes kun som
repo-secrets; kan de ikke fremskaffes igen, er en ny migrering ikke mulig med
bevarede kodeord.

## Rækkefølge ved en ny sæson / et nyt spil

**Rækkefølgen er `seedGames` → `seedKampe`, og begge tørkøres først.** Kampene
prises af spillets sport, som står på spil-dokumentet, så dokumentet skal findes,
før kampene seedes (seed-football afviser et spil uden dokument, også i
tør-kørslen). Et nyt spils tør-kørsel af `seedKampe` kan derfor først køres,
når `seedGames` er SKREVET. Vil du se kampene, holdenes start-Elo og de
skæveste odds, FØR spil-dokumentet skrives, så kør
`node scripts/toerkoersel-offline.mjs [prod-nu|tom] --game <id>` lokalt: samme
forløb mod en database i hukommelsen, ingen forbindelse, ingen skrivning. Den
antager, at de øvrige spil står præcis som listen — produktionens egen
tør-kørsel er den, der viser databasens faktiske felter.

1. **Deploy platform** med `seedGames`, UDEN `seedGamesSkriv` (tør-kørsel).
   Loggen viser pr. spil: **OPRETTES** med hvert felt (fasekalenderen én fase
   pr. linje, grupperne én gruppe pr. linje), eller hvilke felter der
   **ændres** (`felt: fra → til`; et felt med en liste af objekter, fx
   `grupper`, står udfoldet med `fra:` og `til:` hver for sig), hvilke
   admin-ejede felter der **bevares** (`status`, `joinable` — med listens værdi
   ved siden af, hvis de er forskellige), og hvilke felter i databasen listen
   ikke nævner (de bliver stående; merge fjerner aldrig et felt). Et uændret
   spil skrives ikke. Ser det rigtigt ud, så kør igen med `seedGamesSkriv`.
   Lokalt: `node scripts/seed-games.mjs` (tør) og `… --skriv`.
2. **Deploy platform** med `seedKampe` + spillets id i `seedSpil`, hvis
   kampprogrammet skal ind. Første kørsel UDEN `seedKampeSkriv` (tør-kørsel);
   læs loggen, og kør så igen med fluebenet. Hvilken holdliste og hvilket
   program spillet seedes fra, står i `scripts/seed-filer.mjs` — et nyt spil
   skal have en post dér (games.test.mjs kræver det), ikke en ændring i
   workflowet. Seedet afviser et spil, der ikke findes endnu, så trin 1 skal
   være SKREVET først. (`seedSuperliga` gør det samme for Superligaen, men
   skriver straks uden tør-kørsel.)
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
     runde-dato (fejlen ender som en drift-alarm, ikke tavst). Har spillet
     `puljeLockRound` men **ingen kickoff-synk**, er feltet redigerbart med en
     forklaring ved siden af — så sættes deadlinen dér, til rundens første
     kickoff.
   - **Deadline → Vis spillet → invitationer, i den rækkefølge.** Uden en
     gemt deadline er pulje-tippet lukket («Endnu ikke åbnet»), og en
     invitation nævner ingen deadline — og med grænsen ved dag 1
     (håndbold-VM) er invitationen netop dér, folk skulle opdage den. Mangler
     deadlinen på et spil, hvor den sættes i hånden, står der en rød advarsel
     over **👁️ Vis spillet**. Den spærrer ikke knappen; den er påmindelsen.
     Kommer kickoff-synken først efter rundens første kickoff, flytter den
     ikke en passeret deadline — så trinnet kan ikke overlades til synken.
4. Inviter spillere. Ligaer oprettes af spillerne selv; koden i invitationslinket
   tilmelder dem i ét klik.
5. **Backfill liga-adgang** — kun nødvendig hvis liga-medlemskaber er kommet ind
   uden om appen (dataimport). Triggeren holder det ellers selv opdateret.

## Seed et nyt fodbold-spil

`scripts/seed-football.mjs` seeder ét spil. Står spillet i
`scripts/seed-filer.mjs`, er `--game` nok — holdliste, kampprogram og runder slås
op dér. Premier League er skåret i to spil efter runde, så opslaget bærer
`runder: '1-18'` for efterårsspillet:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json node scripts/seed-football.mjs \
  --game pl2627-efteraar
```

Giver du selv `--teams`, `--fixtures` eller `--runder`, bruges opslaget slet ikke
(heller ikke for de andre to) — så står kommandolinjen alene for valget, og
«Mangler argumenter» siger selv, at det er derfor.

Tør-kørsel er default. Ser tallene rigtige ud, køres den igen med `--skriv`.
Fra workflowet er det `seedKampe` + `seedSpil` (+ `seedKampeSkriv` for at skrive).

**Et gen-seed skriver kun kampe.** Spil-dokumentets `teams` og `eloCurrent`
skrives kun, når spillet ikke har dem (første seed). Har spillet dem, prises nye
kampe af spillets EGEN holdliste, og tør-kørslen siger «teams BEVARES» og
«eloCurrent BEVARES» — og viser hver feltændring, hvis filens holdliste er
drevet fra spillets.

**Nye kampe prises af start-Elo, ikke af den levende Elo.** Seedet bruger
`teams[].elo` (startværdierne), aldrig `eloCurrent`. Seedes kampe midt i
sæsonen, står de derfor med start-odds.
De får levende odds ved næste facit — eller tryk **💰 Ompris**
(Admin → 🗓️ Spil-tidsplan) og skriv ændringerne.

**En turnerings næste fase seedes IKKE.** Hovedrunden og knockout-faserne
lægges ind med **📥 Læg næste fases kampe ind** (Admin → 🗓️ Spil-tidsplan,
lige efter ✍️ — se docs/admin-guide.md, *Næste fases kampe*). Den opretter
kun nye kampe (create-only — en eksisterende kamp overskrives aldrig), priser
dem af den levende Elo med sportens loft, kræver at holdene var med i fasen
før (og ved knockout: at de vandt), og afregner puljen med det samme, når
semifinalerne bliver hele. Glemmes en dag, melder Drift-alarmen
**«Kampe mangler i næste fase»** sig kl. 12 dagen før — en fases første dag
dog først, når fasen før er afgjort (se nedenfor).

**Nødvejen, hvis knappen ikke kan bruges** (fx functions er nede): skriv
kampene i en JSON-fil i programmets form (`{ "fixtures": [{ "id", "round",
"home", "away", "kickoff" }] }`, kickoff med tidszone, id
`r{dag}-{hbkode}-{hbkode}`) og kør lokalt med produktionsnøglen:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json node scripts/seed-football.mjs \
  --game hvm2027 --teams src/data/haandboldVm2027Hold.js --fixtures /sti/hovedrunde.json --runder 8-13
```

Egne argumenter slår opslaget i `scripts/seed-filer.mjs` fra (dér er
hvm2027 med vilje låst til den indledende runde, `1-7`). Tør-kørsel først og
ejerens ja, før `--skriv` (det skriver i produktionsdata). Vejen har ikke
knappens vagter: den skriver med merge (ikke create-only), priser af
start-Elo (tryk **💰 Ompris** bagefter), tjekker ingen knockout-vindere og
afregner ikke puljen (tryk **🎖️ Afregn puljen**).

Skal holdlisten med elo eller antal hold virkelig overskrives, så kør med
`--overskriv-hold` **lokalt**, med produktionsnøglen i
`GOOGLE_APPLICATION_CREDENTIALS` som i eksemplet ovenfor (der er med vilje intet
workflow-input til det — fejlbeskederne i Actions-loggen peger hertil).
Tør-kørslen viser så hver feltændring. `teams[].elo` er seed for den levende Elo,
så næste facit omskriver sæsonens Elo-historik og prisen på hver ulåst kamp.

Seedet afviser et spil uden dokument, også i tør-kørslen: sporten står på
spil-dokumentet, og uden den ville et håndboldspil blive prissat som fodbold.
Kør `seedGames` først.

`--teams` og `--fixtures` opløses mod **repoets rod**, ikke mod den mappe du står
i, så kommandoen virker uanset hvorfra den køres. Men **selve scriptet** skal
findes: står du et andet sted, så skriv den fulde sti til
`scripts/seed-football.mjs`, ellers svarer Node med `Cannot find module` — en
fejl, der ligner en mangel i repoet og ikke er det.

`/sti/sa.json` ovenfor er en **pladsholder**. Sæt din egen sti til
service-account-nøglen ind; scriptet siger fra med det samme, hvis filen ikke
findes.

Scriptet nægter at skrive, hvis et holdnavn i kampprogrammet ikke findes i
den holdliste, kampene prises af: ved første seed filens, ved et gen-seed
**spillets egen** (`games/{id}.teams`). Et hold, der kun er kommet til i
filen, er altså ukendt ved et gen-seed. Det er med vilje: `teamElo()` giver
**tavst sportens start-rating** (`START` i sportsprofilen — 1500 for fodbold)
for et ukendt navn, så hele klubben ville få odds som et midterhold uden en
eneste fejlbesked. Af samme grund nægter det at skrive, hvis et hold i den
liste har en `elo`, der ikke er et tal (fx en streng): seedet ville give
start-odds, mens den levende Elo læser feltet som et tal.

Har spillet en `eloCurrent`, der mangler nogle af holdene, bevares den, men
tør-kørslen siger hvilke. Seedet fylder den ikke op — næste facit skriver
`eloCurrent` for hvert hold i spillets holdliste, og det gør **💰 Ompris**
(Admin → 🗓️ Spil-tidsplan) også, når den har odds-ændringer at skrive.

**Spillet skal findes først** (`seedGames`). Peger `--game` på et spil, der ikke
er oprettet, siger `--kickoffs-only` pænt `✅ 0 kickoff-tider opdateret` uden at
fejle — så tjek, at tallene ikke er nul hele vejen ned.

**Et rettet holdnavn eller en rettet runde kan ikke seedes ind bagefter.**
Dokument-id'et udledes af runde+hold (Superligaen) eller kommer fra kilden (PL),
så en rettelse opretter en **ny** kamp ved siden af den gamle. Runden får så 11
kampe i stedet for 10, og afregningen venter for evigt på et resultat, der aldrig
kommer. `firestore.rules` har `allow delete: if false` på kampe, og ingen
admin-flade rører `matches`. Den slags kræver et skræddersyet script.

## Håndbold-VM 2027: programmet og historikken (Wikipedia)

To scripts henter fra Wikipedia (IHF afviser automatiske hentninger fra Googles
net). De skriver **kun filer i repoet** og intet i databasen. Der kræves ingen
nøgle.

**Programmet** (den indledende runde + fasekalenderen):

```bash
NODE_USE_ENV_PROXY=1 node scripts/haandbold-program.mjs            # hent og vis — skriver intet
node scripts/haandbold-program.mjs --fil side.wikitext             # læs en gemt kopi i stedet
node scripts/haandbold-program.mjs --skriv                         # skriv filerne
```

`--skriv` skriver `scripts/haandbold-vm2027-program.json` (48 kampe med
kickoff i UTC, dansk holdnavn, gruppe og id `r{dag}-{hjemmekode}-{udekode}`,
plus `faser` og `grupper`, der kopieres ordret til `game.faser` og
`game.grupper` i `scripts/games.mjs` — `games.test.mjs` er rød, til de to er
ens) og fixturen `scripts/testdata/wiki-vm2027.wikitext`. En ændret `grupper`
når først spillet med `seedGames` (tør-kørsel først).
Testen bygger programmet af fixturen og kræver, at det er **identisk** med
JSON-filen, så de to skal altid skrives sammen af scriptet. Ret aldrig i dem i
hånden. Efter en kørsel: læs `git diff` på JSON-filen. Hver ændret tid er en
ændret tip-deadline.

`NODE_USE_ENV_PROXY=1` er kun nødvendig bag en proxy (Node 22's `fetch` bruger
ellers ikke `HTTPS_PROXY`).

Det, scriptet **melder**, og hvad du gør:

- **«N kampe har et tidsVINDUE»**: siden skriver fx `18:00/30`, fordi TV ikke
  har lagt sig fast (gruppe D, 2/11 2026). Deadline sættes til det
  **tidligste** tidspunkt, så tippet aldrig lukker efter kampstart. Når tiden
  ligger fast, så kør scriptet igen og derefter `seed-football --kickoffs-only`.
- **En fejl, der stopper kørslen** (der skrives intet): en ny sektion på siden
  («Ukendt sektion …»), en kamp uden tidspunkt, en ukendt holdkode, et andet
  antal kampe end formatet (48/36/4/2/2), en dag med kampe fra to faser, en
  side uden «All times are local (UTC+1)», **en side, hvis tidszone ikke er
  værtens på hver kampdag** (Tyskland og Danmark er CET = UTC+1 i januar;
  `VM2027_FORMAT.tidszone` er `Europe/Berlin`, og står der UTC+2 på siden,
  ville hver deadline ligge en time for tidligt), eller **et felt, parseren ikke
  kender, i en medtaget kamp** (fx `timezone=` eller `status=postponed`: det
  kunne flytte en tip-deadline), eller **en gruppetabel, der modsiger
  formatet**: `winpoints` er ikke 2 (eller mangler — så er det modulets 3),
  `resultN=Q` står på et andet antal pladser end 3 i den indledende runde og 2
  i hovedrunden, en hovedrundegruppes `team_order` kommer fra andre grupper
  end A+B, C+D, E+F og G+H, eller en indledende tabels hold er ikke dem, der
  spiller gruppens kampe. Point, videre og hovedrundens «fra» er konstanter i
  `VM2027_FORMAT` (`scripts/lib/haandboldProgram.mjs`), som siden
  efterprøves mod — de læses aldrig ud af siden. Hver besked siger, hvilken
  kamp eller tabel og hvilken fil der skal rettes. Skraberen gætter aldrig.

  **Det er IKKE en fejl**, at redaktørerne sorterer `team_order` efter
  stillingen under turneringen, eller at hovedrundens pladsholdere (`A1`,
  `B1` …) bliver rigtige landekoder. Medlemskabet tages af kampene og
  rækkefølgen af programmet (holdenes første kamp), så en kørsel midt i
  turneringen giver samme `grupper`.
- **«advarsler om fravalgte kampe»**: en Presidents Cup- eller placeringskamp
  har en form eller et felt, parseren ikke kender. Den er ikke med i
  programmet og stopper intet, men formen på siden har ændret sig.

**Tidsvinduet når ikke databasen.** `kickoffSenest` og kampens `gruppe` står
kun i JSON-filen: `seed-football` skriver kun `round`, `home`, `away`,
`kickoff`, Elo og odds på kampene. Kampen får det tidligste tidspunkt som
deadline; at det er et vindue, ved kun filen og scriptets udskrift. **Grupperne
når derimod spillet** — ikke via kampene, men som `game.grupper` på
spil-dokumentet (hvem der er i gruppe A-H, og hvilke grupper hovedrundens I-IV
kommer fra), seedet af `seedGames` fra `scripts/games.mjs`. Hovedrundens hold
gemmes ikke: de følger af de kampe, der lægges ind med 📥 Læg næste fases
kampe ind.

Det, scriptet **ikke** gør: seede (det gør `seed-football.mjs` med filen som
`--fixtures` i delopgave D6, med tør-kørsel og ejerens ja), oprette
hovedrunde- eller knockoutkampe (de har pladsholdere som `A1` og `WQF1` indtil
holdene kendes, og de lægges ind med **📥 Læg næste fases kampe ind** under
Admin → 🗓️ Spil-tidsplan) eller synke facit (D8). Det kører heller
aldrig af sig selv.

**Flytter en kamp til en anden dag**, efter at den er seedet, får den et nyt id
(dagen står i id'et). Et fuldt seed ville så oprette en kamp mere ved siden af
den gamle, se «Et rettet holdnavn eller en rettet runde» ovenfor.
`--kickoffs-only` melder den som **IKKE SEEDET**. Den situation skal afgøres
bevidst og må ikke køres igennem.

**Historikken** (færdige kampe til målingen af håndboldprofilen, D4 — selve
målingen er `node scripts/maal-haandbold.mjs`, se docs/elo-metodik.md):

```bash
NODE_USE_ENV_PROXY=1 node scripts/haandbold-historik.mjs           # alle 8 turneringer, vis
node scripts/haandbold-historik.mjs --skriv --filer <mappe>       # skriv scripts/haandbold-historik.json (alle 8; mappen med em2026-finale.wikitext)
node scripts/haandbold-historik.mjs --turneringer vm2025,em2026    # kun nogle, vis (med --skriv kræves --ud <fil>)
```

Hver side hentes **én gang** og gemmes i en cache (`<tmp>/vejleaa-wiki`,
eller `--cache <mappe>`). Senere kørsler sender intet kald. Skal en side hentes
igen, så slet dens fil i cachen. Fejler én side, skrives der **intet**. En
måling på 7 af 8 turneringer må ikke ligne en på 8. Kampe, der ikke kan læses,
står med grund og `art` under `kilder[].afviste` og i udskriften: `walkover`
(tildelt ved bordet, ikke spillet), `andenSide` (kampen er transkluderet fra en
anden side, der ikke er givet med — se nødvejen herunder) eller `ulaeselig` (en ny form — læs siden).
**Regnskabet:** læste + afviste kampe (uden walkovers) skal give præcis sidens
eget tal (infoboksens `matches=`, gemt som `kilder[].infoboksKampe`). Går det
ikke op, stopper scriptet og skriver intet — så kan en kamp ikke forsvinde i
stilhed. `efter60` er stillingen efter ordinær tid, og det er den, der tippes
på, også i knockout. `dato`/`tid` er turneringens **lokale** tid;
forskydningen står pr. side i `kilder[].forskydningMin` (null med
`forskydningGrund`, hvis siden ikke siger det entydigt).

**Nødvejen ved 429: `--filer <mappe>`.** Historikken har **ikke** `--fil`
(det har kun programmet). Gem i stedet én fil pr. turnering i en mappe og læs
dem derfra. Der sendes da intet kald:

```bash
mkdir sider
# Enten API-svaret (bærer revisions-id'et) — åbn i en browser og gem som vm2019.json:
#   https://en.wikipedia.org/w/api.php?action=parse&page=2019_World_Men%27s_Handball_Championship&prop=wikitext%7Crevid&redirects=1&format=json&formatversion=2
# eller den rå wikitekst (uden revisions-id) som vm2019.wikitext:
#   https://en.wikipedia.org/w/index.php?title=2019_World_Men%27s_Handball_Championship&action=raw
node scripts/haandbold-historik.mjs --filer sider            # vis
node scripts/haandbold-historik.mjs --filer sider --skriv    # skriv
```

Filnavnene er nøglerne (`vm2019`, `em2020`, `vm2021`, `em2022`, `vm2023`,
`em2024`, `vm2025`, `em2026`). Mangler én, eller har én to filer, stopper
scriptet, før noget læses. Kilden får `vej: "fil"`, filnavnet og filens tid
som `hentet`, så ingen tror, at scriptet selv har hentet siden.

**Transkluderede sider** (EM 2026-finalen). Står en kamp kun som
`{{#section:Side|Afsnit}}` på turneringssiden, så læg den anden side i samme
mappe under filnøglen fra `TURNERINGER[].transklusioner` i
`scripts/lib/haandboldHistorik.mjs` — i dag kun `em2026-finale.wikitext` for
«2026 European Men's Handball Championship final»:

```
#   https://en.wikipedia.org/w/index.php?title=2026_European_Men%27s_Handball_Championship_final&action=raw
```

Præcis det navngivne afsnit (`<section begin="Final" />` … `<section end="Final" />`)
indsættes, hvor transklusionen stod, før kampene læses; kilden får
`transkluderet` med den sides fil og tid, og udskriften siger «↳ afsnittet
«Final» indsat fra …». Mangler filen, afvises kampen som `andenSide` — og så
**nægter `--skriv` at skrive** (tør-kørslen siger det med ⚠️). Det gælder
**enhver** `andenSide`, ikke kun den erklærede: også en side, der er ny eller
stavet om på Wikipedia (titlerne sammenlignes som MediaWiki gør — `_` er
mellemrum). Ellers ville hver opfriskning ad API-vejen, som aldrig henter en
anden side, tabe finalen med rc 0. Det betyder, at **API-vejen ikke kan skrive
alle otte** uden flaget. Skal kampen bevidst stå som afvist, så tilføj
`--tillad-anden-side`.

Scriptet stopper også, før noget skrives, når afsnittet mangler på siden eller
står to gange, når afsnittet selv indeholder en overskrift (så ville kampene
få en anden sektion end den, transklusionen står i), og når den konfigurerede
fil (`em2026-finale.*`) ligger i mappen, men turneringen ikke transkluderer
siden. **Mappen skal gå op:** ligger der en fil, som ingen turnering eller
erklæret side hedder — en stavefejl som `em2026-final.wikitext` eller en
`foo.wikitext` — stopper scriptet, før noget læses. Filer for turneringer, der
ikke er valgt med `--turneringer`, springes over og nævnes i udskriften;
skjulte filer (`.DS_Store`) tæller ikke. `--ud <fil>` skriver et andet sted
end `scripts/haandbold-historik.json` (bruges af testene) — og **kræves**, når
`--skriv` står sammen med `--turneringer`, så en delmængde aldrig overskriver
den committede historik.

> **Status 3/11 2026:** `scripts/haandbold-historik.json` rummer **alle otte**
> turneringer: 678 kampe, **inkl. EM 2026-finalen**. Siderne — de otte
> turneringssider og finalesiden — er hentet 3/11 som rå wikitekst
> (`index.php?action=raw`, ét kald pr. side) og læst med `--filer` — derfor
> `vej: "fil"`, `fil: "<nøgle>.wikitext"` og `revid: null` i hver kilde (og i
> EM 2026's `transkluderet`).
> `action=raw` bærer ingen revision, så null er sandt. Skal revisionen med, så
> gem API-svaret (`.json`) i stedet. Scriptets egen API-vej (Node `fetch`)
> fik HTTP 429 fra byggemiljøet 2/11 og er ikke prøvet igen. Kun de 26 kampe i
> fixturen `scripts/testdata/wiki-vm2025-udsnit.wikitext` kan genskabes fra
> repoet alene.
>
> **Hvad der IKKE er med, og hvorfor** (står også under `kilder[].afviste`):
> - **VM 2021: 6 walkovers.** Kap Verde trak sig midt i turneringen (COVID),
>   og de resterende seks kampe står som 0–10/10–0 uden tid og pausestilling.
>   De er ikke spillet, og infoboksen tæller dem heller ikke (102 kampe).
> - ~~EM 2026: finalen~~ — **er med siden 3/11.** Den står ikke på
>   turneringssiden, men transkluderes fra «2026 European Men's Handball
>   Championship final» (`{{#section:…|Final}}`). Finalesiden ligger i mappen
>   som `em2026-finale.wikitext`, og afsnittet indsættes (se
>   «Transkluderede sider» ovenfor): DEN–GER 34–27 efter 60 min, ingen
>   forlængelse. EM 2026 har 65 af 65. Den flyttede Danmarks start-Elo fra
>   2055 til 2086 og Tysklands fra 1925 til 1894 (inkl. +25 som vært), men
>   ingen af profilens tal (K 120, `DRAW_BASE` 0,157).
>
> **Lært af parseren 3/11:** det fælles koreanske hold på VM 2019
> (`{{hb|Korea|unification}}`) får koden **COR** (ikke KOR, som er Sydkorea);
> «Russian Handball Federation» på VM 2021 er **RUS** (samme landshold under
> WADA-sanktionen); Færøerne er **FRO** overalt (EM 2026-siden skriver FAR);
> fodnoter (`{{refn|…}}`, `<ref>`) fjernes fra dato, tid og hold (VM 2023's
> kvartfinale «20:54{{refn|…}}»). I **programmet** stopper en fodnote i en
> medtaget kamp kørslen, for dér er tiden en tip-deadline.
>
> **EM 2022's tidszone er null.** Siden skriver «All times are local
> ([[Central European Time|UTC]])»: teksten siger UTC, linket siger CET. Det
> er ikke entydigt, og der gættes ikke. Tiden bruges kun til rækkefølgen inden
> for en dag.

**Wikimedias regler.** Begge scripts bruger MediaWiki API'et med User-Agenten
`VejleaaTip-program/1.0 (+https://github.com/cvejleaa/tour)` (ikke ejerens
e-mail), mindst ét sekund mellem kald, og de følger ingen links. `robots.txt`'s
`Disallow: /w/` gælder crawlere. Det her er et manuelt startet kald med lav
volumen til det API, Wikimedia anviser. Svarer Wikipedia **429**, stopper
scriptet og prøver **ikke** igen af sig selv. Vent, eller gem siden fra
browseren og brug nødvejen: `--fil <side>` for programmet, `--filer <mappe>`
for historikken (se ovenfor). Fejlbeskeden nævner den rigtige. Indholdet er
CC BY-SA 4.0. Filerne bærer kilde, revision og licens.

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
**✍️ Sæt eller ret facit i hånden** samme sted svaret (admin-guiden, *Facit i
hånden*). Alarmen gælder **alle aktive kampspil**, også dem uden synk: de
vogtes af sweep'et via `functions-platform/facitVagt.js` og har deres eget kort,
**Facit-vagt (spil uden synk)**. Deres alarm nævner ikke synk-knappen (den
findes ikke for dem). En kamp uden læseligt kickoff meldes med det samme, med
"ret kickoff" som remedie.

En turnering med fasekalender (Håndbold-VM 2027), der er Åben eller I gang,
har også kortet **Fasekampe-vagt (næste fases kampe)** — med eller uden synk.
Det kører i samme Times-sweep (`facitVagt.faseKampeVagt`) og viser, hvor mange
af fasens kampe der er lagt ind, og hvornår næste alarm går. Mangler en dag
kampe efter kl. 12 dagen før (kampe pr. dag er fasens `antalKampe` delt med
dens dage — 6 i hovedrunden, 2 i kvartfinalerne; i den indledende runde, hvor
det ikke går op, mindst én og resten på sidste dag), og kan dagen stadig få
dem, melder alarmen **«Kampe mangler i næste fase»** (type `faseKampe`, hast
**haster**, én pr. dag) med remediet **📥 Læg næste fases kampe ind**. En
fases første dag alarmerer først, når fasen før har facit på alle sine kampe
(ved knockout: en vinder) — før det kendes holdene ikke, og kortet siger, at
det venter. Mangler et facit længe, melder facit-vagten det selv. Er
dagen gået i gang med for få kampe, er det en advarsel på kortet, ikke en
alarm. Kortet lukkes, når kalenderens sidste dag er forbi, eller når spillet
afsluttes.

Er kilden **uenig med et facit sat i hånden**, står det som en ⚠-advarsel på
spillets Times-sweep-kort med holdnavne og begge stillinger (i hånden / hos
kilden). Synken rører ikke kampen; remediet er enten at rette tastningen med
✍️ Sæt eller ret facit i hånden eller at give kampen tilbage med ↩️ Lad synken
overtage igen (Spil-tidsplan). Advarslen forsvinder af sig selv, når de er
enige igen.

#### Alarm-mailen (postbudet) — fladen er ikke længere pull-only

Fladen var i månedsvis det ENESTE sted, en alarm kunne ses: ingen fik besked,
før ejeren selv loggede ind. Derfor **alarm-postbudet** (`driftAlarmPostbud`,
hvert kvarter, `functions-platform/postbud.js`):

- **Kørsler**: postbudet læser driftlog-kortene og melder to slags alarmer:
  `koersel` for et kort, der er **forsinket** (serverens egen
  `naesteForventetFoer` er passeret — samme regel som det røde «HAR IKKE KØRT»
  i fladen; kræver kvittering, for en død scheduler må gerne nage), og
  `koerselFejl` for et kort på niveau **fejl** (uden kvitteringskrav — og
  springes over, når spillet allerede har en åben, specifik alarm som strandet
  eller detaljer*, så samme hændelse ikke står to gange). Begge lukkes af sig
  selv, når kortet er grønt igen. To ting ser postbudet IKKE: en kørsel, der
  **aldrig har skrevet** et kort (fladens grå «afventer første kørsel»), og et
  kort for et spil, der er taget ud af `SYNCED_GAMES` (forældreløst — det
  ville ellers give en alarm, der aldrig lukker; slet kortet i konsollen,
  når et spil tages ud).
- **Mail**: alle ÅBNE alarmer, der ikke er mailet, samles i ÉN mail til alle
  **godkendte owner/globalAdmin** — adressen tages fra Auth-kontoen (den, man
  logger ind med), ikke fra profilens kontaktfelt. Mailen grupperer efter hast
  (haster / kan vente / til udvikleren), samler mange ens alarmer i én linje,
  og linker til `tip.vejleaa.dk/admin?fane=drift` (log ind først). Den er
  fast HTML uden klikbare URL'er fra alarm-tekster.
- **Hvornår kommer der mail igen om samme alarm?** Kun når den kræver
  opmærksomhed IGEN: en ny forekomst efter at den var løst, eller efter at den
  var kvitteret (en kvitteret alarm, der dukker op igen, tænder badget og
  mailes). En åben, ukvitteret alarm, der bare ses igen, mailes ikke igen. En
  alarm, der løser sig selv inden postbudet når den, mailes aldrig — og der
  sendes ingen «løst»-mail; fladen er sandheden.
- **Når mailen ikke kan sendes** (SMTP-secret mangler, ingen modtager har en
  adresse, alle modtagere bouncer), står det som FEJL på postbudets eget kort
  OG som en `postbud`-alarm, så ⚠-markøren lyser. Postbudet opgiver aldrig
  tavst — men det kan heller ikke maile sin egen død: et postbud, der er holdt
  op med at køre, ses kun som et rødt kort i fladen. Den uafhængige vagt er
  **Cloud Monitoring** (se nedenfor).
- **Start med vilje**: **📨 Send alarm-mail nu** (kører postbudet straks; kun
  umailede alarmer sendes) og **🧪 Send en test-alarm** (opretter en
  test-alarm, højst én hvert 10. minut pr. administrator; mailen har «TEST» i
  emnet; kvitteringen lukker den). Det er beviset for hele kæden — brug det ved
  sæsoneftersynet. Mail-loggen (Admin → ✉️ Mail-log) viser hver sendt
  alarm-mail som typen **Driftalarm**.
- **Efter første udrulning**: alarmer, der allerede var åbne, har aldrig fået
  en mail — postbudet sender ÉN samlet mail med dem første gang, også dem,
  der er kvitteret (de står som «allerede kvitteret»). Det er bevidst (en
  baseline), ikke en fejl.
- **To kørsler, der overlapper** (skemaet og et klik på «Send alarm-mail nu» i
  samme sekund), kan give samme mail to gange. Accepteret: en dobbelt mail
  er den rigtige retning at fejle i.

**Cloud Monitoring — vagten uden for huset (ÅBENT PUNKT — sættes op i
konsollen, er ikke sat op endnu):** postbudet kan ikke maile sin egen død, og
de tre tilfælde, hvor det ikke kan maile (SMTP, modtagere, afsendelse), ser
kun fladen. Derfor to alerts i Google Cloud Console, projekt spil-89af9, med
en e-mail-notifikationskanal til ejeren (kanalens adresse hører til i
konsollen, ikke i repoet). Trinnene (Release Manager; ingen konsol-adgang
fra kode, så ejeren gør det selv):
1. **ERROR-alert**: Logging → Logs Explorer, forespørgsel
   `resource.type="cloud_run_revision" AND severity>=ERROR` → *Actions →
   Create log alert* → e-mail-kanalen. Fanger en function, der vælter, og
   postbudets egne fejl (niveau fejl logges med `console.error`).
2. **Fraværs-alert** (log-based alerts kan ikke udtrykke fravær — derfor en
   metric): Logging → *Log-based Metrics → Create metric*, type Counter, navn
   `postbud_puls`, filter
   `resource.type="cloud_run_revision" AND resource.labels.service_name="driftalarmpostbud" AND textPayload:"driftAlarmPostbud:"`
   (prøv forespørgslen i Logs Explorer først — den skal give ca. 4 linjer i
   timen; servicenavnet er ikke efterprøvet herfra, se hvad Logs Explorer
   viser). Filtret på servicen er ikke pynt: et klik på «Send alarm-mail nu»
   logger samme præfiks fra callablen og ville ellers dække over et dødt
   skema. Derefter Monitoring → *Alerting → Create policy*, metric
   `logging/user/postbud_puls`, betingelse *Metric absence* i 1 time, samme
   e-mail-kanal.
Indtil begge er sat op, er et dødt postbud pull-only (et rødt kort efter
35 min). Tjek ved sæsoneftersynet, at begge stadig findes.

#### xG-linjen på sweep-kortet

Sweep'et henter også **xG (forventede mål)** for kampe, der er færdige og
mangler tallet, og skriver én linje pr. spil på sweep-kortet:

| Linjen siger | Betyder | Skal du gøre noget? |
|---|---|---|
| `xG: alle færdige kampe har tal.` | intet efterslæb | nej |
| `xG: N hentet, M færdige kampe mangler endnu.` | bagfyldningen kører | nej — M skal falde for hver kørsel |
| `⚠ xG: M færdige kampe mangler tal, og ingen blev hentet.` | kampe mangler, og kilden gav intet | kun hvis den står i FLERE kørsler i træk — spillerne ser hullet |
| `xG-synken fejlede: …` | kaldet kastede | se Functions-loggen |

**Den er selvhelende, og det er meningen.** Der findes ikke et bagfyldnings-
script: en kamp fra i august mangler xG på præcis samme måde som en fra i
aftes, og sweep'et kan ikke se forskel. Den henter højst `XG_LOFT` (30) kampe
pr. kørsel — med 12 kørsler i døgnet er en hel sæsons efterslæb inde på under
et døgn. Derfor er et faldende tal på kortet **normal drift**, ikke en fejl.

Det, der ER et signal, er et tal der står **stille** over flere kørsler: så er
kilden holdt op med at levere xG for netop de kampe.

xG har stadig ingen egen alarm — tallet påvirker hverken point, Elo eller
runde-afregning, så en manglende xG kan ikke koste nogen en placering. Men
**siden xG kom på skærmen, er det ikke længere usynligt for spillerne**. Disse
flader viser det: kampkortets linje under scoren, "Rundens vildeste" øverst på
tip-fladen, holdsidens kort, og hold-listen under Elo-tabellen. Alle fire
udelader tallet i stilhed, når det mangler — hold-listen forsvinder helt, hvis
færre end fire hold har tre kampe med målchancer. Står tælleren stille, er
konsekvensen derfor et hul i fladen, ikke bare i databasen — spillerne ser
kampe uden målchancer, mens naboerne har dem. Det gør et fastfrosset tal værd
at kigge på, selv om det ikke er en driftfejl.

xG hentes **kun** i sweep'et, aldrig i minut-synken. Det er ikke en
tilfældighed: tallet koster ét kald pr. kamp, og minut-synkens `hentFaerdige`
kaster ved timeout med fejlen slugt — xG dér kunne altså tavst standse
**facit**-synken midt på en kampaften. Af samme grund står xG-trinnet SIDST i
sweep'ets løkke, efter tabel og strandet-alarm: en langsom kilde må kunne
bruge sit budget op uden at tage sikkerhedsnettet med sig.

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

Workflow-inputtet er `seedKickoffs` med spillets id i `seedSpil` (og
`seedKickoffsSkriv`, som er tør-kørsel, indtil den tikkes af). Det gælder ethvert
spil med en post i `scripts/seed-filer.mjs`. Lokalt er det samme kørsel.
Tør-kørsel først; den skriver intet og viser hver enkelt ændring, i dansk tid:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json node scripts/seed-football.mjs \
  --game pl2627-efteraar \
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

**Gælder ikke et spil med landeflag** (håndbold-VM 2027). Dér tegnes ingen
trøje: badgen er landets flag, og farverne giver kun ringen om spillernes avatar
og spillets tema. Står der trøjer i stedet for flag — eller en grå ring — så se
«Landeflag i håndbold-VM'et» nedenfor.

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
`seedTeams` + spillets id i `seedSpil`. Der tørkøres, indtil du sætter fluebenet i
`seedTeamsSkriv` — sæt det først, når du har læst loggen igennem.

Bemærk, at kørslen som alle de andre seed-input først bygger og deployer hele
platformen (frontend, regler, indexes) og derefter retter holdlisten. Det er
samme vilkår som `seedKickoffs`, men det er værd at vide, når tør-kørslen
bruges som ren diagnose. Lokalt koster det ingenting:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json node scripts/seed-football.mjs \
  --game superliga2627 \
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
Skal noget af det ændres, hører det til et fuldt seed med `--overskriv-hold`
mellem to sæsoner (se «Seed et nyt fodbold-spil»).

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

## Landeflag i håndbold-VM'et (og hvis de mangler)

Hvert hold i `src/data/haandboldVm2027Hold.js` har en landekode (`iso2`, fx
`'dk'`) og to landefarver (`color`, `awayColor`). Koden vælger flaget; farverne
giver ringen om avataren (`color` yderst, `awayColor` som en stribe inderst) og
spillets tema. Flagene er de 32 svg-filer fra
`flag-icons` (MIT, licensen i `public/licenser.txt`), bundtet med appen — der
hentes intet fra andre værter.

**Alt eller intet.** Flaget vises kun, når ALLE spillets hold har en kode med et
bundtet flag (`harLandeflag`). Mangler ét, tegnes alle 32 som trøjer — så en
kolonne aldrig blander flag og trøjer. Symptomet «trøjer i stedet for flag» betyder
altså: mindst ét hold i produktionens `teams` mangler `iso2`.

**Sådan kommer koderne og farverne i produktion** — ad «Ret holdlisten» ovenfor,
med ejerens ja (det er en skrivning i produktionsdata):

1. GitHub → Actions → **"Deploy platform (tip.vejleaa.dk)"** → `seedTeams` +
   `hvm2027` i `seedSpil`, **uden** `seedTeamsSkriv`.
2. Læs tør-kørslen. Den forventede udskrift (regnet offline på holdfilen fra
   main, se `scripts/lib/teamsOnly.test.mjs`):
   ```
     96 feltændringer:
       Tyskland  awayColor: — → "#FFCC00"
       Tyskland  color: — → "#FF0000"
       Tyskland  iso2: — → "de"
       …
     uændrede hold : 0
     landeflag     : 32 af 32 hold — flaget vises (i dag 0 af 32)
   ```
   **Kriteriet:** 96 feltændringer, alle felterne `iso2`, `color` eller
   `awayColor`, alle fra `—`; ingen hold, der kommer til eller forsvinder; ingen
   omrokering; `uændrede hold : 0`; `landeflag : 32 af 32`. Står der andet — fx en
   `elo`- eller `short`-linje — er holdfilen eller produktionen drevet siden D6.
   Så **stopper** du; det løses ikke med `--overskriv-hold`.
3. Kør igen med `seedTeamsSkriv`.
4. Kør tør-kørslen en gang til: «Holdlisten er allerede den, filen beskriver.
   Intet at gøre.» er beviset for, at skrivningen landede.

Kørslen bygger og deployer hele platformen fra main (frontend, regler, indexes),
før den retter holdlisten — se, hvad der ellers ligger på main, før du starter.

**En gammel klient ignorerer `iso2`**, så rækkefølgen kode-før-data er ikke
kritisk; men flaget kan først ses, når både frontend og data er ude.

Linjen `landeflag : N af M hold` står i hver `seedTeams`-tør-kørsel, også for
Superligaen og PL («0 af 12 hold — ingen flag — trøjer»). Den er der, fordi
holdfilen engang lovede farver «i D6», og de 32 grå trøjer så ingen: nu siger
tør-kørslen højt, om flaget bliver vist, før der skrives.

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

## Kampdetaljer: halvleg, målscorere og tilskuertal (livescore)

Kommer fra en **tredje kilde** — livescore.com — og ikke fra den kilde, facit
kommer fra. Hentes **straks efter facit** af minut-synken, men KUN for de kampe,
der netop blev afgjort i samme kørsel, allersidst i jobbet (efter driftlog og
puls-vagt) og med eget budget på 15 s pr. spil — så kilden aldrig kan koste
facit eller næste spil. Times-sweep'et er bagfyldningen: højst 8 kampe pr.
kørsel, og dets kort viser efterslæbet. Se `functions-platform/kampDetaljer.js`
(`efterFacitDetaljer`).

**Den skriver aldrig facit.** Ikke `result`, `homeGoals`, `awayGoals` eller
`kickoff`. Det er ikke en høflighed: `matchOutcome()` udleder facit af målene,
og tip-vinduet ER `kickoff`. Vagten er én frossen felt-liste i modulet, bundet
af en mutationstest.

**Manuel udløser:** Admin → Spil-planlægning → **⚽ Synk kampdetaljer nu**
(står lige under ⬇️ Synk resultater nu). Ingen tør-kørsel og ingen confirm —
kaldet kan hverken afregne point, flytte Elo eller få Runde-Botten til at
poste. Knappen tager 40 kampe ad gangen, så en bagfyldning kan drives i hånden.

**Drift-kortet** hedder *Times-sweep · <spil>* og bærer linjen
`Kampdetaljer: …` med tallet `detaljerMangler`, som skal gå mod nul.

**Efterprøv en konkret kamp uden konsollen:** GitHub → Actions → *Kig på en
kamp* (læse-only, `scripts/probe-kamp.mjs`) printer facit, live, detaljer og
Eid for kampen med tidsstempler — og afstanden fra facit til detaljer — plus
spillets driftlog-kort og alarmer.

### Når noget er galt

| Det, kortet siger | Hvad det betyder | Hvad du gør |
|---|---|---|
| `N uenige om facit` | Kildens slutstilling er en anden end vores. Ofte legitimt: en afbrudt eller tildelt kamp. | Kig på kampen. Er vores facit rigtigt, skal der intet gøres — kampen prøves igen om en uge og bliver ved med at være uenig. |
| `N kunne ikke parses` | Målene dannede ikke den ubrudte kæde. Kilden har sandsynligvis skiftet form. | Kør `node scripts/maal-livescore-detaljer.mjs`. Er afvisningsraten pludselig høj, eller er der nye IT-koder, skal `maalAf` rettes. |
| `N kunne ikke kobles til kilden` | Kampen findes hos os, men ingen af kildens kampe har samme DATO og samme holdpar. Typisk et hold, livescore har omdøbt, eller en kamp flyttet til en anden dag hos den ene kilde. **Retter sig ALDRIG selv** — der sættes ingen karantæne, så den prøves forgæves ved hver kørsel. | Kør `node scripts/maal-livescore.mjs`. Er et holds kode ændret, skal `AFVIGER` i `functions-platform/livescoreHold.js` rettes. Er det datoen, der er skredet, så synk kamptiderne først. |
| `N hvor kilden ikke svarede` | Almindelig nedetid (5xx) hos livescore. **Ikke** en fejl i vores kode. | Ingenting. Kampene prøves igen ved næste kørsel om en time, og de sættes ikke i karantæne. Bliver tallet ved i et døgn, er kilden nede for alvor. **Undtagelsen:** står den SAMME kamp dér dag efter dag, mens naboerne hentes fint, er det et forældet `livescoreEid` (se nedenfor) — slet feltet på kampen i konsollen, så kortlægges den igen ved næste sweep. |
| `N uden kobling` | Kampen fandt ikke sin modpart hos kilden. | Kør `node scripts/maal-livescore.mjs`. Holdkoder eller kickoff-tider er drevet → ret `functions-platform/livescoreHold.js`. |
| **Alarm** `detaljerLukket` | Kilden svarede 429/403 og kørslen stoppede sig selv. | Gør INTET i en time. Vagten findes, fordi Cloud Functions egresser gennem delt NAT: banker vi videre, rammer det `api.superliga.dk` og pulselive, som intet har med livescore at gøre. Sker det igen næste kørsel, er vi rate-limited — så skal loftet ned. |
| **Alarm** `detaljerKobling` | Nul af kampene kunne kobles. Kortlægningen er død. | `scripts/maal-livescore.mjs` → ret `livescoreHold.js`. |
| **Alarm** `detaljerAfvist` | Alt blev afvist. | Kilden har skiftet form. Se `kampDetaljer.js`. |
| **Alarm** `koersel` | Et driftlog-kort er forsinket: skemaet har ikke kørt til tiden. Rejses af alarm-postbudet, kræver kvittering, og lukkes selv, når kortet er grønt. | Er det stadig rødt ved næste kvarter, er skemaet holdt op: tjek Cloud Scheduler/functions-loggen, og send mailen til udvikleren. |
| **Alarm** `koerselFejl` | Et driftlog-kort står på niveau fejl (og spillet har ingen åben, specifik alarm). Rejses og lukkes af postbudet; ingen kvittering. | Se kortets egen fejltekst på 🩺 Driftstatus — den peger på remediet. |
| **Alarm** `postbud` | Alarm-mailen kunne ikke sendes: `smtp` (secret mangler), `modtagere` (ingen godkendt admin med Auth-adresse) eller `afsendelse` (alle bouncer). | Sæt `SMTP_PASSWORD` / giv en admin en adresse / se ✉️ Mail-log. Alarmen lukkes selv, når en mail igen kommer ud. |
| **Alarm** `test` | En administrator trykkede 🧪 Send en test-alarm. | Ingenting — kvittér den, når mailen er set; så forsvinder den. |

**"Kunne ikke parses" og "kilden svarede ikke" er med vilje to tal.** Det
første betyder, at VORES parsning er mangelfuld, og sender dig i koden; det
andet er et helt almindeligt udfald, der retter sig selv. De var ét tal i
første udgave, og så ville en times nedetid have fyret alarmen *"kilden har
sandsynligvis skiftet form — se kampDetaljer.js"* og sendt dig på kodejagt.

**Afviste kampe ligger en uge i karantæne** (`detaljerAfvistAt`). Uden den
ville en permanent uenig kamp blive hentet igen 24 gange i døgnet for evigt og
æde loftet — den er gammel og ligger derfor forrest i køen.

**`livescoreEid` er kildens kamp-id, cachet på kampdokumentet.** Sweep'et
kortlægger alle kampe uden id (også uspillede) i ét stage-kald, og derefter
koster hvert kampopslag to kald og intet stage-kald — også for efter-facit-
vejen i minut-jobbet. Prisen er, at id'et ikke efterprøves igen: peger det
forkert (livescore genudsteder id'er sjældent, men det kan ske), ender kampen
PERMANENT under *kilden svarede ikke* (404) eller *uenige om facit* (id'et
peger på en anden kamp), og det retter sig ikke selv. Ret: slet feltet på
kampen i konsollen; næste sweep kortlægger den igen. En automatisk selvheling
(id'et slettes ved 404/uenig) er opgave #82 og bygges sammen med live-målene.

### Live-målscorere, mens kampen spilles (`syncLiveMaal`)

Eget job, hvert minut 12–23 dansk tid — samme kadence som minut-synken, men
**isoleret** fra den (xG-kontrakten: en fremmed kilde må aldrig koste facit).
Pr. spil: kampene i 2½-timers-vinduet uden facit → dem, der ER i gang (samme
prædikat som live-puls-alarmen, `erIGang`) → højst 10 → ét `incidents`-kald
hver → målkæden pr. side skal stemme med kampens EGEN `live`-stilling, ellers
skrives intet (enigheds-reglen: en liste, der modsiger tallet, er værre end
ingen). Skrives KUN ved ændring i `liveMaal` (`maal`, `annullerede`, `at`).
Facit sletter feltet. Jobbet henter ALDRIG stage-listen: kortlægningen er
sweep'ets (én kamp, der ikke kunne kobles, ville ellers koste 150 stage-kald
pr. kampvindue — Security målte det). Efter et 429/403 holder jobbet pause i
en time (`livescoreLukketTil` på spil-dokumentet). Se
`functions-platform/liveMaal.js`.

**Drift-kortet** hedder *Live-mål (kampe i gang) · <spil>* og skrives kun på
kampdage (som minut-kortet), med linjen `Live-mål: N kampe i gang, M lister
skrevet, …`. Gult, når kilden lukkede os ude, eller når vi prøvede og intet
kom igennem. Alarmen er den samme `detaljerLukket` som ovenfor.

| Det, kortet siger | Hvad det betyder | Hvad du gør |
|---|---|---|
| `N uenige om stillingen` | Livescore og vores egen kilde er ét mål fra hinanden i dette minut. | Ingenting — næste minut heler det. Står det der HELE kampen, er kampen koblet til en forkert kamp hos kilden: slet `livescoreEid` på kampen. |
| `N hvor kilden ikke svarede` | 404/5xx på kampens id. Jobbet rører ikke id'et; sweep'et sletter et forældet id og kortlægger igen (én gang i timen, opgave #82). | Ingenting. Bliver det ved hele kampen, får kampen først sin liste efter næste sweep. |
| `N uden id hos kilden` | Kampen er ikke kortlagt endnu (sweep'et gør det hver time — normalt dage før kickoff), eller den kan ikke kobles (holdkode/dato). | Vent på sweep'et. Står den der næste kampdag også: `node scripts/maal-livescore.mjs` → ret `livescoreHold.js`. |
| `N over loftet` | Flere end 10 kampe i gang samtidig. | Intet i dag; loftet er ejerens valg (LIVE_LOFT). |
| `pause efter 429/403 fra kilden — prøver igen kl. …` | Kilden lukkede os ude; jobbet holder en times pause. | Gør INTET. Sker det igen efter pausen, er vi rate-limited — så skal loftet ned. |

**Manuel udløser:** ⚽ Synk kampdetaljer nu tager også kampe i gang med og
siger "Live: N i gang, M lister skrevet". **Efterprøv en kamp:** workflow *Kig
på en kamp* printer `liveMaal` og `live` side om side.

**Nødudgang, hvis vi bliver blokeret permanent:** der findes allerede en
proxy uden for Cloud Functions (`proxy/`, Cloud Run) med signaturhåndtering og
cache. Den henter i dag fra en ANDEN leverandør (flashscore/livescore.in) og
dækker kun Superligaen, så den er ikke en drop-in — men den er stedet at
flytte kaldet hen, hvis den delte NAT bliver et problem. Se `proxy/DEPLOY.md`.

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
- `seedGames` (default false) — seeder spil-dokumenterne fra `scripts/games.mjs`.
  **Tørkører**, indtil `seedGamesSkriv` (default false) også er sat: loggen
  viser pr. spil, hvad der oprettes eller ændres, og der skrives intet.
  På spil, der **allerede findes**, springer seedet `status` og `joinable` over.
  De to felter ejes af Admin → 🗓️ Spil-tidsplan, og listen i scriptet er ældre
  end virkeligheden. Uden den undtagelse ville en seed-kørsel stille rulle et
  spil fra "Afsluttet" tilbage til "I gang" — den skriver med merge, så det
  hverken fejler eller efterlader spor.
- `seedSuperliga` (default false) — skriver hele Superligaens kampprogram,
  **straks og uden tør-kørsel**. Kører `scripts/seed-football.mjs --game
  superliga2627 --skriv` (filerne fra `scripts/seed-filer.mjs`). Kampe, der
  **allerede har odds**, springes over: fra seedet og frem er det
  `recomputeSeasonElo`, der ejer oddsene — de friskes op efter hvert resultat
  frem til kickoff og låses dér. Et gen-seed ville skrive dem tilbage til Elo fra
  den dag, programmet blev lagt ind.
  Spil-dokumentets `teams` og `eloCurrent` skrives **kun, hvis spillet ikke har
  dem**. Før blev de skrevet ved hver kørsel, også når nul kampe blev skrevet:
  `eloCurrent` blev sat tilbage til sæsonstart, og `teams` (med `teams[].elo`,
  seed for den levende Elo) blev erstattet af filens liste uden forhåndsvisning.
  Nu er en kørsel midt i sæsonen en skrivning af kampe og intet andet. De nye
  kampe prises af start-Elo i `teams[].elo`, ikke af den levende Elo (se «Seed
  et nyt fodbold-spil»).
  Holdfarver **og visningsnavne** redigeret i admin ligger begge i `teamStyles`
  og røres ikke.
- `seedKampe` (default false, med `seedSpil` og `seedKampeSkriv`) — samme fulde
  seed for **ethvert** spil med en post i `scripts/seed-filer.mjs`. Tørkører, indtil
  `seedKampeSkriv` er sat. Det er vejen for et nyt spils første seed (fx
  håndbold-VM'et), og den eneste med forhåndsvisning af startodds.
- `seedSpil` (streng, default `superliga2627`) — spil-id'et for `seedKampe`,
  `seedKickoffs` og `seedTeams`. Det er en STRENG og ikke en fast liste: listen
  var et spejl af `scripts/games.mjs` uden paritetstest, og et nyt spil kunne ikke
  vælges uden at redigere workflowet. Et id uden post i `scripts/seed-filer.mjs`
  afvises med listen over kendte, før der læses eller skrives noget. (Det afløser
  `seedTeamsSpil`, hvis filvalg i workflowet gav ALLE andre spil end PL
  Superligaens holdliste.) **Ét felt for alle tre trin i samme kørsel**: sættes
  `seedKampe` for håndbold-VM'et og `seedKickoffs` i samme kørsel, retter
  kickoff-trinnet også håndbold-VM'et. Skal de ramme hver sit spil, så kør dem i
  hver sin kørsel.
- `seedTeams` (default false, med `seedSpil` og `seedTeamsSkriv`) — retter
  **kun** holdlisten: trøjefarver, landekoder (landeflag) og landefarver, stadion. Rører hverken kampe,
  odds, Elo eller resultater. Findes, fordi et gen-seed ikke skriver holdlisten,
  når spillet har en. `seedTeams` tørkører som default og **nægter at skrive**,
  hvis `elo`, `short` eller antallet af hold ville ændre sig. Se "Hvis en
  trøjefarve er forkert på kampkortet".
- `seedKickoffs` (default false, med `seedSpil` og `seedKickoffsSkriv`) — retter
  **kun** kickoff-tider for spillet i `seedSpil` (før låst til Superligaen). Skriver
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
| Pulje-tippene i en turnering (runde-pulje, «hvem når semifinalerne?») er ikke afregnet, selv om fasen er lagt ind | Triggeren afregner kun, når en kamps facit ændrer sig. Tryk 🎖️ **Afregn puljen** under Spil-tidsplan (tør-kørsel først, callablen `afregnPuljeNu`). Siger den «kan IKKE afgøres», står årsagen der og i drift-alarmen **«Puljen kan ikke afgøres»** (type `puljeFacit`) — mangler fasens kampe, så læg dem ind med 📥 **Læg næste fases kampe ind** (det afregner puljen med det samme, når semifinalerne bliver hele); er de lagt forkert ind, så ret dem (eller pulje/faser i `scripts/games.mjs`) og tryk igen. Alarmen tjekkes i hver Times-sweep (`facitVagt.puljeVagt`, for hvert åbent eller igangværende spil med runde-pulje, synket eller ej) og ved hvert nyt facit (`settlePuljeBets`). En konfigurationsfejl, for mange kampe eller et hold i to kampe meldes straks; for få kampe eller et manglende hold — også en fase, der aldrig blev lagt ind — fra dagen efter fasens startdag (dansk dato, dvs. sweep'et kl. 02:25). Den lukker selv, når puljen kan afgøres (også uden tip), men ikke blot fordi en forkert kamp er slettet. En konfigurationsfejl afregner intet, heller ikke med fasen rigtigt lagt ind. Fejler selve tjekket, står «Pulje-tjekket fejlede» på spillets *facitvagt*-kort (spil uden synk) eller i Cloud-loggen (synket spil); en alarm, der ikke kan skrives, stopper aldrig afregningen |
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
| En LIGAS `startRound` (sat/ændret af ejeren) | Ingenting | Ligaens total regnes i fladen af `players.perRound` — der er intet server-tal at genberegne. MEN: spillere, der aldrig er genberegnet efter udrulningen af `perRound`, mangler vektoren og vises som "ikke klar" — kør 🔄 **Genberegn point** for spillet én gang efter udrulning. Regnskabet («Hvor kommer pointene fra?») viser «–» for de samme spillere |
| **Nyt felt `players.opdelingPerRunde`** (20/10 2026: ligaens regnskab pr. runde) | 🔄 **Genberegn point** — pr. spil, ÉN gang efter udrulning af functions (tørkørsel af `rescore-bets.yml` før og efter: «INGEN OPDELING PR. RUNDE» skal gå til 0) | Feltet skrives af alle genberegninger, men ved en afgjort kamp kun for de berørte spillere (alle med tip i kampens runde, `kampeTriggerenLaeser`) — indtil Genberegn er kørt, er feltet derfor blandet, og ligaens regnskab viser «–» i rubrikkerne for dem, der mangler det (I alt er stadig ligaens tal). Det gælder OGSÅ ligaer med startrunde 1, der før viste spillets tal: kør Genberegn, FØR hosting udrulles |
| **Betydningen af `players.perRound`** — fx at et afgjort forbier skriver nøglen med 0 (12/10 2026) | 🔄 **Genberegn point** — pr. spil (knappen er pr. fodboldspil: PL og Superligaen hver for sig) | Vektoren genskrives ellers kun, når noget andet alligevel skriver den: for de spillere, der har et bet i runden for den næste afgjorte kamp (`kampeTriggerenLaeser` — før task #14 kun et bet på selve kampen), for alle pulje-tippere ved en facit-ændring efter grundspillet, og for alle ved `rescoreGameBets` uden tør-kørsel. Indtil da er feltet blandet: nyt tal hos dem, en kamp har genberegnet, gammel vektor hos resten — og fladen viser «–», hvor der burde stå 0 |
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

### Kontrol af de gemte totaler — sidste trin i workflowet

Kørslens eget svar siger kun, hvad den *mente* den gjorde. Derfor kører
`scripts/verificer-totaler.mjs` som sidste trin og læser, hvad serveren
**faktisk har gemt** på hver spiller (`players/{uid}.totalPoints` og
`.opdeling`). Den er læs-only og prøver fem ting, der ellers går galt uden en
fejlbesked:

1. **Rubrikkerne skal summe til totalen** — inden for afrundingen (0,25: fire
   rubrikker afrundet hver for sig plus totalen afrundet én gang, se
   `scripts/lib/verificerTotaler.mjs`). Er de uenige, lyver "Hvor kommer
   pointene fra?" om stillingen. En spiller helt uden `opdeling` meldes for sig:
   dér er svaret 🔄 **Genberegn point**, ikke en bagfyldning.
2. **⚡ Chancen må kun være negativ for den, der faktisk har sat point på spil**
   (`bets.chanceStake > 0`). Er den negativ uden indsats, står bet-pointene med
   en gammel regel — præcis symptomet fra fælden ovenfor.
3. Totalen gulves ved 0, så `sum < total` er legitimt netop dér — undtaget.
4. **Rubrikkerne pr. runde (`opdelingPerRunde`) skal findes for hver runde i
   `perRound`.** Mangler feltet eller en runde, meldes «INGEN OPDELING PR.
   RUNDE» eller «RUNDE k MANGLER» som fejl — svaret er 🔄 **Genberegn point**.
   Summer en rundes rubrikker ikke til rundens tal, står der «ulæselig rest i
   runde k» og en ℹ️-linje: det er point fra en kamp, opdelingen ikke kan læse
   (fx et tip på en slettet kamp). Det er INFORMATION, ikke en fejl, og
   Genberegn ændrer det ikke — afrunding giver aldrig en rest, så tallet er
   ægte.

   **Rulles functions tilbage efter en Genberegn**, skriver den gamle kode
   totalerne, men ikke `opdelingPerRunde`. Et resultat, der ændrer sig i en
   runde, som allerede har sin nøgle, giver så en STJERNE i ligaens regnskab
   med begrundelsen «en kamp ikke kunne læses» — det er forkert; den rigtige
   er, at feltet er forældet. Kør 🔄 Genberegn point, når de nye functions er
   ude igen.
5. **Den gemte total skal være den, en genberegning forfra giver** (task #14).
   De fire første tjek ser kun, om spilleren er enig med sig selv — og en
   spiller, der aldrig blev genberegnet, ER enig med sig selv (total 6 =
   rubrikker 6, combi'en mangler bare). Derfor regnes hver spiller også forfra
   af sine tips og spillets kampe, med serverens eget regnestykke
   (`opdelPoint`) og spillets startrunde-gate, og `perRound` sammenlignes
   **runde for runde** — ikke kun totalen, for en combi for lidt i én runde og
   en for meget i en anden går ud med hinanden. Afviger noget, står der
   «FORÆLDET: total gemt X, genberegnet Y; runde k: a → b (combi +c; intet tip
   på n af kuponens m)» med ALLE afvigende runder, og under tabellen en blok
   **FORÆLDET PR. RUNDE**: hvem, gemt → genberegnet, og hvor meget combi de
   har til gode (negativ = for meget). «intet tip på n af kuponens m» skiller
   combi-hullet (spilleren missede en kuponkamp) fra andre årsager (fx en kamp,
   der er flyttet ind på eller ud af kuponen). Er det gemte combi-tal ukendt
   (spilleren mangler `opdelingPerRunde`), står der «combi ?». Svaret er 🔄
   **Genberegn point** — se «Combi til gode» nedenfor, for det kræver ejerens ja.

   Bemærk: genberegningen bruger de GEMTE `bets.points`. Står bet-pointene
   med en gammel regel, er det punkt 2 (og `rescoreGameBets`), ikke punkt 5.

**Ved tør-kørsel er trinnet informativt** (`continue-on-error`): det viser
tilstanden FØR skrivningen, og den uenighed, det finder, er den, skrivningen
skal rette. **Efter en skrivning er det blokerende:** en rød kørsel betyder, at
totalerne stadig er forkerte — stop, og læs tabellen i loggen (én række pr.
spiller med 1X2, chance, combi, pulje, sum, total og bemærkning). Ved gendan
springes trinnet over. Lokalt:

```bash
SPIL_SA=<sa.json> GAME_ID=superliga2627 node scripts/verificer-totaler.mjs
```

### Combi til gode — måling og bagfyldning efter combi-hullet (task #14)

**Hullet.** Indtil rettelsen (11/2026) genberegnede triggeren
`recomputeGameMatch` kun spillerne med et tip på den afgjorte kamp. Combi har
intet kuponkrav, så den, der glemte rundens sidste kamp, men havde mindst to
træf på resten, fik sin combi først, når noget andet genberegnede ham (et facit
på et af hans egne tips, puljeafregningen, 🔄 eller en genscoring). Frafaldne
spillere står forkert for altid, og rundens rang-snapshot og Runde-Bottens
opslag fra den runde kan ikke rettes bagefter. Nu genberegner triggeren alle
med tip i kampens runde.

**Målingen (D0) er læs-only og kan køres når som helst.** Actions →
«Genscor bets efter regelændring» → feltet `skriv` TOMT (tør-kørsel; intet
skrives — heller ikke af genscoringstrinnet) → `gameId` = `superliga2627`, og
derefter én kørsel til med `pl2627-efteraar`. Læs trinnet «Verificér totaler
(læs-only)» — det er gult/informativt ved tør-kørsel — og blokken **FORÆLDET
PR. RUNDE**. Det er listen, ejeren afgør bagfyldningen på: pr. spil og pr.
runde, hvilke spillere der står forkert, og hvor meget combi de har til gode.
Kør den gerne FØR rettelsen er udrullet: det er beviset for hullet.
Loggen er offentlig, så «intet tip på n af kuponens m» tæller kun kampe med
facit og passeret kickoff — et tip på en kamp, der ikke er startet, nævnes
aldrig (samme regel som fladen, `maaVises`).

**Bagfyldningen (D2) skriver i produktionsdata og kræver ejerens ja.** Først
når rettelsen (functions) er ude — ellers kommer nye huller til:

1. Kør målingen for SL og PL og vis ejeren listen (antal spillere, største
   beløb, hvem der rykker). Send INGEN mail om det. Pr. runde med combi til
   gode står én færdig linje PR. LIGA: «til væggen i «Liganavn» efter 🔄:
   «Rettelse: …»». Hver linje er målt på ligaens egne medlemmer
   (`players.leagueIds`) — antallet og «Største» er dem, ligaen selv kan se,
   for en spillers point kan kun læses af liga-fæller (`firestore.rules`,
   `games/{g}/players`). Vil ejeren forklare stillingsskiftet, skriver han
   hver ligas EGEN linje som sig selv på netop dén ligas væg, efter trin 2 —
   aldrig samme linje på flere vægge. En spiller uden liga får ingen linje.
2. Ejerens ja → Admin → 🗓️ Spil-tidsplan → vælg spillet → **🔄 Genberegn point
   efter start-ændring** — SL og PL hver for sig. Knappen lægger kun totalerne
   sammen forfra; den rører ikke bet-pointene.
3. Kør målingen igen: FORÆLDET PR. RUNDE skal sige «ingen».

`hvm2027` har ingen tips før 13/1 2027 og skal ikke bagfyldes.
`recomputeGameScores` har ingen `timeoutSeconds` (60 s) mod klientens 120 s —
får knappen en timeout på et stort spil, så kør målingen og se, om den nåede
igennem, før du trykker igen.

**Udrulningen af rettelsen er ÉN kørsel af «Deploy platform» med
functions-fluebenet SAT.** Workflowet lægger altid hosting ud først og functions
bagefter i samme job. En kørsel med KUN hosting er den farlige: fladen holder
op med at advare om «combi senere» og siger, at combi regnes for hele runden,
mens serveren stadig kun genberegner kampens tippere.

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
