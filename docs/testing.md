# Testplan & testrapport

Al kode og UI testes på flere niveauer. Tests køres automatisk i CI på hvert
push/PR (se `.github/workflows/ci.yml`).

## Testpyramide

ANTALLET STÅR IKKE HER. Det stod her — 855, 42, 37 — og var forkert i alle
tre kolonner, fordi suiten voksede og tabellen ikke gjorde. Et hardkodet tal
om noget levende er en løgn med forsinkelse (CLAUDE.md), og at skrive nye tal
ind ville blot nulstille uret på den samme løgn. Tallene findes ét sted, hvor
de er afledt af den faktiske kørsel: **Admin → Tests**, som selv advarer, når
øjebliksbilledet er for gammelt.

| Niveau | Værktøj | Hvad dækkes | Kræver |
|---|---|---|---|
| Unit + komponent/UI | Vitest + Testing Library | Al UI (sider, komponenter, hooks), delt logik — alle scenarier inkl. fejl/kanttilfælde (Firebase mocket) | — |
| Unit (functions, Tour) | Vitest | Autoritativ scoring (inkl. fuzzy bonus) + grupperangering/tiebreak | — |
| Unit (functions, platform) | Vitest | Platform-serveren: spil-scoring, ligaer, synk, kampdetaljer, mails | — |
| Security Rules | Vitest + `@firebase/rules-unit-testing` | Firestore-regler (roller, deadlines, ligaer) | Firestore-emulator |
| E2E | Playwright | UI-flows i rigtig browser | Browser (CI) |

UI-testene dækker siderne og komponenterne i deres tilstande (loading, fejl,
tom, rollebaseret adgang, låst/åben, før/efter deadline, godkendt/afventer,
korrekte/forkerte tip, fuzzy bonus-matchning osv.) — men IKKE udtømmende:
under halvdelen af knapperne og felterne bliver rørt af nogen test. Det
levende tal står under Admin → Tests → Knapper og felter (se nedenfor);
det står bevidst ikke her.

## Rundvisning for nye (offentlig side)

`tip.vejleaa.dk/testsetup.html` er en rundvisning i hele setuppet — niveauer,
vejen fra commit til produktion, reviewer-rollerne, mutationstest og de kendte
huller — med en ISTQB-ordbog til sidst. Filen ligger i
`public/testsetup.html` og følger med begge builds. Tallene på siden er et
DATERET øjebliksbillede (det står øverst på siden); de levende tal bor under
Admin → Tests som beskrevet nedenfor. Siden er offentlig for alle med adressen
og bærer derfor ingen hemmeligheder.

## Oversigt i appen (kun admin)
Under **Admin → Tests** kan administratorer se en komplet oversigt over alle
gennemførte tests (pr. fil og pr. test, med bestået/fejlet-status),
afhængighedsdiagrammet og **Knapper og felter**: hvilke knapper, felter, formularer og
links i kildekoden mindst én test har rørt ved. Alle tre er ØJEBLIKSBILLEDER
— committede JSON-filer, ikke en måling af suiten lige nu:

```bash
npm run test:report   # skriver src/data/testReport.json, depGraph.json OG fladeDaekning.json
```

Knapper og felter bygges af to halvdele, der mødes i én nøgle (`fil:linje:kolonne`,
`scripts/lib/evneNoegle.mjs`): `scripts/scan-flade.mjs` finder alle
interaktive JSX-elementer med parseren (ikke grep — flerlinje-tags var 42 %
af knapperne), og en lytter i `src/test/setup.js` logger under kørslen,
hvilke elementer testene dispatchede klik/indtastning/submit på, med
kildestedet fra Reacts `_debugSource`. Lytteren er kun aktiv, når `EVNE_LOG`
er sat — det gør `build-test-report.mjs`. "Aktiveret" betyder præcis det: en
test rørte elementet. Det siger IKKE, at opførslen bag er bevist, og det ser
ikke reglerne eller serveren — Forlad-knappen VAR aktiveret i tests den dag,
den fejlede i produktion, fordi reglerne forbød det, fladen tilbød.

Fanen viser **tre tilstande**, ikke to: *rørt* (en test klikkede/skrev),
*vist, men ikke rørt* (elementet kom ind i DOM'en i mindst én test — også bag
en lukket fold; jsdom har ingen layout) og *aldrig vist* (ingen test har
nogensinde tegnet det — den alvorlige tilstand, uden vagt overhovedet). Det
måles med en `MutationObserver` på `document.body` i samme tap (én
`render`-post pr. testfil med alle nøgler i de tilføjede undertræers
fiber-kæder); en render-post krediterer ALLE nøgler i kæden, modsat klik, der
kun krediterer den nærmeste. `build-test-report.mjs` nægter at skrive
rapporten, hvis et rørt element mangler render-kredit — man kan ikke klikke
på noget, der aldrig blev tegnet, så et brud betyder, at render-tappen er død,
og hvert «aldrig vist» ville være falsk alarm. Prisen er målt med
`node scripts/maal-koeretid.mjs` (hele suiten uden og med tap): 138,8 s uden
tap, 139,1 s med klik-tap, 142,5 s med klik- og render-tap (4/9 2026, samme
container, ingen anden last) — ca. 2 %. React 19 fjerner `_debugSource`;
så dør begge tapper, og render-invarianten er dét, der opdager det.

E2E-klik tæller også med: `build-test-report.mjs` kører Playwright mod
emulatorerne med `EVNE_LOG` sat, og `e2e/fixtures/evne.mjs` +
`evneKaede.mjs` logger klik og render i samme format (bundtet bygges da med
React-dev-runtime, så elementerne bærer deres kildested). 1X2-knapperne i tip-fladen klikkes kun af
`e2e/platform/tip.spec.js` og står derfor som rørt af netop den. Alle specs
importerer `test`/`expect` fra fixturen — en spec, der importerer
`@playwright/test` direkte, tæller ikke. CI-vagten (nedenfor) ser derimod
kun Vitest-loggen.

**Vagten i CI.** Frontend-jobbet kører suiten med `EVNE_LOG` sat og derefter
`node scripts/flade-vagt.mjs`. Den er rød ved et nyt urørt element, ved tom
log (så ville alt se urørt ud), når en undtagelse mangler begrundelse — og
når basislinjen kan skrumpe. Basislinjen (`scripts/flade-basislinje.json`)
er listen over de kendte urørte elementer; den kræver ikke 100 % fra dag ét,
men den kan kun skrumpe, og den skal skrumpe med det samme:

```bash
EVNE_LOG="$PWD/.evne-log" npm run test:coverage      # samme kørsel som CI; tappen skriver loggen
node scripts/flade-vagt.mjs                          # rød/grøn som i CI
node scripts/flade-vagt.mjs --opdater                # skriv basislinjen på ny
```

Nøglerne i basislinjen er `fil|komponent|tag|tekst#nummer`, ikke linjetal —
linjetal flytter sig ved enhver redigering ovenfor. Et element, der med vilje
ikke skal have en test (fx en knap, der er deaktiveret i alle tilstande),
lægges i `scripts/flade-undtagelser.json` med en begrundelse — det gælder
også et element, som kun en Playwright-spec rører (begrundelse «dækket af
e2e/…spec.js»): vagten ser kun frontend-jobbets Vitest-log.

Kendt begrænsning: nummeret (`#n`) tælles i kildeorden. Indsættes en ny
identisk knap FØR en kendt urørt makker i samme fil, arver den nye nummeret,
og den gamle meldes som ny. CI er rød under alle omstændigheder, men på den
forkerte post — derfor printer `--opdater` præcis hvilke nøgler der kommer
til og går ud. Læs den liste, før basislinjen committes.

Kørslen dækker alle tre suiter: frontend, `functions/` (Tour) og
`functions-platform/` (platformen). Den sidste manglede, fra fanen blev
bygget, til september 2026 — hele platform-serveren var utalt, mens fanen
skrev "Cloud Functions" om Tourens tal.

**Det gøres normalt ikke i hånden.** Actions → *"Opdatér test-rapporten"*
kører den — hver mandag af sig selv, og på knappen når som helst — og
committer de tre filer, hvis tallene har flyttet sig. Fanen skifter dog først
ved næste platform-deploy, fordi tallene bages ind i bundtet.

Holder kørslen op med at virke, siger fanen selv fra: er det ældste af de tre
øjebliksbilleder over 14 dage gammelt — altså mindst to udeblevne ugekørsler
— står der en advarsel over underfanerne med dato, alder og vejen videre.
Uden den stod tallene fra 27. juni 2026 i over to måneder og påstod 73 filer,
mens suiten var vokset til 252.

## Det fælles Superliga-scenarie

`src/test/scenarie/superliga.js` er ét rodet scenarie, som tip-fladens og
spiloversigtens tests kører på (`FootballTip.scenarie.test.jsx`,
`GamesPage.scenarie.test.jsx`), og som invariant-testene bygger videre på.
Det bærer BEGGE tilstande af hver gate på én gang: låste og ulåste kampe i
samme runde, en lånt kamp fra runde 19, der låser før runde 20's egne, en
afgjort runde med tips, en runde før `startRound`, en liga jeg er med i og
en jeg ikke er, spillere med point og en forladt spiller. Scenariets egne
invarianter står i `superliga.test.js` — bliver én tilstand væk, er testene
oven på det grønne uden at måle noget.

Det deler hold, rundenumre, spiller-id'er og point med E2E-seedet
(`e2e/fixtures/konstanter.mjs`), og kamp-id'erne dannes af samme `matchId`,
så id-formatet er ens — men kampopstillingerne er IKKE de samme: seedet
bygger sine egne runder, og Vitest-scenariet sine (det har en efterslæber,
seedet har ikke). Formen er også forskellig: Vitest bruger `Date` og en
frossen systemtid (`NU`), emulatoren `Timestamp` relativt til seed-tiden.

To invariant-suiter kører oven på scenariet:

- **Fladen tilbyder ⇔ reglerne tillader** (`functions/rules.scenarie.test.js`,
  kræver emulatoren, `npm run test:rules`): for hver kamp i scenariet kører
  samme skrivning, klienten sender (`setBet`), mod `firestore.rules` med
  samme tilstand, fladen regner på (`isLocked`, medlemsgaten fra
  `src/lib/medlem.js`, som `useGame.js` også bruger), og de to svar skal
  være ens — inkl. forladt, uden players-dokument, «Vend tilbage», «Deltag»
  og at en chance ≠ 0 ikke kan skrives direkte (kun callable'en
  `setGameChance` må; nul er ikke en chance). Det er den slags invariant,
  Forlad-fejlen brød: fladen tilbød noget, reglerne forbød. Selve Forlad går
  nu gennem callable'en `forladSpil`, som reglerne ikke kan svare på — om et
  Forlad med point lykkes, bevises i `functions-platform/forladSpil.test.js`;
  rules-testen beviser, at klienten ikke kan gøre det samme udenom.
- **Afledte tal ⇔ DOM'en** (`FootballTip.invarianter.test.jsx`): «Næste kamp
  låser om» og «snart» skal følge af de kort, der står på skærmen — findes ⇔
  et kort er aktivt, lyser ⇔ det første aktive kort låser om under 2 t, og
  det første aktive kort er det tidligste. Kørt som egenskab over flere
  tidspunkter, ikke som én case; den kender ikke fixturen.

Baggrunden: «Næste kamp låser om» ignorerede udsatte kampe i månedsvis, fordi
ingen fixture havde en efterslæber — hver test byggede sin egen, pæne runde.
Nye tests af tip-fladen bør starte her og vippe én knap (`scenarie({ nu,
spil })`) frem for at bygge endnu en runde fra bunden.

## Sådan køres testene

Antallet står bevidst ikke i kommentarerne — se ovenfor.

```bash
# Frontend unit + komponent
npm test
npm run test:coverage          # med dækningsrapport (coverage/)

# Cloud Functions, Tour (ingen emulator)
npm --prefix functions test

# Cloud Functions, platform (ingen emulator)
npm --prefix functions-platform test -- --silent

# Security Rules — kræver Firestore-emulator
firebase emulators:exec --only firestore "npm run test:rules" --project demo-vm2026

# E2E (Playwright) — Tour uden backend, i Chromium
npx playwright install chromium     # første gang
npm run test:e2e

# E2E, platformen mod Auth- og Firestore-emulatoren (kræver Java 21 + firebase-tools)
npm run test:e2e:emu
```

## Dækningsområder

### Udtømmende UI-dækning (alle scenarier)
Hver side og komponent testes i alle relevante tilstande. Testfiler (uddrag):
- **Auth/Admin:** LoginPage, PendingPage, AdminPage (rollebaserede faner),
  UsersTab, MatchResultForm, MatchCreateForm, MatchesTab, BonusTab,
  BonusSubmissions, LeaguesAdminTab, useAuthActions, adminActions, firebaseErrors.
- **Tipning/Bonus:** MatchCard (åben/låst/afgjort/knockout/pendingTeams),
  ScoreInput, matchHelpers, MatchesPage (filtre/loading/fejl/tom), MyBetsPage,
  BonusPage (sortering/åbne/låste), BonusQuestion, bonusHelpers, PointRules, Hero, Flag.
- **Ligaer/Rangering/Turnering:** LeaguesPage (opret/tilmeld/godkendelse/fejl),
  leagueActions, leagueUtils, StandingsTable, standingsUtils, LeaderboardPage,
  TournamentPage, computeStandings, teams, ThemeToggle.

Firebase mockes fuldt i alle komponent-tests (ingen netværk).

### Pointlogik (kerne)
- Eksakt score (5), målforskel (3), udfald (2), forkert (0)
- Uafgjort-tilfælde, manglende/ugyldige data
- Knockout: advance-bonus (+2) for korrekt videregående hold
- Bonus: 10 point for korrekt svar
- Functions-spejlet (`functions/scoring.js`) testes identisk, så frontend og
  backend altid er enige.

### Grupperangering (`functions/standings.js`)
- Point (3/1/0), målforskel, scorede mål som tiebreak
- Udvælgelse af de 8 bedste 3'ere til 1/16-finalen

### Auth & Admin
- Oversættelse af Firebase-fejlkoder til danske beskeder
- Login-validering og redirect-logik
- `PendingPage` viser korrekt besked pr. status (afventer/afvist/godkendt)
- **Rolle-adgang:** Brugere-fanen er synlig for globale admins (rolletildeling kun for ejer)

### Tippe-UI
- `ScoreInput` validerer ikke-negative heltal
- "Er kampen låst"-logik (før/efter kickoff)
- Gruppering af kampe efter dag
- `MatchCard` viser låst-tilstand + resultat/point når afgjort
- Bonus kan ikke besvares efter deadline

### Ligaer & rangering
- `StandingsTable` sorterer korrekt og fremhæver egen række
- Generering af unik join-kode
- Filtrering af stilling til ligamedlemmer
- Beregning af dagens point

### Security Rules (emulator)
- Spiller kan **ikke** skrive `points`, `role` eller `status`
- Spiller kan **ikke** ændre egen rolle/status
- Tip kan skrives **før** kickoff, men **ikke** efter
- Kun ejer kan godkende brugere

### E2E (Playwright)
To lag, se `playwright.config.js`:

**Tour uden backend** (`e2e/tour/`, `npm run test:e2e`):
- Uautentificeret bruger sendes til login
- Login-siden viser begge faner
- Validering viser danske fejlbeskeder
- 404-side for ukendt rute

**Platformen mod Auth- og Firestore-emulatoren** (`e2e/platform/`,
`npm run test:e2e:emu` — kræver Java 21 og `firebase-tools`). Appen bygges i
Vite-mode `e2e` (`.env.e2e`), `e2e/fixtures/seed-e2e.mjs` rydder emulatorerne
og seeder fem brugere (spiller, medspiller, fremmed, forladt, ejer), ét spil,
to ligaer og syv kampe med kickoff relativt til nu — heraf én fra runde 18,
udsat til denne uge — og `auth.setup.js` logger spiller, ejer og forladt ind
gennem fladen og gemmer tilstandene (IndexedDB, hvor Firebase Auth bor).
Testene skriver og læser gennem de ægte `firestore.rules`:
- Godkendt spiller lander på `/spil` og kan åbne sit spil (Deltag-kortet vises ikke)
- Et X-tip på en åben kamp vises i Mine tips med præcis det bogstav
- Kampe med passeret kickoff kan ikke tippes: knapperne er låst, og ligaens tips vises i stedet
- Ny bruger opretter sig → /afventer → ejeren godkender under Admin → Brugere → brugeren
  kommer ind uden genindlæsning (to browser-contexts, ejerens login gemt af setup)
- Stillingen viser præcis liga-kammeraterne med serverens point, i rækkefølge, og uden
  fejl i konsollen (fixturen har en liga med spiller og medspiller)
- Den lånte kamp (runde 18, udsat til denne uge) står øverst på runde 20, bærer
  «Runde 18 · point tæller dér», tælleren peger på den og lyser, og kuponen
  tæller stadig kun rundens egne (0/2) — ejerens fejl fra 3/9 (#213)
- Forlad med point: knappen findes for et åbent spil, der spørges to gange, anden
  dialog nævner «4,5 point», og det, der sendes, er callable'en `forladSpil` med
  spillets id — kaldet opsnappes i browseren og besvares som serveren ville
  (functions-emulatoren kører ikke); serverens del bevises i `forladSpil.test.js`
- «Vend tilbage»: den forladte ser kortet under Åbne spil (ikke Deltag, ikke
  Forlad), klikket fjerner flaget gennem reglerne, spillet flytter til Mine spil,
  og spilsiden viser fanerne igen

Ikke dækket: callables ud over vejen til dem (Chancen, synk, selve forladSpil),
Tour-flows (spillet er afsluttet).

## CI-pipeline
`.github/workflows/ci.yml` kører fire parallelle jobs på hvert push/PR:
1. **frontend** – lint + unit/komponent-tests (med dækning) + build
2. **functions** – scoring + standings-tests
3. **rules** – Security Rules mod Firestore-emulator
4. **e2e** – Playwright i Chromium (rapport uploades som artefakt)

## Kendte begrænsninger
- Et miljø uden browser-download kan pege Playwright på en forudinstalleret
  Chromium med `E2E_CHROMIUM=/sti/til/chromium`; ellers køres E2E i CI.
- E2E kører ingen callable direkte — der kører ingen functions-emulator.
  Chancen og synk-knapperne er slet ikke dækket; Forlads vej fra knap til
  kald dækkes ved at opsnappe kaldet i browseren
  (`e2e/platform/forlad.spec.js`), mens serverens del af `forladSpil`
  bevises i `functions-platform/forladSpil.test.js`. Alle øvrige flows er
  rene klient-skrivninger gennem reglerne.
