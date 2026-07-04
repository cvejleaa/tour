"""Test: 2026-fragmentkoder + holdtidskørsel.

Letours 2026-sider bruger "ete" (hold-etaperesultat, TTT) hvor 2025 brugte
"ite" — og på TTT'en findes "ite" slet ikke. scrape_stage skal:
  1) finde etape-resultatet via kandidatkoderne (ite → ete),
  2) parse "ete" som HOLD-tabel,
  3) stadig parse almindelige rytter-etaper (ite) som før.
Kørbar uden netværk (requests stubbes).

    python3 test_ttt_fallback.py
"""
from __future__ import annotations

import sys
import types

sys.modules.setdefault("requests", types.ModuleType("requests"))

import letour_results  # noqa: E402

# 2026 TTT-side: ajax-stacken har "ete" (hold-etape) — INGEN "ite".
PAGE_TTT = """
<div data-ajax-stack='{"ete":"\\/en\\/ajax\\/ranking\\/1\\/ete\\/aaa111\\/none",
"itg":"\\/en\\/ajax\\/ranking\\/1\\/itg\\/bbb222\\/none",
"etg":"\\/en\\/ajax\\/ranking\\/1\\/etg\\/ccc333\\/none"}'></div>
"""

# 2025-stil normal etape: "ite" med rytterrækker.
PAGE_NORMAL = """
<div data-ajax-stack='{"ite":"\\/en\\/ajax\\/ranking\\/1\\/ite\\/ddd444\\/none"}'></div>
"""

TEAM_TABLE = """
<table><thead><tr><th>Rank</th><th>Team</th><th>Times</th></tr></thead>
<tbody>
<tr><td>1</td><td>TEAM VISMA | LEASE A BIKE</td><td>21'47"</td></tr>
<tr><td>2</td><td>NETCOMPANY INEOS CYCLING TEAM</td><td>21'55"</td></tr>
<tr><td>3</td><td>UAE TEAM EMIRATES XRG</td><td>21'59"</td></tr>
</tbody></table>
"""

RIDER_TABLE = """
<table><thead>
<tr><th>Rank</th><th>Rider</th><th>Rider No.</th><th>Team</th><th>Times</th><th>Gap</th></tr>
</thead><tbody>
<tr><td>1</td><td><a href="/en/rider/x" class="rankingTables__row__profile--name">J. VINGEGAARD</a></td>
<td>11</td><td>TEAM VISMA | LEASE A BIKE</td><td>21'47"</td><td>-</td></tr>
</tbody></table>
"""

FRAGMENTS = {"aaa111": TEAM_TABLE, "bbb222": RIDER_TABLE, "ccc333": TEAM_TABLE, "ddd444": RIDER_TABLE}
CURRENT_PAGE = {"html": PAGE_TTT}


def fake_get(path: str) -> str:
    if "/rankings/stage-1" in path:
        return CURRENT_PAGE["html"]
    for h, frag in FRAGMENTS.items():
        if h in path:
            return frag
    return "<table></table>"


letour_results._get = fake_get

# 1) TTT (2026): etape-resultat findes via 'ete' og parses som HOLD-tabel.
data = letour_results.scrape_stage(1)
etape = data["classifications"]["etape"]["rows"]
assert len(etape) == 3, f"forventede 3 hold, fik {len(etape)}"
assert etape[0]["team_name"] == "TEAM VISMA | LEASE A BIKE" and etape[0]["rank"] == 1
assert data["results_present"] is True
print("1) 2026-TTT: 'ete' findes og parses som hold-tabel ✓")

# 2) GC parses stadig som ryttere.
samlet = data["classifications"]["samlet"]["rows"]
assert len(samlet) == 1 and samlet[0]["rider_name"] == "J. VINGEGAARD"
print("2) GC-rytter-tabellen uændret ✓")

# 3) Normal etape (ite, rytterrækker) fungerer som hidtil.
CURRENT_PAGE["html"] = PAGE_NORMAL
data2 = letour_results.scrape_stage(1)
et2 = data2["classifications"]["etape"]["rows"]
assert len(et2) == 1 and et2[0]["rider_name"] == "J. VINGEGAARD"
print("3) Normal etape via 'ite' uændret ✓")

print("\nAlle 2026-kode-tests bestået.")
