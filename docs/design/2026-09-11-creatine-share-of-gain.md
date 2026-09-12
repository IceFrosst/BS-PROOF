# Creatine: how much EXTRA strength does it add on top of training alone?

**Scope:** read-only quantitative extraction for the `Strength when you lift weights` row of
`app/design-lab/ab/audits/creatine.json`. No repo edits, no commits, no Grok/xAI.
**Retrieval:** Europe PMC REST (`/search?...&resultType=core`), Europe PMC `fullTextXML`,
PMC figure binaries, Crossref, Unpaywall, `doi.org` resolution — all via `curl` in this session.
Every number below was returned by a request I ran and whose text or image I read here.
Where I could not open something, I say so and I do not fill the gap.

**Headline answer up front:** the founder's sentence "creatine gives about two-thirds more
strength gain than training alone" is **not defensible as written**. It is a verbatim
restatement of one number — `(20 − 12) / 12 = 0.667` — from a 2003 **narrative** review I could
only reach as an abstract. When I rebuilt the same ratio from placebo-arm data I extracted
myself, the answer is **≈0.65 for upper body but ≈0.35 for lower body**, it drops to **≈0.53
(upper) after the row's own trim-and-fill correction**, it drops to **≈0.21 (upper) / 0.10–0.18
(lower)** if you use the *larger and newer* 2025 meta-analysis instead, and it is **≈0.02–0.05
for women** and **≈0.02–0.12 and not statistically significant for over-50s**. "Two-thirds" is
the single most favourable number in that whole range, from the single weakest source.

---

## 0. Access ledger (per `prompts/research_audit.md` STEP 1)

| Source | ID | Access achieved | Note |
|---|---|---|---|
| Rawson & Volek 2003 | PMID **14636102**, DOI `10.1519/1533-4287(2003)017<0822:eocsar>2.0.co;2` | **abstract only** | Not OA. See §1 for the three independent checks. |
| Wang, Qu et al. 2024 | PMID **39519498**, PMC **11547435**, DOI `10.3390/nu16213665` | **full text + Tables 1–3 + Figures 2, 4, 6, 7** | Forest plots read as images from `pmc.ncbi.nlm.nih.gov/articles/instance/11547435/bin/...` |
| Kazeminasab et al. 2025 | PMID **40944139**, PMC **12430374**, DOI `10.3390/nu17172748` | **full text** | 69 studies, 1937 participants. **Not in the row.** Newer + larger than the row's primary source. |
| Cui et al. 2025 (strength MA) | PMID **41328071**, PMC **12665265** | **full text + Table 1** | Table 1 = per-arm pre/post 1RM for 14 trials. Main source of my denominators. |
| Wang C-C 2018 | PMID **30400221**, PMC **6265971** | **full text + Table 3** | Per-arm pre/post half-squat 1RM. |
| Percário/"Sandro" 2012 | PMID **23259853**, PMC **3543170** | **full text + Tables 3, 6** | Per-arm pre/post bench 1RM. |
| Mills 2020 | PMID **32599716**, PMC **7353308** | **full text** | Per-sex chest-press pre/post in Results §3.3. |
| Arciero 2001 | PMID **11735088** | **abstract** (abstract contains per-arm pre/post kg) | |
| Volek 1999 | PMID **10449017** | **abstract** (abstract contains per-arm %) | |
| Syrotuik & Bell 2004 | PMID **15320650** | **abstract** | Only named non-responder figure. |
| Chilibeck 2017 (older adults) | PMID **29138605**, PMC **5679696** | abstract | SMD only, no kg. |
| Wang/Qu dose-response 2025 | PMID **41433021**, PMC **12777911** | abstract | **Body composition only — no strength %.** |
| Kirk 2025 (active females) | PMID **39861368**, PMC **11767391** | full text | Vote-count review. |
| Postmenopausal MA 2026 | PMID **42141930**, PMC **13182165** | abstract | |
| ISSN "Common questions" 2021 / Part II 2025 | PMC **7871530** / PMC **11703406** | full text | Responder/non-responder discussion. |
| **could_not_access** | Taylor 2011 (PMC3761853 `fullTextXML` returned **0 bytes**); LWW JSCR page for PMID 14636102 (**HTTP 403**); Semantic Scholar API (**HTTP 429**); 8 of the 23 trials in PMID 39519498 (Kelly 1998, Larson-Meyer 2000, Noonan 1998, Pearson 1999, Peeters 1999, Stout 1999, Syrotuik 2000, Arazi 2019) — **not indexed in Europe PMC at all**, no PMID, no per-arm data reachable. | | |

---

## 1. TASK 1 — What are the "20% vs 12%" figures, exactly?

**PMID 14636102 is ABSTRACT-ONLY. I could not read the paper.** Three independent checks,
all run this session:

```
doi.org  -> 302 -> http://nsca.allenpress.com/... -> 301 -> https://www.kwglobal.com/nscaonline/... -> HTTP 403
unpaywall -> is_oa False, 0 oa_locations
crossref  -> record exists, "abstract present: False", "license: None"
journals.lww.com abstract page -> HTTP 403
Europe PMC core record -> isOpenAccess N, inEPMC N, inPMC N, pmcid None
```

### What the abstract actually says (verbatim, Europe PMC `resultType=core`)

> "Although several studies have evaluated the combined effects of creatine supplementation and
> resistance training on muscle strength and weightlifting performance, **these data have not been
> analyzed collectively.** The purpose of this review is to evaluate the effects of creatine
> supplementation on muscle strength and weightlifting performance when ingested concomitant with
> resistance training. … **Of the 22 studies reviewed, the average increase in muscle strength
> (1, 3, or 10 repetition maximum [RM]) following creatine supplementation plus resistance training
> was 8% greater than the average increase in muscle strength following placebo ingestion during
> resistance training (20 vs. 12%).** Similarly, the average increase in weightlifting performance
> (maximal repetitions at a given percent of maximal strength) … was 14% greater … (26 vs. 12%).
> **The increase in bench press 1RM ranged from 3 to 45%** … Thus there is substantial evidence to
> indicate that creatine supplementation during resistance training is more effective at increasing
> muscle strength and weightlifting performance than resistance training alone, **although the
> response is highly variable.**"

### What can and cannot be established

| Question | Answer |
|---|---|
| What are 20% and 12%? | **Average percentage increase in a maximum-repetition test** (1RM **or 3RM or 10RM** — mixed), creatine+RT arm vs placebo+RT arm. |
| How were they computed? | **Not stated in the abstract.** Europe PMC `pubTypeList` = `['Review', 'Journal Article']`, and the abstract itself says the data "have not been analyzed collectively" before this review — i.e. this is a **narrative review with an unweighted arithmetic average of study-level percentages**, not a meta-analysis. There is no indication of inverse-variance weighting, random-effects modelling, heterogeneity assessment, or publication-bias testing. |
| Over what trials? | "22 studies reviewed". **The 22 are not enumerated in the abstract.** |
| Over what durations? | **Not stated in the abstract.** |
| Any confidence interval? | **No.** Neither figure carries a CI, an SD, an SE, or a p-value. |
| Any n? | **No.** No participant count anywhere in the abstract. The audit JSON already records `"n": 0`. |
| Where does "two-thirds" come from? | `(20 − 12) / 12 = 0.667`. That is the entire derivation. |

**Verdict on the source: this is the weakest possible basis for a headline number.** It is an
unweighted average of 22 heterogeneous study means, pooling three different rep-max protocols,
with no n, no CI, no weighting and no bias adjustment, from a 2003 paper that cannot be opened.
The authors' own abstract undercuts the average twice: bench 1RM ranged **3% to 45%**, and "the
response is highly variable". A single number derived from that spread and then presented as
"two-thirds" is a precision claim the source does not support.

---

## 2. TASK 2 — Placebo-arm data from PMID 39519498

### 2a. What the meta-analysis itself publishes (verbatim, PMC11547435 full text)

> "Creatine supplementation combined with resistance training resulted in greater increases in
> upper-body strength compared with a placebo, with a very high probability (**WMD = 4.43 kg,
> 95% CI [3.12,5.75], p < 0.001**) … no statistically significant heterogeneity … (p = 0.926,
> **I² = 0%**)."
> "… greater increases in maximal lower-body strength … (**WMD = 11.35 kg, 95% CI [8.44,14.25],
> p < 0.001**) … (p = 0.897, **I² = 0%**)."
> "males … (**WMD = 4.95 kg, 95% CI [3.52, 6.38]**) … females (**WMD = 1.54 kg, 95% CI [−1.81, 4.89],
> p = 0.368**). There was a **trend** for greater upper-body strength gains from creatine in males
> vs. females (**p = 0.067, Q = 3.366**)."
> lower body: males **11.68 [8.60,14.76]**; females **8.03 [−0.83,16.90], p = 0.076**; interaction
> **p = 0.446, Q = 1.056**.
> "Egger's linear regression test (**t = 2.102, p = 0.048**) … **WMD = 3.60 kg, 95% CI [2.39, 4.81]**
> after adjustment for Duval and Tweedie's trim-and-fill."

### 2b. THE CENTRAL LIMITATION — stated plainly

**PMID 39519498 does not publish placebo-arm changes or baseline 1RM for any trial.** I opened
the complete full text and every artefact attached to it:

- **Table 1** = PICOS criteria. No data.
- **Table 2** = PEDro scores. No data.
- **Table 3** = study characteristics — author, country, participants, total N, age, duration,
  sessions/week, loading dose, maintenance dose, muscle group. **No baseline 1RM. No pre/post
  values for either arm.**
- **Figures 2 and 4** (forest plots, read as images) = per-trial **difference in means** and
  p-value only. The between-group difference, not the two arms.
- **Figures 3, 5** = subgroup MDs. **Figures 6, 7** = funnel plots.
- **`<supplementary-material>` elements in the JATS: zero.** There is no data supplement.

So the answer to "extract the placebo-arm change per trial from this paper" is: **it is not in
this paper.** The review's own Methods confirm the data existed but were not printed — "the means
and standard deviations were extracted for both the pre- and post-intervention measurements for
the creatine and placebo groups", and for studies lacking them "the authors were contacted by
email". Those extracted per-arm values were never published.

**Exactly what is missing, and what would be needed:**
1. Per-trial baseline 1RM, creatine arm and placebo arm (23 trials × up to 2 regions).
2. Per-trial post 1RM or mean change, both arms, with SD.
3. Both are in the review team's extraction spreadsheet. **A data request to the corresponding
   author of `10.3390/nu16213665`, or a re-extraction from all 23 primary papers, is the only
   route to a complete table.** Eight of those 23 primaries are not in Europe PMC at all.

### 2c. What I could reconstruct, from primary sources, myself

I recovered per-arm data for **7 arms from 6 of the 23 trials**, by going to the primaries.
**Validation:** for four of them my computed creatine-minus-placebo difference reproduces the
meta-analysis's own forest-plot value **exactly**, which proves the denominators below belong to
the same numbers the meta-analysis pooled.

| Trial (ref # in PMID 39519498) | Region | n (pla) | wk | Baseline 1RM (pla) | Placebo change | Creatine change | Extra (mine) | **MD in Fig 2/4** | Ratio extra/placebo |
|---|---|---|---|---|---|---|---|---|---|
| Arciero 2001 [24] bench | upper | ~10 | 4 | 76.0 kg | **+9.50 (+12.5%)** | +13.70 (+17.8%) | +4.20 | **4.20 ✓ exact** | 0.44 |
| Kaviani 2019 [29] bench | upper | ~9 | 8 | 72.0 kg | **+7.00 (+9.7%)** | +12.00 (+16.4%) | +5.00 | **5.00 ✓ exact** | 0.71 |
| Stone 1999 [38] bench | upper | ~10 | 5 | 129.1 kg | **+5.00 (+3.9%)** | +12.40 (+10.0%) | +7.40 | **7.40 ✓ exact** | 1.48 |
| Sandro/Percário 2012 [36] bench | upper | 9 | 4.6 | 54.0 kg | **+4.00 (+7.4%)** | +9.00 (+16.7%) | +5.00 | **5.00 ✓ exact** | 1.25 |
| Volek 1999 [42] bench (% back-solved) | upper | ~9 | 12 | ≈95 kg | **+15.2 (+16.0%)** | +22.8 (+24.0%) | +7.60 | **7.60 ✓** | 0.50 |
| Mills 2020 [32] chest, **males** | upper | 6 | 6 | 181.05 kg | **−0.75 (−0.4%)** | +21.06 (+12.6%) | +21.81 | 10.26 (both sexes) | **undefined** |
| Mills 2020 [32] chest, **females** | upper | 3 | 6 | 68.03 kg | **+1.52 (+2.2%)** | +4.53 (+6.7%) | +3.01 | — | 1.98 |
| Arciero 2001 [24] leg press | lower | ~10 | 4 | 200.5 kg | **+54.50 (+27.2%)** | +70.90 (+42.3%) | +16.40 | 16.10 | 0.30 |
| Kaviani 2019 [29] leg press | lower | ~9 | 8 | 114.0 kg | **+33.00 (+28.9%)** | +47.00 (+40.9%) | +14.00 | **14.00 ✓ exact** | 0.42 |
| Stone 1999 [38] squat | lower | ~10 | 5 | 149.8 kg | **+12.40 (+8.3%)** | +17.30 (+11.6%) | +4.90 | **4.90 ✓ exact** | 0.40 |
| Wang 2018 [43] half squat | lower | ~15 | 4 | 131.67 kg | **+33.99 (+25.8%)** | +44.66 (+33.4%) | +10.67 | **10.67 ✓ exact** | 0.31 |
| Volek 1999 [42] squat (% back-solved) | lower | ~9 | 12 | ≈106 kg | **+25.5 (+24.1%)** | +34.0 (+32.0%) | +8.50 | **8.50 ✓** | 0.33 |

Sources per row: Arciero = PMID 11735088 abstract (per-arm pre/post kg printed in the abstract);
Kaviani + Stone = PMC12665265 Table 1; Sandro/Percário = PMC3543170 Table 3; Wang = PMC6265971
Table 3; Mills = PMC7353308 Results §3.3; Volek = PMID 10449017 abstract ("increases in bench
press and squat were greater in creatine (**24% and 32%**) than placebo (**16% and 24%**)"),
baseline back-solved from the forest-plot MD.

Coverage: **56 placebo participants of 433 in the upper-body pool (13%)**; **53 of 395 in the
lower-body pool (13%)**. This is a convenience subsample, not a random one — see §7 R2.

**Two structural facts this table exposes and the row currently hides:**
- **Trial-level ratios are useless.** They run 0.30 → 1.98 → undefined. Mills 2020's male placebo
  arm *lost* 0.75 kg of bench press over 6 weeks of training, which makes "extra / placebo gain"
  divide by a negative number. In the wider 14-trial set of PMC12665265 the trial-level ratio ran
  **−0.50 to +8.00** (median 0.42). Any ratio must be built from **pooled** numerator and
  denominator, never averaged across trials.
- **The denominator is dominated by trial length and starting point.** Arciero's placebo arm
  gained 27.2% of leg press in 4 weeks; Stone's gained 8.3% in 5 weeks. Divide the same 11.35 kg
  by each and you get 0.21 or 0.92.

---

## 3. TASK 3 — The increment ratio ("share of achievable gain")

**Method.** Denominator = **n-weighted pooled placebo-arm gain in kg** across the extractable
trials. Numerator = the published pooled WMD. Interval by Monte Carlo (200 000 draws):
WMD ~ Normal(point, SE from the published CI) **×** a cluster bootstrap over the placebo trials,
so the interval carries both the numerator's sampling error and the denominator's fragility.

```
UPPER BODY  denominator = 6.80 kg placebo-arm gain (mean baseline 95.2 kg -> +7.1%), k=7, n_pla=56
LOWER BODY  denominator = 32.18 kg placebo-arm gain (mean baseline 140.7 kg -> +22.9%), k=5, n_pla=53
```

| Estimate | Numerator | **Share of achievable gain** | Interval |
|---|---|---|---|
| **Upper body, headline (PMID 39519498)** | 4.43 kg | **0.65** | **0.38 – 1.41** (MC, both sources of error) · 0.46–0.85 (WMD CI only) |
| **Lower body, headline (PMID 39519498)** | 11.35 kg | **0.35** | **0.23 – 0.58** (MC) · 0.26–0.44 (WMD CI only) |

Flipped to the intuitive form: of everything you gain over ~4–12 weeks,
**≈39% of the upper-body gain and ≈26% of the lower-body gain is attributable to creatine**
on the row's current headline numbers.

**Read this carefully.** The upper-body figure 0.65 lands almost exactly on Rawson & Volek's
0.667 — but that is **coincidence at the level of precision available**, not confirmation:
- the 95% interval is **0.38 to 1.41**, i.e. anywhere from "a third more" to "more than double";
- the **lower body figure is 0.35, roughly half of it**, and legs are where most people's
  training gains actually are;
- and it collapses under §4.

**I did not fabricate a ratio, and the ratio I did compute is not the paper's.** Note plainly:
PMID 39519498 never states a ratio, a percentage gain, or a placebo-arm gain. Every ratio in this
report is **my construction**, from denominators I extracted from six primary papers, four of
which reproduce the meta-analysis's own forest-plot values exactly.

---

## 4. TASK 4 — Robustness

### 4a. Trim-and-fill (the row's own recorded correction)

> "Egger's linear regression test (t = 2.102, **p = 0.048**) … **WMD = 3.60 kg, 95% CI [2.39, 4.81]**
> after adjustment for Duval and Tweedie's trim-and-fill" — PMC11547435 §3.5.

| | Share | Interval |
|---|---|---|
| Upper body, **trim-and-fill 3.60 kg** | **0.53** | 0.35 – 0.71 |

**"Two-thirds" fails its own robustness check.** The row records the correction and then quotes
the uncorrected relative figure. On the row's own bias-adjusted number the honest phrasing is
**"about half again as much"**, not two-thirds. Lower body needs no correction: funnel symmetric,
**Egger t = 0.122, p = 0.90**.

### 4b. The bigger, newer meta-analysis the row does not cite — this is the largest single threat

**Kazeminasab et al., *Nutrients* 2025, PMID 40944139, PMC12430374, DOI 10.3390/nu17172748 —
69 studies, 1937 participants** (vs 23 studies / 509 participants for the row's primary source).
Full text read this session. Verbatim:

> "creatine supplementation combined with resistance exercise training resulted in significantly
> greater increases in bench and chest press strength [**WMD = 1.43 kg (95% CI: 0.53 to 2.34),
> p = 0.002**] … **Egger's regression test … indicated significant publication bias (p = 0.0003)**."
> "… **no significant main effect differences in leg press strength [WMD = 3.129 kg (95% CI: −0.74
> to 7.003), p = 0.11]** … Egger's … (p = 0.03)."
> "… significantly greater main effect increases in squat strength [**WMD = 5.64 kg (95% CI: 3.87
> to 7.40), p < 0.001**]".
> By age: bench younger **1.81 [0.64, 2.97]** vs older **0.85 [−0.64, 2.35], p = 0.26**; leg press
> younger **8.30 [2.72, 13.88]** vs older **1.41 [−6.23, 9.05], p = 0.71**; squat younger
> **6.46 [4.72, 8.21]** vs older **0.76 [−3.64, 5.17], p = 0.73**.
> By sex: bench females **0.15 [0.002, 0.30]** vs males **1.34 [0.006, 2.68]**; leg press females
> **2.53 [−6.42, 11.50], p = 0.57** vs males **9.79 [4.06, 15.52]**; squat females
> **1.63 [−2.54, 5.80], p = 0.44** vs males **6.43 [4.51, 8.35]**.

Applied to the same denominators:

| Source / subgroup | Upper share | Lower share |
|---|---|---|
| PMID 39519498 (row's source) | **0.65** [0.46, 0.85] | **0.35** [0.26, 0.44] |
| … trim-and-fill adjusted | **0.53** [0.35, 0.71] | (no adjustment needed) |
| **PMID 40944139, all ages** | **0.21** [0.08, 0.34] | **0.10** [−0.02, 0.22] leg press (NS) · **0.18** [0.12, 0.23] squat |
| **PMID 40944139, adults < 50** | **0.27** [0.09, 0.44] | **0.26** [0.08, 0.43] leg press · **0.20** [0.15, 0.26] squat |

**A three-fold disagreement on upper body between two meta-analyses published 10 months apart,
covering overlapping literatures.** Both report near-zero heterogeneity (I² = 0% and 15%), so
neither flags the disagreement internally. Both find significant Egger asymmetry on upper body
(p = 0.048 and p = 0.0003). This is not a resolved literature; the row's `consistency: supported`
and `precision: supported` checklist entries are not supportable once this source is on the table.

### 4c. Women

| Evidence | Verbatim | Share |
|---|---|---|
| PMID 39519498, female-only, upper | "**WMD = 1.54 kg, 95% CI [−1.81, 4.89], p = 0.368**" | **0.23** [−0.27, 0.72] |
| PMID 39519498, female-only, lower | "**WMD = 8.03 kg, 95% CI [−0.83,16.90], p = 0.076**" | **0.25** [−0.03, 0.53] |
| PMID 40944139, females, bench/chest | "**WMD = 0.15 kg (95% CI: 0.002 to 0.30), p = 0.04**" | **0.02** [0.00, 0.04] |
| PMID 40944139, females, leg press | "**WMD = 2.53 kg (95% CI: −6.42 to 11.50), p = 0.57**" | **0.08** (NS) |
| PMID 40944139, females, squat | "**WMD = 1.63 kg (95% CI: −2.54 to 5.80), p = 0.44**" | **0.05** (NS) |
| Kirk 2025, PMC11767391, active females, vote count | "**3/11 studies showed an improvement in strength/power outcomes** … most studies showed no improvement in performance compared to placebo" | — |
| Mills 2020, the only mixed-sex trial with per-sex numbers | females creatine 67.66→72.19 kg, **p = 0.203** (no significant change); placebo 68.03→69.55, p = 0.203 | 1.98, n = 3 placebo — meaningless |
| Postmenopausal, PMID 42141930 | "Leg-press 1RM (k = 3; n = 111) improved with creatine: **MD + 7.5 kg (95% CI + 2.2 to + 12.8; I² = 0%)** … Benefits were evident when **creatine ≥ 5 g·day⁻¹ was combined with RT; trials using ≤ 3 g·day⁻¹ without RT showed no measurable effect**" | positive, but ≥5 g/day + RT |

**Statistical status.** The `strongest_doubt` field in the row is correct that female-only trials
show no significant gain. **But the task brief's framing "sex interaction p=0.048" is wrong and
the repo is right:** PMC11547435 reports the sex interaction as **p = 0.067, Q = 3.366** (upper)
and **p = 0.446, Q = 1.056** (lower). **p = 0.048 is Egger's publication-bias test**, a different
thing entirely. The two must not be conflated — see §7 R1.

Therefore, per audit-v0.2, the sex difference remains **`subgroup_hypothesis_only`** on the row's
own primary source (a formal interaction test exists but is not significant), *and* the entire
female estimate rests on **40 women in 2 trials** (Ferguson 2006, Larson-Meyer 2000) plus 9 women
in Mills 2020. However, the **direction is now corroborated by a second, independent, much larger
meta-analysis** (PMID 40944139: females 0.15 kg on bench, and null on both leg lifts), which
strengthens the hypothesis considerably even though neither review's interaction test is
significant.

### 4d. Older adults

Two routes, and they disagree with the older literature:

**(i) PMID 40944139 subgroups:** every over-50 subgroup is null — bench 0.85 [−0.64, 2.35] p=0.26;
leg press 1.41 [−6.23, 9.05] p=0.71; squat 0.76 [−3.64, 5.17] p=0.73. Shares **0.02–0.12**, all NS.

**(ii) My own extraction from PMC12665265 Table 1, older-adult trials only:**

| Trial | n (pla) | Placebo change | Creatine change | Extra | Ratio |
|---|---|---|---|---|---|
| Amiri 2023 bench (68 y) | ~15 | +6.06 (+30.9%) | +14.85 | +8.79 | +1.45 ⚠ baselines 19.6 vs 32.2 kg — not comparable |
| Candow 2015 bench (>50 y) | ~13 | +1.90 (+3.9%) | +15.20 | +13.30 | +7.00 ⚠ tiny denominator |
| Candow 2020 bench (49–69 y) | ~23 | +22.00 (+23.9%) | +11.00 | **−11.00** | **−0.50** |
| Gualano 2014 bench (>60 y women) | ~15 | +1.80 (+5.8%) | +2.60 | +0.80 | +0.44 |
| **Upper, n-weighted** | 66 | **+9.83** | +10.79 | **+0.97** | **+0.10** |
| Brose 2003 leg press, men >65 | ~8 | +29.51 (+39.2%) | +22.70 | −6.81 | −0.23 |
| Brose 2003 leg press, women >65 | ~7 | +21.34 (+44.8%) | +19.07 | −2.27 | −0.11 |
| Candow 2020 squat (49–69 y) | ~23 | +76.00 (+72.4%) | +69.00 | −7.00 | −0.09 |
| Gualano 2014 leg press (>60 y women) | ~15 | +10.00 (+13.2%) | +13.90 | +3.90 | +0.39 |
| **Lower, n-weighted** | 53 | **+43.08** | +39.82 | **−3.26** | **−0.08** |

Both routes converge: **in over-50s the share of achievable gain is ~0.1 or below, and in the
trials I could open the pooled increment is actually slightly negative on lower body.** This
directly contradicts EFSA's 2016 "cause and effect established" opinion for over-55s (which the
row cites, and whose applicant was **AlzChem AG, a creatine manufacturer**) and softens
Chilibeck 2017 (PMID 29138605, SMD 0.35 / 0.24 — the row already flags that as a different
population not merged into the estimate, which is correct).

⚠ **Caveat I will not paper over:** several of these older-adult trials have severe baseline
imbalance (Amiri: 32.2 vs 19.6 kg; Candow 2020 squat placebo gained **+72% of baseline** in 12
months) that makes trial-level ratios unstable in both directions. The n-weighted pooled figures
are the defensible reading; the per-trial column is shown for transparency, not for citation.

---

## 5. TASK 5 — Newer/better sources, and the non-responder rate

### 5a. Does anything modern report percentage gain in BOTH arms directly?

**No pooled source does.** I checked every candidate:

| Candidate | Reports % gain in both arms? |
|---|---|
| **PMID 41433021** (2025 dose-response, PMC12777911) — required by brief | **No — and it is not a strength paper at all.** Outcomes are body mass, BMI, **FFM**, FM, BFP. Verbatim: "Cr supplementation significantly increased FFM (**WMD: 1.39 kg; 95% CI: 1.07,1.70**) and body mass (**WMD: 0.89 kg; 95% CI: 0.76,1.01**)". It reports a *relative* comparison for FFM only — "**approximately 0.6 kg (≈50%) greater in experienced participants**" — but that is trained vs untrained, **not creatine vs placebo**. It cannot support any strength ratio. |
| PMID 39519498 | No — WMD in kg only |
| PMID 40944139 | No — WMD in kg only |
| PMID 41328071 / PMC12665265 | **Per-arm pre/post kg for 14 trials in Table 1** — the single most useful table I found, and the source of most of my denominators. Still not a published percentage. |
| PMID 29138605 (older adults) | No — SMD only |
| PMID 42141930 (postmenopausal) | No — MD in kg |
| PMID 39861368 (active females) | No — vote count only |

**Only two individual trials print percentage gain in both arms:** Volek 1999 (bench **24% vs
16%**, squat **32% vs 24%**) and, by arithmetic on printed kg, the six trials in §2c. Volek's own
numbers give ratios of **0.50** and **0.33** — i.e. Volek 1999, one of the best-known trials in
the whole literature, does **not** reproduce 0.667 in either region.

**Conclusion: nothing published since 2003 restates the "20% vs 12%" claim in a form that would
let a consumer sentence rest on it.** Twenty-two years on, the relative framing has never been
redone with weighting, CIs or bias adjustment.

### 5b. Non-responder rate

**One named source exists, and it is very weak.** Syrotuik & Bell 2004, **PMID 15320650**
(abstract; not OA), verbatim:

> "responders (**>20 mmol·kg⁻¹ dry weight increase** in total intramuscular creatine…) versus
> nonresponders (**<10 mmol·kg⁻¹ dw increase**) to a 5-day Cr load (0.3 g·kg⁻¹·d⁻¹) **in 11
> healthy men** … there were 3 levels of response … **responders (R), quasi responders (QR), and
> nonresponders (NR)** with mean changes in resting Cr + PCr of 29.5 mmol·kg⁻¹ dw (**n = 3**),
> 14.9 mmol·kg⁻¹ dw (**n = 5**), and 5.1 mmol·kg⁻¹ dw (**n = 3**) … **Responders also showed
> improvement in 1RM leg press** … **NR … displayed no improvements in 1RM strength scores.**"

**That is 3 non-responders out of 11 men = 27%** — and equally, only **3 of 11 (27%) were full
responders**. Constraints that must travel with the number: **n = 11**, single arm, **acute
5-day loading**, no placebo comparison, defined on **muscle creatine uptake**, not strength, and
the strength claim is a within-subgroup observation in **n = 3 vs n = 3**.

The ISSN reviews cite exactly this study and nothing better. PMC11703406 verbatim: "Syrotuik and
Bell [18] found that individuals who exhibited a significant increase in total intramuscular
creatine … termed 'responders,' demonstrated significant improvements in strength. **However, not
all participants exceeded this 20 mmol·kg⁻¹ dry weight threshold.**" PMC13011109 (2026):
"**Universal increases in PCr stores do not occur** in response to these supplementation regimens
leading to deeper discussion surrounding 'responders' vs. 'non-responders'." Neither gives a rate.

**I therefore found NO defensible published non-responder rate for the strength outcome.**
The only other quantification is Rawson & Volek's own abstract: bench 1RM increase **ranged from
3% to 45%**, and "the response is **highly variable**". Do not publish "1 in 3 people are
non-responders" on this evidence. If a number must be shown, it has to read: *"the only study
that classified people found 3 of 11 men absorbed almost none of it — but that is 11 men, and it
measured absorption, not strength."*

---

## 6. TASK 6 — Verdict and the honest sentences

### Is "about two-thirds more strength gain than training alone" defensible? **No.**

Five reasons, each with its number:

1. **Its only source cannot be read.** PMID 14636102 is abstract-only (verified four ways). It is
   a **narrative review**, an unweighted average of 22 study means over mixed 1/3/10RM protocols,
   with **no CI, no n, no weighting, no heterogeneity test, no bias test**, whose own abstract
   says "the response is highly variable" and quotes a **3%–45%** range for bench 1RM.
2. **It is a top-of-range figure.** My reconstruction from placebo-arm data spans **0.02 to 0.65**
   across sources, sexes and body regions. 0.667 sits above all of it.
3. **It fails the row's own robustness check.** The row records trim-and-fill 4.43 → 3.60 kg;
   that alone takes the upper-body share from 0.65 to **0.53**.
4. **It is region-specific and the row hides that.** Upper 0.65, lower **0.35**. Legs are where
   most people's training gains live. A single ratio cannot describe both.
5. **A larger, newer meta-analysis (69 studies, 1937 participants) cuts it by two-thirds again**
   — upper share **0.21**, and lower-body **leg press is not statistically significant at all**
   (3.129 kg, 95% CI −0.74 to 7.003, p = 0.11). This source is **not in the row's inventory**.

The number is also **doubly favourable in construction**: it takes the largest available
numerator, divides by a denominator drawn from short trials with rapid novice gains, and reports
the result to a precision ("two-thirds") that the underlying data cannot carry.

---

### The most accurate honest sentence the evidence supports

> **"Add creatine to lifting and you gain about 4 kg more on bench-type lifts and about 11 kg more
> on leg lifts over 4–12 weeks than people doing the identical training on a placebo — roughly a
> third to two-thirds more than training alone gives you, with upper body at the top of that range
> and legs at the bottom. The larger and newer of the two meta-analyses puts it nearer a fifth, so
> treat 'two-thirds' as the optimistic end, not the answer."**

If a single ratio must be printed, print the lower, bias-adjusted, region-honest one:

> **"About a third more strength than the same training without it — more on upper body, less on
> legs, and the trials this rests on are all small."**

**Numbers behind those sentences, all citable:**

| Claim | Number | Source |
|---|---|---|
| Absolute upper-body increment | **+4.43 kg (95% CI 3.12–5.75)**, I² = 0% | PMID 39519498, full text |
| … bias-adjusted | **+3.60 kg (95% CI 2.39–4.81)** | same, trim-and-fill |
| … larger newer meta | **+1.43 kg (95% CI 0.53–2.34)** | PMID 40944139, full text |
| Absolute lower-body increment | **+11.35 kg (95% CI 8.44–14.25)**, I² = 0% | PMID 39519498 |
| … larger newer meta, leg press | **+3.13 kg (95% CI −0.74–7.00), p = 0.11 — not significant** | PMID 40944139 |
| … larger newer meta, squat | **+5.64 kg (95% CI 3.87–7.40)** | PMID 40944139 |
| Placebo-arm gain, upper (my extraction) | **+6.80 kg**, baseline 95.2 kg, n = 56 | 6 primary trials, §2c |
| Placebo-arm gain, lower (my extraction) | **+32.18 kg**, baseline 140.7 kg, n = 53 | 5 primary trials, §2c |
| **Share of achievable gain, upper** | **0.65 (95% MC interval 0.38–1.41)**; 0.53 bias-adjusted; 0.21 on the newer meta | derived, §3–4 |
| **Share of achievable gain, lower** | **0.35 (95% MC interval 0.23–0.58)**; 0.10–0.18 on the newer meta | derived, §3–4 |

---

### Second version, for a woman

The data genuinely differ, and the direction is now corroborated across two independent
meta-analyses.

> **"For women, this is close to unproven. The one meta-analysis that separated them found no
> significant strength gain in women at all — +1.5 kg upper body (95% CI −1.8 to +4.9) and
> +8.0 kg lower body (95% CI −0.8 to +16.9) — and the largest meta-analysis to date puts the
> women's bench-press gain at 0.15 kg, about the weight of a phone. Only 49 of the 509 people in
> the main trial base were women. It may still work for you; nobody has run a trial big enough to
> say."**

Two exceptions to state alongside it, both fairly:
- **After menopause the picture is better, at ≥5 g/day with training:** "Leg-press 1RM (k = 3;
  n = 111) improved with creatine: **MD + 7.5 kg (95% CI + 2.2 to + 12.8; I² = 0%)** … trials
  using **≤ 3 g·day⁻¹ without RT showed no measurable effect**" (PMID 42141930).
- The sex difference is a **subgroup hypothesis, not a proven interaction**: the formal
  interaction tests are **p = 0.067** (upper) and **p = 0.446** (lower) — neither significant.
  "Works less well in women" is currently *plausible and twice-corroborated in direction, but not
  demonstrated*.

---

## 7. Review findings against `app/design-lab/ab/audits/creatine.json` → `outcomes[0]`

| # | Severity | Finding |
|---|---|---|
| **R1** | **blocker** | `outcomes[0].sentence` reads *"a 20% vs 12% strength gain instead of 12%"* — this is **malformed English** (it says "20% vs 12% … instead of 12%") **and** it publishes the unverifiable narrative figure as if it were the meta-analysis's own. Fix the grammar and drop or heavily qualify the relative claim. Separately: the task brief's "sex interaction p=0.048" is a conflation — the JSON is correct that **p = 0.048 is Egger's test** and the upper-body **sex interaction is p = 0.067**. Do not let that conflation reach copy. |
| **R2** | **blocker** | **A newer, larger meta-analysis is missing from `inventory`:** Kazeminasab et al., PMID **40944139** / DOI **10.3390/nu17172748**, *Nutrients* 2025, **69 studies, 1937 participants** (vs 23 / 509). It reports bench/chest **1.43 kg [0.53, 2.34]** — under a third of the row's 4.43 kg — and **leg press not significant (3.129 kg [−0.74, 7.003], p = 0.11)**. A row whose `effect_basis` names 4.43/11.35 as the estimate cannot stand without adjudicating this source. Its existence also makes `checklist.consistency: "supported"` and `checklist.precision: "supported"` **unsupportable as written**. |
| **R3** | **major** | `absolute_effect` and `effect_basis` both quote "a 20% strength gain instead of 12% (+8 percentage points of 1RM)" from an **abstract-only 2003 narrative review with no n, no CI and no weighting**, alongside CI-bearing meta-analytic numbers, at equal visual weight. `inventory` already labels it `"access": "abstract"`, `"n": 0` — but the front-of-card text does not carry that caveat. Either drop the relative figure or annotate it inline as *"a 2003 narrative average, no confidence interval"*. |
| **R4** | **major** | The row records trim-and-fill (4.43 → **3.60 kg**) in `detail.evidence.missing` and `strongest_doubt`, then quotes the **uncorrected** relative figure in the headline sentence. Pick one convention. On the corrected number the share is **0.53**, not 0.667. |
| **R5** | **major** | The **share of achievable gain differs ~2× between upper (0.65) and lower (0.35) body**. One ratio cannot describe both, and the lower-body figure is the one most buyers care about. If a ratio is published, it must be region-labelled. |
| **R6** | **minor** | `detail.effect.missing` says the female sex question is `subgroup_hypothesis_only` — correct. But the row should now also carry PMID 40944139's female estimates (**bench 0.15 kg [0.002, 0.30]**, leg press and squat both NS), which corroborate the direction from an independent and much larger dataset. |
| **R7** | **minor** | The row cites **EFSA 2016** ("cause and effect ESTABLISHED" for ≥3 g/day + RT in adults >55) and notes the applicant was **AlzChem AG, a creatine maker**. That opinion is now in tension with PMID 40944139, where **every over-50 subgroup is null** (bench 0.85 NS, leg press 1.41 NS, squat 0.76 NS), and with my own extraction (pooled older-adult share **+0.10 upper, −0.08 lower**). Worth a line in `strongest_doubt`. |
| **R8** | **info** | `gates.largestRctN: 39` and `longestRctWeeks: 12` are confirmed correct against Table 3 of PMC11547435 (Noonan 1998 n = 39; Larson 2000 and Volek 1999 at 12 weeks). `gates.rctCount: 23` confirmed. `studied_in` confirmed: "20 studies involving males (447 male participants), 2 studies involving females (40 female participants), and 1 study involving both (13 male and 9 female)". |
| **R9** | **info** | **There is no published data supplement for PMID 39519498** (`<supplementary-material>` count = 0) and no per-arm data in any table or figure. If the founder wants a properly weighted share-of-gain with a real CI, the only routes are (a) email the corresponding author of `10.3390/nu16213665` for the extraction sheet, or (b) re-extract all 23 primaries — 8 of which are not in Europe PMC and would need library access. |

---

## Appendix A — reproduction

```bash
# Rawson & Volek 2003 — abstract only, verified four ways
curl -s -G "https://www.ebi.ac.uk/europepmc/webservices/rest/search" \
  --data-urlencode 'query=EXT_ID:14636102 AND SRC:MED' --data-urlencode format=json --data-urlencode resultType=core
curl -sI -L "https://doi.org/10.1519/1533-4287(2003)017%3C0822:eocsar%3E2.0.co;2"          # -> 403
curl -s "https://api.unpaywall.org/v2/10.1519/1533-4287(2003)017%3C0822:eocsar%3E2.0.co;2?email=..."  # is_oa False
curl -s "https://api.crossref.org/works/10.1519/1533-4287(2003)017%3C0822:eocsar%3E2.0.co;2"          # abstract absent

# full texts
for id in PMC11547435 PMC12430374 PMC12665265 PMC6265971 PMC3543170 PMC7353308 PMC11767391; do
  curl -s "https://www.ebi.ac.uk/europepmc/webservices/rest/$id/fullTextXML" -o $id.xml; done

# forest plots as images (europepmc.org returns 520; ncbi.nlm.nih.gov returns 404; this host works)
curl -sL "https://pmc.ncbi.nlm.nih.gov/articles/instance/11547435/bin/nutrients-16-03665-g002.jpg" -o fig2.jpg
curl -sL "https://pmc.ncbi.nlm.nih.gov/articles/instance/11547435/bin/nutrients-16-03665-g004.jpg" -o fig4.jpg
```

## Appendix B — searches run

`EXT_ID:` lookups for 14636102, 39519498, 41433021, 40944139, 41328071, 39861368, 42141930,
15320650, 29138605, and for all 15 PMIDs among refs 22–44 of PMC11547435; DOI lookups via
Crossref and Unpaywall; title searches for the 8 unindexed JSCR primaries (Kelly 1998,
Larson-Meyer 2000, Noonan 1998, Pearson 1999, Peeters 1999, Stout 1999, Syrotuik 2000, Arazi
2019 — **all zero hits in Europe PMC**); keyword searches for `creatine AND "non-responder"`,
`creatine AND nonresponders AND muscle`, `creatine AND "responders and non-responders"`,
`creatine + responders + "muscle creatine" + uptake`, `Rawson AND Volek AND creatine AND review`,
`TITLE:"Common questions and misconceptions about creatine supplementation"`,
`creatine AND strength AND meta-analysis AND (2025 OR 2026) AND "percentage change"`,
`creatine AND "female soccer players" AND strength`, `Syrotuik AND creatine`,
`Peeters AND "creatine phosphate" AND strength`, `Noonan AND creatine AND dosages`,
`Kelly AND creatine AND "bench press"`, `Arazi AND "creatine ethyl ester"`,
`"Larson-Meyer" AND creatine`.

## Appendix C — self-confidence

- **High** on every quoted effect size — all verbatim from text or figures I opened here.
- **High** on the access verdict for PMID 14636102 (four independent negative checks).
- **High** on the fact that PMID 39519498 contains no per-arm or baseline data (I enumerated every
  table, figure and supplementary element in its JATS).
- **High** on the placebo-arm extraction in §2c: four of seven arms reproduce the meta-analysis's
  own forest-plot differences **exactly**, which is a strong internal validation.
- **Medium** on the share-of-gain point estimates. The denominators rest on ~13% of the trial base,
  chosen by what happened to be open-access, not at random. The MC interval carries the
  denominator's sampling error but **cannot** carry its selection bias.
- **Low** on any trial-level ratio (range −0.50 to +8.00) — reported only to demonstrate why
  trial-level ratios must not be published.
- **Low** on the non-responder rate — n = 11, acute loading, absorption not strength.

Per `CLAUDE.md` invariant 4 and `AGENTS.md`: no constants proposed, no files edited, no commits.
Anything in §7 implying a numeric or scoring change is a founder call for `docs/REVIEW_PENDING.md`.
