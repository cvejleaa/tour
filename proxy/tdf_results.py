"""
tdf_results.py
==============
Service-lag der henter Tour de France etaperesultater + alle indbyggede
klassementer (samlet/gul, sprint/grøn, bjerg/prikket, ungdom/hvid, hold)
via `procyclingstats`-pakken, lige efter en etape er afsluttet.

Nøglefakta der gør det effektivt og høfligt:
  - En PCS-etapeside indeholder ALLE klassementer i én HTML. Ét Stage-objekt
    = ét HTTP-request, hvorfra results()/gc()/points()/kom()/youth()/teams()
    alle parses. Hele Touren = 21 requests, hver hentet én gang.
  - Når en etape er overstået og resultatet ligger der, fryses det og hentes
    aldrig igen ("final"). Kun dagens igangværende etape genhentes.

Ingen FastAPI-afhængighed her — ren logik, så den er nem at teste og genbruge.
Scraping er synkront (pakken bruger requests/cloudscraper); kald det fra en
threadpool i din async API (se tdf_api.py).

    pip install procyclingstats
"""

from __future__ import annotations

import json
import os
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable

from procyclingstats import Race, Stage

# ----------------------------------------------------------------------------
# Konfiguration
# ----------------------------------------------------------------------------

RACE_SLUG = os.getenv("RACE_SLUG", "tour-de-france")
RACE_YEAR = int(os.getenv("RACE_YEAR", str(date.today().year)))
PCS_BASE = "https://www.procyclingstats.com/"
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))

# Klassement-metoder på Stage → pæne danske labels + trøjefarve.
# Rækkefølgen styrer rækkefølgen i output.
CLASSIFICATIONS: list[dict[str, str]] = [
    {"method": "results", "key": "etape",  "label": "Etaperesultat",       "jersey": "—"},
    {"method": "gc",      "key": "samlet", "label": "Samlet (GC)",          "jersey": "gul"},
    {"method": "points",  "key": "sprint", "label": "Sprint (point)",       "jersey": "grøn"},
    {"method": "kom",     "key": "bjerg",  "label": "Bjerg (KOM)",          "jersey": "prikket"},
    {"method": "youth",   "key": "ungdom", "label": "Ungdom",               "jersey": "hvid"},
    {"method": "teams",   "key": "hold",   "label": "Holdkonkurrence",      "jersey": "—"},
]


# ----------------------------------------------------------------------------
# Cache-interface (default: JSON på disk; se README for Postgres-swap)
# ----------------------------------------------------------------------------

class JsonFileCache:
    """Simpel disk-cache. Én fil pr. etape + én fil for etapelisten."""

    def __init__(self, data_dir: Path = DATA_DIR) -> None:
        self.dir = data_dir
        self.dir.mkdir(parents=True, exist_ok=True)

    def _stage_path(self, year: int, n: int) -> Path:
        return self.dir / f"{RACE_SLUG}-{year}-stage-{n}.json"

    def _list_path(self, year: int) -> Path:
        return self.dir / f"{RACE_SLUG}-{year}-stages.json"

    def get_stage(self, year: int, n: int) -> dict[str, Any] | None:
        p = self._stage_path(year, n)
        return json.loads(p.read_text("utf-8")) if p.exists() else None

    def set_stage(self, year: int, n: int, data: dict[str, Any]) -> None:
        self._stage_path(year, n).write_text(
            json.dumps(data, ensure_ascii=False, indent=2), "utf-8"
        )

    def get_stage_list(self, year: int) -> list[dict[str, Any]] | None:
        p = self._list_path(year)
        return json.loads(p.read_text("utf-8")) if p.exists() else None

    def set_stage_list(self, year: int, data: list[dict[str, Any]]) -> None:
        self._list_path(year).write_text(
            json.dumps(data, ensure_ascii=False, indent=2), "utf-8"
        )


# ----------------------------------------------------------------------------
# Scraping (bedste-forsøg, defensivt)
# ----------------------------------------------------------------------------

def _safe(fn: Callable[[], Any], default: Any) -> Any:
    """PCS-parsing kan kaste hvis et felt/klassement mangler. Sluger og defaulter."""
    try:
        return fn()
    except Exception:
        return default


def _stage_number_from_url(stage_url: str) -> int | None:
    # "race/tour-de-france/2026/stage-7" -> 7
    tail = stage_url.rstrip("/").rsplit("stage-", 1)
    if len(tail) == 2 and tail[1].isdigit():
        return int(tail[1])
    return None


def scrape_stage_list(year: int = RACE_YEAR) -> list[dict[str, Any]]:
    """
    Henter etapeoversigten (én request). Returnerer liste med:
    number, date (YYYY-MM-DD el. None), name, url, profile_icon.
    """
    race = Race(f"race/{RACE_SLUG}/{year}")
    rows = _safe(race.stages, [])
    out: list[dict[str, Any]] = []
    for r in rows:
        url = r.get("stage_url", "")
        n = _stage_number_from_url(url)
        # Race.stages() giver dato i MM-DD; gør den til fuld dato.
        md = r.get("date")
        full_date = f"{year}-{md}" if md and len(md) == 5 else None
        out.append(
            {
                "number": n,
                "date": full_date,
                "name": r.get("stage_name"),
                "url": url,
                "profile_icon": r.get("profile_icon"),
            }
        )
    # Behold kun rigtige etaper med nummer, sorteret.
    out = [s for s in out if s["number"] is not None]
    out.sort(key=lambda s: s["number"])
    return out


def scrape_stage(stage_url: str) -> dict[str, Any]:
    """
    ÉT request → metadata + alle klassementer. Tom liste hvor et klassement
    ikke findes endnu (fx før etapen er kørt, eller hold-/ungdom på TTT).
    """
    stage = Stage(stage_url)  # henter HTML her

    classifications: dict[str, Any] = {}
    for c in CLASSIFICATIONS:
        rows = _safe(getattr(stage, c["method"]), [])
        classifications[c["key"]] = {
            "label": c["label"],
            "jersey": c["jersey"],
            "rows": rows,
        }

    results_present = bool(classifications["etape"]["rows"])
    stage_date = _safe(stage.date, None)

    return {
        "url": stage_url,
        "number": _stage_number_from_url(stage_url),
        "meta": {
            "date": stage_date,
            "departure": _safe(stage.departure, None),
            "arrival": _safe(stage.arrival, None),
            "distance_km": _safe(stage.distance, None),
            "stage_type": _safe(stage.stage_type, None),
            "won_how": _safe(stage.won_how, None),
            "profile_icon": _safe(stage.profile_icon, None),
            "avg_speed_winner": _safe(stage.avg_speed_winner, None),
        },
        "classifications": classifications,
        "results_present": results_present,
        "scraped_at": datetime.utcnow().isoformat() + "Z",
        "pcs_base": PCS_BASE,
    }


# ----------------------------------------------------------------------------
# Service med cache + finalitet
# ----------------------------------------------------------------------------

class StageResultsService:
    def __init__(self, cache: JsonFileCache | None = None, year: int = RACE_YEAR) -> None:
        self.cache = cache or JsonFileCache()
        self.year = year

    # ---- etapeliste ----
    def stage_list(self, force: bool = False) -> list[dict[str, Any]]:
        cached = None if force else self.cache.get_stage_list(self.year)
        if cached is not None:
            return cached
        data = scrape_stage_list(self.year)
        self.cache.set_stage_list(self.year, data)
        return data

    # ---- enkelt etape (med cache) ----
    def get_stage(self, n: int) -> dict[str, Any] | None:
        return self.cache.get_stage(self.year, n)

    def _is_final(self, stage_data: dict[str, Any]) -> bool:
        """Final = resultat ligger der OG etapedatoen er i fortiden."""
        if not stage_data.get("results_present"):
            return False
        d = stage_data.get("meta", {}).get("date")
        try:
            return d is not None and datetime.fromisoformat(d).date() < date.today()
        except Exception:
            return False

    def refresh_stage(self, n: int, stage_url: str | None = None) -> dict[str, Any]:
        """
        Henter (eller genhenter) en etape. Springer over hvis allerede 'final'
        i cachen, så vi aldrig scraper en afsluttet etape to gange.
        """
        cached = self.cache.get_stage(self.year, n)
        if cached and self._is_final(cached):
            return cached

        if stage_url is None:
            match = next((s for s in self.stage_list() if s["number"] == n), None)
            if not match:
                raise ValueError(f"Etape {n} findes ikke i etapelisten for {self.year}")
            stage_url = match["url"]

        data = scrape_stage(stage_url)
        # Gem kun hvis der faktisk er et resultat (undgå at cache tomme sider).
        if data["results_present"]:
            self.cache.set_stage(self.year, n, data)
        return data

    def refresh_latest(self) -> dict[str, Any] | None:
        """
        Find nyeste etape hvis dato <= i dag og hent den. Kør denne fra din
        scheduler om aftenen på etapedage. Returnerer den hentede etape (eller
        None hvis ingen etape er kørt endnu).
        """
        today = date.today()
        candidates = []
        for s in self.stage_list():
            d = s.get("date")
            try:
                if d and datetime.fromisoformat(d).date() <= today:
                    candidates.append(s)
            except Exception:
                continue
        if not candidates:
            return None
        latest = max(candidates, key=lambda s: s["number"])
        return self.refresh_stage(latest["number"], latest["url"])

    # ---- aktuelle stillinger (fra nyeste etape der har dem) ----
    def current_standings(self) -> dict[str, Any]:
        """
        Returnerer seneste kendte stilling i hvert klassement ved at tage den
        højest-nummererede cachede etape der indeholder dem.
        """
        stages = self.stage_list()
        numbers = sorted((s["number"] for s in stages), reverse=True)
        result: dict[str, Any] = {"after_stage": None, "classifications": {}}
        for n in numbers:
            data = self.cache.get_stage(self.year, n)
            if not data:
                continue
            result["after_stage"] = n
            for key, block in data["classifications"].items():
                if block["rows"] and key not in result["classifications"]:
                    result["classifications"][key] = block
            # Stop når vi har alle klassementer, eller efter første cachede etape.
            if result["classifications"]:
                break
        return result
