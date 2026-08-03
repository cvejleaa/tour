---
description: Sæsoneftersyn — periodisk gennemgang af sikkerhed, forbrug, afhængigheder, dokumentation og testsuite. Køres før en ny sæson eller ca. hver anden måned.
---

# Sæsoneftersyn

De tre faste roller kigger på **én ændring ad gangen**. Der findes en anden slags
problemer, som ingen af dem nogensinde ser: dem der vokser stille frem mellem
ændringerne. Et forbrug der er tredoblet. En afhængighed to majors bagud. En
dokumentation der beskriver en app, vi ikke har mere.

Det er dét, dette eftersyn er til. Kør det **før en ny sæson starter**, eller
ca. hver anden måned. Aldrig midt i en aktiv runde — flere af punkterne
inviterer til ændringer, og en spilaften er det forkerte tidspunkt.

## Sådan kører du det

Gennemgå de syv punkter herunder. Undersøg reelt — gæt ikke. Slut med **én
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

### 2. Bundle og indlæsningstid

```bash
npm run build && VITE_PLATFORM_MODE=true npm run build
```

Kig på chunk-størrelserne. Er noget tungt havnet i hovedbundtet igen, eller er
en side, der burde være `React.lazy`, blevet importeret direkte et sted? Sig
hvad der er vokset siden sidst, ikke bare hvad der er stort.

### 3. Afhængigheder

```bash
npm run deps:check
npm audit --omit=dev
```

Se også, om der ligger åbne Dependabot-PR'er og samler støv. Skil reelle
sårbarheder fra støj: en advarsel i et build-værktøj rammer ikke spillerne.
Se `docs/maintenance.md` — majors tages én ad gangen.

### 4. Dokumentations-drift

Den farligste form for forældet dokumentation er den, der ser rigtig ud.
Stikprøv: passer `README.md` og `docs/architecture.md` stadig på datamodellen?
Beskriver `docs/admin-guide.md` de faner, der faktisk findes? Henter
`FootballHelp.jsx` stadig de rigtige tal fra scoring-koden?

Historiske dokumenter (statusrapporter, gamle reviews) skal være **mærket som
historiske**, ikke rettet — de er et referat af et tidspunkt.

### 5. Fuld sikkerhedsgennemgang

Kør **Security Reviewer**-agenten på hele overfladen, ikke kun på en diff:
`firestore.rules`, alle callables i begge functions-kodebaser, invitations- og
liga-flowet, admin-rettighederne. Bed eksplicit om kontroltests, så vi ved,
opsætningen virker.

Tjek også de rigtige data: er der spillere med roller, de ikke skal have
længere? Invitationskoder der aldrig blev brugt op? Konti fra sidste sæson, som
stadig er `approved`?

### 6. Testsuitens sundhed

```bash
npx vitest run
npm --prefix functions test
npm --prefix functions-platform test
firebase emulators:exec --only firestore "npm run test:rules" --project demo-vm2026
```

Alle fire skal køre. Spørg derudover:

- Ligger der testfiler, som **ikke** står i `include`-listen i
  `functions*/vitest.config.js` og derfor aldrig køres?
- Er noget blevet flaky (`Date.now()` uden fastfrysning, rækkefølgeafhængighed)?
- Er der kode, der er blevet forretningskritisk siden sidst, uden at dækningen
  fulgte med?

### 7. Backlogget

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
