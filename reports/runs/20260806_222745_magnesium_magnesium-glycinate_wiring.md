# BS-PROOF audit report

Generated: **2026-08-06 22:27 UTC** · mode **wiring** · `magnesium` / `magnesium_glycinate`


## How a score is built (the recipe)

Deterministic path in `pipeline/scoring.py` + `pipeline/assemble.py`.
**No model decides the number** — models extract fields; arithmetic scores.

```text
1. weight w = design × RoB × size × funding × OA × form × dose × pop
2. E, d, H, c, E' from weights and signed effects
3. score = clamp(round(100 × d × c × (1 − 0.4 × H)), −100, +100)
4. Gate if almost no human clinical weight → null
```

## Selftest: **ALL PASSED**

```text

CLINICALTRIALS.GOV (RoB items 3+4, unpublished flag)
  PASS  registered before enrolment -> 1  
  PASS  registered after enrolment -> 0  
  PASS  missing start date -> null, not a guess  
  PASS  same month at month precision -> null  the answer would depend on a day we do not have
  PASS  completed, no results, overdue -> flagged  
  PASS  results posted -> not flagged  
  PASS  recently completed -> not flagged  
  PASS  attrition computed from participant flow  1605 started, dropout 0.061
  PASS  no posted results -> attrition all null  

ASSEMBLY (worker JSON -> scored ECU rows)
  PASS  one ECU row per surviving outcome  the unmapped claim was DISCARDED, not bucketed
  PASS  benefit outcome scores positive  score 86
  PASS  nulls on a second outcome score NEGATIVE  score -61 — dropping nulls would bias every score up
  PASS  provenance stamped on every row  
  PASS  transfer factor discounts a different salt family  glycinate 86 -> oxide 26
  PASS  registry overrides S4's null on item 3  a date comparison has a right answer
  PASS  S4 null with no registry stays null  
  PASS  attrition threshold applied in code, not by a model  
  PASS  population axes reach the transfer factor  deficient study vs general-adult product: adjacent
  PASS  S3 failure -> population unknown, not assumed exact  pop_match=adjacent
  PASS  missing S8 -> undisclosed, the vocabulary's own value  

CALIBRATION HARNESS (face validity, not magnitude)
  PASS  anchor set structurally valid  35 anchors
  PASS  every in-scope anchor has a vocabulary entry  34/34 runnable
  PASS  multi-ingredient anchors deferred, not counted as a gap  v1 is 1-2 ingredient products (SPEC §2)
  PASS  wrong side of zero is a SIGN error, the fatal class  telling users the opposite of the evidence
  PASS  gating a well-studied anchor is fatal too  
  PASS  right sign, wrong magnitude is NOT fatal  expected while k and the transfer factors are uncalibrated
  PASS  in-range anchor passes  
  PASS  relative pair anchors skipped, not judged on a range  

SYNTHESIS RESOLUTION (the dedup trap, from the SR side)
  PASS  included studies map to the SAME canonical ids as the primaries  otherwise the SR row and the paper are two units
  PASS  unresolvable rows counted, never approximated  
  PASS  resolved when most rows map  75% resolved
  PASS  an SR we cannot resolve is UNRESOLVED, not partial credit  10% resolved — score_ecu ignores it
  PASS  author+year resolves an SR row with no DOI  without this tier SR inheritance yields nothing
  PASS  ambiguous author+year REFUSES rather than merging two trials  two different Smith 2019 studies exist in the corpus
  PASS  complete SR with a RoB table scores highest quality  
  PASS  incomplete extraction is downgraded  
  PASS  'unclear' RoB is dropped, not mapped to a band  an unclear judgment is not a judgment
  PASS  30 RESOLVED syntheses over 9 RCTs still bounded  E'/E = 1.21

GREEN OA RESOLUTION
  PASS  OA location normalised  
  PASS  closed access -> None, a real answer  
  PASS  reference list available for SR resolution  narrows S2's search space; never decides membership
  PASS  europepmc full_text short-circuits the lookup  free answer wins
  PASS  no DOI -> nothing to resolve against  
  PASS  Unpaywall RAISES without an email, never returns 'no OA'  a silent miss is indistinguishable from a paywalled paper

FULL TEXT (JATS parsing, SR tables)
  PASS  JATS sections parsed  
  PASS  'Materials and Methods' matched as methods  S4 must see methods, not the discussion's confidence
  PASS  results kept separate from discussion  S5 reads numbers; spin lives in the discussion
  PASS  tables keep row structure  flattening a characteristics table loses which dose is whose
  PASS  included-studies table identified, adverse-events table not  a FILTER for S2, not a decision
  PASS  unparseable XML -> empty, never a partial guess  
  PASS  no full text -> abstract tier is REPORTED, not assumed  silently calling an abstract full_text inflates every score on it

SR-TABLE INHERITANCE PAYLOAD
  PASS  only the included-studies table is sent when the filter hits  the adverse-events table is not S2's job
  PASS  table row structure survives into the payload  prose would lose which dose belongs to which trial
  PASS  methods included, discussion not  
  PASS  filter miss falls back to all tables, never to nothing  the heuristic filters; S2 decides

STORAGE (SQLite on a Postgres-shaped schema)
  PASS  studies persisted  
  PASS  unclassified queryable as the S1 budget  
  PASS  refuses records that skipped dedup  no _canonical -> one trial would land four times
  PASS  ECU round-trips  
  PASS  audit trail links study to ECU  every published number must be reconstructible
  PASS  band_version bump invalidates cached ECUs  SPEC section 5 complexity flag, made queryable
  PASS  re-scoring updates in place, no duplicate row  

ALL PASSED
```

## Product under test (INPUT)

| Field | Value |
|---|---|
| Ingredient | `magnesium` |
| Form | `magnesium_glycinate` |
| Population | `general_adult` |

> **SYNTHETIC** extractions — plumbing only.

## Corpus

| Metric | Count |
|---|---:|
| Studies | 200 |
| Syntheses | 52 |
| RCT-rank | 146 |
| Scored this run | 40 |

| Canonical ID | Author year | Rank | OA | Title | Links |
|---|---|---:|---|---|---|
| `registry:nct07564843` | Carrió N 2026 | 4 | abstract_only | Efficacy of magnesium-calcium ionic oral rinse for primary burning mouth syndrome: a randomized, double-blind, placebo-c | [PubMed 42472793](https://pubmed.ncbi.nlm.nih.gov/42472793/), [DOI 10.1186/s12903-026-09296-1](https://doi.org/10.1186/s12903-026-09296-1), [NCT07564843](https://clinicaltrials.gov/study/NCT07564843) |
| `doi:101097ajp0000000000001391` | Zeng Y 2026 | 4 | abstract_only | Efficacy of a Modified Cocktail for Quadratus Lumborum Block Combined With Periarticular Local Infiltration Analgesia in | [PubMed 42015674](https://pubmed.ncbi.nlm.nih.gov/42015674/), [DOI 10.1097/ajp.0000000000001391](https://doi.org/10.1097/ajp.0000000000001391) |
| `doi:101097ccm0000000000007162` | Meerman M 2026 | 4 | abstract_only | Magnesium Sulfate to Prevent Perioperative Atrial Fibrillation in Cardiac Surgery: A Randomized Clinical Trial. | [PubMed 42206948](https://pubmed.ncbi.nlm.nih.gov/42206948/), [DOI 10.1097/ccm.0000000000007162](https://doi.org/10.1097/ccm.0000000000007162) |
| `doi:1012809eaap2617` | Noor NJ 2026 | 4 | abstract_only | Effects of magnesium supplementation on serum brain-derived neurotrophic factor levels and cognitive function in patient | [PubMed 42374947](https://pubmed.ncbi.nlm.nih.gov/42374947/), [DOI 10.12809/eaap2617](https://doi.org/10.12809/eaap2617) |
| `doi:103390medicina62061006` | Rizopoulou S 2026 | 4 | abstract_only | Variations in S-100Β and Neuron-Specific Enolase Levels During Functional Endoscopic Sinus Surgery Under Moderately Cont | [PubMed 42356019](https://pubmed.ncbi.nlm.nih.gov/42356019/), [DOI 10.3390/medicina62061006](https://doi.org/10.3390/medicina62061006) |
| `doi:101038s4159802650427z` | Swetha RK 2026 | 4 | abstract_only | Randomized, open-label study of the short-term pharmacokinetics of oral magnesium oxide in healthy volunteers. | [PubMed 42091979](https://pubmed.ncbi.nlm.nih.gov/42091979/), [DOI 10.1038/s41598-026-50427-z](https://doi.org/10.1038/s41598-026-50427-z) |
| `doi:103389fendo20261883483` | Al-Maqbali JS 2026 | 4 | abstract_only | The effect of oral magnesium supplementation on glycemic control and metabolic parameters in type 2 diabetes mellitus: a | [PubMed 42534812](https://pubmed.ncbi.nlm.nih.gov/42534812/), [DOI 10.3389/fendo.2026.1883483](https://doi.org/10.3389/fendo.2026.1883483) |
| `doi:1017843rpmesp202643215505` | Moura de Araújo MF 2026 | 4 | abstract_only | Feasibility and preliminary biomarker responses to capsules containing green coffee extract enriched with magnesium di-m | [PubMed 42531580](https://pubmed.ncbi.nlm.nih.gov/42531580/), [DOI 10.17843/rpmesp.2026.432.15505](https://doi.org/10.17843/rpmesp.2026.432.15505) |
| `registry:nct06626620` | Zulqarnain A 2026 | 4 | abstract_only | Randomised controlled trial of intravenous magnesium sulfate versus terbutaline for children in the management of acute  | [PubMed 42444205](https://pubmed.ncbi.nlm.nih.gov/42444205/), [DOI 10.47391/jpma.22541](https://doi.org/10.47391/jpma.22541), [NCT06626620](https://clinicaltrials.gov/study/NCT06626620) |
| `doi:101111nmo70378` | Yoneda H 2026 | 4 | full_text | Magnesium-Rich Mineral Water Improves Stool Consistency and Bowel Habits in Healthy Subjects: A Randomized Controlled Tr | [PubMed 42286933](https://pubmed.ncbi.nlm.nih.gov/42286933/), [PMC PMC13263547](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC13263547/), [DOI 10.1111/nmo.70378](https://doi.org/10.1111/nmo.70378) |
| `doi:1014309ctg0000000000001014` | Gonçalves JC 2026 | 4 | abstract_only | Efficacy of 1 L PEG Ascorbate vs Sodium Picosulfate With Magnesium Citrate Bowel Preparations for Capsule Colonoscopy an | [PubMed 41810820](https://pubmed.ncbi.nlm.nih.gov/41810820/), [DOI 10.14309/ctg.0000000000001014](https://doi.org/10.14309/ctg.0000000000001014) |
| `doi:1012809eaap25122` | Walyddaini AS 2026 | 4 | abstract_only | Magnesium supplementation as an adjunct to fluoxetine therapy for depression. | [PubMed 41916937](https://pubmed.ncbi.nlm.nih.gov/41916937/), [DOI 10.12809/eaap25122](https://doi.org/10.12809/eaap25122) |
| `doi:101016jajogmf2026101963` | Boers JRM 2026 | 4 | abstract_only | Oral calcium carbonate as an adjunct to oxytocin infusion for labor induction: a randomized controlled pilot study on fe | [PubMed 41956322](https://pubmed.ncbi.nlm.nih.gov/41956322/), [DOI 10.1016/j.ajogmf.2026.101963](https://doi.org/10.1016/j.ajogmf.2026.101963) |
| `registry:isrctn83633282` | Ladjevic NN 2026 | 4 | full_text | Sequence-Dependent Analgesic Efficacy of Ketamine and Magnesium Sulfate After Radical Nephrectomy. | [PubMed 42075626](https://pubmed.ncbi.nlm.nih.gov/42075626/), [PMC PMC13117051](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC13117051/), [DOI 10.3390/medicina62040754](https://doi.org/10.3390/medicina62040754), registry `ISRCTN83633282` |
| `doi:101016jajcnut2026101299` | Meer R 2026 | 4 | full_text | Magnesium supplementation did not reduce serum calciprotein crystallization and arterial stiffness in individuals with t | [PubMed 41903889](https://pubmed.ncbi.nlm.nih.gov/41903889/), [PMC PMC13197924](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC13197924/), [DOI 10.1016/j.ajcnut.2026.101299](https://doi.org/10.1016/j.ajcnut.2026.101299) |
| `doi:101038s41598026498807` | Ramezani E 2026 | 4 | full_text | Effects of B vitamins and magnesium on fatigue, disease activity and quality of life in inflammatory bowel disease. | [PubMed 42010310](https://pubmed.ncbi.nlm.nih.gov/42010310/), [PMC PMC13265746](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC13265746/), [DOI 10.1038/s41598-026-49880-7](https://doi.org/10.1038/s41598-026-49880-7) |
| `doi:1011771096620x261430172` | Lim HS 2026 | 4 | abstract_only | Fermented Whey Protein Supplement Slows the Progression of Frailty and Sarcopenia Among Older Korean Adults: A Randomize | [PubMed 41805014](https://pubmed.ncbi.nlm.nih.gov/41805014/), [DOI 10.1177/1096620x261430172](https://doi.org/10.1177/1096620x261430172) |
| `registry:nct05530499` | Adepoju A 2026 | 4 | abstract_only | Almond Consumption Improves Inflammatory Profiles Independent of Weight Change: A 6-Week Randomized Controlled Trial in  | [PubMed 41830044](https://pubmed.ncbi.nlm.nih.gov/41830044/), [DOI 10.3390/nu18050875](https://doi.org/10.3390/nu18050875), [NCT05530499](https://clinicaltrials.gov/study/NCT05530499) |
| `doi:101097mbp0000000000000780` | Cheng H 2026 | 4 | abstract_only | Effect of nifedipine combined with magnesium sulfate on gestational hypertension and its impact on blood lipids. | [PubMed 41321132](https://pubmed.ncbi.nlm.nih.gov/41321132/), [DOI 10.1097/mbp.0000000000000780](https://doi.org/10.1097/mbp.0000000000000780) |
| `doi:103390nu18030470` | Moretti A 2026 | 4 | full_text | Efficacy of a Naturally Calcium and Magnesium-Rich Mineral Water on Musculoskeletal Fragility: A Randomized, Double-Blin | [PubMed 41683292](https://pubmed.ncbi.nlm.nih.gov/41683292/), [PMC PMC12899649](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12899649/), [DOI 10.3390/nu18030470](https://doi.org/10.3390/nu18030470) |
| `registry:nct05446753` | Fu AS 2026 | 4 | abstract_only | Micronutrient intake and status of adults consuming plant-based meat analogues or animal-based meats as primary protein  | [PubMed 41785660](https://pubmed.ncbi.nlm.nih.gov/41785660/), [DOI 10.1016/j.clnu.2026.106610](https://doi.org/10.1016/j.clnu.2026.106610), [NCT05446753](https://clinicaltrials.gov/study/NCT05446753) |
| `registry:nct03057951` | Ferreira JP 2026 | 4 | abstract_only | Serum Magnesium, Outcomes, and the Effect of Empagliflozin in Heart Failure With Mildly Reduced and Preserved Ejection F | [PubMed 41493412](https://pubmed.ncbi.nlm.nih.gov/41493412/), [DOI 10.1016/j.jchf.2025.102889](https://doi.org/10.1016/j.jchf.2025.102889), [NCT03057951](https://clinicaltrials.gov/study/NCT03057951) |
| `registry:nct05328154` | Pickering ME 2026 | 4 | full_text | Quantitative sensory testing of pain in osteoporosis: a pilot randomized clinical trial with magnesium supplementation. | [PubMed 41566091](https://pubmed.ncbi.nlm.nih.gov/41566091/), [PMC PMC12872772](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12872772/), [DOI 10.1007/s40520-025-03317-9](https://doi.org/10.1007/s40520-025-03317-9), [NCT05328154](https://clinicaltrials.gov/study/NCT05328154) |
| `doi:101093eurheartjehaf706` | Chimura M 2026 | 4 | abstract_only | Serum magnesium and outcomes in heart failure with reduced ejection fraction: the GALACTIC-HF trial. | [PubMed 40886161](https://pubmed.ncbi.nlm.nih.gov/40886161/), [DOI 10.1093/eurheartj/ehaf706](https://doi.org/10.1093/eurheartj/ehaf706) |
| `doi:101097aln0000000000005778` | Kong H 2026 | 4 | abstract_only | Efficacy and Safety of Preemptive Magnesium Sulfate Infusion during Pheochromocytoma and Paraganglioma Resection: A Rand | [PubMed 41043170](https://pubmed.ncbi.nlm.nih.gov/41043170/), [DOI 10.1097/aln.0000000000005778](https://doi.org/10.1097/aln.0000000000005778) |
| `doi:10117709645284251410579` | Abu El Kasem ST 2026 | 4 | abstract_only | Dry needling versus magnesium sulfate iontophoresis of active trigger points of the axioscapular muscle in neck pain: a  | [PubMed 41549044](https://pubmed.ncbi.nlm.nih.gov/41549044/), [DOI 10.1177/09645284251410579](https://doi.org/10.1177/09645284251410579) |
| `doi:1010800277090320262644872` | Iramain R 2026 | 4 | abstract_only | The usefulness of the new SOBIstat-F&lt;sup&gt;®&lt;/sup&gt; device in children with severe acute asthma attacks in the  | [PubMed 41837861](https://pubmed.ncbi.nlm.nih.gov/41837861/), [DOI 10.1080/02770903.2026.2644872](https://doi.org/10.1080/02770903.2026.2644872) |
| `doi:101186s41043025011991` | Gao S 2025 | 4 | full_text | Effects of multivitamin combined with magnesium sulfate versus magnesium sulfate alone on hemodynamics, coagulation, and | [PubMed 41476304](https://pubmed.ncbi.nlm.nih.gov/41476304/), [PMC PMC12866340](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12866340/), [DOI 10.1186/s41043-025-01199-1](https://doi.org/10.1186/s41043-025-01199-1) |
| `doi:101002edm270129` | Tabriz N 2026 | 4 | full_text | Impact of Preoperative Calcium and Magnesium Supplementation on Quality of Life and Hypocalcemia Post-Thyroidectomy. | [PubMed 41319240](https://pubmed.ncbi.nlm.nih.gov/41319240/), [PMC PMC12665251](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12665251/), [DOI 10.1002/edm2.70129](https://doi.org/10.1002/edm2.70129) |
| `registry:nct06580366` | Durak I 2026 | 4 | abstract_only | Comparison of sennoside A + B and sodium picosulfate-based regimens for bowel preparation: a prospective randomized tria | [PubMed 42135569](https://pubmed.ncbi.nlm.nih.gov/42135569/), [DOI 10.1007/s10151-026-03336-2](https://doi.org/10.1007/s10151-026-03336-2), [NCT06580366](https://clinicaltrials.gov/study/NCT06580366) |
| `doi:10117710815589251378179` | Khalid S 2026 | 4 | abstract_only | Effects of magnesium and potassium on insulin resistance and blood sugar level among insomniac patients with diabetes me | [PubMed 40923590](https://pubmed.ncbi.nlm.nih.gov/40923590/), [DOI 10.1177/10815589251378179](https://doi.org/10.1177/10815589251378179) |
| `registry:nct04694417` | Kuusipalo A 2026 | 4 | full_text | Secondary prevention of leg cramps using compression stockings or magnesium supplements: a three-arm randomized clinical | [PubMed 41680812](https://pubmed.ncbi.nlm.nih.gov/41680812/), [PMC PMC13005370](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC13005370/), [DOI 10.1186/s13063-025-09370-z](https://doi.org/10.1186/s13063-025-09370-z), [NCT04694417](https://clinicaltrials.gov/study/NCT04694417) |
| `doi:101016jrbmo2025105232` | Yahyavi SK 2026 | 4 | abstract_only | Serum magnesium is linked with sperm concentration, motile sperm count and serum anti-Müllerian hormone in infertile men | [PubMed 41653852](https://pubmed.ncbi.nlm.nih.gov/41653852/), [DOI 10.1016/j.rbmo.2025.105232](https://doi.org/10.1016/j.rbmo.2025.105232) |
| `doi:101111jhn70147` | O'Connor H 2025 | 4 | abstract_only | Antenatal Dietary Intervention Supports Postpartum Maintenance of Diet Quality, Fibre, and Micronutrient Intake: Finding | [PubMed 41168632](https://pubmed.ncbi.nlm.nih.gov/41168632/), [DOI 10.1111/jhn.70147](https://doi.org/10.1111/jhn.70147) |
| `doi:10117703000605251409937` | Eshagh Hoseini SJ 2026 | 4 | full_text | Comparison of oral ketorolac and oral magnesium for postoperative pain management in anorectal surgery: A randomized dou | [PubMed 41529918](https://pubmed.ncbi.nlm.nih.gov/41529918/), [PMC PMC12799968](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12799968/), [DOI 10.1177/03000605251409937](https://doi.org/10.1177/03000605251409937) |
| `pmid:42417324` | Fomkin R N 2025 | 4 | abstract_only | [Clinical efficacy of the dietary supplement Astracit-Asfarma as a synergistic adjuvant to standard therapy for the elim | [PubMed 42417324](https://pubmed.ncbi.nlm.nih.gov/42417324/) |
| `registry:nct03057977` | Ferreira JP 2026 | 4 | abstract_only | Serum Magnesium and the Effect of Empagliflozin in Heart Failure With Reduced Ejection Fraction: Findings From EMPEROR-R | [PubMed 41171249](https://pubmed.ncbi.nlm.nih.gov/41171249/), [DOI 10.1016/j.jchf.2025.102751](https://doi.org/10.1016/j.jchf.2025.102751), [NCT03057977](https://clinicaltrials.gov/study/NCT03057977) |
| `doi:101016jpreghy2025101391` | Alves de Melo Silva ML 2025 | 4 | abstract_only | A 12-hour versus 24-hour magnesium sulfate intravenous regimen in postpartum women with preeclampsia: a randomized clini | [PubMed 41187368](https://pubmed.ncbi.nlm.nih.gov/41187368/), [DOI 10.1016/j.preghy.2025.101391](https://doi.org/10.1016/j.preghy.2025.101391) |
| `registry:chictr1800014479` | Shen Q 2025 | 4 | full_text | Effects of feeding infant formula rich in sn-2 palmitate for 6 months on fecal saponified fatty acids, calcium and stool | [PubMed 41462207](https://pubmed.ncbi.nlm.nih.gov/41462207/), [PMC PMC12750842](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12750842/), [DOI 10.1186/s12937-025-01248-9](https://doi.org/10.1186/s12937-025-01248-9), registry `CHICTR1800014479` |
| `doi:101097md0000000000045955` | Zhang M. 2025 | 4 | full_text | Therapeutic efficacy of quetiapine combined with magnesium valproate in schizophrenia: Impact on serum BDNF and GFAP lev | [PubMed 41305727](https://pubmed.ncbi.nlm.nih.gov/41305727/), [PMC PMC12643618](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12643618/), [DOI 10.1097/md.0000000000045955](https://doi.org/10.1097/md.0000000000045955) |

## ECU scores (OUTPUT)

### Anxiety

Score **-51** · band `does not work` · n=40

### Time to fall asleep

Score **+22** · band `weak support` · n=40

## Grok batch databases

> Grok Build CLI pure-function path — test separately from Claude; not merged scores.

### `grok_creatine.sqlite`

Studies=200, ECUs=17, syntheses=50

| Outcome | Score | Band | n | prompt | when |
|---|---:|---|---:|---|---|
| muscle_power | 4 | inconclusive | 11 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| cognitive_function | 1 | inconclusive | 2 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| exercise_endurance | 1 | inconclusive | 8 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| inflammation_crp | 1 | inconclusive | 16 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| sleep_quality | 1 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| attention_focus | 0 | inconclusive | 4 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| blood_pressure | 0 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| energy_levels | 0 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| glycaemic_control | 0 | inconclusive | 5 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| lean_body_mass | 0 | inconclusive | 9 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| testosterone | 0 | inconclusive | 2 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| cortisol | -1 | inconclusive | 4 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| muscle_soreness | -1 | inconclusive | 3 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| muscle_strength | -2 | inconclusive | 13 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| sleep_duration | -2 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| sleep_onset | -2 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| adverse_events_any | -3 | inconclusive | 10 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |

### `grok_llm_cache.sqlite`

Studies=0, ECUs=0, syntheses=0

_No ECU rows._

### `grok_magnesium.sqlite`

Studies=200, ECUs=22, syntheses=52

| Outcome | Score | Band | n | prompt | when |
|---|---:|---|---:|---|---|
| inflammation_crp | 3 | inconclusive | 16 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| lean_body_mass | 2 | inconclusive | 5 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| cognitive_function | 1 | inconclusive | 2 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| muscle_cramps | 1 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| attention_focus | 0 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:00:21+00:00 |
| exercise_recovery | 0 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:00:21+00:00 |
| memory | 0 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| energy_levels | 0 | inconclusive | 2 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| sleep_onset | 0 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| serum_magnesium | -1 | inconclusive | 15 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| sleep_quality | -1 | inconclusive | 3 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| muscle_soreness | -1 | inconclusive | 2 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| testosterone | -1 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| anxiety | -2 | inconclusive | 3 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| depressive_symptoms | -2 | inconclusive | 6 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| glycaemic_control | -2 | inconclusive | 18 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| cortisol | -2 | inconclusive | 5 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| digestive_comfort | -2 | inconclusive | 5 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| adverse_events_gi | -4 | inconclusive | 6 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| blood_pressure | -4 | inconclusive | 22 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| muscle_strength | -6 | inconclusive | 13 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| adverse_events_any | -10 | weak evidence against | 20 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |

## Claude pilot databases

> Claude subscription pilot — not production public claims.

_No `pilot*.sqlite` files._
