# Project log

Dated change notes, newest first. This replaces the running `Current state`
diary that used to live in root `CLAUDE.md` (archived verbatim, with every entry
up to 2026-10-02, in `2026-10-02-claude-md-archive.md`; the older team change
log is `2026-08-handoff-changelog.md`).

Each entry: date, what changed, what was verified, and any handoff. Record
measurements here; keep `CLAUDE.md` to rules and a short current-state snapshot.

---

## 2026-11-03 — intervention search no longer requires "oral"/"supplementation"; glucosamine census

`sources/europepmc._query(scope="intervention")` dropped `SUPPLEMENT_CONTEXT`: the
ingredient is already required in the title or a supplement phrase, the
drug-context exclusions stay, and the relevance gate checks every record before
any model call. Measured hit counts: glucosamine 53 -> 119, creatine 398 -> 491,
vitamin C 315 -> 456 (the next creatine and vitamin C runs retrieve the extra
records). Glucosamine census: 106 relevant RCTs, 20 readable, about 2
single-ingredient placebo trials on the knee, so a run would give `joint_pain`
k ≈ 1 (DECISIONS O2). Not run. 288 Python tests.

## 2026-11-03 — Semantic Scholar source, wider full-text filter, PAPERS_APIs, glucosamine proposal

`sources/fulltext.fetch_s2_text` (rung 6, `S2_API_KEY`): Semantic Scholar's
open-access link when it is new; PMC pages outside the open-access set skipped
(PMC terms). Source census over every relevant RCT (no model): creatine 400
relevant, **134 readable** (PMC 77, listed copies 20, CORE 10, Semantic Scholar 27);
vitamin C 298 relevant, **62 readable** (39, 13, 5, 5). Found: `--full-text-only`
dropped records with no listed copy before any source was tried, which lost 29
readable creatine RCTs; with a keyed source configured a DOI is now enough
(`corpus._prioritize_primaries`). New `docs/PAPERS_APIs.md`: every source and
account, with what it reads or could add per supplement. Glucosamine proposed
as the negative control (DECISIONS O2: MCID 0.37 SD from Wandel 2010, measure
order, 3 benchmark rows, industry-inflated pools excluded). 287 Python tests.

## 2026-11-03 — CORE full-text source wired (working)

`sources/fulltext.fetch_core_text`: rung 5 of `best_text`, after Elsevier.
Exact-DOI matches only; broken-sign text refused like a PDF's; one search per
6 s (1.2 s drew HTTP 429 on 12 of 64). Founder's personal key in the gitignored
`.env.pipeline`, handover in PIPELINE §2. `tests/conftest.py` hides real keys from
every test. Census on vitamin C (no model): readable **52 -> 56 of 116** (CORE held
8 of the 64; 3 refused for broken signs). The other publisher keys need an
institutional or ORCID identity the founder does not have. 282 Python tests.

## 2026-11-03 — Elsevier full-text source wired; key not yet enabled

`sources/fulltext.fetch_elsevier_text`: rung 4 of `best_text` (after PMC, listed
copies, green OA, so no study that already reads changes text). Keys come from
`sources/http.secret()`: environment, else the gitignored `.env.pipeline`
(template `.env.pipeline.example`, handover steps in PIPELINE §2 "API keys").
Measured with the founder's personal key: Scopus search and abstracts answer
(200); the article API refuses every article, open access included (403
`AUTHENTICATION_ERROR`), so Elsevier must enable full-text access for the key.
Until then the rung prints one notice and adds nothing. Its section parser is
unit-tested on a hand-built response only; the first real response must be
checked. 277 Python tests.

## 2026-11-03 — vitamin C run `20261103_101034`: too thin to test anything

116 studies targeted, 52 read, 64 without readable text (20 PMC articles outside the
open-access subset; 30 of the 64 are Elsevier, incl. AJCN and J Nutr). 0 partial
failures. Every outcome **I, k <= 1**. Refusals across outcomes: 29 combination arms
(`no_isolated_ingredient_arm`, mostly C+E), 11 off-target populations.

Yes/no route worked on real text: Johnston 2014 (doi:103390nu6072572), 7/15 vs 11/13
with colds, our RR 0.55 [0.31, 0.99] vs the paper's 0.55 [0.33, 0.94]; g = +1.01, I.
Benchmark: CRP passes (k = 1, so it validates nothing); cold incidence and duration
NOT_TESTABLE (our CI 11x and 3x the published width); mood and blood pressure no
pool. **The negative controls are not tested**: with k = 1 every letter is I, so
"stays low" is guaranteed, not earned. The binding limit is readable text.

## 2026-11-03 — first vitamin C attempt stopped; broken-sign PDFs refused, `--demo`

Founder stopped the run after 29 studies extracted. The terminal spam was pypdf's
"fontTools is required..." warnings; re-extracting 6 PDFs with `fonttools`
installed gave byte-identical text, so they were harmless (`fonttools` added to
`requirements.txt` to silence them). Usage limit hit after about 10 minutes and
stayed through 9 probes (about 2 h 15 min) until the founder stopped it; the
`QUOTA HIT` line now quotes the limit's own message.

Found while checking: **59 of the first 88 studies were skipped as "no text"**
(no model calls). 18 are PMC articles outside the open-access subset (Europe PMC
answers HTTP 500, NCBI says the publisher forbids XML); 39 list a green-OA copy
that is a login page or broken link. And 5 of the 6 newly fetched PDFs (all
Cambridge, Br J Nutr) use a symbol font that turns minus into "2" and plus into
"þ": "(-0·12 mmol/l, 95 % CI -0·32, 0·09)" read as "(20·12 mmol/l, 95 % CI
20·32, 0·09)", the same in pypdf, pdfminer and PyMuPDF. Such PDFs are now
refused (`fulltext._broken_signs`, text signature plus measured font names), so
those studies count as no full text; none had been extracted. Side effect: one
cached creatine PDF (Benton 2011, cognition, `doi:101017s0007114510004733`) is now
refused too; it touches no strength, lean-mass or power estimate.

New `--demo` flag (founder asked for a demo before every big run): text census
of the whole corpus, 3 studies for real (cached), per-agent summary, no report.
Census on vitamin C (no model): **52 of 116 studies have readable full text**;
29 are already extracted and cached, so about 23 studies (~180 calls) remain.
Gates green (271 Python tests).

## 2026-11-03 — vitamin C MCIDs and benchmark rows approved

Founder approved the proposal; values and rows in DECISIONS. Installed `natural`
MCID conversion in `grade._threshold`. Ready to run.

## 2026-11-03 — yes/no route and vitamin C preparation

`event_counts` route, S5N and S5R v1.42, a pooled risk ratio for the benchmark, an
`rr` benchmark scale, row orientation (`benefit_direction`), unit spacing, polarity
for blood pressure and blood sugar, four measure hierarchies (DECISIONS). No model
calls. Re-pooled `out/run_v141c_extractions.json`: main creatine estimates identical;
blood pressure and blood sugar now k = 2, I, previously refused for no polarity. That
dump predates v1.42, so it holds no event counts: the route has unit tests only until
vitamin C runs. Cost for later: the version bump re-runs S5N and S5R, and the polarity
and hierarchy values (sent in its payload) re-run S6B, on creatine's next full run.
Dry run: 117 vitamin C studies pass the full-text and relevance filters.

## 2026-11-02 — "Possible" benefit row (founder)

`grade.benefit` calls a positive estimate whose CI excludes meaningful harm and
holds both 0 and M "possible": C− at Moderate, D+ at Low, I at Very low. Considered
and rejected: inconclusive (every creatine outcome I, founder: wrong for a result
that leans positive across 14 trials). Re-pooled offline from
`out/run_v141c_extractions.json`, no model calls, with B4:

| Outcome | k | Estimate | Stored | Now | At M/2, 2M |
|---|---|---|---|---|---|
| strength | 14 | +0.14 [-0.03, +0.30] | D Moderate | C− Moderate | C−, D |
| lean mass | 11 | +0.12 [-0.06, +0.30] | D Moderate | C− Moderate | C−, D |
| power | 12 | +0.10 [-0.15, +0.35] | D+ Low | C− Moderate | I, D |

All other outcomes stay I (Very low). All three are threshold-sensitive. Stability
still holds under the new letters: `full_pool` gives the same letter in both
readings on all 5 outcomes with k >= 3. The negative controls are the row's test.

## 2026-11-02 — B4: a baseline gap counts as a flaw only beyond chance

`baseline_imbalance` now tests |gap| / SE > 1.96 instead of gap > endpoint
difference (DECISIONS). Re-pooled offline from `out/run_v141c_extractions.json`,
no model calls: 13 flagged pooled effects → 0, power D+ Low → D Moderate, no
estimate moved. The stored run 20261031_201501 is not rewritten.

## 2026-11-02 — stability passes (METHOD §16)

Fresh run B1 of 25 studies against production run 20261031_201501, with its own
empty cache, over two sessions (subscription limit at study 12). Two calls failed
with `max_turns` (S5 on `doi:1010801550278320232193556`, S5FR on
`doi:103390nu15245134`); not retried, because a failure is part of what a re-run
does. Production had one failure in 98 studies (S5N).

The 25 studies graded alone give k <= 3 and letter I everywhere, so a letter
there cannot move. `compare` now also re-grades the whole run with the fresh
readings swapped in (`full_pool`):

| Outcome | Production | Fresh | Change |
|---|---|---|---|
| strength | D k14 +0.139 | D k13 +0.166 | 0.027 |
| lean mass | D k11 +0.123 | D k10 +0.116 | 0.007 |
| power | D+ k12 +0.103 | D+ k11 +0.100 | 0.003 |
| muscular endurance | I k4 +0.150 | I k4 +0.184 | 0.034 |
| exercise endurance | I k3 -0.074 | I k3 -0.074 | 0.000 |

The k and estimate changes in strength, lean mass and power all come from the
study lost to the failed S5; without it those three are identical. It re-read 11
of the 37 pooled effects in those outcomes, so this bounds the other 26 only by
assumption. Facts: comparator 100 %, n randomised 100 %, means 93 %, SDs 96 %,
rating after S4R 96 % (one flip, low to concerns, in a study pooled in no main
outcome). Below 90 %: S4 item 2 80 %, item 5 76 %, item 7 88 %,
`ingredient_isolated` 88 %, mapping 89 %. `effect_favours` agrees 74 %: it only
sets a sign for a reported effect or a flag on arm statistics; no pooled sign
moved. Effects: 34 of 37 present in both runs, 32 within 0.05; the largest gap
(0.25, `doi:101007s1135702501889y`) and one refusal
(`doi:101186s129700190291x`) are in trials pooled in neither run.

## 2026-10-31 — run 20261031_201501: spot audit seed 3 passes; stability run made like-for-like

Run with S4R and the pooled-SE rule: 30 live calls (forecast 25), 791 cache hits,
6 failed attempts; the only failure left is the usual S5N on the off-target
rheumatoid-arthritis trial. Letters and estimates unchanged: strength D Moderate
(k 14, +0.14 [-0.03, +0.30]), lean mass D Moderate (k 11, +0.12 [-0.06, +0.30]),
power D+ Low (k 12, +0.10); benchmark passes both (6/6 and 2/2 overlap, coverage
56 % and 79 %). The pooled-SE rule removed the two audited effects and one more
(attention, memory, sleep duration; all k <= 2, all I).

S4R read 27 studies: item 2 flaws 9 cleared, 5 kept; item 7 flaws 5 cleared, 9
kept. Not all were read against the papers: of the two kept item 2 flaws in the
audit sample, both are true (open-label, single-blind). One clearance is arguable:
`nu12010193` says no substance was added to the placebo but athletes were unaware
(S4R item 2 = 1; about 3 % of lean mass weight, no letter depends on it).

Seed 3, read against each paper's text (and the figure image for the one figure
effect): **0 consequential errors in 20, PASS.** All numbers, arms, measures,
directions and ratings right. Harmless, not counted: `nu10111640` lists dextrose
on the creatine arm only (both arms had it; a vehicle, exempt); `101007s1260301811488`
prints a change of 3.5 in its table against 3.9 from pre and post (paper's own, C4).

Found while reading: `baseline_imbalance` fires on trivial gaps in null trials
and alone sets power's certainty (work list B4).

Stability script: until now it rebuilt records from Europe PMC, sent no registry
facts and offered S6B 5 outcomes, so against a production dump it would have
measured those differences as instability. It now takes `--dump`, sends
production's records, registry facts and full vocabulary, and `forecast` proves
it without a model call: 25 studies, **243 calls, 243 hits on production's cache,
0 misses**. `compare` also reports `rob.confirmed`, the rating after S4R, which is
what the grade reads. Refusal text fixed: 68 claims with no figure read said "a
reader returned nothing"; they now give the recorded reason (no grade moves).

## 2026-10-31 — second spot audit fails; second risk-of-bias reader built

Seed 2 on run 20261031_142105, 20 effects read against the papers: every number
right, no reversed direction, 6 consequential errors (limit 3). S4 (4): item 7 = 1
from screening exclusions (`doi:103390nu16060766`) and from 1 vs 2 withdrawals
at 16 % overall (`registry:nct01164020`, borderline); item 2 = 0 with blinding
unmentioned (`doi:103390ijerph19137992`, a repeat of audit 1) and on an explicit
"double-blind, placebo-controlled" (`doi:103390nu17243831`, right at v1.40).
Quantity (2): mixed-model SE across nights (`doi:103390nu16162772`, g 1.13);
percent change pooled over 3 visits with an SE over 86 observations
(`doi:103390nu18081192`). Scan of all pooled effects: 3 such, none in strength or
lean mass. C6's rule was not tested by the sample. Accepted figure
`doi:103390nu9111169` checked by eye: readings right.

Built: S4R (tier R, same prompt, blind; `workers._second_rob`,
`pool.confirmed_s4`) and the pooled-over-visits refusal. Probe, 8 S4R calls on
known cases: 5 of 5 false flaws cleared, 2 of 2 true flaws kept
(`doi:103390nu12061880`, `doi:1010801550278320262633251`). It also rated
`doi:1015191533428720030170026csaieo20co2` item 7 = 1 where S4 said 0: a flaw only S4R sees does
not count under the rule, so a false negative of S4 is left to audits.

Forecast by cache-only replay (`scripts/replay_from_cache.py`, now reviewers on
by default): 791 hits, 25 misses (20 S4R, 2 S5FR, 1 S5F, 1 S5R, the usual S5N).

## 2026-10-31 — creatine run 20261031_142105 (figure route, no abstracts)

138 targets: 96 ok, 40 skipped (no full text: the abstract rule), 2 partial
(the usual S5N on `doi:101002acr22747`; S5FR on `doi:103390nu15163567`, a
schema failure). **Strength D, Moderate**, k = 14, +0.14 [-0.03, +0.30], I2 0,
coverage 56 %, benchmark **PASS** (6/6, width x0.9; D at 2M, I at M/2); **lean
mass D, Moderate**, k = 11, +0.12 [-0.06, +0.30], 79 %, **PASS**; **power D+,
Low**, k = 12, +0.10 [-0.15, +0.35] (without the figure route I, k = 10).

**Cost error (Claude):** forecast 60-80 live calls, actual 664 attempts, about
5 h of quota pauses. `counter_ion` in `form.json` reaches the S7 payload and
`exclude_measures` in `outcome.json` the S6B payload, so both agents missed the
cache on every study. Guard: tests/test_vocab_payload_guard.py pins the keys.
Not stripped now: that would invalidate them again, and the stability run must
see this run's input.

Figure route: 28 S5F / 46 S5FR attempts for 27 claims (80 others: no caption
names the measure). **4 accepted, 3 pooled** (strength `doi:103390nu9111169`;
power `doi:103390nu9111169`, `doi:101186s1297001701622`); the fourth was a
multi-ingredient arm the arm check refuses (the worker now checks first). Refused:
6 unstated bars, 3 + 2 disagreement on the bar kind / top, 4 means beyond 2 %,
3 plotted quantity, 3 panel not found, 1 mean not read, 1 reader failed. Yield is low because the
safeguards hold; the tolerance is not moved. `doi:103390nu12061880` stays out
(one reader: bars sd, the other: unstated). Rejected: taking the bar kind from a
paper's statistics statement (about 4 non-strength effects; a paper can state
SD for tables and plot SE, and an SE read as SD shrinks the effect by sqrt(n)).

Free stability measurement, same S5 claims re-read: S6B mapping 1149/1207 =
95.2 % (its input changed slightly, so this is a lower bound on a clean test;
one flip is the plain "Lean mass (LM)" -> discarded), S7 fields 97.3-99.6 %.

## 2026-10-28 — figure route built (runs at the next extraction)

`sources/figures.py` (PMC figure list from the JATS, images from the article
instance, cached); `pipeline/figure.py` (caption-based `pick_figure`, `accept`:
both readers agree within 2 % of the y-axis on every mean and error bar, the
same plotted quantity and error-bar kind; `RULES` watched); S5F / S5FR v1.0
(production prompt: what is plotted, arm names mapped to the legend, baseline
and the analysis timepoint); `workers._figure_numbers` (per study and outcome,
the claim the pool would pick, only when its text gives no effect;
`SP_FIGURE_READER`); pool route `figure_means` (rank 7, effect computed by the
arm-statistics code incl. ANCOVA); `evidence_v2` sensitivity
`without_figure_means`. Reach on run 20261028_082425: 23 (study, outcome)
pairs in 16 PMC studies (3 strength, 7 power, 4 recovery). tests/test_figure_route.py.

## 2026-10-28 — re-pool fixes (founder rule: Claude decides, rigour first, then cost)

Built, all deterministic, no model call: vehicles / counter-ions ignored in arm
comparisons (`vocab/cointervention.json`, `form.json counter_ion`); contrast from
S3's arm facts (pool, `review.reconcile`, S5R selection); `exclude_measures`
(sport-skill counts out of muscle power); "creatine clearance" is a marker
mention (ARISTOTLE out); under `--full-text-only` an abstract-only study gets
no text (`run.corpus._best_text` had discarded the tier: 41 of 138 studies were
extracted from abstracts; tiers measured cache-only, out/text_tiers_v141.json).
Re-pool of run 20261028_082425 with all of it and the abstract-tier studies
removed: **strength D, Moderate**, k = 13, +0.13 [-0.04, +0.30], coverage 52 %,
benchmark **PASS** (6/6, width x0.9); **lean mass D, Moderate**, k = 11, +0.12
[-0.06, +0.30], 79 %, PASS; power I, k = 10. Our strength estimate is at the
low end: the two largest meta-analyses (+0.43, +0.46) overlap only through our
upper bound. Settled at the next run: 5 reviewer conflicts over the contrast
label, never-reviewed mislabelled claims (now sent to S5R).

## 2026-10-28 — v1.41 creatine run 20261028_082425

S4, S5, S5N, S5R v1.41 plus every agent for the 9 re-texted studies, several
sittings (previous attempt: 28 quota requeues, 3 failed); final 137 ok / 1
skipped (the GAA pilot) / 1 partial (the usual S5N on `doi:101002acr22747`).
**Strength D, Moderate**, k = 10, +0.11 [-0.09, +0.30], NOT TESTABLE (34 %);
**lean mass D, Moderate**, k = 10, +0.14 [-0.05, +0.33], PASS (59 %); power I,
k = 10. New fields arrived: `timepoint_role` on 1 367 of 1 471 claims (95
interim, 10 after stopping), `smd_basis` on 33 of 34 reported SMDs (8
interaction / ANOVA, refused), verified baseline SDs on 198 claims.

Found: (1) the S5N / S5R contrast wording did NOT fix the add-on mislabel (21
-> 20, including "CREATINE vs PLACEBO" as vs_ingredient_arm). (2) The
claim-level arm check refuses trials over a carrier or the form's counter-ion
S3 lists as a co-intervention: `doi:103390nu10111640` (dextrose; it left
strength, lean mass and power once its methods were read), maltodextrin,
nitrate for creatine nitrate. Offline: ignoring carriers and counter-ions (12
list entries) gives strength k = 13, D, +0.13 [-0.04, +0.30], coverage 42 %;
lean mass k = 11, D; taking the contrast from S3 arm presence changes no
pooled effect. Both proposed in DECISIONS.

## 2026-10-26 — figure pilot

Adapter: `call(..., images=)` sends images as one stream-json message (one
shot, no tools; image SHA-256 in the cache key; tests/test_adapter_images.py).
Pilot agents S5F (sonnet) and S5FR (opus), `prompts/s5_figure.md`, not wired
into extraction. 19 panels from 10 papers (`figure_pilot_cases.json`), each
with a number the same paper prints; PMC5234097 dropped because its figure and
table disagree (week-8 bench change 14 vs 6 kg), and PMC11944689's text and
figure differ in the later phases (SD 2.70 vs ~1.45; flagged). Images as PMC
serves them (~750 px). 37/38 readings (one S5FR schema failure).
- Plotted means: S5F median error 0.67 % of the y-axis (90th 3.6), 0.03 SD;
  S5FR 0.77 % (90th 2.6), 0.04 SD. Error in a between-arm SMD: median 0.01 /
  0.04, 90th 0.15 / 0.17. Readers within 1 % of the axis 37/50, 2 % 42/50, 5 %
  46/50.
- Individual points (PMC10044149): 4-6 of 6-7 points found, means off 3-8 % of
  the axis, SDs off by up to a third: not usable.
- First call: the reader wrapped its answer in the `values` field; renamed
  `readings` (pilot-v0.2, v0.3 moves the top-level instruction).
DECISIONS open 1.

## 2026-10-26 — v1.41 prompts; timepoint and SMD-basis rules (founder: approve 2-4)

S4, S5, S5N, S5R v1.41 (`AGENT_PROMPT_VERSION`): S4 item 2 null for a placebo
with blinding unmentioned and item 7 from stated counts only (the two audit
misreads, quoted in the prompt); S5 `timepoint_role`; S5N / S5R contrast
wording (only the target ingredient decides it, with the caffeine example),
`sd_pre_*` and `smd_basis` (schemas, span check, review fields; `smd_basis`
must be confirmed). Code: `pool.TIMEPOINT_RANK` in the selection order; a
reported SMD needs a between-arm basis; the ANCOVA slope uses r x SD_post /
SD_pre when baseline SDs are verified. Text budgets checked: every agent's
input is unchanged (S5N / S5R were already over budget, S4 / S5 full text).
Re-pool of run 20261026_034529 (pre-v1.41 extractions, so no `timepoint_role`
or `smd_basis` yet): the two pooled reported SMDs, both interaction d's from
`doi:103390nu12061880`, are refused; strength **D Moderate**, k = 10, +0.14;
muscular endurance k = 4 → 3. tests/test_v141_rules.py.

## 2026-10-26 — polarity per measure built (founder: approve 2-4)

`vocab/outcome.json` gains `measure_direction` for 11 outcomes, matched by
`pool.measure_polarity` on outcome_raw + measure (designed against every claim
name in the run; "OMBT distance ... PAP time" needed a distance exclusion).
`effect_size` flags `sign_disagrees_with_reader`. Run 20261026_034529
re-pooled: energy_levels' Hooper fatigue -0.17 → +0.17, 2 mixed claims refused
as unclear, every graded letter unchanged; one sign disagreement left (a CMJ,
g -0.05). tests/test_measure_direction.py.

## 2026-10-26 — ANCOVA adjustment built (founder: "ANCOVA and r = 0.5")

`effect_size`: every endpoint arm-statistics effect of a parallel trial with
verified baselines is adjusted (endpoint difference - 0.5 x baseline
difference, variance x 0.75), flagged `ancova_adjusted`, carrying its g and
variance at r = 0.3 / 0.7; `evidence_v2` reports `sensitivity.ancova_r_0.3 /
_0.7`. `effect_size.RULES` is a watched constant. Crossovers are not adjusted;
the baseline-imbalance flag and its risk-of-bias cap are unchanged. Re-pool of
run 20261026_034529, identical to the offline measurement: strength **C,
Moderate**, k = 11, +0.19 [+0.01, +0.38] (B+ at r = 0.3, C at 0.7); lean mass
**D, Moderate**, k = 10, +0.14 [-0.05, +0.33]; power I. TS-parity goldens
byte-identical. The measurement behind the decision:

1. **Endpoint values when the arms' baselines differ.** 11 of the 34 pooled
endpoint effects with verified pre and post values point the other way from
their change from baseline, all flagged `baseline_imbalance` (which today only
caps risk of bias); 9 of the 11 turn a creatine gain into a loss. Lean mass:
5 of its 10 pooled trials. **Measured offline 2026-10-26** (run
20261026_034529 re-pooled; pre SDs are not extracted, so the arms' post SD
stands in for them):

| Rule, applied to every endpoint effect with verified pre / post (strength 10 of 11, lean mass 8 of 10, power 7 of 9) | Strength | Lean mass | Power |
|---|---|---|---|
| Endpoint (today) | B+ Moderate, +0.21 [+0.02, +0.41] | D+ Low, +0.14 [-0.09, +0.38] | I, +0.05 |
| Change from baseline, r = 0.5 (Morris 2008 d_ppc2; r sets the variance only) | D Moderate, +0.18 [-0.01, +0.37] | D Moderate, +0.14 [-0.08, +0.35] | I, +0.14 |
| ANCOVA approximation, r = 0.5 (endpoint - r x baseline difference; variance x (1 - r^2)) | C Moderate, +0.19 [+0.01, +0.38] | D Moderate, +0.14 [-0.05, +0.33] | I, +0.09 |

r = 0.3 / 0.7 move estimates by at most 0.02 SD; ANCOVA strength is B+ at
0.3, C at 0.5 and 0.7. Lean mass passes the benchmark under every rule;
strength stays not testable (coverage). Applying a rule only to the
`baseline_imbalance` trials is **biased by construction** (the flag selects
trials whose endpoint difference is small) and gave lean mass B+ (+0.25): not
an option. Recommendation: ANCOVA for every trial with verified pre / post
(the Cochrane-preferred estimate under imbalance), r = 0.5 as a founder
constant with 0.3 / 0.7 reported, and S5N / S5R reading the baseline SDs in
v1.41 so the post SD no longer stands in.

## 2026-10-26 — text bugs fixed; decision 1 measured

`sources/fulltext`: "Experimental Section" (and "Experimental design /
procedures") is methods; a PDF served from a non-.pdf URL is parsed as PDF, and
a cached tag-stripped PDF is fetched again (tests/test_fulltext_text.py). All 9
affected studies now read with their methods (`jnsv72284`'s PDF yields only
2.7k chars); their payloads changed, so the next extraction re-runs every agent
for them. Not fixed, recorded: `registry:nct00412984` (ARISTOTLE, atrial
fibrillation) is in the creatine corpus, and `doi:101113ep087886` was read from
a repository landing page; neither produced a pooled effect.

Decision 1 (endpoint values under baseline imbalance) measured offline on the
same run (table in the ANCOVA entry above). Under ANCOVA (r = 0.5) for every trial
with pre / post: strength B+ -> C (+0.21 -> +0.19, on the threshold), lean mass
D+ Low -> D Moderate, power I. Converting only the flagged trials is biased by
construction and was ruled out.

## 2026-10-26 — first spot audit (run 20261026_034529)

`spot_audit.py --extractions out/run_v140b_extractions.json` (seed 1, the pool
under the claim-level arm check), 20 effects from 15 papers, each checked
against the stored full text (JATS, one green-OA PDF). Every number checked
matched its paper; arms and measures were right.

Consequential extraction errors, all S4:
- `doi:1010801550278320232193556` (items 8 and 13): item 7 = 1 from "Thirteen
  participants (72% of the dance program) completed", a share of the program,
  not a completion rate; no dropout is reported. Flips unclear -> concerns.
- `doi:103390ijerph19137992` (item 20): item 2 = 0 with a placebo described and
  blinding never mentioned; S4's own rule makes that null. Flips unclear -> high.
And one reversed direction, from the vocabulary, not the reader: item 3, the
Hooper fatigue score pooled under `energy_levels` (`higher_better`).
By the pass rule (METHOD §16) the audit FAILS: a reversed direction fails alone,
and 3 of 20 sampled effects carry an S4 error (2 distinct misreadings). Without
the vocabulary reversal it would be 2-3, extend to 40.

Not errors, method gaps (DECISIONS open 1-4): endpoint values under baseline
imbalance (items 1, 2, 4, 19; 11 of 34 pooled endpoint effects reverse against
their change), polarity per outcome (item 3), no timepoint rule (item 18), an
interaction effect size taken as an SMD (item 17). Also seen: one paper's
Table 1 contradicts its own text on which arm is which (`doi:103390nu13030826`;
the extraction follows the text). Item 15 confirms `doi:103390nu12061880`'s
item 7 = 1 (all 4 withdrawals from placebo, 31 %), the flag strength's
risk-of-bias margin rests on.

Found while checking item 10 (all-null S4): 11 studies were read from broken
text in every run. `sources.fulltext.SECTION_PATTERNS` has no pattern for
"Experimental Section", so 3 MDPI papers (`doi:103390nu10111640`,
`doi:103390nu9111169`, `doi:103390nu8030143`) were sent results and discussion
only, no methods; 7 green-OA PDFs were sent as raw `%PDF` bytes, and
`registry:nct00412984` got an unrelated NSAID abstract. 7 of the 11 produced
no claims and passed as "ok".

## 2026-10-26 — S5N / S5R v1.40 run 20261026_034529; claim-level arm check

Re-ran S5N and S5R only (v1.40, `p_test`; smoke test 20261025_223659 clean),
everything else from cache; 180 quota requeues, ~5.1 h. 137 ok / 1 skipped
(`doi:101159000518499`, GAA + creatine pilot, abstract only, the same each run)
/ 1 partial (the usual S5N on `doi:101002acr22747`, off-target anyway). All 52
pooled effects double-read and agreed; reviewer disagreements 1 -> 3. Strength
**B+, Moderate**, k = 12, +0.24 [+0.04, +0.44], NOT TESTABLE (44 %); lean mass
**D, Moderate**, k = 11, +0.18 [-0.05, +0.41], PASS; power I, k = 10.

`smd_from_p` recovered none of the 8 "only a p-value" trial-outcomes: with the
test named, 7 are tests that do not convert (repeated-measures, ANCOVA, ...), 2
name no test, 1 has no favoured arm. No outcome used the route.

Found: S5N labelled the matched pair CS-RT + CrM vs CS-RT of
`doi:103390nu13072303` `vs_ingredient_arm`, so it was refused and the pool took
CS-RT + CrM vs the no-training control instead (strength g 0.57 -> 1.21, power
0.38 -> 1.27, lean mass 0.92 -> 1.09; the numbers were identical in both runs).
The study-level isolation rule kept that contrast because S3's
`ingredient_isolated` is "yes" for the trial. The mislabel is general: 21
add-on-control claims at v1.40, 8 at v1.39. Founder: (a) claim-level check
`eligibility.unmatched_claim_arms`, built (DECISIONS); re-pooled: strength B+
(k = 11, +0.21 [+0.02, +0.41]), lean mass **D+, Low** (k = 10, +0.14 [-0.09,
+0.38]; risk of bias now -1), power I. (b) S5N / S5R wording fix v1.41, bundled
with the post-audit re-extraction.

Tooling: the run context now exports S4 item 7 and each arm's role and
co-interventions (both missing since item 7 was added), and every pooled study
records its `claim_index`. `spot_audit.py` shows item 7, the contrast label and
co-interventions, picks the exact claim, can re-pool a dump with the current
code (`--extractions`), and states the decided pass rule.

## 2026-10-25 — S4 v1.40 creatine run 20261025_101638

Re-ran S4 only (item 7, attrition problem); everything else replayed from the
v1.39 cache, 710 s. Started after a09f109 and before e8974bb, so S5N / S5R are
still v1.39 and the `smd_from_p` route had nothing to read. 137 ok / 1 skipped
(no text) / 1 partial. **Strength B+, Moderate**, k = 12, +0.22 [+0.04, +0.41],
NOT TESTABLE (coverage 44 %, 6/6 overlaps); **lean mass D, Moderate**, k = 11,
+0.18 [-0.05, +0.40], PASS (69 %, width x0.9, 2/2); power I, k = 10. This is
the offline re-pool's result from the item-5 decision.

Item 7 across 138 studies: 1 (problem) 21, 0 54, null 63. Both Moderate letters
clear the risk-of-bias rule (≥ 50 % of the weight with no reported flaw) by a
small margin: strength 52.7 %, lean mass 50.6 %. Of strength's 4 "concerns"
trials, `doi:103390nu12061880` carries 28 % of the weight on item 7 = 1 alone,
so one more small trial flagged would drop strength to C+ (Low). It goes in the
spot audit.

The failed call is the usual S5N on `doi:101002acr22747` (rheumatoid arthritis
patients). Attempts 0 and 1 broke the schema with `se = 0` (schema: > 0);
attempt 2 returned `numbers` as a JSON string. It does not touch any grade: S3
reads `health_status: disease`, which is `different` from the healthy-adult
target, so the trial is refused as off-target anyway. It would matter for a
future disease-population grade. Also found: `tests/test_universal_negative_repair.py`
writes fake S8 failure files into the real `out/claude_failures/`.

## 2026-10-25 — p-value route, pass rules, display (founder)

Founder: decision 1 "make the change now", audit and stability pass rules
accepted, grade card shows the main letter. Built `effect_size._smd_from_p`
(route `smd_from_p`, `pool.ROUTE_RANK` 6, last): exact p + arm sizes + favoured
arm from a test S5N names `two_group_endpoint` / `two_group_change` (new
`p_test` field in S5N and S5R schemas; S5N, S5R v1.40 in AGENT_PROMPT_VERSION);
p -> t (n1 + n2 - 2 df) -> d -> Hedges' g, `sampling_variance_g`. Refused:
another or unstated test, crossover, unknown sign. `review.ROUTE_FIELDS` adds the
route, `p_test` joins MUST_CONFIRM. `evidence_v2` outcomes carry `sensitivity`
(estimate and letter without the route) when it is used.
tests/test_smd_from_p.py pins a hand-computed value (n = 20 + 20, p = 0.05:
g = 0.627). Next extraction re-runs S4, S5N and S5R only (about 400 calls).

## 2026-10-25 — decisions: attrition split (S4 v1.40), per-agent prompt versions

Founder: item 5 option "b plus c", and per-agent versions. `pool.rob_status`:
item 5 = 0 is "unclear"; item 7 (new, `item7_attrition_problem`) = 1 is
"concerns". S4 prompt and schema gain item 7 and item 5 becomes reporting-only;
`AGENT_PROMPT_VERSION = {"S4": "v1.40"}`, `prompt_version(agent)` in the cache key
and provenance; the invariant-3 hook accepts either bump. Unbumped agents keep
their keys, so the v1.39 cache still serves S3, S5-S8 (tests/test_agent_prompt_version.py).
Offline re-pool of 20261023_190836 under the rule (no item 7 in that run):
strength B+ Moderate, lean mass D Moderate, power I. Also found: the TS-parity
golden generator still built the pre-v1.37 top-level S7 shape, so regenerating
it silently dropped form and dose; fixed to arm rows, goldens byte-identical.

## 2026-10-25 — v1.39 creatine run 20261023_190836

Full re-extraction under v1.39 (S4 item 1, S5 splitting and naming, S6B example),
three sittings over 2026-10-20..23 (quota pauses; founder stop at 97/139 and
resume). 138/139 (1 no text; the usual S5N failure on `doi:101002acr22747`).
**Strength C+, Low**, k = 12, +0.22 [+0.04, +0.41], coverage 44 % (not testable,
6/6 overlaps); **lean mass D+, Low**, k = 11, +0.18 [-0.05, +0.40], PASS (69 %,
width x0.9); power I, k = 10. The S5 fixes recovered the left/right and fresh-MVC
trials (`doi:1010801550278320262633251`, `doi:1010801550278320232193556`,
`doi:101111sms14629`); two others left strength.

Risk of bias is now the swing domain. Under the 2026-10-20 rule, S4 item 5 = 0
is a reported flaw ("concerns"), and 59 % of the strength weight, 95 % of lean
mass, carries one. Item 5 is 0 when ANY of dropout < 20 %, per-arm numbers or
stated reasons is missing, so "4 of 36 withdrew for personal reasons" scores the
same as 30 % dropout. Offline re-pool of `out/run_v139_extractions.json`
(reproduces the run exactly) with item 5 = 0 read as "unclear": strength **B+,
Moderate**; lean mass **D, Moderate**; power unchanged. Founder call, raised
2026-10-25. S4 run-to-run (v1.38 vs v1.39 on the same 139 papers; only item 1's
prompt changed): item 2 changed on 15 studies, item 5 on 19.

Strength across the four recent runs: +0.29, +0.17, +0.18 (replay), +0.22; the
letter flips between "small" and "meaningful" because the estimate sits on the
0.2 SD threshold (`threshold_sensitive`).

## 2026-10-20 — v1.38 re-run 20261019_235728 (S5 full text); RoB rule; S4 item 1

The re-run (S5 on the full paper, cb54488) finished 138/139 (1 no text; one S5N
call failed again on `doi:101002acr22747`). Strength went **down**: C+ (k = 12,
+0.29) → **D+** (k = 11, +0.17 [-0.04, +0.38]), coverage 57 % → 38 %, not
testable; lean mass k = 9 → 11, +0.22 [-0.06, +0.50], I, still PASS (61 %);
power I. Against 20261017_222637, strength lost 5 trials and gained 3, almost
all through how S5 split or named outcomes, not through numbers:
left / right sides the paper reports separately were merged into one claim no
number could be read for (`doi:1010801550278320262633251`,
`doi:1010801550278320232193556`); a combined "leg press and chest press" claim
replaced the two 1RMs (`doi:103390nu12061880`); MVC named "before the time
trial" was mapped to recovery (`doi:101111sms14629`); and a 1RM measured only at
baseline (to set loads), which the slice run had wrongly pooled, was correctly
dropped (`doi:103390nu16091324`). Two same-measure effects also moved through
S5N re-reads (`doi:103390nu13072303` SQ-1RM g 1.21 → 0.57). The two runs' S5
inputs differed, so this is not a clean stability measurement, but it shows the
letter is fragile to claim splitting.

Founder decisions (DECISIONS "Decided"): risk of bias downgrades only for a
reported flaw (`pool.rob_status` adds "concerns" for incomplete attrition and
baseline imbalance; `grade.RULES["rob_no_flaw_weight_ok"]` replaces
`rob_low_weight_ok`). Cache-only replay of 20261019_235728 with the rule
(`out/replay/rob_v1020`, 4 cache misses): strength **C, Moderate**, k = 12,
+0.18 [+0.04, +0.31]; lean mass and power unchanged. S4 item 1 now counts any
named randomisation tool (`PROMPT_VERSION` v1.39; 7 of 86 zeros quoted one).
Decision 2 (S4 items 3 / 4) postponed. The spot audit joins METHOD §16
(`scripts/experiments/spot_audit.py`); its first sample already shows an S4
item 2 misread (`doi:103390nu14061140`: "double-blind" with a glucose placebo
scored 0, so rated high risk). Lean-mass MCID searched: none anchor-based
exists; recommendation to keep 0.2 SD (DECISIONS open 3).

Same day, also in v1.39 (founder: "make the changes to S5"): S5 collapses a
grid only onto a value the paper prints (left / right and separate tests stay
separate claims; a composite only when printed, and then with its parts), drops
baseline-only measures, and names the test, not its place in the session; S6B
gains the "fresh MVC before a time trial is muscle_strength" example. S5's
prompt + schema is 11,392 chars; it is in `FULL_TEXT_AGENTS`, so it still gets
the whole paper.

## 2026-10-18 — v1.38 creatine run 20261017_222637; S5 text-trim bug found

The run finished 138/139 studies (1 skipped for no text, 1 study with one failed
S5N call, `doi:101002acr22747`), ~3.6 h with 130 quota requeues. Benchmark:
**strength k = 12, C+** (+0.29 [+0.07, +0.50]) and **lean mass k = 9, D+**
(+0.17 [-0.14, +0.47]) both **PASS** (coverage 57 % / 69 %, 6/6 and 2/2
overlaps). Against the v1.36 replay: strength 10 → 12 (gained 4, including 2
of the 3 trials refused for the S5N SD gap; lost 2), lean mass 11 → 9 (lost 2),
power 10 → 12.

Every lost trial traces to one bug that v1.37 introduced: shortening the S5
prompt brought its prompt + schema to 9,775 chars, under the 12,000-char
`PROMPT_BUDGET_CHARS`, so `_fit_text` started trimming. S5 got 2,225 chars of
paper plus the tables, where v1.36 had sent the whole paper only because its
prompt exceeded the budget. It then missed outcomes it had listed before (hack
squat and bench 1RM in `doi:101249mss0000000000003202`, LBM in
`doi:10124901mss000024700232589ef`, muscle mass in `doi:103390nu12010193`, every
claim in `doi:1015191533428720030170026csaieo20co2`). Fix: S5 joins S4 in
`worker_payload.FULL_TEXT_AGENTS`; the selftest pins it. These grades are
therefore not the v1.38 baseline. A re-run re-extracts S5 (the payload is in the
cache key) and whatever follows from its claims; S3, S4, S7 and S8 are served
from cache.

S4 items 3 / 4 / 6 (open decision 2) across the 22 trials pooled for strength,
lean mass or power: item 4 is null in 22/22, item 3 null in 21/22 (1 yes), item 6
null 16, no 5, yes 1.

## 2026-10-17 — v1.38 run stopped: weekly limit not recognised as a quota hit

The first full v1.38 creatine run was stopped by the founder after ~900
failed calls (every agent, ~150 of 154 studies). Cause: the subscription's
weekly limit ("You've hit your weekly limit · resets 6am", api_error
`usage_limit_reached`) matched none of the quota strings, so each call was
retried 3x and the corpus loop never paused or requeued; 21 failed S6B calls
also left no trace and silently discarded their studies' claims. Fixes:
`worker_quota._quota_signal` is the one limit detector (adds "weekly limit",
`usage_limit`, any "<period> limit") and `claude_adapter._is_fatal` uses it;
a failed S6B is a recorded failure and a quota hit; `run_pipeline.py` logs
line-buffered. Failed calls are never cached, so nothing from the stopped run
needs cleaning; the re-run resumes from the smoke run's cache.

## 2026-10-17 — v1.37 smoke test: S5 schema failures fixed (PROMPT_VERSION v1.38)

A 2-study live smoke run of v1.37 lost S5 on one study (`isrctn68542582`,
PLA / GAA / GAA + CrM) to `max_turns` on all 3 attempts: twice the claims
array arrived as `{"claims": {"claims": [...]}}` (S5N did the same once and
passed on retry), once a claim carried an invented `control_arm_note`. Fixes:
`claude_adapter._recover_max_turns_wrapper` now flattens that exact redundant
container for any one array field (it did so only for S7 `arms`), then
schema-checks in full; S5 names its seven fields and forbids any other
(v1.38). The smoke run's report files were not kept.

## 2026-10-17 — coverage: what it counts; no abstracts, no outside sources

Branch `v2/coverage-decision`, merged into `Jans_attempt`. Docs only.

- Correction: benchmark coverage (`benchmark.coverage`) is pooled / (pooled +
  data-reason refusals) among trials the run READ. Abstract-only trials were
  never in it; DECISIONS item 4 and METHOD §16 had implied they lowered it.
- Count (replayed v1.36 run): strength 10 / 24 = 42 % — refused 7 figure-only,
  4 arm values without an SD, 2 incomplete statistics, 1 not a placebo
  contrast (12 more out of scope). 3 of the 4 no-SD trials are the S5N gap
  v1.37 targets; if they pool, 13 / 24 = 54 % (testable). Power 10 / 30 = 33 %
  (13 figure-only). Lean mass 11 / 17 = 65 %.
- Founder decision: no abstract-only extraction and no outside sources; the
  coverage rule stays.

## 2026-10-16 — v2 work item 10: extraction prompts trimmed (PROMPT_VERSION v1.37)

Branch `v2/prompt-cleanup`, merged into `Jans_attempt`. Takes effect at the
next extraction run (the bump re-extracts everything).

- **S5** (`s5_conclusion` → `s5_outcomes`) lists outcomes only: outcome,
  measure, timepoint, arm pair, primary flag, span. 440 → 108 lines. Its
  numbers fed no pooled effect in the replayed v1.36 run (S5N read 381 of 386
  mapped claims; the other 5 made no effect), so S5N is now the only number
  reader: `SP_NUMBERS_EXTRACTOR` and the S5 fallback are gone, and a claim S5N
  did not read is refused as "numbers not read (S5N call failed; re-run)".
- **S5N / S5R**: endpoint means are the post values, with the SD printed
  beside them. Measured on the v1.36 run: 35 claims had post_* filled and
  mean_* / sd_* empty (12 refused for it).
- **S3** drops `self_declared_underpowered` (and `eligibility._ineligible`
  its v14 refusal), `intervention_text`, `is_control` and the top-level
  `deficiency_status`; **S7** is arm rows only (the legacy top-level path in
  `dose._s7_for_claim` / `pool.study_form` removed); **S4** drops
  `unverifiable_items`, **S6B** `confidence`, **S8** two false v14 claims; the
  `extraction_version` contract tag is gone.
- Extraction prompts 1 091 → 739 lines. Also fixed: the stability experiment
  pointed at the deleted v14 run and compared S5 fields that no longer exist;
  `paper-verifier` asked the dropped underpowered question.
- **Verified:** re-pooling the dumped v1.36 extractions (`out/replay/step2`)
  with the new code gives a byte-identical `evidence_v2` block. Invariants,
  selftest, 167 Python tests, the prompt vitest pass.
- New open decision: S4 items 3, 4, 6 are extracted but unused (DECISIONS).

## 2026-10-16 — v2: MCIDs per ingredient; p-value effects deferred

Branch `v2/decisions-mcid-pvalue`, merged into `Jans_attempt`. Docs only.

- **MCIDs** (decided): sourced per ingredient as it is added, founder-approved;
  the flagged 0.2 SD default stands until then; natural-unit values keep their
  unit. First: vitamin C (METHOD §14, DECISIONS).
- **Effects from an exact p-value**: deferred by the founder; the dilemma
  (5 creatine pairs, pros/cons, recommendation "not now") is written out as
  open decision 1 in `docs/DECISIONS.md`.
- METHOD §8's population note updated to the 2026-10-16 decision.

## 2026-10-16 — v2 step 2: founder decisions on imprecision, populations, second reviewer

Branch `v2/step2-decisions`, merged into `Jans_attempt`.

- **Imprecision** (decision, work item 1): `grade.RULES` gains
  `ois_very_serious` = 200 (−2) and `ois_extremely_serious` = 100 (−3, GRADE
  2021 "extremely serious"). Replayed creatine run: muscle soreness and sleep
  quality (one 14-participant trial each) A → I; cognitive function, sleep
  duration, sleep onset Low → Very low (already I); no estimate or k changed.
  TS goldens regenerated (`scripts/golden_grade_v2.py`), parity tests pass.
- **Populations** (work item 5): keep excluding off-target populations for a
  healthy-adult product; separate population grades later.
- **Second reviewer** (work item 7): S5R on by default (`SP_SECOND_REVIEWER=0`
  turns it off); the run context records `second_reviewer`. The cache replay
  defaults it off, because runs before today did not have it.
- Open decisions are now: MCIDs for the remaining outcomes, effects from an
  exact p-value.

## 2026-10-16 — v2 step 1 (offline): items 2, 3, 6

Branch `v2/step1-offline`, merged into `Jans_attempt`. No model calls.

- **Item 2 (fetch failures):** `fulltext.fetch_xml` retries transport errors,
  429 and 5xx; a cited table that still cannot be fetched marks its claims
  `table_fetch_failed`, the pool refusal says so, and the run writes no report
  until a re-run fetches it (exit 3, like the usage-limit guard). While
  measuring item 3, 7 of 39 papers failed to fetch on the first try even with
  retries — the failure is common, not rare.
- **Item 3 (largest refusal), measured on the replayed v1.36 creatine run:**
  of 64 "no verified effect estimate and incomplete arm statistics": 40 have
  no outcome values in the text the reader got (20 checked to be figure- or
  text-only, 11 from non-PMC PDF/HTML copies, 7 unfetchable now, 1 in a
  table the reader missed), 12 post values without an SD, 5 only a p-value,
  5 numbers not verified. The span check now reads tables whose outcome label
  is a section-header row with one row per group underneath (4 trials
  recovered: strength k 9 → 10, power 9 → 10, lean mass 10 → 11, endurance
  1 → 2; letters unchanged; benchmark coverage strength 38 → 42 %, lean mass
  59 → 65 %, still PASS). The refusal now names the specific gap
  (`pool.unpoolable_detail`).
- **Item 6 (v14 claim-arm check):** not ported. It would refuse 9 of 49
  pooled effects, all valid between-arm contrasts computed from both arms'
  statistics; its objections concern the reported test. 6 of the 9 point
  against creatine, so porting it would bias grades upward.
- New open decision 5 (effects from an exact p-value). Item 10 now includes
  S5N leaving the SD empty for endpoint / post values.
- Gates: invariants, selftest, 166 Python tests; cache-only replay used as
  the regression check (baselines under `out/replay/`).

## 2026-10-15 — simplification: systematic reviews no longer retrieved; merged into Jans_attempt

Branch `simplify/no-sr-retrieval` (on `simplify/css`), then the whole
`simplify/*` chain fast-forwarded into `Jans_attempt`.

- Retrieval stopped searching for systematic reviews (up to 200 per
  ingredient, classified, deduplicated, publisher-looked-up and stored, but
  read by nothing since S2 was removed). A review record the trial search
  returns is now dropped after classification. Removed with it:
  `europepmc.hit_count` (unused), the review mode of `europepmc._query`,
  `SP_RETRIEVE_MAX_SYNTHESES`. If forest-plot reading is built later, it gets a
  targeted fetch of its own.
- Verified: a fresh retrieval of creatine (intervention scope) into separate
  databases before and after stores the same 390 trials with every field
  identical (only the 74 review rows are gone); the cache-only replay of the
  v1.36 run gives byte-identical `evidence_v2` and extractions. Invariants,
  selftest, 156 Python tests.
- The simplification (A–H, CSS, reviews) is complete.

## 2026-10-15 — simplification: dead CSS removed; baseline is Jans_attempt

Branch `simplify/css` (on `simplify/docs`).

- Removed every CSS rule that could no longer match (~165 class selectors left
  by the Ledger, the dashboard, the v14 dose bars and outcome tabs), 17 unused
  custom properties and the comments describing deleted rules; stylesheets
  1190 -> 722 lines. `scan-ledger-result.css` renamed `scan-result.css`.
- Verified: the computed style and box of every element in 44 page states
  (`/`, `/methodology`, 404 and every `/scan` state incl. opened details, at 390
  and 1280 px) recorded before and after — byte-identical. Typecheck, lint, 212
  vitest, knip, build, 14 Playwright / axe tests.
- Founder: work as if `origin/main` did not exist; `Jans_attempt` is the
  baseline until the big merge. Prompt clean-up (left item 4 below) moved to
  the v2 work list (`docs/DECISIONS.md` #10).

## 2026-10-15 — simplification H: docs consolidated; what is left before merging

Branch `simplify/docs` (on `simplify/app-v2-off`), not merged.

- Current docs, one per topic: `docs/METHOD.md` (new; `EVIDENCE_METHOD.md` +
  the still-valid parts of `SPEC.md`, section-numbered), `docs/PIPELINE.md`
  (rewritten), `docs/APP.md` (`SYSTEM_DESIGN.md` cut to the current app; §7 and
  §11 keep their numbers), `docs/DECISIONS.md` (`REVIEW_PENDING.md` cut to open
  v2 decisions, the v2 work list and decided items), `README.md`, `AGENTS.md`
  (its contradictory push rules reconciled: branch first, `main` deploys).
- Archived: `SPEC.md` → `history/v14-spec.md`, `ANCHORS.md` + `anchors.csv` →
  `history/v14-anchors.*` (a shopping list for v2 benchmark rows, including
  negative controls). Deleted from history: the four raw competitor briefs, the
  Ledger notes (rubric, large-effect audit, effect ladder), the launch review,
  the v14 universal-negative incident ledger + its JSON and test, the old team
  changelog (its one cited DeepSeek quirk moved into the code comments).
- Every code citation of a removed doc now points at `METHOD §N` / `APP §N` /
  `DECISIONS`; misleading v14 wording fixed in docstrings and two user-visible
  strings (site title/description, the literature-orientation disclaimer).
  `schemas/ecu.json` and `fulltext.looks_like_included_studies` (v14/SR only)
  removed; the compatibility section no longer claims an "Evidence run" basis.
  `scripts/design_shots.mjs` works again (Ledger shots removed).
- New `scripts/replay_from_cache.py` (cache-only replay + compare): confirms
  E/F/G/H left `evidence_v2` byte-identical (900 cache hits, 5 known misses).
- Corrections found while writing METHOD: the registry rule DOES downgrade
  (`registry_bias.py` docstring said it did not); the 400-participant OIS rule
  exists, but costs only one level, which is why a 14-participant trial grades A.
- Gates: invariants, selftest (178), 156 Python tests, typecheck, lint, 212
  vitest, build.

**Left before merging** (founder decisions marked):

1. **`origin/main` has moved on (founder / team).** Since the branch point
   (`d9cedc4`, 2026-09-22) `main` gained 68 commits (~52k lines: the live
   research worker, live result card, research-jobs SQL, scan-history UI,
   localisation) that `Jans_attempt` and these branches do not contain, and
   that partly build on what was removed here (the Ledger-style card,
   `research_audit` prompts, `SYSTEM_DESIGN.md`). Merging needs a decision on
   how the two lines combine before any conflict is resolved.
2. Dead CSS: ~175 class selectors no component references (`ab.css`, `scan.css`,
   `scan-ledger-result.css`, `base.css`); prune with a before/after screenshot
   comparison (`scripts/design_shots.mjs`).
3. Retrieval still fetches up to 200 systematic reviews per ingredient,
   classifies them and looks up their publishers, but nothing reads them since
   S2 was removed. Remove (replay-gated) or keep for future forest-plot work
   (founder).
4. Prompts still carry v14 wording and fields only v14 read (e.g. S5's
   direction/magnitude labels, "form arc" in `s7_form.md`). Editing them needs a
   `PROMPT_VERSION` bump = full re-extraction, so bundle it with the next
   re-extraction in the v2 work list.

## 2026-10-15 — simplification E/F/G: dashboard dropped, grading switched off in the app

Branch `simplify/app-v2-off` (on `simplify/v2-only`), not merged.

- E: `/runs` and `/runs/<id>` pages, `lib/dashboard`, the run components,
  `scripts/dashboard_artifact.py`, `schemas/dashboard_run_v1.schema.json`,
  `reports/run_statuses.json`, every `*_dashboard.json`, `archive_reports.py`
  and the v14 run `20260904_185830` deleted. Runs now write summary, full and
  context only; `benchmark_v2.py compare` and `grade-v2.ts` read `_context.json`.
  Report push is opt-in (`SP_AUTO_PUSH=1`).
- F: v14 TS ports (`scoring.ts`, `product-score.ts`, `dose-effectiveness.ts`),
  the Evidence Ledger (`lib/evidence-ledger`, its card, audits, research
  prompts/schemas), `/design-lab`, `/tests/supplements` and the grade card
  removed. `/scan` answers `not_graded` for every supported product and shows
  "Evidence grades are not active yet" on the landing screen and every result.
  The model orientation (evidence prior) now runs for every product; its dose
  reading is words only (the v14 closeness ramp is gone). `grade-v2.ts` kept,
  not connected. `/methodology` rewritten as a short "how we will grade" page.
- G: e2e routes reduced to `/`, `/scan`, `/methodology`, 404; the app CI
  workflow no longer re-runs the Python selftest and triggers on app paths
  only; `score-tracer` agent deleted, `run-triage` rewritten for v2; unused
  deps (marked, sanitize-html, zod, @testing-library/dom) removed; vocab dose
  conversion re-pinned to Python goldens (`golden_vocab_parity.json`).
- Gates: invariants, selftest, 157 Python tests, typecheck, lint, 212 vitest,
  knip clean, production build (8 routes, was 226), 14 Playwright/axe tests.

## 2026-10-15 — simplification: evidence method v2 only

Founder decision: commit to v2; retire v14. Branches `simplify/a-dead-weight`
(section A) and `simplify/v2-only` (B–D), not merged to `main`.

- A: 7 closed history docs (audits, demo plan, handoff, design notes) and the
  dead `oa.referenced_dois` alias deleted.
- v14 recorded in `docs/history/v14-scoring-model.md`; local tag `v14-final`
  (`967f997`) holds the last tree with v14 intact.
- Removed: v14 scoring (`scoring`, `arcs`, `donut`, `calibration`, `preview`,
  `effect_s`, `assemble`, `product_score`, `claim_arms`; v14 dose bands), the
  SR route (`synthesis`, `synthesis_bridge`, S2, `--with-sr`), the table route
  (S1, S5T, `worker_shadow`, `effect_harvest`), per-claim S6 (S6B was the only
  path used), Grok (`grok_adapter`, `--grok`), the CLI label scorer
  (`label_adapter`, `scripts/analyze_label.py`), `--demo`, the v14 score stage,
  ECU storage tables, `rescore_run.py`, `golden_parity.py`, six v14
  experiments. `_s7_for_claim` / `study_dose` moved to `pipeline/dose.py`
  unchanged; the arm-label helpers into `eligibility.py`.
- Report: the summary now prints the v2 grade table and refusal reasons
  (it never showed v2 before); `scoring_model:` stamps `evidence-v2`.
  Invariant-4 watcher and hook now watch the v2 rules.
- Verified: a cache-only replay of the v1.36 creatine run (model calls
  blocked; 955 cache hits) gives byte-identical `evidence_v2` and extractions
  before and after the removal. Gates: invariants, selftest (179 checks), 171
  Python tests, affected vitest suites, v2 goldens unchanged.
- Found while verifying (for the v2 algorithm pass): the replay grades
  strength k = 9 C- where the stored `20261014_185045` says k = 7 I — two
  trials' table numbers failed to verify in the original run (live table fetch
  at span-check time). A single trial can earn an A (muscle soreness, sleep
  quality: k = 1). v14's claim-level arm firewall never ran in v2.

## 2026-10-13 — repo cleanup (founder-approved list)

- Deleted: 3 superseded runs (20261005_080012, 20261005_224647,
  20261012_102130; ~14 MB, in git history) + their INDEX rows;
  `pipeline_v2_demo.excalidraw`, `scripts/write_demo_diagram.py`,
  `scripts/write_demo_report.py`; `scripts/experiments/poolability.py`,
  `pool_shadow.py`, `v2_preview.py`, `sr_table_coverage.py`; the v13 shadow
  (`pipeline/v13_shadow.py`, `SP_V13_SHADOW`, its score/dashboard writers);
  `run_coverage.py`, `run_sr_inheritance.py`; `next-env.d.ts` untracked
  (gitignored). Dashboard schemas still accept an optional `v13_shadow` key
  (old artifacts carry it); `EVIDENCE_V2_RUNS_DIR` stays as a test override.
- Table route (S1 + S5T) switched OFF by default (`SP_NUMERIC_TABLES=1` turns it
  on): 277/277 v2 claims took S5N's numbers. Code kept until the v1.36 re-run
  confirms v2 is unchanged (it still writes into v14's S5 claims).
- CLAUDE.md "Current state" / "Next" rewritten (stale Phase-1 snapshot, done
  retrieval item, overtaken S7 replay item, changelog paragraph moved out).
- Gates: 193 Python tests, selftest, invariants; typecheck, lint, 506 vitest,
  knip clean.

## 2026-10-13 — fixes #1 #3 #6 #8 (v1.36); off-target populations deferred

- #1 S4 gets the FULL text (`worker_payload.FULL_TEXT_AGENTS`): it was sent a
  6,248-char head + tail and missed the methods (randomisation, blinding).
- #3 Registry: patient trials (healthyVolunteers = False) are reported as
  `off_target_population`, not unpublished (fields now requested from
  ClinicalTrials.gov). Projected on 20261013_072633: strength unpublished 6 -> 1,
  lean 10 -> 7 (vs 7 pooled: still -1). Title matching was audited and not
  automated (too noisy; NCT05109039 likely = Brooks 2023).
- #6 Audit of 88 no-effect claims: 49 no numbers read (22 PDF/HTML text, 24 no
  numeric table, ~1 real reader miss), 21 span-check rejections -- fixed the
  glued-decimal tokenizer ("PRE33.90"), clearing 8 fully + 1 partly.
- #8 S5 v1.36 reports matched add-on pairs (ingredient + X vs X) as their own
  claims. The bump invalidates every agent's cache: next run is a full
  re-extraction.
- #7 off-target populations stay excluded; recorded as open item 0b in
  REVIEW_PENDING. 193 Python tests.

## 2026-10-12 — RoB semantics and registry publication check fixed (founder)

- `pool.rob_status` reads S4's own meanings: HIGH only when blinding/placebo is
  missing; an undescribed randomisation method or incomplete attrition
  reporting is "unclear". `REVIEW_PENDING.md` #0 amended.
- Registry: a flagged "unpublished" trial that a primary (non-review,
  non-protocol) Europe PMC paper cites by NCT id counts as `published_unlinked`
  (`europepmc.publications_for_registration`; failed lookups stay counted).
  Audit of creatine strength: 5 of 11 "unpublished" had such papers.
- 190 Python tests. Re-run 20261013_072633: **strength I -> C+** (k=9,
  +0.31 [+0.06, +0.55]; 6 unpublished vs 9 pooled); power and muscular
  endurance RoB -2 -> -1; lean D+ unchanged (10 unpublished vs 7 pooled).

## 2026-10-12 — all-outcomes run (20261012_102130); review-table route measured

- Review tables (`scripts/experiments/sr_table_coverage.py`): ~8 unreadable
  trials gain real per-arm rows (6 strength, all one review); one checked row
  used the wrong comparator. Not built; at most a sensitivity estimate later.
- All-outcomes run: strength k=9, +0.31 [+0.06, +0.55] (meaningful, Very low
  -> I); lean k=7 D+; power k=8 I; 15 more outcomes, mostly k <= 3. Benchmark:
  strength precision passes, coverage 38 %. No kidney outcome in the vocab.
- Found: `pool.rob_status` misreads S4's "method not described" (0) as
  "inadequate" (high RoB). Measured impact in the measurements note.

## 2026-10-06 — intervention-scope creatine run (20261005_224647)

- 139 studies (40 new); resumed once after a memory-pressure stop. Strength
  k=7 +0.27 [-0.13, 0.67] (I), lean k=8 +0.17 (D+), power k=8 +0.05 (I).
  Benchmark: lean SMD pass; strength not testable (coverage 33 %, 2.1x).
- 40 new studies -> 15 effect claims -> ~1 pooled trial per outcome: most new
  claims are other endpoints or off-target populations. The limit is now the
  readable open-access literature (295/386 RCTs abstract-only).

## 2026-10-05 — poolability: where the trials went; two fixes

- Offline analysis of 20261005_080012 (extractions replayed from the LLM cache
  with model calls blocked): 134 mapped claims -> 57 effects -> 33 trial-outcome
  pairs -> 17 pooled. Losses: 22 claims with no printed numbers, 13 missing an
  arm n, 13 pairs correctly refused as combinations, 3 off-target populations.
  The corpus (99 studies) is the binding limit, not extraction.
- Founder-approved fixes: arm n from S3 (`span_check.fill_arm_n`) and claim-level
  matched add-on contrasts (`eligibility.matched_addon_claim`); v2 only.
  Strength k 6, lean k 7 (letter D), power k 7. 187 Python tests.

## 2026-10-05 — first full v2 creatine run (20261005_080012)

- 98/99 studies extracted, 0 partial failures, ~18 h (usage-limit pauses);
  crash in `_agent_stats` on S5N's list `_meta` fixed (4d81a7d), re-run from
  cache. Auto-report pushed to `origin/Jans_attempt` only.
- v2: strength k=5 g=+0.17 [-0.43, 0.77], lean k=5 +0.04, power k=5 -0.04,
  endurance k=2 -0.14; every letter I. 17/17 pooled trials reviewer-agreed.
  Benchmark: lean SMD pass; strength not testable (coverage 38 %, width 3.1x).
  Details: measurements note, "First full v2 creatine run".

## 2026-10-04 — benchmark pass rule; creatine v2 re-extraction started

- Founder decisions recorded in `docs/REVIEW_PENDING.md` #0: branch only,
  benchmark pass rule (coverage ≥ 50 %, CI width ≤ 2× median published, overlap
  > half; else not testable), same scope as 20260904_185830, reviewer
  disagreements excluded.
- `pipeline/benchmark.verdicts` + `RULES`, verdict block in
  `scripts/benchmark_v2.py compare`; 5 new tests (175 Python tests).
- First full-run attempt stopped by Claude Code under memory pressure (PDF
  stage, no model calls, nothing written). Added: incomplete-run guard (a run
  still carrying usage-limit failures after the 8 h pause budget stops before
  scoring, exit 3, no report) and `out/checkpoints/<ingredient>_<form>.json`
  (per-study progress, rewritten after each study). Resume = same command
  (cache). `docs/PIPELINE.md` Step 3; `tests/test_run_checkpoint.py`
  (179 Python tests).

## 2026-10-03 — S7 max_turns fixed; v2 benchmark (step 3); effect_unit (v1.35)

- S7 `max_turns`: optional arm `confidence` / `salt_family`; S5 `effect_unit`
  cap 60 (loosen-only, no bump). Verified by RSMOKE6 `--resume`.
- Benchmark: `vocab/benchmarks.json` (19 rows, 10 meta-analyses, verbatim
  quotes), `pipeline/benchmark.py` (offline, like-for-like CI overlap),
  `scripts/benchmark_v2.py verify|compare`, `tests/test_benchmark.py`.
  `verify`: 19/19. The 2026-08-11 PUBLISHED table had 3 misattributed rows
  (10.3390/nu17020238, no meta-analysis); excluded and annotated.
- v1.35: S5N / S5R `effect_unit` = unit only (RSMOKE6 wrote measure names).
  RSMOKE7: 0 failed agents, units clean; an endpoint arm's mean is now read
  from its verified post value when only `post_*` is filled (FFM claim).
- Gates: invariants, selftest, 170 Python tests.

## 2026-10-03 — S5N per-claim numbers extractor (v1.32-v1.34)

- New agent S5N (`prompts/s5_numbers.md`, `schemas/s5_numbers.json`, tier B
  Sonnet): reviewer 1 for v2 numbers on every mapped claim, chunked 8 per call
  (`SP_S5N_CHUNK`), blind to S5's numbers and estimand; picks the estimand the
  paper prints in full. `pipeline/review.numbers_claim` replaces S5's numbers
  (never mixes); pool / reviewer read `numbers_v2.claim`. Fallback to S5's
  numbers (`reader: "S5"`) on omission or failure. On by default,
  `SP_NUMBERS_EXTRACTOR=0` off. S5R refuses S5N's model too.
- Verified: invariants, selftest, 138 Python tests (12 new in
  `tests/test_numbers_extractor.py`).
- Smoke RSMOKE4: 0/12 effects, but S5N's readings are correct; the losses are
  arm-per-row span coverage and per-arm SE / CI instead of SD. Measurements
  note, "S5N numbers extractor smoke test".
- v1.33: both arm rows quoted, single row label; per-arm SE / CI fields in
  S5N and S5R; deterministic SD derivation (Cochrane §6.5.2.2,
  `arm_stats_derived`, flagged, ranked after printed SDs). 147 Python tests.
- Smoke RSMOKE5: **7/11 effects, reviewer agreed on all 7**; the other 4 are
  correct refusals. Two open validity issues (swapped table cells; endpoint
  values under baseline imbalance) -- measurements note, "RSMOKE5".
- v1.34 (founder): printed-table consistency guard (change must equal post −
  pre; refuses) and baseline imbalance (endpoint gap > effect -> flag + RoB
  capped at "unclear"; downgrades, never refuses). Readers copy `pre_*` /
  `post_*`. 157 Python tests. RSMOKE6: the swapped DJ/CMJ cells are refused,
  FFM flagged; 5/13 effects, all agreed; 2 S7 `max_turns`.
- S7 `max_turns` root cause: arms carried the top-level `confidence` /
  `salt_family` (the prompt asks for them; the arm schema refused them) -- 6 of
  the 7 S7 failures across A, B and the smokes. Arm items now accept both,
  optional; S5 `effect_unit` cap 40 -> 60 (its one failure). Loosen-only, so no
  `PROMPT_VERSION` bump (headroom precedent). Verified: RSMOKE6 `--resume`
  re-ran the 2 failed S7 calls, 0 failures, every arm carries both fields.

## 2026-10-03 — dose rule relaxed; reviewer fixed; re-extraction held back

- Founder: dose indirectness only for `below_50` / `above_200`
  (`grade.OFF_DOSE`, TS `OFF_DOSE`, goldens regenerated).
- Second reviewer made route-aware (`review.ROUTE_FIELDS`, `MUST_CONFIRM`),
  sent only effect-making claims, told the estimand and what `found` means
  (v1.30). S5 told to copy arm values, never compute them (v1.31).
- Three smoke runs (14 studies, ~150 calls): 0 of 13 mapped claims made an
  effect after the fixes, so the full creatine re-extraction was NOT started.
  Details and the proposed per-claim numbers extractor:
  `2026-10-03-phase1-measurements.md` "Pre-re-extraction smoke tests".

## 2026-10-03 — v2 end to end: S5 claim rule (v1.29), run stage, app port, grade card

- **S5 unit** is one claim per separately reported measure (grids still
  collapse; whole-body lean mass first); `_shared.md` forbids undefined
  properties. `PROMPT_VERSION` v1.28 -> v1.29 (cache invalidated; the creatine
  re-extraction needed it anyway). Pool picks one claim per trial by a fixed
  `measure_hierarchy` (vocab/outcome.json) before primary/route/order: on the
  A/B pair, same-endpoint effects now agree 7/7 with max difference 0.0.
- **Run stage** `bsproof/run/evidence.py` -> `pipeline/evidence_v2.py`: pool +
  GRADE + registry check, stored as `evidence_v2` in the context and dashboard
  artifact (JSON schema + zod both declare it). `grade.py` split into
  `base_domains` (stored) + `indirectness` (per product); Python's own letter is
  composed from the same halves (`grade_record` / `letter_from_record`).
- **App** `lib/analyze/grade-v2.ts`: re-matches stored trials to the scanned
  form and ELEMENTAL daily dose; one run grades every form of the ingredient.
  Pinned to Python by `tests/golden_grade_v2.json` (`scripts/golden_grade_v2.py`,
  7 products, letters A/B/D-/F/I). Scan responses carry `evidence_v2`.
- **UI** `components/scan/grade-card.tsx`: letter per outcome, every downgrade
  with its reason; replaces the Ledger card only when a run carries the block.
  Dev preview: `scripts/experiments/v2_preview.py` + `EVIDENCE_V2_RUNS_DIR`
  (ignored in production).
- Found by the scan test: 5 g monohydrate = ~4.4 g creatine, which is
  `low_50_99` against 5 g trials and so counts as off-dose (one level). Raised
  in `docs/REVIEW_PENDING.md` #0.
- Gates: invariants, selftest, 123 Python tests, 506 vitest, typecheck, lint,
  production build. Playwright not run.

## 2026-10-03 — founder decisions on REVIEW_PENDING #0; run B resumed

- Founder accepted the GRADE thresholds, both policy choices and the MCID table
  "for now, may revisit" (`vocab/outcome.json` `"approved": true`); reviewer =
  Opus, 1 % tolerance; registry rule implemented: −1 publication bias when
  registered-unpublished ≥ pooled trials (`grade.RULES["registry_unpublished_ratio"]`,
  never stacked on Egger).
- `extraction_stability.py run --resume` now redoes studies with failed agents
  (successful agents replay from the run's own cache) and stops at the first
  quota hit instead of recording quota failures. Run B's first pass is kept as
  `out/stability/B_firstpass.json` / `cache_B_firstpass.sqlite`.
- **Run B completed** (18 studies, 342 s, no quota hit). Methods facts
  reproduce well (kappa 0.5–1.0); same-endpoint numbers are identical across
  runs; the instability is which endpoints become poolable (claim splitting,
  endpoint choice, S3 failure cascade). Full numbers:
  `2026-10-03-phase1-measurements.md` "Phase 1b result".

## 2026-10-03 — v2: second reviewer, MCID proposal, crossover, dose, registry (shadow)

- **Second reviewer** (`pipeline/review.py`, agent `S5R`, tier `R` =
  `claude-opus-5`, `SP_MODEL_R`): one call per study re-reads every mapped claim
  with span-verified numbers, blind to S5's numbers. Deterministic rule: any
  conflict refuses the claim for human adjudication (`review_v2.adjudication`);
  unconfirmed numbers are dropped; never averaged. `call()` refuses a reviewer
  model equal to S5's. Off by default (`SP_SECOND_REVIEWER=1`); no model calls
  were made. New prompt/schema `s5_review`; `PROMPT_VERSION` NOT bumped (a new
  agent has its own cache keys; bumping would invalidate ~1000 extractions).
- **MCIDs proposed**, unapproved, in `vocab/outcome.json`: performance outcomes
  0.2 SD (Hopkins 2004, quoted), lean mass 0.2 SD convention (Europe PMC search
  found no healthy-adult MCID); grip 5.0–6.5 kg (Bohannon 2019) recorded for
  sensitivity. `grade()` uses a value only when `"approved": true`.
- **Crossover** (`effect_size.py`): arm stats as if parallel (Cochrane §23.2.6),
  paired MD+CI kept, crossover SMD refused; pool counts crossover n once.
- **Dose indirectness** (`grade.py`, `pool.dose_match_tier`): SPEC §8 tiers
  against each trial's dose, −1 when > 50 % of the weight is off-dose.
- **Registry** (`sources/clinicaltrials.search_completed`,
  `pipeline/registry_bias.py`, `pool_shadow.py --registry`): measured on
  creatine — 207 completed hits, 112 name creatine as an intervention; possibly
  unpublished (upper bound): strength 16/21, power 6/7, lean mass 19/25,
  endurance 7/10. Reported, not downgraded (founder call).
- Gates: invariants ok, selftest ALL PASSED, 117 Python tests.

## 2026-10-03 — evidence method v2: GRADE certainty + letter grades (shadow)

`pipeline/grade.py`: GRADE certainty per outcome (start High for RCTs, Low
otherwise; downgrades for risk of bias, inconsistency, imprecision incl. the 400-
participant information size, indirectness by product form, publication bias via
Egger at ≥ 10 trials; each with its reason; domains it cannot assess are listed),
§4 benefit categories plus "inconclusive" → I, the founder-approved letter table,
re-grading at M/2 and 2M with a threshold-sensitivity flag, MCID read from
`vocab/outcome.json` (`mcid`) else 0.2 SD flagged. `pipeline/pool.py` now carries
n, risk of bias (`rob_status` from S4), the tested arm's form (`study_form` —
S7's top-level form is usually null since v1.24, found on run A) and population
tier per study. Run A: every outcome grades I (sparse, high-risk, imprecise) —
the honest result for that sample. Thresholds listed for founder review in
`docs/REVIEW_PENDING.md` #0. Tests: `tests/test_grade.py` (16), `tests/test_pool.py` (7).

## 2026-10-03 — `max_turns` failures diagnosed and fixed; v2 shadow pooling

- **Diagnosis:** unrecovered `max_turns` failures were free-text fields slightly
  over their schema `maxLength` (captured on S1 `rationale`, S7 arm
  `evidence_span`), not a transport wrapper. Fix: free-text limits raised ~1.5–2x
  in six S-schemas, identifier fields unchanged, prompts unchanged, no
  `PROMPT_VERSION` bump (looser limits cannot stale a cache; reasoning beside the
  constant). Adapter records `failure_shape` + raw stream for every unrecovered
  failure. Test: `tests/test_schema_headroom.py`.
- **Shadow pooling** `pipeline/pool.py`: per outcome, v2 eligibility (scope
  refusals minus the underpowered one), stored population policy, one effect per
  study (primary first, then route rank), REML + Hartung–Knapp (k ≥ 3), single
  study not pooled, natural-unit pool only for one shared unit, estimand mix and
  leave-one-out reported, every refusal counted. Tests `tests/test_pool.py`;
  report `scripts/experiments/pool_shadow.py`. On run A (25 studies): muscle power
  k=2, g = +0.28 [−0.37, +0.94]; strength k=0 (4 off-target populations,
  2 combinations, 3 unverified). Not a production score.
- Stability run B hit the session limit; comparison invalid, rerun pending.

## 2026-10-03 — evidence method v2, Phase 2 step 1: span check + effect sizes

Found first: the S5 schema already requires per-arm n / mean / SD / SE, CI
level, estimand and table provenance (the v1.24 contract), and the switched-off
v13 shadow path already had a conservative table route (deterministic
candidates + S5T selector + cell-for-cell validation). No prompt changed, so no
`PROMPT_VERSION` bump.

- `pipeline/span_check.py`: every numeric claim field must be printed in the
  claim's quote, in its cited table row (arm-per-row tables checked per arm), or
  — for n only — in the matching S3 arm; otherwise refused. Handles Unicode
  minus, en-dash ranges, decimal commas after 0, printed precision; a sign that
  only came from words is flagged.
- `pipeline/effect_size.py`: verified numbers → benefit-positive effect + variance
  via ranked routes (arm_stats → Hedges' g + mean difference; reported SMD + CI /
  exact p / n; reported MD + CI). Refuses non-parallel designs, ratios and
  relative percents, "favours neither", unoriented outcomes, % arm values.
- `bsproof/workers.py`: table route ON by default (`SP_NUMERIC_TABLES=0` turns it
  off); `numbers_v2` verification attached to every mapped outcome. v14 reads none
  of it — all v14 baselines unchanged.
- `bsproof/run/extract.py`: the per-study run record now keeps the arm-level
  fields and S3 arm sizes (it dropped them, which made Phase 1a part 1
  undercount).
- Live check on doi:10.1080/15502783.2022.2108683 caught two real defects, both
  fixed and pinned by tests: arm-per-row tables (control row never matched) and
  the decimal comma "0,001". After the fix all four jump outcomes produce
  Hedges' g from table-verified change scores (e.g. squat jump g = 0.30, hand
  re-computed).
Tests: `tests/test_effect_size.py` (16).

## 2026-10-03 — evidence method v2 adopted; Phase 1a measured

Founder decisions recorded in `docs/EVIDENCE_METHOD.md` §9 (adopted; §4 grade
table; MCID policy delegated → §5 source hierarchy + sensitivity, values still
need approval; Evidence Ledger keep-then-retire; second reviewer = a second
Claude model for now, different-vendor reviewer as future work; vitamin C next).
`REVIEW_PENDING.md` #0 resolved.

Phase 1a (`scripts/experiments/poolability.py`, no model calls): 79 of 85 PMC
full texts (93%) report arm-level mean ± SD/SEM or CIs, but current extractions
make only 10/37 strength, 4/32 power, 6/25 lean-mass and 1/19 endurance trials
poolable. Phase 1b harness `scripts/experiments/extraction_stability.py` built and
unit-tested; a 1-study live smoke already showed run-to-run differences (S7
`max_turns` failure, one direction flip). Full 25-study run pending (solo).
Details: `docs/history/2026-10-03-phase1-measurements.md`.

## 2026-10-03 — evidence method v2 proposed

`docs/EVIDENCE_METHOD.md`: a proposal to replace the v14 aggregation with a
Cochrane-style pipeline — arm-level numeric extraction with dual independent
extraction and span checks, Hedges' g / mean differences, REML random-effects
pooling with Hartung–Knapp CIs and prediction intervals (the existing
`pipeline/meta_effects.py`), GRADE certainty (form/dose/population mismatch as
indirectness), per-outcome MCIDs, and letter grades from a fixed
(benefit × certainty) table with "I" for insufficient evidence. Validation by
run-to-run agreement and benchmarking against published meta-analyses. Pointers
added to `CLAUDE.md`, `docs/SPEC.md`, `README.md`; the six founder decisions are
`docs/REVIEW_PENDING.md` #0. No code or score changed.

## 2026-10-03 — blank env vars no longer break the model call

A local `/scan` failed with "label read: could not reach the model API:
TypeError: Failed to parse URL from". `.env.local` had been copied from
`.env.example`, which lists `MODEL_API_URL=`, `LABEL_MODEL=`, `TEXT_MODEL=` with
empty values; `lib/analyze/llm.ts` read them with `??`, so "" won over the
DeepSeek default and fetch got an empty URL. Blank or whitespace values now
count as unset (`envValue()`), as the API keys already did. Pinned by
`tests/llm-env.test.ts`. No prompt, model choice or scoring changed.

## 2026-10-03 — /tester retired, run_pipeline split, dashboard legacy paths

**Retired `/tester` and `POST /api/analyze-label`** (the pre-/scan analyzer):
deleted the page, the route, `components/label-analyzer.tsx` and the
analyzer stylesheet. The run archive `/tester` carried moved to a new `/runs`
index (same content, run-page header); the run pages' "Runs" breadcrumb now
points there instead of the waitlist. The `.la-*` rules /scan still renders
moved into `app/styles/scan.css` in cascade order; dead census, hero and
tester rules were removed. E2E and unit tests retargeted to `/runs`; /tester
and /api/analyze-label are pinned as 404. Also added the missing
`prompts/literature_warnings.md` + schema to `/api/scan`'s file tracing (they
are read at request time). Verified: /scan screenshots 46/48 byte-identical,
the other two differ only in animation frames; page heights identical.

**`run_pipeline.py` 1,051 → 113 lines.** Stages moved to `bsproof/run/`
(options, corpus, extract, score, report); helpers and stage bodies moved
verbatim. Hand-rolled flag parsing → argparse (`--help` now exists; an unknown
flag is an error instead of becoming the ingredient). `tests/test_run_options.py`
keeps the old parser as an oracle over 16 argv cases. Verified: CLI edge cases
identical, wiring run identical bar network lines, all deterministic baselines,
and an offline smoke of the Claude production path with a fake adapter
(backend selection, S2–S8 calls, SR gate, report mode `claude-sr-top5-broad`).

**Dashboard legacy paths.** Measured with coverage over the real retained data.
Removed: rendering context-only runs (none remain; now quarantined with a
reason) and `scoringModelFromReport` (back-filled a scoring model from .md
reports and `reports/archive/` for pre-stamp contexts). Kept on purpose: the
context cross-check (every run still writes a context), `usageFromSpeedReport`
(the only usage source for a future Grok run) and the provider fallback.

**Found, not changed:** a TYPED creatine monohydrate 4000 mg × 1/day never gets
the retained Evidence Ledger audit — the manual path builds no `actives` list
and the exact matcher requires exactly one. Product decision.

## 2026-10-03 — effect-research version mismatch resolved

`prompts/effect_research.md` said `effect-research-v0.3` while
`EFFECT_RESEARCH_PROMPT_VERSION` and `schemas/effect_research.json` said `v0.2`
(the prompt was reworded and bumped in 46936c9 without the constant). The
output contract has not changed since v0.2, and the three retained files are
stamped v0.2 because that is what produced them. Fix, same pattern as
`research_audit`: prompt + constant → `effect-research-v0.4` (file references
repointed, no instruction changed); validator and schema accept exactly
`ACCEPTED_EFFECT_RESEARCH_VERSIONS` = v0.2 and the current version. New tests
pin that the retained file keeps v0.2, that the current version validates, that
v0.3 (never produced) is refused, and that the constant equals the version
printed in the prompt. No model call was made; no cache exists for this prompt.

## 2026-10-03 — repository cleanup, step 4: tooling, CI, dead code, structure

**Small items.** `reports/latest*.md` dropped (writers no longer create them;
`INDEX.md` header aligned with what the writers prepend). Unused e2e helpers
removed (lint is clean). Six experiment scripts moved to
`scripts/experiments/` with a README of what each measured; references updated.

**CI.** `dashboard.yml` skips docs-only pushes (`docs/**`, top-level `*.md`,
experiments, the diagram, `.claude/**` — never `prompts/` or `reports/`, which
the app reads), runs nightly and on demand, and prints a non-blocking `knip`
report. `selftest.yml` runs only on Python-relevant paths, now also runs the 48
`tests/*.py` (never run in CI before) and a non-blocking `vulture` report. With
one retained run the browser suite is 52 tests / ~25 s, so no smoke split.

**Dead code.** `knip` (pinned devDependency, `knip.json`, `npm run knip`) is
clean: removed 4 dead exports, 2 stale re-export groups, 2 duplicate catalog
aliases, an unused type and `@testing-library/user-event`; the `@emnapi` pins
are kept on purpose (clean `npm ci`). `vulture`: removed 5 dead helpers
(`_header_n`, `_value_n`, `_normal_cdf`, `_optional_float`,
`filter_ecu_rows_by_extracted_n`) and 3 dead assignments. Kept on purpose:
founder constants, dataclass fields, documented-but-unwired helpers
(`synthesis_contribution_cap`, `inherited_facts`, `harvest_serialized`,
`Store.ecus_for`). Left for a scoring-code pass: the unused parameters
`to_studies(dose_bands=)` and `score_ecu(n_unique=)` (still passed by callers).

**Large files split (moved verbatim).** `pipeline/selftest.py` → package
`pipeline/selftest/` (5 groups; 3 explicit hand-offs; the `-m pipeline.selftest`
command is unchanged). `pipeline/assemble.py` → + `claim_arms.py`,
`effect_s.py`, `eligibility.py` (re-exported). `workers.py` → `workers.py` +
`worker_payload.py`, `worker_shadow.py`, `worker_quota.py` (re-exported; the
shadow self-check now patches the two modules the table helpers are read
from). `claude_adapter.py` deliberately NOT split: one file per model boundary.

**Package.** Adapters and workers moved into `bsproof/`; entry points stay at
the root. `pipeline.invariants` now recognises `bsproof.<adapter>` imports in
every spelling (5 new evasion probes in the selftest); its allowlist, the
hooks, `verify_helpers.py` and the CI path filter follow the new paths. The
Grok preflight is now run as the module `bsproof.grok_adapter` (venv
interpreter). The LLM cache key holds no paths, so no cached extraction was
invalidated.

**Verified against a pre-change baseline:** selftest output identical except
the evasion count (8 → 13); `rescore_run --recompose` and `--verify` identical;
five offline experiment replays identical; invariants; 48 Python tests; the
shadow wiring self-check; a `--wiring` run (same output bar network/store
lines); typecheck, lint, knip, 491 unit tests, build, 52/52 Playwright.

## 2026-10-03 — repository cleanup, step 3: docs and front-end

**Docs.** Living docs are now `README.md`, `CLAUDE.md`, `docs/SPEC.md`
(method), new `docs/PIPELINE.md` (merged ARCHITECTURE + ON_MACHINE_STEPS +
GROK_CLI_SETUP), `docs/SYSTEM_DESIGN.md` (app; gained §11 design system, §12
Evidence Ledger rubric, §13 v14 backup, §14 PWA), `ANCHORS.md`,
`REVIEW_PENDING.md`. SPEC and SYSTEM_DESIGN kept their names and section
numbers because code cites them ("SPEC §13"). Dated design notes, research,
the demo plan, the Aykhan handoff, the design log and SPEC's changelog moved to
`docs/history/` (same file names). README rewritten after the intro.
`prompts/research_audit.md` → `audit-v0.5` (file references only).

**Front-end.**
- Production no longer depends on the dev-only lab: retained audits, effect
  research data and ledger logic moved to `lib/evidence-ledger/`; the lab card
  and `ab.css` to `components/evidence-ledger/`. `app/design-lab/` keeps only the
  `/ab` page and the deliberately unwired `effect.ts`; the stale 09-09 layout
  prototypes (`/design-lab`, `/design-lab/mobile`) were deleted.
- `components/scan-flow.tsx` (1,238 lines) split into `components/scan/`:
  `scan-flow.tsx` (406), `flow-state.ts` (reducer replacing 8 useStates),
  `capture-views.tsx`, `ledger-tabs.tsx`, `report-sections.tsx`,
  `primitives.tsx`, `format.ts`; the duplicated warnings JSX is one
  `WarningNotices`. Scan-only components moved alongside.
- `app/globals.css` split by surface into `app/styles/*.css`, imported in the
  original order (rule-for-rule identical, verified). CSS Modules were NOT used:
  tests pin class names (`.la-alert.la-alert-warn`, `.sc-*`, `.ab-*`) as
  contracts.
- Verified: typecheck, lint, 491 unit tests, build, both Python gates, 52/52
  Playwright (desktop + mobile), and a screenshot diff of every `/scan` state
  old vs new: 47/48 byte-identical, the 48th differs only in the fake camera's
  timestamp; page heights identical.

**Found, not fixed:** `prompts/effect_research.md` says `effect-research-v0.3`
while `EFFECT_RESEARCH_PROMPT_VERSION` and `schemas/effect_research.json` say
`v0.2`, and the prompt still cites `app/design-lab/ab/effect-contract.ts`
(now `lib/evidence-ledger/`). Left for a deliberate version decision.

## 2026-10-02 — repository cleanup, step 2

- `reports/`: 68 MB → ~2.5 MB. Kept only the current run
  `20260904_185830_creatine_creatine-monohydrate_claude-sr-ft-top5-suppl` (the
  one `/scan` and `/runs` serve). Deleted every superseded or invalid run in
  `reports/runs/` (2026-08-09 → 2026-08-25, incl. the synthetic demo run) and all
  of `reports/archive/` (scoring models v1–v13). All recoverable from git history;
  why each run was invalid is recorded in `2026-10-02-claude-md-archive.md`.
- The invalid 2026-08-07 Grok run is the dashboard test fixture: moved to
  `tests/fixtures/dashboard/` (its `run_statuses.json` entry stays, the writer
  test reads it). `run_statuses.json` otherwise keeps only the `20260825_072759`
  incident entries a test pins.
- `scripts/`: deleted 12 unreferenced files (`compare_runs`, `determinism_experiment`,
  `effect_axis_ab`, `import_predatory_xlsx`, `mixture_compare`,
  `null_numbers_experiment`, `policy_experiment`, `write_demo_artifact`,
  `watch_run.sh`, `MEETING_DEMO_RUNS.md`, `check_design_lab.mjs`,
  `check_mobile_design_lab.mjs`). Experiments cited by SPEC or pipeline comments
  were kept. `test_dashboard_artifact.py` moved to `tests/`.
- Removed `pilot_adapter.py` (superseded by `claude_adapter --safe-mode`) and
  every `--pilot` path: `run_pipeline.py --pilot` now exits with the equivalent
  production flags; `run_sr_inheritance.py` defaults to `--claude`;
  `pipeline.invariants`, the gates hook, `verify_helpers.py` and two tests updated.
  Also dropped the unused `DEFAULT_PILOT_LIMIT` / `DEFAULT_GROK_LIMIT` constants
  and the unused barrel `lib/dashboard/index.ts`. Diagram regenerated.
- Verified: invariants, selftest, 48 Python tests (`.venv`), typecheck, lint,
  491 unit tests, build, 26/26 desktop Playwright tests.

## 2026-10-02 — repository cleanup, step 1

- Deleted 13 one-off Playwright scratch scripts from the repo root
  (`netcheck*.mjs`, `e2e_*.mjs`, `abandon_draft*.mjs`; unreferenced), the stale
  `.pi/` planning notes, and the superseded `pipeline_v1.excalidraw`.
- Moved root `HANDOFF.md` (team change log, last entry 2026-08-24) to
  `docs/history/2026-08-handoff-changelog.md`; references updated.
- Deleted every image under `docs/` (135 PNG screenshots, ~39 MB) and the unused
  `public/previews/` screenshots. Doc references now point to
  `node scripts/design_shots.mjs`, which regenerates them into `/tmp`; its
  camera-fallback upload now uses `public/icon-512.png`.
- Rewrote root `CLAUDE.md` from ~1,750 lines to ~300 (rules + snapshot); the
  previous version is archived verbatim. `AGENTS.md` now points dated notes here.
- Verified: both Python gates, typecheck, lint, unit tests, build.
