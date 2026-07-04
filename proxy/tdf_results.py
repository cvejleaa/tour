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
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

# Datakilde: letour.fr (officiel, ikke datacenter-blokeret). Adapteren leverer
# samme output-form som dette modul tidligere gjorde via ProCyclingStats.
from letour_results import scrape_stage as _letour_scrape_stage
from letour_results import scrape_stage_list as _letour_scrape_stage_list

# ----------------------------------------------------------------------------
# Konfiguration
# ----------------------------------------------------------------------------

RACE_SLUG = os.getenv("RACE_SLUG", "tour-de-france")
RACE_YEAR = int(os.getenv("RACE_YEAR", str(date.today().year)))
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))


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

def _stage_number_from_url(stage_url: str) -> int | None:
    """Udleder etapenummer af en url/streng der indeholder 'stage-N'."""
    m = re.search(r"stage-(\d+)", str(stage_url))
    return int(m.group(1)) if m else None


def scrape_stage_list(year: int = RACE_YEAR) -> list[dict[str, Any]]:
    """Etapeoversigt (number, date, name, url) via letour-adapteren."""
    return _letour_scrape_stage_list()


def scrape_stage(stage_ref: Any) -> dict[str, Any]:
    """Henter en etape (resultat + alle klassementer) via letour-adapteren.
    `stage_ref` kan være et nummer eller en url/streng med 'stage-N'."""
    n = stage_ref if isinstance(stage_ref, int) else _stage_number_from_url(stage_ref)
    if n is None:
        raise ValueError(f"Kan ikke udlede etapenummer af {stage_ref!r}")
    return _letour_scrape_stage(n)


# ----------------------------------------------------------------------------
# Service med cache + finalitet
# ----------------------------------------------------------------------------

class StageResultsService:
    # Ikke-finale etaper gen-scrapes højst så ofte pr. instans (høflighed).
    REFRESH_TTL_S = 240

    def __init__(self, cache: JsonFileCache | None = None, year: int = RACE_YEAR) -> None:
        self.cache = cache or JsonFileCache()
        self.year = year
        self._last_refresh: dict[int, float] = {}

    # ---- etapeliste ----
    def stage_list(self, force: bool = False) -> list[dict[str, Any]]:
        # Foretræk en NON-tom cache; en tom liste betyder typisk at skrabningen
        # fejlede, så den cacher vi ikke (selvhelende ved næste forsøg).
        if not force:
            cached = self.cache.get_stage_list(self.year)
            if cached:
                return cached
        data = scrape_stage_list(self.year)
        if data:
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

    def refresh_stage(self, n: int, stage_url: str | None = None, force: bool = False) -> dict[str, Any]:
        """
        Henter (eller genhenter) en etape. Springer over hvis allerede 'final'
        i cachen, så vi aldrig scraper en afsluttet etape to gange.
        `force=True` scraper ALTID — bruges af serve_stage (ikke-final etape)
        og af det manuelle POST /api/refresh/{n}, så et forkert frosset
        payload (fx testdata cachet før løbsstart) altid kan brydes op.
        """
        cached = self.cache.get_stage(self.year, n)
        if cached and self._is_final(cached) and not force:
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

    def serve_stage(self, n: int) -> dict[str, Any] | None:
        """
        Dét API'et skal servere: final etape → cache; IKKE-final etape →
        gen-scrape (højst hvert REFRESH_TTL_S sekund pr. instans), så cachen
        aldrig kan fryse forældede/provisoriske data fast, mens etapen stadig
        er åben. Fejler skrabningen, serveres den seneste cache i stedet.
        (Uden dette kunne et payload cachet FØR løbsstart — fx en testkørsel
        med sidste års data — blive serveret for evigt, fordi GET-stien aldrig
        scrapede igen.)
        """
        import time

        cached = self.cache.get_stage(self.year, n)
        if cached and self._is_final(cached):
            return cached
        now = time.monotonic()
        if cached and (now - self._last_refresh.get(n, -1e9)) < self.REFRESH_TTL_S:
            return cached
        self._last_refresh[n] = now
        try:
            return self.refresh_stage(n, force=True)
        except Exception:
            return cached

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
