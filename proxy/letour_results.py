"""
letour_results.py
=================
Henter Tour de France etaperesultat + klassementer fra **letour.fr** (officiel
ASO-side). I modsætning til ProCyclingStats blokerer letour.fr ikke datacenter-
IP'er, så det virker direkte fra Cloud Run — gratis, ingen scraper-proxy.

letour.fr renderer en etape-/rankingside og loader hvert klassement via skjulte
AJAX-fragmenter:  /en/ajax/ranking/{stage}/{type}/{hash}/none
hvor {hash} ligger i sidens `data-ajax-stack`. Vi henter siden, trækker hash'ene
ud, og henter hvert klassement-fragment (HTML-tabeller).

Type-koder (bekræftet mod 2025-data):
  ite = etaperesultat (Q1/Q2)   ipe = sprintpoint PÅ etapen (Q4)
  ime = bjergpoint PÅ etapen(Q3) itg = samlet GC (gul)
  ijg = ungdom (hvid)            etg = holdkonkurrence

Output spejler tdf_results.scrape_stage, så pcsMapping/scoring er uændret:
  classifications[{etape,sprint,bjerg,samlet,ungdom,hold}].rows = [
    {rank, rider_name, rider_url, team_name, points, time}, ...]
"""

from __future__ import annotations

import os
import re
import html as ihtml
from datetime import datetime
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

# letour-type -> (vores nøgle, label, trøje, er_holdtabel)
CLASS_MAP = [
    ("ite", "etape",  "Etaperesultat",  "—",       False),
    ("ipe", "sprint", "Sprint (etape)", "grøn",    False),
    ("ime", "bjerg",  "Bjerg (etape)",  "prikket", False),
    ("itg", "samlet", "Samlet (GC)",    "gul",     False),
    ("ijg", "ungdom", "Ungdom",         "hvid",    False),
    ("etg", "hold",   "Holdkonkurrence", "—",      True),
]


def _get(path: str) -> str:
    r = requests.get(LETOUR_BASE + path, headers=HEADERS, timeout=60)
    r.raise_for_status()
    return r.text


def ajax_urls(page_html: str, stage: int) -> dict[str, str]:
    """Træk alle /en/ajax/ranking/{stage}/{type}/{hash}/none ud (af-escaped)."""
    deesc = page_html.replace("\\/", "/")
    out: dict[str, str] = {}
    for m in re.finditer(rf"/{LETOUR_LANG}/ajax/ranking/{stage}/([a-z]+)/([a-f0-9]+)/none", deesc):
        out.setdefault(m.group(1), m.group(0))
    return out


def _cells(row_html: str) -> list[str]:
    return re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.S | re.I)


def _txt(s: str) -> str:
    return ihtml.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


def _header_period(frag: str) -> int:
    """Antal kolonner pr. logisk post (letour pakker 2-4 poster pr. <tr>)."""
    heads = [_txt(h).lower() for h in re.findall(r"<th[^>]*>(.*?)</th>", frag, re.S | re.I)]
    if not heads:
        return 0
    first = heads[0]
    for i in range(1, len(heads)):
        if heads[i] == first:
            return i
    return len(heads)


def _parse_points(s: str) -> int | None:
    m = re.search(r"(-?\d+)\s*PTS", s, re.I) or re.search(r"^\s*(-?\d+)\s*$", s)
    return int(m.group(1)) if m else None


def parse_rider_table(frag: str) -> list[dict[str, Any]]:
    """Parser en rytter-tabel (etape/GC/point/bjerg/ungdom). Håndterer
    fler-kolonne-layout ved at chunke hver række i grupper à `period` celler."""
    period = _header_period(frag)
    if period < 4:
        return []
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", frag, re.S | re.I)
    out: list[dict[str, Any]] = []
    for r in rows:
        cells = _cells(r)
        if len(cells) < period:
            continue
        for g in range(0, len(cells) - period + 1, period):
            grp = cells[g:g + period]
            rank_txt = _txt(grp[0])
            if not re.match(r"^\d+$", rank_txt):
                continue
            # rytter-celle: navn + link (href rummer rytter-id og hold-slug)
            href = re.search(r'href="(/[^"]*rider/[^"]+)"', grp[1])
            name_a = re.search(r'profile--name[^>]*>(.*?)</a>', grp[1], re.S | re.I)
            alt = re.search(r'alt="([^"]+)"', grp[1])
            rider_name = _txt(name_a.group(1)) if name_a else (_txt(alt.group(1)) if alt else None)
            team_name = _txt(grp[3]) if len(grp) > 3 else None
            value = _txt(grp[4]) if len(grp) > 4 else ""
            pts = _parse_points(value)
            out.append({
                "rank": int(rank_txt),
                "rider_name": rider_name or None,
                "rider_url": (href.group(1) if href else None),
                "team_name": team_name or None,
                "points": pts,
                "time": value if pts is None else None,
            })
    return out


def parse_team_table(frag: str) -> list[dict[str, Any]]:
    """Holdkonkurrence (etg): Rank, Team, Times."""
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", frag, re.S | re.I)
    out: list[dict[str, Any]] = []
    for r in rows:
        cells = _cells(r)
        if len(cells) < 2:
            continue
        rank_txt = _txt(cells[0])
        if not re.match(r"^\d+$", rank_txt):
            continue
        out.append({
            "rank": int(rank_txt),
            "rider_name": _txt(cells[1]) or None,   # holdnavn i 'rider'-pladsen (genbrug)
            "team_name": _txt(cells[1]) or None,
            "points": None,
            "time": _txt(cells[2]) if len(cells) > 2 else None,
        })
    return out


def scrape_stage(stage: int) -> dict[str, Any]:
    """Ét request til ranking-siden + ét pr. klassement → vores standard-form."""
    page = _get(f"/{LETOUR_LANG}/rankings/stage-{stage}")
    urls = ajax_urls(page, stage)
    classifications: dict[str, Any] = {}
    for code, key, label, jersey, is_team in CLASS_MAP:
        rows: list[dict[str, Any]] = []
        url = urls.get(code)
        if url:
            frag = _get(url)
            rows = parse_team_table(frag) if is_team else parse_rider_table(frag)
        classifications[key] = {"label": label, "jersey": jersey, "rows": rows}

    results_present = bool(classifications["etape"]["rows"])
    return {
        "url": f"/{LETOUR_LANG}/rankings/stage-{stage}",
        "number": stage,
        "meta": {"date": None, "source": "letour.fr"},
        "classifications": classifications,
        "results_present": results_present,
        "scraped_at": datetime.utcnow().isoformat() + "Z",
        "pcs_base": LETOUR_BASE,
    }


def debug_stage(stage: int) -> dict[str, Any]:
    """Diagnostik: viser hvad proxyen faktisk ser, så fejl kan lokaliseres."""
    info: dict[str, Any] = {"stage": stage, "base": LETOUR_BASE}
    try:
        page = _get(f"/{LETOUR_LANG}/rankings/stage-{stage}")
    except Exception as e:  # noqa: BLE001
        info["page_error"] = f"{type(e).__name__}: {e}"
        return info
    info["page_len"] = len(page)
    info["has_ajax_stack"] = "data-ajax-stack" in page
    info["inline_rider_rows"] = page.count("rankingTables__row__profile--name")
    ym = re.search(r"Tour de France \d{4}", page)
    info["year_marker"] = ym.group(0) if ym else None
    urls = ajax_urls(page, stage)
    info["ajax_keys"] = sorted(urls.keys())
    info["ite_url"] = urls.get("ite")
    if urls.get("ite"):
        try:
            frag = _get(urls["ite"])
            info["ite_frag_len"] = len(frag)
            info["ite_th_count"] = frag.lower().count("<th")
            info["ite_rows_parsed"] = len(parse_rider_table(frag))
            info["ite_snippet"] = frag[:200]
        except Exception as e:  # noqa: BLE001
            info["ite_error"] = f"{type(e).__name__}: {e}"
    else:
        info["page_snippet"] = page[:300]
    return info


def scrape_stage_list(year: int | None = None, n_stages: int = 21) -> list[dict[str, Any]]:
    """Basal etapeliste (1..21). Datoer/byer seedes/rettes separat — letour-
    ranking-siderne giver resultaterne, som er det scoringen kører på."""
    return [{"number": n, "date": None, "name": f"Stage {n}",
             "url": f"/{LETOUR_LANG}/rankings/stage-{n}", "profile_icon": None}
            for n in range(1, n_stages + 1)]
