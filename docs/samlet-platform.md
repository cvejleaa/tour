# Samlet tippeplatform på tip.vejleaa.dk

Plan for at samle VM 2026-tippen (`cvejleaa/vm`) og Tour-tippen (`cvejleaa/tour`)
i én platform, hvor en spiller **opretter sig én gang** og derefter selv vælger,
hvilke spil de vil se eller deltage i. Fremtidige spil oprettes som data — ikke
som nye apps eller nye Firebase-projekter.

**Besluttet:** Vi venter med selve migreringen til begge sommerens spil er
afsluttet (VM slutter 19/7, Tour slutter 26/7 2026), men forbereder alt nu.

---

## 1. Hvorfor

I dag kører de to spil på hver sit Firebase-projekt (`vm2026-tip` og
`tour-85928`). Hvert projekt har sin egen Authentication-brugerpulje og sin egen
Firestore — derfor skal en spiller oprette sig to gange. Løsningen er ét fælles
Firebase-projekt, hvor "spil" er et begreb i datamodellen.

## 2. Målarkitektur

- **Ét Firebase-projekt** (arbejdsnavn `vejleaa-tip`): én Authentication
  (email/adgangskode), én Firestore, ét sæt Cloud Functions (europe-west1).
- **Én frontend på ét domæne:** `tip.vejleaa.dk`. Efter login lander spilleren
  på en spiloversigt ("Mine spil" / "Åbne spil — deltag"). Ét domæne er vigtigt:
  Firebase-login huskes pr. domæne, så ét domæne = log ind én gang.
- **Kodebasen udgår fra tour-motoren** (den nyeste udgave af den fælles motor —
  har bl.a. `userContacts`, presence og invitationsflow). Fodbold-domænet fra VM
  føres tilbage som et spil-modul.
- Spil-typen (`football` / `cycling`) bestemmer, hvilke sider og hvilken scoring
  et spil bruger. Et nyt spil af en kendt type = et nyt `games`-dokument +
  seed-data. En helt ny spiltype = et nyt modul i koden.

## 3. Datamodel

**Fælles (én gang pr. person):**

| Collection | Indhold |
|---|---|
| `users/{uid}` | Global profil: displayName, role, status. Godkendelse gælder på tværs af alle spil. |
| `userContacts/{uid}` | Privat e-mail (kun bruger selv + admin). |
| `config`, `emailLog`, `messages`, `presence` | Fortsat globale. |

**Pr. spil:**

| Collection | Indhold |
|---|---|
| `games/{gameId}` | Metadata: navn, type (`football`/`cycling`), status (`open`/`live`/`finished`), om tilmelding er åben. |
| `games/{gameId}/players/{uid}` | Deltagelse + spillerens point i netop dette spil. **"Deltag" = opret dette dokument.** |
| `games/{gameId}/…` | Alt spil-specifikt som subcollections: `matches`/`stages`, `bets`, `stageBets`, `bonusQuestions`, `bonusBets`, `leagues`, `leagueComments`, `leagueActivity`, `leagueBonus`, `leagueBonusAnswers`, `tipParticipation`, `teams`, `riders`. |

Begge apps slår i forvejen alle collection-navne op ét sted (`COL` i
`src/lib/constants.js`); det ændres til opslag via `games/{gameId}/…`.
Security rules får en fælles `users`-del og en generisk `games/{gameId}`-del,
hvor deltagelse kræver et `players/{uid}`-dokument.

Roller forbliver globale (owner / globalAdmin / player). Per-spil-admins kan
tilføjes senere som et felt på `games/{gameId}` uden at ændre modellen.

## 4. Ejerens tjekliste — kan gøres allerede nu (rører ikke de kørende spil)

1. **Opret Firebase-projektet:** <https://console.firebase.google.com> →
   Tilføj projekt, fx `vejleaa-tip`. Analytics fra. Notér projekt-ID'et.
2. **Opgradér til Blaze-planen** (kræves for Cloud Functions, som i de to
   eksisterende projekter).
3. **Authentication:** Build → Authentication → Kom i gang → aktivér
   **Email/adgangskode**. Under Settings → Authorized domains: tilføj
   `tip.vejleaa.dk` (behold `localhost`).
4. **Firestore:** Build → Firestore Database → Opret database →
   **Production mode** → lokation **eur3 (europe-west)**.
5. **Registrér web-appen:** Projektindstillinger → Generelt → Dine apps →
   Web (`</>`), fx `tip-web`. Kopiér konfigurationen (apiKey, authDomain,
   projectId, storageBucket, messagingSenderId, appId) — den skal bruges i den
   nye apps `.env`.
6. **Hosting + domæne:** Build → Hosting → Kom i gang → Add custom domain →
   `tip.vejleaa.dk`. Konsollen viser de DNS-records (A/TXT), der skal oprettes
   hos DNS-udbyderen for `vejleaa.dk`. Vent på at certifikatet bliver aktivt.
7. **E-mail-afsender:** opret `tip@vejleaa.dk` hos one.com (samme opsætning som
   `vm@` og `tour@`, SMTP via `send.one.com`) og hav adgangskoden klar.
8. **Secrets** (sættes når vi deployer functions første gang, men skaf dem nu):
   - `SMTP_PASSWORD` — adgangskoden til `tip@vejleaa.dk`.
   - `ANTHROPIC_API_KEY` — kan genbruges fra de eksisterende projekter
     (bruges til liga-recaps m.m.).
   - `FOOTBALL_DATA_TOKEN` — genbruges til fremtidige fodboldspil.
9. **App Check (valgfrit, som i dag):** opret et reCAPTCHA Enterprise-site-key
   til `tip.vejleaa.dk` og notér nøglen.
10. **Password-hash-parametre** fra BEGGE gamle projekter (skal bruges ved
    migreringen, kan hentes når som helst): Authentication → fanen Users →
    tre-prikker-menuen ⋮ → **Password hash parameters**. Gem indholdet et
    sikkert sted (det er følsomt — ikke i git).

## 5. Kode-forberedelse (laves nu, på denne branch)

- Fælles platform-skelet baseret på tour-koden: spiloversigt/game-picker,
  `games`-datamodel, collection-opslag pr. spil, generiske security rules.
- Fodbold-modulet (kampe, runder, knockout, VM-scoring) portes fra VM-koden.
- **Migrationsscripts:**
  - Auth: flet `auth:export` fra begge projekter, dedupliker på e-mail
    (én konto pr. person), skriv uid-mapping, klargør `auth:import`.
  - Firestore: eksportér begge databaser, omskriv til `games/vm2026/…` og
    `games/tour2026/…`, anvend uid-mapping, importér i det nye projekt.
- Intet af dette deployes til de kørende spil.

## 6. Migrering (efter 26/7, når begge spil er slut)

1. Sæt de gamle spil i ro (ingen åbne deadlines — spillene er færdige).
2. `firebase auth:export` fra begge projekter → kør merge-scriptet →
   `firebase auth:import` til det nye projekt **med hash-parametrene**, så alle
   beholder deres adgangskode. Personer, der findes i begge spil med samme
   e-mail, bliver til én konto; deres gamle data mappes via uid-mapping.
3. Firestore-migrering: eksport → transform → import under `games/…`.
4. Verificér: login med eksisterende konto, historiske stillinger, ligaer.
5. Peg `vm.vejleaa.dk` og `tour.vejleaa.dk` på redirects til
   `tip.vejleaa.dk/spil/vm2026` og `…/spil/tour2026`.
6. Behold de gamle projekter i læse-ro i en karensperiode (fx 1–2 måneder),
   sluk dem derefter.

## 7. Fremtidige spil

Et nyt spil oprettes fra admin-panelet (eller seed-script): nyt
`games/{gameId}`-dokument + spillets data. Det dukker op på spiloversigten som
"Åbent — deltag", og eksisterende brugere tilmelder sig med ét klik. Ingen ny
app, intet nyt Firebase-projekt, ingen ny registrering.
