# Deploy: TdF-resultatproxy på Google Cloud Run

Proxyen (FastAPI + `procyclingstats`) skraber ProCyclingStats én gang pr. etape
og udstiller resultat + alle klassementer som JSON. Vores Firebase Cloud Function
henter herfra og beregner point. Den kører i **Google Cloud Run** (ikke Firebase).

> ⚠️ **Manuelle trin er markeret med 👉 — det er ting DU skal gøre i en konsol/CLI.**
> Intet her kræver noget i selve *Firebase*-konsollen; det er Google Cloud.

---

## ⭐ Hurtig vej (anbefalet): ét script i Cloud Shell

Du behøver **ikke** installere noget. Åbn [Google Cloud Shell](https://shell.cloud.google.com)
(allerede logget ind på dit projekt) og kør:

```bash
git clone https://github.com/cvejleaa/tour.git
cd tour/proxy
./deploy.sh
```

`deploy.sh` er idempotent og gør alt automatisk: slår API'er til, laver et
hemmeligt refresh-token, deployer til Cloud Run (`--min-instances=1`, **ingen
Postgres nødvendig**), og opretter Cloud Scheduler-jobbet (hvert 5. min 17–22,
Europe/Copenhagen). Til sidst printer den proxyens URL — **giv den til Claude**,
så kobles Firebase-sync'en på.

> Resten af dette dokument er den manuelle/avancerede vej (fx hvis du hellere vil
> køre på en Raspberry Pi, eller bruge Postgres i stedet for warm cache).

---

## 0. Forudsætninger (manuel vej)
- Samme GCP-projekt som Firebase: **`tour-85928`** (Firebase-projekter ER GCP-projekter).
- `gcloud` CLI installeret og logget ind: `gcloud auth login && gcloud config set project tour-85928`

👉 **Aktivér de nødvendige API'er** (engang):
```bash
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com
```

## 1. Persistent cache (Postgres)
Cloud Run-filsystemet er flygtigt, så cachen skal ligge i Postgres (ellers
genskrabes etaper ved cold start). To muligheder:

- **Gratis/nemt:** opret en gratis Postgres på [Neon](https://neon.tech) eller
  [Supabase](https://supabase.com) og kopiér dens `DATABASE_URL`.
- **Google-native:** Cloud SQL Postgres (lille instans, ~kr./md).

`pg_cache.py` opretter selv tabellerne ved opstart. Lad `DATABASE_URL` være
**tom**, hvis du i stedet kører på en Raspberry Pi (så bruges JSON-fil-cache).

## 2. Vælg et REFRESH_TOKEN
En lang tilfældig streng, der beskytter `/api/refresh`:
```bash
openssl rand -hex 32
```

## 3. Deploy til Cloud Run
👉 Fra `proxy/`-mappen:
```bash
gcloud run deploy tdf-results \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars RACE_YEAR=2026,RACE_SLUG=tour-de-france,ENABLE_SCHEDULER=0 \
  --set-env-vars ALLOWED_ORIGINS=https://tour-85928.web.app \
  --set-env-vars REFRESH_TOKEN=DIT_TOKEN \
  --set-env-vars DATABASE_URL=postgresql://USER:PASS@HOST:5432/DB
```
Noter den udstedte URL, fx `https://tdf-results-xxxx.europe-west1.run.app`.
Test: `curl https://.../healthz` → `{"ok":true,...}`.

> `--allow-unauthenticated` er fint: kun `/api/refresh*` ændrer noget, og det er
> token-beskyttet. Læse-endpoints er offentlige (samme data som PCS selv viser).

## 4. Automatisk opdatering hvert 5. minut fra kl. 17:00
Etaper er typisk i mål omkring 17:00 (den sidste senere). Vi poller derfor hvert
5. minut i et aftenvindue. Finalitets-logikken sørger for, at en afsluttet etape
**ikke** skrabes igen — ekstra polls er gratis (cache-hit).

👉 Opret Cloud Scheduler-jobbet (kalder proxyens refresh):
```bash
gcloud scheduler jobs create http tdf-refresh \
  --location europe-west1 \
  --schedule "*/5 17-22 * * *" \
  --time-zone "Europe/Copenhagen" \
  --uri "https://DIN-RUN-URL/api/refresh" \
  --http-method POST \
  --headers "X-Refresh-Token=DIT_TOKEN"
```
`*/5 17-22` = hvert 5. min mellem 17:00 og 22:55 (dækker også den sene sidste etape).

## 5. Firebase-siden (kommer som Cloud Function)
En planlagt Cloud Function (`onSchedule`, samme cadence) henter
`/api/stages/{n}` fra proxyen, mapper via `pcsMapping`, skriver etape-facit og
genberegner point. Den bygger jeg i næste skridt — og **når den skal deployes,
giver jeg dig en præcis Firebase-tjekliste** (Blaze-plan, Cloud Scheduler m.m.).

---

## Superliga-endpoints (Flashscore/livescore.in)

Proxyen udstiller også data til **Superliga-spillet** (sæsonstart 24-07-2026).
Datakilde er Flashscores interne feeds (samme som livescore.in's frontend):

- `GET /api/superliga/fixtures?day={-7..7}` — dagens (± offset) Superliga-kampe
  (event_id, kickoff, hold, status, scorer). Cache-TTL 15 min.
- `GET /api/superliga/match/{event_id}` — samlet kampbillede: stamdata (kickoff,
  status, slutstilling), hændelsesforløb (mål/kort/udskiftninger med minutter,
  venue/tilskuere) og statistik (xG, boldbesiddelse … via GraphQL). Tolerant
  over for delvise upstream-fejl: de dele der lykkes serveres, resten er `null`
  med fejltekst under `errors`. TTL: hændelser/statistik 60 s, stamdata 1 t.
- `GET /api/superliga/season?from=-7&to=7` — kampe over flere dags-offsets,
  dedupet pr. event_id (Flashscore kan kun levere -7..7 dage ad gangen).

**x-fsign-mekanismen:** feed-API'et (`50.flashscore.ninja`) kræver en
`x-fsign`-signaturheader. Signaturen roterer og ligger indlejret i
livescore.in's JS-bundle, så klienten (`flashscore_client.py`) henter forsiden
→ finder bundle-URL'en → regex'er signaturen ud, og cacher den. Svarer feedet
401/403/404 (typisk tegn på rotation), gen-hentes signaturen én gang og kaldet
prøves igen. Knækker site-skrabningen (fx nyt bundle-layout), kan signaturen
sættes manuelt med miljøvariablen `FLASHSCORE_FSIGN` (find den i browserens
netværksfane på livescore.in) og redeployes. GraphQL-API'et (`50.ds.lsapp.eu`)
kræver ingen signatur — kun Origin/Referer/User-Agent, som klienten sætter.

Cachen er nøgle/værdi i Postgres (`flashscore_cache`-tabellen, oprettes
idempotent) når `DATABASE_URL` er sat, ellers in-memory pr. instans.

## Drift
- **Logs:** `gcloud run services logs read tdf-results --region europe-west1`
- **Hold `procyclingstats` opdateret** (PCS ændrer HTML): bump versionen i
  `requirements.txt` og redeploy, hvis et klassement pludselig kommer tomt ind.
- **Manuel genhentning af én etape:**
  `curl -X POST -H "X-Refresh-Token: DIT_TOKEN" https://DIN-RUN-URL/api/refresh/7`
