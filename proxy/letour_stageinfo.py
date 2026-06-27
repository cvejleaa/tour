"""
letour_stageinfo.py
===================
Henter per-etape STAMDATA fra **letour.fr** etapesiderne (`/en/stage-{N}`):
distance (km), etapetype (Flat/Hilly/Mountain/ITT/TTT), HØJDEMETER (D+ i meter)
samt hvilke klassementer der uddeler point på etapen (sprint/bjerg).

I modsætning til ranking-fragmenterne (se ``letour_results.py``) er disse data
server-renderet direkte i etapesidens HTML, så ét GET pr. etape er nok.

Sidens opbygning (bekræftet mod gemte 2025-sider):

  * Etapesiden viser et lille carousel med den AKTUELLE etape + naboetaper.
    Den aktuelle etape er pakket i ``<h1 ... class="stageHeaderClass">Stage N</h1>``
    mens naboerne er ``<h2>``. Vi scoper derfor til netop den aktuelle etape ved
    at læse fra dens ``stageHeaderClass``-markør og frem til den næste.
  * Inden for det scope står tre ``stageHeader__length``-blokke med labels
    ``Length`` (xx.x km), ``Type`` (Flat/Hilly/…) og ``D+`` (xxxx m).
  * Et afsnit ``Points awarded on Stage N`` har en tabel hvor hver rækkes
    første celle har et ``picto picto--X``-ikon:
      - ``picto--n``           → mellemsprint  ⇒ sprintpoint på etapen
      - ``picto--1..4``/``--h`` → kategoriseret stigning (KOM) ⇒ bjergpoint
      - ``picto--a``           → ankomst/mål (findes på HVER etape, også ITT/TTT)
    Mål-markøren (``picto--a``) optræder på alle etaper og er derfor IKKE en
    pålidelig sprint-indikator — ellers ville selv enkeltstarter (ITT/TTT) tælle
    som sprint. Vi kræver en eksplicit mellemsprint-markør (``picto--n``) for at
    sætte ``sprint``, så tempo-etaper korrekt får ``sprint=False``.

Output (én etape)::

    {
      "stage": 5,
      "km": 158.3,
      "type": "flat",              # flat|hilly|mountain|itt|ttt|None
      "elevation": 1600,           # D+ i meter (int) | None
      "awards": {"sprint": True, "mountain": True},
    }
"""

from __future__ import annotations

import os
import re
import html as ihtml
from typing import Any

import requests

LETOUR_BASE = os.getenv("LETOUR_BASE", "https://www.letour.fr")
LETOUR_LANG = os.getenv("LETOUR_LANG", "en")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# letour Type-tekst -> vores nøgle.
TYPE_MAP = {
    "flat": "flat",
    "hilly": "hilly",
    "mountain": "mountain",
    "individual time-trial": "itt",
    "individual time trial": "itt",
    "team time-trial": "ttt",
    "team time trial": "ttt",
}


def _strip(s: str) -> str:
    """HTML-tags væk, whitespace samlet, entiteter af-escaped."""
    return ihtml.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


def _current_stage_scope(page_html: str, stage: int) -> str:
    """Returnér HTML-udsnittet for NETOP den aktuelle etape.

    Etapesiden carousel'er den aktuelle etape (i ``<h1>``) sammen med naboerne
    (i ``<h2>``). Vi finder ``stageHeaderClass">Stage {stage}`` og klipper frem
    til næste ``stageHeaderClass`` (eller sidens slut), så Length/Type/D+ kun
    matches inden for den aktuelle etape. Falder tilbage til hele siden hvis
    markøren ikke findes.
    """
    start = re.search(rf'stageHeaderClass"\s*>\s*Stage\s*{stage}\b', page_html)
    if not start:
        return page_html
    rest = page_html[start.end():]
    nxt = re.search(r'stageHeaderClass"\s*>\s*Stage\s*\d+', rest)
    return rest[: nxt.start()] if nxt else rest


def _length_blocks(scope_html: str) -> dict[str, str]:
    """Træk {label: value} for Length/Type/D+ ud af et etape-scope."""
    out: dict[str, str] = {}
    for m in re.finditer(
        r'stageHeader__length__label"\s*>\s*([^<]+?)\s*</span>\s*</?br[^>]*>\s*([^<]+)',
        scope_html,
        re.I,
    ):
        out[_strip(m.group(1)).lower()] = _strip(m.group(2))
    return out


def _parse_km(value: str | None) -> float | None:
    if not value:
        return None
    m = re.search(r"([\d]+(?:[.,]\d+)?)", value)
    return float(m.group(1).replace(",", ".")) if m else None


def _parse_elevation(value: str | None) -> int | None:
    if not value:
        return None
    m = re.search(r"([\d][\d\s.]*)", value)
    if not m:
        return None
    digits = re.sub(r"[^\d]", "", m.group(1))
    return int(digits) if digits else None


def _parse_type(value: str | None) -> str | None:
    if not value:
        return None
    return TYPE_MAP.get(value.strip().lower())


def _awards(page_html: str, stage: int) -> dict[str, bool]:
    """Afgør om der uddeles sprint- og/eller bjergpoint på etapen.

    Bruges ``Points awarded on Stage N``-tabellen: pr. række kigger vi på
    ``picto picto--X``:  ``n`` = mellemsprint (⇒ sprint), cifre ``1..4`` og
    ``h`` (HC) = kategoriseret stigning (⇒ bjerg). ``a`` (mål) ignoreres, da
    den findes på hver etape og derfor ikke skelner sprint-etaper fra tempo.
    Hvis afsnittet ikke findes, falder vi tilbage på etapetypen
    (mountain/hilly ⇒ bjerg).
    """
    sprint = False
    mountain = False
    m = re.search(rf"Points awarded on Stage\s*{stage}\b", page_html, re.I)
    if m:
        # Afsnittet rummer netop denne etapes point-tabel; et rigeligt vindue
        # dækker tabellen uden at løbe ind i andre etaper.
        chunk = page_html[m.start(): m.start() + 16000]
        pictos = set(re.findall(r"picto\s+picto--([a-z0-9]+)", chunk, re.I))
        for p in pictos:
            pl = p.lower()
            if pl == "n":
                sprint = True
            elif pl == "h" or pl.isdigit():
                mountain = True
    return {"sprint": sprint, "mountain": mountain}


def parse_stage_info(page_html: str, stage: int) -> dict[str, Any]:
    """Ren parser: tag en etapesides HTML → vores stamdata-dict. Ingen IO."""
    scope = _current_stage_scope(page_html, stage)
    blocks = _length_blocks(scope)
    km = _parse_km(blocks.get("length"))
    stype = _parse_type(blocks.get("type"))
    elevation = _parse_elevation(blocks.get("d+"))
    awards = _awards(page_html, stage)
    # Fald-tilbage: hvis point-tabellen ikke kunne læses, udled bjerg fra typen.
    if not awards["mountain"] and stype in ("mountain", "hilly"):
        awards["mountain"] = True
    return {
        "stage": stage,
        "km": km,
        "type": stype,
        "elevation": elevation,
        "awards": awards,
    }


def _get(session: requests.Session, path: str) -> str:
    r = session.get(LETOUR_BASE + path, headers=HEADERS, timeout=60)
    r.raise_for_status()
    return r.text


def scrape_stage_info(stage: int, session: requests.Session | None = None) -> dict[str, Any]:
    """GET ``/{lang}/stage-{stage}`` og parse stamdata for netop den etape."""
    own = session is None
    sess = session or requests.Session()
    try:
        page = _get(sess, f"/{LETOUR_LANG}/stage-{stage}")
    finally:
        if own:
            sess.close()
    return parse_stage_info(page, stage)


def scrape_all_stage_info(count: int = 21) -> list[dict[str, Any]]:
    """Loop 1..count og hent stamdata for hver etape (genbrug session, vær mild).

    Defensiv: en enkelt etape der fejler (404/parse) stopper ikke de øvrige —
    den udelades blot, så delvise data stadig kan bruges af ingest'en.
    """
    out: list[dict[str, Any]] = []
    sess = requests.Session()
    try:
        for n in range(1, count + 1):
            try:
                out.append(scrape_stage_info(n, session=sess))
            except Exception:  # noqa: BLE001
                continue
    finally:
        sess.close()
    return out
