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

**Kun platformen:** 🗓️ Spil-tidsplan · 🎨 Hold-farver og navne · 🔔 Påmindelser · 🤖 Runde-Botten · 🧑‍🤝‍🧑 Liga-medlemmer · 🩺 Driftstatus

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
  giv gerne tid til at få spillere med. **Men aldrig senere end runde 3:**
  ligaer med senere startrunde tæller ikke puljebonussen med (den blev tippet
  før deres start), så en deadline efter runde 3 ville tage bonuspoint fra
  ligaer, der ellers kunne have været med.

  Et spil kan i stedet få deadlinen **udledt af en runde** (`puljeLockRound` i
  `scripts/games.mjs` — sådan er Premier League sat op): så sættes bonus-
  deadlinen automatisk til det **tidligste kickoff i den runde**, og den følger
  med, hvis kampen flyttes. Den udledes ved kickoff-synken, så efter en seed af
  et sådant spil skal du køre **🗓️ Synk kamptider nu** (eller vente på det
  daglige job), før deadlinen står — indtil da viser pulje-fanen "Endnu ikke
  åbnet". En passeret deadline skubbes aldrig ud i fremtiden igen, selv om en
  kamp flyttes frem — så puljen ikke kan genåbnes, efter alle har set
  hinandens tip.
- **🏁 Status** er spillets livscyklus og et bevidst valg — den følger *ikke*
  automatisk starttidspunktet eller sidste kamp:

  | Status | Betyder |
  |---|---|
  | **Åben** | Kan tilmeldes. Spillerne kan også forlade spillet igen — og et forladt spil tager point og liga-medlemskab med sig. |
  | **I gang** | Forlad-knappen er væk. Påmindelser sendes — medmindre de er sat på pause under 🔔 Påmindelser. |
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
  i det næste døgn. Kampe før spillets start tælles ikke med. Sender du, mens
  SMTP er nede, får du besked om **hvor mange** der slog fejl — ikke et grønt
  "Sendte 0".
- **⏸ Sæt påmindelser på pause** er et **nødstop pr. spil**: den standser KUN
  det daglige 09.00-job for netop dét spil. Resultat-synk, pointafregning og
  Runde-Botten kører videre, og *Send påmindelser nu* virker stadig i hånden.
  Brug den ved fx en dobbeltsending eller et testspil — ikke som sæsonværktøj:
  spillerne får ingen besked om, at mailen udebliver, så en glemt pause koster
  dem en deadline. Derfor står pausen på **Admin → 🩺 Driftstatus**, og kortet
  bliver **rødt**, hvis der er kampe inden for det næste døgn, mens pausen er
  slået til. Knapperne er slået fra for spil, jobbet alligevel springer over
  (kræver status Åbent eller I gang).
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

## Liga-medlemmer (platformen)

Meld en spiller ind i eller ud af en privat liga i et spil. Vælg først spillet.

**Læs dette, før du melder nogen IND.** En tilmelding afslører **hele spillets
tip-historik begge veje** — ikke kun kommende kampe. Den, du melder ind, kan se
alt, hvad ligaen tidligere har tippet, og ligaen kan se alt, hvad han har
tippet. Det gælder med tilbagevirkende kraft, fordi medlemskabet spejles ned på
hvert enkelt tip. Dialogen siger det, men beslutningen er truffet, før du
klikker.

Spilleren behøver ikke være med i spillet i forvejen — han bliver tilmeldt og
godkendt automatisk, præcis som når nogen indløser en liga-kode. En
liga-invitation ER en invitation til spillet.

**Når du melder nogen UD:**

- Han mister adgangen til ligaens tips og til ligavæggen.
- Er det hans eneste liga i spillet, ser han en **tom stilling uden
  fejlbesked** — sig til ham, at han skal med i en anden liga.
- Hans egne opslag på ligavæggen **bliver stående**.
- **Ingen point går tabt.** Han kan meldes ind igen, og alt er som før.

**Ligaens ejer kan ikke fjernes.** Skal ligaen væk, sletter ejeren den selv —
en ejerløs liga er en tilstand, ingen flade kan rette.

En **afvist** bruger kan ikke meldes ind, men kan godt meldes ud. Det er med
vilje: afvisningen skal kunne følges op af en oprydning.

## Send mail (ejer)

- Vælg spil og liga → tilmeldingslinket hentes automatisk.
- **🏁 Tilbageblik** henter slutstillingen fra en gammel liga i Tour eller VM;
  **Indsæt top 5** skriver den ind i teksten. Kræver, at eksport-workflowet er
  kørt, se [drift.md](drift.md).
- **📸 Brug invitations-skabelonen** pakker teksten ind i et layout med
  skærmbilleder og en ét-kliks-tilmeldingsknap.
- **Formatering og billeder i den rene mail:** når skabelonen er slået FRA
  (den rene tekstmail), står der en værktøjslinje over beskeden: **F** (fed),
  **K** (kursiv), **🔗 Link**, **H** (overskrift), **• Liste**, **🖼️ Billed-URL**
  og **📷 Upload billede**. Teksten skrives som let Markdown (`**fed**`,
  `*kursiv*`, `[tekst](https://…)`, `- punkt`, `## overskrift`,
  `![](https://…)`), og en **forhåndsvisning** under feltet viser præcis, hvad
  modtageren får, når billederne er hentet. Billeder skal være **https**;
  uploadede billeder gemmes med et unikt navn (ellers ville Gmails billed-cache
  vise et gammelt billede i en ny mail). Værktøjerne vises IKKE på
  invitations-/salgstale-skabelonens intro — den er bevidst ren tekst, så din
  personlige hilsen ikke bliver til endnu et reklamebrev oven på skabelonen.
- Mails logges under **✉️ Mail-log** med tidspunkt, type, modtager og status.

## Resultater

Resultater hentes automatisk for **både Superligaen** (`api.superliga.dk`) og
**Premier League** (ligaens eget API): et minut-job følger kampene i
kampvinduet, og et times-sweep samler op bagefter. Kamptiderne rettes dagligt
kl. 6.10 fra samme kilder. Når et facit sættes, sker der tre ting af sig selv:
alle tips på kampen scores, holdenes Elo og fremtidige odds opdateres, og —
hvis det var rundens sidste kamp — poster Runde-Botten et resumé på
liga-væggene. Kører en synk skævt, står det på **Admin → 🩺 Driftstatus** —
du skal ikke sætte PL-facit i hånden.

Vil du ikke vente på næste automatiske kørsel (fx efter en strandet-alarm,
eller om natten og formiddagen, hvor times-sweep'et holder pause), findes
**⬇️ Synk resultater nu** under **Admin → 🗓️ Spil-tidsplan** på hvert synket
spil. Den
gør præcis det samme som automatikken — hele sæsonen tjekkes, og nye facit
afregner point og kan få Runde-Botten til at poste **med det samme**. Melder
den "intet manglede", har kilden ikke facit endnu: så er hånd-vejen nedenfor
svaret.

Står kampkortene med **⏸ Opdatering afbrudt**, mens en kamp kører, er det
kun den *levende* stilling, der er gået i stå — facit og point kommer stadig.
Kig på **Admin → 🩺 Driftstatus**: er der en alarm om, at live-pulsen står
stille, er det serveren, og fejlen står på minut-kortet. Er der ingen alarm,
er pulsen frisk, og det er din egen forbindelse — genindlæs siden. Alarmen
bliver stående, til du kvitterer — også når udfaldet for længst er ovre, for
ellers ville et udfald, der helede sig selv, slette sit eget spor.

Er noget gået galt, kan du sætte facit manuelt; point genberegnes ved hver
ændring. Bemærk: **fjerner** du et facit igen, nulstilles pointene ikke
automatisk.

### Halvleg, målscorere og tilskuertal

Under slutresultatet på kampkortet står **stillingen ved pausen**, og under
kortet står **hvem der scorede** og **hvor mange der var på stadion**. De tal
kommer fra en helt anden kilde end resultaterne og hentes, så snart facit er
landet (minut-synken tager de netop afgjorte kampe; times-sweep'et samler op)
— derfor kan et kort i et par minutter have facit uden endnu at have detaljerne.

**De kan ikke ændre point.** Synken har ikke lov til at røre facit, målene
eller kickoff-tiden; den skriver kun de nye felter. Du behøver altså ikke
tænke over, hvornår du trykker.

Mangler de på en kamp, der ellers er afgjort, er der to muligheder: enten er
de ikke nået frem endnu, eller også er de to kilder **uenige om, hvordan
kampen endte** — og så viser vi hellere ingenting end noget forkert. Det sker
typisk ved afbrudte kampe med et tildelt resultat. Vil du ikke vente, findes
**⚽ Synk kampdetaljer nu** samme sted som ⬇️ Synk resultater nu. Den siger
selv, hvor mange der blev hentet, og hvor mange kilden var uenig om.

## Hvis noget ser forkert ud

Se fejlsøgningstabellen i [drift.md](drift.md) — den dækker tom stilling,
manglende runder, manglende point og udeblevne mails.
