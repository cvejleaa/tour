# Admin-vejledning

Daglig drift. Fanerne skifter efter hvilken app du er logget ind på —
**platformen** (tip.vejleaa.dk) og **Tour** (tour.vejleaa.dk) har hver deres sæt.

## Roller
| Rolle | Udpege admins | Godkende brugere | Spil, resultater, mails | Tippe |
|---|:---:|:---:|:---:|:---:|
| **Ejer** (dig) | ✅ | ✅ | ✅ | ✅ |
| **Global admin** | ❌ | ✅ | ✅ | ✅ |
| **Liga-admin** (pr. liga) | ❌ | ❌ | kun ligaens egne spørgsmål, medlemmer og navn | ✅ |
| **Spiller** | ❌ | ❌ | ❌ | ✅ |

Udnævn globale admins under **Admin → Brugere → ↑ Til global admin** (kun ejer).
Liga-admin følger med at have oprettet ligaen.

## Faner

**Begge apps:** Brugere · Tests · ✉️ Mail-log · 📈 Aktivitet · 📣 Send mail (ejer)

**Kun platformen:** 🗓️ Spil-tidsplan · 🎨 Hold-farver og navne · 🔔 Påmindelser · 🤖 Runde-Botten · 🩺 Driftstatus

**Kun Tour:** 🚴 Tour · 🏷️ Ryttertyper · Bonus · Ligaer · 📋 Køreplan · ⚙️ Indstillinger

## Brugere

- **Godkend nye spillere:** nye brugere lander som *afventer*. **Godkend** eller
  **Afvis** i listen. Brug **Godkend alle**, når en invitationsrunde vælter ind.
- **Login-metode** vises pr. bruger: E-mail, Google eller ❔ Ukendt (ældre
  konti, hvor metoden ikke er registreret).
- **🔑 Nulstil kodeord** (ejer): sender et nulstillingslink via egen SMTP, som
  leverer mere pålideligt end Firebases egen mail. Linket vises også, så du kan
  sende det manuelt.
- **✏️ Skift e-mail** (ejer): ændrer Auth-kontoen og kontakt-mailen med det
  samme, uden bekræftelsesmail. En Google-konto logger dog stadig ind med sin
  Google-adresse.
- **🗑️ Slet** (ejer): fjerner brugeren fra **dette** projekt. Sletter man på
  platformen, rører det ikke tour-85928 eller vm2026-tip — de er adskilte
  Firebase-projekter med hver sine konti.

## Spil-tidsplan (platformen)

- **Starttidspunkt** afgør, hvornår spillet tæller fra. Kampe før det vises
  ikke, giver ingen point og udløser ingen påmindelser — så en sæson kan starte
  midt i, fx fra runde 2.
- **Bonus-deadline** lukker pulje-tippet. Den behøver ikke ligge før runde 1;
  giv gerne tid til at få spillere med.
- **🏁 Status** er spillets livscyklus og et bevidst valg — den følger *ikke*
  automatisk starttidspunktet eller sidste kamp:

  | Status | Betyder |
  |---|---|
  | **Åben** | Kan tilmeldes. Spillerne kan også forlade spillet igen — og et forladt spil tager point og liga-medlemskab med sig. |
  | **I gang** | Forlad-knappen er væk. Påmindelser sendes. |
  | **Afsluttet** | Ude af "Åbne spil — deltag" og af 🔔 Påmindelser-fanen, og det daglige påmindelses-job springer spillet over. Stilling og historik kan stadig ses, og du kan stadig rette facit og genberegne. |

  Et **eksternt** spil (fx Touren, der kører i sin egen app) bliver stående på
  oversigten som link-ud, også når det er afsluttet — bare med grå etiket.
  Statussen findes kun på platformen; tour.vejleaa.dk ser uændret ud.
- **👁️ Vis spillet / 🙈 Skjul spillet** styrer, om spillet står under "Åbne
  spil — deltag". Knappen virker **med det samme** — Gem rører den ikke, og
  den ændrer ikke status. Den vises kun på spil, hvor synligheden betyder
  noget: et **eksternt** spil vises altid som link-ud, og et **afsluttet** spil
  er altid ude af oversigten, uanset hvad feltet står til.

  **Skjul et nyt spil, før det seedes.** Det gøres i `scripts/games.mjs` med
  `joinable: false` på spillets række — Premier League-spillet er oprettet
  sådan. Feltet er admin-ejet, så listen bestemmer **kun** ved oprettelsen: har
  du først afsløret spillet, skjuler en senere seed-kørsel det ikke igen. Der
  er ingen automatik, der gør det for dig; opretter du et nyt spil uden
  `joinable: false`, ligger det på forsiden i samme sekund, det seedes.

  **Skjult betyder kun "ikke annonceret" — ikke hemmeligt.** Spillet ligger i
  enhver godkendt brugers spil-liste (appen henter hele listen), kampene kan
  læses af alle godkendte, og den der kender adressen kan **tilmelde sig**.
  `joinable` findes ikke i sikkerhedsreglerne og er ikke en spærring. Spillere,
  der allerede er tilmeldt, beholder desuden spillet under "Mine spil" — skjul
  fjerner det kun fra tilbuddet til dem, der ikke er med endnu.

  **Gennemgang kræver, at du tilmelder dig.** En ikke-tilmeldt ser kun et
  Deltag-kort på `/spil/{spil-id}` — alle faner (Tip, Tabel, Elo, Guide) ligger
  bag tilmeldingen. Meld dig selv til det skjulte spil, gennemgå kampene, og
  klik derefter **👁️ Vis spillet**.
- **🔄 Genberegn point efter start-ændring** — kør den, når du har flyttet
  starttidspunktet, så tidligere runders point forsvinder fra totalerne straks.
- **💰 Ompris kampene** — kør den, når **odds-modellen** er ændret (uafgjort,
  Elo, gulv/loft). Odds er frosne på hver kamp og skrives normalt kun om, når
  et resultat lander; uden knappen ligger en model-rettelse død, indtil en
  tilfældig kamp bliver afgjort. Den viser **altid en tør-kørsel først** med
  før/efter for hver kamp — skrive-knappen dukker først op, når du har set
  listen. Låste og spillede kampe røres ikke.
  **Vigtigt:** allerede afgivne tips på de omprisede kampe afregnes til de
  NYE odds, også Chancen. Ompriser du midt i en runde, så sig det til
  spillerne, mens de stadig kan nå at rette deres tip.
- **🔐 Genopbyg liga-adgang til stillingen** — kun nødvendig, hvis stillingen
  står tom. Se [drift.md](drift.md).

## Påmindelser (platformen)

- **🔔 Send påmindelser nu** mailer de spillere, der mangler at tippe på kampe
  i det næste døgn. Kampe før spillets start tælles ikke med.
- **Liga-spørgsmålene** har deres egen svar-status: knappen **🔎 Hvem mangler
  at svare?** bor på ligaens kort under spillets 👥 Ligaer-fane (alle
  medlemmer kan se den — ikke kun her i admin), for spørgsmålene ejes af
  liga-ejeren, ikke af platformen.
- **🎯 Hvem mangler at tippe?** viser pr. runde hver deltagers dækning (fx
  4/6) og hvilke kampe der mangler — men aldrig *hvad* der er tippet: du
  spiller selv med, så 1X2-valg er skjult, til kampen er gået i gang. Kortet
  siger også, hvor mange *Send påmindelser nu* rammer lige nu (knappen rykker
  kun for kampe i det næste døgn, ikke for hele runden). En manglende kamp
  med passeret kickoff står som "nåede det ikke" — der er ingen at rykke.
- **🎖️ Pulje-status** viser, hvem der mangler at afgive pulje-tip, og
  **📣 Ryk dem der mangler** sender en mail til netop dem. Knappen forsvinder,
  når puljen er låst.
## Runde-Botten (platformen)

Botten skriver et opslag på hver **ligavæg**, når rundens sidste kamp er
afregnet — resultater, stillingen og Chancens gevinster og tab (den driller
kærligt, men må aldrig håne en lille indsats eller hænge nogen ud for et tab). Den lå før under Påmindelser, men en påmindelse tikker ind til dig,
mens botten skriver et sted, alle kan læse — derfor sin egen fane.

- **🧪 Forhåndsvis runde-opslag** genererer teksten uden at poste. Du får ét
  kort **pr. liga**: hver liga hører kun om sine egne medlemmer.
- **Post runde-opslag nu** lægger den på alle liga-vægge — kun én gang pr.
  runde. Normalt kører den selv efter rundens sidste kamp.
- **Liga-spørgsmålene afslører botten også**: når liga-ejeren sætter facit,
  poster den svar, vindere og point på **den** ligas væg — én gang pr.
  spørgsmål, og kun ved mindst 2 svar. Mangler opslaget, har liga-ejeren
  🤖-knapperne (Forhåndsvis/Post) på selve spørgsmålet under spillets
  👥 Ligaer-fane. De bor dér og ikke her, fordi forhåndsvisningen viser
  svarene — og dem må kun ligaens medlemmer se.

De allerførste opslag blev bygget af hele spillets felt og nævnte derfor
spillere fra andre ligaer. De blev taget ned den 5. august 2026 med et
engangs-panel, der er fjernet igen. De ramte beskeder bærer stadig felterne
`oprindeligTekst` og `rettetAt` — se [drift.md](drift.md), hvis en af dem
skal gendannes.

## Send mail (ejer)

- Vælg spil og liga → tilmeldingslinket hentes automatisk.
- **🏁 Tilbageblik** henter slutstillingen fra en gammel liga i Tour eller VM;
  **Indsæt top 5** skriver den ind i teksten. Kræver, at eksport-workflowet er
  kørt, se [drift.md](drift.md).
- **📸 Brug invitations-skabelonen** pakker teksten ind i et layout med
  skærmbilleder og en ét-kliks-tilmeldingsknap.
- Mails logges under **✉️ Mail-log** med tidspunkt, type, modtager og status.

## Resultater

Superliga-resultater hentes automatisk fra `api.superliga.dk` hvert kvarter i
kampvinduet. Når et facit sættes, sker der tre ting af sig selv: alle tips på
kampen scores, holdenes Elo og fremtidige odds opdateres, og — hvis det var
rundens sidste kamp — poster Runde-Botten et resumé på liga-væggene.

Er noget gået galt, kan du sætte facit manuelt; point genberegnes ved hver
ændring. Bemærk: **fjerner** du et facit igen, nulstilles pointene ikke
automatisk.

## Hvis noget ser forkert ud

Se fejlsøgningstabellen i [drift.md](drift.md) — den dækker tom stilling,
manglende runder, manglende point og udeblevne mails.
