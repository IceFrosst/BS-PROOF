-- BS-PROOF storage schema.
--
-- PORTABLE SQL ONLY. This runs on SQLite today and must load into Postgres
-- (Supabase) unchanged apart from the connection string. That constrains it:
--   * no AUTOINCREMENT, no SQLite type affinities, no INTEGER PRIMARY KEY tricks
--   * TEXT for all timestamps, ISO-8601, so ordering is lexicographic everywhere
--   * TEXT for JSON payloads -- SQLite has no jsonb and Postgres will cast
--   * explicit column types, no bare or omitted types
--
-- The access pattern is exact-key lookup on a 5-tuple, which is a btree index,
-- which is why this is a relational store and not a vector DB (SPEC section 10).

CREATE TABLE IF NOT EXISTS study (
    canonical_id      TEXT PRIMARY KEY,   -- "registry:nct01234567" etc, from dedup
    id_kind           TEXT NOT NULL,      -- registry | doi | pmid | fingerprint
    pmid              TEXT,
    pmcid             TEXT,
    doi               TEXT,
    registration_id   TEXT,
    title             TEXT,
    abstract          TEXT,   -- fallback extraction text when no full text
    journal           TEXT,
    year              INTEGER,
    first_author      TEXT,
    is_synthesis      INTEGER NOT NULL DEFAULT 0,   -- 0/1; no BOOLEAN in SQLite
    design_rank       INTEGER,            -- NULL = unclassified, needs S1
    design_basis      TEXT,
    oa                TEXT,               -- full_text | sr_table | abstract_only
    oa_location       TEXT,               -- JSON: reachable OA copy found off-PMC
    retracted         INTEGER NOT NULL DEFAULT 0,
    merged_from       TEXT,               -- JSON array of the papers collapsed here
    source            TEXT NOT NULL,
    fetched_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_study_registration ON study (registration_id);
CREATE INDEX IF NOT EXISTS idx_study_doi          ON study (doi);
CREATE INDEX IF NOT EXISTS idx_study_synthesis    ON study (is_synthesis, design_rank);

-- Registry facts are kept SEPARATE from the paper. One trial can yield four
-- papers; the registry record belongs to the trial, not to any one of them.
CREATE TABLE IF NOT EXISTS registry_facts (
    nct_id                       TEXT PRIMARY KEY,
    item3_prospective            INTEGER,   -- 1 | 0 | NULL. NULL means unverifiable.
    item3_reason                 TEXT,
    registered_primary_outcomes  TEXT,      -- JSON array
    n_started                    INTEGER,
    n_completed                  INTEGER,
    dropout_rate                 REAL,
    allocation                   TEXT,
    masking                      TEXT,
    n_enrolled                   INTEGER,
    unpublished_flagged          INTEGER NOT NULL DEFAULT 0,
    overall_status               TEXT,
    completion_date              TEXT,
    fetched_at                   TEXT NOT NULL
);

-- The scored row. One per (ingredient, form, dose_band, outcome, population).
CREATE TABLE IF NOT EXISTS ecu (
    ecu_key           TEXT PRIMARY KEY,
    ingredient        TEXT NOT NULL,
    form_vocab_id     TEXT NOT NULL,
    dose_band         TEXT,               -- NULL until bands are derived
    band_version      INTEGER NOT NULL DEFAULT 0,
    outcome_vocab_id  TEXT NOT NULL,
    population_id     TEXT NOT NULL,
    age_band          TEXT NOT NULL,
    sex               TEXT NOT NULL,
    deficiency_status TEXT NOT NULL,
    pregnancy         TEXT NOT NULL,

    score             INTEGER,            -- signed -100..100, INTERNAL (bands, anchors)
    composite         INTEGER,            -- 0..100, the DISPLAYED number
    arcs              TEXT,               -- JSON: per-arc verdict + coverage
    band              TEXT NOT NULL,
    gate_fired        INTEGER NOT NULL DEFAULT 0,

    d                 REAL,
    c                 REAL,
    h                 REAL,
    e                 REAL,
    e_prime           REAL,
    coverage          REAL,

    n_primaries       INTEGER NOT NULL DEFAULT 0,
    n_syntheses       INTEGER NOT NULL DEFAULT 0,
    dose_low_mg       REAL,
    dose_high_mg      REAL,
    dose_basis        TEXT,

    flags             TEXT,               -- JSON array; shown, never scored
    prompt_version    TEXT NOT NULL,
    vocab_versions    TEXT NOT NULL,      -- JSON object
    scorer_version    TEXT,
    computed_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ecu_lookup ON ecu
    (ingredient, form_vocab_id, outcome_vocab_id, population_id);
CREATE INDEX IF NOT EXISTS idx_ecu_band_version ON ecu (band_version);

-- Which studies backed which ECU, and at what discount they got there. This is
-- the audit trail: every published number must be reconstructible from it.
CREATE TABLE IF NOT EXISTS ecu_evidence (
    ecu_key         TEXT NOT NULL,
    canonical_id    TEXT NOT NULL,
    role            TEXT NOT NULL,      -- primary | synthesis
    w_study         REAL,
    s_value         REAL,
    transfer_factor REAL,               -- 1.0 when the study is native to this ECU
    form_match      TEXT,
    dose_match      TEXT,
    pop_match       TEXT,
    PRIMARY KEY (ecu_key, canonical_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_study ON ecu_evidence (canonical_id);
