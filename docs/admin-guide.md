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

**Kun platformen:** 🗓️ Spil-tidsplan · 🎨 Hold-farver · 🔔 Påmindelser

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
- **🔄 Genberegn point efter start-ændring** — kør den, når du har flyttet
  starttidspunktet, så tidligere runders point forsvinder fra totalerne straks.
- **🔐 Genopbyg liga-adgang til stillingen** — kun nødvendig, hvis stillingen
  står tom. Se [drift.md](drift.md).

## Påmindelser (platformen)

- **🔔 Send påmindelser nu** mailer de spillere, der mangler at tippe på kampe
  i det næste døgn. Kampe før spillets start tælles ikke med.
- **🎖️ Pulje-status** viser, hvem der mangler at afgive pulje-tip, og
  **📣 Ryk dem der mangler** sender en mail til netop dem. Knappen forsvinder,
  når puljen er låst.
- **🤖 Runde-Botten** kan køres manuelt med tør-kørsel, så du kan se teksten,
  før den postes. Normalt kører den selv efter rundens sidste kamp.

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
