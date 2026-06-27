"""
test_letour_stageinfo.py
========================
Validerer ``letour_stageinfo``-parseren mod en gemt, ægte letour-etapeside
(``stage5_doc.html`` = https://www.letour.fr/en/stage-5). Ingen netværk: HTML'en
injiceres direkte i ``parse_stage_info`` / monkeypatches ind i ``scrape_stage_info``.

Kør enten:
    pytest proxy/test_letour_stageinfo.py
    python3 proxy/test_letour_stageinfo.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import letour_stageinfo as si  # noqa: E402

# Den gemte sample-side (stage-5). Falder tilbage til HAR-udtrækket hvis flyttet.
_CANDIDATES = [
    "/tmp/claude-0/-home-user-tour/31e6cea8-29ab-5787-8aeb-730c9fda226d/scratchpad/stage5_doc.html",
    os.path.join(os.path.dirname(__file__), "stage5_doc.html"),
]


def _load_sample() -> str:
    for p in _CANDIDATES:
        if os.path.exists(p):
            with open(p, encoding="utf-8", errors="replace") as f:
                return f.read()
    raise FileNotFoundError(
        "stage5_doc.html ikke fundet i nogen kendt placering: " + ", ".join(_CANDIDATES)
    )


def test_parse_stage5_sample():
    html = _load_sample()
    info = si.parse_stage_info(html, 5)
    assert info["stage"] == 5
    # km ≈ 158 (siden viser 158.3)
    assert info["km"] is not None and abs(info["km"] - 158) < 1.0, info["km"]
    assert info["type"] == "flat", info["type"]
    assert info["elevation"] == 1600, info["elevation"]
    # Stage 5 (flad) har en mellemsprint + én kategoriseret stigning (Côte de Baleix).
    assert info["awards"]["sprint"] is True, info["awards"]
    assert info["awards"]["mountain"] is True, info["awards"]


def test_scope_picks_current_stage_not_neighbours():
    """Carousel'en viser også stage 4 (D+ 2700) og stage 6 (D+ 4100). Parseren
    må kun returnere den AKTUELLE etapes værdier."""
    html = _load_sample()
    assert si.parse_stage_info(html, 5)["elevation"] == 1600


def test_type_mapping():
    assert si._parse_type("Flat") == "flat"
    assert si._parse_type("Hilly") == "hilly"
    assert si._parse_type("Mountain") == "mountain"
    assert si._parse_type("Individual Time-Trial") == "itt"
    assert si._parse_type("Team Time-Trial") == "ttt"
    assert si._parse_type("Whatever") is None


def test_scrape_stage_info_uses_parser_without_network(monkeypatch):
    """``scrape_stage_info`` må ikke ramme netværket i testen — vi monkeypatcher
    HTTP-laget og fodrer sample-HTML ind."""
    html = _load_sample()
    monkeypatch.setattr(si, "_get", lambda session, path: html)
    info = si.scrape_stage_info(5)
    assert info["elevation"] == 1600
    assert info["type"] == "flat"


def _run_plain():
    """Kør uden pytest (simple asserts + en mini monkeypatch-erstatning)."""
    test_parse_stage5_sample()
    test_scope_picks_current_stage_not_neighbours()
    test_type_mapping()

    html = _load_sample()
    orig = si._get
    si._get = lambda session, path: html
    try:
        info = si.scrape_stage_info(5)
        assert info["elevation"] == 1600 and info["type"] == "flat"
    finally:
        si._get = orig

    print("OK: alle letour_stageinfo-parser-tests bestået (stage 5 sample).")


if __name__ == "__main__":
    _run_plain()
