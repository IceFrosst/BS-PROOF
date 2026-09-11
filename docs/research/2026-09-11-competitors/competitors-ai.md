# Competitor Brief — AI-Era Supplement Scanners & Personalised Supplement Services

**Lane:** New AI supplement/health-scan apps + personalised supplement subscriptions.
**Question:** At scan/lookup, what does each product SHOW, and does it grade whether the supplement *works* (Effect) as opposed to purity/quality/safety?
**Method:** Live `curl` against App Store iTunes Search/Lookup API, Google Play, vendor sites, vendor methodology pages, Wayback Machine, Europe PMC / PubMed full text. No xAI/Grok used. Research date: current session.
**Search caveat:** Google, Bing, DuckDuckGo and all SearXNG instances tried returned bot-blocks (202/403/429) or ignored the query. All findings below therefore come from **directly opened primary pages and open APIs**, not from a search index. Where I could not open something, it is labelled.

---

## Headline finding

**Nobody in this lane grades "how much real improvement a healthy person gets."** The category has split into two dodges:

1. **Quality/purity proxy** (SuppCo, and the whole Yuka-style scanner genre) — grades certifications, fillers and testing, and calls it a trust score.
2. **Evidence-for-the-claim proxy** (Suppie, Suppi, Prove It Health) — grades *how well the literature supports the label's stated claim*. That is a claim-substantiation score, not an effect-size score. A well-evidenced claim of a tiny effect scores high.

The strongest confirmation is from the market leader itself. SuppCo's co-founder, announcing the Function Health acquisition (12 May 2026), wrote:

> "For a long time, we've believed the missing piece in supplementation is the answer to this question: *'is it actually working?'* You can have a high-quality stack that's meticulously dosed and scheduled, but until you can see how it's actually moving the numbers in your labwork, you're working from educated guesses and not results."
> — Nick Michlewicz, Co-founder & COO, SuppCo, [supp.co/articles/founders-note-14-function-acquires-suppco](https://supp.co/articles/founders-note-14-function-acquires-suppco) (opened)

The #1 scanner by review count publicly concedes efficacy is unsolved, and its answer is not a score — it is to be acquired by a blood-testing company. **The Effect axis is open.**

---

## Table

| Product | Opened? | Number shown at result | Computed from | Efficacy graded? | Market signal | Price |
|---|---|---|---|---|---|---|
| **SuppCo** | ✅ full result page | `TrustScore® 8.94 / Very good` (1–10) | 30+ quality indicators, 5 categories | ❌ **No** — quality/certification only | iOS 4.82, **29,337** ratings; Play 4.2, 100K+ dl | Free + Pro sub |
| **Suppie** | ✅ methodology page | Grade `A–D` + `Suppie Score 92/100` | Cleanliness + Efficacy + Safety | ⚠️ **Partly** — "Efficacy" = evidence-for-claim | iOS 4.53, 147 ratings | Paid only, no free tier |
| **Prove It** | ⚠️ store listing only | Score exists (users call it "arbitrary") | **Unpublished** | Claimed, unverifiable | iOS 4.42, **15,697**; Play 4.3, 100K+ dl | $29.99–$99.99/yr |
| **Suppi** | ⚠️ store listing only | "Safety, Efficacy & Transparency" scores | **Site dead (no DNS)** | Claimed, unverifiable | iOS 4.33, 100 ratings | Free + $2.99/wk |
| **Prove It Health** (UK) | ✅ score page + review | `Prove It Score 3.2 / 5 — Moderate` | 5 evidence criteria | ✅ **Yes** — genuinely efficacy | No app; web only | Free/ad |
| **Viome** | ✅ product page | `70+ health scores`, e.g. `Maintain 86` | RNA sequencing → proprietary | ❌ No — biomarker scores, not supplement effect | iOS 4.63, 5,635 ratings | $399 test / $119 mo |
| **Care/of** | ✅ via Wayback | — | — | **DEAD** — closed June 2024 | Domain does not resolve | — |
| **Rootine** | ✅ site | None | — | ❌ **Pivoted** away from personalisation | 72 reviews on sole product | $12.50–$24.99 |
| **Gainful** | ✅ site | None | — | ❌ No | "300,000+ customers" (self-claim) | Subscription |
| **Blueprint** | ✅ site | None (sells, doesn't grade) | — | ❌ No | $60M raised | $333/mo Basics |

---

## 1. SuppCo — the market leader, and it does NOT grade efficacy

**Opened:** `supp.co`, `supp.co/trustscore`, a live product result page, manifesto, experts page, acquisition note. App Store Lookup API.

### (1) Result screen, in order, actual wording
From the live page for Sports Research Creatine Monohydrate ([supp.co/products/sports-research-creatine-monohydrate-unflavored](https://supp.co/products/sports-research-creatine-monohydrate-unflavored), opened). Page `<title>` is literally `Sports Research Creatine Monoh – TrustScore® 8.9/10 | SuppCo`:

1. Brand — `Sports Research`
2. Product — `Creatine Monohydrate (Unflavored)`
3. **`8.94`** / **`Very good`** / **`Tested`** badge
4. `Servings 100` · `Price/serv $0.28` · `From $27.95` · `Format powder`
5. Buttons: `Shop`, `Add to stack`
6. `TrustScore®` block repeating `8.94` `Very good` `Tested` + `Learn More`
7. Breakdown rows: `Inactive ingredients` · `Manufacturing Standards` · `Testing Benchmarks` · `Product Quality` · `Product Certifications` · `Technical Innovation`
8. `Nutrients` — `Micronized Creatine Monohydrate  5g`
9. `Suggested use:` free text
10. `How this compares to other Creatine products`: `Popularity — Top 10%`; `Quality rank — High` ("Higher TrustScore than 96% of Creatine products"); `Cost rank — Affordable` ("More affordable than 77% of Creatine products")

**Note what is absent: nothing on the page states whether creatine produces a benefit, for whom, or how large.** The word "efficacy" does not appear on the result screen.

### (2) The number and its published methodology
Quoted from [supp.co/trustscore](https://supp.co/trustscore) (opened):

> "SuppCo's proprietary rating system scores brands and products on a **10-point scale** based on their ability to deliver against **30+ key quality attributes**." Scale rendered `1 … 10`, labelled `Worst` → `Best`.
> "Every product is awarded a score based on a thorough evaluation of how well it delivers on **30+ quality indicators across 5 key categories**."

The five categories and their contents, verbatim from the page:
- **Manufacturing Standards** — cGMP Certified, Made in USA, Manufacturer cGMP Certified by NSF
- **Product Certifications** — USP Verified, Vegan Action, Informed Sport, Informed Choice, Non-GMO Project, Gluten-Free, NSF Certified for Sport, USDA Organic, Clean Label Project, iGEN, NSF Contents, Eurofins ×2, TESTED by SuppCo
- **Product Quality Indicators** — Patented/Organic/Gluten-Free/Non-GMO/Vegan Ingredients, Free from Artificial Flavors Colors Fillers, Contains Proprietary Blend, Labeling Discrepancy, Received FDA Warning Letter, Active FDA Recall
- **Testing Benchmarks** — 3rd Party Lab Tested, Raw Ingredient Testing, Identity/Purity/Potency, Lot Tested, Public Batch-Specific COAs, Heavy Metals, ISO 17025
- **Innovation** — "Founder, CEO, CSO or CMO has PhD, MD, DO, ND or PharmD", "Clinically Studied Products", "Practitioner-Grade Integration"

**Band names observed live:** `8.94 → Very good`; `9.56`, `9.69`, `9.81 → Excellent`. I could not surface bands below 8.9 on the category pages I opened — lower band names are **unverified**.

### (3) Is efficacy graded? **No.**
All 30+ indicators are certification, manufacturing, testing or labelling attributes. The only efficacy-adjacent item is in "Innovation": *"Clinically Studied Products"* and *"Founder, CEO, CSO or CMO has PhD, MD…"* — these reward the **brand** for having done trials or hired credentialled people. They do not assess whether the ingredient produces a benefit, or how big it is. **This is a credentials proxy, not an effect measure.**

### (4) Dose, form, population
- **Dose:** shown as a fact (`5g`) and compared on price-per-serving. There is a separate in-app pillar — the site exposes `/my/suppscore/hub/dosage`, `/goals`, `/quality`, `/value`, indicating a stack-level **"SuppScore"** with those four pillars (URLs opened but render client-side behind login; **pillar contents unverified**). The App Store description says: "recommendations on what nutrients are recommended for your age and sex, which brands you can trust, **how to improve your dosages**".
- **Form:** shown as a filter/attribute (`Format powder`); the App Store text lists "form factor" as a search consideration.
- **Population:** age/sex-based nutrient recommendations at stack level only, not on the product result screen.

### (5) Personalisation
Stack tracker, smart schedule, reminders, "80+ supplement protocols", and **Expert Protocols** launched May 2025 with 7 named experts — Mark Hyman MD, Natalie Crawford MD, Thomas DeLauer, Darshan Shah MD, Robin Berzin MD, Bruce Hoffman MD, Lanae Mullane ND ([supp.co/about/experts](https://supp.co/about/experts), opened). Personalisation is **goal- and demographic-based, not biomarker-based** — which is precisely the gap the Function acquisition is meant to close.

### (6) Evidence sourcing
**No study citations on the product result screen.** No published evidence-grading rubric. The TrustScore inputs are certifications and audit facts, which require no literature at all. There is a `/health-research` section (not opened in depth).

### (7) Business model
Free app + "Pro membership" (price not published on the pages I opened — **unverified**). Claims independence: "We are not affiliated with any supplement brand" (App Store description). Product pages carry a `Shop` button — affiliate/retail referral is the likely monetisation (**inferred, flagged as inference**). Database claimed at 160,000+ products, 500+ brands scored.

### (8) Strongest criticism
The strongest criticism is **SuppCo's own admission**, quoted in full at the top of this brief: efficacy — "is it actually working?" — is "the missing piece," and TrustScore does not answer it. Corroborating detail from the same opened page:

> "Today, we're thrilled to announce that **SuppCo is becoming part of Function Health.**… we're excited to join forces to build something that's never been built before: a clear line from your biology to your supplement stack, with a continuous window over time into **what's actually working for you**."
> — supp.co, 12 May 2026

Secondary, **structural** criticism (mine, flagged as analysis not quotation): SuppCo's Expert Protocols are fronted by Dr Mark Hyman, who is simultaneously **Function Health's Chief Medical Officer** — the acquirer. The page states this openly: *"Mark is Function's Chief Medical Officer and SuppCo's Expert on Longevity and Brain Health."* An "independent" scoring platform whose headline expert is the CMO of its acquirer is a conflict worth naming, though I found no third-party critic making this point and **I could not open any published critique of SuppCo specifically.**

### (9) Coverage / limits
160,000+ products, 500+ brands (self-claimed). TrustScore requires known certification/testing attributes, so obscure store brands with no published certifications will score structurally low regardless of formulation. Google Play: `100K+` downloads, `4.2` stars (opened). A one-star iOS review confirms the scale is read as a quality number: *"Because of this app I found several of my supplements had terrible ratings. Switched to those with ratings >8!"*

---

## 2. Suppie — the only scanner with a real, published "Efficacy" sub-score

**Opened:** [suppie.app](https://www.suppie.app/), [suppie.app/methodology](https://www.suppie.app/methodology), `/vs/examine`, `/vs/supp`. App Store Lookup API. Seller: **CLEARER HEALTHTECH LTD**. iOS **4.53**, **147** ratings.

### (1) Result screen, actual wording
From the homepage "Anatomy of a Suppie report" and the live demo (Pure Encapsulations Vitamin D3 Liquid), verbatim:

```
Pure Encapsulations Vitamin D3 Liquid
Suppie Score  92 /100
Cleanliness 96 · Efficacy 88 · Safety risk low
```
Flow stated as: `01 Scan` → `02 Understand` ("See a letter grade plus Cleanliness, Efficacy, and Safety, with ingredient-level detail") → `03 Decide`.

Report contents per the App Store description and methodology page:
- "A grade from **A (Very Clean) to D (Very Unclean)**, plus a **Suppie Score** based on Cleanliness, Efficacy and Safety"
- Every active and inactive ingredient, with dose
- "A **beneficial, low, medium or high-risk** rating"
- "Claimed benefits ranked from **Slight to Very Strong** by evidence quality"
- Interactions, side effects, 12 common allergens
- "Cited research so you can check it yourself"

### (2) Published methodology — quoted
Grade table verbatim:

| Grade | Label | What it means |
|---|---|---|
| A | Very Clean | No artificial fillers. Considered clean. |
| B | Moderately Clean | Some fillers, not harmful in small amounts. |
| C | Not Clean | Multiple additives some may find undesirable or potentially harmful. |
| D | Very Unclean | Many additives, some potentially dangerous. |

> "**Cleanliness.** Starts at 100, with deductions for fillers and additives based on risk classification. Beneficial ingredients do not reduce the score. Capsule shells and coatings are excluded from the calculation.
> **Efficacy.** Reflects the **quality, consistency, and relevance of the clinical evidence supporting the product's stated claims**. Higher scores indicate stronger evidence — not stronger marketing.
> **Safety.** Derived from documented adverse effects, interactions, allergenicity, and dosing considerations.
> **Suppie Score.** Integrates Cleanliness, Efficacy, and Safety into a single number. **Weighting can shift in response to product-specific risk signals**, so the most clinically relevant dimension carries the most influence for that product."

Evidence scale, verbatim: "Claimed benefits are rated by the strength of the evidence behind them, on a five-point scale: **Slight, Mild, Moderate, Strong, Very strong.**"

### (3) Is efficacy graded? **Partly — and this is the key distinction for us.**
Suppie has the most honest efficacy attempt in the scanner category, but read the definition carefully: Efficacy = *"the quality, consistency, and relevance of the clinical evidence supporting the product's **stated claims**."*

That is **claim substantiation, not effect size.** Three structural consequences:
- A product claiming something trivially true and well-studied scores high on Efficacy even if the real-world benefit to a healthy adult is ~zero.
- The scale is anchored on **evidence strength** (Slight→Very strong), never on **magnitude of improvement**.
- Efficacy is measured against whatever the brand chose to claim, so **the brand sets the goalposts.** A modest claim is easier to substantiate than an ambitious one — the rubric rewards under-claiming.
- Note also that the **headline letter grade A–D is cleanliness-only** ("Very Clean"…"Very Unclean"). The efficacy component is buried in the composite number, not the letter the user actually sees first.

This is exactly the gap an "Effect" axis fills. **Suppie answers "is the claim supported?"; nobody answers "how much better will I actually feel?"**

### (4) Dose, form, population
Best in class among the scanners, on the strength of the published rubric:
- **Dose:** every ingredient listed "with its dosage where declared"; "upper safe intake where established"; the marketing copy explicitly calls out the elemental-vs-compound trap — *"whether the 200mg shown is elemental magnesium or the whole compound."* Dose is checked for *safety and declaration*, but there is no published statement that Efficacy is scored against **clinically effective dose thresholds** — that is the obvious hole. **Unverified whether under-dosing lowers the Efficacy score.**
- **Form:** absorption is a marketing theme ("whether the magnesium on your counter is poorly absorbed") but form/bioavailability does **not** appear as a named scoring input in the published rubric.
- **Population:** strongest differentiator. "For Every Body" — explicit personas for parents (polypharmacy interactions), kids ("'for kids' is a marketing category, not a safety standard"), and self. But population is used for **safety**, not to modulate the Efficacy score.

### (5) Personalisation
"Users can also set personal filters so reports flag toxic inactives, artificial ingredients, fillers, preservatives, banned substances, and heavy metals **against their own thresholds**." Whole-routine grading: "Add an entire routine and Suppie grades it as [a combined grade]".

### (6) Evidence sourcing — best in category
> "Every analysis cites the research behind it. Sources include **peer-reviewed literature indexed in PubMed, the NIH Office of Dietary Supplements**, and comparable published clinical references. Citations appear in every report so any conclusion can be traced back and checked."

### (7) Business model — subscription, no free tier, explicitly anti-brand-money
> "**WHY THERE'S NO FREE VERSION.** Free apps still have to make money, and in this category it often comes from the brands being rated: placements, referral deals, sponsored swaps and 'recommended alternatives.' **Once a grade can be bought, it becomes advertising.**"
> "Suppie earns affiliate commission on some retailer links; that commission is **paid by the retailer, not by supplement brands**, and has no bearing on any score."

Also runs aggressive competitor-comparison SEO: `/vs/examine`, `/vs/supp`, plus a separately-registered domain `prove-it.app` (see §3).

### (8) Strongest criticism
**No named external critic exists** — the app has only 147 ratings and I could find no published analysis of it. The strongest criticism is the company's own disclosed limit, which is also the honest one:

> "Suppie does **not** perform laboratory assays and does not verify that a bottle's physical contents match its label. Purity and label-accuracy verification requires third-party lab testing, which is a separate discipline. **Suppie is a formulation analysis tool, not a testing laboratory.**"

So Suppie grades the *declared* label. If the bottle is mislabelled or contaminated, the grade is meaningless — the exact inverse of SuppCo's blind spot. Neither can see both.

**Minor credibility flag:** the site states "**4.7 ★** on the App Store · 10,000+ downloads" in its footer. The live iTunes Lookup API returned **4.53** with 147 ratings. Small, but it is a self-reported figure that does not match the live API.

### (9) Coverage
"Suppie has analyzed more than 16,000 products." Claims label-reading rather than catalogue lookup: "Suppie reads labels instead of relying on a fixed list. Store brands, regional products… scan it and get a full report." iPhone only.

---

## 3. Prove It — 15,697 ratings, claims efficacy, publishes no methodology

**Opened:** App Store listing (Lookup API), Google Play page, App Store review RSS feeds. **Could NOT open:** any Prove It methodology, about, or scoring page — **the developer publishes no website.** The App Store `sellerUrl` field is `None`; the only developer link on Google Play is a Notion privacy policy (`prove-it.notion.site`). Seller: **Control. Alt. Delete. LLC**.

⚠️ **Domain warning, important:** `prove-it.app` is **not** owned by Prove It. It resolves to a competitor SEO landing page titled *"Prove It App Alternative 2026"* with a `Try Suppi Free` button. Any pricing or criticism from that domain is **competitor-sourced and must be discounted.** `proveit.health` is a **different, unrelated UK company** — covered separately in §5.

### (1) Result screen
**Could not verify.** The app is paywalled with no free tier and I did not install it. From the App Store description, the claimed output is:
- "Access **evidence-based analysis of supplement efficacy and safety**"
- "What the research actually says about **effectiveness**"
- "Known safety considerations and interactions"
- "Recommended dosages based on clinical studies"
- "**Quality of the available evidence**"

From user reviews (opened via iTunes review RSS), the actual screen appears to show a single numeric score: *"after you input all your information, it just gives you an **arbitrary score** and nothing else."*

### (2) Number / methodology
**No published methodology exists.** This is the finding. An app with 15,697 iOS ratings and 100K+ Play downloads claims to grade supplement *efficacy* and publishes nothing about how.

### (3) Efficacy graded? **Claimed, unverifiable.** Marketing is the most efficacy-forward in the category ("what the research actually says about effectiveness"), with zero published substantiation.

### (4)–(6) Dose/form/population/evidence: claims "recommended dosages based on clinical studies" and "quality of available evidence." Unverifiable.

### (7) Business model
Subscription, hard paywall, no free scanning. Prices from user reviews (primary, but self-reported): **"$70 for the yearly subscription"**, **"charged 39.99 for months"**, and a **"$29.99"** cross-sell "wellness bundle". A competitor page claims $29.99–$99.99/yr — **competitor-sourced, treat as indicative only.** One reviewer reports the developer runs a family of scanner apps: *"This developer has multiple other apps (Eden, Nori)… a wellness bundle inside this prove it app for 29.99."*

### (8) Strongest criticism
No named critic or regulator. But the App Store review corpus is damning, and one reviewer articulates **precisely the ingredient-vs-product gap** that any Effect axis must solve:

> "Reported rating based on what is generally known about ingredients, **not based on actual tests of the ingredients of the specific brand**. Absolute fantasy ratings. You might have the worst brand ever laced with mercury, would not know and would get a high rating because box said NMN. **Evidence based means that NMN works but the container you scanned might have trash.**"
> — 1★ App Store review, "Not based on facts about brands or 3 party studies" (opened via iTunes review RSS)

Others:
> "Misleading advertising, fake reviews… **inaccurate AI slop that tells you literally nothing.** No studies, no evidence, not even accurate information about products." — 1★
> "**CLICK BAIT! App is a front end for a supplement subscription.** The ad for this app claimed it was a tool for scanning your supplements so you could see **effectiveness ratings**." — 1★
> "You can search for one supplement brand and kind and **several show up of the exact same thing with different ratings across the board**." — 1★

**Severity flag:** the 4.42 lifetime average diverges sharply from the recent-review stream. Of the 13 most-recent reviews I pulled, **12 were 1★ and 2★** (server errors, empty database, billing disputes, "database is completely empty"). Several reviewers allege the rating prompt fires *before* the user sees the paywall — *"Asks for a rating before creating an account and then shows you have to pay"* — which would inflate the aggregate. Treat 4.42 as a **soft signal**; 15,697 ratings is a real distribution signal, the star average is not.

### (9) Coverage
Repeatedly reported as thin: *"I take 10-15 supplements daily and it only recognized 3."* / *"the database is completely empty."*

---

## 4. Suppi (Vitaminchat OU) — claims an Efficacy score, website does not exist

**Opened:** App Store listing only. iOS **4.33**, **100** ratings. Carries the App Store advisory `Frequent/Intense Medical/Treatment Information`.

App Store description, verbatim:
> "Check **safety, efficacy, and transparency scores** powered by 500+ clinical studies (PubMed, Harvard Health, Mayo Clinic)."
> "**Unbiased safety scores** → Every product rated on **Safety, Efficacy & Transparency** so you know what's safe and effective."
> "Access a verified database of **200k+ supplements & vitamins**."

**Could NOT open:** the declared seller URL `https://aisupplement.app` — **no DNS record exists** (`getent hosts aisupplement.app` returns nothing). So: a three-axis score including Efficacy, claimed to rest on 500+ clinical studies, with **no reachable website and no published methodology**. Support email is `support@supplementai.app`, a different domain again.

- **Efficacy graded?** Claimed as a named axis. **Entirely unverifiable.**
- **Personalisation:** "AI-powered coaching", stack builder, "avoid unsafe combos", community feed.
- **Business model:** free + premium, "from $2.99/wk" (figure from the `prove-it.app` comparison page — **competitor-sourced**, and that page promotes Suppi, so likely accurate for Suppi but still second-hand).
- **Criticism:** none published that I could open.

**Naming hazard for our own comms: "Suppi" (Vitaminchat OU) and "Suppie" (CLEARER HEALTHTECH LTD) are two different companies with near-identical names and both claim an Efficacy score.**

---

## 5. Prove It Health (proveit.health) — the ONLY product I found that genuinely grades efficacy

**Opened:** homepage, scoring methodology article, a full product review. UK company, Kington, Herefordshire. **Unrelated to the "Prove It" app in §3.** No app; web only.

This is the closest thing to our Effect axis that exists, and it is worth studying closely — including where it falls short.

### (1) Result screen, actual wording
From [proveit.health/review/ancient-brave-true-collagen-powder](https://proveit.health/review/ancient-brave-true-collagen-powder) (opened):

```
Ancient + Brave True Collagen Powder
[tags] Menopause · Perimenopause
Prove It Score   / 5
3.2   Moderate

Can they prove what they say?
"Only some of it. The bone health evidence is promising, but only in certain
collagen formulations--not the whole category. The skin claims were positive,
but a recent study shows that's only the case in trials funded by the
manufacturers. The rest of the claims are unsupported by any real evidence."

Claims to help with: Bone Health · Joint / muscle health · Insomnia · Skin health · Fatigue
Bottom Line / Ingredients / What is it? / What do the guidelines say? / What does the evidence say?
```

Homepage framing: *"Independent Prove It Scores for supplements, HRT, and over-the-counter products. **Scored against the clinical evidence behind their claims, not their marketing.**"*

### (2) Published methodology — quoted in full
From [proveit.health/womens-health-articles/how-is-the-prove-it-score-calculated](https://proveit.health/womens-health-articles/how-is-the-prove-it-score-calculated) (opened):

> **What the scores mean**
> **5 out of 5:** Strong, high-quality evidence from many good studies. Recommended in UK guidelines.
> **3 out of 5:** Some evidence it helps, but not as strong or consistent.
> **1 out of 5:** Little or no reliable evidence that it works for menopause symptoms.
>
> **What we look at** — Each product is scored on five things:
> 1. **Quality of the research** — Are there proper clinical trials, or just small or low-quality studies?
> 2. **Amount and consistency of evidence** — Have lots of studies found similar results, or are findings mixed?
> 3. **Relevance to women in the UK** — Were the studies done in peri- or postmenopausal women, and do they match the symptoms UK women experience?
> 4. **Safety** — Is it generally safe, and is there good information about side effects?
> 5. **Guideline support** — Do trusted UK bodies like **NICE or the British Menopause Society** recommend it?

### (3) Efficacy graded? **Yes — genuinely, and this is the benchmark to beat.**
Three things they get right that nobody else does:
- **Population relevance is a scoring criterion**, not a footnote (criterion 3).
- **Guideline anchoring** (NICE NG23, British Menopause Society, NAMS) gives an external, non-self-serving reference point.
- **Funding-bias adjustment is applied explicitly.** The collagen review states: *"when the researchers separated studies by funding source, those **not funded** by pharmaceutical or supplement companies showed **no significant effect** on skin hydration, elasticity or wrinkles. Industry-funded studies showed significant effects. **High-quality studies showed no significant effect across any skin outcome.**"*

**But note the ceiling:** the score still runs on *evidence strength*, not *effect magnitude*. `5/5` means "strong evidence + guideline-recommended", not "large improvement". A cheap, well-proven, tiny-effect intervention scores 5. **Effect size remains ungraded even here.**

### (4)–(6) Dose/form/population/evidence
Form-specificity is handled well in prose — *"only in certain collagen formulations—not the whole category"* — but is **not a separate scored axis**. Population is scored (criterion 3). Evidence is cited with numbered references to named meta-analyses (2021 n=1,125; 2023 n=1,721; 2025 n=1,474; 2026 umbrella review of 16 SRs / 113 RCTs / ~8,000 participants) and to NICE NG23 and the 2023 NAMS Non-Hormone Therapy Position Statement. **This is by far the most rigorous evidence handling in the lane.**

### (7) Business model
Unclear — no paywall, no visible ads or affiliate links on the pages I opened. Single named author ("Amy"), a UK street address, a personal contact email. **Looks like a one-person editorial project, not a funded company** (flagged as inference).

### (8) Strongest criticism
No external critic exists. The strongest criticisms are observable defects on the live page:
- **Unfinished content shipped live.** The review I opened has **Lorem ipsum placeholder text** in two of its named sections: `Bottom Line` and `Ingredients` both read *"Lorem ipsum dolor sit amet, consectetur adipiscing elit…"*. A product whose entire proposition is rigour is publishing reviews with dummy copy in the summary field.
- **Score precision is unexplained.** The published rubric describes 5/3/1 anchors, but the displayed score is `3.2`. How five qualitative criteria combine into one decimal is not stated — the same opacity SuppCo has, at smaller scale.
- **Scope is one condition in one country** (UK menopause). Not a general supplement grader.

### (9) Coverage
Small: roughly 4 product reviews and ~15 articles visible in the site's link graph. Categories: Vitamins & Supplements, Over-The-Counter, Prescription Medicines.

---

## 6. Viome — 70+ scores, none of which is "does this supplement work"

**Opened:** viome.com homepage, `/products`, `/products/full-body-intelligence`. App Store Lookup. **Could NOT open:** `viome.com/science` and `/pages/science` both 404.

### (1) Result screen
Not a scanner — a test-then-subscribe funnel. Per the opened product page, output is in-app:
- `70+ health scores` including named ones: `BioAge™`, `InflammAging™`, `Gut Lining Health`, `Metabolic Fitness`
- Score rendering observed: `Gut & Digestive Health` — `Maintain` — `86`. Band words present in page text: `Maintain`, `Average`, `optimal`. **Full band ladder unverified.**
- `370+ personalized food recommendations`
- App tabs: `1. Health · 2. Nutrition · 3. Formulas · 4. Plan`
- Steps: `Order & Collect` → `Send & Analyze` → `Receive & Evolve Your Plan` → `Order Personalized Supplements`

### (2) Number / methodology
> "300K+ Biomarkers Analyzed"; "we analyze microbial activity across **400+ biological pathways**"; "**RNA, not DNA**. DNA is fixed. RNA shows what you can change."

**No published scoring methodology.** No equation, no weighting, no validation study linked from the pages I opened. The 70+ scores are proprietary.

### (3) Efficacy graded? **No — and this is the category's most expensive dodge.**
Viome grades **you**, not the supplement. There is no score anywhere stating how much benefit a given supplement delivers. The efficacy claim is transferred entirely to **self-reported testimonial statistics** displayed as if they were outcome data:

> "**91%** improved digestion · **92%** better energy · **94%** improved mood — *Self-reported after 6 months following Viome recommendations*"
> "**90%** Feel measurable improvements within 90 days · **67%** Report better sleep within 90 days · **4 years** Average biological age improvement within 12 months — *Aggregated from self-reported outcomes, 2,800+ members.*"
> "9 out of 10 people feel less bloated. — *Aggregated from Viome customer reviews*"

Uncontrolled, unblinded, self-selected, self-reported. Presented in the visual position where a trial result would go.

### (4) Dose, form, population
> "50+ personalized ingredients—vitamins, minerals, and herbs—blended into 8 daily capsules and **dosed to your unique biology**. Our scientists handpick each ingredient from a portfolio of **200+ options** based on your Viome health scores, **clinical trial dosages**, and life stage."

"Clinical trial dosages" is the only dose anchor stated. Form is fixed (capsules, powders, lozenges, toothpaste). Population handled via "life stage" and condition verticals (Gut, Brain & Mood, Healthy Aging, Metabolic, Women's Health).

### (5) Personalisation
The entire product. Retest every 6 months; plan updates each time. CLIA-certified lab.

### (6) Evidence sourcing
**No study citations on the consumer pages I opened.** Mechanistic assertions only.

### (7) Business model
Verified live from the product pages:
- **Full Body Intelligence™ Test — $399** (gut + oral microbiome + cellular blood, 70+ scores)
- **Gut Intelligence™ Test — $279** (25+ scores)
- **Precision Supplements — $119/month**, "First charge when your test results are ready"
- Free Advanced TriSynbiotic, "$69 value", as an acquisition incentive
- HSA/FSA eligible

**This is the structural conflict:** the test that diagnoses the deficiency is sold by the company that sells the supplement that fixes it.

### (8) Strongest criticism — peer-reviewed, named, and directly on point

**(a) Journal of Law and the Biosciences, 2025** — Hoffmann DE, Langel FD, von Rosenvinge EC, Palumbo FB, Roghmann MC, Ravel J. *"Is the current regulatory framework for direct-to-consumer microbiome-based tests sufficient to protect consumers from medical, economic, and dignitary harms?"* PMID 41450770, DOI 10.1093/jlb/lsaf024. Full text opened via Europe PMC (PMC12728816). **Viome is cited 16 times and is one of the companies in the authors' website study.**

> "The piece is grounded in a study the authors conducted of DTC microbiome testing company websites and their practices, which are **often misleading to consumers**. Moreover, **the tests lack analytical and clinical validity.** This means they may have many 'false positives' or 'false negatives' and can harm consumers who rely on them as a basis for determining their health status."

> "…their claims of having the ability to detect unhealthy microbiomes are **not fully substantiated by the literature** and may lead to **consumer exploitation by marketing expensive products and recommending repeat testing and probiotic use, which may not have any value.**"

> "Even if all microorganisms were known, the tests would still likely lack analytical validity… as there is **no reference standard** by which to compare the findings of each laboratory's assay. Without such a standard, we cannot know if organisms are missing or over-represented. Currently, most companies compare their findings… to others in **their consumer database, which is not likely to be representative of the general population.**"

**(b) Science, 2024** — Hoffmann DE, von Rosenvinge EC, Roghmann MC, Palumbo FB, McDonald D, Ravel J. *"The DTC microbiome testing industry needs more regulation."* Science 383:1176–1179. PMID 38484067. Abstract, verbatim in full:
> "**Tests lack analytical and clinical validity, requiring more federal oversight to prevent consumer harm.**"

**(c) Communications Biology, 2026 (NIST)** — Servetas SL, Gierz KS, Hoffmann D, Ravel J, Jackson SA. *"Evaluating the analytical performance of direct-to-consumer gut microbiome testing services."* PMID 41748906, DOI 10.1038/s42003-025-09301-3. Full text opened (PMC12946161). NIST sent **identical standardised human faecal material** to seven DTC gut microbiome services.

> "Our results reveal **major discrepancies, both within and across** the different service providers. Significantly, we found **variability between providers was on the same scale as biological variability between different donors.**"

> "The most striking example is of the conflicting recommendations between replicate 3 from Company A and replicates 1 and 2… Out of the 10 functional categories assessed by this company, **seven were below average for replicate 3, compared to only one for replicates 1 and 2**… **The company reported the microbiome as healthy for replicate 1 and 2, but unhealthy for replicate 3**, which could lead to unnecessary interventions."

> "Some companies recommended that customers **start taking costly supplements (e.g., probiotics) that are sold by the same company and for which there is very little clinical evidence for efficacy.**"

> "…no method reported concordance with the consensus relative abundance range for all 18 taxa analyzed."

**Important accuracy caveat:** the seven tested companies in the NIST paper are **anonymised as "Company A–G."** Viome appears in that paper only in the reference list (ref. 12, a cited blog post). **I cannot confirm Viome was one of the seven tested.** The Viome-naming criticism is the JLB 2025 paper, not the NIST paper. Do not conflate them.

**(d) Precedent, from the JLB paper:** uBiome — *"the U.S. Attorney's Office for the Northern District of California filed criminal charges against Richman and Apte… the statement by the SEC that the tests were **medically unnecessary** speaks to the limited benefit of these tests."*

**(e) What I checked and did NOT find:** Truth in Advertising (truthinadvertising.org) search for "Viome" returns **"0 Results / No results found"** (opened). Search for "Rootine" also **0 results**. I could **not** open any FTC or FDA enforcement action against Viome. **No regulatory action against Viome is confirmed.**

### (9) Coverage / market signal
iOS app: **4.63**, **5,635** ratings (Viome Life Sciences, Inc). "Over 50 Million Microbiome Insights Delivered" (self-claim). Funding: **not verified** — I could not open a fundable source.

---

## 7. Care/of — DEAD. Confirmed via primary source.

**Domain does not resolve.** `getent hosts takecareof.com` returns nothing; `curl` fails with *"Could not resolve host: takecareof.com."* Wayback CDX shows the **last HTTP 200 capture is 2024-07-01**, and nothing after.

I opened that final capture — it is the shutdown notice itself:

> **"A farewell message from Care/of**
> We wish we had better news to share, but unfortunately **Care/of will be closing its doors at the end of June.**
> We've appreciated your support and felt the love over the past few weeks. **We explored options for the brand to continue in some way, but in the end, that just did not work out.**
> We are grateful for the last seven years. We're proud of what we created…
> **When will my last order arrive?** All orders will be packed by Friday, **June 28th**.
> **What will happen to my data?** Most customer personal data will be deleted…
> © 2024 Care/of."
> — [web.archive.org/web/20240701203441/https://www.takecareof.com/](http://web.archive.org/web/20240701203441/https://www.takecareof.com/) (opened)

**Why it matters to us:** Care/of was the flagship quiz-personalised vitamin subscription — "seven years", venture-backed, a major Bayer investment. Its result screen was a **quiz → recommended pack**, with no efficacy score at any point: the personalisation was self-reported lifestyle answers mapped to SKUs. It died with the model intact and unproven.

**Criticism I could NOT verify:** I could not open any FTC action, class action, or named academic critique of Care/of specifically. TINA.org's search returned only generic tokenised matches (AdvoCare, MLM content), **no Care/of entry**. **Do not claim regulatory action against Care/of — I found none.** The documented failure is commercial, not regulatory, and the farewell letter above is the primary evidence.

**Adjacent, verified:** TINA.org's "personalized vitamins" search (opened, 161 results) lists a live class action — **"Ritual Essential Vitamins — Allegations: Falsely advertising that products contain all essential nutrients"** — plus Bayer One A Day and SmartyPants multivitamin class actions. So the litigation risk in this category attaches to **composition and nutrient claims**, not to personalisation quality.

---

## 8. Rootine — pivoted away from personalised supplements entirely

**Opened:** rootine.co homepage and `/pages/science`.

Rootine was the DNA+blood-test precision micronutrient company. **It is no longer that.** The live storefront sells **functional drink mixes**: nav reads `Adaptogen Drink Mixes · Sleep · Daily Health Personalization · Gear & Accessories`. The only product surfaced on the homepage is **`Sleep` — from $12.50 (reg. $24.99), 4.5/5.0, 72 total reviews.**

The tell: the `/pages/science` **`<title>` is still "The Science of Data-Driven, Personalized Multivitamins – Rootine"** while the page body is now entirely about circadian rhythm:

> "Rooted in the science of **circadian health** with results you can see feel and track… At Rootine, we believe that balancing your circadian rhythm is the next step to optimized health."

The strongest evidentiary claim on the science page is an appeal to an unrelated prize: *"In 2017, the Nobel Prize in Medicine celebrated groundbreaking circadian health research, a pivotal moment that fueled our passion."*

- **Efficacy graded?** No. No score of any kind.
- **Number shown?** None.
- **Dose/form/population:** not surfaced.
- **Personalisation:** reduced to "Take the Quiz" and "Daily Health Personalization"; DNA/blood micronutrient testing is **absent from the storefront**.
- **Evidence:** no citations; FDA disclaimer present.
- **Criticism:** TINA.org returns **0 results** for Rootine (opened). No published critique found. **The pivot itself is the finding** — the most scientifically ambitious personalisation model in the lane has been abandoned by its own operator, sitting behind a `30% OFF SITEWIDE` banner with one visible SKU.

---

## 9. Gainful — quiz personalisation, zero efficacy grading

**Opened:** gainful.com homepage. (`/pages/faq`, `/pages/how-it-works`, `/products/protein-powder` all 404 — the site returns a 404 body for unknown paths.)

- **Result screen:** a quiz (`Find My Protein` / `TAKE THE QUIZ`) outputs **a recommended blend from a fixed set of 7**: Collagen Whey, Everyday Plant, Everyday Whey, Isolate-Only Whey, Lean Plant, Lean Whey, Performance Whey. No score, no grade, no number.
- **Methodology:** *"We've leveraged over **one hundred million proprietary data points** that led us to these 7 unique protein blends."* No explanation of what the data points are or how they map to a recommendation. It is a **volume-of-data claim standing in for a validity claim.**
- **Efficacy graded?** **No.** Efficacy is carried entirely by testimonials: *"I've been on a fitness journey… I got to a point that I felt everything plateau. Once I got my protein from Gainful I started seeing results again."*
- **Dose/form/population:** protein-per-serving and calories-per-serving shown; key ingredients listed. Personalisation is by stated goal and diet, not biomarkers.
- **Business model:** DTC subscription, `Subscribe and Save 25%`, free shipping at $150. Also runs a flavour-packet upsell ("End Flavor Fatigue").
- **Market signal:** "300,000+ Happy Customers" (self-claim). **No iOS app found** — an App Store search for "Gainful" returned only unrelated fitness apps.
- **Criticism:** none found. **Funding not verified.**

---

## 10. Blueprint (Bryan Johnson) — sells the stack, never scores it

**Opened:** blueprint.bryanjohnson.com. Wikipedia "Bryan Johnson" article sections 7–9 (wikitext via MediaWiki API) for sourced funding/criticism.

- **Result screen:** **there is none.** Blueprint is a supplement and food retailer, not a grader. Site structure: `Shop by Category`, `Shop by Benefit`, `Take the Quiz`, `Subscribe & Save`, plus `Bryan's Free Protocol`, `Our Standards (COAs)`, `Bryan AI (Beta)`, `Don't Die App`, `Biomarkers`. Products carry marketing descriptors, not scores: `Extra Virgin Olive Oil — 400mg polyphenols`; `Cocoa Powder — 400+ mg flavanols`; `Longevity Protein — 26g protein`; `Creatine — Supports strength`.
- **Number shown?** None. No score, grade or index anywhere on the storefront.
- **Efficacy graded?** **No.** Efficacy is asserted through the founder's own biomarker narrative, not scored per product. The "Shop by Benefit" taxonomy (`Daily Health & Longevity`, `Brain & Heart Health`, `Energy & Stress Support`, `Muscle Performance & Recovery`, `Gut & Immune Health Support`) is a **merchandising category, not a graded claim.**
- **Quality/purity:** this is where they do compete — `Our Standards (COAs)` publishes certificates of analysis. (I could not open the COA page directly; `/pages/our-standards` and `/pages/coa` both 404. The nav link exists. **COA contents unverified.**)
- **Business model & funding (verified via Wikipedia's cited sources):**
  - `Blueprint Basics` launched 2024 as a consumer subscription at **$333/month**
  - **$60 million** raised in angel funding, investors including **Kim Kardashian and Cameron & Tyler Winklevoss** (LA Business Journal, 17 Nov 2025)
  - **Gyre Renwick** appointed CEO July 2025; Johnson retains product/protocol
  - Johnson's own protocol cost ~**$2 million/year** in 2023, tracking 100+ health measurements
- **Market signal:** iOS — `Don't Die - Bryan Johnson` (Continuance LLC) **4.83, 659 ratings**; `Biomarkers Bryan Johnson` **3.71, 7 ratings**; `Immortals Bryan Johnson` **4.37, 19 ratings**. Small app footprint relative to brand noise.
- **Strongest documented criticism:**
  - **Efficacy admission on his own flagship intervention.** Johnson ran six monthly 1-litre plasma transfusions, including a tri-generational exchange with his 17-year-old son as donor. He **"admits he saw 'no benefits'"** and *"says he will not repeat the transfusions due to lack of benefits."* (Fortune Well, 8 and 13 July 2023.) **"The FDA has stated that transfusions such as the kind Johnson had are without benefit and may be harmful."** (per Wikipedia, cited to The Guardian, 5 Sept 2023.)
  - **Transparency.** *"A New York Times investigation revealed that Johnson used confidentiality agreements to control his public image and that of his companies. Some of his workers have joined forces to challenge those agreements."* (Grind, K., NYT, 21 March 2025.)
  - **Protocol instability.** *"He has since reduced his daily supplement intake from 111 to 30 by March 2026."* (WSJ, 18 March 2026.) A ~73% cut in his own stack is an implicit admission that most of it wasn't doing anything — and there was never a per-supplement score that would have told a customer which 81 to drop.

  **Note:** these are criticisms of Johnson/Blueprint sourced from Wikipedia's citation apparatus, which I read as wikitext. **I did not open the underlying NYT, Fortune, WSJ or Guardian articles** (paywalls/not attempted). Treat the quotes as accurately transcribed from Wikipedia's summary of those sources, not as direct quotation of the sources themselves.

---

## 11. Other scanners in the App Store (market shape)

From the live iTunes Search API for `supplement scanner` (21 results) and `supplement label AI` (25 results). **Store metadata only — none of these opened beyond their listing.**

| App | Seller | Rating | Ratings count |
|---|---|---|---|
| Bobby Approved - Food Scanner | BA GLOBAL HOLDINGS LLC | 4.86 | **160,248** |
| Yuka - Food & Cosmetic Scanner | Yuca | 4.81 | **99,230** |
| SuppCo | SuppleStack Inc | 4.81 | 29,337 |
| Prove It | Control. Alt. Delete. LLC | 4.42 | 15,697 |
| Suppie | CLEARER HEALTHTECH LTD | 4.53 | 147 |
| Supplements AI – Stack Tracker | Adrien Pierre Grusse | 4.33 | 125 |
| Suppi | Vitaminchat OU | 4.33 | 100 |
| Good For You: Supplement Facts | Mer-Tel Elektronik | 4.77 | 77 |
| Supex | Hey Apps LLC | 4.17 | 67 |
| Supplement Scanner: NutriSee | Dmitrii Cherviakov | 4.71 | 45 |
| Medicine & Supplement Scanner | No Worries Lifestyle | 4.42 | 45 |
| Supplement Scanner - InSup | AIBY Incorporated | 4.62 | 256 |
| AI Supplement Scanner | AppCrafters OU | 3.93 | 15 |
| + ~8 more sub-20-rating shells | | | |

**Read:** a long tail of near-identical AI scanner shells launched 2025–2026, almost all under 300 ratings. Only **three** supplement scanners have meaningful scale (SuppCo, Prove It, and arguably nobody else). The genre leaders by raw volume are **food** scanners (Bobby Approved, Yuka) — both of which grade *ingredient nastiness*, not efficacy, and which set the consumer mental model that a scan yields a purity verdict. Several 1★ Prove It reviewers explicitly compare against Yuka/Bobby Approved: *"Not paying for something that the Bobby approved app provides free."*

**`Supplements AI – Stack Tracker`** (4.33, 125 ratings) is worth one line — it is the only one whose listing claims an outcome feedback loop: *"Well-being tracking: log daily mood, energy, focus, sleep, and productivity. **Correlation analysis:** see how your supplements affect your performance and well-being over time. **Personal feedback loop:** understand if your routine is actually helping you reach your goals."* It also says *"Supplement Scanner **coming soon**"* — so it has the Effect ambition and no scanner; SuppCo has the scanner and no Effect. **Store listing only; not verified in use.**

---

## What this means for the Effect axis

1. **The category's own leader says the problem is unsolved.** SuppCo's acquisition note is the single most quotable asset in this brief. Use it.
2. **Two dodges to name and beat.** "Quality ≠ Effect" (SuppCo: creatine's result screen never says creatine works) and "Evidence-for-claim ≠ Effect" (Suppie's Efficacy 88 grades whether the claim is supported, and lets the brand choose the claim).
3. **The under-claiming loophole is the sharpest attack on Suppie.** Scoring evidence-for-stated-claims structurally rewards brands that claim less. An Effect axis anchored on magnitude for a healthy adult inverts that incentive.
4. **Prove It Health is the proof it can be done** — population relevance as a scored criterion, guideline anchoring, and explicit funding-bias adjustment — and also the proof of the ceiling: even they score evidence strength, not effect size. **Nobody has shipped magnitude.**
5. **Dose is the universal blind spot.** Suppie checks dose for *safety* and *declaration*. SuppCo shows dose as a fact and compares price-per-serving. **No product I opened publicly states that under-dosing below a clinically effective threshold lowers its score.** That is an open, defensible differentiator.
6. **The graveyard is the personalisation model, not the scanner model.** Care/of dead, Rootine pivoted to drink mixes, Gainful selling flavour packets. Viome survives by charging $399 for the test plus $119/month — and carries the heaviest documented scientific criticism in the lane. **Personalisation without a validated outcome measure has repeatedly failed commercially.** A scanner that grades Effect honestly is a different, better bet.
7. **Two independent hard-science criticisms are reusable as category framing:** "variability between providers was on the same scale as biological variability between different donors" (NIST, Comms Biol 2026) and "tests lack analytical and clinical validity" (Science 2024). Both are about the *measurement* being unvalidated — the same charge that will be levelled at us. **We should publish our rubric and our uncertainty before someone else characterises it.**

---

## Confidence ledger

**Opened directly and quoted:** SuppCo (site, TrustScore methodology, live product result page, manifesto, experts, acquisition note), Suppie (site + full methodology page + both vs-pages), Prove It Health (site, methodology article, full product review), Viome (homepage, /products, /products/full-body-intelligence), Rootine (homepage + science), Gainful (homepage), Blueprint (homepage), Care/of (Wayback final capture), Comms Biol 2026 full text, JLB 2025 full text, Science 2024 abstract, TINA.org searches, iTunes Search/Lookup/Review APIs, Google Play pages for SuppCo and Prove It.

**Store listing / second-hand only:** Prove It app internals, Suppi internals, all long-tail scanners, Blueprint COA contents, SuppCo SuppScore pillar contents, SuppCo Pro price.

**Could not open:** any general search engine (all blocked); `viome.com/science` (404); `aisupplement.app` (no DNS); `takecareof.com` (no DNS, expected); the underlying NYT/Fortune/WSJ/Guardian articles on Blueprint.

**Explicitly NOT found — do not claim:** no FTC or FDA action against Viome; no FTC/FDA action or class action against Care/of; no TINA.org entry for Viome or Rootine; no published third-party critique of SuppCo, Suppie, Prove It or Prove It Health; no confirmation that Viome was among the seven anonymised companies in the NIST study; no funding figures for SuppCo, Viome, Suppie or Gainful.

**Flagged as my inference, not sourced:** SuppCo's affiliate monetisation; Prove It Health being a one-person project; the Hyman/Function conflict-of-interest reading.
