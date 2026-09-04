---
description: Sæsoneftersyn — periodisk gennemgang af sikkerhed, forbrug, drift, afhængigheder, dokumentation, testsuite, spilglæde og rollernes hukommelse. Køres før en ny sæson eller ca. hver anden måned.
---

# Sæsoneftersyn

De tre faste roller kigger på **én ændring ad gangen**. Der findes en anden slags
problemer, som ingen af dem nogensinde ser: dem der vokser stille frem mellem
ændringerne. Et forbrug der er tredoblet. En afhængighed to majors bagud. En
scheduled function, der stille er holdt op med at køre. En
dokumentation der beskriver en app, vi ikke har mere.

Det er dét, dette eftersyn er til. Kør det **før en ny sæson starter**, eller
ca. hver anden måned. Aldrig midt i en aktiv runde — flere af punkterne
inviterer til ændringer, og en spilaften er det forkerte tidspunkt.

## Sådan kører du det

Gennemgå de ti punkter herunder. Undersøg reelt — gæt ikke. Slut med **én
prioriteret liste** til brugeren: hvad haster, hvad kan vente til efter sæsonen,
og hvad vi bevidst lever med.

### 1. Forbrug og kvoter

Firestore er den eneste ting her, der kan blive dyr, og den bliver det gennem
læsninger — ikke gennem data. Led efter:

- Lyttere der abonnerer bredt og filtrerer i klienten i stedet for i querien.
- Triggere der fyrer pr. dokument, hvor de kunne fyre pr. batch
  (`syncTipParticipation` i Tour er det kendte eksempel: ~100 kald pr. etape).
- Fuld-scan i Cloud Functions, hvor `getAll` eller `where(…, 'in', …)` ville gøre.
- Ubrugte composite indexes i `firestore.indexes.json` — de koster skriv.

Regn på det største fund: hvor mange læsninger pr. runde, gange antal spillere.
Et tal er mere overbevisende end en bekymring.

### 2. Driften mellem deployene

Release Manager ser deployet — ikke ugerne efter. Undersøg:

- **Fejllogs**: åbn Cloud Functions-loggene for begge projekter og led efter
  fejl, ingen har set. En fejl, der har stået der i to måneder, er et hul i
  alarmeringen, ikke kun i koden.
- **Scheduled functions**: kører de stadig? Sammenhold seneste kørsel med den
  forventede kadence — en function, der stille er holdt op, opdages ellers
  først, når påmindelserne udebliver midt i en runde.
- **Mails**: sendes de, og kommer de frem? Kvoteforbrug og bounces.
- **Alarmerne selv**: en alarm, der aldrig har fyret, er enten et sundhedstegn
  eller død. Afgør hvilken — fremprovokér en testfejl, hvis det er den eneste
  måde at vide det på.

### 3. Bundle og indlæsningstid

```bash
npm run build && VITE_PLATFORM_MODE=true npm run build
```

Kig på chunk-størrelserne. Er noget tungt havnet i hovedbundtet igen, eller er
en side, der burde være `React.lazy`, blevet importeret direkte et sted? Sig
hvad der er vokset siden sidst, ikke bare hvad der er stort.

### 4. Afhængigheder

```bash
npm run deps:check
npm audit --omit=dev
```

Se også, om der ligger åbne Dependabot-PR'er og samler støv. Skil reelle
sårbarheder fra støj: en advarsel i et build-værktøj rammer ikke spillerne.
Se `docs/maintenance.md` — majors tages én ad gangen.

### 5. Dokumentations-drift

Den farligste form for forældet dokumentation er den, der ser rigtig ud.
Stikprøv: passer `README.md` og `docs/architecture.md` stadig på datamodellen?
Beskriver `docs/admin-guide.md` de faner, der faktisk findes? Henter
`FootballHelp.jsx` stadig de rigtige tal fra scoring-koden?
Og `public/testsetup.html` — den offentlige rundvisning i testopsætningen — bærer
hardkodede tal (antal tests, CI-tider, roller) uden paritetstest. Tæl efter, og
ret datoen på siden, når tallene er rettet; ellers er den den næste "lige
nu"-løgn.

Historiske dokumenter (statusrapporter, gamle reviews) skal være **mærket som
historiske**, ikke rettet — de er et referat af et tidspunkt.

### 6. Fuld sikkerhedsgennemgang

Kør **Security Reviewer**-agenten på hele overfladen, ikke kun på en diff:
`firestore.rules`, alle callables i begge functions-kodebaser, invitations- og
liga-flowet, admin-rettighederne. Bed eksplicit om kontroltests, så vi ved,
opsætningen virker.

Tjek også de rigtige data: er der spillere med roller, de ikke skal have
længere? Invitationskoder der aldrig blev brugt op? Konti fra sidste sæson, som
stadig er `approved`?

### 7. Testsuitens sundhed

```bash
npx vitest run
npm --prefix functions test
npm --prefix functions-platform test
firebase emulators:exec --only firestore "npm run test:rules" --project demo-vm2026
```

Bemærk: her køres de **UDEN** `--silent`, modsat den daglige arbejdsgang i
CLAUDE.md. Det er hele pointen med at have dem her.

**Gennemgå advarslerne.** Til daglig køres suiten tavs, fordi ~91 % af en grøn
kørsels output er advarsler — og da en grøn kørsel ikke læses, ser ingen dem
mellem eftersynene. Det er en bevidst pris, men den forfalder her:

- **`act()`-advarsler** kan dække over en ægte asynkron race i en komponent.
  Ved sidste måling stod 34 af 41 i `UsersTab.test.jsx` og `AdminPage.test.jsx`.
  Ret dem — **dæmp dem aldrig** med et filter i `src/test/setup.js`, for så
  skjules ægte React-fejl med.
- **React Router future-flag-advarsler** var ~21 KB, to unikke sætninger
  gentaget 32 gange. De rettes med to flag i testenes router-opsætning, ikke
  ved at tie dem.
- Er der kommet en NY slags advarsel siden sidst? Den er det egentlige fund —
  de kendte er støj, den nye er et signal.

Alle fire skal køre. Spørg derudover:

- Ligger der testfiler, som **ikke** står i `include`-listen i
  `functions*/vitest.config.js` og derfor aldrig køres?
- Er noget blevet flaky (`Date.now()` uden fastfrysning, rækkefølgeafhængighed)?
- Er der kode, der er blevet forretningskritisk siden sidst, uden at dækningen
  fulgte med?

### 8. Spilglæden

Kør **Spilfører**-agenten retrospektivt på sæsonen i stedet for på en plan:
hvilke features blev brugt, hvilke gav snak på liga-væggen, og hvilke faldt
døde? Hvor i tabellen faldt aktiviteten — holdt bunden op med at logge ind,
og hvornår i sæsonen? Fodr agentens hukommelse med svarene; det er dét, der
gør dens næste plan-vurdering bedre end et gæt.

Ét konkret forslag til næste sæson er nok — ti er støj.

### 9. Rollernes hukommelse

Agenterne fører selv deres viden i `.claude/agent-memory/`. Stikprøv den:

- Står der faldgruber, der ikke findes længere — rettet kode, fjernede filer,
  lukkede huller? Bed den relevante agent selv rydde op; ret ikke i hånden.
- Er noget vokset til støj, så kernen drukner i enkeltobservationer?
- Er mapperne committet, så viden følger repoet?

### 10. Fladevandringen

Rollerne kigger på diffs; en fane, ingen ændring har rørt, ser de aldrig — og
Beskeder-fanen var netop en tavs blindgyde i månedsvis, fundet af ejeren i
fladen, ikke af nogen rolle. Gå derfor HELE fladen igennem, systematisk:

- Enumerér alle nav-punkter, faner og admin-flader i PLATFORM_MODE (App.jsx,
  Layout, spil-sidens faner, Admin-fanerne) — og prøv hver primær handling.
- For hver flade: virker den ende-til-ende med platformens datamodel
  (games-scoped), eller er den en blindgyde — tom liste uden forklaring, knap
  der aldrig kan aktiveres, form der altid afvises?
- Tjek evne-fladerne pr. SPIL, ikke pr. mekanisme: har hvert synket spil sit
  Drift-kort, sin manuelle udløser, sin hjælpetekst? ("Synk kamptider nu"
  manglede for Superligaen, fordi ingen gik matrixen igennem.)
- Fraværs-assertions i testene (`not.toBeInTheDocument`, `toBeNull` om
  produkt-beslutninger): fastfryser nogen af dem en verden, der ikke længere
  er den ønskede?

**Med rigtige data, ikke med fixturen.** De to fejl 3/9 2026 (Forlad-knappen
for spillere med point; «Næste kamp låser om», der ignorerede en udsat kamp)
blev begge fundet af ejeren i produktion — med sine egne point og en kamp,
der faktisk var udsat. Ingen fixture havde de tilstande, og en fladevandring
mod emulatoren ville have haft samme blinde vinkel. Derfor:

- Gå fladen igennem på tip.vejleaa.dk som **spiller med point** (ejerens
  egen konto) og som **admin** — ikke som en frisk testbruger. Tilstandene,
  der har brudt ting, er dem, kun rigtige data har: point, en liga man ejer,
  en udsat kamp, en runde midt i afvikling, en bruger der er afventende.
- Brug **Admin → Tests → «Knapper og felter»** som tjekliste: filtrér med
  «Vis kun det, ingen test rører» og klik hvert af de elementer i produktion.
  Det er præcis de knapper og felter, ingen automatisk test har rørt siden
  sidste kørsel — og fanen siger selv, hvornår tallene er fra.
- Kun læsende handlinger og egne tips. Aldrig admin-skrivninger (godkend,
  synk, bagfyld, seed) som en del af vandringen — dem prøves i emulatoren
  (`npm run test:e2e:emu` seeder en spiller med point, en forladt spiller og
  en udsat kamp, hvis en fejl skal genskabes uden produktion).
- Skriv hvert fund som et issue med den tilstand, der udløste det (uid-rolle,
  runde, kampens status) — så det kan blive en fixture-tilstand i
  `src/test/scenarie/superliga.js` eller i E2E-seedet, og ikke kun en
  rettelse. Fejlen 3/9 blev til begge dele; det er målet hver gang.

### 11. Backlogget

Gennemgå det, vi bevidst har udskudt, og spørg for hvert punkt: er det stadig
det rigtige valg? Nogle ting bliver billigere at rette, når appen alligevel er
i pause — og dyrere, når sæsonen er i gang.

## Din udmelding

Kort og på dansk. Én prioriteret liste med tre kurve:

1. **Skal rettes før sæsonstart** — med begrundelse, ikke bare en alvorsgrad.
2. **Kan vente** — men skriv hvornår det bliver et problem.
3. **Lever vi med** — så vi ikke genfinder det næste gang og bruger tid på det igen.

Fandt du intet alvorligt, så sig dét, og nævn hvad du faktisk efterprøvede.
Et eftersyn uden fund er et gyldigt resultat — et eftersyn uden bevis er ikke.
