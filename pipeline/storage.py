"""
The only module that talks to the database. NO MODEL MAY ENTER THIS FILE.

Everything goes through here so the move from SQLite to Postgres/Supabase is a
connection change, not a rewrite. That means no SQLite-specific SQL in this file
and none in schemas/storage.sql -- see the header there for the constraints.

Storage is not a cache. A stored ECU is a published claim about a named brand,
so every row carries the prompt version, vocabulary versions and timestamp that
produced it. If a score changes, provenance says which input moved.
"""
from __future__ import annotations
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
SCHEMA_SQL = ROOT / "schemas" / "storage.sql"
DEFAULT_DB = ROOT / "out" / "bsproof.sqlite"


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
        for col, ddl in (("abstract", "ALTER TABLE study ADD COLUMN abstract TEXT"),):
            if col not in have:
                self.conn.execute(ddl)
        # ECU gained the 0-100 composite and the per-arc detail on 2026-08-07.
        ecu_have = {r[1] for r in self.conn.execute("PRAGMA table_info(ecu)")}
        for col, ddl in (("composite", "ALTER TABLE ecu ADD COLUMN composite INTEGER"),
                         ("arcs", "ALTER TABLE ecu ADD COLUMN arcs TEXT")):
            if col not in ecu_have:
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
                1 if r.get("retracted") else 0,
                json.dumps(r.get("_merged_from") or []),
                r.get("source") or "unknown", now_iso(),
            ))
        self.conn.executemany(
            "INSERT INTO study (canonical_id, id_kind, pmid, pmcid, doi,"
            " registration_id, title, abstract, journal, year, first_author, is_synthesis,"
            " design_rank, design_basis, oa, retracted, merged_from, source, fetched_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT(canonical_id) DO UPDATE SET"
            "   design_rank=excluded.design_rank, design_basis=excluded.design_basis,"
            "   oa=excluded.oa, merged_from=excluded.merged_from,"
            # Never overwrite a stored abstract with a null from a later,
            # thinner record -- that is how the text vanished in the first place.
            "   abstract=COALESCE(excluded.abstract, study.abstract),"
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

    # ----------------------------------------------------------------- ECU

    def upsert_ecu(self, ecu: dict, evidence: list[dict] | None = None) -> str:
        """
        Write one scored row plus its audit trail. `ecu` matches schemas/ecu.json.
        """
        pop = ecu["population"]
        comp = ecu.get("components") or {}
        dose = ecu.get("dose_range_mg") or {}
        prov = ecu["provenance"]
        self.conn.execute(
            "INSERT INTO ecu (ecu_key, ingredient, form_vocab_id, dose_band,"
            " band_version, outcome_vocab_id, population_id, age_band, sex,"
            " deficiency_status, pregnancy, score, band, gate_fired, d, c, h, e,"
            " e_prime, coverage, composite, arcs, n_primaries, n_syntheses, dose_low_mg,"
            " dose_high_mg, dose_basis, flags, prompt_version, vocab_versions,"
            " scorer_version, computed_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT(ecu_key) DO UPDATE SET"
            "   score=excluded.score, band=excluded.band,"
            "   gate_fired=excluded.gate_fired, d=excluded.d, c=excluded.c,"
            "   h=excluded.h, e=excluded.e, e_prime=excluded.e_prime,"
            "   coverage=excluded.coverage, n_primaries=excluded.n_primaries,"
            "   n_syntheses=excluded.n_syntheses, flags=excluded.flags,"
            "   composite=excluded.composite, arcs=excluded.arcs,"
            "   prompt_version=excluded.prompt_version,"
            "   vocab_versions=excluded.vocab_versions,"
            "   band_version=excluded.band_version, computed_at=excluded.computed_at",
            (ecu["ecu_key"], ecu["ingredient"], ecu["form_vocab_id"],
             ecu.get("dose_band"), ecu.get("band_version", 0),
             ecu["outcome_vocab_id"], pop["id"], pop["age_band"], pop["sex"],
             pop["deficiency_status"], pop["pregnancy"],
             ecu.get("score"), ecu["band"], 1 if ecu.get("gate_fired") else 0,
             comp.get("d"), comp.get("c"), comp.get("H"), comp.get("E"),
             comp.get("E_prime"), comp.get("coverage"),
             ecu.get("composite"), json.dumps(ecu.get("arcs") or {}),
             ecu["evidence"]["n_primaries"], ecu["evidence"]["n_syntheses"],
             dose.get("low"), dose.get("high"), dose.get("basis"),
             json.dumps(ecu.get("flags") or []), prov["prompt_version"],
             json.dumps(prov["vocab_versions"]), prov.get("scorer_version"),
             prov["computed_at"]))

        for e in (evidence or []):
            self.conn.execute(
                "INSERT INTO ecu_evidence (ecu_key, canonical_id, role, w_study,"
                " s_value, transfer_factor, form_match, dose_match, pop_match)"
                " VALUES (?,?,?,?,?,?,?,?,?)"
                " ON CONFLICT(ecu_key, canonical_id) DO UPDATE SET"
                "   w_study=excluded.w_study, s_value=excluded.s_value,"
                "   transfer_factor=excluded.transfer_factor",
                (ecu["ecu_key"], e["canonical_id"], e.get("role", "primary"),
                 e.get("w_study"), e.get("s_value"), e.get("transfer_factor"),
                 e.get("form_match"), e.get("dose_match"), e.get("pop_match")))
        self.conn.commit()
        return ecu["ecu_key"]

    def ecu(self, ecu_key: str) -> dict | None:
        r = self.conn.execute("SELECT * FROM ecu WHERE ecu_key = ?", (ecu_key,)).fetchone()
        return dict(r) if r else None

    def ecus_for(self, ingredient: str) -> list[dict]:
        """
        Every scored row for an ingredient, heaviest evidence first. This is the
        canonical outcome set the product displays -- one row per outcome, the
        label claim merely highlights one of them.
        """
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM ecu WHERE ingredient = ?"
            " ORDER BY n_primaries DESC, e DESC", (ingredient,))]

    def evidence_for(self, ecu_key: str) -> list[dict]:
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM ecu_evidence WHERE ecu_key = ?"
            " ORDER BY w_study DESC", (ecu_key,))]

    def stale_bands(self, current_band_version: int) -> list[str]:
        """
        ECU keys computed under an older band_version. Dose bands shift when new
        trials land, and every ECU carrying an older version is invalid -- SPEC
        section 5's complexity flag, made queryable.
        """
        return [r["ecu_key"] for r in self.conn.execute(
            "SELECT ecu_key FROM ecu WHERE band_version < ?", (current_band_version,))]

    def counts(self) -> dict:
        def one(sql):
            return self.conn.execute(sql).fetchone()[0]
        return {
            "studies": one("SELECT COUNT(*) FROM study"),
            "syntheses": one("SELECT COUNT(*) FROM study WHERE is_synthesis = 1"),
            "unclassified": one("SELECT COUNT(*) FROM study WHERE design_rank IS NULL"),
            "registry_facts": one("SELECT COUNT(*) FROM registry_facts"),
            "ecus": one("SELECT COUNT(*) FROM ecu"),
        }
