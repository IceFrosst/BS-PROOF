# Competitor brief — supplement QUALITY & TESTING lane

**Question:** at scan/lookup, what does each product show, and does it grade **whether the supplement works** (Effect) as opposed to purity/quality/safety?

**Headline answer: nobody in this lane grades efficacy.** Five of six explicitly restrict scope to identity, potency, purity, contamination and GMP. The one apparent exception — Labdoor's "Projected Efficacy" — is, by Labdoor's own published definition, a **bioavailability/dose/form model, not a benefit model**, and it is not even rendered on the current public product page. USP states the disclaimer in writing. The Effect axis is genuinely vacant here.

Research method: live `curl` of the pages listed below on this run. Where a site blocked direct curl (HTTP 403), I re-fetched through the `r.jina.ai` public reader and say so. Pages I could **not** open at all are flagged explicitly. Nothing below is from memory.

---

## Summary table

| Product | Shown at lookup | Number/grade? | Efficacy graded? | Dose/form/population | Personalisation | Evidence cited | Business model |
|---|---|---|---|---|---|---|---|
| **Labdoor** | Product name → **"LABDOOR SCORE 96.7 of 100"** + A–F band → CERTIFICATIONS, Lot, Tested date → buy links → **KEY DATA** (found vs claimed, contaminants vs limits) | **Yes.** 0–100 score + letter grade A/A+/B/C/D/F | **Named only.** 1 of 5 sub-scores is "Projected Efficacy" = dose × bioavailability × PK × form. **No clinical outcome grading.** Sub-scores not shown on the public product page I opened | Dose vs label claim measured; form/bioavailability enters Projected Efficacy (zinc oxide vs citrate example); DRI/UL comparisons. No population segmentation | None | Methodology cites Prop 65, EPA RfD, ATSDR MRL, NIH DRI/UL, FDA GRAS, GOED, USP limits. **No trial-level citations on product pages** | Affiliate on product sales + paid "Labdoor Enterprise / Certifications / Amazon Program" testing for brands |
| **ConsumerLab** | Paywalled review with narrative sections incl. **"What It Does"**, "Quality Concerns", "ConsumerTips", **"Top Picks"**; per-product **Approved / Not Approved** + CL Seal | **No score.** Binary Pass/Approved | **Not graded — but narrated.** The only player that systematically writes up clinical trials; efficacy never enters the Approved decision (identity, strength, purity, disintegration) | Dosage discussed editorially; disintegration tested; population-specific trial write-ups (pregnancy, children, dialysis) in prose only | None | **Yes — heavy.** Review anchors are literally author surnames (`#bhatt`, `#nissen`, `#abdelhamid`) | Consumer subscription **$75/yr ($6.25/mo)** or **$125/2yr ($5.21/mo)** + paid Quality Certification Program + Seal licence + PriceCheck click fees |
| **NSF Certified for Sport** | Product photo → name → Brand, Country of Sale, Product Type, **Purpose / Goal**, **Lot #**, Product Form, Flavor, Package Size, Serving Size, "View Product Label" | **No.** Binary listed/not-listed | **No.** 290 banned substances + label-content match + contaminant limits + GMP audit | Serving size displayed as label data only; "Purpose / Goal" is a brand-supplied marketing tag (e.g. "Brain Health, Muscle Growth, Strength"), not a graded claim | None | None on listing | B2B certification fees paid by manufacturers |
| **Informed Sport / Informed Choice** | Batch/brand/product search → certified + tested-batch listing | **No.** Binary | **No.** >285 substances prohibited in sport, ISO 17025, pre-certification quality review | Informed Sport = every batch pre-release; Informed Choice = ≥12 random retail batches/yr. No dose or population logic | None | LGC white papers/administration studies on contamination only | B2B certification fees (LGC Group) |
| **USP Verified** | USP Verified Mark on pack + participant list | **No.** Binary mark | **No — explicitly disclaimed in writing** | Dissolution/disintegration required (release, not effect); declared strength verified | None | USP–NF monographs | B2B verification fees; Amazon Compliance Fast Track tie-in |
| **Amazon "quality" badges** | Nothing consumer-facing found. Compliance is **seller-side documentation** (cGMP cert + third-party lab testing via authorised TIC provider) | **No** | **No** | n/a | n/a | n/a | Marketplace gating; sellers pay TIC labs |

---

## 1. Labdoor

**Pages opened (direct curl, HTTP 200):** `labdoor.com/about`, `labdoor.com/about/scores`, `labdoor.com/about/testing`, `labdoor.com/rankings/fish-oil`, `labdoor.com/review/viva-naturals-triple-strength-omega-3-fish-oil`. `labdoor.com/about/methodology` → **404** (does not exist; the methodology lives at `/about/scores`).

**(1) Result screen, in order, actual wording** — from the Viva Naturals fish oil review page:

> Viva Naturals Triple Strength Omega-3 Fish Oil → `FISH OIL RANKING` / `BUYING OPTIONS` → **`LABDOOR SCORE` `96.7` `of 100`** → `A B C D F` → `CERTIFICATIONS` `See report` → `Lot: UC250438` `Tested: May 18,2026` → `BUY FROM THESE SELLERS` (Amazon) → **`KEY DATA`**: `Omega-3 Fatty Acids Found 2495.0 mg / Claimed 2250.0 mg`, `DHA Found 640.0 mg / Claimed 570.0 mg`, `EPA Found 1596.0 mg / Claimed 1500.0 mg`, `Peroxide Value Found 1.61 meq/kg / GOED Limit 5.0 meq/kg`, `p-Anisidine Value ... GOED Limit 20.0 p-AV`, `TOTOX ... GOED Limit 26.0 TOTOX`, `Arsenic Found Below LOQ** / USP Limit 15.0 ug/day`, `Lead ... USP Limit 5.0 ug/day`, `Cadmium ... 5.0 ug/day`, `Mercury ... 15.0 ug/day` → then the FDA disclaimer: *"These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease."*

The `/rankings/fish-oil` index shows letter grades only (`A+`, `A`, plus `Expired` / `Upcoming` states) with sort tabs `Certified / Quality Ranking / Value Ranking / A-Z`.

**(2) The number and what it's computed from.** Quoted from `labdoor.com/about/testing`:

> "We calculate a Quality score using laboratory results and label claims from each product. Quality scores are comprised of individual scores for **Label Accuracy, Product Purity, Nutritional Value, Ingredient Safety, and Projected Efficacy.**"

The five categories, quoted verbatim from `labdoor.com/about/scores`:

- **Label Accuracy** — "based on a product's measured levels of active ingredients vs. its label claims… Penalties are twice as heavy if a product has less than what they claim (underage) compared to if they have more (overage)."
- **Product Purity** — "based on a product's contaminant levels… default purity assessments consist of heavy metal assays… compared to guidelines… MADLs and NSRLs from California's Prop 65, Reference Doses (RfDs) from the US EPA, and Minimal Risk Levels (MRLs) from the US ATSDR."
- **Nutritional Value** — "based on levels of a product's macronutrients and other supporting nutrients… rewarded and penalized… based how they meet or exceed Dietary Reference Intakes (DRIs)."
- **Ingredient Safety** — "based on whether a product has: 1) active ingredients at unsafe levels and/or 2) additives with potential health risk… penalized as their active ingredient levels approach or exceed established Tolerable Upper Intake Levels (ULs)… additives, or excipients, are also evaluated… assigned weights based on FDA 'Generally Recognized As Safe' (GRAS) status."
- **Projected Efficacy** — **this is the critical one**: "Labdoor's Projected Efficacy score is based on a product's active ingredients, their levels, and their specific biochemical properties. Each product is assessed based on the quantity of each of its active ingredients and **how well the body can absorb and use them**. The latter can be attributed to a variety of factors, including the **bioavailability of each ingredient's form (e.g. zinc oxide vs. zinc citrate), their pharmacokinetic (PK) profiles, their concentration (e.g. EPA and DHA in fish oil), and their combination with other ingredients** in the product… This information is curated from peer-reviewed research as well as expert consultations."

**(3) Is efficacy graded?** **No — not in the sense we mean.** "Projected Efficacy" grades *how much active ingredient is likely to reach the bloodstream*, not *whether reaching the bloodstream produces a benefit in a healthy person*. There is no ingredient-level "does this work" verdict, no effect size, no outcome. Labdoor never asks whether the ingredient class has clinical support. Its own category glossary (`/rankings/fish-oil` "FISH OIL GUIDE") says the opposite of grading: *"More research is needed to completely clarify the properties, effects and potential benefits of the regular consumption of omega-3s as a dietary supplement."*

**(4) Dose, form, population.** Dose: measured vs claimed, penalised asymmetrically; vs DRI (Nutritional Value) and vs UL (Ingredient Safety). Form: handled only inside Projected Efficacy via bioavailability/PK. Population: **not handled at all** — one score for everyone. No age, sex, deficiency status, diet or baseline adjustment.

**(5) Personalisation.** None observed.

**(6) Evidence sourcing.** Regulatory/reference-intake sources (Prop 65, EPA RfD, ATSDR MRL, NIH DRI/UL, FDA GRAS, GOED oxidation limits, USP heavy-metal limits) plus one cited paper (Dorato & Engelhardt 2005 on NOAELs). No RCT or meta-analysis citations attached to scores.

**(7) Business model.** From `/about`: "Labdoor makes money in two ways. First, we receive a portion of every dollar spent by consumers who purchase products directly from our site. Second, we offer testing services for companies that need independent validation of their product quality." Footer confirms an ENTERPRISE stack: `Labdoor Enterprise / Custom Testing / Certifications / Labdoor Click / Amazon Program / Manufacturer Partners`. So: **affiliate commission on the products it ranks, plus paid certification for brands it also ranks.** Labdoor discloses the affiliate tension itself ("We add 'Buy it now' links to products on our site whenever possible, regardless of their grades") and states it takes no manufacturer money "to rank products on our site."

**(8) Strongest criticism.** Named critic: **Illuminate Labs (Calloway Cook)** — note the conflict, Illuminate Labs sells supplements, so treat as an interested party. Their "Labdoor Review" (illuminatelabs.org/blogs/health/labdoor-review) says:

> "The brand's methodology for this scoring system, while described on their website, is not transparent in terms of weighting… There is no 'Projected Efficacy' or 'Ingredient Safety' or 'Nutritional Value' listed on the test results page… **As a reader, you're left entirely unclear how the brand reached the 61.3/100 rating**"

and on internal inconsistency:

> "Labdoor's tests show that this supplement contains barely over 50% of the stated dose of folic acid and panthenoic acid, and over 300% of the vitamin B12 dose… With such a high score, a reader would probably assume this supplement is at the very least accurately labeled. However, that's not the case at all, according to Labdoor's own test results."

**I independently confirmed the display half of this claim today**: the Viva Naturals product page I opened shows the 96.7/100 headline and KEY DATA but **renders none of the five sub-scores** — `grep -io "projected efficacy|label accuracy|nutritional value|ingredient safety|product purity"` over the fetched HTML returned **zero matches**. So the one "efficacy" component in the whole lane is not visible to a user at lookup.

**(9) Coverage/limits.** Category-based, not comprehensive: rankings are per-category top-10s. `/about`: "We strive to add at least one new product category to our site every month and update existing categories at least once every 24 months." The fish-oil ranking I opened listed **10 products total**, of which 4 were `Expired` or `Upcoming`. Footer copyright still reads "© 2019 Labdoor, Inc." — the public site is lightly maintained.

---

## 2. ConsumerLab (CL)

**Pages opened:** `consumerlab.com/about/` (direct, 200), `consumerlab.com/reviews/fish-oil-supplements-review/omega3/` (via reader, 200), `consumerlab.com/join/` (direct, 200). **Could not open:** `/quality-certification-program/`, `/seal/`, `/how-products-are-tested/` — all returned member-gated stubs (~2–3 KB of nav only). So the detailed standards table ("How Products Were Tested") is **unverified by me**.

**(1) Result screen.** Reviews are category-level, not per-barcode. The public shell of the fish-oil review shows, in order: "Latest Clinical Research Updates for Fish Oil /Omega-3 Fatty Acid Supplements" → a dated stream of clinical findings → deep links into named sections: **"What It Does"**, **"Quality Concerns"**, **"Concerns and Cautions"**, **"ConsumerTips"**, **"Top Picks"**, plus per-condition anchors (`#dry-eye-trials`, `#atrial-fibrillation-risk`, `#prostate-cancer-progression`, `#strength-gains`). Products are labelled **"Approved"** / not, and eligible ones may carry the **CL Seal of Approval**.

**(2) Number/grade?** No numeric score. Binary. What "Approved" means, quoted from `/about/`:

> "Products are tested, whenever possible, for each of the following: **Identity**… **Strength (quantity)**… **Purity**: Is the product free of specified contaminants? **Disintegration**: Does the product break apart properly so that it may be used by the body?… **These quality criteria must be met to be considered Approved by CL.**"

**(3) Efficacy graded?** **No — but it is the only player that systematically *narrates* efficacy.** The "What It Does" section is an ongoing clinical-evidence digest (teen depression, dementia, knee OA, dry eye, preterm birth, resistance-training gains, sperm count, long COVID). Note CL also publishes **negative** findings — e.g. a promoted update reads *"A recent study linked omega-3 supplements with faster cognitive decline -- an unexpected finding"*. But none of that touches the Approved/Not-Approved decision, and there is no efficacy score, grade or band. **"Top Picks" is a quality+value pick, not an efficacy ranking** — the strongest-evidence ingredient and the weakest can both have Top Picks.

**(4) Dose, form, population.** Dose and form are discussed editorially (a "Dosage" discussion and comparative absorption content — e.g. an update titled "Omega-3 Absorption: Krill vs Fish Oil"); **disintegration is physically tested** by CL itself ("tests other than initial disintegration analysis (which is performed by CL)"). Population handled only as narrative trial context (pregnancy, children, dialysis patients, statin users).

**(5) Personalisation.** None. It is a reference library plus a member survey ("Annual Supplement Users Survey", "Brand Survey").

**(6) Evidence sourcing.** Strongest in the lane. Review anchors are author surnames (`#bhatt`, `#nissen`, `#abdelhamid`, `#budoff`, `#aung`, `#jensen`), i.e. individual studies are addressable objects inside the review. CL also claims uniqueness on method transparency: *"ConsumerLab.com is also the only third-party verification group that freely publishes its testing methods and quality criteria/standards."* (I could not verify that page — gated.)

**(7) Business model.** From `/about/`: "Revenues are derived primarily from online membership fees… Revenues are also derived from Quality Certification Program fees, authorized use of the CL Seal of Approval, and sales of survey reports… we include PriceCheck links… We may receive a click-through fee." Consumer pricing from the live `/join/` page: **"Only $5.21/month for 2-years (billed at $125.00)"** and **"Only $6.25/month for 1 year (billed at $75.00)"**. Seal retention requires annual re-testing.

Notable strictness claim (own words): *"the amount of lead contamination that some U.S. companies and other third-party testing groups permit in supplements can be as much as forty times higher than what ConsumerLab.com would permit."*

**(8) Strongest criticism.** Two, both from named parties in `newhope.com/regulatory/industry-weighs-impact-of-consumerlab-crn-dispute` (published 2005-02-28, opened via reader):

- Business-model attack — **Annette Dickinson, then president of the Council for Responsible Nutrition**, on CRN's FTC complaint: *"We are not opposed to third-party testing… We are opposed to this kind of business model. **ConsumerLab is a business, not a watchdog — and one that intimidates manufacturers to pay for its services.**"* The complaint alleged CL "engages in deceptive business practices by only publishing positive results of those companies that pay to have their products tested." CL founder **Tod Cooperman, MD** called the allegations *"false and absurd"*: *"We always publish all the positive and all the negative results of tests we do on our own dime."* (Same article notes FDA-adjacent bodies did not adjudicate; FTC had not responded at time of publication.)
- **The criticism that matters most for our Effect axis** — **Roy Upton, executive director of the American Herbal Pharmacopoeia**, in the same piece: *"**The biggest criticism I have about such testing programs is that no one is determining if a product is effective or ineffective.** Everyone is chasing arbitrary marketing compounds that may have nothing or little to do with activity."* He also said: *"I think it's good for all such programs to be challenged… but without well-accepted industry standards, most testing is arbitrary and meaningless."*

That Upton quote is the single best external articulation of the gap BS Proof is trying to fill, and it's 20 years old and still unanswered.

**(9) Coverage/limits.** "over 1,400 product reviews" available at any time; "tested more than 7,000 products, representing over 1,000 different brands" since 1999. Reviews refresh "approximately every 24 to 36 months", and **old reviews are deleted**: "When a newer Product Review is posted, it generally replaces any previous Product Review covering the same category of products and the older review is removed from the website." Hard paywall — a consumer scanning a bottle gets nothing without paying.

---

## 3. NSF Certified for Sport®

**Pages opened (direct, 200):** `nsfsport.com/`, `/our-mark.php`, `/get-certified.php`, `/certified-products/search-results.php?keyword=creatine`, `/certified-products/listing-detail.php?id=1820613`. **Not opened:** in-app scan screens (the Apple App Store page returned only a generic meta description; I did not install or view screenshots) — so app UX below is inferred from the web listing and flagged as such.

**(1) Result screen, actual wording.** Real lookup I ran (creatine → 10X Health):

> `10X Health Creatine Monohydrate` → `Product Details` | `Compare Product` → `Brand: 10X Health` → `Country of Sale: United States` → `Product Type: Creatine/Men/Muscle Growth/Women` → **`Purpose / Goal: Brain Health, Muscle Growth, Strength`** → `Lot #: 26BP23767` → `Product Form: Powder` → `Flavor: Unflavored` → `Package Size: 300 g` → `Serving Size: 1 scoop (5 g)` → `View Product Label`.

Note the trap: **"Purpose / Goal" looks like an efficacy field and is not one.** It is a brand-supplied filter taxonomy — the same facet list offers "Anti-Aging", "Focus", "Energy Enhancement", "Sleep Aid", "Hair Growth". NSF makes no claim that the product achieves any of it. (Filters are worth knowing because they are exactly the affordance users will misread as an Effect claim.)

**(2)/(3) Number and scope.** No score, binary listing. Scope quoted from `/our-mark.php`:

> "We verify that these products **do not contain unsafe levels of contaminants, prohibited substances or masking agents, and that what is on the label matches what is in the product.**"

and the enumerated components:

> "Products do not contain any of **290 substances banned by major athletic organizations** · The contents of the supplement actually match what is printed on the label · There are no unsafe levels of contaminants in the tested products · The product is manufactured at a facility that is GMP Certified and audited annually or bi-annually."

The standard is **NSF/ANSI 173** ("the first truly independent testing standard and product certification program strictly for dietary supplements") plus NSF 229 for functional foods. **Efficacy appears nowhere.** The word used throughout is "safer", never "effective": "helps athletes, dietitians, coaches, and consumers around the world make **safer** decisions."

**(4) Dose/form/population.** Dose only as label-match. Form is a display field. Population: none, beyond "designed for elite sport". Specific dietary-supplement assays listed in `/get-certified.php`: "Protein and caffeine verification · Disintegration testing · Residual solvents · Pesticides/herbicides".

**(5) Personalisation.** None.

**(6) Evidence.** None on the listing. NSF publishes contamination research in its newsroom (e.g. "Nine Potentially Harmful Stimulants Found in Weight Loss and Sports Supplements Listing Deterenol as Ingredient") — that is adulteration surveillance, not efficacy.

**(7) Business model.** Manufacturer-paid three-step certification (GMP cert → contents tested & certified → per-lot banned-substance testing), with annual audits and ongoing lot testing. Fees not published on the site.

**(8) Strongest criticism.** I could **not** open USADA's supplement411 pages (usada.org returned HTTP 403 / Cloudflare block) so I am **not** quoting USADA. The strongest openable, named source is the **NIH Office of Dietary Supplements**, which addresses all seals in this lane at once (ods.od.nih.gov/factsheets/WYNTK-Consumer/):

> "Several independent organizations offer quality testing and allow products that pass these tests to display a seal of quality assurance that indicates the product was properly manufactured, contains the ingredients listed on the label, and does not contain harmful levels of contaminants. **These seals do not guarantee that a product is safe or effective.**"

Second-order criticism, structural: the program's own quoted endorsement from a paid-adjacent source — Leslie Bonci, "Klean Athlete Sports Nutrition Advisor" — appears in the testimonial block, i.e. a brand-affiliated dietitian vouching for the certifier her brand buys.

**(9) Coverage/limits.** Only products whose manufacturers pay. Brand list skews to large sports-nutrition and DTC names (AG1, Herbalife24, Gatorade, C4, IM8, ZOA+). Recognised by USADA/MLB/NHL/CFL, "recommended by" NFL/NBA/PGA/LPGA/NASCAR/Ironman. It answers "will this get me banned or poisoned", not "will this do anything".

---

## 4. Informed Sport / Informed Choice (LGC)

**Pages opened:** `informed-sport.com/` (200), `/about/science-and-testing` (200), `/about/sport-vs-choice` (200), `/about/frequently-asked-questions` (via reader, 200), `sport.wetestyoutrust.com/` (via reader, 200). **Not opened:** individual batch-lookup result screen (the search is a JS widget; I retrieved the search shell, not a rendered batch result) — flagged as a gap.

**(1) Result screen.** Lookup is by **batch/lot**: "Search by brand, product name, or product type" and, per the FAQ, "You can search by batch number, brand name, product name and formulation." Homepage headline: **"EVERY BATCH. TESTED."** and "SEARCH FOR OVER 2000 BANNED SUBSTANCE TESTED PRODUCTS". The result is a certified-product/tested-batch listing with downloadable certificates ("Independent product and batch certificates are available"). **No score, no efficacy field.**

**(2)/(3) Scope.** Quoted from `/about/science-and-testing`:

> "LGC routinely screens supplement products for **in excess of 285 compounds considered prohibited in sport/harmful to health** - substances such as drugs of abuse, anabolic agents, stimulants, beta-2 agonists, diuretics and new and emerging threats."
> "Test methods used for analysis of supplement products/ingredients are accredited to **ISO/IEC 17025**… Accreditation is granted by UKAS… (laboratory number 1187)."

From the FAQ, the full scope claim: "products carrying the Informed Sport mark have been **tested for prohibited substances and manufactured to high-quality standards**." **Efficacy is not mentioned anywhere on any page I opened.** The value prop is inadvertent-doping risk reduction: "product contamination was responsible for 8% of all anti-doping violations between 2005-2022" and "As many as one-in-ten supplements are contaminated."

**(4) Dose/form/population.** None. Only batch coverage differs:

> "**Informed Sport** supplement certification means every batch/lot of a product is tested prior to being released to the market… **Informed Choice** supplement certification is a retail monitoring programme… At least twelve lots/batches of the product are tested at random every year, but unlike Informed Sport, it is not guaranteed that every batch has been tested."

Population is a market segment, not a model: "Informed Sport was specifically created to cater to elite athletes and drug-tested personnel."

**(5) Personalisation.** None.

**(6) Evidence.** Contamination-prevalence research and administration studies only: "LGC has conducted administration studies… published in peer-reviewed scientific journals. These studies have highlighted that consuming even microgram quantities of a prohibited substance… could give rise to a positive doping violation."

**(7) Business model.** Manufacturer-paid certification; LGC Group. "CERTIFIED PRODUCTS FROM 330+ BRANDS", "PRODUCTS SOLD IN 132 COUNTRIES", "LGC currently tests over 25,000 samples each year."

**(8) Strongest criticism.** The best named source here is Informed Sport quoting **WADA against the entire certification-marketing category** (from its own FAQ):

> "*WADA is not involved in any certification process regarding supplements and therefore does not certify or endorse manufacturers or their products. WADA does not control the quality or the claims of the supplements industry which may, from time to time, claim that their products have been approved or certified by WADA.*"

and Informed Sport's own homepage line, which is really a criticism of badge semantics generally: *"A label stating 'Safe for Sports People', or 'Approved by WADA' is meaningless."* Apply the same logic to any badge that implies efficacy. NIH ODS's "These seals do not guarantee that a product is safe or effective" applies here too.

**(9) Coverage/limits.** Pay-to-play; excludes whole categories by policy ("Informed Sport currently does not allow any cannabinoid containing products onto the Informed Sport programme"). Batch-level, so a certified brand's *uncertified* batch is out of scope — which is precisely why the lookup is batch-keyed.

---

## 5. USP Verified

**Pages:** `usp.org/verification-services/dietary-supplements-verification-program` and `usp.org/frequently-asked-questions/usp-verification-services` — **direct curl returned HTTP 403 (blocked)**; both read successfully through the `r.jina.ai` reader, content verbatim below. `quality-supplements.org` also 403 to direct curl and I did **not** retrieve it — flagged as unread.

**(1) Result screen.** There is no consumer scan surface. The artefact is the **USP Verified Mark** on pack plus a "Program Participants" list. No number, no tiering.

**(2)/(3) Scope and the efficacy disclaimer.** This is the clearest published scope language in the whole lane. From the Verification Services FAQ:

> "USP's Verification Program **only verifies that supplements contain the ingredients stated on the label, in the stated amounts, and that they meet acceptable limits for contaminants such as heavy metals, pesticides, dioxins, furans, PCBs, and microbes.** The program also verifies that the products are manufactured using safe, sanitary, and well-controlled procedures."

and, explicitly:

> "Products verified by USP are required to dissolve or disintegrate properly, meeting USP monograph requirements, thereby releasing the dietary ingredients and making them available to be absorbed by the body. **USP's Verification Program does not comprehensively address the issue of efficacy of a dietary supplement.**"

USP even ring-fences *safety*: "Determining the safety of dietary supplements is a broad undertaking, and includes assessment of drug interactions, contraindications, and side effects" — i.e. the mark is not a safety verdict either. The marketing line is deliberately narrow: **"If it's USP Verified, consumers can trust that what's on the label is what's in the bottle."**

**(4) Dose/form/population.** Dose = declared strength verified. Form = dissolution/disintegration per monograph — the closest anyone gets to "will it be absorbed", and still upstream of effect. Population: none.

**(5) Personalisation.** None.

**(6) Evidence.** USP–NF monographs and General Chapter <2750>; verification steps are: GMP facility audit (also vs 21 CFR Part 111), QCM documentation review, product testing, plus "**Off-the-shelf testing** of USP Verified dietary supplements to confirm that the product continues to meet science-based quality standards." Annual, not one-off: "Verification is not a one-time event."

**(7) Business model.** Manufacturer-paid verification. Commercial pitches quoted from the DSVP page: it "Helps a company meet retailer quality requirements" and "Gives your company additional brand and reputational protection", and the mark is "the #1 recommended seal/mark by healthcare practitioners." The **Amazon Compliance Fast Track Program** page adds: "Through Amazon's Compliance Fast Track Program, USP Verified dietary supplements are automatically validated for compliance with Amazon's policy, eliminating the need for manual documentation submission" — i.e. the badge is being monetised as marketplace access.

**(8) Strongest criticism.** USP publishes no test data: "**USP does not publish testing reports and results of the supplements and ingredients it verifies.** However, USP does provide the results and the details of the testing to the participants and/or manufacturers." So the consumer gets a binary mark with zero underlying numbers — the opposite of what an Effect axis needs. External check, NIH ODS again: "These seals do not guarantee that a product is safe or effective." I did **not** find a named regulator or academic critique of USP specifically in openable sources on this run — flagged as a gap, not as absence of criticism.

**(9) Coverage/limits.** Voluntary and narrow by ingredient class: "USP verifies dietary supplements containing vitamins like B, C, D, and E, minerals like calcium, and other dietary supplements like melatonin, CoQ10, botanicals, and probiotics." Participant count not stated on the page I read.

---

## 6. Amazon "Quality Certified"–style badges — **not verified to exist**

**Pages opened (via reader, 200):** `sellercentral.amazon.com/help/hub/reference/external/G55N3JF2WQS7RVNE` ("Dietary supplements" policy) and `.../GUTZ2R2DD6P2UMVB` ("Direct product validation: Third-party testing, inspection, and certification services").

**Finding: I could not verify any consumer-facing Amazon supplement quality badge or score.** What exists is a **seller-side compliance gate**, invisible on the detail page:

> "To list on Amazon, you must work with a direct product validation **authorized third-party testing, inspection, and certification (TIC) service provider** to verify all notified ASINs… You will no longer submit documents directly to Amazon. Instead, the TIC provider will submit them on your behalf."

Requirements quoted: compliance with 21 CFR 101, 21 CFR 111 (or 117); for Bodybuilding products "**NSF/ANSI 173-2024** (American National Standard for dietary supplements), or equivalent"; `Certifications: Required`; `Testing: Required`; an accredited third-party cGMP certificate in good standing (accepted schemes include **NSF/ANSI 455-2, USP GMP, SGS GMP, TGA GMP, SSCI, ISO 22000, GRMA**); a Certificate of Insurance. Authorised TIC providers for dietary supplements: **Certified Laboratories, Cotecna, Eurofins, Intertek, Mérieux NutriSciences, NSF, SGS, UL**. Enforcement is surveillance-based: "Your products may also be randomly selected for surveillance testing… If your product fails testing or your documents fail review, the listing will be deactivated right away."

**Efficacy graded?** No — not even mentioned. Amazon's only claim-side rules are anti-overclaim label consistency rules ("Contain extract or ingredient weight claims that do not match the amounts shown in the 'Supplement Facts' panel" is prohibited). Any "certification logos" that appear are the **brand's own** artwork on the product label image ("The full product label in English affixed to the product, including… certification logos"), not an Amazon-issued grade.

**Business model.** Marketplace gating; sellers bear TIC costs. USP monetises the gate directly (Fast Track). **Flagged as a guess:** I did not find, and therefore cannot confirm or deny, a rumoured consumer-visible "Quality Certified" badge; searches for it returned nothing on Amazon-owned domains. If the parent has a screenshot of one, treat my finding as "not present in Amazon's published policy documentation as of this run."

---

## 7. Why efficacy grading is commercially rare — the US regulatory frame

**Page opened (via reader, 200):** `fda.gov/food/information-consumers-using-dietary-supplements/questions-and-answers-dietary-supplements`. (Note: `fda.gov/.../structurefunction-claims` returned **404** — that URL is dead.)

**No premarket approval, and no efficacy review at all:**

> "Under DSHEA, **FDA does not have the authority to approve dietary supplements before they are marketed.**… FDA generally does not approve dietary supplement claims or other labeling before use."

> "…unlike drugs that must be proven safe and effective for their intended use before marketing, **there are no provisions in the law for FDA to approve dietary supplements for safety before they reach the consumer.**"

**The three claim categories** (this is the vocabulary our Effect axis has to live alongside):

> "health claims (claims about the relationship between a dietary ingredient or other food substance and reduced risk of a disease or health-related condition), **structure/function claims (claims about effects on a structure or function of the human body)**, and nutrient content claims."

**The disclaimer, and exactly why it exists:**

> "**Why do some dietary supplements have wording on the label that says: 'This statement has not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease'?**
> This statement, known as a 'disclaimer,' is required by law (**21 U.S.C. 343(r)(6)(C) and 21 CFR 101.93(b)–(d)**) when a manufacturer makes a structure/function claim or certain other claims in dietary supplement labeling… These three types of claims are **not approved by FDA and do not require FDA evaluation** before they are used in dietary supplement labeling. Accordingly, DSHEA requires that when a dietary supplement label or other labeling includes such a claim, the claim must be accompanied by a disclaimer informing consumers that FDA has not evaluated the claim. **The disclaimer must also state that the product is not intended to 'diagnose, treat, cure, or prevent any disease' because only a drug can legally make such a claim.**"

**Substantiation sits with the firm, unreviewed:**

> "If a manufacturer or distributor makes a structure/function claim… the firm must have substantiation that the claim is truthful and not misleading."
> "Generally, a firm does not have to provide FDA with the evidence it relies on to substantiate safety before or after it markets its products."

**Read-across for BS Proof.** The regulatory architecture creates a hard commercial boundary: a *seller* can only make unevaluated structure/function claims and must disclaim them; a *certifier paid by sellers* cannot grade efficacy without either (a) rating its own customers' claims down, or (b) manufacturing an implied endorsement that looks like an unapproved disease/efficacy claim. Hence every paid certifier in this lane retreats to identity/potency/purity/contamination, where the standard is objective, defensible and doesn't insult the client. **The efficacy question is orphaned not because it's unimportant but because nobody in the pay-per-badge model can afford to answer it.** ConsumerLab gets closest because its money comes from consumers, not manufacturers — and even it narrates rather than scores.

---

## What this means for the Effect axis

1. **The field is empty and the name is free.** No competitor in this lane outputs anything a user could read as "how much real improvement will I get". Labdoor has squatted the *word* ("Projected Efficacy") on a bioavailability construct, but doesn't even display it. There is no incumbent definition to fight.
2. **Labdoor's "Projected Efficacy" is the trap to avoid, not the model to copy.** Dose × bioavailability × form × PK answers "will the molecule arrive", not "does the molecule do anything". A 96.7/100 fish oil and a 96.7/100 homeopathic-tier ingredient would look identical.
3. **The best precedent for evidence handling is ConsumerLab's "What It Does" + per-study anchors** — addressable trials, including negative ones. Scoring what CL narrates is the concrete unoccupied position.
4. **Do not let a seal imply effect.** NSF's "Purpose / Goal" field is a live example of brand marketing masquerading as an efficacy judgement in a certifier's UI. If we surface third-party badges, we must show what each one *actually* certifies, and NIH ODS's line — "These seals do not guarantee that a product is safe or effective" — is the right framing text.
5. **Quote Roy Upton.** "The biggest criticism I have about such testing programs is that **no one is determining if a product is effective or ineffective**" (American Herbal Pharmacopoeia, 2005). Twenty years on, it is still true of every player in this lane, including the two founded since.
6. **Population and personalisation are 100% unaddressed.** Not one of the six adjusts for baseline status, deficiency, age, sex or diet. A healthy-person-specific effect model has no competitor at all.
7. **Legal posture.** Grading benefit is *not* a structure/function claim by us (we're not the labeller), but the surrounding disclaimer regime is why the market reads efficacy talk as legally hot. Expect brand pushback framed as "FDA hasn't evaluated this either" — the counter is that we grade the *evidence base*, not the product's claims.

---

## Sources — open/closed status

**Opened directly (HTTP 200):** labdoor.com/about · /about/scores · /about/testing · /rankings/fish-oil · /review/viva-naturals-triple-strength-omega-3-fish-oil · consumerlab.com/about/ · consumerlab.com/join/ · nsfsport.com/ · /our-mark.php · /get-certified.php · /certified-products/search-results.php?keyword=creatine · /certified-products/listing-detail.php?id=1820613 · informed-sport.com/ · /about/science-and-testing · /about/sport-vs-choice

**Opened via r.jina.ai reader (direct curl blocked or JS-gated):** usp.org DSVP · usp.org verification FAQs · usp.org Amazon Fast Track · fda.gov dietary supplements Q&A · ods.od.nih.gov WYNTK-Consumer · consumerlab.com fish-oil review (public shell) · informed-sport.com FAQ · sport.wetestyoutrust.com · sellercentral.amazon.com G55N3JF2WQS7RVNE and GUTZ2R2DD6P2UMVB · newhope.com ConsumerLab/CRN dispute · illuminatelabs.org Labdoor review

**Could NOT open — do not treat as researched:** usada.org supplement411 (HTTP 403, Cloudflare) · quality-supplements.org (HTTP 403) · consumerlab.com /how-products-are-tested/, /seal/, /quality-certification-program/ (member-gated stubs) · Labdoor per-product sub-score breakdown behind "See report" (JS/login) · NSF Certified for Sport and Informed Sport **mobile app** in-app screens · Informed Sport rendered batch-lookup result · labdoor.com/about/methodology (404) and labdoor.com/about/business (404) · fda.gov structure/function-claims page (404)

**Flagged as interested-party / conflicted source:** Illuminate Labs (sells supplements) — used only where I independently reproduced the observation.
