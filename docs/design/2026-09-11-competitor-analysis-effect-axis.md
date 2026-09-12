# Competitor analysis — who grades whether a supplement actually works

Research 2026-09-11. Four parallel lanes (scanners, quality/testing, evidence-grading, AI-era apps), live pages opened and quoted; full briefs in the session artifacts. Parent independently opened and verified the Labdoor and FDA pages quoted below. No Grok used. Search engines were serving bot challenges throughout, so findings come from directly opened primary pages, store APIs and the Wayback Machine, not from a search index.

## The finding

**Nobody grades how much better a healthy person's life gets. Every player dodges it in one of four ways.**

| Dodge | Who | What the number actually measures |
|---|---|---|
| **Harm** | Yuka, EWG, Think Dirty, INCI Beauty, Open Food Facts | Hazard or nutrition. Yuka **refuses to rate supplements at all** |
| **Purity** | ConsumerLab, NSF Certified for Sport, Informed Sport, USP | Identity, potency, contamination, GMP. USP disclaims efficacy in writing |
| **Absorption, called efficacy** | **Labdoor** | See below — this is the important one |
| **Evidence for the claim** | Examine, Suppie, Prove It | How well the literature supports a claim. A well-evidenced tiny effect scores high |

### Labdoor calls bioavailability "Projected Efficacy"

Labdoor's 0–100 score has five components, one named **Projected Efficacy**. Their own methodology page defines it:

> "based on a product's active ingredients, their levels, and their **specific biochemical properties**… how well the body can **absorb and use** them… the **bioavailability** of each ingredient's form (e.g. zinc oxide vs. zinc citrate), their **pharmacokinetic (PK) profiles**"

That is *how much reaches your bloodstream*, not *whether it helps you*. It assumes the ingredient works. The most efficacy-sounding number in the market is a dissolution model — and it is not even rendered on the current public product page.

### Examine is the only one that separates size from strength

Examine grades A–F **per outcome** ("Letter grades correspond to general efficacy"), computed from "Magnitude of effect / Consistency of effect across studies / The number of studies". Its payload carries a real magnitude vocabulary — `No effect`, `Small/Moderate/Large Improvement`, `Small/Moderate/Large Increase`, `Small Detriment` — with arrows encoding direction and size 1/2/3.

Three limits we can exploit:

- **The numbers live in prose, never on the axis.** The creatine matrix shows `Power Output — Strong`, while the actual figure ("12% improvement in strength to 20%") sits in a free-text note.
- **Magnitudes are "entered by hand by our expert research team"** — not computed, and not reproducible.
- **It is paywalled**, and it has **no product-level data at all**: no brands, no SKUs, no barcode, no dose-on-your-label comparison. On the creatine page, ~89% of graded outcomes are C or D, and D deliberately merges "very little research" with "the effect is null".

### The scientific benchmark does what we want — in sentences

Cochrane's Handbook Table 15.6.b crosses **effect size** (large / moderate / small important / trivial or none) with **certainty** (high / moderate / low / very low) into narrative templates: *"X results in a large reduction in outcome"* vs *"X may result in little to no difference"*. Absolute effects are required, "as the number of people experiencing the event per 1000 people", with confidence intervals, optionally "expressed in minimal important difference units".

So the method exists. Nobody has put it on a phone.

## Two market signals

**The category leader publicly concedes the gap.** SuppCo (29,337 iOS ratings, 100k+ Play downloads) scores 30+ quality attributes and no efficacy. Its co-founder, announcing the Function Health acquisition on 12 May 2026:

> "For a long time, we've believed the missing piece in supplementation is the answer to this question: *'is it actually working?'*… until you can see how it's actually moving the numbers in your labwork, you're working from educated guesses and not results."

Their answer to efficacy is **not a score — it is blood tests**. That is a different, expensive product, and it leaves the cheap answer unclaimed.

**A shallow cohort has already grabbed the word.** A 2025 wave of scanners — Prove It (15.7k ratings), Suppie, Suppi, SuppScan — ships a literal "Efficacy" sub-score on the result screen. Suppie renders `Suppie Score 92/100 · Cleanliness 96 · Efficacy 88`. Prove It's disclosed sourcing is *"Based on PubMed, Wikipedia, and 23 other sources"*, with **no methodology page**, and its own users call the score "arbitrary". The word is taken; the work is not done.

Also relevant: **Care/of is dead** (closed June 2024), and Rootine has pivoted away from personalisation. Personalised-supplement-by-questionnaire is a proven graveyard.

## Two warnings we should take seriously

**Consumers cannot read four-level evidence grades, and they bleed.** Kapsak et al. 2008 (PMID 18274974), on FDA's four-level ranking:

> "Consumers found it difficult to discriminate across four levels and showed inclination to **project the scientific validity grade onto other product attributes**. Consumers showed preference for simpler messages."

An Effect grade of 3 will be read as "this product is good" — safe, pure, worth the money. Berhaupt-Glickstein & Hallman 2017 (PMID 26558421) found the same: "consumers misinterpret QHCs as a whole product evaluation". This is an argument for per-outcome answers in plain words and against any single global product number — which is what we already decided when we removed Overall.

**The regulatory line is about claims, not scores.** FDA: a product "represented explicitly or implicitly for treatment, prevention, or cure of a specific disease… meets the definition of a drug". Structure/function claims require the "not been evaluated by the FDA" disclaimer. We are describing published evidence rather than making a claim for a product, but the healthy-enhancement scope keeps us well clear of the disease line, and that is another reason to keep deficiency correction and treatment on a separate track.

## What this means for the Effect axis

The axis we have been arguing about for a week is **the one thing no competitor has built**, and the gap is now evidenced rather than assumed.

Worth stealing:
- Examine's **per-outcome** grading and its **direction-vs-valence** split (`Increase` for a neutral marker, `Improvement` for something you want) — that is exactly the surrogate problem our ladder caps at 1.
- Examine's population handling: the same supplement carries different grades on different pages "because we use different evidence depending on the population".
- Cochrane's **magnitude × certainty** pairing, its absolute-effect format, and its warning: "A common mistake is to confuse 'no evidence of an effect' with 'evidence of no effect.'"

Worth avoiding:
- Labdoor's equivocation — never let "efficacy" mean absorption.
- Examine's consistency %, where `2 studies / 50%` and `45 studies / 75%` render identically.
- A single product-level number, per Kapsak.

Where we would be first: **magnitude of real-life improvement, for a healthy person, against the dose on the label.** Examine has magnitude but no product, no dose fit and a paywall. Labdoor has the product and the dose but calls absorption efficacy. SuppCo has the scan and the market and has publicly given up on the question. Nobody joins them.

The honest cost, unchanged: where the evidence only supports a lab marker or has no threshold, we must say "measurable, not felt" or "size not graded" rather than invent a tier. Our own caffeine attention row lands at 1 for exactly that reason.

## Access limits

Examine blocks server fetches (HTTP 429, Vercel checkpoint) — all Examine evidence is from Wayback snapshots, timestamps recorded in the lane brief. EWG returns 403 to curl; read via Wayback. Cochrane Library full text returned 412. Examine+/Pro price points could not be retrieved and are not guessed. Prove It and Suppi were visible only as store listings; Suppi's site has no DNS. No critique of Examine's grading algorithm specifically could be found, and none was invented.
