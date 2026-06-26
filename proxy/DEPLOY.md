# Deploy: TdF-resultatproxy på Google Cloud Run

Proxyen (FastAPI + `procyclingstats`) skraber ProCyclingStats én gang pr. etape
og udstiller resultat + alle klassementer som JSON. Vores Firebase Cloud Function
henter herfra og beregner point. Den kører i **Google Cloud Run** (ikke Firebase).

> ⚠️ **Manuelle trin er markeret med 👉 — det er ting DU skal gøre i en konsol/CLI.**
> Intet her kræver noget i selve *Firebase*-konsollen; det er Google Cloud.

---

## 0. Forudsætninger
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

## Drift
- **Logs:** `gcloud run services logs read tdf-results --region europe-west1`
- **Hold `procyclingstats` opdateret** (PCS ændrer HTML): bump versionen i
  `requirements.txt` og redeploy, hvis et klassement pludselig kommer tomt ind.
- **Manuel genhentning af én etape:**
  `curl -X POST -H "X-Refresh-Token: DIT_TOKEN" https://DIN-RUN-URL/api/refresh/7`
