# Admin-vejledning

Daglig brug af tippekonkurrencen for administratorer.

## Roller
| Rolle | Udpege/fjerne admins | Godkende brugere | Kampe, resultater, bonus, ligaer, config | Tippe som spiller |
|---|:---:|:---:|:---:|:---:|
| **Ejer** (dig) | ✅ | ✅ | ✅ | ✅ |
| **Global admin** | ❌ | ✅ | ✅ | ✅ |
| **Liga-admin** (pr. liga) | ❌ | ❌ | kun ligaens bonus + medlemmer/navn | ✅ |
| **Spiller** | ❌ | ❌ | ❌ | ✅ |

- **Global admin** har fuld daglig adgang (godkende brugere, kampe, resultater,
  bonus-facit, ligaer, indstillinger) — men **kun du (ejer)** kan udpege/fjerne
  admins. Udnævn dem under **Admin → Brugere** med **↑ Til global admin**.
- **Liga-admin** udpeges pr. liga (på ligaens side) og kan kun styre den ligas
  **bonusspørgsmål**, medlemmer og navn — ikke scoring/format.

> Bemærk: Den tidligere **kamp-admin**-rolle er fjernet (resultater opdateres nu
> automatisk). Evt. gamle kamp-admins mister automatisk deres rettigheder og kan
> sættes til **spiller** eller **global admin** under **Admin → Brugere**.

## Mail-log
**Admin → ✉️ Mail-log** viser de seneste udsendte mails (påmindelser, kodeord-
nulstilling m.m.) med tidspunkt, type, modtager, emne og status (sendt/fejl).
Logges automatisk hver gang systemet sender en mail. Synlig for globale admins.

## Nulstil en spillers adgangskode
Hvis en spiller ikke modtager Firebase' egen nulstillingsmail (den havner ofte i
spam eller blokeres af visse udbydere som Outlook/Hotmail):
- **Admin → Brugere** → find spilleren → **🔑 Nulstil kodeord** (kun ejeren).
- Et nulstillingslink genereres og sendes via **vm@vejleaa.dk** (jeres egen
  SMTP, som leverer pålideligt). Du får også selve linket vist, så du kan sende
  det manuelt (fx SMS) hvis det skulle være nødvendigt.

## Godkend nye spillere
1. Nye brugere lander i status **afventer**.
2. **Admin → Brugere** viser ventelisten. Tryk **Godkend** (eller **Afvis**).
3. Godkendte spillere kan straks logge ind og tippe.

## Indtast resultater
1. **Admin → Kampe & resultater**.
2. Find kampen, skriv slutresultatet (mål for hjemme/ude) og tryk **Gem resultat**.
3. For **knockout-kampe** angiver du også **hvem der gik videre** (håndterer
   forlænget tid/straffe).
4. Point til alle spillere beregnes automatisk med det samme.

> **Resultater opdateres normalt automatisk** fra football-data.org under kampe.
> Mangler der resultater for ældre, færdigspillede kampe, så brug **Admin →
> Kampe → 🗓 Synk alle resultater** (henter for alle uafsluttede kampe, ikke kun
> de igangværende). **🕐 Tjek kamptider** retter forskudte kickoff-tider.

## Byg slutspillet
- Når **alle** gruppekampe har resultat, tryk **Byg slutspil**.
- Systemet udregner grupperangeringen og sætter de rigtige hold ind i
  1/16-finalerne (og senere runder, efterhånden som resultater indtastes).
- Først når holdene i en knockout-kamp er kendt, kan spillerne tippe på den.

## Bonus-facit
- **Admin → Bonus**: sæt det korrekte svar på topscorer og hver gruppevinder,
  når det er afgjort. Bonuspoint (10 pr. korrekt) tildeles automatisk.
- For **topscorer** kan du trykke på knappen **⚽ \<navn\>** (den nuværende fører
  fra football-data) for at indsætte facit automatisk — bekræft med **Gem**.
- Bonus-spørgsmål låses for spillerne ved deadline (den første relevante kamps
  kickoff), så ingen kan svare bagklogt.

## Topscorer-ræs (Golden Boot)
- Turneringens topscorere hentes automatisk fra football-data.org hver 30. minut
  og vises på **Statistik → Hele turneringen** ("Kapløbet om guldstøvlen").
- Under **Admin → Kampe & resultater** kan du:
  - **⚽ Opdater topscorere** — hent listen nu (i stedet for at vente på automatikken).
  - **📋 Opdater kampdetaljer** — hent mål, kort og opstillinger for kampe i vinduet.
  - **🔍 Tjek football-data felter** (kun ejer) — se præcis hvilke felter jeres
    football-data.org-abonnement (tier) giver adgang til: topscorere, stilling/form
    og kampdetaljer (målscorere, kort, straffesparkskonkurrence, indbyrdes opgør).
    Brug det til at beslutte, hvilke ekstra data vi kan bygge videre på.

## Kampdetaljer (mål, kort, opstillinger)
- Under kampe hentes mål, kort og startopstillinger automatisk fra football-data.org
  (hver 2. minut for kampe der snart starter, er live eller netop er afsluttet).
- Vises på hvert **kampkort**: et mål-feed ("23' ⚽ scorer (assist)"), gule/røde kort,
  halvleg/straffe/tilskuertal, og en udfoldelig **opstilling** pr. hold.
- **Statistik → Hele turneringen** viser også **Disciplin** (flest kort pr. hold/spiller).
- **Turnering → Grupper** viser den **officielle FIFA-stilling** med form-stime
  (synket fra football-data.org; opdater manuelt med **📊 Opdater stilling**).

## Forhåndsvisning (kontrolside)
Under **Admin → 🔮 Forhåndsvisning** kan du hente ægte data fra en aktiv turnering
(fx **Bundesliga 2025/26**) og se præcis, hvordan topscorer-ræs, stilling med form
og kampdetaljer kommer til at se ud — allerede før VM går i gang. Vælg turnering,
tryk **Hent forhåndsvisning**. Intet gemmes i databasen.

## Pointmodel (til reference)
| Situation | Point |
|---|---|
| Eksakt score | 5 |
| Korrekt udfald + målforskel | 3 |
| Korrekt udfald | 2 |
| Forkert | 0 |
| Knockout: korrekt videregående hold | +2 |
| Bonus | 10 pr. korrekt |

## Tips
- Resultater kan rettes; point genberegnes automatisk ved hver ændring.
- Rangeringen (samlet + dagens) opdateres live for alle spillere.
