# Arbejdsgang for dette repo

Læs [README.md](README.md) først — den forklarer, at ét repo bygger to apps.
Dette dokument handler om **hvordan** vi arbejder, ikke hvad koden gør.

## De tre faste roller

**Hver eneste ændring i spillet skal igennem alle tre**, før den landes.
De er defineret som agenter i `.claude/agents/` og køres parallelt, når
ændringen er skrevet færdig og valideret lokalt:

| Rolle | Spørger | Kan blokere for |
|---|---|---|
| **Test Manager** | Er ændringen bevist? Mutationstest kernen — en grøn suite beviser intet | at lande uden dækning |
| **Quality Control Manager** | Løser den det rigtige problem — og hvad rører den ellers ved? | at lande med en halv rettelse |
| **Release Manager** | Hvad skal deployes, i hvilken rækkefølge, og hvad tjekkes bagefter? | en forkert udrulning |

Dertil to roller, der **kun** køres når ændringen kalder på det:

| Rolle | Køres når ændringen rører |
|---|---|
| **Security Reviewer** | `firestore.rules`, `functions*/`, auth, invitationer, liga-tilmelding — eller noget andet, der afgør hvem der ser hvad |
| **Spilfører** | spilmekanik, scoring, ranglister, hvem-ser-hvad-hvornår, notifikationer/mails eller sociale features — og kun på **planen**, før koden skrives |

De er med vilje ikke faste. En sikkerhedsgennemgang af en tekstrettelse lærer
ingen noget, og en rolle, der altid siger "ser fint ud", holder man op med at læse.

**Spilfører er rådgivende, ikke blokerende.** Dens spørgsmål er, om ændringen
gør spillet sjovere eller kedeligere. Et "gør spillet kedeligere" skal
**besvares** i planen — ikke nødvendigvis adlydes. Kedeligt er en dom, ejeren
selv fælder.

Rollerne kører på hver sin model (sat i deres frontmatter — de hyppige på
billigere modeller, de sjældne på de stærkeste), og flere af dem fører en
varig hukommelse i `.claude/agent-memory/`, som committes med. Ret aldrig i
deres hukommelsesfiler i hånden midt i en gennemgang — de vedligeholder dem selv.

**Antag, at dine egne tests bekræfter sig selv.** Koden og testene skrives af
den samme i samme åndedrag og indkoder samme forståelse — også når den er
forkert. Derfor er mutationstest ikke en ekstra grundighed, men den eneste
måde at vide, om noget er dækket. Alt, der er sluppet igennem her, er sluppet
igennem med en grøn suite.

To former, den slipper igennem på, er værd at kende ved navn:

- **Et bånd, der rummer både før og efter, måler ingenting.** En test krævede
  uafgjort mellem 13 og 20 % — den gamle værdi gav 13,7 %, den nye 16,1 %.
  Testen bestod altså med præcis den værdi, den var skrevet for at fange.
  Skriv båndet, så det bliver rødt af den gamle værdi, og skriv i kommentaren
  hvad begge tal er.
- **En test, der kun tjekker at noget blev VIST, beviser ikke hvad der stod.**
  Hele advarselsteksten i en bekræftelsesdialog kunne erstattes med "OK?" med
  grøn suite, og en hjælpetekst kunne modsige sig selv i to nabosætninger.
  Assertér på indholdet — og på det, der IKKE må stå.

De er ikke en formalitet. Hver rolle har blokeret noget ægte:
en grøn test, der ikke kunne fange fejlen; en rettelse, der kun lukkede
symptomet; og en regel-udrulning, der ville have vist alle en tom stilling.

**Undtagelser:** rene tekstrettelser i `docs/` uden kodeændring. Alt andet —
også "bare en lille fejlrettelse" — skal forbi alle tre. Det var netop en
"lille" ændring, der spærrede alle migrerede brugere ude fra deres egen profil.

Rapportér deres konklusioner til brugeren, før du merger. Er en rolle uenig,
så løs det først eller sig klart, hvad du lander med og hvorfor.

## Rækkefølgen i praksis

0. Tilføjer ændringen **ny brugerflade eller nye tal på skærmen**, så kør
   Quality Control på *planen* først — og kør den på opus (sig det ved
   invokationen; den kører ellers på sonnet). To minutter dér sparer en
   omskrivning: de dyreste fund har været designfejl, ikke kodefejl.
   Rører planen **spilmekanik, scoring, synlighed eller sociale features**,
   så kør Spilfører på planen samtidig — en kedelig feature, der først
   opdages færdigbygget, koster det samme som en designfejl.
0b. Får ændringen en **knap eller en fane**, så afgør FØRST hvor den hører
   hjemme — og vælg det sted, en administrator ville lede efter den, ikke det
   sted der er nemmest at bygge. Spørg: *hvad ville jeg selv klikke på, hvis
   jeg ikke havde skrevet koden?* En funktion, der sender mails, hører under
   **Send mail**, også selv om dens modtagerbegreb er et andet end fanens.
   En pointopdaterings-mail blev lagt under Spil-planlægning, fordi den delte
   data med den fane — og så kunne ejeren ikke finde den. Intern konsistens
   taber til genfindelighed.
1. Skriv ændringen. Kør lokalt: `npm run lint`, relevante tests, `npm run build`.
   **Kontrollér, at hver ændring faktisk landede** — en tekst-erstatning, der
   ikke matcher, fejler tavst, og så står testfilen grøn uden at dække noget.
2. **Kør `node scripts/roller.mjs` og følg dens liste — vurder ikke selv.**
   Den læser diffen og siger, hvilke roller der skal køre, og hvorfor. Klistr
   udskriften ind i PR-teksten, så beslutningen kan efterprøves bagefter.
   Den findes, fordi reglerne herunder blev brudt i BEGGE retninger i samme
   session: Quality Control blev kørt på både planen og koden for ændringer,
   hvor reglen kun kræver planen ved ny brugerflade, og Release Manager blev
   kørt to gange, fordi den første briefing serverede en forkert påstand som
   et faktum. Teksten var der; vagten manglede.

   Der stod før et tal her — "~130.000 tokens" — og det havde ingen kode bag
   sig. Forbruget pr. rolle-kørsel kan aflæses i sessionens egen telemetri,
   men det findes ikke i repoet og kan ikke efterprøves af den, der læser
   dette. Efter husets egen regel er det derfor en påstand, ikke et tal, og
   det er taget ud. Begrundelsen for vagten er hændelsen, ikke størrelsen.

   **Commit FØRST, kør så Test Manager og Quality Control parallelt** — plus
   Security Reviewer, hvis ændringen rører adgang. Ret det, de finder.

   **Brug ALDRIG `git add -A`, mens roller kører.** Test Manager muterer i sin
   egen worktree, men Quality Control og Security arbejder i DIT arbejdstræ og
   kan have en bevidst ødelagt fil liggende, mens de efterprøver noget. Én
   `git add -A` fejede en sådan mutation med ind i en commit, så en negeret
   vagt i `rundeSejre.js` landede på branchen. Stage navngivne stier, eller
   kontrollér `git status` mod det, du faktisk har rørt.

   **Giv rollen diffen med i opgaven.** Ellers henter hver rolle den selv og
   læser de samme fulde filer, du netop har skrevet og allerede har i kontekst
   — `FootballTip.jsx` og dens test er alene 113 KB ≈ 28.000 tokens, betalt én
   gang pr. rolle.

   **Skriv dine antagelser som PÅSTANDE, rollen skal efterprøve** — ikke som
   forudsætninger. En Release Manager-plan byggede på, at `gamePage` i App.jsx
   gjorde det modsatte af, hvad den gør, fordi briefingen serverede det som et
   faktum. Sig "spor det i koden, gæt ikke", og skriv fil:linje-kravet med.
   Test Manager muterer i sin **egen worktree**, ikke i dit arbejdstræ — men
   commit-først-reglen består, for worktree'en ser kun det committede: en
   ukommittet ændring bliver aldrig gennemgået. Nævn branchen, når rollerne
   startes, så de gennemgår den rigtige kode.
2b. **Når de er grønne, kør Release Manager** for udrulningsplanen. Den kommer
   sidst, fordi planen afhænger af, hvad der faktisk lander — inklusive de
   rettelser, de andre roller afkrævede.
3. Commit → push → opret PR som draft.
4. Vent på grøn CI (fire jobs). Un-draft → squash-merge.
5. **Deploy efter Release Managers plan — uden at spørge om lov.** Er CI grøn,
   og har rollerne ikke blokerende fund, så rul ud. Spørg ikke hver gang.
6. Verificér i produktion, og fortæl brugeren hvad der er live. Har ændringen
   en ny knap/fane/kort, så bekræft at den faktisk VISES for det konkrete
   spil/den konkrete tilstand — spor render-betingelsen i koden eller kræv en
   render-test for præcis dét fixture. Meld aldrig en flade færdig, du kun har
   set intentionen om.

Undtagelserne fra trin 5, hvor der **stadig** spørges først: alt der skriver i
produktionsdata (bagfyldninger, migreringer, `seedGames`/`seedSuperliga`),
tilbagerulninger, og udrulninger med et blokerende fund fra en rolle.

## Sæsoneftersyn

Rollerne kigger på én ændring ad gangen. Det, der vokser stille **mellem**
ændringerne — forbrug, bundle, forældede afhængigheder, dokumentation der er
drevet fra virkeligheden — ser ingen af dem. Det gælder også driften:
kvoteforbrug over sæsonen, fejllogs ingen har kigget i, scheduled functions
der er holdt op med at køre — og alarmerne selv: virker de stadig?

Kør derfor `/saesoneftersyn` før hver ny sæson, eller ca. hver anden måned.
Aldrig midt i en aktiv runde. Kommandoen ligger i
`.claude/commands/saesoneftersyn.md`. Eftersynet omfatter også **fladen selv**:
gå hele nav'en igennem som bruger og som admin — en fane, ingen ændring har
rørt, kan være død, og rollerne ser den aldrig, for de kigger kun på diffs.

## Korrekt er ikke komplet

To fejl nåede ejeren, mens hele kontrollen var grøn: Beskeder-fanen var en tavs
blindgyde på platformen i månedsvis (den læste en afløst datamodel, og ingen
ændring rørte den, så ingen rolle så den), og "Synk kamptider nu"-knappen
manglede for Superligaen, da den fik kickoff-synk (knappen var gate't på en
proxy — `puljeLockRound` — der kun tilfældigt fulgtes med evnen, så længe PL
var alene om den). Fællesnævneren: rollerne efterprøver, om den **skrevne**
kode er korrekt. Ingen af dem spørger, om den skrevne kode er **hele** koden —
og ingen af dem bruger fladen. Deraf disse regler:

- **En evne, der udvides, skal følges hele vejen ud i fladen.** Får et spil
  eller en kilde en ny evne (eller mister en), så optæl FØR koden skrives alle
  flader, der afhænger af evnen — Drift-kort, admin-knapper, hjælpetekster,
  server-gates — og sæt listen i planen. Ét fund er ikke svaret; listen er.
  SL-synken fik serverdelen i én PR, Drift-kortet i den næste og knappen i den
  tredje, fordi hver flade først blev fundet, da nogen savnede den.
- **En gate skal teste evnen, ikke en nabo-egenskab.** `puljeLockRound` var
  proxy for "har kickoff-synk" og knækkede tavst, da korrelationen brød. En
  proxy-gate kan ikke findes med grep — den indeholder ikke evnens navn. Gate
  på en delt helper (fx `harKickoffSynk`), aldrig på noget, der blot plejer at
  følges ad med evnen.
- **En afløst datamodel skal have et forbrugs-eftersyn.** Da ligaerne flyttede
  under spillene, blev hver læser af top-niveau `leagues` et potentielt lig.
  Afløses en model, så grep ALLE læsere af den gamle og dispositionér hver
  enkelt på skrift i planen: porteret, bevidst legacy, eller død. Beskeder var
  en læser, ingen dispositionerede.
- **En test kan fastfryse en fejl.** Suiten asserterede eksplicit, at SL IKKE
  måtte have synk-knappen — grøn, fordi den forsvarede bugget. Udvider du en
  adfærd, så søg i testene efter fraværs-assertions om netop dét, du udvider
  (`not.toBeInTheDocument`, `toBeNull`, `understoettet:false`, `toEqual([])`),
  og vend dem bevidst — de må ikke først opdages som røde, og slet ikke
  overleve som grønne.
- **En klik-sti i en plan skal være sporet, ikke antaget.** Release Managers
  verifikationsplan henviste til en knap, der ikke fandtes for det spil, planen
  handlede om — og stien blev givet videre til ejeren som facit. Hvert
  klik-trin spores til den render-betingelse (fil:linje), der viser elementet
  for præcis det spil og den tilstand, planen gælder.
- **Et spejl af levende data er en løgn med forsinkelse.** Hjælpesiden bar en
  hardkodet spilliste under overskriften "Spillene lige nu" — Touren stod som
  i gang efter sin afslutning, og PL manglede, mens der blev inviteret til
  det. Skal fladen vise noget, der ændrer sig (spillenes status, kilder,
  evner), så AFLED det af den levende kilde (games-collectionen, serverens
  lister). Kan det ikke aflades — klienten kan ikke importere serverens
  moduler — så bind spejlet med en paritetstest, der læser modparten (mønstret
  fra mailMarkdown). En hardkodet kopi uden vagt er ikke en forenkling; det er
  den næste "lige nu"-løgn.
- **"Kan startes med vilje" og "kan ikke fejle tavst" efterprøves pr. SPIL —
  og fra fødslen.** Begge regler fandtes, da påmindelses-jobbet blev bygget
  uden driftlog-kort, og da resultat-synken fik en callable uden knap: de blev
  læst som "mekanismen har en vej", ikke "hver instans har en". Byg matrixen
  maskineri × spil, når nyt maskineri landes: en callable uden knap i fladen
  tæller som ingen udløser, og en kørsel uden driftlog-kort/alarm tæller som
  tavs — uanset hvad der findes for nabospillet.
- **Dokumentation er en spejlet fil.** Admin-guiden beskrev en nedlagt
  kvarter-synk og udelod, at PL-facit kommer af sig selv; drift.md sendte
  ejeren til en fane, der ikke findes; games.mjs påstod, at pulselive ikke var
  implementeret. Ændrer du adfærd eller navne, så grep `docs/` og
  hjælpesiderne for den gamle formulering I SAMME PR — dokumentations-drift
  opdages ellers først, når ejeren står i præcis den fejlsituation, manualen
  var skrevet til at afkorte.

## Faste regler

- **Dansk** i UI, kommentarer, commits og PR-tekster.
- **Skriv aldrig modelnavn** i commits, PR'er eller kode.
- **Kør aldrig `npm run seed`** mod produktion — den overskriver med VM-data.
- **Serveren er eneste autoritet.** Validering i browseren kan omgås.
- **Spejlede filer følges ad:** `src/lib/*.js` ⇄ `functions*/…js`.
- **Regler er ikke filtre** — strammer du en læseregel, skal klientens query
  matche præcist, ellers ser brugeren en tom liste uden fejlbesked.
- **Tør-kørsel først** på alt, der skriver i produktionsdata (`docs/drift.md`).
- **Placering er en beslutning, ikke en detalje.** Nye admin-funktioner lægges,
  hvor de kan findes — se trin 0b.
- **Et tal uden kode er en påstand.** Måler du noget, der begrunder en ændring,
  så læg harnesset i `scripts/` og henvis til det præcise script. Tabellen, der
  afgjorde at odds-loftet skulle væk, stod i koden med en henvisning til et
  script, der ikke indeholdt målingen — den lå i `/tmp` og blev aldrig
  committet. Alle de tal, der *kunne* efterprøves, viste sig at passe, og netop
  derfor stak det ud, at det afgørende ikke kunne.
- **Efterprøv begrundelsen på dét, den rammer — ikke på gennemsnittet.** "Loftet
  har taget point fra spillerne" var sandt for sæsonen og **omvendt** for den
  runde, der skulle omprises: dér bandt loftet næsten ikke, mens den nye
  uafgjort-model gjorde X billigere. En rettelse, der er rigtig i snit, kan
  gøre skade lokalt. Samme fælde som `DRAW_BASE` selv: et gennemsnit kan ikke
  se, om kurven har rigtig form.
- **Én vagt pr. sikkerhedsregel.** To `if (!dryRun)` om samme skrivning betød,
  at den inderste kunne fjernes med hele suiten grøn — den yderste reddede
  den. Saml beslutningen ét sted, så en mutation af den bliver rød.
- **En funktion, der kun kan startes af en tilfældig hændelse, er ikke færdig.**
  `recomputeSeasonElo` kunne kun udløses af, at et resultat ændrede sig, så
  enhver model-ændring lå død, indtil en vilkårlig kamp blev afgjort. Det gjorde
  hver eneste rettelse til en timing-øvelse. Svaret var ikke bedre timing, men
  en knap. Spørg ved nyt maskineri: *hvordan starter jeg det her med vilje?*
- **En funktion, der kun kan fejle tavst, er heller ikke færdig.** Nyt maskineri
  (scheduled functions, triggers, mails, feeds) skal kunne opdages, når det
  fejler — peg på loggen, alarmen eller admin-siden, hvor fejlen ville stå.
  Release Manager spørger efter det; svaret skal findes i planen, ikke opfindes
  ved deployet.
- **"Alle" er sjældent den rigtige modtagerkreds.** Send mail kunne kun indsætte
  alle godkendte brugere — der fandtes intet spil-begreb overhovedet, så et brev
  om Superligaens regler gik også til dem, der aldrig havde været med. Rører en
  udsendelse ét spil, så vælg deltagerne i dét spil.

## Test-kommandoer

**Brug dem herfra, og læs aldrig et grønt testoutput.** En fuld frontend-kørsel
printer 77 KB ≈ 19.000 tokens, hvoraf under en tiendedel er fejl. Det tal er
målt med `scripts/maal-testoutput.mjs`. Det værste er ikke prisen, men at
outputtet ligger i samtalen resten af sessionen og gensendes hver eneste tur —
modsat en underagents kontekst, der kasseres, når den returnerer.

`--silent` fjerner ikke fejlene: hele `Failed Tests`-blokken med
assertion-diffs og fil:linje overlever byte for byte (19.534 B mod 77.129 B,
målt). Derfor logges der til fil, og fejlene læses KUN når exit-koden er rød —
uden at køre suiten igen.

**Men den skjuler ADVARSLER, og det er en bevidst pris.** Ca. 91 % af en grøn
kørsels output var advarsler: ~21 KB React Router future-flags og ~10 KB
`act()`. De forsvinder helt med `--silent`, og da en grøn kørsel ikke længere
læses, ser ingen dem. En `act()`-advarsel kan dække over en ægte asynkron race
i en komponent — det er et diagnostisk signal, vi giver afkald på, ikke bare
støj. Derfor hører de nu til i `/saesoneftersyn`: kør ÉN gang uden `--silent`
og gennemgå advarslerne. Dæmp dem aldrig med et filter i `src/test/setup.js`;
så skjules ægte React-fejl med.

```bash
npx vitest run --silent > /tmp/v.log 2>&1; echo "vitest=$?"; tail -5 /tmp/v.log
sed -n '/Failed Tests/,$p' /tmp/v.log            # kun ved rød — ingen ny kørsel

npm --prefix functions test                      # allerede ren (~1 kB) — IKKE --silent
npm --prefix functions-platform test -- --silent
firebase emulators:exec --only firestore "npm run test:rules" --project demo-vm2026
npx vite build --logLevel error                  # Tour-build
VITE_PLATFORM_MODE=true npx vite build --logLevel error   # platform-build

# Ny knap/felt? Kør fladevagten FØR push — CI fejler ellers med en knap, du ikke vidste var ny:
EVNE_LOG="$PWD/.evne-log" npm run test:coverage
node scripts/flade-vagt.mjs          # skriv en test, der rører elementet — eller en begrundet
                                     # undtagelse i scripts/flade-undtagelser.json (docs/testing.md)
```

**Filtrér ALDRIG hvilke tests der køres, når kørslen skal bære et
"grøn suite"-udsagn.** `vitest --changed` og `vitest related` vælger ud fra
modul-grafen og kan ikke se `firestore.rules`, JSON-fixtures eller de spejlede
filer `src/lib/*.js ⇄ functions*/…js`. De giver exit 0 på en tom udvælgelse.
Det er samme form som "Regler er ikke filtre" — et filter, der ser grønt ud,
fordi det ikke kiggede. Brug dem i den indre løkke, aldrig som det, der går
videre til en rolle eller en PR.

Nye testfiler i `functions/` og `functions-platform/` skal tilføjes til den
eksplicitte `include`-liste i den respektive `vitest.config.js` — ellers køres
de aldrig.
