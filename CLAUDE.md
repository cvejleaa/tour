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

Dertil én rolle, der **kun** køres når ændringen kalder på det:

| Rolle | Køres når ændringen rører |
|---|---|
| **Security Reviewer** | `firestore.rules`, `functions*/`, auth, invitationer, liga-tilmelding — eller noget andet, der afgør hvem der ser hvad |

Den er med vilje ikke fast. En sikkerhedsgennemgang af en tekstrettelse lærer
ingen noget, og en rolle, der altid siger "ser fint ud", holder man op med at læse.

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
2. **Commit FØRST, kør så Test Manager og Quality Control parallelt** — plus
   Security Reviewer, hvis ændringen rører adgang. Ret det, de finder.
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
6. Verificér i produktion, og fortæl brugeren hvad der er live.

Undtagelserne fra trin 5, hvor der **stadig** spørges først: alt der skriver i
produktionsdata (bagfyldninger, migreringer, `seedGames`/`seedSuperliga`),
tilbagerulninger, og udrulninger med et blokerende fund fra en rolle.

## Sæsoneftersyn

Rollerne kigger på én ændring ad gangen. Det, der vokser stille **mellem**
ændringerne — forbrug, bundle, forældede afhængigheder, dokumentation der er
drevet fra virkeligheden — ser ingen af dem.

Kør derfor `/saesoneftersyn` før hver ny sæson, eller ca. hver anden måned.
Aldrig midt i en aktiv runde. Kommandoen ligger i
`.claude/commands/saesoneftersyn.md`.

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
- **"Alle" er sjældent den rigtige modtagerkreds.** Send mail kunne kun indsætte
  alle godkendte brugere — der fandtes intet spil-begreb overhovedet, så et brev
  om Superligaens regler gik også til dem, der aldrig havde været med. Rører en
  udsendelse ét spil, så vælg deltagerne i dét spil.

## Test-kommandoer

```bash
npx vitest run                                   # frontend
npm --prefix functions test                      # Tour-functions
npm --prefix functions-platform test             # platform-functions
firebase emulators:exec --only firestore "npm run test:rules" --project demo-vm2026
npm run build                                    # Tour-build
VITE_PLATFORM_MODE=true npm run build            # platform-build
```

Nye testfiler i `functions/` og `functions-platform/` skal tilføjes til den
eksplicitte `include`-liste i den respektive `vitest.config.js` — ellers køres
de aldrig.
