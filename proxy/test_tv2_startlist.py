"""
test_tv2_startlist.py
=====================
Validerer TV2-startliste-parseren mod en gemt, ægte artikel-HTML.

Kør:
    pytest proxy/test_tv2_startlist.py
    python3 proxy/test_tv2_startlist.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import tv2_startlist as sl  # noqa: E402

_CANDIDATES = [
    "/tmp/claude-0/-home-user-tour/31e6cea8-29ab-5787-8aeb-730c9fda226d/scratchpad/tv2_holdryttere.html",
    os.path.join(os.path.dirname(__file__), "tv2_holdryttere.html"),
]


def _load() -> str:
    for p in _CANDIDATES:
        if os.path.exists(p):
            with open(p, encoding="utf-8", errors="replace") as f:
                return f.read()
    # Under pytest: skip (sample-HTML'en er ikke i repoet og findes ikke i alle
    # miljøer) i stedet for at fejle hele suiten. Standalone: fejl som før.
    if os.environ.get("PYTEST_CURRENT_TEST"):
        import pytest
        pytest.skip("tv2_holdryttere.html ikke tilgængelig i dette miljø")
    raise FileNotFoundError("tv2_holdryttere.html ikke fundet: " + ", ".join(_CANDIDATES))


def test_parses_23_teams_with_codes():
    teams = sl.parse_startlist(_load())
    assert len(teams) == 23, len(teams)
    codes = {t["code"] for t in teams}
    # Et par kendte koder skal være med.
    for c in ("TVL", "UEX", "RBH", "NSN", "JAY", "UXM"):
        assert c in codes, (c, sorted(codes))


def test_announced_teams_have_riders():
    teams = {t["code"]: t for t in sl.parse_startlist(_load())}
    tvl = teams["TVL"]
    assert tvl["announced"] is True
    assert len(tvl["riders"]) == 8, tvl["riders"]
    names = [r["name"] for r in tvl["riders"]]
    assert "Jonas Vingegaard" in names, names
    # Land parses ud (bruges bl.a. til at fremhæve danskere).
    vinge = next(r for r in tvl["riders"] if r["name"] == "Jonas Vingegaard")
    assert vinge["country"] == "Danmark", vinge
    assert "leader" not in vinge, "leader-feltet skal være fjernet (det var danskere, ikke kaptajner)"


def test_unannounced_team_has_no_riders():
    teams = {t["code"]: t for t in sl.parse_startlist(_load())}
    uex = teams["UEX"]  # UAE havde endnu ikke udtaget i denne snapshot
    assert uex["announced"] is False
    assert uex["riders"] == []


def _run_plain():
    test_parses_23_teams_with_codes()
    test_announced_teams_have_riders()
    test_unannounced_team_has_no_riders()
    print("OK: alle tv2_startlist-parser-tests bestået.")


if __name__ == "__main__":
    _run_plain()
