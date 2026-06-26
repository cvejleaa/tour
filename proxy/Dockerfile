# Cloud Run-image til TdF-resultatproxyen (FastAPI + procyclingstats).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Cloud Run sender trafik til $PORT (default 8080). Én worker er rigeligt:
# scraping er let, og finalitets-logikken holder antallet af PCS-kald lavt.
CMD exec uvicorn tdf_api:app --host 0.0.0.0 --port ${PORT}
