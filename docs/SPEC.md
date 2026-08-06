# Supplement Evidence Pipeline — v1 Technical Spec

**Status:** design, pre-build
**Last updated:** 2026-08-05 (rev 3)
**Companion artifacts:** `supplement_pipeline_v1.excalidraw`, `ANCHORS.md`, `anchors.csv`

> This is a living document. When a decision changes, update the relevant section
> *and* the changelog at the bottom, then regenerate the diagram.

---

## 0. What this system is

A pipeline that takes a supplement ingredient and returns, for each health outcome
that ingredient is sold against, a **signed score from −100 to +100** describing
what the scientific literature actually says — adjusted for the specific **form**
and **dose** in question.

**The differentiator in one sentence:** every competitor scores *ingredients*;
this scores *ingredient × form × dose × outcome × population*, and discounts
evidence that doesn't match the specific product.

**Positioning:** neutral. The system reports what the evidence shows and what the
brand claimed. It does not editorialise.

---

## 1. The ECU — the atomic unit

```
ECU key = (ingredient, form, dose_band, outcome, population)
```

"Ashwagandha works for stress" is not a statement that can be true or false.
It's four questions in a trenchcoat: which preparation, at what dose, for which
outcome, in whom. Change any one and the honest verdict can flip sign.

The ECU makes those axes explicit so the evidence base can be summed over something
coherent. Everything downstream is a function of this tuple:

- the database is keyed on it
- the cache hits or misses on it
- studies are bucketed into it
- the signed score is computed per ECU
- the transfer factor exists to move evidence *between* ECUs at a discount

### Worked example

Input: `magnesium`, form `glycinate`, 200 mg elemental.

Produces an ECU **set**, not a single ECU:

| ingredient | form | dose_band | outcome | population |
|---|---|---|---|---|
| magnesium | glycinate | 150–250 mg | sleep onset latency | general adult |
| magnesium | glycinate | 150–250 mg | sleep onset latency | deficient |
| magnesium | glycinate | 150–250 mg | muscle cramps | general adult |
| magnesium | glycinate | 150–250 mg | anxiety | general adult |
| … | | | | |

Each row gets its own signed score. A product can be well-supported for one claim
and strongly contradicted for another — that is the most useful thing the app can say.

### Two design decisions that fall out of this

**Outcome comes from the ingredient, not the user.** The system computes the
*canonical outcome set* — every outcome with at least one study for that ingredient —
and shows a row for each. The label claim, when present, only determines which row
is highlighted. The user is never asked "what do you want this for."

**Population variants are all precomputed.** The ECU library is built offline, so
computing four population variants costs four table rows, not four runtime queries.
The delta between them is a product feature:

> "+12 for general adults. +71 if you're deficient."

No competitor can display that, and it costs nothing at runtime.

**Known limitation:** deficiency status is the population axis that flips signs
hardest, and the user genuinely doesn't know theirs. v1 shows both numbers and lets
the user see the fork. This is more honest than a false single answer.

---

## 2. v1 scope

**In:**
- Input is a typed ingredient name. No scanning.
- Simple products, 1–2 active ingredients.
- Coarse vocabularies (see §5).
- EU market.

**Out (deferred to v2+):**
- Scan layer (barcode → OCR → label parse). EU has no unified label database
  equivalent to NIH's DSLD, so this will be vision-OCR when built.
- Company research layer (3rd-party testing, MLM structure, regulatory actions).
- Citation-vs-impact-factor signal (needs age and field normalisation first).
- Author credibility graph.
- Adverse events / interactions layer.
- Product-level roll-up across many ingredients.

---

## 3. Architecture

**Hybrid: deterministic DAG with parallel LLM workers at the per-study node only.**

The governing principle: **an LLM is used only where the input is unstructured prose
and the output is a judgment.** Everything else is code.

| Step | Implementation | Why |
|---|---|---|
| Search, fetch | Code | Deterministic |
| Design classification | PubMed tags first, LLM fallback | Tags are right ~85–90% at zero cost |
| Canonical ID resolution | Code | Has a right answer |
| Deduplication | Code | Has a right answer |
| Per-study extraction | LLM worker | Prose → structured judgment |
| RoB scoring | LLM worker + registry API | Prose → structured judgment |
| All arithmetic | Code | An LLM doing arithmetic injects variance into the one part of the system that has a right answer |

**Why not a fully agentic design:** it is not reproducible. Same input, different
score next Tuesday. You cannot defend a number you cannot regenerate, and a system
making public claims about brands has to be defensible.

### Concurrency

- 6–8 parallel workers, one per study.
- Token bucket rate limiter **per source domain**, exponential backoff.
- The bottleneck is HTTP fetch against rate-limited endpoints, not tokens.
  Amdahl's law applies: fanning out past the rate limit buys 429s, not throughput.
- v1 runs unauthenticated against NCBI (~3 req/s). Switch to the free API key
  (~10 req/s, a 3× multiplier for one env var) once results look promising.

### Worker contract

Each worker is a **pure function**: study → JSON. No tools, no loop, no state.
Structured output via tool schema — never free-text-then-parse. A field that
cannot be extracted returns `null` and is treated as missing. **Never inferred.**
Inference at extraction time is invisible error that propagates into every
downstream number.

Model tiering: cheap model for classification and simple field extraction; strong
model for effect-size extraction, conclusion normalisation, and outcome mapping.
Measure on the calibration set before committing to the cheap tier — a 10%
accuracy loss is not worth the token savings.

---

## 4. Data sources

| Source | Role | Cost |
|---|---|---|
| Europe PMC | Primary: metadata + OA full text | Free |
| PubMed E-utilities | MeSH + publicationType → design classification | Free |
| ClinicalTrials.gov | Registration, prospective-registration check, unpublished flag | Free |
| Epistemonikos | SR → included-primary-study linkage (dedup input) | Free |
| OpenAlex | Fallback reference lists | Free |
| Crossref / Retraction Watch | Retraction check → `w_study = 0` | Free |

### Expected coverage — estimates, must be measured

Two different numbers. Conflating them is how this goes wrong.

| Layer | Europe PMC alone | + full ladder |
|---|---|---|
| Raw OA full text | 50–60% | 70–75% |
| **Methods-level facts** | 50–60% | **80–88%** |

The second row is the one that matters, and it clears the 80% target.

### The reframe: you don't need the paper, you need the methods facts

Those facts live in three places besides the primary full text.

**1. Systematic review full text is worth 10–20× a primary's.** Every decent SR
publishes a *characteristics of included studies* table — dose, form, population,
duration, n, per trial — and usually a *risk-of-bias table* with per-domain
judgments. One OA systematic review yields structured extraction for ~15 trials
you cannot otherwise read.

**This changes retrieval priority: fetch OA syntheses first, then primaries.**
The earlier design treated syntheses as low-value because they don't count as
evidence mass. They are low-value as *evidence* and extremely high-value as *data*.

Inherited RoB carries a 0.85 penalty — someone else's judgment, gated by AMSTAR 2.
No circularity, since syntheses never enter evidence mass.

**2. ClinicalTrials.gov results database** is structured, not prose. Post-FDAAA,
many trials post participant flow (→ attrition, RoB item 5), enrollment, arms, and
outcome measures. RoB items 3, 4, 5 and `n` without touching the paper.

**3. CONSORT-compliant structured abstracts** often state randomization method,
blinding, and n explicitly.

### Full-text ladder (per study, in order)

1. OA full text (Europe PMC OA subset)
2. Green OA via Unpaywall / OpenAlex `best_oa_location` — **+10–15 pp, the single
   biggest addition**. Catches institutional-repository manuscripts Europe PMC misses.
3. CORE.ac.uk (+2–5 pp), Semantic Scholar `openAccessPdf` (+1–3 pp)
4. SR characteristics + RoB tables (inherited, ×0.85)
5. ClinicalTrials.gov results database
6. Structured abstract
7. Abstract only → OA factor 0.55

Preprints (bioRxiv/medRxiv) add 1–2 pp and **must carry an unreviewed penalty**.

### Not viable

- Elsevier / Wiley TDM APIs — require institutional subscriptions
- Automating downloads through a university login — ToS violation, account
  termination, liability
- Sci-Hub — illegal
- Pay-per-view at €35–50/article — arithmetic kills it

**Missing from discovery:** non-English trials, food- and sports-science journals
indexed only in Embase/Scopus, conference abstracts. Embase adds ~6–8%, paid,
not worth it at v1.

**Do not exclude paywalled studies.** Excluding them biases the corpus toward
open-access publishers, which in supplement research means over-weighting a specific
set of venues. Reduced weight, never exclusion.

**Action: measure BOTH rows on 3 ingredients before building anything else.**

**Unknown:** Epistemonikos coverage of *supplement* systematic reviews specifically.
Its `references` field carries a status flag that can be `pending` or `in_process`,
meaning linkage is incomplete for some documents. Plan for partial coverage — §6
handles it.

---

## 5. Vocabularies

Coarse for v1. You can split a band later; you cannot un-merge studies you never
recorded distinctly.

- **Outcome** — fixed vocabulary, 25–30 consumer-facing terms. Extractions
  force-map into it or are **discarded**. Discarding is safer than guessing.
- **Form** — per-ingredient enumerated list, plus a *salt family* grouping that
  drives the 0.50 transfer tier.
- **Population** — 4 coarse axes: age band, sex, deficiency status, pregnancy.
- **Dose band** — derived from data: cluster the doses actually used in trials for
  that ingredient. Different ingredients get different band structures, because
  effective ranges differ by orders of magnitude.

**Complexity flag:** bands shift when new trials arrive, which invalidates cached
ECUs. Requires a `band_version` column and an invalidation path. This is real work,
not a footnote.

**Highest-risk unsolved piece:** outcome mapping. Trials report "PSQI global score",
"sleep onset latency", "wake after sleep onset", "subjective sleep quality VAS".
A label says "supports restful sleep". Collapsing many measured endpoints onto one
consumer-facing outcome is an ontology decision, and getting it wrong is invisible.

### v1 implementation (built 2026-08-06)

`vocab/outcome.json` (30 terms), `vocab/form.json` (magnesium, creatine,
ashwagandha), `vocab/population.json`. All deterministic operations over them
live in `pipeline/vocab.py` — **no model touches this file**. `schemas/ecu.json`
is the row contract.

Three decisions worth recording:

**The model does not do the elemental arithmetic.** S7 reports the compound dose
and the form id; `vocab.elemental_dose_mg()` converts using molar masses recorded
in the vocabulary. This keeps the 5× dose trap in deterministic, auditable code
(invariant 1) instead of in a model's arithmetic.

**Conversion refuses more often than it converts.** A `conversion_safe: false`
form returns `(None, "compound_only")` — no elemental dose. Magnesium citrate,
sulfate and chloride all have common hydrates whose state is routinely unstated,
and the resulting ambiguity exceeds 2×. Refusing costs coverage; guessing
corrupts the axis the product rests on (invariant 5).

**Population match composes by worst axis.** All four axes exact → `exact`; any
axis `different` → `different`; otherwise `adjacent`. `unknown` is a member of
every axis and resolves to `adjacent` — a known unknown, never a free pass.

**Dose bands are deliberately absent.** Bands are supposed to be *derived* from
observed trial doses, and no doses have been extracted yet. Rather than invent
provisional bands, v1 ships `dose_band: null` with `band_version: 0` meaning
"unbanded", and the ECU key uses the literal `unbanded`. `dose_range_mg` is
populated from day one — it is the raw material bands get derived from after the
first extraction pass. This is the one axis of the 5-tuple that is not yet live.

**Open and unassigned:** S3 emits raw `population_text` and `deficiency_status`;
S6 is outcome-only. **Nothing maps raw population text onto the four axes.** The
cheapest fix is to pass `vocab/population.json` into S3's payload and have it
emit the axes directly — it already has the study in context, and it costs no
extra model call. That requires an S3 schema and prompt change, hence a
`PROMPT_VERSION` bump, so it is recorded here rather than done quietly.

---

## 6. Deduplication

**The trap:** 30 meta-analyses often re-analyse the same 9 RCTs. Counting them as
independent evidence breaks the scoring system. Worse, an LLM asked to merge
semantically similar conclusions will *correctly* observe that they agree — and
that agreement will read as 30 independent corroborations.

**The fix is architectural: dedup happens at ingestion, before conclusions exist.**

### Steps

1. Classify each document: synthesis (SR / MA / umbrella) or primary.
2. **Syntheses never enter evidence mass.** A meta-analysis contains zero new
   patients. Its jobs are: discovery, effect-estimate source, and a bounded multiplier.
3. Resolve every primary to a canonical ID: `NCT/ISRCTN` → `DOI` → `PMID` →
   fingerprint `(first author, year, n, country, dose)`. NCT first, because one
   trial often yields four papers (primary outcome, secondary, subgroup, follow-up).
   Same NCT = one unit.
4. Compute over unique primaries only.

### Math

```
P    = unique primary trials for this ECU
I_s  = included-trial set of synthesis s        (I_s ⊆ P)
q_s  = AMSTAR 2 quality of synthesis s          (0..1)

E    = Σ_{p∈P} w_study(p)                       ← unique only
cov  = max_s |I_s ∩ P| / |P|
E'   = E × (1 + 0.3 · cov · q_s)                ← bounded [1.0, 1.3]
```

30 meta-analyses over 9 RCTs → E is built from 9. All syntheses combined add at
most +30%.

### Unresolvable syntheses

This will be a meaningful fraction. Rule: **all unresolved syntheses combined
contribute at most the weight of one median primary study.** Fail toward
under-counting. The alternative — assuming independence — is the exact failure
being avoided.

**AMSTAR 2's role:** it sets `q_s`, scaling the multiplier. It never touches
evidence mass. That is the correct use of the instrument.

---

## 7. Per-study weight

```
w_study = w_d × RoB × size × funding × venue × transfer × OA_factor
```

All factors ≤ 1, multiplicative. Multiplicative is correct — a fatal flaw in any
single factor should kill the study — but it means weights collapse toward zero
fast, and raw evidence mass has no natural scale. Calibration (§10) maps it back.

### Design weight `w_d`

Shape: `w = 0.62^(rank−4)` with three manual cliffs.

| Rank | Type | w_d |
|---|---|---|
| 1–3 | Umbrella / SR+MA / SR | → multiplier path, not mass |
| 4 | RCT | **1.00** |
| 5 | Non-randomized CT | 0.55 ← randomization cliff |
| 6 | Prospective cohort | 0.30 ← interventional cliff |
| 7 | Retrospective cohort | 0.18 |
| 8 | Case-control | 0.12 |
| 9 | Cross-sectional | 0.07 |
| 10 | Case series | 0.03 ← control-group cliff |
| 11 | Case report | 0.015 |
| 12 | Animal | 0.004 ← species cliff |
| 13 | In vitro | 0.0015 |
| 14 | Expert opinion / marketing | **0.00** hard zero |

Cliff rationale:
- **4→5:** losing randomization admits confounding by indication, the largest
  bias source in nutrition research.
- **5→6:** observational designs can't control exposure, so dose and form become
  self-reported. The entire transfer mechanism degrades here.
- **9→10:** no comparator = no counterfactual. Regression to the mean is unbounded.
- **11→12:** rodent bioavailability of mineral salts differs from human by roughly
  2–5× and varies *by form*. Animal evidence is close to worthless for this use case.
- **14 = hard zero, not epsilon.** Marketing claims must be structurally incapable
  of moving the score, or a brand can flood the corpus.

Ranks 12–13 are non-zero (not zero) so they register as *existence* of evidence for
the sufficiency gate, without generating score.

### Risk of bias — 6-item RoB 2 proxy

Full Cochrane RoB 2 is five domains judged via ~22 signalling questions, 30–60 min
per trial by a trained reviewer, requiring the protocol. Not automatable at throughput.

The proxy, each item 0 or 1:

| # | Item | RoB 2 domain |
|---|---|---|
| 1 | Randomization **method** described, not just "randomized" | 1 |
| 2 | Double-blind + placebo-controlled | 2, 4 |
| 3 | Prospectively registered, registration **before** enrollment | 5 |
| 4 | Reported primary outcome **matches** registered primary outcome | 5 |
| 5 | Attrition < 20%, reported per arm with reasons | 3 |
| 6 | Intention-to-treat analysis | 3 |

RoB factor = 1.00 (5–6/6) / 0.60 (3–4/6) / 0.25 (0–2/6).

Items 3 and 4 come primarily from ClinicalTrials.gov — ~2/6 from registry data alone.

### Other factors

- **size** = min(1.0, log10(n)/2)
- **funding** = independent 1.00 / industry_other 0.90 / undisclosed 0.80 / brand_funded 0.60
- **venue** = Q1–Q2 1.00 / Q3–Q4 0.85 / predatory 0 (hard zero)
- **OA_factor** = full text 1.00 / SR table 0.85 / abstract only 0.55
- **transfer** — see §8.

---

## 8. Transfer factor — the moat

```
transfer = form_factor × dose_factor × population_factor
```

| Form | | Dose vs studied effective band | |
|---|---|---|---|
| exact match | 1.00 | inside band | 1.00 |
| same salt family | 0.50 | 50–99% of low end | 0.45 |
| different form | 0.15 | < 50% of band | 0.10 |
| unspecified | 0.30 | > 200% of band | 0.60 |

Population: exact 1.00 / adjacent 0.70 / different 0.35.

A 400 mg magnesium citrate trial applied to a 100 mg magnesium oxide product carries
`0.15 × 0.10 × 1.00 = 0.015` of its original weight. **That number is the product.**

**Why this is defensible against competitors:** the transfer factor is only
expressible because the ECU records form and dose. Competitors keyed on ingredient
discarded that information at ingestion and cannot retrofit it without re-extracting
their entire corpus.

**Where the risk concentrates:** a single ingredient might have 4 forms × 5 dose
bands × 6 outcomes × 3 populations = 360 possible ECUs, of which the literature
populates maybe 15. The other 345 are reached only through transfer — so the
transfer factors do most of the work in the system and are therefore the largest
error source. Calibration effort belongs here, not on the design-weight table.

---

## 9. Scoring

```
d = Σ(w_i · s_i) / Σ(w_i)          direction,     −1 … +1
c = 1 − e^(−E′/k)                  confidence,     0 … 1     (k ≈ 3 RCT-equivalents)
H = weighted variance of s_i       heterogeneity,  0 … 1

SCORE = 100 · d · c · (1 − 0.4H)
```

### Per-study verdict `s_i`, relative to the label claim

| Finding | s |
|---|---|
| Clinically meaningful benefit | +1.0 |
| Statistically significant but trivial magnitude | +0.3 |
| Null / no significant effect | **−0.7** |
| Significant harm | −1.0 |

**The load-bearing decision is that null results are negative.** A product claims
a benefit; a well-run trial finding no effect is *disconfirming evidence for that
claim*, not absence of evidence. Scoring nulls at 0 is what made the earlier
unsigned design collapse — it made "20 RCTs prove this does nothing" indistinguishable
from "nobody has tested this." With nulls negative, **0 means exactly one thing:
inconclusive.** No-data is caught by the sufficiency gate; conflict is caught by H.

### Bands

| Range | Meaning |
|---|---|
| +70 … +100 | strong support |
| +30 … +69 | moderate support |
| +10 … +29 | weak support |
| −9 … +9 | inconclusive |
| −10 … −39 | weak evidence against |
| −40 … −69 | does not work |
| −70 … −100 | strong evidence against / harm |

### Sufficiency gate

If `Σ w_d` over human primaries < 0.5 (about half a single good RCT), show no number
at all — "insufficient human evidence." Otherwise a 3/100 from two rat studies looks
like a graded verdict rather than an absence of data.

### Why `c` multiplies

Without it, two mediocre studies agreeing would produce ±90. The `c` term drags weak
evidence toward 0, and the donut's ring arc shows `c` visually so the user can see
*why* a number is small.

**Trade-off accepted:** a genuinely strong negative from few studies is understated.
That's the conservative direction, which is right for a product making claims about
brands.

### v1 simplification available

The `+0.3` tier requires effect-size extraction with a clinical-relevance threshold
per outcome. To ship faster, collapse to `{+1, −0.7, −1}` and add the trivial-magnitude
tier in v2 — with the known over-crediting bias flagged in the meantime.

---

## 10. Calibration

Every free constant is currently a guess: `k`, the transfer factors, the OA penalty,
the RoB thresholds. A guess never tested is a guess forever.

### Tier 1 — EFSA health claims register

EU-official, published, machine-readable: (ingredient, claimed outcome, verdict).
Hundreds of labelled rows. Also the legal defensibility layer, in the target
jurisdiction.

**Critical caveat: EFSA is extremely strict** and rejected the large majority of
submitted claims — often for reasons of *evidential insufficiency at the time of
submission* rather than demonstrated absence of effect. Treat it as a **one-sided
constraint**:

- EFSA-authorised → the pipeline **must** produce a positive score. A failure here
  is a real failure.
- EFSA-rejected → the pipeline **need not** produce a negative score. Divergence is
  informative, not automatically wrong.

Using rejections as hard negative labels would train the system toward EFSA's
regulatory conservatism rather than toward what the evidence says.

### Tier 2 — 28 face-validity anchors

Full set in `ANCHORS.md` / `anchors.csv`. Composition:

| Purpose | Count |
|---|---|
| Span the 7 score bands | 14 |
| Form-sensitivity pairs (D2 vs D3, MgO vs glycinate, curcumin ± piperine) | 3 |
| Dose-sensitivity pairs (one is a deliberate false-positive check) | 2 |
| Population-flip pairs (deficient vs replete) | 4 |
| Dedup stress (instrumented on existing anchors) | 2 |
| Harm tier (beta-carotene in smokers) | 1 |

Ten anchors would test the score range and none of the mechanisms — which is to say,
none of the things that make this different from a lookup table.

Top-tier evidence only: large RCTs, Cochrane reviews, policy-level consensus.

### Tier 3 — the scientist, ~25 nuanced ECUs

Half a day of expert time. **Required** for `k` and the transfer constants — those
cannot be fit from Tiers 1–2, which validate sign and band only. Buy this.

### Harness rules

- Freeze and version the set. Rerun on every pipeline change.
- **Score by band membership, not numeric distance.** +52 against an expected band
  of +35…+60 is a pass. Wrong sign is a hard failure.
- **Report per-component error.** If MgO and Mg glycinate come out equal, the failure
  is in the form factor, not "the score." Aggregate accuracy hides exactly the
  failures that matter.
- Hard-fail conditions blocking release: any Band 1 or Band 6 anchor on the wrong
  side of zero; harm anchor not flagged; no form differential on anchors 22/23;
  sufficiency gate firing on any Band 1–2 anchor.

## 11. Storage

**Postgres.** The access pattern is exact-key lookup on a 5-tuple — precisely what
a btree index is for.

**Explicitly not a vector database.** People reach for one reflexively on anything
involving papers; here it would mean approximate search on something with an exact
key. pgvector only if outcome mapping needs semantic nearest-neighbour, and then
it's one column, not an architecture.

```
ecu(id, ingredient, form, dose_band, outcome, population,
    score, d, c, H, band_version, computed_at)
ecu_study(ecu_id, study_id, w_study, s_i)
study(id, nct, doi, pmid, design, rob_score, funding, venue, oa, retracted)
synthesis(id, amstar, q_s, included_ids[], resolution_status)
```

Job queue: Postgres-backed (pg-boss or equivalent). One less service. Move to Redis
only when the queue is demonstrably the bottleneck.

---

## 12. Flag bus

Displayed, never scored. Keeping these out of the number preserves neutrality and
reduces legal surface.

- registered trials never published
- positive studies that are brand-funded (% of positive evidence mass)
- predatory venue in the corpus
- underdosed vs studied effective band
- retracted studies excluded

**The underdosing flag is arguably more commercially valuable than the score** —
it's the most common trick in the industry and no consumer can currently detect it.

---

## 13. Open questions and known weaknesses

| Item | Status |
|---|---|
| `k` value | Guess until Tier-3 calibration |
| Transfer factor constants | Guesses; largest error source in the system |
| `band_version` invalidation | Designed; `band_version: 0` = unbanded is now in the ECU schema. Re-derivation path still unwritten |
| Outcome vocabulary mapping | Highest-risk unsolved piece |
| Population adjacency graph | **New.** Which axis values count as adjacent is a guess. `vocab/population.json` |
| Population `pop_match` composition | **New.** "Worst axis wins" is a conservative guess, not a measured rule |
| `conversion_safe` per salt | **New.** Which hydrates are "routinely unstated" is judgment. Wrong in the safe direction (refuses to convert) but costs coverage |
| Who maps raw population text → 4 axes | **New, unassigned.** S3 emits `population_text`; no subagent maps it. See §5 |
| Epistemonikos supplement coverage | Unknown — measure |
| OA full-text rate | **Measured 2026-08-06: 65.5%** on Europe PMC alone (n=741, truncated sample). 70–75% with the full ladder still an estimate |
| Methods-fact coverage | **Measured 2026-08-06: 69.5%** on Europe PMC alone, against a target of ≥80. 80–88% with the full ladder still an estimate |
| SR RoB-table parse reliability | Untested; the 10–20× leverage claim depends on it |
| Blinding integrity | Binary in proxy; over-credits detectable placebos |
| Multi-ingredient roll-up | Deferred; v1 is 1–2 ingredient products only |

---

## 14. Build order

1. **Coverage measurement script** — 3 ingredients. Measure discovery rate, OA
   full-text rate, **and methods-fact rate separately**. Two to three hours.
   Settles the largest unknown.
2. **ClinicalTrials.gov integration** — RoB items 3 and 4, plus the unpublished flag.
3. **Calibration harness** — EFSA scrape + 10 anchors, frozen.
4. **ECU JSON schema + the three vocabularies** — nothing else can be built until
   outcome, form, and population vocabularies are fixed.
5. Retrieval + dedup.
6. Per-study workers.
7. Scoring + storage.

---

## 15. Stack inventory

### Data APIs — all free

| API | Role |
|---|---|
| Europe PMC REST | Search + OA full text as **JATS XML** |
| PubMed E-utilities | MeSH, publicationType → design classification |
| ClinicalTrials.gov v2 | Registry + **results database** (structured participant flow) |
| Epistemonikos | SR → included primary studies |
| OpenAlex | Reference lists + `best_oa_location` |
| Unpaywall | Green OA resolution |
| CORE.ac.uk | Repository aggregator |
| Crossref | Metadata + retraction status |

### Static lists — download once, refresh quarterly

- **Scimago SJR** — journal quartile Q1–Q4. **Free.**
- Predatory journal list — hard filter, not a score input.
- EFSA health claims register — calibration Tier 1.

> **Do not use JCR impact factor.** It's Clarivate, paywalled, expensive, and weakly
> predictive of replication. SJR quartile does the same job for free. The original
> meeting graph specified impact factor; drop it from v1.

### Processing — no AI

- **JATS XML parser** — Europe PMC full text. Prefer XML over PDF wherever available;
  it's structured, section-labelled, and doesn't need OCR.
- **GROBID** — PDF → structured header + reference list. Self-hosted, free. This is
  the right tool for pulling included-study lists out of PDF systematic reviews.
- **PyMuPDF** — raw PDF text fallback.
- **httpx + per-domain token bucket** — rate limiting.

### Infrastructure

- Postgres 16 — ECU store, btree index on the 5-tuple
- pg-boss — job queue, same database, no extra service
- Object store — cached XML/PDF keyed by content hash
- pgvector — **only** if S6 needs semantic nearest-neighbour. Not yet.

### Models

Three tiers by task difficulty, not by habit:

| Tier | Use |
|---|---|
| A — cheap, high volume | Classification, simple field extraction from structured text |
| B — mid | Extraction requiring judgment: RoB, effect size, conclusions |
| C — strong, low volume | Outcome vocabulary mapping, ambiguous design calls, conflict adjudication |

No fine-tuning at v1. Structured outputs plus few-shot examples drawn from the
anchor set.

**Pick the tier boundaries by A/B testing on the 28 anchors, not from a price list.**
A 10% extraction-accuracy loss is not worth the token savings, and you cannot know
which tier is sufficient without measuring.

**Rough cost:** 200–700 model calls per ingredient (50–150 studies × 3–5 calls).
Order €0.50–3.00 per ingredient. Estimate — instrument it in week one.

---

## 16. Subagent roster

Every subagent is a **pure function**: input → JSON → exit. No tools, no loop, no
state, no ability to decide what happens next.

| ID | Name | Tier | In | Out |
|---|---|---|---|---|
| S1 | `design_classifier` | A | title, abstract, MeSH, publicationType | `{design_rank, confidence}` |
| S2 | `synthesis_extractor` | B | SR full text (JATS/PDF) | `{included_studies[], characteristics[], rob_table[]}` |
| S3 | `study_extractor` | B | full text or abstract | `{n, arms, dose, form, duration, population, registration_id}` |
| S4 | `rob_scorer` | B | methods section + ct.gov record | `{item1..item6, evidence_spans[]}` |
| S5 | `conclusion_extractor` | B | results + discussion | `{outcome_raw, direction, effect_size, ci, p}` |
| S6 | `outcome_mapper` | C | `outcome_raw` string | `{outcome_vocab_id \| NULL}` |
| S7 | `form_normalizer` | A/B | intervention description | `{form_vocab_id, salt_family, elemental_dose}` |
| S8 | `funding_classifier` | A | funding + COI statements | `{independent\|undisclosed\|brand_funded, brand}` |

**S1 only fires when the deterministic PubMed tags are ambiguous** — roughly 10–15%
of documents. The rest are free.

**S2 is the highest-value subagent.** One call against an OA systematic review yields
structured data for ~15 primaries. Prioritise it in retrieval order.

**S6 is the highest-risk subagent.** `NULL` means **discard the extraction**, never
guess a mapping. A wrong outcome mapping is invisible error that corrupts every
downstream number for that ECU.

### There is no subagent for

Deduplication, canonical ID resolution, scoring arithmetic, band mapping, cache
lookup, transfer factor application. All deterministic code. These have right
answers, and putting a model on them injects variance into the only parts of the
system that are currently exact.

### Contract rules

- **Every output carries evidence spans** (character offsets into the source). This
  makes every number traceable to a specific sentence in a specific paper — required
  for legal defensibility, and the thing that makes a "2 stars" competitor
  indefensible by comparison.
- **Schema violation** → retry ×2, then `NULL` + flag. Never repair by inference.
- **Cache key** = `hash(content, prompt_version, model)`. A prompt change invalidates
  correctly; re-runs of unchanged work are free. Without `prompt_version` in the key
  you will silently serve stale extractions after every prompt edit.

---

## Changelog

- **2026-08-06 rev 2** — §5 implemented. Three vocabularies + `schemas/ecu.json`
  + `pipeline/vocab.py` (deterministic, no model). Elemental conversion moved out
  of the model and into molar-mass arithmetic; `conversion_safe: false` refuses
  to convert hydrate-ambiguous salts rather than guess. Population match composes
  by worst axis. **Dose bands deliberately deferred** — `band_version: 0` /
  `dose_band: null` until bands can be derived from extracted doses, per founder
  decision. New open items in §13, including the unassigned population-text
  mapping. No scoring constants changed.

- **2026-08-06** — Claude review of the 2026-08-05 audit (`REVIEW.md`). Band
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
