# Extraction accuracy audit — creatine, run 20260811_100222 (SCORING_MODEL v6)

**2026-08-11. 22 agents, 961k tokens. Targets chosen by SCORE INFLUENCE, not at
random**: the top 16 study-outcome pairs by absolute per-study contribution
(`scoring.contributions`), which is the first audit able to do that because
per-study attribution only shipped in v6. Every claimed error was then put through
an independent adversarial agent instructed to REFUTE it and to default to
"refuted" on thin evidence. All four confirmed errors survived that pass.

Closed audit. Not a task list — the shipped fixes are in the commit that adds this
file; the ones needing a founder decision are named at the end.

---

## 1. Headline accuracy

Sixteen ECU-level extractions were audited — the top absolute score contributors from run `reports/runs/20260811_100222_creatine_creatine-monohydrate_claude-top5-per-o_*`, spanning 11 distinct studies across four outcomes. **Twelve were correct on all four axes. Four carried an error, and all four survived an independent adversarial pass** (every `refuted: false`, each verifier re-reading the primary source or the DB record rather than the auditor's quotes). Zero were returned unverifiable.

That last number is misleading and the audit's most important structural fact: **only 2 of 16 rows were checked against full text; 14 were checked against the abstract only. Both full-text reads found a confirmed error (2/2). The abstract-only reads found errors in 2 of 14.** The plausible reading is not that extraction is 88% accurate — it is that abstract-only verification cannot see the class of error full text exposes. Treat 4/16 as a floor, not an estimate.

## 2. Errors by class

**Direction — 1 confirmed.** `doi:101007s1260300901248`, `muscle_strength`, recorded `benefit` (`s = 0.3`), actually `null_effect`. A four-arm trial (placebo / creatine-alone / protein / creatine+protein) in middle-aged and older men. Results: *"Significant trial effects (p<0.01), but no significant group effects were noted for each muscular strength variable. Only one group X trial interaction (knee extension, p<0.05) was determined... The two Pr supplemented groups (RTPr and RTCrPr) had significantly larger increases than the other two groups."* The creatine-only arm tracked placebo (~50% knee-extension gain vs ~75% for the protein arms). Conclusion: *"significantly increased muscular strength and added muscle mass with no additional benefits from creatine and/or protein supplementation."* The extractor read a **within-group pre/post training effect shared by all four arms, including placebo, as a creatine benefit.** The adversarial verifier read the JATS directly (`out/http_cache/jats_PMC12878941.xml`), confirmed the quotes verbatim, and separately confirmed neither invariant-7 refusal applies: there is a genuine creatine-free placebo arm, and the a priori target (10/group for power 0.80) was met at n=10–11. This is a well-run, isolated, adequately-powered null that was scored as a benefit.

**Form — 2 confirmed, opposite causes.**
- `doi:103390nu17061081`, `lean_body_mass`, recorded `unspecified`, actually `creatine_monohydrate`. The form is stated repeatedly: *"Creatine monohydrate (CrM) is considered to be one of the most effective supplements for enhancing lean body mass during resistance training"*; *"randomised to supplement with CrM (5 g/day for 13 weeks: wash-in + 12-week resistance training)"*. Verifier pulled the record independently from `out/bsproof.sqlite` (PMC11944689) and confirmed the quotes are exact and untruncated. Stated-and-missed.
- `doi:101519jsc0b013e3182a361a5`, `muscle_power`, recorded `unspecified`, actually a stated non-vocab form: *"polyethylene glycosylated creatine (PEG-creatine) supplementation (1.25 and 2.50 g·d)"*. The verifier checked `vocab/form.json` — the creatine block lists monohydrate, anhydrous, HCl, citrate, malate, nitrate, ethyl-ester, buffered, unspecified, and **no PEG variant exists** — and checked `prompts/s7*.md`, where `unspecified` is defined for text that *"names only the element... with no preparation."* PEG-creatine does not meet that definition. This is a **vocab-coverage gap silently collapsing into the same code as "form never stated."** Per invariant 8 those are opposite messages: "nobody said what form was used" vs "a different, specific form was tested."

**Outcome mapping — 1 confirmed.** `doi:1010801939021120252518408`, filed under `exercise_endurance`. The endpoint is *"leg extension repetitions-to-failure at ~80% of pre-training 1RM"* — local muscular endurance. `vocab/outcome.json` defines `exercise_endurance` as *"Sustained submaximal or aerobic performance"*, includes `["time to exhaustion","VO2max","time trial performance"]`, excludes `["peak power","maximal strength"]`. The verifier scanned all 30 outcomes: **there is no local-muscular-endurance bucket**, so the endpoint was force-fit into the nearest construct and its −0.7 null vote now counts against aerobic endurance.

**Eligibility — 0 confirmed. This axis was not meaningfully tested; see §5.**

## 3. Score impact

Points below are each row's contribution to its outcome in the audited run. Swing figures assume contributions scale linearly in `s_i` at fixed weights — the exact numbers require re-running `score_ecu`, because `d` is a weight-normalised mean and removing a row changes the denominator.

| error | outcome | recorded points | effect of fixing |
|---|---|---:|---|
| direction flip, `s1260300901248` | muscle_strength | **+5.06** | `s` moves +0.3 → −0.7, so the row goes to roughly **−11.8**: a swing of about **−16.9**. Lowers. |
| outcome mis-map, `1939021120252518408` | exercise_endurance | **−3.15** | row leaves the outcome entirely: **+3.15**, and `n`/coverage fall. Raises `d`, lowers `c`. |
| form miscode, `nu17061081` | lean_body_mass | **−15.7** | direction unchanged, so **0.0 on the effect arc**. The largest single contributor in the audit moves from the 0.30 unspecified-transfer bucket into the matched-monohydrate bucket, so a real −0.7 lands at full weight inside your form. **Lowers the form arc, raises form coverage.** |
| form miscode, `3182a361a5` | muscle_power | **+2.8** | direction unchanged, **0.0 on the effect arc**. A benefit vote currently crediting the monohydrate form arc (the adversarial pass traced `d_share = 0.0423` into a form verdict of −0.28) should leave it. **Lowers the form arc.** |

Per-outcome totals: **muscle_strength ≈ −16.9** (the only confirmed centre-number movement, and it is against creatine). **exercise_endurance ≈ +3.15** with reduced coverage. **lean_body_mass and muscle_power: zero on the effect arc, but both form arcs move down** — one gains a full-weight null it was discounting, the other loses a benefit it was never entitled to. Both errors were flattering to creatine's form arc, and both fixes make it worse. Note that fixing the two form errors makes the arcs *less* favourable while making the score *more* honest, which is exactly what invariant 8 says the arcs are for.

## 4. Ownership and prompt fixes

**S5 (direction) — one confirmed error, and the highest-value fix.** The mechanism is a between/within confusion in a multi-arm trial. Three concrete changes: (a) state that `direction` must come from a **between-arm contrast of the ingredient-alone arm against the control arm**, and that a significant time/trial main effect with no significant group effect and no group×time interaction is `null_effect`, not `benefit`; (b) for trials with more than two arms, require the model to name which arm is ingredient-alone and which contrast the direction refers to, and to answer `null_effect` when the significant finding belongs to a different arm; (c) add a required output field carrying the contrast used, so the evidence span must be a **between-group** sentence — a within-group pre/post sentence should be schema-invalid as a direction span. Bump `PROMPT_VERSION`.

**S7 (form) — two confirmed errors, needing one prompt change and one schema change.** Prompt: instruct S7 to search title, abstract, methods and intervention description, and to treat **an abbreviation defined once and used thereafter (CrM, CM) as a statement of form** — that is what `nu17061081` failed on. Then make `unspecified` expensive: require an evidence span for it too, quoting the bare-element mention, so a null answer must be justified rather than defaulted. Schema/vocab: `unspecified` currently absorbs two different facts. Add a `form_stated_other` code plus a verbatim `form_verbatim` string so a named-but-unlisted preparation (PEG-creatine) cannot be recorded as unstated. **That bucket needs its own transfer factor, which is a new constant — SPEC §13 and `docs/REVIEW_PENDING.md` before it ships**, per invariant 4. Do not reuse the 0.30 unspecified value by default.

**S6B (outcome mapping) — one confirmed error, best fixed deterministically in vocab rather than in the prompt.** Add `muscular_endurance` to `vocab/outcome.json` with includes like `["repetitions to failure","reps at %1RM","muscular endurance","sets to failure"]`, and add the same phrases to `exercise_endurance`'s `excludes`, so the mis-map is refused by the vocab and not by the model's judgement. In the prompt, add the standing rule that **when an endpoint's construct is not covered by any outcome's `includes`, the answer is `null`, never the nearest neighbour** — the whole failure here is nearest-neighbour behaviour where invariant 5 wants a refusal. New outcome id is a vocab addition, not a constant; polarity must be set explicitly or left null.

**S3 (eligibility fields) — no error found, but no credit earned either.** See below.

## 5. What the audit could not check

- **Coverage.** Sixteen ECU rows across 11 studies and 4 outcomes, selected as top absolute contributors, out of an 80-study corpus with 19 scored outcomes. This is a top-of-influence audit, not a corpus accuracy rate, and the selection is biased toward heavy-weight rows.
- **Text depth.** 14 of 16 rows were judged from abstracts. Abstracts cannot establish RoB items, funding, exact dosing schedules, whether a placebo arm was ingredient-free, or a self-declared power failure — **precisely the fields invariant 7's three refusals depend on.** Every `should_be_refused` came back `null`; the eligibility axis was therefore not tested so much as skipped, and its 0/16 error rate carries no information.
- **One unadjudicated flag.** The audit's own evidence spans for `doi:103390nu17061081` include *"an a priori power analysis was not conducted to calculate sample size. The intended sample size of 33 per group..."* and a control that *"received no creatine or placebo."* The verdict recorded `eligibility_correct: true` without addressing whether the missing power analysis meets the `self_declared_underpowered` refusal. This is the audit's largest single negative contributor (−15.7 on lean_body_mass), so it matters. I would not act on either reading without a human full-text read — confidence well below 90%.
- **Unaudited fields that feed the score.** RoB, `size_factor`, funding, OA tier, derived dose band, and `health_status`/population match were not checked at all. Population feeds the stored variant-B exclusion, so an error there silently drops or admits whole studies.
- **No false-negative pressure.** The adversarial pass was aimed only at the four claimed errors; nobody tried to break the 12 clean verdicts. The false-negative rate of this audit is unmeasured, and given that both full-text reads found something, it is probably not low.
- **No cross-backend agreement.** Single-backend (Claude) audit, so a prompt defect cannot be distinguished from a one-off sampling flake. That separation needs the Grok agreement table on a fixed paper set, which is still item 6 on the Next list.
- **Swing arithmetic is approximate**, as noted in §3.

**Next action:** fix S5's between-arm rule first — it is the only confirmed error that moves a centre number, and it moves `muscle_strength` by roughly 17 points against creatine. Then the S6B vocab addition, which is deterministic and cheap. The S7 schema change should wait behind a SPEC §13 entry for its transfer factor. And before treating 12/16 as good news, re-run this audit with full text on all 16 rows, since the two full-text reads went 2 for 2.
