"""
tv2_startlist.py
================
Henter Tour de France-startlisten fra TV2's hold-og-ryttere-artikel
(`sport.tv2.dk/.../hold-og-ryttere-i-tour-de-france-2026`) og parser hvert holds
udtagne ryttere. Artiklen opdateres løbende efterhånden som holdene melder ud, så
vi kan poll'e den med jævne mellemrum og fylde holdene ud, så snart de er klar.

Sidens opbygning (bekræftet mod gemt HTML):

  * Hvert hold er et ``<details>`` med en ``<summary>`` der har et ``✅`` når
    holdet HAR udtaget sine ryttere (ellers afventer det).
  * Inde i blokken står ``<strong>Forkortelse:</strong>&nbsp;XXX`` = holdkoden
    (matcher vores egne koder, fx TVL, UEX), og holdnavnet i et ``<h3>``.
  * Efter ``<strong>Ryttere:</strong>`` følger en ``<ul>`` med ét ``<li>`` pr.
    rytter: ``Navn, Land``. Holdets kaptajn står i ``<strong>``.

Output (pr. hold)::

    {"code": "TVL", "name": "Visma | Lease a Bike", "announced": True,
     "riders": [{"name": "Jonas Vingegaard", "country": "Danmark", "leader": True}, ...]}
"""

from __future__ import annotations

import os
import re
import html as ihtml
from typing import Any

import requests

TV2_URL = os.getenv(
    "TV2_STARTLIST_URL",
    "https://sport.tv2.dk/cykling/2026-05-06-hold-og-ryttere-i-tour-de-france-2026",
)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "da-DK,da;q=0.9,en;q=0.8",
}


def _clean(s: str) -> str:
    return ihtml.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


def _parse_riders(block: str) -> list[dict[str, Any]]:
    riders: list[dict[str, Any]] = []
    m = re.search(r"Ryttere:.*?<ul>(.*?)</ul>", block, re.S | re.I)
    if not m:
        return riders
    for li in re.findall(r"<li>(.*?)</li>", m.group(1), re.S | re.I):
        text = _clean(li)
        if not text:
            continue
        # "Navn, Land" — land er sidste komma-led (navne kan selv have komma sjældent).
        # (TV2 bruger fed skrift til at fremhæve DANSKERE — ikke kaptajner — så vi
        #  bevarer ikke den markering; danskere kan udledes af land == "Danmark".)
        name, _, country = text.rpartition(",")
        if name:
            riders.append({"name": name.strip(), "country": country.strip()})
        else:
            riders.append({"name": text, "country": ""})
    return riders


def parse_startlist(page_html: str) -> list[dict[str, Any]]:
    """Ren parser: TV2-artiklens HTML → liste af hold med ryttere. Ingen IO."""
    out: list[dict[str, Any]] = []
    # Del op i hold-blokke; hvert ægte hold har "Forkortelse:".
    for block in re.split(r"<details\b", page_html):
        if "Forkortelse:" not in block:
            continue
        cm = re.search(r"Forkortelse:</strong>(?:&nbsp;|\s)*([A-Z0-9]{2,5})", block)
        if not cm:
            continue
        code = cm.group(1)
        nm = re.search(r'tc_heading--3">([^<]+)</h3>', block)
        name = ihtml.unescape(nm.group(1)).strip() if nm else ""
        riders = _parse_riders(block)
        # "Udtaget" = ✅ i summary ELLER faktisk udtagne ryttere. Det sidste er
        # robust mod encoding-fejl på ✅-emojien (TV2 sender ingen charset).
        summary = re.search(r"<summary.*?</summary>", block, re.S | re.I)
        announced = bool(summary and "✅" in summary.group(0)) or len(riders) > 0
        out.append({
            "code": code,
            "name": name,
            "announced": announced,
            "riders": riders,
        })
    return out


def scrape_startlist(session: requests.Session | None = None) -> list[dict[str, Any]]:
    """GET TV2-artiklen og parse startlisten."""
    own = session is None
    sess = session or requests.Session()
    try:
        r = sess.get(TV2_URL, headers=HEADERS, timeout=60)
        r.raise_for_status()
        # TV2 sender ingen charset i Content-Type, så requests gætter latin-1 og
        # ødelægger UTF-8 (✅, accenttegn). Siden ER UTF-8 — tving det.
        r.encoding = "utf-8"
        return parse_startlist(r.text)
    finally:
        if own:
            sess.close()
