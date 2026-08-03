"""
test_flashscore.py
==================
Validerer Flashscore-parserne (``flashscore_feed``) og klient-laget
(``flashscore_client``) mod GEMTE, ægte feed-svar (udtrukket fra HAR-optagelser
+ en fuld dagsliste) samt en lille syntetisk DENMARK-sektion (dagens rigtige
dagsliste havde ingen danske Superliga-kampe). INGEN netværk: HTTP-laget
monkeypatches.

Fixtures (proxy/fixtures_flashscore/):
  vmfinale_incidents.txt        df_sui — VM-finale, færdig (fuldt hændelsesforløb)
  superliga_incidents.txt       df_sui — Superliga-premiere, programsat (kun meta)
  superliga_dc.txt / vmfinale_dc.txt   dc — kamp-stamdata
  dagsliste.txt                 f_1_0_3_en_1 — fuld ægte dagsliste (44 turneringer)
  dagsliste_denmark_syntetisk.txt      syntetisk DENMARK: Superliga-sektion

Kør enten:
    pytest proxy/test_flashscore.py
    python3 proxy/test_flashscore.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import flashscore_client as fc  # noqa: E402
import flashscore_feed as ff  # noqa: E402

_FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures_flashscore")


def _load(name: str) -> str:
    with open(os.path.join(_FIXTURES, name), encoding="utf-8") as f:
        return f.read()


# ----------------------------------------------------------------------------
# parse_feed (grund-formatet)
# ----------------------------------------------------------------------------

def test_parse_feed_splits_records_fields_and_kv():
    recs = ff.parse_feed("AA÷id1¬AD÷123¬~AA÷id2¬XX÷y¬~")
    assert len(recs) == 2
    assert recs[0] == {"AA": "id1", "AD": "123"}
    assert recs[1]["AA"] == "id2"


def test_parse_feed_ignores_junk_and_keeps_first_duplicate():
    recs = ff.parse_feed("AA÷x¬nøgleløst-felt¬AA÷y¬~~¬~")
    assert recs == [{"AA": "x"}]  # dubletnøgle: første vinder; tomme records væk


# ----------------------------------------------------------------------------
# Dagsliste
# ----------------------------------------------------------------------------

def test_daily_synthetic_denmark_section():
    matches = ff.parse_daily(_load("dagsliste_denmark_syntetisk.txt"))
    # 3 danske kampe — rumænsk "Superliga"-sektion må IKKE slippe igennem.
    assert len(matches) == 3, matches
    m = matches[0]
    assert m["event_id"] == "OUzl0hh4"
    assert m["kickoff"] == 1784912400
    assert m["home"] == "Viborg" and m["away"] == "Odense"
    assert m["home_code"] == "VIB" and m["away_code"] == "ODE"
    assert m["status"] == "scheduled"
    assert m["home_score"] is None and m["away_score"] is None


def test_daily_synthetic_finished_and_postponed():
    matches = {m["event_id"]: m for m in ff.parse_daily(_load("dagsliste_denmark_syntetisk.txt"))}
    done = matches["K6zXaTe1"]
    assert done["status"] == "finished"
    assert (done["home_score"], done["away_score"]) == (2, 1)
    # Udsat kamp: står med AB÷3 ("finished"!) men detaljestatus 4 og ingen scorer
    # — netop derfor eksponeres status_detail, og scorer skal være None.
    post = matches["p0stp0n3"]
    assert post["status_detail"] == "4"
    assert post["home_score"] is None and post["away_score"] is None


def test_daily_country_filter_excludes_romania_superliga():
    text = _load("dagsliste_denmark_syntetisk.txt")
    ids = {m["event_id"] for m in ff.parse_daily(text)}
    assert "dx4pgX44" not in ids  # ROMANIA: Superliga
    ro = ff.parse_daily(text, country="ROMANIA", league="Superliga")
    assert [m["event_id"] for m in ro] == ["dx4pgX44"]


def test_daily_real_full_list_parses_broadly():
    """Hele den ægte dagsliste (44 turneringer) skal parse uden at vælte og
    give et fornuftigt antal kampe med brugbare felter."""
    text = _load("dagsliste.txt")
    matches = ff.parse_daily(text, country=None)  # alle sektioner
    assert len(matches) > 50, len(matches)
    for m in matches:
        assert m["event_id"], m
        assert isinstance(m["kickoff"], int), m
        assert m["home"] and m["away"], m
    # Dagens liste indeholdt ROMANIA: Superliga med 2 kampe — landfilteret virker
    # også på ægte data.
    ro = ff.parse_daily(text, country="ROMANIA", league="Superliga")
    assert len(ro) == 2, ro
    # …men ingen danske (deraf den syntetiske fixture ovenfor).
    assert ff.parse_daily(text) == []


# ----------------------------------------------------------------------------
# Hændelser (df_sui)
# ----------------------------------------------------------------------------

def test_incidents_wc_final_goal_with_minute():
    data = ff.parse_incidents(_load("vmfinale_incidents.txt"))
    names = [p["name"] for p in data["periods"]]
    assert names == ["1st Half", "2nd Half", "Extra Time"], names
    goals = [i for p in data["periods"] for i in p["incidents"] if i["kind"] == "Goal"]
    assert len(goals) == 1, goals  # ESP-ARG 1-0 e.f.s.
    goal = goals[0]
    assert goal["minute"] == 106
    assert goal["player"] == "Torres F."
    assert goal["side"] == "home"
    assert "Goal!" in goal["text"]
    # Assist er en selvstændig del-hændelse i samme record.
    assists = [i for p in data["periods"] for i in p["incidents"] if i["kind"] == "Assistance"]
    assert assists and assists[0]["player"] == "Williams N."


def test_incidents_wc_final_cards_and_substitutions():
    data = ff.parse_incidents(_load("vmfinale_incidents.txt"))
    flat = [i for p in data["periods"] for i in p["incidents"]]
    kinds = {i["kind"] for i in flat}
    assert {"Yellow Card", "Substitution - In", "Substitution - Out"} <= kinds
    first = flat[0]
    assert first["kind"] == "Yellow Card" and first["minute"] == 41 and first["player"] == "Martinez Li."
    # Udskiftning: ud+ind er to del-hændelser med hver sin spiller, samme minut.
    subs44 = [i for i in flat if i["minute"] == 44]
    assert {i["kind"] for i in subs44} == {"Substitution - Out", "Substitution - In"}
    assert {i["player"] for i in subs44} == {"Martinez Li.", "Otamendi N."}


def test_incidents_wc_final_meta():
    meta = ff.parse_incidents(_load("vmfinale_incidents.txt"))["meta"]
    assert meta["venue"] == "MetLife Stadium"
    assert meta["town"] == "East Rutherford, NJ"
    assert meta["referee"] == "Vincic S."
    assert meta["capacity"] == 82566   # "82 566" → int
    assert meta["attendance"] == 80663


def test_incidents_scheduled_superliga_has_venue_but_no_periods():
    data = ff.parse_incidents(_load("superliga_incidents.txt"))
    assert data["meta"]["venue"] == "Energi Viborg Arena"
    assert data["meta"]["town"] == "Viborg"
    assert data["meta"]["capacity"] == 9566
    assert all(not p["incidents"] for p in data["periods"])  # intet spillet endnu


def test_incident_minute_stoppage_time_rounds_down():
    text = "AC÷1st Half¬~III÷x1¬IA÷2¬IB÷45+2'¬IE÷1¬IF÷Nielsen N.¬ICT÷Kort.¬IK÷Yellow Card¬~"
    inc = ff.parse_incidents(text)["periods"][0]["incidents"][0]
    assert inc["minute"] == 45 and inc["side"] == "away"


# ----------------------------------------------------------------------------
# Kamp-meta (dc)
# ----------------------------------------------------------------------------

def test_match_meta_scheduled_and_finished():
    sched = ff.parse_match_meta(_load("superliga_dc.txt"))
    assert sched["kickoff"] == 1784912400  # 24-07-2026 — Superliga-premieren
    assert sched["status"] == "scheduled"
    assert sched["home_score"] is None and sched["away_score"] is None

    done = ff.parse_match_meta(_load("vmfinale_dc.txt"))
    assert done["status"] == "finished"
    assert (done["home_score"], done["away_score"]) == (1, 0)


# ----------------------------------------------------------------------------
# fsign-regex + klientens refresh-retry (uden netværk)
# ----------------------------------------------------------------------------

def test_extract_fsign_from_js_variants():
    assert fc.extract_fsign('...,feedProducer:{fsign:"SW9D1eZo",url:...') == "SW9D1eZo"
    assert fc.extract_fsign('{"fsign": "AbC12xYz"}') == "AbC12xYz"
    assert fc.extract_fsign("var fsign = 'Qq1Ww2Ee'") == "Qq1Ww2Ee"
    assert fc.extract_fsign("function fsignal(x){return x}") is None
    assert fc.extract_fsign("helt uden signatur") is None


class _Resp:
    def __init__(self, status_code: int, text: str = "") -> None:
        self.status_code = status_code
        self.text = text

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def test_feed_get_refreshes_fsign_once_on_403(monkeypatch):
    """403 fra feed-API'et = roteret signatur: klienten skal hente ny signatur
    (forside → bundle → regex) og prøve igen — præcis én gang."""
    calls = []

    def fake_get(url, headers, timeout=30):
        calls.append((url, headers.get("x-fsign")))
        if "flashscore.ninja" in url:
            # Gammel signatur afvises; ny accepteres.
            if headers["x-fsign"] == "OLDSIGN1":
                return _Resp(403)
            return _Resp(200, "AA÷x¬~")
        if url.endswith(".js"):
            return _Resp(200, 'core:{fsign:"NEWSIGN9"}')
        # Forsiden med bundle-reference.
        return _Resp(200, '<script src="/res/build/core.abc123.js"></script>')

    monkeypatch.setattr(fc, "_http_get", fake_get)
    monkeypatch.setattr(fc, "_fsign_manager", fc.FsignManager())
    fc._fsign_manager._fsign = "OLDSIGN1"  # cachet, forældet signatur
    monkeypatch.setattr(fc, "_cache", fc.MemTTLCache())  # frisk cache pr. test

    text = fc._feed_get("f_1_0_3_en_1")
    assert text == "AA÷x¬~"
    signs = [s for u, s in calls if "flashscore.ninja" in u]
    assert signs == ["OLDSIGN1", "NEWSIGN9"], calls


def test_fetch_daily_parses_and_caches(monkeypatch):
    fixture = _load("dagsliste_denmark_syntetisk.txt")
    hits = []

    def fake_get(url, headers, timeout=30):
        hits.append(url)
        return _Resp(200, fixture)

    monkeypatch.setattr(fc, "_http_get", fake_get)
    monkeypatch.setattr(fc, "_fsign_manager", fc.FsignManager())
    fc._fsign_manager._fsign = "TESTSIGN"
    monkeypatch.setattr(fc, "_cache", fc.MemTTLCache())

    first = fc.fetch_daily(0)
    assert [m["event_id"] for m in first] == ["OUzl0hh4", "K6zXaTe1", "p0stp0n3"]
    # Andet kald (selv med andet filter) skal ramme cachen, ikke nettet.
    ro = fc.fetch_daily(0, country="ROMANIA", league="Superliga")
    assert [m["event_id"] for m in ro] == ["dx4pgX44"]
    assert len(hits) == 1, hits


def test_fsign_env_override(monkeypatch):
    monkeypatch.setenv("FLASHSCORE_FSIGN", "ENVSIGN0")
    mgr = fc.FsignManager()
    assert mgr.get() == "ENVSIGN0"
    assert mgr.get(force=True) == "ENVSIGN0"  # override slår også refresh


def _run_plain():
    """Kør uden pytest (simple asserts; monkeypatch-tests springes over)."""
    test_parse_feed_splits_records_fields_and_kv()
    test_parse_feed_ignores_junk_and_keeps_first_duplicate()
    test_daily_synthetic_denmark_section()
    test_daily_synthetic_finished_and_postponed()
    test_daily_country_filter_excludes_romania_superliga()
    test_daily_real_full_list_parses_broadly()
    test_incidents_wc_final_goal_with_minute()
    test_incidents_wc_final_cards_and_substitutions()
    test_incidents_wc_final_meta()
    test_incidents_scheduled_superliga_has_venue_but_no_periods()
    test_incident_minute_stoppage_time_rounds_down()
    test_match_meta_scheduled_and_finished()
    test_extract_fsign_from_js_variants()
    print("OK: alle flashscore-parser-tests bestået (klient-tests kræver pytest).")


if __name__ == "__main__":
    _run_plain()


# Verificeret mod det rigtige liveTable-bundle 20/7-2026: signaturen ligger i
# et opslag pr. feed-type som `[i.EVENT]:"…"`.
def test_extract_fsign_livetable_format():
    from flashscore_client import extract_fsign
    js = 'e[e.SPORT=59]="SPORT"}(i||(i={}));var r={[i.EVENT]:"SW9D1eZo",[i.TOURNAMENT_TEMP]:"abc"}'
    assert extract_fsign(js) == "SW9D1eZo"
