"""Test: på en holdtidskørsel er letours etape-tabel ("ite") en HOLD-tabel —
scrape_stage skal falde tilbage til parse_team_table, så results_present
bliver True og vinderholdet kan scores. Kørbar uden netværk (requests stubbes).

    python3 test_ttt_fallback.py
"""
from __future__ import annotations

import sys
import types

# Stub requests FØR letour_results importeres (ingen netværksafhængighed).
sys.modules.setdefault("requests", types.ModuleType("requests"))

import letour_results  # noqa: E402

# Ranking-side med ajax-stack for etape 1 (kun ite + itg for testen).
PAGE = """
<div data-ajax-stack='{"ite":"\\/en\\/ajax\\/ranking\\/1\\/ite\\/abc123\\/none",
"itg":"\\/en\\/ajax\\/ranking\\/1\\/itg\\/def456\\/none"}'></div>
"""

# TTT: etape-fragmentet er en HOLD-tabel (Rank/Team/Time) — INGEN rytterceller.
TTT_ITE = """
<table><thead><tr><th>Rank</th><th>Team</th><th>Time</th></tr></thead>
<tbody>
<tr><td>1</td><td>TEAM VISMA | LEASE A BIKE</td><td>22'32"</td></tr>
<tr><td>2</td><td>UAE TEAM EMIRATES XRG</td><td>22'39"</td></tr>
<tr><td>3</td><td>NETCOMPANY INEOS CYCLING TEAM</td><td>22'41"</td></tr>
</tbody></table>
"""

# GC-fragmentet er en normal RYTTER-tabel (Rank/Rider/Rider No./Team/Times/Gap).
ITG = """
<table><thead>
<tr><th>Rank</th><th>Rider</th><th>Rider No.</th><th>Team</th><th>Times</th><th>Gap</th></tr>
</thead><tbody>
<tr><td>1</td><td><a href="/en/rider/x" class="rankingTables__row__profile--name">R. Rytter</a></td>
<td>11</td><td>TEAM VISMA | LEASE A BIKE</td><td>22'32"</td><td>-</td></tr>
</tbody></table>
"""

FRAGMENTS = {"abc123": TTT_ITE, "def456": ITG}


def fake_get(path: str) -> str:
    if "/rankings/stage-1" in path:
        return PAGE
    for h, frag in FRAGMENTS.items():
        if h in path:
            return frag
    return "<table></table>"  # øvrige klassementer: tomme


letour_results._get = fake_get

data = letour_results.scrape_stage(1)

etape = data["classifications"]["etape"]["rows"]
assert len(etape) == 3, f"forventede 3 hold-rækker, fik {len(etape)}"
assert etape[0]["team_name"] == "TEAM VISMA | LEASE A BIKE"
assert etape[0]["rank"] == 1
assert etape[2]["team_name"] == "NETCOMPANY INEOS CYCLING TEAM"
assert data["results_present"] is True
print("1) TTT: etape-tabel parses via hold-fallback, results_present=True ✓")

samlet = data["classifications"]["samlet"]["rows"]
assert len(samlet) == 1 and samlet[0]["rider_name"] == "R. Rytter"
print("2) GC-rytter-tabellen parses stadig som ryttere (fallback rammer KUN ite) ✓")

# Almindelig etape: rytter-tabel på ite → fallback må IKKE aktiveres.
FRAGMENTS["abc123"] = ITG
data2 = letour_results.scrape_stage(1)
et2 = data2["classifications"]["etape"]["rows"]
assert len(et2) == 1 and et2[0]["rider_name"] == "R. Rytter"
print("3) Almindelig etape: rytterrækker som før ✓")

print("\nAlle TTT-fallback-tests bestået.")
