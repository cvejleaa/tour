# Arbejdsgang for dette repo

Læs [README.md](README.md) først — den forklarer, at ét repo bygger to apps.
Dette dokument handler om **hvordan** vi arbejder, ikke hvad koden gør.

## De tre faste roller

**Hver eneste ændring i spillet skal igennem alle tre**, før den landes.
De er defineret som agenter i `.claude/agents/` og køres parallelt, når
ændringen er skrevet færdig og valideret lokalt:

| Rolle | Spørger | Kan blokere for |
|---|---|---|
| **Test Manager** | Er ændringen bevist? Ville testen fejle uden rettelsen? | at lande uden dækning |
| **Quality Control Manager** | Løser den det rigtige problem — og hvad rører den ellers ved? | at lande med en halv rettelse |
| **Release Manager** | Hvad skal deployes, i hvilken rækkefølge, og hvad tjekkes bagefter? | en forkert udrulning |

Dertil én rolle, der **kun** køres når ændringen kalder på det:

| Rolle | Køres når ændringen rører |
|---|---|
| **Security Reviewer** | `firestore.rules`, `functions*/`, auth, invitationer, liga-tilmelding — eller noget andet, der afgør hvem der ser hvad |

Den er med vilje ikke fast. En sikkerhedsgennemgang af en tekstrettelse lærer
ingen noget, og en rolle, der altid siger "ser fint ud", holder man op med at læse.

De er ikke en formalitet. Hver rolle har blokeret noget ægte:
en grøn test, der ikke kunne fange fejlen; en rettelse, der kun lukkede
symptomet; og en regel-udrulning, der ville have vist alle en tom stilling.

**Undtagelser:** rene tekstrettelser i `docs/` uden kodeændring. Alt andet —
også "bare en lille fejlrettelse" — skal forbi alle tre. Det var netop en
"lille" ændring, der spærrede alle migrerede brugere ude fra deres egen profil.

Rapportér deres konklusioner til brugeren, før du merger. Er en rolle uenig,
så løs det først eller sig klart, hvad du lander med og hvorfor.

## Rækkefølgen i praksis

1. Skriv ændringen. Kør lokalt: `npm run lint`, relevante tests, `npm run build`.
2. **Kør de tre roller** — plus Security Reviewer, hvis ændringen rører adgang.
   Ret det, de finder.
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
