"""
flashscore_client.py
====================
HTTP-lag mod Flashscore/livescore.in's interne API'er (datakilde for
Superliga-spillet). Parserne er RENE og ligger i ``flashscore_feed.py`` —
dette modul står for signatur, høflige headers, cache og fejl-retry.

To upstream-API'er (begge bekræftet med almindelige server-side requests):

  * Feed-API'et ``https://50.flashscore.ninja/50/x/feed/<feed>`` kræver en
    ``x-fsign``-header. Signaturen ROTERER og ligger indlejret i livescore.in's
    JS-bundle, så vi henter forsiden → finder bundle-URL'en → regex'er
    signaturen ud. Den caches; svarer feed-API'et 401/403/404, gen-hentes den
    én gang og kaldet prøves igen (typisk tegn på rotation).
  * GraphQL-API'et ``https://50.ds.lsapp.eu/pq_graphql`` (statistik, xG m.m.)
    kræver INGEN signatur — kun Origin/Referer/UA.

Cache: Postgres (nøgle/værdi + hentetid) når ``DATABASE_URL`` er sat (Cloud
Run — flygtigt filsystem, jf. ``pg_cache.py``), ellers in-memory TTL. TTL'er:
dagsliste 15 min, hændelser/statistik 60 s (live-opdatering), meta 1 t.

Alt her er synkront (requests) — kald det fra en threadpool i API-laget,
præcis som de øvrige moduler (se ``tdf_api.py``).
"""

from __future__ import annotations

import os
import re
import time
from typing import Any, Callable

import requests

from flashscore_feed import parse_daily, parse_incidents, parse_match_meta

FEED_BASE = os.getenv("FLASHSCORE_FEED_BASE", "https://50.flashscore.ninja/50/x/feed")
GRAPHQL_BASE = os.getenv("FLASHSCORE_GRAPHQL_BASE", "https://50.ds.lsapp.eu/pq_graphql")
SITE_BASE = os.getenv("FLASHSCORE_SITE_BASE", "https://www.livescore.in")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Origin": SITE_BASE,
    "Referer": SITE_BASE + "/",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9,da;q=0.8",
}

# TTL'er (sekunder) pr. datatype.
TTL_DAILY = 15 * 60
TTL_LIVE = 60          # hændelser + statistik: skal følge med under kamp
TTL_META = 60 * 60


def _http_get(url: str, headers: dict[str, str], timeout: int = 30) -> requests.Response:
    """Ét sted at ramme nettet — monkeypatches i tests (ingen live kald der)."""
    return requests.get(url, headers=headers, timeout=timeout)


# ----------------------------------------------------------------------------
# x-fsign-signatur (roterer; indlejret i sitets JS-bundle)
# ----------------------------------------------------------------------------

# Bundle-URL i forsidens HTML. Bundlen har historisk heddet core.<hash>.js /
# app.<hash>.js under /res/…/build/ — vi tager alle script-src og prøver de
# mest lovende først.
_SCRIPT_SRC_RE = re.compile(r'<script[^>]+src="([^"]+\.js[^"]*)"', re.I)

# Signaturen i bundlen. Verificeret 20/7-2026 mod det rigtige site: den ligger
# i liveTable.<hash>.js i et opslag pr. feed-type som `[i.EVENT]:"SW9D1eZo"`.
# Vi prøver dét mønster først og falder tilbage til et generisk `fsign:"…"`.
_FSIGN_EVENT_RE = re.compile(r'\[\s*\w+\.EVENT\s*\]\s*:\s*["\']([A-Za-z0-9]{6,16})["\']')
_FSIGN_RE = re.compile(r'''["']?fsign["']?\s*[:=]\s*["']([A-Za-z0-9]{6,16})["']''')


class FsignManager:
    """Henter, cacher og gen-opfrisker x-fsign-signaturen.

    ``FLASHSCORE_FSIGN``-miljøvariablen kortslutter alt (nød-override hvis
    site-skrabningen knækker: sæt den manuelt og redeploy).
    """

    MAX_BUNDLES = 5  # prøv højst så mange script-filer pr. opfriskning

    def __init__(self) -> None:
        self._fsign: str | None = None

    def get(self, force: bool = False) -> str:
        env = os.getenv("FLASHSCORE_FSIGN")
        if env:
            return env
        if self._fsign and not force:
            return self._fsign
        self._fsign = self._discover()
        return self._fsign

    def _discover(self) -> str:
        html = _http_get(SITE_BASE + "/", HEADERS).text
        srcs = _SCRIPT_SRC_RE.findall(html)
        # Relative stier → absolutte; core/app-bundles først (der bor signaturen).
        srcs = [s if s.startswith("http") else SITE_BASE + s for s in srcs]
        # liveTable-bundlen bærer signaturen (verificeret); core/app som backup.
        def _prio(s):
            if "liveTable" in s: return 0
            if "core" in s or "app" in s: return 1
            return 2
        srcs.sort(key=lambda s: (_prio(s), len(s)))
        for src in srcs[: self.MAX_BUNDLES]:
            try:
                sign = extract_fsign(_http_get(src, HEADERS).text)
            except requests.RequestException:
                continue
            if sign:
                return sign
        raise RuntimeError("x-fsign ikke fundet i nogen JS-bundle fra " + SITE_BASE)


def extract_fsign(js_text: str) -> str | None:
    """Ren regex-del af signatur-jagten (testes isoleret mod JS-snippets)."""
    m = _FSIGN_EVENT_RE.search(js_text) or _FSIGN_RE.search(js_text)
    return m.group(1) if m else None


_fsign_manager = FsignManager()


def _feed_get(feed: str) -> str:
    """GET ét feed med signatur; ved 401/403/404 opfriskes signaturen én gang
    og kaldet gentages (rotation ligner ellers en død ressource)."""
    url = f"{FEED_BASE}/{feed}"
    headers = {**HEADERS, "x-fsign": _fsign_manager.get()}
    r = _http_get(url, headers)
    if r.status_code in (401, 403, 404):
        headers["x-fsign"] = _fsign_manager.get(force=True)
        r = _http_get(url, headers)
    r.raise_for_status()
    return r.text


def _graphql_get(hash_: str, event_id: str, extra: str = "&projectId=50") -> dict[str, Any]:
    url = f"{GRAPHQL_BASE}?_hash={hash_}&eventId={event_id}{extra}"
    r = _http_get(url, HEADERS)
    r.raise_for_status()
    return r.json()


# ----------------------------------------------------------------------------
# Cache: Postgres når DATABASE_URL er sat, ellers in-memory. Samme mønster som
# pg_cache.py (idempotent skema, jsonb), men generisk nøgle/værdi + hentetid,
# da TTL her afgøres ved LÆSNING (dagsliste 15 min ≠ hændelser 60 s).
# ----------------------------------------------------------------------------

class MemTTLCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str, ttl_s: int) -> Any | None:
        hit = self._store.get(key)
        if not hit:
            return None
        fetched_at, data = hit
        return data if (time.time() - fetched_at) < ttl_s else None

    def set(self, key: str, data: Any) -> None:
        self._store[key] = (time.time(), data)


class PgTTLCache:
    """Nøgle/værdi-cache i Postgres (jsonb + hentetid). Se pg_cache.py for
    hvorfor: Cloud Run-filsystemet er flygtigt."""

    def __init__(self, dsn: str | None = None) -> None:
        import psycopg  # importeres kun når Postgres faktisk bruges

        self._psycopg = psycopg
        self.dsn = dsn or os.environ["DATABASE_URL"]
        with self._conn() as c, c.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS flashscore_cache (
                    key        text PRIMARY KEY,
                    data       jsonb NOT NULL,
                    fetched_at double precision NOT NULL
                )
                """
            )
            c.commit()

    def _conn(self):
        return self._psycopg.connect(self.dsn)

    def get(self, key: str, ttl_s: int) -> Any | None:
        with self._conn() as c, c.cursor() as cur:
            cur.execute("SELECT data, fetched_at FROM flashscore_cache WHERE key=%s", (key,))
            row = cur.fetchone()
        if not row:
            return None
        data, fetched_at = row
        return data if (time.time() - fetched_at) < ttl_s else None

    def set(self, key: str, data: Any) -> None:
        from psycopg.types.json import Jsonb

        with self._conn() as c, c.cursor() as cur:
            cur.execute(
                """
                INSERT INTO flashscore_cache (key, data, fetched_at)
                VALUES (%s, %s, %s)
                ON CONFLICT (key) DO UPDATE
                    SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at
                """,
                (key, Jsonb(data), time.time()),
            )
            c.commit()


def _make_cache() -> MemTTLCache | PgTTLCache:
    if os.getenv("DATABASE_URL"):
        try:
            return PgTTLCache()
        except Exception:  # noqa: BLE001 — hellere memory-cache end nedetid
            pass
    return MemTTLCache()


_cache = _make_cache()


def _cached(key: str, ttl_s: int, producer: Callable[[], Any]) -> Any:
    hit = _cache.get(key, ttl_s)
    if hit is not None:
        return hit
    data = producer()
    # None cacher vi ikke (typisk en fejlet/tom hentning — selvhelende næste gang).
    if data is not None:
        _cache.set(key, data)
    return data


# ----------------------------------------------------------------------------
# Offentlige hentefunktioner (parsede, cachede)
# ----------------------------------------------------------------------------

def fetch_daily(offset: int = 0, country: str | None = "DENMARK",
                league: str | None = "Superliga") -> list[dict[str, Any]]:
    """Dagens (± offset, -7..7) kampe for én turnering. TTL 15 min.

    Vi cacher den RÅ dagsliste (alle lande), så et andet filter ikke koster et
    nyt upstream-kald. ``f_1_{offset}_3_en_1``: 1=fodbold, 3=UTC-offset?, en=sprog.
    """
    offset = max(-7, min(7, int(offset)))
    raw = _cached(f"daily:{offset}", TTL_DAILY, lambda: _feed_get(f"f_1_{offset}_3_en_1"))
    return parse_daily(raw, country=country, league=league)


def fetch_incidents(event_id: str) -> dict[str, Any]:
    """Hændelsesforløb (mål, kort, udskiftninger) + venue-meta. TTL 60 s."""
    return _cached(
        f"incidents:{event_id}", TTL_LIVE,
        lambda: parse_incidents(_feed_get(f"df_sui_1_{event_id}")),
    )


def fetch_stats(event_id: str) -> dict[str, Any]:
    """Kampstatistik (xG, boldbesiddelse, skud …) via GraphQL ``dsof``. TTL 60 s.

    Returneres råt (``data.findEventById``) — strukturen er allerede JSON og
    frontenden plukker selv; på en endnu ikke spillet kamp er statistikdelene
    bare fraværende.
    """
    return _cached(
        f"stats:{event_id}", TTL_LIVE,
        lambda: _graphql_get("dsof", event_id).get("data", {}).get("findEventById"),
    )


def fetch_meta(event_id: str) -> dict[str, Any]:
    """Kampens stamdata (kickoff, status, slutstilling) fra ``dc``-feedet. TTL 1 t."""
    return _cached(
        f"meta:{event_id}", TTL_META,
        lambda: parse_match_meta(_feed_get(f"dc_1_{event_id}")),
    )
