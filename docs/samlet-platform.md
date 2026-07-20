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

- **Ét Firebase-projekt — OPRETTET 20/7:** navn **Spil**, projekt-ID
  **`spil-89af9`**, projektnummer **549049171754**. Én Authentication
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

Status 20/7 (aften): Firebase-fundamentet ER på plads —
- **Projekt:** `spil-89af9` (Spil) ✅
- **Authentication:** aktiveret med **e-mail/adgangskode OG Google-login** ✅
  (NB: motoren understøtter i dag kun e-mail/adgangskode — platformens
  login-side skal udvides med Google-knappen, se §9.)
- **Firestore:** oprettet ✅
- **Hosting:** `tip.vejleaa.dk` oprettet og connected ✅
- **E-mail-afsender:** `tip@vejleaa.dk` oprettet ✅
- **Web-app-konfiguration** (offentlige værdier, til `.env`):
  `apiKey=AIzaSyDdP6zteOBHKOGWEIH6ARctMx3nOJc0Zhc`,
  `authDomain=spil-89af9.firebaseapp.com`, `projectId=spil-89af9`,
  `storageBucket=spil-89af9.firebasestorage.app`,
  `messagingSenderId=549049171754`,
  `appId=1:549049171754:web:627b27c367fc7dbdf82853`,
  `measurementId=G-734NLW2WDP` (Analytics er slået til; motoren bruger den
  ikke, måle-ID'et er valgfrit).

~~Blaze-plan~~ **GJORT** (20/7 aften).

**Udestående på tjeklisten:**

- **Secrets** (kan sættes nu; træder først i kraft ved functions-deploy):
  ```bash
  firebase functions:secrets:set SMTP_PASSWORD --project spil-89af9      # kodeord til tip@vejleaa.dk
  firebase functions:secrets:set ANTHROPIC_API_KEY --project spil-89af9  # kan genbruges fra gammelt projekt:
  firebase functions:secrets:access ANTHROPIC_API_KEY --project tour-85928
  ```
  Verificér med `functions:secrets:access <NAVN> --project spil-89af9`.
- **Password-hash-parametre fra BEGGE gamle projekter** (til migreringen):
  Console → projektet (`vm2026-tip` hhv. `tour-85928`) → Build →
  Authentication → fanen **Users** → tre-prikker-menuen ⋮ →
  **Password hash parameters** → kopiér hele boksen og gem den sikkert
  (password-manager/privat note, mærket med projektnavn — ALDRIG i git).
  Bruges af `firebase auth:import`, så alle beholder deres kodeord.
- Evt. App Check-nøgle (reCAPTCHA Enterprise for tip.vejleaa.dk) — valgfrit.

1. ~~Opret Firebase-projektet~~ **GJORT:** `spil-89af9` (Spil).
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

## 8. Superligaen 2026/27 — platformens første nye spil

Den danske Superliga starter **fredag 24/7 2026** (første kamp: Viborg hjemme,
kickoff 19:00 dansk tid) — altså FØR Touren slutter (26/7). Planen:

- **Spiltype:** `football`-modulet (fra VM) genbruges næsten direkte: kampe,
  1X2-/målscore-tips, deadline ved kickoff, runde-baseret stilling. Ingen
  gruppespil/knockout — i stedet en lang sæson (33 runder + slutspil), så
  spillet skal kunne køre pr. runde og have en sæson-dimension (Tours
  `season`-mønster genbruges).
- **Lancering:** platformen når realistisk ikke at være klar til runde 1.
  Derfor: (a) datasynk (kampprogram/resultater) sættes i gang nu og backfiller,
  (b) spillet åbnes for tips fra den runde, hvor platformen går i luften, og
  stillingen tæller fra dér. Alternativt kan runde 1-2 køre uden point.

### 8.1 Datakilde: livescore.in / Flashscore (verificeret 20/7)

livescore.in er Flashscores danske site. HAR-analyse af to kampe (Superliga
26/27-premieren + VM-finalen) viser to anvendelige, gratis (uofficielle) API'er,
og BEGGE er efterprøvet med direkte serverkald 20/7 (virker uden browser):

1. **Feed-API** `https://50.flashscore.ninja/50/x/feed/…` — kræver headeren
   `x-fsign` (signatur der roterer; skal scrapes fra deres JS-bundle — samme
   disciplin som Tours letour-proxy allerede mestrer). Format: felt-koder
   adskilt af `÷`/`¬` (simpel parser). Vigtigste feeds:
   - `f_1_{dagOffset}_3_en_1` — ALLE kampe pr. dag (±7 dage): sektion
     `ZA÷DENMARK: Superliga`, pr. kamp `AA÷eventId`, `AD÷kickoff-epoch`,
     `AE/AF÷hold`, status + scorer. → **kampprogram-import og resultat-synk.**
   - `df_sui_1_{eventId}` — fuld hændelsesliste (mål med minut og målscorer,
     kort, udskiftninger, VAR + engelsk kommentartekst).
   - `dc_1_{eventId}` (meta), `df_dos_` (opstillinger), `df_hh_`
     (head-to-head), `df_mr_` (kamprapport).
2. **GraphQL-API** `https://50.ds.lsapp.eu/pq_graphql?_hash=…&eventId=…`
   — rent JSON, **kræver INGEN signatur** (kun alm. Origin/Referer-headers):
   - `dsof`/`dsos2`: kampstatistik inkl. **xG**, boldbesiddelse, skud m.m.
   - `mmte`/`mmts`: hændelser + minut-for-minut momentum.
   Persisted-query-hashes (`dsof` osv.) er stabile men uofficielle.

**Arkitektur:** udvid Tours **proxy-microservice** (Python/FastAPI med cache,
`proxy/`) med et `flashscore`-modul: dagslister for `DENMARK: Superliga` →
fixtures/resultater; pr. kamp `df_sui` + GraphQL-stats. Firebase-siden bruger
**VM's adapter-mønster** (ren mapping → ren beslutning → orkestrering bag et
kilde-flag), så Flashscore kan skiftes ud senere uden at røre resten.

**Risici/afbødning:** uofficielt API (ingen SLA, ToS-gråzone) → aggressiv
cache i proxyen, lav kaldsfrekvens (dagsliste 1×/time udenfor kampdage,
1×/2 min under kampe), fail-silent som liveticker'en. `x-fsign`-rotation →
proxy henter signaturen automatisk fra JS-bundlet og fornyer ved 4xx.
**Alternativ/fallback:** API-Football (api-sports.io) har Superligaen med
gratis-tier (100 kald/dag — nok til dagligt program + resultater, ikke live).
**football-data.org er OPSAGT (20/7) og må ikke benyttes fremover** — VM's
football-data-adapter er dermed legacy og portes ikke til platformen; kun
adapter-MØNSTRET genbruges, med Flashscore som kilde.

## 9. Google-login

Authentication i `spil-89af9` er sat op med både e-mail/adgangskode og
Google. Motoren har i dag kun e-mail/adgangskode, så platformen skal:
- tilføje "Log ind med Google"-knap (`signInWithPopup`/`GoogleAuthProvider`)
  på login-/opret-siden og oprette `users/{uid}`-profilen ved første
  Google-login (samme pending-godkendelsesflow som i dag),
- håndtere **konto-sammenfletning ved migreringen**: importerede
  password-brugere, der senere logger ind med Google med SAMME e-mail,
  skal lande på samme konto (Firebase linker automatisk, når
  "One account per email address" er slået til — verificér indstillingen),
- gemme e-mailen i `userContacts` også for Google-brugere.
