"""
pg_cache.py
===========
PostgreSQL-cache (synkron) — drop-in for JsonFileCache i tdf_results.py.
Bruges på Cloud Run, hvor filsystemet er flygtigt: uden et persistent lager
ville den cachede JSON forsvinde ved cold start (og etaper genskrabes).

Samme fire metoder som JsonFileCache, så service-laget er uændret:
    get_stage / set_stage / get_stage_list / set_stage_list

Aktiveres automatisk når miljøvariablen DATABASE_URL er sat (se tdf_api.py).
Skema oprettes idempotent ved opstart.

    pip install "psycopg[binary]"
    export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
"""

from __future__ import annotations

import os
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

RACE_SLUG = os.getenv("RACE_SLUG", "tour-de-france")


class PgCache:
    def __init__(self, dsn: str | None = None) -> None:
        self.dsn = dsn or os.environ["DATABASE_URL"]
        self._init_schema()

    def _conn(self):
        return psycopg.connect(self.dsn)

    def _init_schema(self) -> None:
        with self._conn() as c, c.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS tdf_stages (
                    slug text NOT NULL,
                    year int  NOT NULL,
                    n    int  NOT NULL,
                    data jsonb NOT NULL,
                    PRIMARY KEY (slug, year, n)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS tdf_stage_lists (
                    slug text NOT NULL,
                    year int  NOT NULL,
                    data jsonb NOT NULL,
                    PRIMARY KEY (slug, year)
                )
                """
            )
            c.commit()

    # ---- enkelt etape ----
    def get_stage(self, year: int, n: int) -> dict[str, Any] | None:
        with self._conn() as c, c.cursor() as cur:
            cur.execute(
                "SELECT data FROM tdf_stages WHERE slug=%s AND year=%s AND n=%s",
                (RACE_SLUG, year, n),
            )
            row = cur.fetchone()
            return row[0] if row else None

    def set_stage(self, year: int, n: int, data: dict[str, Any]) -> None:
        with self._conn() as c, c.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tdf_stages (slug, year, n, data)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (slug, year, n) DO UPDATE SET data = EXCLUDED.data
                """,
                (RACE_SLUG, year, n, Jsonb(data)),
            )
            c.commit()

    # ---- etapeliste ----
    def get_stage_list(self, year: int) -> list[dict[str, Any]] | None:
        with self._conn() as c, c.cursor() as cur:
            cur.execute(
                "SELECT data FROM tdf_stage_lists WHERE slug=%s AND year=%s",
                (RACE_SLUG, year),
            )
            row = cur.fetchone()
            return row[0] if row else None

    def set_stage_list(self, year: int, data: list[dict[str, Any]]) -> None:
        with self._conn() as c, c.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tdf_stage_lists (slug, year, data)
                VALUES (%s, %s, %s)
                ON CONFLICT (slug, year) DO UPDATE SET data = EXCLUDED.data
                """,
                (RACE_SLUG, year, Jsonb(data)),
            )
            c.commit()
