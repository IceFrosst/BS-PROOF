> **ARCHIVE — the changelog that used to close `docs/SPEC.md` (revs 1–9,
> 2026-08-05 → 2026-08-25).** Moved here 2026-10-02. New method changes are
> logged in `docs/history/project-log.md`.

# SPEC changelog

- **2026-08-25 rev 9 — one-turn structured-output reliability.** Stream
  diagnostics on the targeted 32-study v1.25 gate showed every remaining S3/S7
  `max_turns` failure had wrapped stringified JSON inside a `StructuredOutput`
  property. The schema channel rejected that extra key and requested correction
  on turn two. v1.26 explicitly requires the schema object as the direct return
  argument. Because a first v1.26 live pass still wrapped 8/32 responses, the
  Claude adapter retains verbose first-turn tool arguments and may unwrap only
  the exact one-key `StructuredOutput`/`$PARAMETER_NAME` string transports or
  the observed S7 redundant array container `arms:{arms:[...]}`. The latter
  removes one container without changing an extracted value. The parsed object
  must pass the full original Draft-7 schema locally;
  malformed, additional, or schema-invalid content refuses. This is transport
  recovery, not scientific-field repair. `--max-turns 1`, schemas, scoring
  semantics, and constants are unchanged; the 32/32 live gate must pass before
  a full run.

- **2026-08-25 rev 8 — universal negative contract and scoring semantics.**
  `SCORING_MODEL` is now `v13-universal-negative-contract`; no scoring constants
  changed. S3 is staged before S5/S7 and passes exact target-arm facts. Fresh
  `PROMPT_VERSION` v1.26 emits the v1.24 extraction contract; S3/S5/S7 outputs
  require explicit extraction metadata and nullable/unknown
  fields; legacy is accepted only with explicit legacy metadata. Efficacy claims
  require an evidenced counterfactual, while valid safety harm/observational
  signals remain eligible. Factorial A+B versus B is eligible only when the
  non-target active background matches exactly. Group×time interactions may
  support direction, but their omnibus F cannot supply magnitude. Unsigned
  nonsignificant efficacy estimates are `inconclusive_unquantified` (`s=0`);
  only a typed successful equivalence/non-inferiority margin and compatible CI
  can restore −0.35. Outcome roles travel from the exact claim. Run
  `20260825_072759_creatine_creatine-monohydrate_claude-sr-ft-top5-suppl` is
  registered invalid for claims; no extraction or network run was performed.

- **2026-08-25 rev 7 follow-up — arm-key joins hardened.** Arm-keyed S7 facts
  are joined to the uniquely evidenced administered target arm from S3; a
  control-only or ambiguous one-row response is refused, as are duplicate
  normalised S3 labels. No array position, inferred alias, or dose projection
  can select the target arm.

- **2026-08-25 rev 7 — universal negative-effect repair.** Arm-level S3 facts now
  record target-ingredient presence, active cointerventions, evidenced text, and
  administered/measurement-only/biomarker/unclear role. S7 form and dose facts
  are arm-keyed; S5 records named arms, test kind, outcome role, estimand,
  timepoint, statistic provenance, p operator, and null precision/equivalence
  basis. The deterministic assembler refuses wrong-intervention, baseline,
  within-group, time-main, unresolved, unsigned-omnibus, and combination leakage;
  isolated factorial contrasts remain valid and group×time interactions may
  support direction without importing an omnibus magnitude. A nonsignificant
  efficacy claim without a usable signed between-arm estimate or explicit valid
  equivalence/non-inferiority basis is `inconclusive_unquantified` with zero
  signed contribution. Measured zero and harm behavior are unchanged. Primary
  endpoint hierarchy leads; mixed eligible unknown-role siblings collapse
  `unclear`, while safety harm still wins a tie. The 20260825_072759 run is
  invalid for claims pending a verified 32-study ledger; no audit delta is a
  corrected score or evidence mass.

- **2026-08-07 rev 6** — **Scoring redesigned; this supersedes §7–§9 as written
  before today.** Founder decisions, all measured rather than argued:

  1. Form, dose and population are OUT of `w_study`. The weight is study quality
     only. They are applicability and live on the arcs.
  2. **Four arcs**, each carrying a verdict AND its coverage — effect, form,
     dose, evidence. A form arc showing only coverage cannot tell a well-tested
     form from a well-tested-and-useless one; showing only a verdict hides that
     it rests on two studies.
  3. **0–100 composite** = `100 × c × mean(effect, form, dose)`. Confidence
     MULTIPLIES (as a fourth term in a mean, one tiny abstract-only trial scored
     76/100). A missing subset is PENALISED at its transfer tier (dropping it
     gave 99/100 to a product no trial had used that form for).
     **Superseded 2026-09-04 by v14** — `50 + SCORE/2`, positive signal
     discounted by applicability; see §9.
  4. The signed score is retained internally; only the display is 0–100. It does
     not reintroduce the §9 collapse because the evidence arc separates
     "barely studied" (3, empty arc) from "does not work" (15, full arc).
  5. Demo runs are FULL-TEXT ONLY by default. ~50 full-text studies reach the
     confidence ~300 abstract-only ones would.
  6. `pipeline/preview.py` projects small-run scores instead of rescaling `k`;
     it refuses below n=20, where the error spans four bands.

  Storage gained `composite` and `arcs` columns with an additive migration.
  Reports, the diagram and CLAUDE.md were brought in line in the same commit.

- **2026-08-06 rev 5** — **Unpaywall adds nothing over OpenAlex, and the model
  layer is proven.**

  The contact email was obtained and Unpaywall enabled. Full-corpus coverage did
  not move: still 76.2% OA / 77.5% methods-level facts. Head-to-head on 47
  closed records with DOIs: 20 resolved by both, **0 by OpenAlex only, 0 by
  Unpaywall only**, 27 by neither. OpenAlex already ingests Unpaywall data, so
  §4's "green OA is the largest single uplift" is **falsified**. The 2.5-point
  gap to the 80% target must close through **SR-table inheritance**, which is
  unbuilt and where synthesis:primary = 0.52 says the leverage is.

  First real subagent extractions ran (`pilot_adapter.py`, subscription auth,
  labelled non-production). S7 read "400 mg magnesium citrate twice daily",
  normalised to 800 mg/day compound, and returned `elemental_dose_mg: null`,
  `dose_basis: compound_only`, confidence 0.6 — refusing to guess, exactly as
  §5 requires — after which `elemental_dose_range_mg()` bounded it at
  95.1–129.3 mg in code. The elemental-dose trap works end to end.

  Also measured: dropping `--bare` re-enables CLAUDE.md auto-discovery and **no
  flag suppresses it** (`--settings '{}'` and `--strict-mcp-config` both leaked
  a canary). Only a working directory with no CLAUDE.md in it *or any ancestor*
  is hermetic — discovery walks up the tree.

- **2026-08-06 rev 4** — **Coverage re-measured over the FULL corpus and the
  target is NOT met.** 20 155 records, 100% of what the query matches:

  | | 16% slice | full corpus |
  |---|---|---|
  | Europe PMC alone | 78.7% | **68.7%** |
  | + green OA (OpenAlex) | 87.8% | **76.2%** |
  | methods-level facts | 88.9% | **77.5%** |

  The relevance-order bias predicted in rev 3 was real and large. Europe PMC
  returns results by relevance, well-cited papers are disproportionately open
  access, and a top-of-ranking slice therefore reads ~11 points high.

  **77.5% against a ≥80% target.** This does not invalidate the approach — the
  gap is 2.5 points and there are two named, unbuilt paths to close it:
  **Unpaywall** (needs only a contact email; OpenAlex alone recovered 19–20% of
  closed records) and **SR-table inheritance**, which is entirely unbuilt and
  whose leverage the now-meaningful synthesis:primary ratio of **0.52** makes
  substantial. But 80% is not currently demonstrated, and nothing should claim
  it is.

  Method note: any coverage figure must now state what fraction of the corpus it
  measured. `run_coverage.py` prints it and `europepmc.hit_count()` supplies it.

- **2026-08-06 rev 3** — [SUPERSEDED BY REV 4] Coverage measured over 3141 records with the real
  source modules. Europe PMC alone **78.7%** raw OA, **87.8%** projected with
  green OA, **88.9%** methods-level facts — above the ≥80% target §14 called the
  go/no-go. Unpaywall is not in it (needs a contact email).

  **That headline is not yet trustworthy, and the reason is now measured.**
  `hit_count()` shows magnesium matches 10 555 records and creatine 9 457, while
  the run fetches 300 syntheses + 1200 primaries each — **16% of the corpus, in
  relevance order**. Well-cited papers are disproportionately open access, so a
  top-of-ranking slice reads high. The evidence for the bias is in the run
  itself: the two truncated ingredients report 78.9% and 79.7% raw OA, while
  ashwagandha — the **only complete corpus** (141 of 141) — reports **65.2%**,
  projecting 81.5% methods-level facts.

  So the honest reading is: **the ladder clears 80% on the one corpus we have
  seen in full, and the multi-thousand-record ingredients are unmeasured.** The
  earlier 69.5% figure was a *differently* truncated slice, so the jump to 88.9%
  is mostly sample composition, not green OA. `run_coverage.py` now prints the
  truncation and refuses to report ratios computed over a capped fetch.

  Also built: deterministic design classification from PubMed tags
  (`pipeline/classify.py`), the retrieval orchestrator (`pipeline/retrieve.py`),
  storage on a portable Postgres-shaped schema (`pipeline/storage.py`,
  `schemas/storage.sql`), green-OA resolution (`sources/oa.py`), and the
  per-study fan-out (`workers.py`, model-gated). 2076 studies and 109 registry
  records persisted with zero model calls.

- **2026-08-06 rev 2** — §5 implemented. Three vocabularies + `schemas/ecu.json`
  + `pipeline/vocab.py` (deterministic, no model). Elemental conversion moved out
  of the model and into molar-mass arithmetic; `conversion_safe: false` refuses
  to convert hydrate-ambiguous salts rather than guess. Population match composes
  by worst axis. **Dose bands deliberately deferred** — `band_version: 0` /
  `dose_band: null` until bands can be derived from extracted doses, per founder
  decision. New open items in §13, including the unassigned population-text
  mapping. No scoring constants changed.

- **2026-08-06** — Claude review of the 2026-08-05 audit (`docs/history/2026-08-05-grok-full-repo-audit.md`). Band
  boundaries confirmed inclusive per §9 and now asserted at every edge. §9 band
  *labels* aligned to the strings `scoring.band_for` actually emits ("weak
  support", "does not work") — these are user-facing output, so the two must not
  drift. Registry-ID resolution in §6 amended: IDs are now **extracted** from the
  field rather than matched against the whole field, because a non-match splits
  one trial across its papers by DOI — the dedup trap in its dangerous direction.
  No constants changed.

- **2026-08-05 rev 3** — Added §15 stack inventory and §16 subagent roster (S1–S8,
  pure-function contracts, evidence spans, cache keying on prompt_version).
  Dropped JCR impact factor in favour of free Scimago SJR quartile. Added GROBID
  and JATS XML parsing as the non-AI extraction path.

- **2026-08-05 rev 2** — Coverage strategy reworked. Added green-OA resolution
  (Unpaywall / OpenAlex) as the largest single uplift. Introduced the
  methods-facts-vs-full-text distinction and the full-text ladder. **Retrieval
  priority inverted: fetch OA syntheses before primaries**, because SR tables carry
  structured data for ~15 primaries each. Inherited RoB penalty 0.85 added.
  EFSA downgraded to a one-sided constraint after founder correctly flagged its
  strictness. 28-anchor calibration set built (`ANCHORS.md`, `anchors.csv`).

- **2026-08-05** — Initial spec. Signed score (−100…+100) adopted over unsigned.
  Multi-outcome rows adopted (canonical outcome set, label claim highlights only).
  Population variants precomputed with delta as a display hook. Hybrid DAG +
  per-study workers confirmed. v1 input is typed ingredient name; scan layer deferred.
  Calibration restructured to three tiers after founder correctly noted they cannot
  hand-rate ECUs themselves.

- **2026-09-17** — Founder approved shipping the simpler retained Evidence Ledger on
  real `/scan` for three exact, source-verified product/form/dose targets. The
  browser-safe implementation is shared by the lab and scan. The prior continuous
  v14 scorer remains in code and API as a documented backup; it is never presented
  as `/4`, and unmatched products explicitly receive no exact-audit state. The
  retained audits remain heuristic and unvalidated. Expanding beyond these fixtures
  requires a source-retrieval service before `research_audit` can be run honestly.
