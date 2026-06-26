# Firebase-opsætning & deploy

Trin-for-trin guide til at oprette Firebase-projektet fra bunden og koble det
til frontenden på `vm.vejleaa.dk`. Du behøver ikke kunne kode for at følge den.

---

## 0. Forudsætninger
- En Google-konto (`cvejleaa@gmail.com`).
- Node.js 20+ installeret lokalt (kun hvis du selv vil deploye fra din maskine).
- Firebase CLI:
  ```bash
  npm install -g firebase-tools
  firebase login
  ```

---

## 1. Opret Firebase-projekt
1. Gå til <https://console.firebase.google.com> → **Tilføj projekt**.
2. Navngiv det fx `vm2026-tip`. Slå Google Analytics fra (ikke nødvendigt).
3. Når projektet er oprettet, notér **projekt-ID'et** (fx `vm2026-tip`).

---

## 2. Slå Authentication til (email/adgangskode)
1. I venstremenuen: **Build → Authentication → Kom i gang**.
2. Fanen **Sign-in method** → aktivér **Email/adgangskode**. (Lad
   "email link" være slået fra.)
3. Under **Settings → Authorized domains**: tilføj `vm.vejleaa.dk`
   (og behold `localhost`).

### 2b. Selvbetjent godkendelse via invitationskode

Nye brugere oprettes som `pending` og skal godkendes. Ud over manuel godkendelse
i admin-panelet kan en bruger **godkende sig selv** ved at indtaste en ligas
**invitationskode** (join-kode) på "Afventer godkendelse"-skærmen:

- Hver liga har en 6-tegns kode (vises i ligaen; ejeren kan **regenerere** den
  med 🔄 hvis den lækker).
- Indtaster en pending bruger en kode, der matcher en **admin-godkendt** liga,
  kører Cloud Function'en `redeemInviteCode` server-side og sætter brugeren til
  `approved` + tilmelder ligaen. Klienten kan aldrig selv sætte `approved`.
- Kun koder fra **godkendte** ligaer virker, og forsøg er rate-limited (gæt
  blokeres). Ejeren beholder kontrollen ved at godkende ligaer.

> Del kun koden med folk, du vil lukke ind — enhver med en gyldig kode bliver
> godkendt automatisk.

---

## 3. Opret Firestore-database
1. **Build → Firestore Database → Opret database**.
2. Vælg **Production mode** (vi har egne security rules).
3. Vælg lokation **eur3 (europe-west)** — tæt på Danmark.

---

## 4. Registrér web-appen og hent konfigurationen
1. **Projektindstillinger (tandhjul) → Generelt → Dine apps → Web (</>)**.
2. Kald den `vm2026-web`. (Du behøver IKKE slå Firebase Hosting til her endnu.)
3. Kopiér værdierne fra `firebaseConfig` ind i en `.env`-fil i projektroden
   (kopiér fra `.env.example`):
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=vm2026-tip.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=vm2026-tip
   VITE_FIREBASE_STORAGE_BUCKET=vm2026-tip.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_OWNER_EMAIL=cvejleaa@gmail.com
   ```
   > Disse værdier er offentlige (de ligger i den byggede frontend) — det er
   > security rules der beskytter data, ikke nøglerne. Læg dem ALDRIG som
   > hemmeligheder, men commit heller ikke din `.env`.

---

## 5. Knyt projektet til koden
```bash
cp .firebaserc.example .firebaserc       # og indsæt dit projekt-ID
```
eller kør `firebase use --add` og vælg projektet.

---

## 6. Deploy security rules, indexes og functions
```bash
npm install
firebase deploy --only firestore:rules,firestore:indexes
cd functions && npm install && cd ..
firebase deploy --only functions
```
> Cloud Functions kræver **Blaze (pay-as-you-go)**-abonnement. For et
> tippespil med få hundrede brugere er forbruget reelt gratis (godt under
> gratis-grænserne), men kortet skal være registreret. Sæt evt. et
> budget-alarm på 1 kr. for en sikkerheds skyld.

---

## 6b. (Anbefalet) Automatisk deploy via GitHub Actions
I stedet for at deploye fra din egen maskine kan du lade GitHub gøre det. Så
slipper du for at installere noget lokalt.

1. **Lav en service-account-nøgle:** Firebase Console → **Projektindstillinger →
   Tjenestekonti → Generér ny privat nøgle**. Du får en JSON-fil.
2. **Giv nøglen de rette rettigheder** (vigtigt — ellers fejler deploy med
   `403 Permission denied` eller `failed to modify the IAM policy`).
   Standard-nøglen må kun læse/skrive data, ikke deploye. Gå til
   **Google Cloud Console → IAM & Admin → IAM**
   (<https://console.cloud.google.com/iam-admin/iam?project=vm2026-tip>), find
   service-kontoen (`firebase-adminsdk-…@vm2026-tip.iam.gserviceaccount.com`),
   klik **rediger (blyant)** og tilføj roller.

   **Anbefalet (enkelt — undgår at jagte enkeltrettigheder):** tilføj
   **Editor** + **Firebase Admin** + **Cloud Functions Admin**. Det dækker
   hosting, rules, functions og indlæsning af data.

   **Hvis functions-deploy stadig fejler med "failed to modify the IAM
   policy":** CLI'en skal kunne ændre projektets IAM-politik for at give
   Googles service-agenter de nødvendige roller. Tilføj én af disse:
   - **Project IAM Admin** (`roles/resourcemanager.projectIamAdmin`) — målrettet, ELLER
   - **Owner** (`roles/owner`) — bredest, men nemmest til et privat projekt.

   <details><summary>Minimal liste (mest restriktiv)</summary>

   - Firebase Admin (`roles/firebase.admin`) — hosting, rules, indexes
   - Service Usage Consumer (`roles/serviceusage.serviceUsageConsumer`)
   - Cloud Functions Admin, Service Account User, Artifact Registry Administrator
   - Project IAM Admin (`roles/resourcemanager.projectIamAdmin`) — til at tildele service-agent-roller
   </details>

   > **Alternativ til functions-deploy:** den *allerførste* functions-deploy
   > kræver flest rettigheder (opsætning af service-agenter). Du kan i stedet
   > køre den én gang fra din egen maskine som projekt-ejer:
   > `firebase login` og `firebase deploy --only functions`. Derefter klarer
   > GitHub Actions-kontoen efterfølgende deploys uden de brede roller.
3. **Læg nøglen som repo-secret:** GitHub → repoet → **Settings → Secrets and
   variables → Actions → New repository secret**. Navn:
   `FIREBASE_SERVICE_ACCOUNT`. Værdi: indsæt **hele indholdet** af JSON-filen.
   > Denne nøgle er hemmelig — læg den ALDRIG i koden, kun som GitHub-secret.
4. **Kør deploy:** GitHub → fanen **Actions → "Deploy til Firebase" → Run
   workflow**. Vælg:
   - `hosting-rules` — frontend + security rules + indexes (virker på gratis
     Spark-plan). **Start med denne.**
   - `functions` eller `all` — kræver **Blaze-plan** (se trin 6).
   - Sæt **seed = true** første gang for samtidig at indlæse alle kampe.

Workflowen deployer kun når du selv trykker — intet sker automatisk ved push.

## 7. Indlæs kampene (seed)
Kør seed-scriptet for at lægge alle gruppespilskampe + bonus-spørgsmål ind.

**Mod produktion** (kræver en service-account nøgle):
1. **Projektindstillinger → Tjenestekonti → Generér ny privat nøgle** →
   gem som `serviceAccount.json` i projektroden (den er git-ignoreret).
2. ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json npm run seed
   ```

**Mod den lokale emulator** (til test):
```bash
npm run emulators           # i én terminal
# i en anden terminal:
FIRESTORE_EMULATOR_HOST=localhost:8080 npm run seed
```

---

## 8. Gør dig selv til ejer (owner)
1. Opret en bruger på sitet med `cvejleaa@gmail.com`.
2. Cloud Function `onUserCreate` genkender owner-emailen og sætter automatisk
   din rolle til **owner** + status **approved**.
   - Hvis du seedede før du oprettede kontoen, kan du i stedet manuelt sætte
     `role: "owner"` og `status: "approved"` på dit `users/{uid}`-dokument i
     Firestore-konsollen.
3. Herefter kan du i **Admin → Brugere** godkende andre og udnævne globale admins.

---

## 9. Byg og hostér frontenden på vm.vejleaa.dk
Du har to muligheder:

### A) Firebase Hosting (nemmest, gratis SSL, custom domæne)
Deploy først frontenden (via GitHub Actions med `hosting-rules`, eller lokalt):
```bash
npm run build
firebase deploy --only hosting
```

**Kobl `vm.vejleaa.dk` på (trin for trin):**
1. Firebase Console → **Hosting** → knappen **"Tilføj brugerdefineret domæne"**.
2. Skriv `vm.vejleaa.dk` → **Fortsæt**.
3. **Bekræft ejerskab:** Firebase viser én **TXT**-record (navn `vm` eller
   `vm.vejleaa.dk`, en lang værdi). Opret den hos din udbyder af `vejleaa.dk`
   (se nedenfor), vent et par minutter, og tryk **Bekræft**.
4. **Peg domænet:** Firebase viser nu typisk **to A-records** (to IP-adresser).
   Opret begge med host/navn `vm`. *(Brug præcis de værdier Firebase viser —
   de kan variere. Hvis Firebase i stedet tilbyder en CNAME, så brug den.)*
5. Tryk **Færdig**. Firebase udsteder automatisk et gratis **SSL-certifikat**.
   Det kan tage fra ~15 min op til 24 timer før alt er aktivt.

**Sådan opretter du DNS-records** (hos den udbyder hvor `vejleaa.dk` ligger —
fx Simply.com, one.com, GratisDNS, UnoEuro, Cloudflare):
- Find **DNS-indstillinger** / **DNS-zone** for `vejleaa.dk`.
- Tilføj posterne med **Navn/Host = `vm`** (IKKE `@` — det er kun subdomænet):

  | Type | Navn/Host | Værdi | Formål |
  |------|-----------|-------|--------|
  | TXT  | `vm`      | (værdien fra Firebase) | bekræfter ejerskab |
  | A    | `vm`      | (1. IP fra Firebase)   | peger domænet |
  | A    | `vm`      | (2. IP fra Firebase)   | peger domænet |

- Gem. DNS kan tage op til et par timer at slå igennem (TTL).
- Når Firebase viser domænet som **"Forbundet"**, virker
  <https://vm.vejleaa.dk>. ✅

> Har du allerede en anden A-/CNAME-record på `vm` (fx en tidligere side),
> skal den **fjernes/erstattes**, ellers peger domænet stadig det gamle sted.
> Ligger `vejleaa.dk` bag Cloudflare-proxy, så sæt posten til **"DNS only"**
> (grå sky), mens Firebase udsteder certifikatet.

### B) Din egen webserver
Kør `npm run build` og upload indholdet af `dist/` til den mappe `vm.vejleaa.dk`
peger på. Vigtigt: konfigurér serveren til at sende alle ukendte stier til
`index.html` (SPA-fallback), ellers virker direkte links/refresh ikke.

---

## 10. Løbende drift
- **Indtast resultater** i Admin efter hver kamp → point beregnes automatisk af
  Cloud Functions.
- Når gruppespillet er slut: tryk **"Byg slutspil"** i Admin → knockout-kampene
  får de rigtige hold, og spillerne kan tippe på dem.
- **Sæt bonus-facit** (topscorer/gruppevindere) når de er afgjort.

Se [admin-guide.md](admin-guide.md) for den daglige brug.

---

## 11. Offentligt repo: deploy-variabler & App Check

`.env` ligger **ikke** længere i git (kun den offentlige web-config, men vi
holder repoet rent). Derfor henter `deploy.yml` web-konfigurationen fra
**GitHub repo-variabler** ved deploy.

### A) Tilføj repo-variabler (engang)
GitHub → repoet → **Settings → Secrets and variables → Actions → fanen
"Variables" → New repository variable**. Opret disse (værdierne er de samme
offentlige værdier som i din lokale `.env` / Firebase Console → Projektindstillinger):

| Navn | Eksempel |
|------|----------|
| `VITE_FIREBASE_API_KEY` | `AIza…` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `vm2026-tip.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `vm2026-tip` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `vm2026-tip.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `000000000000` |
| `VITE_FIREBASE_APP_ID` | `1:000…:web:…` |
| `VITE_OWNER_EMAIL` | `cvejleaa@gmail.com` |
| `VITE_RECAPTCHA_SITE_KEY` | (valgfri — udfyld når App Check er sat op) |

Disse er **variabler**, ikke secrets — værdierne er offentlige og må gerne være
synlige. (Service-account og SMTP-/football-data-nøgler forbliver **secrets**.)
Deployet stopper med en tydelig fejl, hvis `VITE_FIREBASE_PROJECT_ID` mangler.

### B) Slå App Check til (anbefalet før public)
1. **reCAPTCHA Enterprise-nøgle:** Firebase Console → **App Check** → registrér
   web-appen med udbyderen **reCAPTCHA Enterprise**. Site-key'en er **Key-ID'et**
   (starter med `6L…`) fra Google Cloud → reCAPTCHA. Enterprise bruger **kun** en
   site-key — ingen secret-key.
2. Sæt den som repo-variabel `VITE_RECAPTCHA_SITE_KEY`. Koden aktiverer automatisk
   App Check (Enterprise-provider), når nøglen er sat.
3. Deploy frontend, åbn siden et par gange, og tjek i **App Check** at der
   kommer "verified" trafik ind.
4. Når trafikken ser rigtig ud: tryk **Enforce** på **Firestore** og
   **Cloud Functions** i App Check. (Gør det først efter et par dage, så du
   ikke låser rigtige brugere ude.)
5. Lokal udvikling: hent en **debug-token** fra browser-konsollen og læg den i
   `VITE_APPCHECK_DEBUG_TOKEN`, eller lad `VITE_RECAPTCHA_SITE_KEY` stå tom.

### C) Sæt et budget-loft (Blaze)
Google Cloud Console → **Billing → Budgets & alerts** → opret et budget med
e-mail-alarm (fx 50 kr./md.), så evt. misbrug ikke kan løbe løbsk.
