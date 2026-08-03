"""Test af _parse_points: stigningstabellerne på KOM-siden skriver '1 PT'
(ental) — uden ental-match blev 1-point-passeringer parset som 0 og gav
forkert bjerg-facit (etape 12). Kørbar uden netværk: requests stubbes.

    python3 test_parse_points.py
"""
from __future__ import annotations

import sys
import types

sys.modules.setdefault("requests", types.ModuleType("requests"))
import letour_results as lr  # noqa: E402

assert lr._parse_points("1 PT") == 1, "ental 'PT' skal parses"
assert lr._parse_points("1PT") == 1
assert lr._parse_points("12 PTS") == 12
assert lr._parse_points("42 PTS") == 42
assert lr._parse_points("3 pts") == 3
assert lr._parse_points("  7  ") == 7
assert lr._parse_points("-2 PTS") == -2
assert lr._parse_points("21' 47''") is None, "tider er ikke point"
assert lr._parse_points("") is None
assert lr._parse_points("PTdC noget") is None

print("OK: _parse_points håndterer PT (ental) og PTS (flertal)")
