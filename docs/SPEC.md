# Supplement Evidence Pipeline — v1 Technical Spec

**Status:** design, pre-build
**Last updated:** 2026-08-05 (rev 3)
**Companion artifacts:** `pipeline_v2_demo.excalidraw` (current, generated from
the code), `pipeline_v1.excalidraw` (original sketch), `ANCHORS.md`, `anchors.csv`

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

**Hydrate ambiguity is bounded, not unknown.** Magnesium citrate, sulfate and
chloride all have common hydrates whose state is routinely unstated. There is no
single defensible elemental number, so `elemental_dose_mg()` returns `None`.
But the true dose is bracketed by the hydrate and anhydrous conversions, and
`elemental_dose_range_mg()` returns that interval:

| Form | 400 mg compound → elemental | Spread |
|---|---|---|
| orotate | 26.2 – 29.1 mg | 1.11× |
| lactate | 40.8 – 48.0 mg | 1.18× |
| malate | 50.5 – 62.2 mg | 1.23× |
| citrate | 47.6 – 64.7 mg | 1.36× |
| sulfate | 39.4 – 80.8 mg | 2.05× |
| chloride | 47.8 – 102.1 mg | 2.14× |

Most intervals are narrower than a dose band, so the band assignment is
unaffected and the study is usable. Discarding a study we can bracket is
over-caution, and over-caution costs coverage this project cannot spare.
When an interval genuinely straddles two bands, that resolves to
`dose_match: "unspecified"` downstream — it is never resolved by picking the
likelier band. Where no fixed formula exists at all (basic magnesium carbonate,
proprietary buffered creatine) the answer stays `compound_only`: unknown, not
bounded (invariant 5).

**Population match composes by worst axis.** All four axes exact → `exact`; any
axis `different` → `different`; otherwise `adjacent`. `unknown` is a member of
every axis and resolves to `adjacent` — a known unknown, never a free pass.

**Dose bands are deliberately absent.** Bands are supposed to be *derived* from
observed trial doses, and no doses have been extracted yet. Rather than invent
provisional bands, v1 ships `dose_band: null` with `band_version: 0` meaning
"unbanded", and the ECU key uses the literal `unbanded`. `dose_range_mg` is
populated from day one — it is the raw material bands get derived from after the
first extraction pass. This is the one axis of the 5-tuple that is not yet live.

**RESOLVED 2026-08-06 (`PROMPT_VERSION` v1.1 → v1.2).** S3 now places the
population on the four axes itself. `vocab/population.json` is passed in its
payload, `population_axes` is a required field of `schemas/s3_study.json`, and
every axis carries an `unknown` member the prompt requires rather than an
inference — "recruiting without measuring is unknown, NOT replete". No ninth
subagent and no extra model call, because S3 already has the study in context.
Raw `population_text` is still emitted alongside as the audit trail.

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
w_study = w_d × RoB × size × funding × venue × OA_factor
```

All factors ≤ 1, multiplicative. Multiplicative is correct — a fatal flaw in any
single factor should kill the study — but it means weights collapse toward zero
fast, and raw evidence mass has no natural scale. Calibration (§10) maps it back.

**Changed 2026-08-07 (founder decision).** The transfer factors — form, dose and
population — are **no longer multiplied into `w_study`**. They are applicability,
not study quality, and they now live on the arcs (§9). The weight answers one
question only: *how much should this study count as evidence at all?*

Switchable in one line each: `APPLY_FORM_IN_WEIGHT`, `APPLY_DOSE_IN_WEIGHT`,
`APPLY_POP_IN_WEIGHT` in `pipeline/scoring.py`, all currently `False`. The
selftest asserts **both** settings of each, so flipping one can never silently
leave the suite meaningless.

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

**No longer applied to `w_study`** — see §7. The tiers below are unchanged and
are now used two ways: to judge each arc (§9), and to price a *missing* subset in
the composite (no in-form trial at all is charged the `different` tier).

```
transfer = form_factor × dose_factor × population_factor     (definition retained)
```

| Form | | Dose — two separate comparisons since v9: per-STUDY (study dose vs product dose, feeds the dose arc) and product-vs-derived-band (reported as `dose.product_match`, the "dosed where trials found nothing" warning). The tiers below serve both | |
|---|---|---|---|
| exact match | 1.00 | inside band | 1.00 |
| same salt family | 0.50 | 50–99% of low end | 0.45 |
| different form | 0.15 | < 50% of band | 0.10 |
| unspecified | 0.30 | > 200% of band | 0.60 |

Population: exact 1.00 / adjacent 0.70 / different 0.35.

A 400 mg magnesium citrate trial applied to a 100 mg magnesium oxide product is
still a **full-weight** study for the centre number — that number is study
quality, and the trial's quality did not change. What changes is the ARCS: it
contributes nothing to the form arc's coverage, nothing to the dose arc's, and
if NO in-form trial exists the composite is charged the `different` tier (0.15)
rather than quietly averaging over the arcs that do exist.

**That distinction is the product.** Competitors keyed on ingredient cannot say
"the evidence is good and none of it used your form" — they have one number and
no way to separate the two claims.

**Why this is defensible against competitors:** the arcs are only expressible
because the ECU records form and dose. Competitors keyed on ingredient discarded
that information at ingestion and cannot retrofit it without re-extracting their
entire corpus.

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

### The four arcs and the 0–100 display (2026-08-07)

Founder decision. The signed −100…+100 score is **retained** — bands, the anchor
set and every stored row depend on it — and the *display* becomes four arcs plus
a 0–100 composite.

Each arc carries **two** facts, and separating them is the point:

| arc | verdict | coverage |
|---|---|---|
| effect | d over all evidence | 1.0 |
| form | d over YOUR-FORM trials | share of evidence weight in that subset |
| dose | d over trials dosed AT THE PRODUCT'S dose (per study, `dose_match_for(study, product)` = in_band; SCORING_MODEL v9 2026-08-12 — it was product-vs-derived-band before, which made the arc a clone of the effect arc or empty) | share of evidence weight in that subset |
| evidence | — (pure quantity) | c |

A form arc showing only coverage cannot tell a well-tested form from a
well-tested-and-useless one. A form arc showing only a verdict hides that the
answer rests on two studies. Both are needed, so each renders as filled
(verdict), solid (assessable) and hatched (never reported).

```
composite = 100 × c × mean(effect, form, dose)      each mapped −1…+1 → 0…1
```

Two things were measured and rejected on the way:

**Confidence cannot be a fourth term in a mean.** As a peer it let a single tiny
abstract-only trial score **76/100**, because three direction terms outvoted it.
It multiplies instead — if we barely know anything, nothing else matters.

**A missing subset cannot be dropped from the mean.** Averaging over "available"
arcs gave **99/100** to a product no trial had ever used that form for, identical
to one whose form was tested and worked. Silence is not a pass, so a missing
subset is penalised at the transfer tier that situation already implies.

The 0–100 scale does not reintroduce §9's collapse, because the evidence arc
carries what the number cannot: *"barely studied"* scores 3 with an empty
evidence arc, *"20 solid trials, all null"* scores 15 with a full one.

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
| `k` value | **1.5 since 2026-08-11** (founder). Was 3.0. Measured basis: ECU granularity fragments a 143-study corpus into cells of 4–17, while c=0.8 at K=3.0 needed ~51 studies per cell — confidence, not evidence, capped every score. Every run now prints a K A/B (stored vs 3.0). Still a guess until Tier-3 |
| `FORM_LADDER` (13 values) | **New 2026-08-11**, founder design. The form arc's composite term is the mean of the top-3 ladder scores among NON-NEGATIVE evidence in the product's own form: umbrella 1.00, SR+MA 0.95, SR 0.90, RCT 0.80, observational 0.55→0.15, animal 0.10, cell 0.05. Replaces `effect × 0.15` when no exact-form trial existed, which punished a literature for omitting the form: 54% of 149 creatine studies said only "creatine". Ranks are `pipeline.classify` design_rank, so no new taxonomy. All 13 values are founder-initialised guesses |
| `FORM_LADDER_TOP` = 3 | **New 2026-08-11.** Aggregation width, chosen by measurement (`scripts/form_experiment.py`), not preference. top-1 scored "1 RCT + 9 animal studies" at 0.800 — identical to ten RCTs, so one paper bought a replicated literature's credit. top-10 dragged that same real RCT to 0.170, animal tier. top-3 (0.333) is the only width separating all five fixtures monotonically. Pinned by selftest so it cannot move silently |
| Form-ladder synthesis tier | **Known cap.** Ranks 1–3 (umbrella/MA/SR *conducted in your form*) are implemented and selftested, but `form_syntheses` is empty until the SR path runs: a review counts as form evidence only once its own direction is extracted, and an unread review must never be credited as non-negative. So on a primaries-only corpus the ladder caps at 0.80. The 13 form-specific creatine syntheses already in the store are the first thing `--with-sr` would unlock |
| `S_VALUE["null_effect"]` | **−0.35 since 2026-08-11** (founder), was −0.7. Swept in `scripts/penalty_experiment.py`. −0.7 priced a well-run null at 70% of documented *harm*; "we looked and found nothing" is weaker evidence against a product than "we found damage". Decided on the fixture that a 20-trial unanimous-null product must still land clearly negative: −35 ("weak evidence against") at −0.35, versus exactly 0 ("inconclusive") at 0.0 — indistinguishable from never studied. `harm` stays −1.0 because it is a safety signal. Still a guess |
| Anchor bands vs the null penalty | **ANSWERED 2026-08-11, and it closes open item 3.** Anchor #1's +80 floor tolerates 8.6% nulls at −0.7, 11.7% at −0.35, and only **20.0% with every negative penalty removed**. No value of `S_VALUE["null_effect"]` makes those bands reachable, so the BANDS are wrong, not the constant. **CORRECTION to the first version of this row:** it said the bands should be re-derived "against what the formula can actually produce". That is circular — fitting the harness's targets to the pipeline's own output makes it unfalsifiable, which `pipeline/calibration.py:9-11` explicitly forbids. Bands must come from OUTSIDE: take the trial mixture a published synthesis reports (k trials, n positive, n null, effect sizes) and run *that* through our arithmetic. The anchor then tests whether our extraction reproduces the literature's real composition — the exact failure class the 2026-08-11 audit found |
| Anchor magnitude cap | **MEASURED 2026-08-11, `scripts/magnitude_investigation.py`.** `s_value()` maps `trivial`/`unstated`/`None` all to +0.3, so an unsized corpus is hard-capped at 30. At v1.14, 128 of 245 benefit claims are unsized and **23 of those (18%) carry a number that could actually size them** (`effect_size` or a CI). A first pass said 46% by counting `p_value` as sizeable — corrected, because a p-value says an effect was unlikely by chance, not how big it was; 36 claims carry only a p-value and are correctly left `unstated`. The larger gap is the **69 with no number at all, 25 of them full-text**, where S5 failed to EXTRACT a number the paper almost certainly reported. But it is **NOT what makes the anchors unreachable**: sizing every recoverable claim leaves muscle_strength at −12, and sizing *everything* (an impossible upper bound) reaches only −8. The binding constraint is the **null share** — 60–83% of mapped claims per outcome are negative, and a +80 score needs `d ≈ 0.80`. Of the 69 genuinely unsizeable benefits, 44 are abstract-only (honest) and **25 are full-text** (a smaller, separate S5 gap) |
| **The aggregation rule — VOTE COUNTING, now RESOLVED** | **FOUNDER DECISION 2026-08-11 ("do i"): candidate (i) shipped, `SCORING_MODEL` v7 → v8-effect-size.** The defect: `assemble` reduced each trial to a direction LABEL, `s_value` mapped the label to a number, and `score_ecu` averaged those — so the effect SIZE we extract was discarded before reaching the score. Counting how many trials individually cleared p<0.05 is vote counting, whose power falls toward **zero** as trials shrink, and supplement literature is exactly that small-trial regime. Measured: **24 of 27** sized nulls on the four showcase outcomes had a point estimate FAVOURING creatine while each scored −0.35, against **7 published pooled estimates** favouring it with CIs excluding zero, while the pipeline returned **−15** (`scripts/vote_counting_investigation.py`). The fix: `s = clamp((effect − MID)/(FULL − MID), −1, +1)`, **recentred on the MEANINGFUL threshold rather than on zero** — which is the whole design, because it is what preserves invariant 7 instead of destroying it. A measured-zero effect gives **−0.333**, within rounding of the −0.35 the founder chose for a well-run null, and a harm-sized −0.5 SMD clamps to **−1.0**, exactly the harm value: both constants are now DERIVED rather than asserted. The control arm proves it matters — 20 measured-zero trials score **−33 "weak evidence against"** recentred versus **+0 "inconclusive"** centred on zero, and the latter is the obvious implementation. Coverage is the limit, not the scale: only **40 of 227 (18%)** mapped claims on the v1.14 corpus carry a standardisable number, so the label path is still the majority path and `muscle_strength` moved only −15 → −12. v1.15/v1.16 raise that; the corpus must be re-extracted before the shipped effect is known. Sign is **stated** by S5 (`effect_favours`, v1.16), never inferred — a design analysis found this literature uses BOTH sign conventions, and a wrong magnitude weakens a score while a wrong SIGN inverts it undetectably. `scripts/effect_size_experiment.py` sweeps the scale (arms A–E) |
| **External band derivation is BLOCKED, not unfinished** | **MEASURED 2026-08-11.** The row above prescribed deriving bands from "the trial mixture a published synthesis reports". Measured on 14 stored creatine syntheses: **0 of 14 publish per-trial dichotomous results in usable form.** Three appear to and do not — the one checked in detail (`10.3390/nu13061912`) carries a narrative arrow column that mixes endpoints in free text, cannot be attributed to its own pooled analyses, and disagrees with the study counts the review states for them; an adversarial re-read **REFUTED 2 of 3** per-trial counts a first pass had extracted from it. That is not a gap in our reading, it is the vote-counting finding restated: syntheses publish pooled effect sizes because that is what synthesis IS. **Our scoring model consumes a quantity the literature does not produce.** `calibration.mixture_score` / `derived_band` / `provenance` are built and selftested and will derive a band the moment a mixture exists; `anchors.csv` gained `source_doi`, `source_kind`, `n_trials`, `n_positive`, `n_null`, `pooled_effect`, `certainty`, and **1 of 21** range anchors now cites a source. Recording `n_trials` + a pooled effect WITHOUT a per-trial split is explicitly legal and selftested, because that is the normal honest state of a cited row and forbidding it would invite fabricating the split |
| `EFFECT_MID_SMD` 0.20, `EFFECT_FULL_SMD` 0.80, `EFFECT_MID_PCT` 2.0, `EFFECT_FULL_PCT` 8.0 | **New 2026-08-11, founder-owned (invariant 4).** The scale for effect-size `s_value`. NOT free parameters: `MID` values are read straight off the thresholds already in `prompts/s5_conclusion.md` ("< 0.2 trivial", "< 2% trivial"), so the continuous scale agrees with the discrete labels the same prompt emits. `FULL_SMD` 0.80 is Cohen's "large" — chosen over 0.5 so the prompt's own "meaningful" floor lands mid-scale at +0.50 instead of saturating the moment it qualifies; Cohen himself disclaimed these bands. `FULL_PCT` 8.0 is set so 5% ("meaningful" in the same prompt) maps to +0.50, identical to where 0.5 SMD lands, so the two unit families agree at their shared anchor and one paper does not score differently for having reported percent instead of d. Swept in `scripts/effect_size_experiment.py`: on the v1.14 corpus arms 0.2/0.8, 0.2/0.5 and 0.1/0.8 differ by ≤2 points, so the corpus cannot currently discriminate them — the values rest on the prompt's thresholds, not on a fit |
| Dose-arc membership window | **New with v9 (2026-08-12), and an implicit decision that needs a FOUNDER call.** A study is "at the product's dose" when its dose falls in [product_low, 2×product_high], by argument-swapped reuse of `dose_match_for`. An adversarial verification pass confirmed the arithmetic (119 claims re-tiered by hand, 0 mismatches) but flagged the window's DIRECTION: SPEC §8's tiers encode that benefit transfers UP-dose (product above tested dose, 0.60) not DOWN-dose (0.45/0.10), and the swap mirrors that — a trial at 99% of the product dose is OUT while one at 200% is IN. On the v1.18 corpus, 10 of 29 dosed claims (34%) change arc membership between [P, 2P] and the mirrored [P/2, P]. Also flagged: any direction-blind window is wrong for half the evidence (a NULL at 2× your dose argues against your dose; a BENEFIT at 2× does not establish it), and fixing that needs a direction-aware rule, i.e. a new constant. Both are founder calls; the shipped window stands until made |
| Transfer factor constants | Guesses; largest error source in the system |
| `band_version` invalidation | Designed; `band_version: 0` = unbanded is now in the ECU schema. Re-derivation path still unwritten |
| Outcome vocabulary mapping | Highest-risk unsolved piece |
| Population adjacency graph | **New.** Which axis values count as adjacent is a guess. `vocab/population.json` |
| Population `pop_match` composition | **New.** "Worst axis wins" is a conservative guess, not a measured rule |
| `conversion_safe` per salt | **New.** Which hydrates are "routinely unstated" is judgment. Wrong in the safe direction (refuses to convert) but costs coverage |
| Who maps raw population text → 4 axes | **RESOLVED 2026-08-06** — S3 emits the axes directly, PROMPT_VERSION v1.2. See §5 |
| Epistemonikos supplement coverage | Unknown — measure |
| OA full-text rate | **MEASURED on the FULL corpus (20 155 records, 100%): 68.7%** Europe PMC alone, **76.2%** with green OA. Estimate was 70–75% |
| Methods-fact coverage | **MEASURED: 77.5% — BELOW the ≥80% target.** Estimate was 80–88%. Two named, unbuilt paths remain: Unpaywall and SR-table inheritance |
| **Retrieval specificity — gates everything downstream** | **New, 2026-08-06.** `("magnesium") AND RCT` returns 6736 records, ~25% IV/procedural magnesium (eclampsia, cardiac surgery, nerve blocks) that can never map to a consumer outcome. First real pilot: **1 scorable ECU row from 8 studies.** `scope='supplement'` cuts clinical-context titles to 1% — but **measured yield did NOT improve: still 1 row from 8.** It trades clinical noise for WRONG-INGREDIENT noise: Europe PMC matches "magnesium" anywhere in the record, so an Astragalus, whey-protein or Griffonia trial that merely mentions magnesium is retrieved. Neither scope is right yet |
| Outcome-vocabulary sufficiency | **Not the bottleneck — verified 2026-08-06.** S6's null-rationales show it correctly refusing POAF, opioid consumption, vasopressor use and QoR-15, and correctly mapping muscle_strength / inflammation_crp / adverse_events_any. Growing the vocabulary to cover those would file drug trials under supplement claims |
| **Confidence ceiling on an abstract-only corpus** | **New, 2026-08-07, and it caps every demo.** For a typical retrieved study (RCT, abstract-only, form unspecified, population unknown, RoB high) `w_study ≈ 0.022`. Since `c = 1 − e^(−E′/k)`, **even 22 unanimous studies cap at \|score\| ≈ 15** — below "moderate" and often below "weak". Grok's magnesium run shows exactly this: 22 outcomes, every one `inconclusive`, range −10..+3. That is the scoring rules working as specified, not a bug. What lifts it is not more studies but better-matched ones: exact form → cap 42, + full text → 62, + exact population → 75, + low RoB → 100 (at n=22). **The gate to a demonstrable score is form matching and full text, not corpus size** |
| **Small-run previews — do NOT rescale `k`** | **New, 2026-08-07.** The score decomposes into terms with different sampling behaviour: `d` and `H` are weighted mean/variance and are **sample-size independent** (unbiased at n=5); `c` is a function of Σw and grows with n by construction. So a small run's `d` estimates the full corpus's `d`, but its `score` does not estimate the full `score`. Measured by resampling a 240-study corpus: mean `d` was 0.29/0.26/0.21 at n=5/40/240 while mean score was 3.8/16.3/17.0. Shrinking `k` for test runs would make two runs of the same product incomparable and inflate every test number — `pipeline/preview.py` projects instead, and refuses below n=20 where the error spans four bands |
| **Token budget is set by evidence QUALITY, not corpus size** | **New, 2026-08-07.** Studies needed to reach `c = 0.9`: **300** at mean `w` = 0.023 (abstract-only, form unspecified), **90** with exact form, **50** with full text, **13** at full text + low RoB. Improving extraction is 10–30× cheaper than extracting more of the same corpus |
| Unpaywall uplift | **FALSIFIED 2026-08-06.** SPEC called it "the largest single uplift". Measured head-to-head on 47 closed records: 20 found by both OpenAlex and Unpaywall, **0 by either alone**. They are not independent — OpenAlex ingests Unpaywall. Marginal gain: **0.0pp**. SR-table inheritance is the only remaining rung |
| Relevance-order bias | **RESOLVED 2026-08-06** by re-measuring uncapped. The bias was real and large: the 16% slice read 88.9%, the full corpus reads 77.5%. Any future coverage claim must state the fraction of corpus measured |
| **`q_s` measured our retrieval, not the review** | **RESOLVED 2026-08-07 (founder).** `q_s` was gated on `resolved_fraction ≥ 0.5` — the share of a review's included studies already in OUR store. That is circular, and it inverted on the cases that matter: a Cochrane review of 30 trials where we held 6 scored **q_s = 0 and was discarded**, while a thin review of 4 where we held 3 scored **1.00**. The better review was punished for covering more than our retrieval reached. Overlap was never missing from the maths — `score_ecu` already multiplies by `cov = |included ∩ P| / |P|`, smoothly; the gate re-punished the same quantity as a cliff. Now: overlap → `cov`; quality → the checklist below. `resolved` means only "S2 found an included-studies list" |
| **Review-quality checklist (`REVIEW_ITEMS`)** | **New constant set, 2026-08-07, UNCALIBRATED.** AMSTAR-2-shaped, 7 items S2 reads off the review itself: protocol registered, ≥2 databases, duplicate selection, RoB assessed, heterogeneity assessed, publication bias assessed, funding independent. Banded on HITS (≥5 high, ≥3 moderate, else low) → `Q_REVIEW = {1.00, 0.70, 0.40}`, capped at 0.40 when `extraction_complete` is false, and 0.40 when no item was answered. Banding on hits rather than hits/answered is deliberate: a review that answered one item and passed it is not high quality, it is a review that told us almost nothing. **Every number here is a guess awaiting Tier-3.** `MIN_DATABASES = 2` is likewise a guess |
| **SR-table trials enter `E`** | **Founder decision 2026-08-08 — invariant 6 AMENDED.** Old: "syntheses add no evidence mass." New: "a synthesis *document* adds no evidence mass; the primary trials it describes do, once each, at the `sr_table` tier." The document-level protections are unchanged — dedup by canonical id, and `score_ecu` taking the max `cov` rather than a sum, so 30 reviews of the same 9 RCTs still give one lift ≤1.30. `OA_FACTOR["sr_table"] = 0.85` and `Study.rob_inherited` ×0.85 were already in `scoring.py` and had never been set by anything; stacked they price a table-derived trial at **0.72** of one read directly. Rationale: the corpus is abstract-starved (77.5% coverage, `w ≈ 0.023` for an abstract-only study) and these are the only trials we can reach at all. Revisit if paid full-text access lands |
| **`rob_band_direct` on `Study`** | **New, 2026-08-08.** A review reports an overall RoB judgement, not which six items it rested on. Synthesising six items to hit the right hit-count would be inventing data (invariant 5), so `weight()` accepts a band directly. `rob_inherited` must be True alongside it |
| **`design_rank_from_text` patterns** | **New, 2026-08-08, deterministic but a judgement.** Verbatim design text → rank. Order is load-bearing: "randomis" is a substring of "non-randomis", and the first implementation tested the positive case first, promoting every non-randomised trial from rank 5 to 4 (w_d 0.55 → 1.00). Caught by selftest, not by review. Any text that does not clearly state a design returns None and the trial is discarded |
| **Outcome polarity is not recorded — and it costs evidence** | **New, 2026-08-08.** `vocab/outcome.json` has `kind`, `includes`, `excludes`, `search_terms` — no field saying which DIRECTION is good. Lower `sleep_onset` is better; lower `muscle_strength` is worse. Consequence: when a review reports "MD −1.40 (95% CI −2.20 to −0.60)" we can tell the interval excludes the null but **not whether that is benefit or harm**, so the trial is discarded. `direction_from_effect_text` recovers the polarity-free half (a CI spanning the null → `null_effect`, a real finding at s = −0.7). Adding a `polarity` field would open the other half — the largest cheap win left in SR inheritance, and deterministic, no model call |
| **Forest plots are images, not tables** | **Measured 2026-08-08.** Per-trial effect estimates live in `<fig>`/`<graphic>`, while `fulltext.extract_tables` reads `<table-wrap>`. In PMC13246183 the three figures are captioned "Summary of the **pooled** relative risk…" — pooled, not per-trial. A Cochrane review (PMC12604082) deposited **1 table and 0 figures** to PMC; its characteristics and forest data live in RevMan. So "the review lists the trial but never states in text what it found" is the NORMAL case, not an edge case |
| **Predatory venue: publisher list vs journal title** | **MEASURED 2026-08-08.** The list is ~1160 PUBLISHERS; Europe PMC gives a JOURNAL title. Substring matching one inside the other flagged **274 of 2076 studies (13.2%)** — *American Journal of Obstetrics and Gynecology* on the entry `'american journal'`, *Acta oto-laryngologica* on `'lar'` (3 chars), 69 journals on `'e journal'`. Word-bounding at ≥12 chars still gave 47 (2.3%) and still hit the *American Journal of…* family. Matching is now **exact title / exact ISSN only**, plus containment on a `publisher` field. Under-flagging is the correct direction: flagging a real journal is a defamation-shaped error that would appear in a report beside its real name, and `ZERO_WEIGHT = True` would later delete its evidence. **CLOSED 2026-08-09:** `sources/crossref.py` resolves a publisher per DOI, `pipeline/retrieve.py` stores it, and every run now reports `publishers_resolved` beside the flag count — `0 flagged @ 0 resolved` renders as NOT CHECKED, not clean. `MIN_PUBLISHER_CHARS = 6` is calibrated, not round: exactly 4 of 1162 entries normalise shorter (`ICGST`, `IJRCM`, `LAR`, `OPAST`) and `LAR` caused the *Acta oto-laryngologica* hit; a floor of 9 would drop 29 real publishers. **Residual limit is name drift, measured live:** doi `10.4172/2157-7633.1000345` returns publisher *OMICS Publishing Group* while the list carries *OMICS International* — same operation, renamed, missed. Not fixable by token matching: `omics` is inside *Econ**omics*** and *Infon**omics***, both present in the list, so that would flag every publisher named "…Economics". Pinned by selftest. |
| **A silently-empty vocabulary is worse than a missing one** | **2026-08-08.** The predatory list shipped as gzip+base64 chunks that expanded on import; every commit of those chunks was truncated (4400 → 1988 → 0 → 40 bytes, each described as "the full list"), gzip refused them, the expander caught its own exception, and every run printed `list entries loaded: 0` beside `flagged: 0` — indistinguishable from a clean corpus. `pipeline.predatory` now reports **LIST BROKEN** below `MIN_PLAUSIBLE_ENTRIES` (200). Any future embedded data should carry the same floor. |
| SR RoB-table parse reliability | Untested; the 10–20× leverage claim depends on it. **Now load-bearing on the score**, not just on confidence |
| **The scored pipeline never sent S2 a table** | **RESOLVED 2026-08-07.** Two payload builders existed: `run_sr_inheritance.s2_payload` sent structured tables, `synthesis_bridge` sent flattened methods+results prose from `best_text`. Only the script was built for the job, and only the bridge ran inside a scored run — so S2 was asked to read a characteristics table it had never been shown. Creatine 2026-08-07: **12/12 S2 "ok", 0 resolved.** One builder now, in `pipeline.synthesis.s2_payload` |
| **`looks_like_included_studies` matched nothing** | **RESOLVED 2026-08-07.** Measured on three real OA reviews: **0 of 14 tables passed.** The caption test wanted the literal `"included stud"` and missed "included systematic reviews"; the header test wanted 3 of 8 signals in row 0 and scored "Treatment option │ Reviews (n) │ Patient (n) │ Author, year" at 2, because the list said "participants" and the table said "Patient". Now 13/14 on the same tables, scanning the first two rows (headers are often split). Over-matching is cheap — it is a filter with a fallback, and S2 decides |
| Semantic Scholar / CORE as OA resolvers | **MEASURED 2026-08-07, both rejected.** 40 closed records with a DOI and no PMC id: OpenAlex found 19 (48%), Semantic Scholar 17 (42%) — a strict subset, **0 new (+0.0pp)**. CORE keyless answered only 20/40 (67 × HTTP 429), found 1, **0 new**. Same result as Unpaywall: these aggregate the same repository network and are not independent draws. CORE's `fullText` field needs a key ("Not available for public API users") and is the only one that might differ; unmeasurable until someone registers |
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
