"""Test af serve_stage/refresh_stage(force): ikke-final etape gen-scrapes,
final etape serveres fra cache, TTL begrænser scrape-frekvens, og force
bryder en frosset etape op. Kørbar uden netværk: letour_results stubbes.

    python3 test_serve_stage.py
"""
from __future__ import annotations

import sys
import types
from datetime import date, timedelta

# Stub letour_results FØR tdf_results importeres (ingen requests-afhængighed).
stub = types.ModuleType("letour_results")
CALLS = {"n": 0}
FRESH = {"results_present": True, "meta": {"date": str(date.today())}, "marker": "FRESH"}


def _scrape_stage(ref):
    CALLS["n"] += 1
    return dict(FRESH)


stub.scrape_stage = _scrape_stage
stub.scrape_stage_list = lambda year=None, n_stages=21: [
    {"number": i, "date": str(date.today()), "url": f"stage-{i}"} for i in range(1, 4)
]
sys.modules["letour_results"] = stub

import tdf_results  # noqa: E402


class DictCache:
    def __init__(self):
        self.stages = {}
        self.lists = {}

    def get_stage(self, year, n):
        return self.stages.get((year, n))

    def set_stage(self, year, n, data):
        self.stages[(year, n)] = data

    def get_stage_list(self, year):
        return self.lists.get(year)

    def set_stage_list(self, year, data):
        self.lists[year] = data


def make_service():
    svc = tdf_results.StageResultsService(cache=DictCache(), year=2026)
    return svc


# 1) STALE ikke-final cache (dagens dato) → serve_stage gen-scraper og erstatter.
svc = make_service()
stale = {"results_present": True, "meta": {"date": str(date.today())}, "marker": "STALE-2025-TEST"}
svc.cache.set_stage(2026, 1, stale)
CALLS["n"] = 0
out = svc.serve_stage(1)
assert out["marker"] == "FRESH", f"forventede FRESH, fik {out['marker']}"
assert CALLS["n"] == 1
# TTL: næste kald inden for 240 s scraper IKKE igen.
out2 = svc.serve_stage(1)
assert CALLS["n"] == 1, "TTL skulle have forhindret nyt scrape"
assert out2["marker"] == "FRESH"
print("1) stale ikke-final cache gen-scrapes (og TTL holder igen) ✓")

# 2) FINAL etape (dato i fortiden) → serveres fra cache, INTET scrape.
svc = make_service()
final = {"results_present": True, "meta": {"date": str(date.today() - timedelta(days=2))}, "marker": "FINAL"}
svc.cache.set_stage(2026, 1, final)
CALLS["n"] = 0
out = svc.serve_stage(1)
assert out["marker"] == "FINAL" and CALLS["n"] == 0
print("2) final etape fryses korrekt (ingen scrape) ✓")

# 3) refresh_stage(force=True) bryder selv en FINAL/frosset etape op.
out = svc.refresh_stage(1, None, True)
assert out["marker"] == "FRESH" and CALLS["n"] == 1
assert svc.cache.get_stage(2026, 1)["marker"] == "FRESH"
print("3) force-refresh bryder frossen etape op ✓")

# 4) Skrab-fejl på ikke-final etape → seneste cache serveres (ingen exception).
svc = make_service()
svc.cache.set_stage(2026, 2, dict(stale))


def _boom(ref):
    raise RuntimeError("letour nede")


tdf_results._letour_scrape_stage = _boom
sys.modules["letour_results"].scrape_stage = _boom
out = svc.serve_stage(2)
assert out["marker"] == "STALE-2025-TEST"
print("4) skrab-fejl → cachen serveres som fallback ✓")

print("\nAlle serve_stage-tests bestået.")
