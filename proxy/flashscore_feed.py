"""
flashscore_feed.py
==================
RENE parsere for Flashscore/livescore.in's interne feed-format — ingen IO her
(HTTP-laget ligger i ``flashscore_client.py``). Bruges til Superliga-spillet.

Feed-formatet (bekræftet mod gemte HAR-optagelser + en fuld dagsliste):

  * Records adskilles af ``~``, felter af ``¬``, nøgle/værdi af ``÷``.
    Fx: ``AA÷OUzl0hh4¬AD÷1784912400¬AE÷Viborg¬...~AA÷...``
  * Dagslisten (``f_1_{offset}_3_en_1``) er sektioneret pr. turnering: en
    ``ZA÷DENMARK: Superliga``-record efterfulgt af kamp-records (``AA÷<id>``).
    Kampfelter: ``AD``=kickoff (epoch s), ``AE``/``AF``=hjemme/ude-navn,
    ``WM``/``WN``=holdkoder, ``AG``/``AH``=aktuel score, ``AB``=grov status.
  * Status: ``AB÷1``=programsat, ``2``=i gang, ``3``=slut. OBS (verificeret i
    dagslisten): udsatte kampe står OGSÅ med ``AB÷3`` men uden scorer og med
    detaljestatus ``AC÷4`` — så "slut" må aldrig tolkes som "har et resultat".
  * Hændelsesfeedet (``df_sui_1_{eventId}``) består af periode-headere
    (``AC÷1st Half`` …) efterfulgt af hændelses-records (``III÷<id>``). Én
    record kan rumme FLERE del-hændelser (udskiftning ud+ind, mål+assist) —
    hver del afsluttes af sit ``IK÷<slags>``-felt. ``IB``=minut ("45+2'" mulig),
    ``IF``=spiller, ``ICT``=kommentartekst, ``IA``=side (1=hjemme, 2=ude).
  * Kamp-meta (venue m.m.) kommer som ``MIT÷<nøgle>¬MIV÷<værdi>``-par
    (VEN=stadion, TWN=by, CAP=kapacitet, ATT=tilskuere, REF=dommer).

Alt er defensivt: ukendte koder ignoreres, manglende scorer → None.
"""

from __future__ import annotations

import re
from typing import Any

# Feltseparatorer (Flashscores egne, ikke-ASCII med vilje).
REC_SEP = "~"
FIELD_SEP = "¬"
KV_SEP = "÷"

# Grov kampstatus (AB) → læsbar streng. Ukendte koder bevares som rå streng.
STATUS_MAP = {"1": "scheduled", "2": "live", "3": "finished"}


def _pairs(record: str) -> list[tuple[str, str]]:
    """Én record → ordnet liste af (kode, værdi). Felter uden ``÷`` droppes."""
    out: list[tuple[str, str]] = []
    for field in record.split(FIELD_SEP):
        if KV_SEP in field:
            k, _, v = field.partition(KV_SEP)
            if k:
                out.append((k, v))
    return out


def parse_feed(text: str) -> list[dict[str, str]]:
    """Hele feed-teksten → liste af records som dicts (kode → værdi).

    Ved gentagne koder i samme record (fx ``IF`` for både ud- og ind-spiller i
    en udskiftning) vinder FØRSTE forekomst — brug ``_pairs`` hvis rækkefølgen
    betyder noget (det gør den i hændelses-parseren nedenfor).
    """
    records: list[dict[str, str]] = []
    for rec in text.split(REC_SEP):
        pairs = _pairs(rec)
        if not pairs:
            continue
        d: dict[str, str] = {}
        for k, v in pairs:
            d.setdefault(k, v)
        records.append(d)
    return records


def _to_int(value: str | None) -> int | None:
    """Tolerant int: None/tom/ikke-numerisk → None. Tåler "9 566" (mellemrum)."""
    if value is None:
        return None
    digits = re.sub(r"[^\d-]", "", value)
    try:
        return int(digits)
    except ValueError:
        return None


def _match_from_record(d: dict[str, str]) -> dict[str, Any]:
    """Én kamp-record (har ``AA``) → vores kampdict."""
    return {
        "event_id": d.get("AA"),
        "kickoff": _to_int(d.get("AD")),
        "home": d.get("AE"),
        "away": d.get("AF"),
        "home_code": d.get("WM"),
        "away_code": d.get("WN"),
        "status": STATUS_MAP.get(d.get("AB", ""), d.get("AB")),
        # AC er Flashscores detaljestatus (1=NS, 12=2. halvleg, 4=udsat, ...) —
        # medtages råt, da AB÷3 alene ikke skelner "slut" fra "udsat".
        "status_detail": d.get("AC"),
        "home_score": _to_int(d.get("AG")),
        "away_score": _to_int(d.get("AH")),
    }


def parse_daily(
    text: str,
    country: str | None = "DENMARK",
    league: str | None = "Superliga",
) -> list[dict[str, Any]]:
    """Dagsliste-feed → kampe, filtreret til én turnering.

    Sektioner starter med ``ZA÷<LAND>: <Liga>``. Filteret matcher BÅDE land og
    liganavn præcist ("ROMANIA: Superliga" må ikke slippe igennem et rent
    liganavns-filter). ``country=None`` → alle sektioner (bruges i tests til
    bredde-parsning af hele dagslisten).
    """
    matches: list[dict[str, Any]] = []
    in_wanted = country is None  # uden filter: tag alt
    for rec in text.split(REC_SEP):
        pairs = _pairs(rec)
        if not pairs:
            continue
        d: dict[str, str] = {}
        for k, v in pairs:
            d.setdefault(k, v)
        if "ZA" in d:
            # Ny turnerings-sektion — afgør om den er den ønskede.
            if country is None:
                in_wanted = True
            else:
                want = f"{country}: {league}" if league else country
                in_wanted = d["ZA"].strip() == want
            continue
        if in_wanted and "AA" in d:
            matches.append(_match_from_record(d))
    return matches


# ----------------------------------------------------------------------------
# Hændelser (df_sui) + kamp-meta
# ----------------------------------------------------------------------------

# MIT-nøgle → vores meta-felt (resten ignoreres tavst).
_META_KEYS = {
    "VEN": "venue",
    "TWN": "town",
    "CAP": "capacity",
    "ATT": "attendance",
    "REF": "referee",
}


def _incidents_from_pairs(pairs: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """Én ``III``-record → liste af del-hændelser.

    Vi går felterne igennem i rækkefølge; hvert ``IK`` (slags) AFSLUTTER en
    del-hændelse med den senest sete spiller (``IF``) og tekst (``ICT``).
    Minut (``IB``) og side (``IA``) står én gang pr. record og deles af alle
    del-hændelser (mål+assist sker i samme minut).
    """
    minute_raw = None
    side = None
    player = None
    text = None
    out: list[dict[str, Any]] = []
    for k, v in pairs:
        if k == "IB":
            minute_raw = v
        elif k == "IA":
            side = v
        elif k == "IF":
            player = v
        elif k == "ICT":
            text = v
        elif k == "IK":
            out.append({
                # "45+2'" → 45 (tillægstid rundes til periodens minut); den rå
                # streng bevares ikke — spillet regner i hele minutter.
                "minute": _to_int((minute_raw or "").split("+")[0]),
                "kind": v,
                "player": player,
                "text": text or None,
                "side": {"1": "home", "2": "away"}.get(side or ""),
            })
            player = None
            text = None
    return out


def parse_incidents(text: str) -> dict[str, Any]:
    """Hændelsesfeed → ``{"periods": [...], "meta": {...}}``.

    Perioder (``AC÷1st Half`` …) samler de efterfølgende hændelser. Meta
    (``MIT``/``MIV``-par) kan stå både før og efter hændelserne — begge dele
    ses i praksis (programsat kamp: kun meta; færdig kamp: meta til sidst).
    """
    periods: list[dict[str, Any]] = []
    meta: dict[str, Any] = {}
    current: dict[str, Any] | None = None
    for rec in text.split(REC_SEP):
        pairs = _pairs(rec)
        if not pairs:
            continue
        keys = {k for k, _ in pairs}
        if "MIT" in keys:
            # Meta-record: MIT (nøgle) og MIV (værdi) kommer parvis i rækkefølge.
            pending: str | None = None
            for k, v in pairs:
                if k == "MIT":
                    pending = _META_KEYS.get(v)
                elif k == "MIV" and pending:
                    meta[pending] = _to_int(v) if pending in ("capacity", "attendance") else v
                    pending = None
            continue
        if "AC" in keys and "III" not in keys:
            # Periode-header (fx "1st Half"). IG/IH = scoren periodens start.
            d = dict(pairs)
            current = {"name": d.get("AC"), "incidents": []}
            periods.append(current)
            continue
        if "III" in keys:
            incidents = _incidents_from_pairs(pairs)
            if current is None:
                # Defensivt: hændelse før første periode-header.
                current = {"name": None, "incidents": []}
                periods.append(current)
            current["incidents"].extend(incidents)
    return {"periods": periods, "meta": meta}


def parse_match_meta(text: str) -> dict[str, Any]:
    """``dc_1_{eventId}``-feed → kampens stamdata.

    ``DD``=kickoff (epoch s), ``DA``=status (samme koder som AB), ``DE``/``DF``
    =slutstilling (kun på færdige kampe → ellers None).
    """
    records = parse_feed(text)
    d = records[0] if records else {}
    return {
        "kickoff": _to_int(d.get("DD")),
        "status": STATUS_MAP.get(d.get("DA", ""), d.get("DA")),
        "home_score": _to_int(d.get("DE")),
        "away_score": _to_int(d.get("DF")),
    }
