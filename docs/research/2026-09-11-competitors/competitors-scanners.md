# Competitor brief — mass-market SCANNER apps and the "does it work?" gap

**Scope of this lane:** consumer barcode/photo scanners (food, cosmetics) plus every supplement-specific scanner I could verify on the App Store / Google Play.
**Question:** at scan, what is shown, in what order, what number, computed from what — and does anything grade *efficacy* (real benefit to a healthy person) rather than harm/quality?

**Method note (read this).** Live fetches on 2026-09-11 via `curl`. Search engines (DuckDuckGo, Mojeek, Brave, Startpage, Ecosia, SearX) were all serving bot challenges, and `www.ewg.org` returns HTTP 403 to `curl` (Cloudflare). Workarounds used: Wayback Machine for EWG (archive timestamp `20260727143516` for the live ratings page; `20191209…` for older mirrors), Europe PMC REST API for peer-reviewed literature, iTunes Search/Lookup API + Google Play HTML for store listings, and App Store screenshot images read directly to capture exact on-screen wording. Anything I could not open is labelled **[NOT OPENED]**. Anything inferred is labelled **[GUESS]**.

---

## Headline answer

**Every established scanner grades harm, not benefit.** Yuka, EWG, Think Dirty, INCI Beauty and Open Food Facts all produce a *hazard / nutritional-quality* number. None of them claims a product **works**. Yuka explicitly refuses to rate supplements at all.

**The exception is new and shallow.** A 2025 cohort of supplement scanners — led by **Prove It** (15.7k US ratings, 120k downloads) — ships a literal **"Efficacy"** sub-score on the result screen. Its disclosed sourcing is *"Based on PubMed, Wikipedia, and 23 other sources"*. Its clones (Suppi, InSup, SuppScan, Amino, NutriSee) all copy the same **Safety / Efficacy / Transparency** triad. **None of them publishes a methodology page.** That is the opening.

**SuppCo** (29.3k US ratings) is the serious incumbent in supplements and has deliberately *dodged* efficacy: its TrustScore is 30+ manufacturing/certification/testing attributes only. Its only efficacy-adjacent signal is a binary attribute, "Clinically Studied Products", inside a category called "Innovation".

| Product | Number shown | Range / bands | Computed from | Efficacy graded? | Dose / form / population | Personalisation | Published method? |
|---|---|---|---|---|---|---|---|
| **Yuka** (food) | `8/100` + "Bad" + colour dot | 0–100; Excellent / Good / Poor / Bad | 60% nutrition (Nutri-Score), 30% additives, 10% organic | **No** — nutrition + additive hazard only | Per-serving display; no form; no population | Premium alerts/preferences only | **Yes**, help.yuka.io |
| **Yuka** (cosmetics) | `10/100` + "Bad" | 0–100; red <25, orange <50 | Worst-ingredient cap + itemised penalties | **No** — hazard only | No dose; product type not weighted | Allergen alerts (Premium) | Yes |
| **Yuka** (supplements) | — | — | — | **Does not rate them at all** | — | — | Yes (an article saying "no") |
| **EWG Skin Deep / Healthy Living** | `1` badge + "Low Hazard \| Good Data" | Hazard 1–10 (1 best); Data: none/limited/fair/good/robust | 17 hazard categories, weighted, worst-ingredient + average, ×absorption | **No** — self-declared hazard only | Records form/exposure/demographic as *hazard* inputs, not benefit | Category filters | Yes (very detailed) |
| **EWG Food Scores** | 1–10 | 1 best → 10 worst | Nutrition (heaviest) + ingredient concerns + processing, +0.5 if not organic | **No** | Per serving/100g nutrition | No | Yes |
| **Think Dirty** | Dirty Meter 0–10 | 8–10 / 4–7 / 0–3 / NR | Worst-ingredient default across Carcinogenicity, DRT, Allergenicity | **No** | None (explicitly rejects dose logic) | Allergen/acne pre-selects (Premium) | Yes |
| **INCI Beauty** | Note /20 + coloured flowers | 0–20; green/yellow/burst-orange/orange/red | Progressive penalties; adjusted by category, rinse-off, texture, nano, target user, labels | **No** | **Best-in-class hazard contextualisation**, still not benefit | Ingredient "restrictions" filters | Yes |
| **Open Food Facts** | Nutri-Score A–E (+ raw score), NOVA 1–4, Green-Score | A–E; NOVA 1–4 | Public Nutri-Score formula; NOVA processing | **No** | Per 100g / per serving | No | Yes (fully open) |
| **Foodvisor** | No product grade | — | Calorie/macro logging | **No** | Portion estimation | Goal-based programme | No scoring method to publish |
| **SuppCo** | TrustScore `9.50` + "Excellent"; StackScore `91` | TrustScore 1–10; StackScore 0–100 | 30+ quality indicators in 5 categories | **No** — quality/purity only | "Dosage" and "Goals" exist at *stack* level, not product | Age/sex nutrient targets, goals, stack | Partial (supp.co/trustscore) |
| **Prove It** | `88` + **Safety 96 / Efficacy 84 / Transparency 75** | 0–100 | Undisclosed; "PubMed, Wikipedia, and 23 other sources" | **YES — explicitly** | Claims "recommended dosages based on clinical studies" | None visible | **No** |
| **Suppi / InSup / SuppScan / Amino / NutriSee** | 0–100 "score" | 0–100 | Undisclosed AI | **Claimed** (Safety/Efficacy/Transparency) | Claimed, unverifiable | Varies | **No** |

---

## 1. Yuka (Yuca SAS) — 99,230 US App Store ratings

**Scan result screen, in order** (from App Store screenshot `01.jpg`, read directly):
1. Product image → product name (`Honey Nut Cheerios`) → brand (`Cheerios`)
2. Coloured dot + **`8/100`** + band word **`Bad`**
3. `Negatives` header with right-aligned `per serving (37g)`
4. Rows: `Additives / Contains additives to avoid — 8 ●red`; `Sugar / Too sweet — 12g ●red`; `Calories / A bit too caloric — 140 Cal ●orange`; `Sodium / A bit too much sodium — 210mg ●orange`
5. `Positives — per serving (37g)`: `Protein / Excellent amount of protein — 3g ●green`

Cosmetics screen (`02.jpg`): image → name → brand → `●red 10/100 / Bad` → `Ingredients | See all` → per-ingredient rows `BHT ●High-Risk`, `Petrolatum ●Moderate risk`, `Propylène Glycol ●Low risk`, `Aqua ●Risk-free`, each with an ⓘ.

**The number — verified, quoted.** help.yuka.io, "How are food products rated?" (updated ~2 months ago, by Benoit), opened in full:

> "Yuka's scoring method for food products is based on three criteria:
> **Nutritional quality is 60% of the score.** The calculation method is based on Nutri-Score … taking into account the indicated quantity of sugar, sodium, saturated fat, calories, protein, fiber, as well as the fruits and vegetables content (calculated or estimated).
> **The presence of additives is 30% of the score.** … Every additive is assigned a risk level based on various existing studies: risk-free (green dot), limited risk (yellow dot), moderate risk (orange dot), high-risk (red dot). If an additive we consider to be high-risk is present, **the maximum score for the product is set at 49/100**. In this situation, this criterion can represent more than 30% of the score.
> **The organic dimension is 10% of the score.** This is a bonus granted to products considered organic…"

**60/30/10 is confirmed.** Also confirmed: "prevent a product with a Nutri-Score of D or E from having a score higher than 49/100" (article `owuc9rbhqs`). The A–E→/100 correspondence table is an image I could not read — **[NOT OPENED]**; exact Excellent/Good/Poor/Bad thresholds are not stated in text on any page I opened — **[GUESS]** that they are 75/50/25.

**Cosmetics formula — quoted** (article `ih5pet4ffc`):
> "If the product contains only risk-free (green) or low risk (yellow) ingredients: The product's score will systematically be greater than or equal to 50/100 with the following penalty points: -10 points for an ingredient potentially carcinogenic or endocrine disruptor, -7 points for an ingredient with several of the following risks: allergen, irritant, other health effect or pollutant, -2 points for an ingredient with only one…
> If the product contains moderate-risk (orange) or high-risk (red) ingredients: … between 0 and 24/100 if a high-risk ingredient (red) is present, between 0 and 49/100 if a moderate risk ingredient (orange) is present."

**Efficacy: not graded, and supplements are refused outright.** Two help articles, both opened:
> "**Why are nutritional supplements and medications not rated?** — Yuka doesn't rate nutritional supplements or medications since their ingredients are very specific and we have not yet developed a method for analyzing these products."
> "**Why are protein supplements not rated?** — Yuka does not rate protein supplements … including whey protein, creatine, milk protein, soy protein, etc. These are not food products strictly speaking, but supplements. Yuka's rating methodology is not adapted to these very specialized types of products."

**Dose/form/population.** Food: displayed per serving (the older per-100g criticism appears superseded — see below). Cosmetics: no concentration data at all; the app scores presence + list position. Population: none.

**Personalisation.** Premium: offline scan, unlimited history, search without scanning, personal alerts. No physiology, no goals.

**Evidence sourcing.** "Benchmarks are based on the latest scientific research… recommendations of the EFSA, and the IARC, in addition to numerous independent studies." Per-additive/per-ingredient sources are shown in-app. fr.wikipedia lists their cited authorities as ANSES, ANSM, INSERM, EFSA, SCCS, IARC, CNRS, plus "bases de données scientifiques internationales (SIN List, TEDX List, **Skin Deep** et autres)" — note Yuka leans on EWG's Skin Deep.

**Business model.** yuka.io/en: "No brand or manufacturer can influence the scores"; "**No ads** — Brands cannot pay Yuka to advertise their products"; "Responsible financing". Revenue split (freemium ~60–70%, seasonal-produce calendar ~20%, nutrition programme ~10%) is from fr.wikipedia citing *Le Figaro* 2019 — **[NOT OPENED]**, paywalled.

**Strongest criticism.**
- **Regulator-adjacent, opened in full:** the French **Conseil national de la consommation** (chaired by DGCCRF), *Avis relatif aux applications numériques sur la qualité des produits alimentaires et cosmétiques*, NOR ECOC2326709V, adopted 20 Oct 2023 (PDF retrieved via Wayback; economie.gouv.fr returns 403). Recommendation 9: *"Les applications devraient faire leurs meilleurs efforts pour fonder leurs critères de notation sur des travaux scientifiques solides et reconnus, notamment ceux des agences officielles d'évaluation des risques"* ("apps should make their best efforts to base their scoring criteria on solid and recognised scientific work, notably that of official risk-assessment agencies"). Recommendation 7 tells apps to *"s'abstenir de noter un produit lorsqu'elles ne disposent pas des données nécessaires à cette fin"* ("abstain from scoring a product when they do not have the necessary data"). Recommendation 2 demands they *"documenter le fondement de ces critères et de leur pondération"* — i.e. justify the weights. Caveat worth carrying: two of the three rapporteurs represented ANIA/MEDEF/FEBEA industry bodies (stated on the PDF cover).
- **Named scientist:** Prof. **Serge Hercberg** (epidemiologist, co-designer of Nutri-Score) argues Yuka's criteria rest on an algorithmically generated weighting *"qui n'a aucun fondement scientifique"* because it adds together criteria that are not comparable given the state of knowledge; **Mathilde Touvier** (Inserm nutritional-epidemiology team director) adds that *"aucun lien n'est encore scientifiquement établi entre tel ou tel additif et tel ou tel risque pour la santé"*. Both quotes are as reported by fr.wikipedia citing *Le Point* #2401 (6 Sep 2018) and *Inserm, le magazine* #44 (Sep 2019) — **primary sources [NOT OPENED]** (paywall / print). Treat as second-hand.
- **Peer-reviewed, opened in full — hits the 60% of the score:** Peters S, Verhagen H. *An Evaluation of the Nutri-Score System along the Reasoning for Scientific Substantiation of Health Claims in the EU — A Narrative Review.* **Foods** 2022;11(16):2426, PMC9407424. Conclusion, verbatim: *"In conclusion, based on the EFSA approach for substantiation of health claims, there is insufficient evidence to support a health claim based on the Nutri-Score system, since a cause-and-effect relationship could not be established."* And: *"No efficacy study has found an effect of the Nutri-Score on the FSA-NPS for a complete supermarket assortment."* This is the cleanest available statement that the biggest food score in Europe cannot demonstrate it produces real-world benefit.
- **Litigation.** Yuka lost three French first-instance denigration suits brought by charcuterie makers (Trib. com. Paris 25 May 2021; Brive Sept 2021, €20,000; Aix-en-Provence 13 Sept 2021, €25,000) and won all three on appeal (Aix 6 Dec 2022; Limoges 13 Apr 2023; Paris 7 Jun 2023). Source: fr.wikipedia with links to Legalis and Judilibre — I opened neither judgment. **[NOT OPENED]** Notable detail: in both first-instance losses the courts *refused* the industry's request to force a change to the scoring system.

**Coverage/limits.** Food + cosmetics only. No supplements, no medications, no pet food, products with no nutrition values are unrated.

---

## 2. Open Food Facts / Nutri-Score

**Screen.** OFF shows, per product: **Nutri-Score letter A–E** (plus the raw numeric score), **NOVA group 1–4** (ultra-processing), **Green-Score/Eco-Score**, nutrient levels as `low / moderate / high` for fat, saturated fat, sugars, salt, then additives, allergens, ingredients, and ingredient-analysis flags. Verified live against the public API: `GET /api/v2/product/3017624010701` (Nutella) → `nutriscore_grade: "e"`, `nutriscore_score: 31`, `ecoscore_grade: "d"`, `nutrient_levels: {fat: high, salt: low, saturated-fat: high, sugars: high}`, `additives_tags: []`.

**The number, quoted** (world.openfoodfacts.org/nutriscore, opened):
> "The Nutri-Score is a logo that shows the nutritional quality of food products with A to E grades… It is determined by the amount of healthy and unhealthy nutrients: **Negative points:** energy, saturated fat, sugars, sodium… **Positive points:** the proportion of fruits, vegetables and nuts, of olive, colza and nut oils, of fibers and proteins. The detailed Nutri-Score formula is publicly available on the Santé publique France web site."
> "Nutri-Score has been proposed by EREN, a French public nutrition research team, led by Professor Serge Hercberg. It is based on the nutrition score created by the Food Standards Agency in the UK."

**Efficacy: no.** Nutri-Score is a nutrient-profile comparator within a category. It says nothing about whether eating an A product improves anything.

**Dose/form/population.** Per 100 g/ml; a separate stricter beverage scale; no population adjustment.
**Personalisation.** None.
**Business model.** Non-profit/donation. Live banner at fetch time: "We still need €120,000 to finish 2026! Become an Open Food Facts patron… Every month, we serve 8 million visitors."
**Criticism.** Peters & Verhagen 2022 (quoted above). Also en.wikipedia's Nutri-Score article notes 80% of surveyed Polish experts said Nutri-Score alone doesn't guarantee a balanced diet, citing Panczyk et al., *Foods* 2023;12:2346 — **[NOT OPENED]**, I only read the Wikipedia citation.
**Coverage.** Crowd-sourced, global, uneven; product may be missing or have no category, in which case no score.

---

## 3. EWG — Skin Deep + Food Scores + Healthy Living app (3,307 US ratings)

**Scan result screen** (App Store screenshot `Product.png`, read directly): back/share bar → big coloured badge **`1`** over the product photo → product name (`Calm Face & Body Lotion`) → tab bar **`Findings | Ingredients | Label Info`** → section **`Health Concerns`** with sub-line **"The product score takes into account these factors:"** → rows: `Developmental & Reproductive Toxicity ●Low Hazard`, `Allergies & Immunotoxicity ●High Hazard`, `Cancer ●Low Hazard`. Ingredient rows read: `Aloe Barbadensis (Aloe Vera) Leaf Juice — 1 Low Hazard | Good Data`, `Glycerin — 2 Low Hazard | Fair Data`.

App Store copy: *"Barcode-scan any product or search by name to get a simple **1–10 safety score (1 = best)**"*; *"the only one that covers more than 200,000 rated products across cosmetics, food and household cleaners"*; *"Science-Backed Ratings: Built on EWG's independent research — not algorithms alone."*

**The number — quoted from EWG's own methodology** (ewg.org/skindeep/understanding_skin_deep_ratings and /contents/about-page, via Wayback):
> "Every product and ingredient in Skin Deep® gets a **two-part score – one for hazard and one for data availability**."
> "The Skin Deep ingredient hazard score, **from 1 to 10**, reflects known and suspected hazards linked to the ingredients. A product's hazard score is **not an average** of the ingredients' hazard scores. It is calculated using a **weight-of-evidence approach**…"
> "Hazard ratings within Skin Deep are shown as **low, moderate, or high concern** categories, with numeric rankings spanning those categories that range from 1 (low concern) to 10 (high concern)."
> Mechanics: "We categorize the studies and data contained in Skin Deep into **17 general hazard categories** … We then assign each study/data source a score between **0 and 100** based on the weight of evidence. For example, a 'known human carcinogen' is assigned a 100 … while a 'probable human carcinogen' is given a much lower score (55)." Product step: "For each category (except absorption), we **add the highest scoring ingredient to the average score for the rest of the ingredients**." Then: "we weight the raw product score by the absorption category score." Final: "all scores are scaled from 1 to 10 … **We assign a score of 10 to the top 5% most hazardous products** and then scale down uniformly to 1."
> Data availability: "**none, limited, fair, good or robust** … We recommend that consumers buy products with lower hazard ratings AND at least 'fair' data availability."

**EWG Food Scores — the only place EWG blends nutrition in** (ewg.org/foodscores/content/methodology, via Wayback, opened):
> "**Nutrition.** The nutrition scoring algorithm considers … calories, saturated fat, trans fat, sugar, sodium, protein, fiber and fruit, vegetable and nut content. **Ingredient concerns** … likely presence of key contaminants, pesticides, hormones and antibiotics and health implications of certain food additives. **Processing** … the extent to which a particular food has been processed.
> We combine these three scores into a single overall product score. **We weight nutrition generally most heavily, ingredient concerns next and processing relatively lightly.** We rate all foods on a **1 to 10 scale, with the best foods scoring 1 and the worst foods scoring 10.**
> … **An additional 0.5 is added for foods that are not certified organic** (or 0.2 for foods certified to be made with 70 percent organic ingredients)."
> Nutrition algorithm provenance: "a modified version of a nutrition profiling system developed by Oxford University and the United Kingdom's Food Standards Agency" — i.e. the same FSA-NPS lineage as Nutri-Score.

**Efficacy: no, and EWG says so structurally.** Skin Deep is a *hazard* index, explicitly separated from risk. The single most useful sentence for us, from EWG's own methodology:
> "**This rating considers potential health hazards but does not account for exposure or individual susceptibility, factors which will drive health risks, if any, but which are generally not available for assessment.**"

**Dose/form/population.** EWG *records* body area exposed, leave-on vs rinse-off, physical form (solid/cream/liquid/gel/spray/aerosol) and target demographic (women/men/people of colour/teens/children 2–12/infants 0–2) — but all of it feeds the **hazard** weighting, not any benefit calculation. Ingredient concentration is never used.

**Personalisation.** None beyond filters.

**Business model.** 501(c)(3) non-profit + **EWG VERIFIED™ trademark licensing**, which is paid. From EWG's own FAQ (Wayback):
> "EWG Verified is a trademark licensing program… **Costs for participation vary widely, generally on a sliding scale**, based on factors such as company size and stage of development. **Typical fees include an application fee, and annual licensing fee.** Revenue generated by the EWG Verified licensing program helps to support the assessment process…"

**Strongest criticism — three named, all opened.**
1. **Peer-reviewed, on governance:** Bond JA et al., *Inventory and evaluation of publicly available sources of information on hazards and risks of industrial chemicals*, **Toxicology and Industrial Health** 2019, PMC6918022 (full text read). Verbatim: *"**EWG, ChemSec, and GoodGuide rely on internal processes to ensure the quality of the EHS information they publish and none of them describes any external peer review.**"* And in their source table, EWG's Skin Deep is classed as covering only "H, U" (hazard, use) with "Internal PR" (internal peer review), versus "Extensive PR" for ECHA/EPA/IARC. Also: Skin Deep and similar *"include both human and environmental health information but **do not address uses, exposure, and/or risk characterization/assessment**."* Caveat: lead author's affiliation is Manitou View Consulting LLC, a consultancy; no COI statement was parsed from the XML — treat provenance with care.
2. **Named scientist:** Dr **Joe Schwarcz**, McGill University Office for Science and Society, *"An Apple A Day…"* (opened): *"There are many environmental groups that raise legitimate and thoughtful questions about chemical issue. The Environmental Working Group is not one of them. This organization is dedicated to raising money through fear-mongering… **They mindlessly over hype chemical risks.**"* (Aimed at the Dirty Dozen, not Skin Deep specifically.)
3. **Named critic, methodology-specific:** **Brian Dunning**, Skeptoid #623 (opened): *"**EWG is a political lobbying group for the organic industry** … **Nearly all of the criticism focuses on EWG's flawed methodology, and universally it mentions their unawareness of dose.** The reality is that there are safe levels of everything."* Dunning also cites "79% of real toxicologists surveyed reject EWG's reports" — that underlying survey I did **[NOT OPENED]**.

**Coverage/limits.** Skin Deep methodology states "over 100,000 products", "8,892 personal care product ingredients", "nearly 60 toxicity and regulatory databases", "2,099 brand names". Products older than 3 years are flagged "old formulation"; unverified for 6 years → deleted. Independent research found coverage gaps that matter: Kendrick et al., *JESEE* 2026 (PMC13331737), found *"Only 62 (41%) of products were listed in the EWG's Skin Deep® beauty product catalog"* for textured-hair products at a Los Angeles Target, and *"over 90% of listed products were classified by EWG as a 'moderate' risk (product hazard scores between 3 and 6)"* — i.e. the scale compresses and is non-discriminating in practice.

---

## 4. Think Dirty (Think Dirty Inc.) — 56,388 US ratings, claims 8M+ users

**Screen.** Barcode/OCR scan → product with a **Dirty Meter™** rating and per-ingredient breakdown into three concern buckets. I could not read a clean in-app product screenshot (the store shots are marketing panels) — **[NOT OPENED]** for exact row wording. App Store copy: *"Ingredient-Focused Ratings: Think Dirty® uniquely evaluates products based **solely on their chemical content**, not brand reputation or marketing claims."*

**The number — quoted from thinkdirtyapp.com/methodology (opened in full):**
> "Each ingredient listed on the product label or manufacturer's website is evaluated for documented evidence of **Carcinogenicity, Developmental & Reproductive Toxicity and/or Allergenicity & Immunotoxicity**."
> Rating table by strength of evidence (Moderate / Strong / Conclusive): Carcinogenicity → **9 / 10 / 10**; Developmental & Reproductive Toxicity → **6 / 7–8 / 9**; Allergenicity & Immunotoxicity → **4 / 5–6 / 7**.
> "**By default, products receive an overall Think Dirty® rating no lower than the highest rating of any individual ingredient.** If several ingredients in a given product receive high ratings, the product itself is **automatically assigned a Think Dirty® rating of 10**."
> The fragrance rule: "**Think Dirty® automatically assigns any product that lists 'fragrance' on its label a rating of 7 or higher.**"
> Dirty Meter bands (image assets on the page are named `8-to-10-rating.png`, `4-to-7-rating.png`, `0-to-3-rating.png`, `NR-rating.png`; the adjacent definitions are): 8–10 = "Product's ingredients have potential serious negative long term health effects"; 4–7 = "…potential moderate negative long term health effects"; 0–3 = "Product does not contain any ingredients which have a documented potential negative health impact"; NR = "Ingredients not yet rated".

**Efficacy: no.** Purely ingredient nastiness. The app markets "find the safest, most effective option" but nothing on the page computes effectiveness.

**Dose/form/population.** Explicitly refuses dose reasoning: *"even though some of the ingredients in personal care products may be present in very small quantities, the likelihood of significant repeated exposure is high… It is widely acknowledged that even low-level exposure to known toxins can have deleterious effects."* One carve-out: *"if the total percentage of 4-7 rated ingredients is less than 5%, the outcome of the overall ratings might not be defaulted to the highest rating."*

**Personalisation.** Premium: pre-select allergens, acne triggers, ingredient preferences; alerts when carcinogens are detected.
**Evidence sourcing.** Appendix A lists ~35 government/NGO sources (Health Canada Hotlist, CosIng, ChemSec SIN List, NTP, Prop 65, CIR, Campaign for Safe Cosmetics, David Suzuki "Dirty Dozen", Women's Voices for the Earth). No per-claim citations; 10 numbered references, only for the fragrance sidebar.
**Business model.** Freemium: $39.99/yr "All Access", $99 lifetime; plus "Verified Brands", "FOR BRAND PARTNERS" and a listing-fee script on the site, plus an affiliated shop (cleanbeautique.com) — i.e. **brand-side revenue**, unlike Yuka.
**Strongest criticism.** I found no named published critic of Think Dirty I could open — **[NOT OPENED]**. The strongest available is their own admission on the methodology page: *"**The assignment of numerical ratings based on the results of scientific studies is necessarily a subjective process.**"* Combined with the automatic-10 and automatic-7-for-fragrance rules, that is a defensible criticism in our own words: the score is a rule-set, not a measurement, and it has a floor-effect that destroys discrimination.
**Coverage.** Site footer: "12.3K BRANDS / 3.4M PRODUCTS SUBMITTED / 66.9M UNIQUE SCANS".

---

## 5. INCI Beauty (France) — 1,354 US ratings, claims 10M+ downloads

**Screen.** Scan → note **/20** + INCI list, each ingredient marked with a coloured flower; then "restrictions" flags, cleaner alternatives, community comments. App Store: *"Each product is accompanied by a score between **0 and 20**. **Only products whose full composition is known are rated.**"*

**The number — quoted from incibeauty.com/blog/526-les-algorithmes (published 23/09/2025, opened in full):**
> Flower scale: "**Vert**: un ingrédient sans risque – Pas de pénalité. **Jaune**: un ingrédient réglementé / plutôt irritant / allergène – Pénalité faible. **Orange éclatée**: un ingrédient issu de la pétrochimie/synthèse biodégradable – Pénalité moyenne. **Orange**: … peu écologique – Pénalité moyenne. **Rouge**: un ingrédient controversé ou potentiellement à risque – Pénalité forte."
> Context factors that modulate the penalty: product category; **rinse-off vs leave-on**; texture (liquid/solid/spray/powder/cream); **nanoparticle size**; **target user (men, women, children, elderly, pregnant women)**; organic labels/certifications.
> Their anti-cliff-edge principle: "**la pénalité progressive** … Nous pourrions par exemple dire que dès lors qu'un ingrédient est suspecté d'être un Perturbateur Endocrinien, le produit qui le contient prenne la note de 0, mais ce système montrerait que l'application INCI Beauty serait à même de conclure à la nocivité avérée de l'ingrédient, **là où aucun scientifique n'aurait pu le faire avant nous**."

**Efficacy: no.** Hazard only, and they say so.
**They pre-empt the standard criticism themselves** — worth stealing as framing:
> "L'industrie de la cosmétique reproche souvent aux applications de **ne pas faire la distinction entre danger et risque**… Un lion est un animal dangereux. Néanmoins, s'il est enfermé dans un zoo… il ne représente pas le même risque pour moi que pour le soigneur. **La situation fait donc le risque.**" They then admit their flowers are "en quelque sorte des 'dangers'", and that they cannot get concentrations: *"il était inutile de s'attarder sur des données que nous n'avions pas … par exemple **la concentration des ingrédients dans le produit**."*

**Personalisation.** "Restrictions": user excludes gluten, parabens, silicones, endocrine disruptors, etc.
**Business model.** Self-funded via a price-comparison site (Touslesprix.com), in-app advertising, Premium subscription, pro subscriptions, and a shop. Claims total independence from cosmetics brands. Member of 1% for the Planet.
**Coverage.** "17,000 identified chemical SUBSTANCES", "1.3 MILLION cosmetic products analyzed and rated". Only fully-disclosed compositions are scored.
**Criticism.** No named external critic found openable — **[NOT OPENED]**. The CNC 2023 avis (§ Yuka above) applies to all French scoring apps and is the best regulator-level citation.

---

## 6. Foodvisor — 17,352 US ratings

**Not a grading scanner any more.** Current App Store description (fetched live) is a photo/voice/barcode **calorie counter**: "Calories, macronutrients, vitamins and minerals at a glance", weight tracking, fasting, a gamified "seed". No product score, no hazard grade, no efficacy grade. It advertises an outcome claim instead: *"Our users lose an average of 15.83 lb in 3 months… *Internal study conducted on 4,419 users in January 2026 (average BMI: 34.72)."* — an uncontrolled internal study, which is exactly the evidentiary standard we should not copy.
Foodvisor was named alongside Yuka in French trade coverage of the CNC avis ("Le CNC recadre Yuka et Foodvisor", *L'Usine nouvelle*, 25 Jan 2024) — **[NOT OPENED]**, cited via fr.wikipedia.

---

## 7. Supplement-specific scanners (verified to exist on the stores)

Verified via iTunes Search API (`term=supplement scanner`) and Google Play search (`q=supplement scanner`). Play package IDs confirmed for `com.prove_it.app` and `co.supp.app`.

### 7a. SuppCo (SuppleStack Inc.) — 29,321 US ratings, 4.82★, free, updated 2026-01-12

**Scan result screen, in order** (App Store screenshot `SC_4.png`, read directly):
1. Camera frame on the bottle → green pill badge **`9.50`**
2. Product card: brand `SEED` → `DS-01 Daily Synbiotic (2-in-1 Probiotic)`
3. Collapsible rows with a verdict word + coloured dot: `Manufacturing Standards — HIGH ●`, `Brand certifications — LOW ●red`, `Testing benchmarks — HIGH ●`, `Product quality — HIGH ●`, `Product certifications — LOW ●red`, `Technical innovations — HIGH ●`, `Inactive ingredients — SAFE ●`

Stack screen (`SC_2-3.png`): title **`StackScore`**, tabs `Overview | Quality | Value | Goals | Dosage`, dial **`91` StackScore** with four corner verdicts `Quality GREAT`, `Value AVERAGE`, `Dosage AVERAGE`, `Goals FIX NOW`; then "Insights about your StackScore — Your stack partially aligns with your health goals, but dosage optimization needs improvement"; rows `Your Average TrustScore is 8.5`, `You pay $270/mo on average`, `Your health goals are 34% covered`.

**The number — quoted from supp.co/trustscore (opened):**
> "SuppCo's proprietary rating system scores brands and products on a **10-point scale** based on their ability to deliver against **30+ key quality attributes**." Scale is labelled 1…10 with `Worst` → `Best`; the exemplar shows `Thorne B-Complex #6 — 9.56 — Excellent`.
> Five categories: **Manufacturing Standards, Product Certifications, Product Quality Indicators, Testing Benchmarks, Technical Innovation.**
> Attribute lists include: cGMP Certified, Made in USA, USP Verified, NSF Certified for Sport, Informed Sport/Choice, Non-GMO Project Verified, Clean Label Project, Eurofins; Patented / Organic / Gluten Free / Non-GMO / Vegan ingredients; **Contains Proprietary Blend**; **Labeling Discrepancy**; **Received FDA Warning Letter**; **Active FDA Recall**; 3rd Party Lab Tested, Raw Ingredient Testing, Tested for Identity / Purity / Potency, Lot Tested, Public Batch-Specific COAs, Tested for Heavy Metals, ISO 17025 Accredited Labs; and under **Innovation**: "Founder, CEO, CSO or CMO has PhD, MD, DO, ND or PharmD", "**Clinically Studied Products**", "Practitioner-Grade Integration".

**Efficacy: no — this is a purity/quality/credential score.** "Clinically Studied Products" is the only efficacy-adjacent item and it is a binary brand attribute sitting inside "Innovation", not a benefit estimate. The page carries the FDA disclaimer: *"These statements have not been evaluated by the Food and Drug Administration… not intended to diagnose, treat, cure, or prevent any disease."*

**Dose / form / population.** Handled only at the **stack** level: a `Dosage` tab, "recommendations on what nutrients are recommended for your **age and sex**, … **how to improve your dosages**", and "Your health goals are 34% covered". Form factor appears as a filter ("key considerations like certifications and **form factor**"), not as a bioavailability adjustment.
**Personalisation.** Real: stack building, schedule/reminders, age/sex nutrient targets, 80+ goal-based "protocols".
**Evidence sourcing.** None per-claim. No citations on the TrustScore page.
**Business model.** Free app + presumed subscription/affiliate — **[GUESS]**, not stated on the pages I opened. "We are not affiliated with any supplement brand."
**Discrepancies worth flagging:** App Store says "**160,000** supplements" and "**29** key attributes"; Google Play says "**250,000** supplements"; the website says "**30+** quality attributes". Their own numbers don't agree across surfaces.
**Criticism.** No published critique found — **[NOT OPENED]**. The obvious one in our words: a supplement can score 9.56 for having good certificates while containing an ingredient at a dose with no clinical support. TrustScore measures *the factory*, not *the pill's effect*.

### 7b. Prove It (Control. Alt. Delete. LLC) — 15,697 US ratings, 4.42★, free, updated 2026-01-07 — **the only mass-market scanner that grades efficacy**

**Scan result screen** (App Store screenshots read directly):
- Capture screen: overlay text `Take a clear photo of the product` (photo-first, barcode optional). Marketing panel states `120K DOWNLOADS`.
- Score panel: a ring with **`88`** and three bars: **`Safety 96`**, **`Efficacy 84`**, **`Transparency 75`**, with the caption **"Based on PubMed, Wikipedia, and 23 other sources ⓘ"**.
- Browse/search screen: product tiles each with a ring score (`90`, `75`, `76`, `84`), brand and price; sections `Top Rated`.
- Product detail (`Greens Blend`): `Alternatives` → category definition text → horizontal alternative tiles with ring scores → `View Rankings` button → `Ingredients` list, each with a risk badge (`Silica (colloidal) — ⚠ Some Risk`).

**Claims, verbatim from the App Store / Play listing:**
> "Access **evidence-based analysis of supplement efficacy and safety**"
> "Every review is grounded in scientific research, helping you understand: **What the research actually says about effectiveness** — Known safety considerations and interactions — **Recommended dosages based on clinical studies** — **Quality of available evidence**"

**Published methodology: none.** No website exists (`proveitapp.com`, `proveit.app`, `proveit-app.com` all fail to resolve); the App Store record has `sellerUrl: null` and points Terms of Use at Apple's boilerplate EULA. So the 0–100 number and the Efficacy sub-score are **entirely unexplained**.
**Dose / form / population.** Claimed ("recommended dosages based on clinical studies") but nothing on the visible screens shows a dose comparison, a form/bioavailability adjustment, or any population qualifier.
**Personalisation.** None visible.
**Business model.** Free with in-app purchase ("Unlock unbiased reviews" is a paywall panel) — **[GUESS]** on price point; not disclosed in the listing I fetched.
**Strongest criticism.** Two, both from evidence I opened:
1. **Their own disclosed sourcing includes Wikipedia** — *"Based on PubMed, Wikipedia, and 23 other sources"* — on the same screen as a numeric Efficacy grade. That is disqualifying for an efficacy claim and is the single best wedge for us.
2. **User-reported entity resolution failure**, quoted from a review on the Google Play listing (opened): *"Doesn't work. I tried to scan three different supplements but when I selected the supplement I was scanning, it came up with a completely different supplement/vitamin. Even when I searched the supplements up and selected the brand I wanted to look into, the wrong product would come up."*
Also note the listing carries a long MEDICAL DISCLAIMER ("for educational and informational purposes only… not intended to provide medical advice") that sits awkwardly beside a hard numeric efficacy score.

### 7c. The 2025 copycat wave — Safety / Efficacy / Transparency as a commodity

All verified live on the App Store; all claim efficacy; **none publishes a methodology**.

| App | Seller | US ratings | Released | Claim (verbatim) |
|---|---|---|---|---|
| Suppi – Supplement Scanner | Vitaminchat OU | 100 | 2025-06-11 | "Check safety, efficacy, and transparency scores powered by **500+ clinical studies (PubMed, Harvard Health, Mayo Clinic)**"; "Every product rated on **Safety, Efficacy & Transparency** so you know what's safe and effective." |
| Supplement Scanner – InSup | AIBY Incorporated | 256 | 2025-10-21 | "Stop wasting money on supplements that **don't work**"; "Get a clear score (**0–100**) based on **Safety, Effectiveness, and Trust**—no complicated science talk" |
| SuppScan | Infinite Flow Labs Pte Ltd | 1 | 2025-12-03 | "Our AI instantly analyzes the ingredients to provide a comprehensive breakdown of **safety, efficacy, and potential side effects**"; "a clear '**SuppScore**' based on ingredient quality, transparency, and scientific backing" |
| Supplement Scanner: Amino | Rhino Labs LLC | 15 | 2025-08-13 | "**AI-Powered Analysis**: Get scores based on research-backed medical data" |
| Supplement Scanner: NutriSee | Dmitrii Cherviakov | 45 | 2025-06-08 | "Safety grades and purity insights"; "Unbiased scientific evidence reviews" |

Amino's site (aminohealth.app, opened) offers only: "Use our **proprietary algorithm** to rate your supplement stack based on real data." No formula, no sources, no thresholds. Suppi's stated seller URL (`aisupplement.app`) does not resolve.

---

## What this means for the Effect axis

1. **The category has never graded benefit.** Yuka/EWG/Think Dirty/INCI/OFF grade hazard or nutrient profile. EWG states in its own methodology that its number *"does not account for exposure"*; INCI Beauty states that it cannot obtain concentrations; Think Dirty states that its rating is *"necessarily a subjective process"*. Nobody is defending an efficacy claim, because nobody makes one.
2. **The one place a regulator has spoken, it demanded exactly what an Effect axis needs.** CNC Rec. 2 (document the basis of criteria *and their weighting*), Rec. 7 (don't score when you lack the data), Rec. 9 (base criteria on official risk-assessment bodies). An Effect score that publishes its weights, abstains when evidence is absent, and cites agency/systematic-review sources is compliant by construction.
3. **The strongest published attack on the whole genre is causality, not chemistry.** Peters & Verhagen (Foods 2022) killed the *health claim* for Nutri-Score — the single most-validated food score in the world — because "a cause-and-effect relationship could not be established". Any Effect number we publish will be attacked on exactly that ground. Pre-empt it: make the Effect axis an *evidence-strength* statement about a specific ingredient-at-dose, not a promise of outcome.
4. **"Efficacy" as a word is already being burned.** Prove It plus five clones ship an Efficacy score with no published method and, in Prove It's case, self-declared Wikipedia sourcing. Within ~12 months the term will be noise. Differentiation has to be the *published*, *auditable* method — dose-matched to trial dose, form-adjusted, population-qualified, with per-claim citations — and visible abstention ("insufficient evidence") rather than a comforting 84.
5. **The white space is dose × form × population.** Only INCI Beauty adjusts for form and target user, and only for hazard. Only SuppCo touches dose, and only at stack level as "optimization". Nobody compares *the dose in this bottle* to *the dose in the trials* and says how much of the effect you actually get.

---

## Confidence / gaps

- **Opened and quoted directly:** Yuka help centre (5 articles), yuka.io/en, INCI Beauty algorithm page + FAQ + store listing, Think Dirty methodology page, Open Food Facts nutriscore page + live API, EWG Skin Deep ratings + methodology + Food Scores methodology + EWG Verified FAQ (all via Wayback), CNC avis PDF, Peters & Verhagen 2022 full text, Bond et al. 2019 full text, McGill OSS, Skeptoid #623, supp.co/trustscore, iTunes listings for 11 apps, Google Play listings for Prove It and SuppCo, and 8 App Store screenshots read as images.
- **[NOT OPENED]:** ewg.org live (Cloudflare 403 — used Wayback); Le Point 2018 and Inserm magazine #44 (Hercberg/Touvier quotes are second-hand via fr.wikipedia); French court judgments on Legalis/Judilibre; *L'Usine nouvelle* CNC article; Panczyk 2023 *Foods*; the toxicologist survey Dunning cites; Yuka's Nutri-Score→/100 correspondence table (image); Think Dirty in-app product screen.
- **[GUESS] flagged in text:** Yuka's Excellent/Good/Poor/Bad numeric thresholds; SuppCo's and Prove It's revenue model specifics.
- **No named published critic found** for Think Dirty, INCI Beauty, SuppCo or Prove It — the criticisms given for those are either self-admissions from their own published method or a quoted user review, and are labelled as such.
