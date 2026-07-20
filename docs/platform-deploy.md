# Deploy af platform-skelettet til tip.vejleaa.dk (spil-89af9)

Skelettet = login (e-mail + Google) → spiloversigt ("vælg dit spil") → deltag.
Det deployes som ren frontend + Firestore-regler/-indexes (INGEN Cloud Functions
endnu). Domænet `tip.vejleaa.dk` er allerede oprettet og connected.

## Engangsopsætning: service-account-secret

Deploy kører via GitHub Actions med en service-account for `spil-89af9`:

1. Google Cloud Console → projekt **spil-89af9** → **IAM & Admin → Service
   Accounts**. Brug den eksisterende `firebase-adminsdk-…@spil-89af9…`-konto
   (eller opret en ny med rollerne *Firebase Admin* + *Cloud Datastore User*).
2. Fanen **Keys → Add key → Create new key → JSON** → hent filen.
3. GitHub → repoet `cvejleaa/tour` → **Settings → Secrets and variables →
   Actions → New repository secret**:
   - Navn: `FIREBASE_SERVICE_ACCOUNT_SPIL`
   - Værdi: HELE indholdet af JSON-filen.

Den offentlige web-config (apiKey m.fl.) er bagt ind i workflowen — den er
IKKE hemmelig, så den kræver ingen ekstra opsætning.

## Kør deploy

GitHub → **Actions → "Deploy platform (tip.vejleaa.dk)" → Run workflow**.
Inputs:
- **seedGames** (standard: til) — opretter spillene VM/Tour/Superliga i
  `games`-collection'en, så oversigten har noget at vise.
- **bootstrapOwnerEmail** — lad den være tom ved FØRSTE kørsel (din konto
  findes ikke endnu). Se owner-trinnet nedenfor.

Workflowen bygger med `VITE_PLATFORM_MODE=true` (så forsiden er spiloversigten)
og deployer `hosting` + `firestore:rules` + `firestore:indexes` til spil-89af9.

## Gør dig selv til ejer (én gang)

Der er ingen Cloud Functions endnu, så owner sættes manuelt:

1. Gå til <https://tip.vejleaa.dk> og **log ind** (Google eller e-mail) med
   `cvejleaa@gmail.com`. Du lander på "Afventer godkendelse" (status = pending).
2. Kør workflowen igen med **bootstrapOwnerEmail = `cvejleaa@gmail.com`**
   (seedGames kan slås fra denne gang). Scriptet slår din bruger op og sætter
   `role=owner` + `status=approved`.
   - Alternativt manuelt: Firebase Console → Firestore → `users/{dit-uid}` →
     sæt `role: "owner"` og `status: "approved"`.
3. Genindlæs siden — nu ser du spiloversigten og kan deltage i spil.

## Hvad virker i skelettet — og hvad ikke endnu

**Virker:** registrering/login (e-mail + Google), godkendelsesflow,
spiloversigten med Mine spil / Åbne spil, deltag/forlad, sikkerhedsregler.

**Ikke endnu (Fase B):** selve spil-siderne (kampe/etaper/tips/stilling) ligger
endnu ikke under `/spil/{gameId}/…` — de bygges som domæne-moduler oven på
skelettet. Indtil da viser et spil-kort blot spillets metadata. Superliga-data
hentes via proxyens Flashscore-modul, som allerede er på plads.

## Lokal deploy (alternativ, hvis du hellere vil køre fra egen maskine)

```bash
git checkout claude/multi-game-player-collection-21mc1w
npm ci
cat > .env <<'EOF'
VITE_FIREBASE_API_KEY=AIzaSyDdP6zteOBHKOGWEIH6ARctMx3nOJc0Zhc
VITE_FIREBASE_AUTH_DOMAIN=spil-89af9.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=spil-89af9
VITE_FIREBASE_STORAGE_BUCKET=spil-89af9.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=549049171754
VITE_FIREBASE_APP_ID=1:549049171754:web:627b27c367fc7dbdf82853
VITE_USE_EMULATORS=false
VITE_PLATFORM_MODE=true
VITE_OWNER_EMAIL=cvejleaa@gmail.com
EOF
npm run build
firebase login
firebase deploy --only hosting,firestore --project spil
# seed spil + (efter login) gør dig til owner:
GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json node scripts/seed-games.mjs
GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json OWNER_EMAIL=cvejleaa@gmail.com node scripts/bootstrap-owner.mjs
```
