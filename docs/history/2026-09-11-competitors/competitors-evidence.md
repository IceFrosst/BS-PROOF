# Competitor brief — EVIDENCE-GRADING lane (closest to the "Effect" axis)

Research date: **2026-09-11 (UTC)**. Method: `curl` against live pages; where the live origin blocked us, the Wayback Machine was used and the snapshot timestamp is stated. Every quote below comes from a page/document I actually retrieved. Pages I could **not** open are listed explicitly in "Could not open".

**Access note (important):** `examine.com` blocks server-side fetches — every live request returned `HTTP 429` with `<title>Vercel Security Checkpoint</title>` (e.g. `https://examine.com/about/grades/` → 429, 32,177 bytes). All Examine evidence below is from **Wayback snapshots that I opened**, with timestamps. Examine's own internal JSON (embedded `__NEXT_DATA__`/RSC payload in those snapshots) is quoted verbatim — that is the strongest primary evidence in this brief.

---

## Headline answer to the core question

**Nobody in this lane ships a consumer-facing "how much better will my life be" number. One product ships a consumer-facing *ordinal magnitude of effect* per outcome — Examine.com — and it is the only one.**

- **Examine.com** is the only product that separates **evidence strength** from **effect magnitude** and renders magnitude as a discrete visual scale. Its machine-readable payload contains a 7-level magnitude vocabulary: `"No effect"`, `"Small Improvement"`, `"Moderate Improvement"`, `"Large Improvement"`, `"Small Increase"`, `"Moderate Increase"`, `"Large Increase"`, `"Small Detriment"` (verbatim from the creatine page payload). Its published method says the letter grade is computed from "**Magnitude of effect / Consistency of effect across studies / The number of studies**". But: the *quantitative* magnitude (e.g. "12% → 20% strength") only ever appears in **free-text notes**, never as a number on the axis; and the whole Grade/Evidence/Effect table is **paywalled**.
- **Cochrane/GRADE** is the scientific benchmark and it *does* cross magnitude × certainty — but only in **prose templates** ("X **probably** results in a **large** reduction in outcome"). There is no number, no 0–100, no band label shown to a consumer.
- **Consensus, Elicit, Scite** grade *direction of literature* or *citation stance*, not magnitude. Consensus explicitly states: "**Research quality is not a part of the analysis** … each claim counts the same on the roll-up interface regardless if it comes from a meta-analysis or an n=1 case report."
- **WebMD** *used to* carry a consumer-facing efficacy scale (NatMed's "Possibly Effective for / Possibly Ineffective for / Insufficient Evidence for") and has **deleted it**: the current (Jul 2025) monograph has no efficacy grade at all.
- The only **published, empirical verdict** on consumer-facing letter-graded evidence for supplements is negative: FDA/IFIC research found "**Consumers found it difficult to discriminate across four levels and showed inclination to project the scientific validity grade onto other product attributes. Consumers showed preference for simpler messages.**" (Kapsak et al. 2008)

---

## Comparison table

| Product | Number/grade shown? | Efficacy graded, or only quality/safety? | Effect **magnitude** exposed? | Dose / form / population | Personalisation | Business model |
|---|---|---|---|---|---|---|
| **Examine.com** | **Letter A–F per outcome**, labels `High potential` (A), `Moderate potential` (B), `Low potential` (C), `Negligible potential` (D); plus a **consistency %** ("90%") and study/participant counts | **Efficacy** ("Letter grades correspond to general efficacy, and apply on a per-outcome basis"). Safety is a separate, lighter section | **Yes** — ordinal arrows: Small/Moderate/Large × Increase/Decrease, plus `No effect`, `Small Detriment`, mixed. Quantities only in prose notes | Separate "Dosage information" section (g/kg protocols); grades differ per condition page because "we use different evidence depending on the population" | Weak: pick categories for research-feed alerts; Pro tier "Protocol Builder" | Subscription: free tier / **Examine+** / **Examine Pro**; DB is paywalled; no ads, no brands, contractual no-industry-ties |
| **Cochrane + GRADE** | **4 certainty bands**: High ⊕⊕⊕⊕ / Moderate ⊕⊕⊕◯ / Low ⊕⊕◯◯ / Very low ⊕◯◯◯, **per outcome** | Certainty *about an effect estimate* — so efficacy-adjacent, but the grade is about confidence, not size | **Yes but prose-only** — Handbook Table 15.6.b crosses 4 magnitude tiers (Large / Moderate / Small important / Trivial-or-none) with the 4 certainty levels into fixed sentences | Handled by PICO scoping + separate reviews/subgroups per population | None | Non-profit; Handbook free; **cochranelibrary.com** full text gated (returned 412 to me) |
| **Consensus** | **Consensus Meter**: classifies top 20 results as "**yes**", "**no**" or "**possibly**" | Direction of literature only. No efficacy grade, no quality weighting | **No** | No | No | Freemium subscription (`consensus.app/pricing` live: Monthly/Annual, Individual vs Team & Enterprise) |
| **Scite** | **Smart Citations counts**: Supporting / Mentioning / Contrasting (live example: 24 / 962 / 4 / 50 unclassified) | Citation stance about a *paper*, not efficacy of an intervention | **No** | No | No | Subscription (Research Solutions); API/MCP/library sales |
| **Elicit** | Could not verify (403) — see "Could not open" | Unverified | Unverified | Unverified | Unverified | Unverified |
| **WebMD (current)** | **None** | Neither. Sections are Uses / Side Effects / Warnings / Interactions / Overdose | **No** | Dosage sections; no population grading | No | Ad + subscription media |
| **WebMD 2019 (NatMed-powered)** | **Band labels**: "Possibly Effective for", "Possibly Ineffective for", "Insufficient Evidence for" under a header "**Uses & Effectiveness ?**" | **Efficacy**, per indication | No — magnitude in prose ("modestly improve upper body strength") | Prose | No | Licensed database content |
| **Healthline** | No grade. Editorial "content integrity" process only | Neither | No | No | No | Ads + affiliate commerce ("brand and product vetting") |

Adjacent published attempts at a benefit score (details in §8): **AIS ABCD** (Group A–D), **ISSN A/B/C**, **Information is Beautiful "Snake Oil Supplements"** bubble chart, **FDA qualified-health-claim ranking**.

---

## 1. Examine.com — the only real Effect-axis competitor

### (1) What appears on the result screen, in order, with actual wording
From the **Wayback snapshot `20250804215749` of `https://examine.com/supplements/5-htp/`** (page content dated "Last Updated: June 25, 2024"), in document order:

1. `5-HTP is most often used for` **`Mental Health`** `.`
2. `The` **`Examine Database`** `covers` `Obesity`, `Depression`, `and 5 other conditions and goals.`
3. Byline: `Written by: Katherine Nguyen, PharmD • Katie Jantz, RPh, MSc` / `Fact-checked by: Gregory Lopez, MA, PharmD • Nick Milazzo, MSc, MPH` / `Last Updated: June 25, 2024`
4. **`Research Snapshot`** — `26 references on this page` · `305 participants in 8 trials`
5. **`Examine Evidence Grades`** — `A Appetite` · `B Depression Symptoms` · `+ 1 more` · `C 2 outcomes` · `D 1 outcome`
6. `Overview` (`What is 5-HTP?` / `What are 5-HTP's main benefits?` / `What are 5-HTP's main drawbacks?` / `How does 5-HTP work?`)
7. `Dosage information` + `Medical disclaimer`
8. **`Examine Database: 5-HTP`** — table with column headers exactly: **`Health Condition/Goal` | `Health Outcome` | `Grade` | `Evidence` | `Effect`**
9. `Research Feed`, `Frequently asked questions`, `Update History`, `References`, `Examine Database References`

Note the naming tension: the top-of-page module is called **"Examine Evidence Grades"**, but the published method (below) says those grades encode *magnitude + consistency + count*. The word "Evidence" is doing double duty.

**Paywalling:** on the **`20231218150705` creatine snapshot**, the `Grade` / `Evidence` / `Effect` cells for a logged-out reader render as a **padlock SVG** (inline `<svg>` drawing a closed padlock) with an `Unlock` / `Examine+` prompt, while the study counts ("`45 Studies`", "`Participants: 6525`") stay visible. The membership page (snapshot `20251201232304`) confirms the gating: "**Examine Database: Graded evidence for 500+ interventions, 400+ conditions, and 1,000+ health outcomes**" is listed under **What's included** for Examine+.

### (2) Is a number/grade shown, and what is it computed from — published methodology, quoted
Grade is a **letter A–F per outcome**, not a score. From **`https://examine.com/about/grades/`, Wayback snapshot `20250326181208`**, titled "How Examine calculates evidence grades":

> "Interventions indexed in the Examine Database are assigned a **letter grade from A to F, with A being the most effective and F being unsafe for the specific outcome the grade appears by**. Examine grades are **automatically calculated from three main inputs**: **Magnitude of effect** / **Consistency of effect across studies** / **The number of studies**"

> "**How Do Effect Magnitudes Work?** Effect magnitudes are **entered by hand by our expert research team**. Examine researchers look at the body of evidence rather than single trials. They assess the magnitude of effect for any intervention studied for a specific outcome and take into account **both the absolute magnitude and clinical significance** to determine whether the effect is a **small, medium, or large increase or decrease, mixed, or no effect**."

> "When the arrows point up, it means the outcome is increased. Downward-pointing arrows indicate a decrease… A dash indicates no effect. Arrows that point up and down indicate a mixed effect that depends on the particulars. The effect magnitudes are also **color-coded. Green colors indicate a good effect. Red arrows mean the effect is bad. Gray arrows mean that there's not a clear good or bad direction for the outcome.**"

> "**Consistency scores are automatically calculated by comparing how well the effect directions line up between different studies** in the Examine Database."

> "**What Do the Letter Grades Mean?** Letter grades show you what you need to pay attention to if you care about 'what works'. It's a combination of what has the most evidence, the most benefits, or both. **Letter grades correspond to general efficacy, and apply on a per-outcome basis.** A single intervention may have no effect on one outcome, and a good effect on another!
> **A**: Multiple, mostly consistent studies suggest **at least a moderate effect**.
> **B–C**: Fewer studies suggest a possible effect, there's some inconsistency in the data, or **the effect is small**.
> **D**: Either there's very little research on the topic, the studies are highly inconsistent, the effect is null or very small, or a combination of these issues.
> **F**: The evidence indicates the intervention may make the specific outcome **worse** for the specific outcome that the grade applies to."

(The earlier `20231128170531` snapshot of the same URL had "**F: The evidence indicates the intervention may cause harm and should be avoided**" — so the F band was re-scoped from "harm" to "makes this outcome worse" between Nov 2023 and Mar 2025.)

**The consumer-facing band labels are in the payload, not on the methodology page.** From the creatine snapshot's embedded JSON (verbatim key/value pairs):

```
"grade":"A", "grade_label":"High potential"
"grade":"B", "grade_label":"Moderate potential"
"grade":"C", "grade_label":"Low potential"
"grade":"D", "grade_label":"Negligible potential"
```
Counts on that one page: `A`×12, `B`×33, `C`×184, `D`×151 — i.e. **~89% of graded creatine outcomes are C or D**. Zero `F` on that page.

**The Effect column vocabulary**, verbatim, with frequency on the creatine page:
```
"arrow":{"icon":["no-effect"],  "text":"No effect"}            ×151
"arrow":{"icon":["icon-up-1"],  "text":"Small Improvement"}    ×49
"arrow":{"icon":["icon-up-1"],  "text":"Small Increase"}       ×37
"arrow":{"icon":["icon-up-2"],  "text":"Moderate Increase"}    ×29
"arrow":{"icon":["icon-up-3"],  "text":"Large Improvement"}    ×28
"arrow":{"icon":["icon-up-3"],  "text":"Large Increase"}       ×24
"arrow":{"icon":["icon-down-1"],"text":"Small Decrease"}       ×22
"arrow":{"icon":["icon-down-2"],"text":"Moderate Improvement"} ×12
"arrow":{"icon":["icon-down-1"],"text":"Small Improvement"}    ×12
"arrow":{"icon":["icon-up-1"],  "text":"Small Detriment"}      ×5
"arrow":{"icon":["icon-up-2"],  "text":"Moderate Improvement"} ×3
"arrow":{"icon":["icon-down-2"],"text":"Moderate Decrease"}    ×3
```
Key design lesson: the icon encodes **direction + size (1/2/3)**; the *text* re-labels the same arrow as `Increase/Decrease` (valence-neutral outcome) or `Improvement/Detriment` (valence-signed outcome). That is exactly the direction-vs-benefit problem an "Effect" axis has to solve.

**The Evidence column** is a consistency percentage plus a count, verbatim:
```
"consensus":{"label":"10 studies","value":"90%","studies":10}
"consensus":{"label":"45 studies","value":"75%"}
"consensus":{"label":"3 studies", "value":"33%"}
"consensus":{"label":"2 studies", "value":"50%"}
```
So a "2 studies / 50%" cell and a "45 studies / 75%" cell look structurally identical — the % is a bare direction-agreement ratio with no weighting by n or design.

**Historical precedent (most useful single artefact for us).** Examine's pre-2019 "Human Effect Matrix" split the two axes explicitly. From the **Wayback snapshot `20180529171753` of `examine.com/supplements/creatine/`**:

> "**The Human Effect Matrix** looks at human studies (it excludes animal and *in vitro* studies) to tell you what effects creatine has on your body, and **how strong these effects are**."

Legend table `Grade | Level of Evidence` (letters confirmed from the image filenames `grade-a.png` … `grade-d.png` in the HTML):
- **A** — "Robust research conducted with repeated double-blind clinical trials"
- **B** — "Multiple studies where at least two are double-blind and placebo controlled"
- **C** — "Single double-blind study or multiple cohort studies"
- **D** — "Uncontrolled or observational studies only"

Column tooltips, verbatim:
- `Level of Evidence ?` → "**The amount of high quality evidence. The more evidence, the more we can trust the results.**"
- `Magnitude of effect ?` → "**The direction and size of the supplement's impact on each outcome.** Some supplements can have an increasing effect, others have a decreasing effect, and others have no effect."
- `Consistency of research results ?` → "Scientific research does not always agree. **HIGH or VERY HIGH means that most of the scientific research agrees.**"

Magnitude values used: **`Strong` / `Notable` / `Minor` / `-`**; consistency values: **`Very High` / `High` / `Moderate` / `Low`**. Example rows: `Power Output — Strong — Very High — See all 66 studies`; `Lean Mass — Minor — Very High`; `Kidney Function — - — Very High`; `Swimming Performance — - — Moderate`.

**Where the actual magnitude lives:** in the free-text Notes, e.g. verbatim from that matrix — *"Creatine is the reference compound for power improvement, with numbers from one meta-analysis to assess potency being 'Able to increase a 12% improvement in strength to 20% and able to increase a 12% increase in power to 26% following a training regiment using creatine monohydrate'"*; `Blood Glucose — Minor — Low` → *"No apparent influence on fasting blood glucose, but an 11–22% reduction in the postprandial spike"*; `Fatigue — Notable — High` → *"400 mg/kg/day in children and adolescents subject to traumatic brain injury reduces fatigue frequency from around 90% down to near 10%."* **So the real numbers exist and are never on the axis.**

### (3) Is efficacy graded at all, or only quality/purity/safety?
**Efficacy, explicitly and only.** "Letter grades correspond to general efficacy." Purity/label accuracy is *out of scope by policy* — Examine does not test or rank products: "We don't sell supplements or even ad space on our website… **We don't recommend brands or specific products**" (`/plus/` snapshot `20240209053853`). Safety exists but is thinner: the Examine-vs-NatMed page (snapshot `20231128154328`) self-scores **"Safety information — Examine: Light / NatMed Pro: More in-depth"** and **"Dosage information — Examine: Light / NatMed Pro: More in-depth"**.

### (4) Dose, form, population
- **Dose:** a dedicated `Dosage information` section with protocols, e.g. creatine — "take **0.3 grams per kilogram of bodyweight per day for 5–7 days**, then follow with at least **0.03 g/kg/day**… For a 180 lb (82 kg) person, this translates to **25 g/day** during the loading phase and **2.5 g/day** afterward… Higher doses (up to 10 g/day) may be beneficial for people with a high amount of muscle mass".
- **Form:** handled in prose and FAQ — "there are many different forms of creatine… **creatine monohydrate is the cheapest and most effective**"; FAQ "What is the best form of creatine?" → "there is no indication that there is a best form. With that said… creatine monohydrate has the most evidence behind it to support its efficacy."
- **Population:** handled by *splitting the grade across pages*, quoted from the grades page: "**You may notice that the grades vary a little between different pages on our site. That's because we use different evidence depending on the population from each study.** For example, something that helps lower inflammation in people with polycystic ovarian syndrome may not help as much in people with cardiovascular disease." Routing advice, verbatim: "If you care about all the effects of the intervention, check out the Examine Database on the *specific intervention's page*… If you care about what's best to take for a specific condition (like type 2 diabetes) or goal… visit our *Conditions and Goals pages*… If you care most about improving a particular outcome (like HbA1c or VO2max)… the *Outcome's page*." **Dose and form do not enter the grade.** Neither does a healthy-vs-diseased split at the axis level.

### (5) Personalisation
Minimal on the consumer tier. Examine+ includes "Personal reference tools: Save pages, take notes, and receive email alerts for new studies" and (vs NatMed) "**Personalization** — Pick and choose categories and topics of interest to receive updates relevant to your life and health". Real matching logic sits in the **Pro** tier: "**Protocol Builder: Match patient goals and health conditions to the safest and most effective supplement combinations**" (membership snapshot `20251201232304`). Homepage (snapshot `20260831093547`) also advertises "**Supplement Navigator — New — Search by condition to find supplement efficacy, safety, and dosage information**".

### (6) Evidence sourcing / do they cite studies?
Yes, heavily and per-claim. "The Examine Database **almost exclusively uses randomized controlled trials and meta-analyses of randomized controlled trials** to maximize the likelihood of inferring causality from the data." Per-page reference lists with named DB references (e.g. `Weight - Ceci F, Cangiano C… J Neural Transm (1989)`), inline numeric citations, an `Update History` log with `major`/`minor`/`correction` tags and named "Research written by / Edited by / Reviewed by", and a claimed scale of "**Examine Database: 10,000+ human *in vivo* studies**".

### (7) Business model
Three tiers — **Examine (free)**, **Examine+**, **Examine Pro** — with "60-day money-back guarantee" and a 7-day free trial (per the vs-NatMed page: "Free trial — Examine: Seven days / NatMed Pro: No"). Revenue is subscription only: "No investors or sponsors to answer to. We don't sell supplements or even ad space… **Each of us is contractually required to have zero industry ties.**" Social proof: "Over **13,000** members" (`/plus/`, Feb 2024 snapshot). **I did not obtain a dollar price** — the price widgets are client-rendered and the Dec 2025 membership snapshot only shows promo copy ("Cyber Monday Sale: Save Over 20%… Save over 27% on Examine+… Save up to 22% on Examine Pro"). **Flagging: Examine+ / Pro price points are UNKNOWN to me, not a guess.**

### (8) Strongest criticism of their method
There is **no** named critique of *Examine's grading algorithm specifically* that I could open — I searched Europe PMC for `"Examine.com"` (8 results, all citing it approvingly) and read the Wikipedia article in full (no criticism/reception section). **I will not invent one.** The strongest *applicable* criticisms, from named sources I opened:

- **On letter-graded evidence shown to consumers (directly on point).** Kapsak WR, Schmidt D, Childs NM, Meunier J, White C., *Crit Rev Food Sci Nutr* 2008 (PMID 18274974), reporting IFIC Foundation research on FDA's four-level evidence ranking: "**Consumers found it difficult to discriminate across four levels and showed inclination to project the scientific validity grade onto other product attributes. Consumers showed preference for simpler messages.**" The "project onto other attributes" finding is the killer for a single-letter Effect grade: an A for one outcome bleeds into perceived safety, quality and value of the whole product.
- **Berhaupt-Glickstein A, Hallman WK.**, *Crit Rev Food Sci Nutr* 2017 (PMID 26558421): "…research indicates that **consumers misinterpret QHCs as a whole product evaluation** … There is an **absence of a systematic description of evidence** … that may contribute to the misleading, albeit unintentional, nature of these claims."
- **On combining magnitude, consistency and count into one letter** — Cochrane Handbook ch.14 (live, HTTP 200) pushes the opposite way: certainty is rated **per outcome across five named domains** and authors must "**Justify and document all assessments** … (e.g. downgrading or upgrading using GRADE)" (MECIR C75), with an explicit warning against "the impression of **formulaic or algorithmic reporting**". Examine's grade is, by its own description, "**automatically calculated**" from three inputs with no risk-of-bias, indirectness, imprecision or publication-bias domain. It also has no imprecision concept at all: a `2 studies / 50%` consistency cell and a `45 studies / 75%` cell are rendered in the same visual language.
- **Their own competitor-comparison concedes the gaps**: "Dosage information — Light", "Safety information — Light", and Examine grades "at the level of clinical outcomes within a condition" while NatMed grades "at the level of the condition as a whole".

### (9) Coverage / limits
Claimed coverage (membership page, Dec 2025): "**500+ interventions, 400+ conditions, and 1,000+ health outcomes**"; vs-NatMed page: "**400+ conditions and goals, 1,000+ outcomes, and 500+ supplements and interventions**", "Examine Database: **10,000+ human *in vivo* studies**", 17 Supplement Guides. Limits: **no product-level data at all** (no brands, no SKUs, no barcode/scan surface, no purity/label testing); grades are **per-outcome**, so a single supplement carries dozens of contradictory letters (creatine: 380 graded outcome rows on one page); the D band deliberately conflates "no research" with "null effect" ("Either there's very little research on the topic, the studies are highly inconsistent, the effect is null or very small"); and the whole Effect surface is **behind a paywall**, so a free user sees only study counts.
Guide taxonomy worth stealing as prior art: the Supplement Guides sort into `Combos`, **`Primary Supplements`**, **`Secondary Supplements`**, **`Promising Supplements`**, **`Unproven Supplements`**, **`Inadvisable Supplements`**.

---

## 2. Cochrane + GRADE — the scientific benchmark (live, HTTP 200)

Opened: `https://training.cochrane.org/handbook/current/chapter-14` (220,533 bytes) and `chapter-15` (214,048 bytes); two plain-language summaries on `cochrane.org`.

### (2) The grade and what it's computed from
Four certainty levels, verbatim from Handbook §14.1.6.8 / Figure 14.2.a:

> "The GRADE approach categorizes the certainty in a body of evidence as '**high**', '**moderate**', '**low**' or '**very low**' **by outcome**."
> Figure 14.2.a symbols: **High ⊕⊕⊕⊕ / Moderate ⊕⊕⊕◯ / Low ⊕⊕◯◯ / Very low ⊕◯◯◯**
> "For systematic reviews, the GRADE approach defines the certainty of a body of evidence as **the extent to which one can be confident that an estimate of effect or association is close to the quantity of specific interest**."

Start points and moves, verbatim: "a body of evidence from **randomized trials begins with a high-certainty rating** while a body of evidence from **NRSI begins with a low-certainty rating**"; downgrade domains are "**risk of bias, inconsistency, indirectness, imprecision or publication bias**", each "'serious' (downgrading… by one level)" or "'very serious' (…two levels)"; upgrade domains are "**Large effect**", "**Dose response**", "**plausible residual opposing confounding**". Hard numeric anchors to copy: upgrade for large effect if "**RR >2 or RR <0.5**", very large "**RR >5 or RR <0.2**"; imprecision — "If the 95% CI includes appreciable benefit or harm (**an RR of under 0.75 or over 1.25** is often suggested as a very rough guide) downgrading for imprecision may be appropriate".

### (3)(4) Efficacy vs magnitude — the exact benchmark wording for an Effect axis
This is the single most useful artefact for us. **Handbook Table 15.6.b, "Suggested narrative statements for phrasing conclusions"**, crosses **size of effect estimate** (4 tiers: *Large effect / Moderate effect / Small important effect / Trivial, small unimportant effect or no effect*) with **certainty** (4 levels). Verbatim cells:

- **High certainty** — Large: "X **results in** a **large** reduction/increase in outcome". Moderate: "X reduces/increases outcome". Small important: "X reduces/increases outcome **slightly**". Trivial/none: "X results in **little to no difference** in outcome" / "X **does not** reduce/increase outcome".
- **Moderate certainty** — "X **likely** results in a large reduction…" / "X **probably** reduces/increases outcome" / "X probably reduces/increases outcome **slightly**" / "X likely results in little to no difference in outcome".
- **Low certainty** — "X **may** result in a large reduction…" / "**The evidence suggests** X reduces/increases outcome" / "X may reduce/increase outcome slightly" / "X may result in little to no difference in outcome".
- (Very low certainty rows follow the same pattern with maximal hedging.)

Also required for absolute magnitude, §14.1.6.4/14.1.6.5: "Review authors should present the absolute effect in the same format as the risks with comparator intervention… for example **as the number of people experiencing the event per 1000 people**. For continuous outcomes, **a difference in means** or standardized difference in means should be presented **with its confidence interval**." And optionally in Comments: "**number needed to treat for benefit and harm**, risk difference expressed as percentage, **continuous outcome expressed in minimal important difference units**".

And the explicit trap warning (§15.6.4): "**A common mistake is to confuse 'no evidence of an effect' with 'evidence of no effect.'**… One way of avoiding errors such as these is to consider the results **blinded**; that is, consider how the results would be presented and framed in the conclusions if the direction of the results was reversed."

### (1) What a consumer actually sees on a plain-language summary
Two real PLS pages I opened on `cochrane.org`:

- **"Vitamin C for preventing and treating the common cold"** (`cochrane.org/CD000980/ARI_...`, HTTP 200): prose only, no bands, no certainty rating in the summary — but it **does give magnitude in plain percentages**: "Regular ingestion of vitamin C had **no effect on common cold incidence** in the ordinary population, based on 29 trial comparisons involving 11,306 participants. However, regular supplementation had a **modest but consistent effect in reducing the duration** of common cold symptoms… In five trials with 598 participants exposed to short periods of extreme physical stress (including marathon runners and skiers) **vitamin C halved the common cold risk**." Abstract: "In adults the **duration of colds was reduced by 8% (3% to 12%)** and in children by **14% (7% to 21%)**."
- **"Antioxidant supplements for prevention of mortality…"** (`cochrane.org/CD007176`, HTTP 200): "…the analysis that is typically used when similarity is present demonstrated that antioxidant use **did slightly increase mortality** (that is, **the patients consuming the antioxidants were 1.03 times as likely to die** as were the controls)… **The current evidence does not support the use of antioxidant supplements in the general population** or in patients with various diseases."

**Takeaway for our Effect axis:** Cochrane is the only source in this lane that systematically pairs magnitude with certainty — and it does it in **sentences**, with a **per-outcome** scope, an **absolute-risk** format, and a **confidence interval**. There is no consumer-facing number, no 0–100, no "life improvement" metric anywhere in the Handbook.

### (5)(6)(7)(9)
No personalisation. Sourcing is the systematic review itself, fully referenced. Non-profit; Handbook and PLS free; **cochranelibrary.com full text was blocked to me (HTTP 412)**, so I could not inspect a current-template "Key messages" PLS. Coverage limit that matters to us: Cochrane reviews exist for a small minority of supplement×outcome pairs, and the two I opened were last searched in 2012.

---

## 3. Consensus — AI evidence direction, explicitly not magnitude or quality (live, HTTP 200)

### (1)(2) Result screen and the grade
The graded object is the **Consensus Meter**. Verbatim from `consensus.app/home/blog/introducing-the-consensus-meter/` (Jan 15, 2024) and `…/consensus-meter/` (Jan 31, 2023):

> "For 'Yes/No' questions, the Consensus Meter **uses large language models to instantly classify the results as indicating 'yes', 'no' or 'possibly'** in a clean, aggregated interface. **The meter will run over the first 20 results** and will only classify answers that our model believes are relevant enough to your question."
> "Think of the Consensus Meter as an AI-powered scientist that **sifts through the top 20 most relevant papers** about your question and tells you what they say."

So: **three labels — `yes` / `no` / `possibly`** — computed from an LLM classification of ≤20 retrieved papers. No weighting, no number beyond the tally.

### (3) Efficacy graded? — No, and they say so
> "**Research quality is not a part of the analysis** — another limitation that we cannot wait to address! Currently, **each claim counts the same on the roll-up interface regardless if it comes from a meta-analysis or an n=1 case report.** Not all research is created equal and future versions of this feature will take that into account."

### (4) Dose, form, population — not handled, and they admit it's a failure mode
> "**Specific nuance is missing** — one of the biggest limitations… this feature **does not always account for details included in the original question**. For instance, if you ask, 'Is ibuprofen safe for adult consumption?' and the potential result reads, 'We found that ibuprofen was safe and well tolerated in children,' our model **may classify that result as 'Yes.'**"

They *do* expose population/design as **filters**, not as grading: "Narrow by publication date, **study type, sample size, journal quartile**, and more" (`…/blog/maximize-your-consensus-experience-with-these-best-practices/`). Their own worked example is literally our domain: *"Does creatine improve cognitive function in healthy adults?"* and *"'Does fish oil improve depression?' filtered for human randomized controlled trials (RCTs)"*.

### (5)(6)(7)(8)(9)
No personalisation. Sourcing: "Consensus searches through **220M+ peer reviewed research papers**" and "the results that power the Consensus Meter are all **extracted word-for-word quotes from papers**", with "**No black boxes** — all the results that power the Consensus Meter can be seen directly below its interface with corresponding tags indicating how they were classified." Business model: freemium subscription (`consensus.app/pricing` live: `Monthly / Annual`, `Individual / Team and Enterprise`; "Over 5 million researchers, students, and clinicians"). **Strongest criticism is self-published and quantified**: "**our model will incorrectly classify results 10% of the time**. This is more likely for confusing results like claims that are written with a double-negative"; plus "We do not have access to all research… **The meter is just a snapshot** of some of the relevant research that we have access to, not a fully-comprehensive look." Coverage claim moved from "north of 150 million" (2023 post) to "220M+" (current footer). I could **not** render the live results UI (`consensus.app/results/?q=…` → **HTTP 403**), so I cannot report on-screen chip wording beyond the blog's quoted labels.

---

## 4. Scite — citation stance, not efficacy (live, HTTP 200)

### (1)(2) Result screen and numbers
Opened a live report: `scite.ai/reports/10.1186/s12970-017-0173-z` (ISSN position stand on creatine). On-screen, in order: journal/year/DOI → title → authors → `Abstract` → `Summarize citations` → filters (`Paper Sections`: Other 632 / Introduction 173 / Discussion 138 / Methods 23) → **`Citation Types`: `Supporting 24` · `Mentioning 962` · `Contrasting 4` · `Unclassified 50`** → `Cited by 853 publications (1,040 citation statements)` → a feed headed "**Smart Citations — How this paper cites the one you are viewing**" with verbatim quoted citation context.

Published definition, from `scite.ai/llms.txt` (live): "**Smart Citations** are the foundation of Scite. They show the text surrounding a citation and **classify the citation as supporting, contrasting, or mentioning**, so researchers can understand **how later work has evaluated a publication** rather than relying on a citation count alone." Coverage: "**more than 315 million scholarly articles from more than 41 million full-text sources**" (llms.txt); site footer: "indexed **1.6B+ citations**… serves 2M users".

### (3)(4)(5)(6)(7)(8)(9)
**No efficacy grading whatsoever** — the unit of judgement is *a paper*, and the judgement is *how others cited it*. No dose/form/population. No personalisation. Sourcing = full-text citation statements, shown verbatim. Business model: subscription (Pricing page in nav; part of Research Solutions; API, MCP, Zotero plugin, library "Holdings"). Structural criticism visible in the numbers I pulled: `Mentioning 962` vs `Supporting 24` vs `Contrasting 4` — **~92.5% of classified statements are the null class**, so the ratio carries almost no signal about whether the finding held up. Also `Self Cite 55 / Independent 801` is surfaced as a filter, not folded into any score. Note: `scite.ai/faq` resolved to a **404 page** and `help.scite.ai` failed TLS (`tlsv1 unrecognized name`), so I have no published methodology doc for the classifier's accuracy.

---

## 5. Elicit — NOT VERIFIED

`https://elicit.com/faq` → **HTTP 403**. `https://elicit.com/` returned 200 but is a 2.5 MB client-rendered shell. `https://support.elicit.com/en/` returned 200 but only the help-centre index: collection titles `Getting Started (6 articles)`, `Elicit tips and best practices (17)`, `Elicit's Research Agent (4)`, `Systematic reviews (6)`, `Research reports (1)`, `Library (10)`, `Elicit's API (3)`, `About Elicit (12)`, `Accounts and billing (11)`. The collection page I fetched contained no article links in server HTML. **I have no opened evidence about Elicit's result screen, scoring, or model. Anything I said about Elicit's grading would be recollection, not research — so I am reporting it as a gap.**

---

## 6. Healthline / WebMD — content grading, no efficacy axis

### Healthline (live, HTTP 200: `healthline.com/about/content-integrity`)
No score, no grade, no band on any supplement. What they publish is a **process** claim: "Each piece of content is developed by our in-house editorial team in partnership with **expert writers, medical reviewers, and fact checkers**"; "**All our health information is created by humans for humans, and we do not publish content developed using generative AI tools**"; "our **Medical Standards and Insights team** rigorously evaluates products and their respective brands before featuring them in our content. We also maintain a **healthy separation between our editorial and business teams**… for product reviews, product roundups, and articles with shopping links". Business model is ads + affiliate commerce (nav includes `Product Reviews → Vitamins and Supplements`, `Buy Ozempic Online`). **Efficacy graded: no. Magnitude: no.**

### WebMD — a documented *retreat* from consumer efficacy grading (both live and archived)
- **Current** (live `webmd.com/vitamins/ai/ingredientmono-873/creatine`, byline "Written by Chelsey McIntyre, PharmD | Medically Reviewed by Beth Johnston, BCPS, PharmD on **Jul 22, 2025**"). Screen order: `Uses` → `Side Effects` → `Warnings & Precautions` → `Interactions` → `Overdose/Missed Dose` → `Reviews (124)`. **No efficacy grade anywhere.** The efficacy statement is a single hedge: "Creatine is commonly used to build muscle and improve physical performance during certain forms of exercise… **The benefits of creatine for other uses are not well defined.**" Plus: "**The FDA has not reviewed creatine for safety and effectiveness.**"
- **2019** (Wayback `20190403182812`, same URL, then powered by "**Natural Medicines Comprehensive Database Consumer Version**"): the page carried a header "**Uses & Effectiveness ?**" with **graded bands**, verbatim: "**Possibly Effective for**" (Age-related muscle loss; Athletic performance; Syndromes caused by problems metabolizing creatine; Muscle strength), "**Possibly Ineffective for**" (ALS; Huntington's disease), "**Insufficient Evidence for**" (Skin aging; COPD…). Magnitude stayed in prose: "creatine seems to **modestly improve** upper body strength and lower body strength in both younger and older adults."
- **NatMed Pro itself** is fully paywalled to me — `naturalmedicines.therapeuticresearch.com/tools/effectiveness-checker.aspx` loaded (200) but shows only "Exclusive Subscriber Content… Subscribe Today!", and their editorial-principles URL 404'd. So I **could not open** NatMed's own published definitions of its effectiveness rating tiers. Examine's comparison page describes NatMed's surface as "**Comparative Effectiveness charts: easy-to-read charts that list all natural medicines and therapies used for a specific condition, ranked by level of effectiveness**" and criticises it: NatMed "**grades effectiveness at the level of the condition as a whole, without details about particular outcomes.** Research details are embedded within a paragraph."

**Read-across for us:** a big consumer publisher had a working consumer efficacy scale and removed it. I could not open a statement of *why*, so I will not speculate — but it is the most commercially significant data point in this lane.

---

## 7. Other published attempts at a benefit/effect score (and how they landed)

All opened live unless noted.

**AIS Sports Supplement Framework (Australian Institute of Sport) — HTTP 200.** A government-body ABCD classification explicitly built on "does it work". Framing page: "The **ABCD Classification system** ranks sports foods and supplement ingredients into four groups according to scientific evidence and other practical considerations that determine whether a product is **safe, permitted and effective** in improving sports performance." Guiding principles, verbatim: "**Is it safe? Is it permitted in sport? Is there evidence that it 'works'?**" Group definitions, verbatim from each group page:
- **Group A — "Evidence level: Strong scientific evidence for use in specific situations in sport using evidence-based protocols."** Use: "Permitted for use by identified athletes according to best practice protocols."
- **Group B — "Emerging and/or mixed scientific support, deserving of consideration in specific populations or situations. Individual athlete monitoring advocated to inform perceived efficacy and/or contraindications."**
- **Group C — "Scientific evidence not supportive of benefit amongst athletes OR no research undertaken to guide an informed opinion."** Use: "Not advocated for use by athletes."
- **Group D — "Banned or at high risk of contamination with substances that could lead to a positive doping test."** Use: "Not to be used by athletes."
Note the same D-band conflation Examine has ("not supportive of benefit **OR** no research"), and note that **Group D is a compliance band, not an efficacy band** — the ABCD axis silently switches meaning at D.

**ISSN Exercise & Sports Nutrition Review (Kerksick et al., *JISSN* 2018, PMC6090881) — full text opened via Europe PMC.** Verbatim: "all nutritional supplements discussed in this paper have been placed into **three categories based upon the quality and quantity of scientific support available: A) Strong Evidence to Support Efficacy and Apparently Safe; B) Limited or Mixed Evidence to Support Efficacy; C) Little to No Evidence to Support Efficacy and/or Safety**." Reception, in their own words: "**We understand and expect that some individuals may not agree with our interpretations of the literature or what category we have assigned a particular supplement**, but it is important to appreciate that some classifications may change over time as more research becomes available." Note this scale **fuses efficacy with safety** in bands A and C.

**Information is Beautiful, "Snake Oil Supplements?" — HTTP 200.** The best-known consumer visual attempt: "Which are the best supplements to take to enhance your health and wellbeing? **We visualised all evidence for all health supplements in one chart.**" Sourcing, verbatim from the credits: "**SOURCES: COCHRANE.ORG, PUBMED, EXAMINE.COM**"; research by Dr Stephanie Starling, Miriam Quick, Duncan Geere. Its unit of judgement is **supplement × condition**, and they say why: "You might see **multiple bubbles** for certain supplements… because some supps affect a range of conditions, but **the evidence quality varies from condition to condition**. For example, there's strong evidence that garlic can lower blood pressure. But studies on whether it can prevent colds have produced inconclusive results." Its axis is explicitly **evidence, not magnitude** — the changelog talks only about evidence level: "UPDATED Nov 2020: **Downgraded** many supplements due to new evidence and reviews… **Lowered evidence level** for L-Tyrosine and beta-glucans." (The bubble chart itself is JS/VizSweet-rendered; **I could not read the band labels off the axis**, only the prose and the changelog. Flagging as a gap, not a guess.)

**FDA's evidence ranking for qualified health claims — the cautionary tale (live, HTTP 200).** FDA's 2009 *Guidance for Industry: Evidence-Based Review System for the Scientific Evaluation of Health Claims* records the earlier attempt: "As part of the Task Force's final report, FDA developed an **interim evidence-based review system**…" and it has since been folded into a single non-graded standard: "After assessing the totality of the scientific evidence, **FDA determines whether there is SSA** [significant scientific agreement] **to support an authorized health claim, or credible evidence to support a qualified health claim.**" The current `fda.gov/food/food-labeling-nutrition/qualified-health-claims` page contains **no letter grades**, only: "they must be accompanied by a **disclaimer or other qualifying language** to accurately communicate to consumers the level of scientific evidence supporting the claim." The published verdict on the graded version is Kapsak et al. 2008 (quoted in §1.8): consumers couldn't discriminate four levels and **projected the grade onto unrelated product attributes**; and Berhaupt-Glickstein & Hallman 2017 found the replacement prose is no better — "**36 formats to present the evidence in 53 QHCs**", "**Seventy-seven percent (n = 41) demonstrate a reading level above 9th grade**", and "Policymakers might consider reforming QHC regulations so that a **hierarchy of evidence** for diet-disease relationships is **clearly communicated to consumers**."

---

## Design implications for the BS Proof "Effect" axis

1. **The gap is real and specific.** Every product here grades *evidence strength* or *literature direction*. Exactly one (Examine) grades *magnitude*, as a 3-level ordinal per outcome, and hides the actual numbers in prose notes behind a paywall. **No one anywhere converts evidence into a consumer magnitude-of-benefit for a healthy person.**
2. **"Healthy person" is the unclaimed niche.** Examine's grade is per condition/goal and admits it shifts with study population; Cochrane scopes by PICO; AIS scopes to elite athletes; NatMed/WebMD scope to indications. A *healthy-adult* magnitude estimate is not any incumbent's unit of analysis.
3. **Per-outcome is mandatory, and it is the hard UX problem.** Examine's own creatine page carries 380 graded rows and ~89% land in C/D. Any single-number Effect score must define its roll-up rule publicly or it will be indefensible.
4. **Copy Cochrane's two-axis grammar, not a single letter.** Table 15.6.b's magnitude × certainty sentence grid is the defensible pattern ("probably results in a **large** reduction" vs "**may** reduce … **slightly**"). A magnitude number with a separate, visible certainty qualifier beats one blended letter.
5. **Kapsak 2008 is the design constraint to engineer against:** consumers can't discriminate four evidence levels and **halo the grade onto safety, quality and value**. Mitigations: fewer bands; name the axis so it can't be read as "is this product good"; and never co-locate an Effect grade with an unrelated purity grade without an explicit legend.
6. **Do not silently switch axis meaning at the bottom band.** Examine's D ("very little research **or** null effect") and AIS's D (banned/contaminated) both break their own scale. A "no evidence" state must be a distinct state, not the bottom of the benefit scale.
7. **Absolute, not relative.** Cochrane requires absolute effects "as the number of people experiencing the event **per 1000 people**", or mean difference with CI, optionally in **minimal important difference units**. MID-normalised magnitude is the closest published thing to "how much better will my life be" and it is sitting unused in a consumer product.
8. **Dose and form are ungraded everywhere.** Examine's own grade ignores dose and form (both live only in prose). Folding dose adequacy and form bioavailability into the Effect axis would be genuinely novel — and I found no incumbent doing it.

---

## Could not open (labelled, not inferred)

| Target | Result |
|---|---|
| `examine.com` (all live URLs: `/about/grades/`, `/supplements/creatine/`, `/faq/...`) | **HTTP 429**, `Vercel Security Checkpoint`. Also via `r.jina.ai` proxy → same 429. Used Wayback snapshots (dates cited inline). |
| Examine+ / Examine Pro **dollar prices** | Not found in any snapshot I opened (client-rendered). **Unknown — not estimated.** |
| `cochranelibrary.com` full review + current-template "Key messages" PLS | **HTTP 412** (also with full browser headers). Used `cochrane.org` PLS pages + Handbook instead. |
| `consensus.app/results/?q=…` (live result UI) | **HTTP 403**. On-screen chip wording taken from their own blog posts. |
| `elicit.com/faq` | **HTTP 403**. Help-centre index only → **no Elicit findings reported.** |
| `scite.ai/faq`; `help.scite.ai/...` | 404 page; TLS error `tlsv1 unrecognized name`. No classifier methodology doc obtained. |
| NatMed Pro effectiveness-rating tier definitions | Paywalled ("Exclusive Subscriber Content"); `editorial-principles-process.aspx` → "Page Not Found". Tier labels quoted instead from the archived WebMD 2019 page that rendered them. |
| Information is Beautiful bubble-chart **axis band labels** | Chart is JS/VizSweet-rendered; labels not in server HTML. Prose + changelog quoted only. |
| Named published critique of **Examine's grading algorithm specifically** | **Does not appear to exist / not found.** Europe PMC `"Examine.com"` → 8 results, all approving; Wikipedia article has no criticism section. Substituted on-point critiques of consumer-facing letter-graded evidence (Kapsak 2008; Berhaupt-Glickstein & Hallman 2017) and Cochrane's anti-algorithmic-grading guidance, all clearly attributed. |
| Search engines (DuckDuckGo HTML/Lite, Mojeek) | Blocked / captcha. Discovery done via Wayback CDX API, Europe PMC REST API, and direct URL construction. |

## Sources opened (HTTP 200 unless noted)

- `training.cochrane.org/handbook/current/chapter-14`; `…/chapter-15`
- `cochrane.org/CD000980/ARI_vitamin-c-for-preventing-and-treating-the-common-cold`; `cochrane.org/CD007176`
- `web.archive.org/web/20250326181208/https://examine.com/about/grades/`; `…/20231128170531/…/about/grades/`
- `web.archive.org/web/20231218150705/https://examine.com/supplements/creatine/`; `…/20250804215749/…/supplements/5-htp/`; `…/20180529171753/…/supplements/creatine/`
- `web.archive.org/web/20251201232304/https://examine.com/membership/`; `…/20240209053853/…/plus/`; `…/20231128154328/…/examine-vs-natmedpro/`; `…/20260831093547/https://examine.com/`
- `consensus.app/home/blog/introducing-the-consensus-meter/`; `…/blog/consensus-meter/`; `…/blog/maximize-your-consensus-experience-with-these-best-practices/`; `consensus.app/pricing/`
- `scite.ai/llms.txt`; `scite.ai/reports/10.1186/s12970-017-0173-z`; `scite.ai/features`
- `healthline.com/about/content-integrity`; `webmd.com/vitamins/ai/ingredientmono-873/creatine`; `web.archive.org/web/20190403182812/…same URL`
- `ais.gov.au/nutrition/supplements`, `…/group_a`, `…/group_b`, `…/group_c`, `…/group_d`
- `fda.gov/.../guidance-industry-evidence-based-review-system-...`; `fda.gov/food/food-labeling-nutrition/qualified-health-claims`
- `informationisbeautiful.net/visualizations/snake-oil-supplements/`
- Europe PMC REST: PMID 18274974 (Kapsak 2008), PMID 26558421 (Berhaupt-Glickstein 2017), PMC6090881 (ISSN 2018), PMC12265102 (JISSN 2025)
- `en.wikipedia.org/wiki/Examine.com`
