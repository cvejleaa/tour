#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Ét-kommandos deploy af TdF-resultatproxyen til Google Cloud Run.
# Kør den i Google Cloud Shell (https://shell.cloud.google.com) — den er
# allerede logget ind på dit projekt og har gcloud + docker.
#
#   cd proxy && ./deploy.sh
#
# Idempotent: kan køres igen for at opdatere. Ingen Postgres nødvendig.
# min-instances=0 → skalerer til nul når den ikke bruges (reelt gratis det
# meste af året). I aftenvinduet holder Cloud Scheduler (hvert 5. min)
# instansen varm, så cachen lever og PCS kun skrabes ved behov. Mister den
# cachen ved en cold start, genskrabes blot (finalitets-logikken holder det lavt).
# ---------------------------------------------------------------------------
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
PROJECT_ID="${PROJECT_ID:-tour-85928}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-tdf-results}"
SECRET="${SECRET:-TDF_REFRESH_TOKEN}"
APP_ORIGIN="${APP_ORIGIN:-https://tour.vejleaa.dk}"
RACE_YEAR="${RACE_YEAR:-2026}"

echo "▶ Projekt: $PROJECT_ID  ·  Region: $REGION  ·  Service: $SERVICE"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "▶ Slår nødvendige API'er til (kan tage et øjeblik første gang)…"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com >/dev/null

echo "▶ Sikrer refresh-token (Secret Manager: $SECRET)…"
if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
  openssl rand -hex 32 | gcloud secrets create "$SECRET" --data-file=- >/dev/null
  echo "  • Oprettede nyt token."
else
  echo "  • Genbruger eksisterende token."
fi
# Giv Cloud Run-runtime-kontoen lov til at læse hemmeligheden.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding "$SECRET" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null 2>&1 || true

echo "▶ Giver build-/runtime-kontoen de nødvendige roller…"
# Nyere GCP-projekter giver ikke længere standard-compute-kontoen Editor-rollen,
# så Cloud Build (som gcloud run deploy --source bruger) mangler adgang til at
# læse kildekode-zip'en og pushe imaget. cloudbuild.builds.builder dækker det.
for ROLE in roles/cloudbuild.builds.builder roles/storage.objectViewer roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="$ROLE" --condition=None >/dev/null 2>&1 || true
done
echo "  • Venter ~45s på at IAM-ændringer slår igennem…"
sleep 45

# Valgfri residential scraper-nøgle (PCS blokerer datacenter-IP'er). Angiv den
# når du kører scriptet:  SCRAPER_API_KEY=din-noegle ./deploy.sh
EXTRA_FLAGS=()
if [ -n "${SCRAPER_API_KEY:-}" ]; then
  EXTRA_FLAGS+=(--set-env-vars "SCRAPER_API_KEY=${SCRAPER_API_KEY}")
  [ -n "${SCRAPER_API_ENDPOINT:-}" ] && EXTRA_FLAGS+=(--set-env-vars "SCRAPER_API_ENDPOINT=${SCRAPER_API_ENDPOINT}")
  echo "  • Residential scraper aktiveret (SCRAPER_API_KEY sat)."
fi

echo "▶ Deployer til Cloud Run (bygger container fra Dockerfile)…"
deploy_run() {
  gcloud run deploy "$SERVICE" \
    --source . \
    --region "$REGION" \
    --allow-unauthenticated \
    --min-instances=0 \
    --memory=512Mi \
    --set-env-vars "RACE_YEAR=${RACE_YEAR},RACE_SLUG=tour-de-france,ENABLE_SCHEDULER=0,ALLOWED_ORIGINS=${APP_ORIGIN},DATA_DIR=/tmp/data" \
    --set-secrets "REFRESH_TOKEN=${SECRET}:latest" \
    "${EXTRA_FLAGS[@]}" \
    --quiet
}
n=0
until deploy_run; do
  n=$((n + 1))
  if [ "$n" -ge 3 ]; then echo "✖ Deploy fejlede efter $n forsøg."; exit 1; fi
  echo "  • Forsøg $n fejlede (IAM kan stadig være under udbredelse). Prøver igen om 45s…"
  sleep 45
done

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo "✔ Cloud Run kører: $URL"

echo "▶ Opretter/opdaterer Cloud Scheduler (hvert 5. min 17–22, Europe/Copenhagen)…"
TOKEN="$(gcloud secrets versions access latest --secret="$SECRET")"
SCHED_ARGS=(
  --location "$REGION"
  --schedule "*/5 17-22 * * *"
  --time-zone "Europe/Copenhagen"
  --uri "${URL}/api/refresh"
  --http-method POST
)
# create bruger --headers, update bruger --update-headers (gcloud-inkonsistens).
if gcloud scheduler jobs describe tdf-refresh --location "$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http tdf-refresh "${SCHED_ARGS[@]}" \
    --update-headers "X-Refresh-Token=${TOKEN}" --quiet
else
  gcloud scheduler jobs create http tdf-refresh "${SCHED_ARGS[@]}" \
    --headers "X-Refresh-Token=${TOKEN}" --quiet
fi

echo ""
echo "✅ Færdig!"
echo "   Proxy-URL:  $URL"
echo "   Test:       curl $URL/healthz"
echo "   Etaper:     curl $URL/api/stages"
echo ""
echo "   Giv denne URL til Claude, så kobles Firebase-sync'en på den."
