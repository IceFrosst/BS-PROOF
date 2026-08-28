# Open questions between agents

**What this file is for:** one agent proposes a change that touches an invariant
or a constant, and the owning agent confirms or pushes back *before* it becomes
production behaviour. See the file-ownership table in `CLAUDE.md`.

**What it is NOT:** a changelog. Resolved items move to `docs/SPEC.md` §13 (if
they settle a constant or a rule) or to `docs/history/` (if they were an audit).
Delete them from here — a resolved item left sitting in a "pending" file is how
a fixed problem gets re-fixed by the next agent.

Last swept: **2026-08-08**.

---

## OPEN

### 0. `SCORING_MODEL` v13 → v14-form-transfer-ladder — DONE ON FOUNDER INSTRUCTION, needs confirmation

**Founder instruction 2026-08-28, verbatim: "make the algorithm less strict but at
the same it should be absolutely true."** Implemented; flagged here because it
changes the meaning of a published number and reverses a previously pinned
decision. **No constant value changed** — `FORM_FACTOR`, `k`, `S_VALUE`,
`H_PENALTY`, `H_NORM`, `DOSE_FACTOR` are all untouched.

**What changed.** The composite's form term read `form_match == "exact"` studies
only. Everything else contributed **0.0** — so `unspecified` (the paper never
said which form), `different` (a form we know is not yours) and *no evidence at
all* were priced identically, collapsing three tiers `FORM_FACTOR` already prices
apart (exact 1.00 / salt_family 0.50 / unspecified 0.30 / different 0.15). A
non-exact study now enters the ladder at
`FORM_LADDER[design_rank] × FORM_FACTOR[form_match]`, and the term is the best of
the exact and transfer ladders.

**The measurement that motivated it** — omega-3 run `20260828_083440`,
`inflammation_crp`: six `unspecified` RCTs, every one non-negative and four at
`s = +1.00`, earned zero form credit, while the single exact-form trial at
**s = −0.02** (arithmetically indistinguishable from zero) set
`all_negative_in_form` and drove the term to 0.0. One marginal trial erased six
positive ones. Composite 17 → 23 on that row.

**Why this is truth-improving and not merely looser** — it is the founder's own
v5 correction applied one tier out: *"a negative pooled verdict is a WARNING, not
a reason to discard the positive evidence that exists."*

**What was deliberately NOT relaxed:**

- `different` still earns nothing. A form we know is not yours answers a
  different question — the same reason `product-score` refuses a form the run
  never scored. `FORM_TRANSFER_TIERS` omits it and a selftest pins that.
- **"Silence is not a pass" is preserved.** Six unspecified RCTs score 0.24
  against 0.80 for six confirmed exact-form ones — a 70% discount. The failure
  that rule was adopted for was 99/100 on an untested product; 0.24 is not that.
- **Invariant 8 is intact.** Arc `verdict`, `coverage` and `n_in_form` stay
  exact-form only, so "nobody tested your form" (`None @ 0%`) still cannot render
  as "your form was tested and failed". Pinned.
- **The signed score does not move at all** — form is out of `w_study`
  (`APPLY_FORM_IN_WEIGHT = False`). Only the composite changes.
- The **dose**-silence penalty (`MISSING_DOSE_PENALTY = 0.10`) was left alone. It
  is an explicit founder decision recorded in CLAUDE.md ("the score deliberately
  does NOT distinguish 'dosed where trials failed' from 'dosed where nobody
  looked'"). Relaxing it to neutral would read 27 instead of 17 on the row above,
  and 33 combined with this change. **Founder's call, not taken.**

**Pinned test changed:** `selftest.py` "an unreported form earns no form credit"
→ "earns DISCOUNTED transfer credit, not zero", with the reasoning recorded
inline. Six new checks added around it (tier ordering, `different` exclusion,
the marginal-exact regression, exact-still-wins, back-compatibility).

**Confirm or revert.** Revert is one commit; the composite is recomputable from
cache with `scripts/rescore_run.py`, no model calls.

### 1. Predatory list flags nothing, and that is now deliberate

**Fixed 2026-08-08, but read the second half.**

The list is real again — 1162 publishers, fetched by
`scripts/refresh_predatory_list.py` and committed. The old gzip+base64 chunks
were truncated in every commit they ever appeared in (4400 → 1988 → 0 → 40
bytes, each described as "the full list"), so the list had never once loaded.

The bigger defect was hiding behind that. With the list present, the substring
matcher flagged **274 of 2076 studies (13.2%)** including *American Journal of
Obstetrics and Gynecology* and *Acta oto-laryngologica* — on entries like
`'lar'` and `'e journal'`. Matching is now exact-only on journal titles.

**Open question for the founder:** matching a PUBLISHER list against a JOURNAL
title reaches almost nothing, so the current honest answer is 0 flagged. To make
this useful we need a publisher field on each record. Crossref returns one per
DOI. Worth a resolver call, or worth dropping the feature?

### 2. Venue factor has nowhere to go

`Study.venue_ok` is a boolean. SJR quartiles cannot be used until a real venue
factor exists, and that is a new constant — `docs/SPEC.md` §13 first.

### 3. The anchor bands and the null penalty contradict each other — FOUNDER CALL

**Raised 2026-08-10. This is the blocking question for anchor eval, and it is not
a bug report — three things could be wrong and only the founder may pick.**

Commit `333c0db` recorded "Anchor #1 fails: creatine scores −6 where the set
expects +80..+95" and treated it as a probable sign error. It is not. Run
`python3 -m pipeline.calibration` and read the new feasibility table:

| anchor | floor | max null-effect share that still reaches it |
|---|---:|---:|
| #2 folic acid / NTD | +85 | **6.4%** |
| #3 vitamin D / 25OHD | +85 | **6.4%** |
| #4 iron / haemoglobin | +85 | **6.4%** |
| #1 creatine / strength | +80 | **8.6%** |
| #5 caffeine / endurance | +75 | **11.1%** |

Those are ceilings at *perfect* confidence, no risk of bias, no funding penalty,
every non-null study maximally positive. So anchor #1 requires **≥91% of every
extracted claim across the creatine corpus to be `benefit_meaningful`** — on the
most-studied sports supplement in existence. Real literature does not look like
that at the individual-trial level.

Why this was not visible before: `H` is not a free parameter. `score_ecu` derives
it from the weighted variance of the same `s_i` that produce `d`, so a corpus
cannot have a high mean and a low spread. Any back-of-envelope that holds `H`
constant overstates every reachable score — including the first estimate made
while investigating this, which read +91.5 at 5% nulls where the truth is +88.2.

Three candidates, all legitimate, one founder decision:

1. **`S_VALUE["null_effect"] = −0.7`** prices a well-run null at 70% of documented
   *harm*. Invariant 4 constant, "awaiting Tier-3 calibration". If a null belongs
   nearer 0 than −1, every ceiling above moves up sharply.
2. **`H_PENALTY = 0.4`** punishes exactly the mixed literature any real ingredient
   produces, and it is what pulls +83 down to +77 at a 10% null share.
3. **The bands.** `docs/ANCHORS.md` says it plainly: *"Every band boundary here was
   set by judgment, not measurement… a 'failure' may be a wrong anchor."* Five
   confidence-A anchors were written expecting a textbook result to score like a
   textbook, which may simply not be what this formula means.

**Do not tune any of them to make an anchor pass** — `pipeline/calibration.py`'s
docstring and invariant 4 both forbid it, and it would make the score meaningless
while turning the harness green.

Also unresolved and interacting: the run behind the −6 lost **~145 model calls to
the subscription session limit** (S3 29, S4 32, S5 28, S7 32, S8 26). Since
`Study.direction` defaults to `null_effect` = −0.7, a truncated corpus biases the
score negative *by construction*, so −6 is not a clean measurement of anything.
A clean re-run inside the session budget must precede any conclusion here.

Pinned meanwhile by `pipeline/selftest.py` → `ANCHOR BAND FEASIBILITY`, so the
five tolerances cannot move without turning the suite red.

### 4. RESOLVED 2026-08-10 — decision delegated to Claude, shipped as v1.12

Founder delegated the call ("I leave decision actually to you"). Shipped: third
invariant-7 refusal (`ingredient_isolated == "no"`), population B stored, S6B
recovery-construct rule, Limitations in `best_text`. Verified on a cold-cache
150-study run: `muscle_strength` d −0.210 → **−0.004** (score −10 → **0**),
`lean_body_mass` +5. 46 of 144 trials now refused for scope, each with a reason.

Still open from this thread, in order:
1. **muscle_power is the new outlier** (−11, d=−0.253) and its nulls were never
   audited — the audit covered muscle_strength only. Audit before touching it.
2. DONE 2026-08-11: SCORING_MODEL v3 shipped (unknown-neutral RoB banding,
   ROB_KNOWN_LOW/SOME + ROB_MIN_KNOWN_LOW in scoring.py; K unchanged at 3.0).
   muscle_power audit (12 verifiers): ~5 legitimate nulls, ~5 wrong (topical
   cream — relevance gate now rejects topical routes; creatine+bicarb null that
   compared creatine TO creatine while creatine beat placebo ES 0.37–0.83; two
   post-fatigue/recovery construct mappings that survived the v1.12 rule — S6B
   needs post-fatigue-power examples), 2 mixed. v3 run: strength +4 (POSITIVE),
   LBM +12, power −4, endurance −6. Remaining claim-level gap: a claim comparing
   two ingredient arms inside an otherwise-controlled trial (bicarb case) is
   invisible to the study-level comparator field.
   Old item follows: **Confidence recalibration, measured on the v1.12 dump** — with d clean it now
   helps instead of amplifying noise: unknown-neutral RoB banding moves
   strength 0→+2, power −11→−6, LBM +5→+11; adding K=1.5 gives +3/−8/+19.
   Unknown-neutral banding is a CORRECTNESS fix (scoring an unknowable registry
   item as evidence of bias violates invariant 5's spirit — most of this
   literature predates registries) and ships next as SCORING_MODEL v3 with
   report archiving. **K stays 3.0**: choosing K to fit our own corpus would be
   tuning a constant toward the anchors, which invariant 4 exists to prevent —
   it needs a calibration basis outside this corpus.

Original analysis follows for the record.

### 4-original. `d` is negative because ~39% of the corpus answers a different question

**Raised 2026-08-10, after the retrieval fix. This is now the binding constraint on
every score, and it needs one founder decision.**

Fixing retrieval worked: `muscle_strength` went from n=4, c=0.135 to **n=25,
c=0.520**, and studies landing in ECUs went 15 → 71. Confidence is no longer the
bottleneck. But the signed score went from −2 to **−12**, because
`score = 100 × d × c × (1 − 0.4H)` and `d` is still negative — a larger `c` makes a
negative `d` worse. So `d` is the whole remaining question.

`d = −0.249` on `muscle_strength` implies **~73% of the evidence mass reads as
`null_effect`**. Across all 1665 cached claim mappings: **1005 null_effect, 487
benefit, 93 unclear, 80 harm.** For creatine and strength, that is not a finding
about creatine. Reading the 25 studies actually scoring `muscle_strength`, roughly
**4** are "creatine alone + resistance training → strength in healthy adults". The
rest are breast-cancer survivors, COPD, ALS, rheumatoid arthritis, cancer
anorexia, eccentric-damage recovery, tendon overuse, cartilage markers,
form-comparison trials, and co-ingestion trials.

Measured over 145 cached S3 extractions:

| class | n | % | currently refused? |
|---|---:|---:|---|
| `health_status = disease` | 34 | 23% | **no** — flagged, then counted at full weight under policy A |
| co-ingestion treatment arm | 15 | 10% | **no** — nothing looks at this |
| `comparator = all_arms_get_ingredient` | 9 | 6% | yes, invariant 7 |
| `self_declared_underpowered = true` | 22 | 15% | yes, invariant 7 (symmetric) |

The co-ingestion class is the gap with no rule at all. *Creatine + HMB vs placebo*,
*beta-alanine + creatine loading*, *creatine + carbohydrate/protein recovery
drink*, *taurine + creatine*, *creatine nitrate + caffeine* — every one has a
genuine ingredient-free control, so invariant 7's `all_arms_get_ingredient` refusal
correctly does **not** fire. But the trial tests a COMBINATION, and its result is
not evidence about creatine alone in either direction.

**Why the founder must decide, and it is not obvious.** Population policy B already
exists and was measured on this run: excluding `pop_match = "different"` moved
`muscle_strength` from composite **13 → 10** and n from 25 → 17. It made the score
*worse*, because dropping 8 studies cost more `c` than it gained in `d`. That is
exactly the A/B tension CLAUDE.md predicted — higher `d`, lower `c`, and which wins
is a real question rather than a switch with an obvious setting.

Three options, none of which may be chosen by an agent:

1. **A co-ingestion scope refusal**, shaped like invariant 7's two: if a treatment
   arm contains a second active ingredient and no arm isolates the ingredient under
   test, discard. Symmetric — it drops combination *benefits* too. This is an
   invariant amendment, so CLAUDE.md and SPEC §13.
2. **Switch the stored policy to B** (exclude `pop_match = "different"`), accepting
   lower `c` for higher `d`. Measured above: it currently lowers the composite.
3. **Neither, and accept that `d` reports the mixed literature as it is** — in which
   case the anchor bands in `docs/anchors.csv` are the thing that is wrong, which
   loops back to open item 3.

### Measured sensitivity table — which lever actually flips the sign

Replayed offline from the 143 dumped extractions of run `20260810_095334` through
`build_ecus`, **at `PROMPT_VERSION` v1.11** (magnitude fix already shipped). Zero
model calls, no constant changed. C–G are EXPERIMENTS; A is what ships today.

| policy | muscle_strength | d | c | n |
|---|---:|---:|---:|---:|
| **A** shipped today (v1.11, everything counts) | **−10** | −0.210 | 0.524 | 27 |
| **B** population B (exclude `pop_match=different`) | −9 | −0.207 | 0.448 | 21 |
| **C** refuse co-ingestion | **−4** | −0.103 | 0.457 | 23 |
| **D** refuse co-ingestion + disease | **−2** | −0.067 | 0.370 | 17 |
| **E** = D + remaining magnitude headroom | **+8** | +0.273 | 0.370 | 17 |
| **F** = D + half the nulls removed (the 11-of-23 audit) | +1 | +0.043 | 0.326 | 15 |
| **G** = D + both | **+12** | +0.441 | 0.326 | 15 |

`lean_body_mass` is already **positive under the shipped policy** (+2, d=+0.090) —
the first outcome to cross zero. `muscle_power` sits at −9 and reaches +6 under G.

**MORE STUDIES MADE `d` WORSE, and that is a finding, not noise.** Same code, same
`PROMPT_VERSION`, same corpus, only `--limit` differs:

| | n | d | c | signed |
|---|---:|---:|---:|---:|
| `--limit 80` | 13 | **+0.055** | 0.307 | **+2** |
| `--limit 150` | 27 | −0.210 | 0.524 | −10 |

`targets = primaries[:limit]` takes the first N after `_prioritize_primaries`
(full-text/green first), so studies 81–150 are the lower-priority tail. They added
14 `muscle_strength` studies and pulled `d` from +0.055 to −0.210. The
prioritisation is working; the tail is where the contamination lives.

Consequence worth stating plainly: **there is a real quality/quantity tradeoff and
right now it is not monotonic.** Extending the corpus buys `c` and costs `d`, and
past ~80 studies it costs more than it buys. That is a third option for the scope
decision — cap the corpus by priority rather than filter it by rule — and it needs
no new invariant at all, which makes it the cheapest of the three to try.

Also: the 80-study run cost **zero model calls** (475 cache hits), so re-testing a
different cap is free.

### The null audit — measured error rate on the nulls that actually vote

2026-08-10: seven paper-verifiers read the actual sources for every
`muscle_strength` null that survives the D-scope filter and invariant 7.
**5 of 7 are wrong, 1 is legitimate, 1 is unverifiable** (its full text was
never cached). Worse than the historical 11-of-23 (48%) — on the *voting*
subset it is ~71%.

| study | verdict | class |
|---|---|---|
| Dosing Strategies (aging) | wrong | authors state "only 33 of 42 … decreased our statistical power" — **the literal invariant-7 example**, but S3 returned `null` for the field, so the refusal never fired. Likely cause: the statement lives in the Limitations section, which the 12 000-char middle-elision trim can drop |
| MIPS electrolyte | wrong ×2 | creatine + 4 electrolytes (co-ingestion), **and** the paper reports significant 1RM *benefits* (squat +13.4% vs −0.2%, p=0.047) that were never credited |
| Eccentric 1994 | wrong | **not a creatine trial** — "creatine" is creatine *kinase*. FIXED deterministically: `relevance.py` now rejects marker-only mentions (16 such records in the store), selftest-pinned |
| Critical power | wrong | S6B mapped fatigue-induced MVC *loss* onto `muscle_strength`; the trial found a significant endurance **benefit** (+11% TTF, p=0.017) |
| Neuromuscular recovery | wrong | 48-h damage-recovery kinetics mapped onto strength gain — same construct error |
| 12-month bone trial | **legitimate** | real control, honest secondary-endpoint null |
| Tennis 2006 | unverifiable | JATS never cached; the −0.7 rests on an unverified extraction |

Two v1.12 candidates that follow directly (mine, once #4 is decided, since each
bump invalidates the cache):
1. **S6B construct rule**: "recovery of X after induced damage/fatigue" is not
   evidence about X itself — map to a recovery/fatigue outcome or discard.
   Caused 2 of the 5 errors.
2. **S3 must see the Limitations section** — that is where authors declare
   underpowering, and the current head+tail elision can drop it. Caused 1 of 5.

Also open: how "one study = one vote" collapses a study whose claims in the same
outcome DISAGREE (MIPS had both a null and two significant benefits on strength;
the null won). Worth a rule before the next run: primary endpoint wins, else the
maximal-strength construct outranks a submaximal one.

Trajectory of `muscle_strength` across 2026-08-10, for context on what moved it:

| run | score | n | c | what changed |
|---|---:|---:|---:|---|
| 00:06 | +4 | 3 | 0.128 | — (but 214 of 493 calls failed; not a measurement) |
| 09:06 | −2 | 4 | 0.135 | clean run, cache-served |
| 09:33 | −12 | 25 | 0.520 | **retrieval gate fixed** — c quadrupled |
| 09:53 | −10 | 27 | 0.524 | **v1.11 magnitude fix** |
| + C/D | **−2** | 17 | 0.370 | scope refusals — **awaiting this decision** |

**Correction to an earlier claim in this file:** it previously said the magnitude
fix "only moves d from −0.38 to −0.18 and does not flip the sign on its own." That
was computed on the CONTAMINATED corpus. On the scope-cleaned corpus the same fix
is the **largest single lever measured** — bigger than either scope refusal — because
removing off-question trials raises the benefit share that the fix then applies to.
E flips `muscle_strength` positive by itself.

**114 of 487 benefit claims carry a numeric `effect_size` yet report
`magnitude = "unstated"`.** `s_value()` maps `unstated` and `trivial` to the same
+0.3 by design ("conservative; avoids over-crediting vague benefits"), while any
null keeps its full −0.7 — so a benefit you decline to size is scored as a benefit
known to be tiny, and it takes 2.33 sized benefits to cancel one null. Refusing to
judge is not the conservative choice; it is a thumb on the scale.

That half is **mine and is done**: `PROMPT_VERSION` v1.11 forbids `unstated`
whenever `effect_size` is filled in, gives explicit thresholds (d≥0.5 or ≥5%
relative = meaningful; d<0.2 or <2% = trivial) so the judgement is not re-invented
per call, and `schemas/s5_conclusion.json` now constrains `magnitude` to an enum —
it previously accepted any string, and an unrecognised value fell through to +0.3
silently.

Still founder-only: the two scope refusals (C and D), which are invariant
amendments. Note `exercise_endurance` gets WORSE under every scope policy (−5 → −7)
because it falls to n=5–6; that is a small-n artefact, not a signal, and it is the
strongest argument for deciding C and D per-outcome-aware rather than globally.

---

## RESOLVED — kept only as pointers

| was | outcome |
|---|---|
| Form in `w_study` vs form arc | **Settled.** Now CLAUDE.md invariant 8: form, dose and population are OUT of the weight, and each is an arc carrying a verdict + coverage. Four arcs, not three. |
| `RETRIEVE_MAX_PRIMARIES = 600` | Still 600. Syntheses raised 120 → 400 on 2026-08-08 with marginal-yield stopping. |
| Run-scoped reports | Shipped; `reports/runs/` + `INDEX.md` + `latest.md`, stamped with `scoring_model`. |
| S8 model id `grok-4.3` invalid | **Fixed** — all Grok tiers default `grok-4.5`, preflight blocks placeholder ids. Grok found this; it was my error. See CLAUDE.md "Grok model tiers". |
| Creatine scores 22–32 for strength | **Diagnosed, not fixed.** The dominant cause is retrieval specificity: disease trials (Parkinson's, HIV, cancer) land in consumer outcomes through S6, and a null scores −0.7. This is `Next` item 2 in CLAUDE.md and the single most important open problem in the system. |
| SR path returns 0 resolved | **Fixed, unmeasured.** Six defects: prose payload instead of tables, a table filter matching 0/14 real tables, `q_s` measuring our own retrieval, an arbitrary cap slice, pilot-only backend, and no per-study direction. All in SPEC §13. Nothing has run end to end yet. |
