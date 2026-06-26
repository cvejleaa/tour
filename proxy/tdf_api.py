"""
tdf_api.py
==========
Tyndt FastAPI-lag oven på tdf_results.StageResultsService.

Endpoints:
  GET  /api/stages              -> etapeoversigt (liste m. metadata)
  GET  /api/stages/{n}          -> fuld etape: resultat + alle klassementer
  GET  /api/standings           -> aktuelle stillinger i hvert klassement
  POST /api/refresh             -> hent nyeste afsluttede etape (sikret)
  POST /api/refresh/{n}         -> hent en specifik etape (sikret)
  GET  /healthz

Scraping er synkront → vi kører det i en threadpool (asyncio.to_thread) så
event-loopet ikke blokeres.

To måder at trigge opdatering efter en etape:
  A) Always-on (Raspberry Pi): APScheduler-jobbet nedenfor kører automatisk
     hvert 15. min i et aftenvindue og henter nyeste etape til den er final.
  B) Serverless (Cloud Run): drop scheduleren, og lad Cloud Scheduler kalde
     POST /api/refresh med din REFRESH_TOKEN i et aftenvindue på etapedage.

    pip install fastapi "uvicorn[standard]" procyclingstats apscheduler
    export ALLOWED_ORIGINS="https://din-side.web.app"
    export REFRESH_TOKEN="et-langt-tilfaeldigt-secret"
    export ENABLE_SCHEDULER=1          # kun på always-on host
    uvicorn tdf_api:app --host 0.0.0.0 --port 8080
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from tdf_results import StageResultsService

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
REFRESH_TOKEN = os.getenv("REFRESH_TOKEN", "")
ENABLE_SCHEDULER = os.getenv("ENABLE_SCHEDULER", "0") == "1"


def _make_cache():
    """Postgres-cache når DATABASE_URL er sat (Cloud Run); ellers JSON-fil (Pi)."""
    if os.getenv("DATABASE_URL"):
        from pg_cache import PgCache
        return PgCache()
    return None  # StageResultsService falder tilbage til JsonFileCache


service = StageResultsService(cache=_make_cache())


def _check_token(token: str | None) -> None:
    if not REFRESH_TOKEN or token != REFRESH_TOKEN:
        raise HTTPException(status_code=401, detail="ugyldig refresh-token")


# ----------------------------------------------------------------------------
# Valgfri in-process scheduler (kun til always-on host)
# ----------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = None
    if ENABLE_SCHEDULER:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger

        scheduler = AsyncIOScheduler(timezone="Europe/Copenhagen")
        # Hvert 15. min mellem 16 og 21 (typisk etape-slut → aften).
        scheduler.add_job(
            lambda: asyncio.create_task(asyncio.to_thread(service.refresh_latest)),
            CronTrigger(hour="16-21", minute="*/15"),
            id="refresh_latest",
            max_instances=1,
            coalesce=True,
        )
        scheduler.start()
    try:
        yield
    finally:
        if scheduler:
            scheduler.shutdown(wait=False)


app = FastAPI(title="TdF etaperesultater", version="1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True, "scheduler": ENABLE_SCHEDULER}


@app.get("/api/stages")
async def stages() -> dict:
    data = await asyncio.to_thread(service.stage_list)
    # Markér hvilke der allerede har et cachet resultat.
    cached = {s["number"]: bool(service.get_stage(s["number"])) for s in data}
    for s in data:
        s["has_results"] = cached.get(s["number"], False)
    return {"year": service.year, "stages": data}


@app.get("/api/stages/{n}")
async def stage(n: int) -> dict:
    data = service.get_stage(n)
    if data is None:
        # Endnu ikke cachet → forsøg en hentning (fx hvis du tilgår en gammel etape).
        try:
            data = await asyncio.to_thread(service.refresh_stage, n)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
    if not data or not data.get("results_present"):
        raise HTTPException(status_code=425, detail="resultat ikke klar endnu")
    return data


@app.get("/api/standings")
async def standings() -> dict:
    return await asyncio.to_thread(service.current_standings)


@app.post("/api/refresh")
async def refresh(x_refresh_token: str | None = Header(default=None)) -> dict:
    _check_token(x_refresh_token)
    data = await asyncio.to_thread(service.refresh_latest)
    return {"refreshed": data["number"] if data else None}


@app.post("/api/refresh/{n}")
async def refresh_one(n: int, x_refresh_token: str | None = Header(default=None)) -> dict:
    _check_token(x_refresh_token)
    try:
        data = await asyncio.to_thread(service.refresh_stage, n)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"refreshed": n, "results_present": data.get("results_present", False)}
