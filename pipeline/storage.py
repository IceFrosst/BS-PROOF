"""
The only module that talks to the database. NO MODEL MAY ENTER THIS FILE.

Everything goes through here so the move from SQLite to Postgres/Supabase is a
connection change, not a rewrite. That means no SQLite-specific SQL in this file
and none in schemas/storage.sql -- see the header there for the constraints.

It holds the retrieved corpus (studies, registry facts). The graded result of a
run lives in its immutable artifacts under reports/runs/, not here. (The v14
`ecu` tables are no longer written; an old database may still carry them.)
"""
from __future__ import annotations
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
SCHEMA_SQL = ROOT / "schemas" / "storage.sql"
DEFAULT_DB = ROOT / "out" / "bsproof.sqlite"
# Per-run override, so parallel ingredient runs can isolate their stores without
# changing the documented default. Unset -> production still writes bsproof.sqlite.
if os.environ.get("SP_DB"):
    DEFAULT_DB = Path(os.environ["SP_DB"])


def now_iso() -> str:
    """ISO-8601 UTC. Text everywhere, so ordering is lexicographic on both engines."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    """
    Thin wrapper. Deliberately not an ORM: the access pattern is exact-key
    lookup on a 5-tuple plus bulk insert, and an ORM would hide the index that
    makes it fast.
    """

    def __init__(self, path: Path | str = DEFAULT_DB):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        # CONCURRENCY, added 2026-08-09. Default SQLite is journal_mode=delete
        # with busy_timeout=0, so a second writer fails instantly with
        # "database is locked". Three parallel ingredient runs against one store
        # is a normal thing to want and used to be impossible.
        #
        # WAL gives one writer alongside many readers; busy_timeout makes a
        # competing writer WAIT rather than raise. Both are SQLite-only and
        # Postgres ignores them -- they configure the engine, not the schema, so
        # the store stays postgres-shaped. This is not the "pragma-free" the
        # note below means: that is about FK enforcement semantics differing
        # between engines, which these two do not touch.
        try:
            self.conn.execute("PRAGMA journal_mode=WAL")
        except sqlite3.DatabaseError:
            pass          # network filesystems refuse WAL; fall back to default
        self.conn.execute("PRAGMA busy_timeout=30000")
        # Portable pragma-free setup: foreign keys stay off because the schema
        # uses no FK constraints (Postgres would enforce them differently and
        # partial pipelines legitimately write children before parents).
        self.conn.executescript(SCHEMA_SQL.read_text())
        self._migrate()
        self.conn.commit()

    def _migrate(self):
        """
        Additive column migrations. CREATE TABLE IF NOT EXISTS silently skips an
        existing table, so a new column never appears in a database created by
        an older schema -- and the symptom is silent data loss, not an error.
        Postgres accepts the same ADD COLUMN syntax.
        """
        have = {r[1] for r in self.conn.execute("PRAGMA table_info(study)")}
        for col, ddl in (("abstract", "ALTER TABLE study ADD COLUMN abstract TEXT"),
                         ("oa_location",
                          "ALTER TABLE study ADD COLUMN oa_location TEXT"),
                         # Crossref publisher, 2026-08-08. The predatory list is
                         # PUBLISHERS; matching it against a journal title was a
                         # category error that flagged 13.2% of a real corpus.
                         ("publisher",
                          "ALTER TABLE study ADD COLUMN publisher TEXT"),
                         # Which per-outcome queries found this record
                         # (comma-joined outcome ids). 2026-08-11: the
                         # per-outcome quota work was computed in retrieval and
                         # then LOST here, so --limit selection could not
                         # stratify and endurance/energy studies sat in the
                         # priority tail. n=4 and n=1 while 122-200 hits existed.
                         ("retrieved_for",
                          "ALTER TABLE study ADD COLUMN retrieved_for TEXT")):
            if col not in have:
                self.conn.execute(ddl)

    def close(self):
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # ------------------------------------------------------------- studies

    def upsert_studies(self, records: list[dict]) -> int:
        """
        Records must already be deduplicated -- they carry `_canonical` from
        pipeline.dedup. Writing pre-dedup records would put one trial in the
        table four times, which is the exact failure SPEC section 6 exists to
        prevent.
        """
        rows = []
        for r in records:
            canonical = r.get("_canonical")
            if not canonical:
                raise ValueError("record has no _canonical -- run pipeline.dedup first")
            kind = canonical.split(":", 1)[0]
            rows.append((
                canonical, kind, r.get("pmid"), r.get("pmcid"), r.get("doi"),
                r.get("registration_id"), r.get("title"), r.get("abstract"),
                r.get("journal"),
                r.get("year"), r.get("first_author"),
                1 if r.get("is_synthesis") else 0,
                r.get("design_rank"), r.get("basis"), r.get("oa"),
                json.dumps(r["oa_location"]) if r.get("oa_location") else None,
                1 if r.get("retracted") else 0,
                json.dumps(r.get("_merged_from") or []),
                r.get("source") or "unknown", now_iso(),
                r.get("publisher"), r.get("retrieved_for"),
            ))
        self.conn.executemany(
            "INSERT INTO study (canonical_id, id_kind, pmid, pmcid, doi,"
            " registration_id, title, abstract, journal, year, first_author, is_synthesis,"
            " design_rank, design_basis, oa, oa_location, retracted, merged_from,"
            " source, fetched_at, publisher, retrieved_for)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT(canonical_id) DO UPDATE SET"
            "   design_rank=excluded.design_rank, design_basis=excluded.design_basis,"
            "   oa=excluded.oa, merged_from=excluded.merged_from,"
            "   oa_location=COALESCE(excluded.oa_location, study.oa_location),"
            # Never overwrite a stored abstract with a null from a later,
            # thinner record -- that is how the text vanished in the first place.
            "   abstract=COALESCE(excluded.abstract, study.abstract),"
            "   publisher=COALESCE(excluded.publisher, study.publisher),"
            "   retrieved_for=COALESCE(excluded.retrieved_for, study.retrieved_for),"
            "   fetched_at=excluded.fetched_at",
            rows)
        self.conn.commit()
        return len(rows)

    def studies(self, *, syntheses: bool | None = None) -> list[dict]:
        q = "SELECT * FROM study"
        args: tuple = ()
        if syntheses is not None:
            q += " WHERE is_synthesis = ?"
            args = (1 if syntheses else 0,)
        return [dict(r) for r in self.conn.execute(q, args)]

    def unclassified(self) -> list[dict]:
        """Studies awaiting S1. This list is the model budget for classification."""
        return [dict(r) for r in
                self.conn.execute("SELECT * FROM study WHERE design_rank IS NULL")]

    # ------------------------------------------------------ registry facts

    def upsert_registry_facts(self, facts: list[dict]) -> int:
        rows = []
        for f in facts:
            a, d = f.get("attrition") or {}, f.get("design") or {}
            u = f.get("unpublished") or {}
            rows.append((
                f["nct_id"], f.get("item3_prospective_registration"),
                f.get("item3_reason"),
                json.dumps(f.get("registered_primary_outcomes") or []),
                a.get("n_started"), a.get("n_completed"), a.get("dropout_rate"),
                d.get("allocation"), d.get("masking"), d.get("n_enrolled"),
                1 if u.get("flagged") else 0, u.get("status"),
                u.get("completion_date"), now_iso(),
            ))
        self.conn.executemany(
            "INSERT INTO registry_facts (nct_id, item3_prospective, item3_reason,"
            " registered_primary_outcomes, n_started, n_completed, dropout_rate,"
            " allocation, masking, n_enrolled, unpublished_flagged, overall_status,"
            " completion_date, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT(nct_id) DO UPDATE SET"
            "   item3_prospective=excluded.item3_prospective,"
            "   item3_reason=excluded.item3_reason,"
            "   registered_primary_outcomes=excluded.registered_primary_outcomes,"
            "   n_started=excluded.n_started, n_completed=excluded.n_completed,"
            "   dropout_rate=excluded.dropout_rate,"
            "   unpublished_flagged=excluded.unpublished_flagged,"
            "   fetched_at=excluded.fetched_at",
            rows)
        self.conn.commit()
        return len(rows)

    def registry_facts(self, nct_id: str) -> dict | None:
        r = self.conn.execute("SELECT * FROM registry_facts WHERE nct_id = ?",
                              (nct_id.upper(),)).fetchone()
        return dict(r) if r else None

    def counts(self) -> dict:
        def one(sql):
            return self.conn.execute(sql).fetchone()[0]
        return {
            "studies": one("SELECT COUNT(*) FROM study"),
            "syntheses": one("SELECT COUNT(*) FROM study WHERE is_synthesis = 1"),
            "unclassified": one("SELECT COUNT(*) FROM study WHERE design_rank IS NULL"),
            "registry_facts": one("SELECT COUNT(*) FROM registry_facts"),
        }
