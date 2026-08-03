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

Superliga-spillet (datakilde: Flashscore/livescore.in, se flashscore_client.py):
  GET  /api/superliga/fixtures?day={-7..7}   -> dagens Superliga-kampe
  GET  /api/superliga/match/{event_id}       -> meta + hændelser + statistik
  GET  /api/superliga/season?from=-7&to=7    -> kampe over flere dage (dedupet)

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

from fastapi import FastAPI, Header, HTTPException, Query
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
    # serve_stage: final → cache; ikke-final → gen-scrape (TTL-begrænset,
    # også når intet er cachet endnu). Cachen kan dermed ALDRIG fryse
    # forældede data fast på en åben etape — og 425-pollere på en ukørt
    # etape udløser højst ét letour-scrape pr. TTL.
    try:
        data = await asyncio.to_thread(service.serve_stage, n)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if not data or not data.get("results_present"):
        raise HTTPException(status_code=425, detail="resultat ikke klar endnu")
    return data


@app.get("/api/standings")
async def standings() -> dict:
    return await asyncio.to_thread(service.current_standings)


@app.get("/api/stage-info")
async def stage_info_all() -> dict:
    """Stamdata (km, type, højdemeter D+, sprint/bjerg-point) for alle etaper."""
    from letour_stageinfo import scrape_all_stage_info
    data = await asyncio.to_thread(scrape_all_stage_info)
    return {"year": service.year, "stages": data}


@app.get("/api/stage-info/{n}")
async def stage_info_one(n: int) -> dict:
    """Stamdata for én etape (km, type, højdemeter D+, sprint/bjerg-point)."""
    from letour_stageinfo import scrape_stage_info
    return await asyncio.to_thread(scrape_stage_info, n)


@app.get("/api/startlist")
async def startlist() -> dict:
    """Startliste (udtagne ryttere pr. hold) fra TV2's hold-og-ryttere-artikel."""
    from tv2_startlist import scrape_startlist
    teams = await asyncio.to_thread(scrape_startlist)
    announced = sum(1 for t in teams if t.get("announced"))
    return {"teams": teams, "announced": announced, "total": len(teams)}


@app.get("/api/debug/{n}")
async def debug(n: int) -> dict:
    """Diagnostik for én etape (hvad proxyen faktisk ser fra letour)."""
    from letour_results import debug_stage
    return await asyncio.to_thread(debug_stage, n)


# ----------------------------------------------------------------------------
# Superliga (Flashscore/livescore.in) — datakilde for Superliga-spillet.
# Se flashscore_client.py (HTTP/signatur/cache) og flashscore_feed.py (parsere).
# ----------------------------------------------------------------------------

@app.get("/api/superliga/fixtures")
async def superliga_fixtures(day: int = 0) -> dict:
    """Dagens (± day, -7..7) Superliga-kampe fra Flashscores dagsliste."""
    from flashscore_client import fetch_daily
    if not -7 <= day <= 7:
        raise HTTPException(status_code=400, detail="day skal være i -7..7")
    matches = await asyncio.to_thread(fetch_daily, day)
    return {"day": day, "matches": matches}


@app.get("/api/superliga/match/{event_id}")
async def superliga_match(event_id: str) -> dict:
    """Samlet kampbillede: meta + hændelser + statistik. Tolerant over for
    delvise fejl — de dele der lykkes, serveres (resten er None + fejltekst),
    så en enkelt upstream-hikke ikke blænder hele kampsiden."""
    from flashscore_client import fetch_incidents, fetch_meta, fetch_stats

    out: dict = {"event_id": event_id, "errors": {}}
    for key, fn in (("meta", fetch_meta), ("incidents", fetch_incidents), ("stats", fetch_stats)):
        try:
            out[key] = await asyncio.to_thread(fn, event_id)
        except Exception as e:  # noqa: BLE001 — delvise svar er hele pointen
            out[key] = None
            out["errors"][key] = str(e)
    if out["meta"] is None and out["incidents"] is None and out["stats"] is None:
        raise HTTPException(status_code=502, detail=out["errors"])
    return out


@app.get("/api/superliga/season")
async def superliga_season(
    # "from" er et Python-nøgleord → Query-alias.
    from_: int = Query(default=-7, alias="from", ge=-7, le=7),
    to: int = Query(default=7, ge=-7, le=7),
) -> dict:
    """Superliga-kampe over et interval af dags-offsets (Flashscore kan kun
    levere -7..7 dage ad gangen). Dedupe pr. event_id — en kamp der glider
    over midnat kan optræde i to dagslister."""
    from flashscore_client import fetch_daily

    if from_ > to:
        raise HTTPException(status_code=400, detail="from skal være <= to")
    seen: set = set()
    matches: list = []
    errors: dict = {}
    for day in range(from_, to + 1):
        try:
            for m in await asyncio.to_thread(fetch_daily, day):
                if m["event_id"] not in seen:
                    seen.add(m["event_id"])
                    matches.append(m)
        except Exception as e:  # noqa: BLE001 — én død dag skal ikke vælte resten
            errors[day] = str(e)
    matches.sort(key=lambda m: (m["kickoff"] or 0))
    return {"from": from_, "to": to, "matches": matches, "errors": errors}


@app.post("/api/refresh")
async def refresh(x_refresh_token: str | None = Header(default=None)) -> dict:
    _check_token(x_refresh_token)
    data = await asyncio.to_thread(service.refresh_latest)
    return {"refreshed": data["number"] if data else None}


@app.post("/api/refresh/{n}")
async def refresh_one(n: int, x_refresh_token: str | None = Header(default=None)) -> dict:
    _check_token(x_refresh_token)
    try:
        # force=True: det manuelle endpoint skal ALTID kunne bryde en (evt.
        # forkert) frosset etape op og scrape forfra.
        data = await asyncio.to_thread(service.refresh_stage, n, None, True)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"refreshed": n, "results_present": data.get("results_present", False)}
