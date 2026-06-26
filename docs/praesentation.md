# VM 2026 Tipspil — præsentation til direktionen

*En komplet, selvkørende web-tjeneste til en VM-tipkonkurrence, bygget og sat i drift på rekordtid.*

---

## 1. Kort fortalt

Vi har bygget og idriftsat **et færdigt online tipspil til fodbold-VM 2026** på
`vm.vejleaa.dk`. Spillere opretter sig, gætter på alle kampe, får automatisk
point, og følger en live-rangering — både samlet og i private mini-ligaer.
Systemet er **selvkørende**: når en kamp er spillet, indtaster en administrator
blot resultatet, og resten (point, stillinger, slutspil, statistik) opdateres af
sig selv.

**Nøgletal**
- 48 hold · 104 kampe · 12 grupper + slutspil
- Bygget med moderne, gratis-skalerbar teknologi (React + Google Firebase)
- **920 automatiske tests** kører ved hver ændring — alt grønt
- Reel driftsudgift: **~0 kr.** ved den forventede brugermængde

---

## 2. Hvad løsningen kan

**For spillerne**
- Opret konto (godkendes af administrator) og tip på alle kampe
- Point efter præcision: eksakt score giver mest, dernæst målforskel og udfald
- Bonus-spørgsmål (topscorer, gruppevindere) — med **tolerance for stavefejl**
- Live-rangering: samlet stilling, dagens stilling og **private ligaer**
- **Statistik**: hvor mange ramte rigtigt, mest overraskende resultat,
  træfsikkerhed pr. spiller
- Tydelig markering af hvilke kampe man mangler at tippe; tips låses ved kampstart

**For administratoren**
- Godkend brugere og udnævn med-administratorer
- Indtast resultater · sæt bonus-facit (kan godkende alternative stavemåder)
- Godkend og styr ligaer · se en grafisk **test- og kvalitetsoversigt**

---

## 3. Hvordan vi nåede frem — processen

1. **Behovsafklaring først.** Vi startede med målrettede spørgsmål om regler,
   point, login, ligaer og hosting — så vi byggede det rigtige fra start.
2. **Plan før kode.** En klar arkitektur (frontend + database + serverlogik +
   sikkerhedsregler) blev lagt, før første linje kode.
3. **Parallel udvikling med flere "AI-agenter".** Arbejdet blev delt op
   (login/admin, tipning, ligaer/stilling, statistik, tests) og udført parallelt,
   hvilket gav meget høj hastighed uden at gå på kompromis med kvaliteten.
4. **Løbende, små leverancer.** Hver funktion blev bygget, testet, kodegennemgået
   og sat i drift for sig — med fuld sporbarhed i Git/GitHub.
5. **Tæt dialog.** Undervejs har vi tilpasset efter ønsker (rigtige hold fra
   DR's officielle kampprogram, fleksibel pointgivning, ekstra statistik m.m.).

Resultatet er leveret i **27 gennemgåede og testede leverancer (pull requests)** —
hver enkelt automatisk verificeret før den gik i luften.

---

## 4. Hvad systemet gør automatisk — løbende

Dette er kernen i værdien: systemet passer i vidt omfang sig selv.

| Hændelse | Hvad der sker automatisk |
|---|---|
| En administrator indtaster et **kampresultat** | Alle spilleres point beregnes med det samme (server-side, kan ikke snydes) |
| **Gruppespillet** er afgjort | **Slutspillet bygges automatisk** — de rigtige hold sættes ind i 1/16-finalerne, og videre runder propageres |
| Et **resultat rettes** | Point og stillinger genberegnes automatisk |
| **Bonus-facit** sættes (fx topscorer) | Alle bonus-svar scores automatisk — også med tolerance for stavefejl |
| En **kamp starter** (kickoff) | Tips låses automatisk, så ingen kan ændre bagklogt |
| Når som helst | **Rangeringer og statistik opdateres live** på alle skærme |
| Ny **kode ændres** | **920 tests + sikkerhedstjek kører automatisk**, og koden afvises hvis noget fejler |
| Ugentligt | **Afhængigheder tjekkes automatisk** for opdateringer og sikkerhed |

Den menneskelige indsats i drift er reduceret til ét: **indtast resultatet** efter
hver kamp. Alt andet sker af sig selv.

---

## 5. Kvalitet, sikkerhed og drift

- **Kvalitetssikring i verdensklasse:** 920 automatiske tests dækker hele
  brugerfladen og al pointlogik. Intet kommer i luften, uden at testene er grønne.
  Administrator kan se en grafisk oversigt over alle tests og systemets opbygning.
- **Sikkerhed:** Al point- og resultatlogik kører på serveren og kan ikke
  manipuleres fra browseren. Adgangsregler sikrer, at man fx ikke kan se andres
  tips før kampstart, og at kun administratorer kan godkende brugere og indtaste
  resultater.
- **Drift & økonomi:** Hostet på Googles Firebase-platform, der skalerer
  automatisk og er gratis ved vores forventede størrelse. Ingen servere at passe.
- **Automatisk udrulning:** Nye versioner sættes i drift med ét tryk; alt er
  versionsstyret og kan rulles tilbage.

---

## 6. Udviklingsindsats i tal

Hele løsningen blev bygget og sat i drift over **3 dage (2.–4. juni 2026)**.

| Mål | Tal |
|---|---|
| Leverancer (pull requests, hver testet & kodegennemgået) | **27** |
| Commits | **40** |
| Kildefiler / testfiler | **66 / 40** |
| Linjer kode (frontend) + Cloud Functions | **~16.300** |
| Automatiske tests | **920** |
| Specialiserede AI-agenter kørt parallelt | **8** |
| Rapporteret agent-beregning | **~685.000 tokens · ~78 min** (kørte delvist samtidigt → kortere kalendertid) |

> **Note om forbrug:** Det præcise *samlede* token- og tidsforbrug for hele
> forløbet (inkl. dialogen) aflæses i Claude Codes forbrugsoversigt. Tallene
> ovenfor er de dele, der kan dokumenteres direkte fra projektet og fra de
> specialiserede agenters egne rapporter.

**Perspektiv:** En tilsvarende løsning ville traditionelt tage et lille
udviklingsteam **uger**. Her er den leveret på dage, med en testdækning og en
driftsautomatik, der ligger over normalen for et projekt af denne størrelse.

---

## 7. Status og næste skridt

- **Status:** Live og klar. Hold, kampe og tidspunkter er indlæst fra det
  officielle program. Konkurrencen kan åbnes for spillere med det samme.
- **Mulige udvidelser:** flere statistik-typer, "ugens spiller", e-mail-notifi­
  kationer, sponsor-/branding-elementer — kan tilføjes hurtigt på det samme
  fundament.

**Bundlinje:** Et professionelt, testtungt og selvkørende produkt, leveret hurtigt
og billigt i drift — klar til VM.
