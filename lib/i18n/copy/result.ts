/*
 * Static labels for the result card (Evidence Ledger, dose, form, company,
 * disclosures, technical details). Display only: the keys and values the
 * scorer produces never change, only the words around them.
 *
 * "Display words" for scientific enums (direction, strength, confidence...) are
 * a lookup applied at render time to the STORED value; the stored value itself
 * is never edited, so history replays and exact-match rules are unaffected.
 */
import type { Lang } from "../lang";

export interface ResultCopy {
  sourcesUsed: string;
  // basis badges (keyed by Basis) -- label + means
  basis: Record<"evidence_run" | "registry" | "curated_table" | "label" | "user_input" | "model_prior", { label: string; means: string }>;
  legendTitle: string;
  // validity / warnings
  retainedNotReverified: string;
  validatedRun: string;
  notPublicClaim: (status: string) => string;
  unvalidated: string;
  validityDefaultNote: string;
  warningCount: (n: number) => string;
  disclosureAria: (title: string) => string;
  businessModelAria: string;
  fundingTitle: string;
  pubBiasTitle: string;
  auditFundingBody: (name: string) => string;
  auditPubBiasBody: (name: string) => string;
  caveatTitle: Record<string, string>;
  // entered / label details
  whatYouEntered: string;
  typedNotRead: string;
  labelDetails: string;
  ingredient: string;
  form: string;
  dosePerServing: string;
  activeMoiety: string;
  servingsPerDayLabel: string;
  readConfidence: string;
  sourceLabel: string;
  readFrom: string;
  formNotStated: string;
  notStated: string;
  noDoseEntered: string;
  compoundSuffix: string; // "compound" in "4 mg compound"
  compoundPerServing: (mg: string) => string;
  elementalPerServing: (mg: string) => string;
  moietyActive: (mg: string) => string;
  moietyNotConvertibleShort: string;
  notConvertible: (basis: string) => string;
  // empty states
  analyzerNotConfigured: string;
  analyzerNeedsKey: string;
  notSupplementTitle: string;
  notSupplementBody: string;
  ingredientNotSupported: (name: string | null) => string;
  noDataNotLow: string;
  nothingRun: string;
  requestRecorded: string;
  coveredSoFar: string;
  formNotRunTitle: string;
  formNotRunBody: string;
  noRunTitle: string;
  noRunBody: string;
  // ledger tabs
  outcomeTablist: string;
  outcomesTab: string;
  outcomeResults: string;
  generalScore: string;
  averageOf: (n: number) => string;
  notAssessed: string;
  noAuditMatches: string;
  noAuditMatchesConverted: string;
  noOutcomes: string;
  populationLabel: string;
  populationNotRecorded: string;
  dimEffect: string;
  dimEvidence: string;
  dimForm: string;
  dimDose: string;
  effectScaleNote: string;
  plainSummary: string;
  estimate: string;
  noEstimate: string;
  meaningful: string;
  unknownDot: string;
  strongestDoubt: string;
  certaintyNote: string;
  gates: string;
  noGate: string;
  checklist: string;
  formNote: string;
  doseNote: string;
  effectiveRange: string;
  found: string;
  missing: string;
  wouldMove: string;
  exactWording: string;
  sourcesOpened: string;
  unmatchedStatus: string;
  unmatchedStatusBody: string;
  checklistNames: Record<string, string>;
  // dose section
  doseTitle: string;
  keyBenefit: string;
  keyNull: string;
  keyDose: string;
  noScoredOutcome: string;
  closenessDash: string;
  closeness: (v: string) => string;
  // prior section
  priorTitle: string;
  systematicReviews: string;
  noOutcomeNamed: string;
  pooledRecalled: string;
  populationColon: string;
  modelConfidence: string;
  thisForm: string;
  safety: string;
  modelUnsure: string;
  orientationUnavailable: string;
  skipped: string;
  // compat section
  compatTitle: string;
  formFitExact: string;
  formFitNotRun: string;
  formFitNoIngredient: string;
  formFitUnknown: string;
  formEvidenceStrength: (v: string, basis: string) => string;
  formsRun: string;
  ladder: string;
  activesEntered: string;
  activesRead: string;
  singleActive: string;
  noInteraction: string;
  modelSummary: string;
  modelFillInUnavailable: string;
  severityHigh: string;
  severityModerate: string;
  // company section
  companyTitle: string;
  noBrandTyped: string;
  noBrandPhoto: string;
  printedOnLabel: string;
  brand: string;
  manufacturer: string;
  country: string;
  sealsPrinted: string;
  notPrinted: string;
  none: string;
  sealsNote: string;
  fdaReports: string;
  dateDash: string;
  classDash: string;
  firm: string;
  noRecallOn: (names: string) => string;
  or: string;
  registryUnavailable: string;
  notQueried: string;
  companyProfile: string;
  businessModelSee: (title: string) => string;
  profileModelConfidence: string;
  recallOnFile: string;
  notCorroborated: string;
  noRegulatory: string;
  modelRecalls: string;
  founded: string;
  headquarters: string;
  ownership: string;
  thirdParty: string;
  batchCerts: string;
  profileConfidence: string;
  unknown: string;
  couldNotConfirm: string;
  profileUnavailable: string;
  // technical
  technicalTitle: string;
  retainedValuesBold: string;
  retainedValuesBody: string;
  readMethodology: string;
  legacyBold: string;
  legacyBody: string;
  techSource: string;
  techTyped: string;
  techPhoto: string;
  techTook: string;
  techVision: string;
  techText: string;
  techStage: (name: string) => string;
  techPrompt: (name: string) => string;
  techRunId: string;
  techAppVersion: string;
  techRunStored: string;
  techSkipped: string;
  stageNames: Record<string, string>;
  persistenceStatus: Record<string, string>;
  // translation status
  translating: string;
  translationPartial: string;
  machineTranslated: string;
  showOriginal: string;
}

const EN: ResultCopy = {
  sourcesUsed: "Sources used in this section",
  basis: {
    evidence_run: { label: "Evidence run", means: "Scored from extracted trials with quoted provenance. The only source that produces a number." },
    registry: { label: "Public registry", means: "A dated public record (FDA enforcement reports via openFDA)." },
    curated_table: { label: "Curated & cited", means: "A maintained table where every entry cites a regulator fact sheet or a position stand." },
    label: { label: "As printed", means: "Read off the label. A claim the product makes about itself, not a verification." },
    user_input: { label: "Typed by you", means: "Entered by hand, not read from a label. Nothing here checked that the product contains what was typed." },
    model_prior: { label: "Model knowledge", means: "What the model recalls from training data. Unverified; shown for orientation only and never scored." },
  },
  legendTitle: "How to read the source badges",
  retainedNotReverified: "Retained audit · not reverified",
  validatedRun: "Validated run",
  notPublicClaim: (s) => `Not a public product claim · ${s}`,
  unvalidated: "unvalidated",
  validityDefaultNote: "Retained for inspection; scoring constants are not calibrated for public claims.",
  warningCount: (n) => `${n} evidence warning${n === 1 ? "" : "s"}`,
  disclosureAria: (title) => `${title} disclosure`,
  businessModelAria: "Business model disclosure",
  fundingTitle: "Funding & independence",
  pubBiasTitle: "Publication bias",
  auditFundingBody: (name) => `The retained audit flagged industry funding or one laboratory across the positive evidence for ${name}. This is a disclosure about the evidence, not a claim that the result is wrong. It does not affect the Evidence Ledger score.`,
  auditPubBiasBody: (name) => `The retained audit recorded a publication-bias concern for ${name}. Studies with positive findings may be more likely to appear in the published record. This disclosure does not affect the Evidence Ledger score.`,
  caveatTitle: {
    typed_not_verified: "Typed not verified",
    multi_ingredient_product: "Multi ingredient product",
    dose_not_convertible: "Dose not convertible",
    servings_not_stated: "Servings not stated",
    model_sections_skipped: "Model sections skipped",
  },
  whatYouEntered: "What you entered",
  typedNotRead: "Typed, not read from a label.",
  labelDetails: "Label details",
  ingredient: "Ingredient",
  form: "Form",
  dosePerServing: "Dose per serving",
  activeMoiety: "Active moiety",
  servingsPerDayLabel: "Servings per day",
  readConfidence: "Read confidence",
  sourceLabel: "Source",
  readFrom: "Read from:",
  formNotStated: "form not stated",
  notStated: "not stated",
  noDoseEntered: "no dose entered",
  compoundSuffix: "compound",
  compoundPerServing: (m) => `${m} compound per serving`,
  elementalPerServing: (m) => `${m} elemental per serving`,
  moietyActive: (m) => `${m} active`,
  moietyNotConvertibleShort: "active moiety not convertible",
  notConvertible: (b) => `not convertible (${b})`,
  analyzerNotConfigured: "Scanning is not configured on this deployment.",
  analyzerNeedsKey: "The server needs a model API key (DEEPSEEK_API_KEY) to read a photo. Searching for a supplement by name still works.",
  notSupplementTitle: "That does not look like a supplement label.",
  notSupplementBody: "Photograph the Supplement Facts panel so the ingredient and dose can be read.",
  ingredientNotSupported: (n) => `${n ?? "That ingredient"} is not in the evidence vocabulary yet.`,
  noDataNotLow: "This is not a low score — it is no data.",
  nothingRun: "Nothing has been run for it.",
  requestRecorded: "Your request was recorded.",
  coveredSoFar: "Covered so far:",
  formNotRunTitle: "That form has not been run.",
  formNotRunBody: "Evidence about a different form is not evidence about yours, so no number is shown.",
  noRunTitle: "No evidence run exists for this ingredient.",
  noRunBody: "This is not a low score — it is no data.",
  outcomeTablist: "Outcome",
  outcomesTab: "Outcomes",
  outcomeResults: "Outcome results",
  generalScore: "General score",
  averageOf: (n) => `Average of ${n} outcome score${n === 1 ? "" : "s"}`,
  notAssessed: "Not assessed",
  noAuditMatches: "No source-verified /4 audit matches this exact form and daily dose.",
  noAuditMatchesConverted: "No source-verified /4 audit matches this exact form and daily dose. The old continuous result was not converted into quarters.",
  noOutcomes: "No retained audit outcomes are available.",
  populationLabel: "Population",
  populationNotRecorded: "not recorded by this run",
  dimEffect: "Effect",
  dimEvidence: "Evidence",
  dimForm: "Form",
  dimDose: "Dose",
  effectScaleNote: "The audit effect state uses its real −3 to +3 scale; it is not a /4 grade.",
  plainSummary: "Plain summary",
  estimate: "Estimate",
  noEstimate: "No usable interval or point estimate was retained.",
  meaningful: "Meaningful",
  unknownDot: "Unknown.",
  strongestDoubt: "Strongest doubt",
  certaintyNote: "Certainty comes from the retained body type, checklist and gates. Funding and publication bias remain disclosures.",
  gates: "Gates",
  noGate: "No certainty gate fired.",
  checklist: "Checklist",
  formNote: "Form fit compares this product preparation with the retained audit.",
  doseNote: "Dose fit compares the entered daily dose with the retained effective range.",
  effectiveRange: "Effective daily range",
  found: "Found",
  missing: "Missing",
  wouldMove: "Would move it",
  exactWording: "Exact wording from the audit",
  sourcesOpened: "Sources opened for this outcome",
  unmatchedStatus: "Status",
  unmatchedStatusBody: "Not assessed. The old continuous result was not converted into quarters.",
  checklistNames: {
    risk_of_bias: "risk of bias",
    consistency: "consistency",
    precision: "precision",
    directness: "directness",
    publication_bias: "publication bias",
  },
  doseTitle: "Is your dose the dose that worked?",
  keyBenefit: "benefit found",
  keyNull: "nothing found",
  keyDose: "your dose",
  noScoredOutcome: "No scored outcome, so there is no dose range to compare against.",
  closenessDash: "closeness —",
  closeness: (v) => `closeness ${v}`,
  priorTitle: "What the literature says",
  systematicReviews: "Systematic reviews:",
  noOutcomeNamed: "The model named no outcome with describable evidence for this ingredient.",
  pooledRecalled: "Pooled estimate recalled:",
  populationColon: "Population:",
  modelConfidence: "model confidence:",
  thisForm: "This form",
  safety: "Safety",
  modelUnsure: "Model is unsure about:",
  orientationUnavailable: "Orientation unavailable:",
  skipped: "skipped",
  compatTitle: "Does the form and the mix hold up?",
  formFitExact: "Your form is the form the evidence run scored.",
  formFitNotRun: "Your form has not been run; evidence about another form is not evidence about yours.",
  formFitNoIngredient: "No evidence run exists for this ingredient yet.",
  formFitUnknown: "Form fit unknown.",
  formEvidenceStrength: (v, b) => `Form evidence strength ${v} (${b}).`,
  formsRun: "Forms run so far:",
  ladder: "ladder",
  activesEntered: "Actives entered",
  activesRead: "Actives read",
  singleActive: "Single active on the panel — no combination to check.",
  noInteraction: "No documented interaction among these actives in the curated table.",
  modelSummary: "Model summary of the combination",
  modelFillInUnavailable: "Model fill-in unavailable:",
  severityHigh: "high",
  severityModerate: "moderate",
  companyTitle: "Who makes it, and what is on record?",
  noBrandTyped: "The search path takes an ingredient, a form and a dose — no brand — so there is no company to look up.",
  noBrandPhoto: "No brand or manufacturer is printed on this panel, so there is nothing to look up.",
  printedOnLabel: "Printed on the label",
  brand: "Brand",
  manufacturer: "Manufacturer",
  country: "Country",
  sealsPrinted: "Seals printed",
  notPrinted: "not printed",
  none: "none",
  sealsNote: "Seals are claims as printed; a certifier’s registry confirms them, this page does not.",
  fdaReports: "FDA enforcement reports",
  dateDash: "date —",
  classDash: "class —",
  firm: "Firm:",
  noRecallOn: (names) => `No recall on file under ${names}.`,
  or: " or ",
  registryUnavailable: "Registry unavailable:",
  notQueried: "Not queried.",
  companyProfile: "Company profile",
  businessModelSee: (t) => `Business model: see “${t}” in the evidence warnings.`,
  profileModelConfidence: "model confidence",
  recallOnFile: "; a recall is on file in openFDA",
  notCorroborated: "; NOT corroborated by openFDA under this firm name",
  noRegulatory: "No widely reported regulatory action recalled by the model.",
  modelRecalls: "What the model recalls about the company",
  founded: "Founded",
  headquarters: "Headquarters",
  ownership: "Ownership",
  thirdParty: "Third-party testing",
  batchCerts: "Batch certificates public",
  profileConfidence: "Profile confidence",
  unknown: "unknown",
  couldNotConfirm: "Could not confirm:",
  profileUnavailable: "Profile unavailable:",
  technicalTitle: "Technical details",
  retainedValuesBold: "Retained audit values.",
  retainedValuesBody: " The Effect, Evidence certainty, Form and Dose values shown above come from the retained, source-verified audit for this exact form and daily dose. ",
  readMethodology: "Read the methodology.",
  legacyBold: "How these numbers were produced (none are shown): legacy continuous API data.",
  legacyBody: " This unmatched result keeps the continuous evidence response for compatibility, but its outcome numbers are not shown and were not converted into /4 audit values. ",
  techSource: "Source",
  techTyped: "typed",
  techPhoto: "photo",
  techTook: "Took",
  techVision: "Vision model",
  techText: "Text model",
  techStage: (n) => `Stage: ${n}`,
  techPrompt: (n) => `Prompt: ${n}`,
  techRunId: "Run id",
  techAppVersion: "App version",
  techRunStored: "Run stored",
  techSkipped: "skipped",
  stageNames: {},
  persistenceStatus: {},
  translating: "Translating…",
  translationPartial: "Some text is shown in the original English.",
  machineTranslated: "Some text on this page is machine-translated from English and has not been checked by a person. The English original is the record.",
  showOriginal: "Show the English original",
};

const LT: ResultCopy = {
  sourcesUsed: "Šiame skyriuje naudoti šaltiniai",
  basis: {
    evidence_run: { label: "Įrodymų paleidimas", means: "Įvertinta pagal išgautus tyrimus su cituojama kilme. Vienintelis šaltinis, kuris duoda skaičių." },
    registry: { label: "Viešas registras", means: "Datuotas viešas įrašas (FDA vykdymo užtikrinimo ataskaitos per openFDA)." },
    curated_table: { label: "Kuruojama ir cituojama", means: "Prižiūrima lentelė, kurioje kiekvienas įrašas remiasi reguliuotojo informacijos lapu arba pozicijos dokumentu." },
    label: { label: "Kaip atspausdinta", means: "Nuskaityta iš etiketės. Tai pačios prekės teiginys apie save, o ne patikrinimas." },
    user_input: { label: "Įvedei tu", means: "Įvesta ranka, o ne nuskaityta iš etiketės. Niekas netikrino, ar produkte yra tai, kas įvesta." },
    model_prior: { label: "Modelio žinios", means: "Ką modelis prisimena iš mokymo duomenų. Nepatikrinta; rodoma tik orientacijai ir niekada neįvertinama." },
  },
  legendTitle: "Kaip skaityti šaltinių ženklelius",
  retainedNotReverified: "Išsaugotas auditas · nepatikrintas iš naujo",
  validatedRun: "Patvirtintas paleidimas",
  notPublicClaim: (s) => `Ne viešas teiginys apie produktą · ${s}`,
  unvalidated: "nepatvirtinta",
  validityDefaultNote: "Išsaugota peržiūrai; vertinimo konstantos nekalibruotos viešiems teiginiams.",
  warningCount: (n) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11 ? "įrodymų įspėjimas" : mod10 === 0 || (mod100 >= 11 && mod100 <= 19) ? "įrodymų įspėjimų" : "įrodymų įspėjimai";
    return `${n} ${word}`;
  },
  disclosureAria: (title) => `${title} — atskleidimas`,
  businessModelAria: "Verslo modelio atskleidimas",
  fundingTitle: "Finansavimas ir nepriklausomumas",
  pubBiasTitle: "Publikavimo šališkumas",
  auditFundingBody: (name) => `Išsaugotas auditas pažymėjo pramonės finansavimą arba vieną laboratoriją visuose teigiamuose įrodymuose apie „${name}“. Tai informacija apie įrodymus, o ne teiginys, kad rezultatas klaidingas. Ji nekeičia Įrodymų žurnalo balo.`,
  auditPubBiasBody: (name) => `Išsaugotas auditas užfiksavo publikavimo šališkumo abejonę dėl „${name}“. Tyrimai su teigiamais rezultatais gali dažniau patekti į publikuotą literatūrą. Ši informacija nekeičia Įrodymų žurnalo balo.`,
  caveatTitle: {
    typed_not_verified: "Įvesta, nepatikrinta",
    multi_ingredient_product: "Keleto veikliųjų medžiagų produktas",
    dose_not_convertible: "Dozės nepavyko perskaičiuoti",
    servings_not_stated: "Porcijų skaičius nenurodytas",
    model_sections_skipped: "Modelio skyriai praleisti",
  },
  whatYouEntered: "Ką įvedei",
  typedNotRead: "Įvesta ranka, o ne nuskaityta iš etiketės.",
  labelDetails: "Etiketės duomenys",
  ingredient: "Veiklioji medžiaga",
  form: "Forma",
  dosePerServing: "Dozė porcijoje",
  activeMoiety: "Veiklioji dalis",
  servingsPerDayLabel: "Porcijos per dieną",
  readConfidence: "Nuskaitymo patikimumas",
  sourceLabel: "Šaltinis",
  readFrom: "Nuskaityta iš:",
  formNotStated: "forma nenurodyta",
  notStated: "nenurodyta",
  noDoseEntered: "dozė neįvesta",
  compoundSuffix: "junginio",
  compoundPerServing: (m) => `${m} junginio porcijoje`,
  elementalPerServing: (m) => `${m} elementinio kiekio porcijoje`,
  moietyActive: (m) => `${m} veikliosios dalies`,
  moietyNotConvertibleShort: "veikliosios dalies perskaičiuoti nepavyko",
  notConvertible: (b) => `neperskaičiuojama (${b})`,
  analyzerNotConfigured: "Šioje svetainės versijoje skenavimas nesukonfigūruotas.",
  analyzerNeedsKey: "Serveriui reikia modelio API rakto (DEEPSEEK_API_KEY), kad nuskaitytų nuotrauką. Papildo paieška pagal pavadinimą vis tiek veikia.",
  notSupplementTitle: "Atrodo, tai nėra papildo etiketė.",
  notSupplementBody: "Nufotografuok „Supplement Facts“ lentelę, kad būtų galima nuskaityti medžiagą ir dozę.",
  ingredientNotSupported: (n) => `${n ?? "Ši medžiaga"} dar nėra įrodymų žodyne.`,
  noDataNotLow: "Tai ne žemas balas — tai duomenų nebuvimas.",
  nothingRun: "Jai nieko nebuvo paleista.",
  requestRecorded: "Tavo užklausa užfiksuota.",
  coveredSoFar: "Kol kas apima:",
  formNotRunTitle: "Ši forma dar nebuvo tirta.",
  formNotRunBody: "Įrodymai apie kitą formą nėra įrodymai apie tavo formą, todėl skaičius nerodomas.",
  noRunTitle: "Šiai medžiagai įrodymų paleidimo nėra.",
  noRunBody: "Tai ne žemas balas — tai duomenų nebuvimas.",
  outcomeTablist: "Rezultatas",
  outcomesTab: "Rezultatai",
  outcomeResults: "Rezultatų vertinimai",
  generalScore: "Bendras balas",
  averageOf: (n) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11 ? "rezultato balo" : mod10 === 0 || (mod100 >= 11 && mod100 <= 19) ? "rezultatų balų" : "rezultatų balų";
    return `${n} ${word} vidurkis`;
  },
  notAssessed: "Neįvertinta",
  noAuditMatches: "Joks šaltiniais patikrintas /4 auditas neatitinka būtent šios formos ir paros dozės.",
  noAuditMatchesConverted: "Joks šaltiniais patikrintas /4 auditas neatitinka būtent šios formos ir paros dozės. Senas tolydus rezultatas nebuvo perkeltas į ketvirčius.",
  noOutcomes: "Išsaugotų audito rezultatų nėra.",
  populationLabel: "Populiacija",
  populationNotRecorded: "šiame paleidime neužfiksuota",
  dimEffect: "Poveikis",
  dimEvidence: "Įrodymai",
  dimForm: "Forma",
  dimDose: "Dozė",
  effectScaleNote: "Audito poveikio būsena naudoja tikrąją nuo −3 iki +3 skalę; tai nėra /4 vertinimas.",
  plainSummary: "Santrauka paprastai",
  estimate: "Įvertis",
  noEstimate: "Tinkamo intervalo ar taškinio įverčio neišsaugota.",
  meaningful: "Prasmingumas",
  unknownDot: "Nežinoma.",
  strongestDoubt: "Stipriausia abejonė",
  certaintyNote: "Patikimumas gaunamas iš išsaugoto įrodymų tipo, kontrolinio sąrašo ir vartų. Finansavimas ir publikavimo šališkumas lieka tik pranešimais.",
  gates: "Vartai",
  noGate: "Nė vieni patikimumo vartai nesuveikė.",
  checklist: "Kontrolinis sąrašas",
  formNote: "Formos atitikimas lygina šio produkto paruošimą su išsaugotu auditu.",
  doseNote: "Dozės atitikimas lygina įvestą paros dozę su išsaugotu veiksmingu intervalu.",
  effectiveRange: "Veiksmingas paros intervalas",
  found: "Rasta",
  missing: "Trūksta",
  wouldMove: "Kas ją pakeistų",
  exactWording: "Tikslios audito formuluotės",
  sourcesOpened: "Šiam rezultatui atidaryti šaltiniai",
  unmatchedStatus: "Būsena",
  unmatchedStatusBody: "Neįvertinta. Senas tolydus rezultatas nebuvo perkeltas į ketvirčius.",
  checklistNames: {
    risk_of_bias: "šališkumo rizika",
    consistency: "nuoseklumas",
    precision: "tikslumas",
    directness: "tiesiogiškumas",
    publication_bias: "publikavimo šališkumas",
  },
  doseTitle: "Ar tavo dozė — ta, kuri veikė?",
  keyBenefit: "rasta nauda",
  keyNull: "nieko nerasta",
  keyDose: "tavo dozė",
  noScoredOutcome: "Nėra įvertinto rezultato, todėl nėra dozių intervalo palyginimui.",
  closenessDash: "artumas —",
  closeness: (v) => `artumas ${v}`,
  priorTitle: "Ką sako literatūra",
  systematicReviews: "Sisteminės apžvalgos:",
  noOutcomeNamed: "Modelis nenurodė jokio rezultato, kuriam šiai medžiagai galima aprašyti įrodymus.",
  pooledRecalled: "Prisimintas suvestinis įvertis:",
  populationColon: "Populiacija:",
  modelConfidence: "modelio pasitikėjimas:",
  thisForm: "Ši forma",
  safety: "Saugumas",
  modelUnsure: "Modelis nėra tikras dėl:",
  orientationUnavailable: "Orientacija nepasiekiama:",
  skipped: "praleista",
  compatTitle: "Ar forma ir mišinys atlaiko patikrą?",
  formFitExact: "Tavo forma yra ta forma, kurią įvertino įrodymų paleidimas.",
  formFitNotRun: "Tavo forma nebuvo tirta; įrodymai apie kitą formą nėra įrodymai apie tavo formą.",
  formFitNoIngredient: "Šiai medžiagai įrodymų paleidimo dar nėra.",
  formFitUnknown: "Formos atitikimas nežinomas.",
  formEvidenceStrength: (v, b) => `Formos įrodymų stiprumas ${v} (${b}).`,
  formsRun: "Kol kas tirtos formos:",
  ladder: "kopėčios",
  activesEntered: "Įvestos veikliosios medžiagos",
  activesRead: "Nuskaitytos veikliosios medžiagos",
  singleActive: "Lentelėje viena veiklioji medžiaga — derinio tikrinti nereikia.",
  noInteraction: "Kuruojamoje lentelėje tarp šių veikliųjų medžiagų dokumentuotos sąveikos nėra.",
  modelSummary: "Modelio derinio santrauka",
  modelFillInUnavailable: "Modelio papildymas nepasiekiamas:",
  severityHigh: "didelė",
  severityModerate: "vidutinė",
  companyTitle: "Kas tai gamina ir kas apie tai užfiksuota?",
  noBrandTyped: "Paieškos kelias priima veikliąją medžiagą, formą ir dozę — be prekės ženklo — todėl nėra įmonės, kurią galima būtų ieškoti.",
  noBrandPhoto: "Šioje lentelėje neatspausdintas prekės ženklas ar gamintojas, todėl nėra ko ieškoti.",
  printedOnLabel: "Atspausdinta etiketėje",
  brand: "Prekės ženklas",
  manufacturer: "Gamintojas",
  country: "Šalis",
  sealsPrinted: "Atspausdinti ženklai",
  notPrinted: "neatspausdinta",
  none: "nėra",
  sealsNote: "Ženklai yra teiginiai, kaip atspausdinta; juos patvirtina sertifikuotojo registras, o ne šis puslapis.",
  fdaReports: "FDA vykdymo užtikrinimo ataskaitos",
  dateDash: "data —",
  classDash: "klasė —",
  firm: "Įmonė:",
  noRecallOn: (names) => `Atšaukimų įrašų nėra pagal: ${names}.`,
  or: " arba ",
  registryUnavailable: "Registras nepasiekiamas:",
  notQueried: "Neieškota.",
  companyProfile: "Įmonės profilis",
  businessModelSee: (t) => `Verslo modelis: žr. „${t}“ įrodymų įspėjimuose.`,
  profileModelConfidence: "modelio pasitikėjimas",
  recallOnFile: "; atšaukimas užfiksuotas openFDA",
  notCorroborated: "; openFDA pagal šį įmonės pavadinimą NEPATVIRTINA",
  noRegulatory: "Modelis neprisimena plačiai nuskambėjusių reguliavimo veiksmų.",
  modelRecalls: "Ką modelis prisimena apie įmonę",
  founded: "Įkurta",
  headquarters: "Būstinė",
  ownership: "Nuosavybė",
  thirdParty: "Trečiosios šalies tyrimai",
  batchCerts: "Partijų sertifikatai vieši",
  profileConfidence: "Profilio patikimumas",
  unknown: "nežinoma",
  couldNotConfirm: "Nepavyko patvirtinti:",
  profileUnavailable: "Profilis nepasiekiamas:",
  technicalTitle: "Techninė informacija",
  retainedValuesBold: "Išsaugoto audito reikšmės.",
  retainedValuesBody: " Aukščiau rodomos Poveikio, Įrodymų patikimumo, Formos ir Dozės reikšmės gautos iš išsaugoto, šaltiniais patikrinto audito būtent šiai formai ir paros dozei. ",
  readMethodology: "Skaityti metodiką.",
  legacyBold: "Kaip gauti šie skaičiai (rodomi nėra): senieji tolydūs API duomenys.",
  legacyBody: " Šis neatitikęs rezultatas dėl suderinamumo išlaiko tolydų įrodymų atsakymą, bet jo rezultatų skaičiai nerodomi ir nebuvo paversti /4 audito reikšmėmis. ",
  techSource: "Šaltinis",
  techTyped: "įvesta",
  techPhoto: "nuotrauka",
  techTook: "Truko",
  techVision: "Vaizdo modelis",
  techText: "Teksto modelis",
  techStage: (n) => `Etapas: ${n}`,
  techPrompt: (n) => `Instrukcija: ${n}`,
  techRunId: "Paleidimo ID",
  techAppVersion: "Programos versija",
  techRunStored: "Paleidimas išsaugotas",
  techSkipped: "praleista",
  stageNames: {
    label: "etiketė",
    evidence: "įrodymai",
    evidence_prior: "įrodymų orientacija",
    compatibility: "suderinamumas",
    company: "įmonė",
    literature_warnings: "literatūros įspėjimai",
  },
  persistenceStatus: {
    stored: "išsaugota",
    unavailable: "nepasiekiama",
    failed: "nepavyko",
    skipped: "praleista",
  },
  translating: "Verčiama…",
  translationPartial: "Dalis teksto rodoma originalia anglų kalba.",
  machineTranslated: "Dalis šio puslapio teksto išversta automatiškai iš anglų kalbos ir žmogaus netikrinta. Tikrasis įrašas – angliškas originalas.",
  showOriginal: "Rodyti anglišką originalą",
};

export const RESULT_COPY: Record<Lang, ResultCopy> = { en: EN, lt: LT };

/* ---------------------------------------------------------------------- */
/*  Display words for stored enum values. The stored value is never edited. */
/* ---------------------------------------------------------------------- */

const ENUM_LT: Record<string, string> = {
  // confidence
  high: "aukštas",
  medium: "vidutinis",
  low: "žemas",
  // evidence_prior
  benefit: "nauda",
  no_effect: "poveikio nėra",
  harm: "žala",
  insufficient: "nepakankami",
  strong: "stiprūs",
  moderate: "vidutiniai",
  limited: "riboti",
  none: "nėra",
  unknown: "nežinoma",
  many: "daug",
  few: "mažai",
  well_absorbed: "gerai pasisavinama",
  poorly_absorbed: "blogai pasisavinama",
  no_established_difference: "nustatyto skirtumo nėra",
  // company
  private: "privati",
  public: "viešoji",
  subsidiary: "dukterinė",
  documented: "dokumentuota",
  claimed: "teigiama",
  yes: "taip",
  no: "ne",
  fda_warning_letter: "FDA įspėjamasis raštas",
  recall: "atšaukimas",
  class_action: "grupinis ieškinys",
  ftc_action: "FTC veiksmas",
  other: "kita",
  // compat
  absorption_competition: "pasisavinimo konkurencija",
  synergy: "sinergija",
  timing_separate: "vartoti skirtingu laiku",
  caution: "atsargiai",
  info: "informacija",
  // audit source access
  full_text: "pilnas tekstas",
  abstract: "santrauka",
  snippet: "ištrauka",
  // ledger checklist states
  supported: "pagrįsta",
  concern: "abejonė",
};

/** Display word for a stored enum value; the original (underscores as spaces) when there is no mapping. */
export function enumWord(lang: Lang, value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const original = value.replace(/_/g, " ");
  if (lang === "en") return original;
  return ENUM_LT[value] ?? original;
}

/* Strengths read "<strength> evidence" in English; in Lithuanian the noun
 * agrees, so the strength word is the plural/nominative form above. */

/* -------------------- population line pieces --------------------------- */
const AGES_EN: Record<string, string> = { adult: "adults", older_adult: "older adults", adolescent: "adolescents", child: "children", infant: "infants" };
const SEXES_EN: Record<string, string> = { mixed: "men and women", male: "men", female: "women" };
const AGES_LT: Record<string, string> = { adult: "suaugusieji", older_adult: "vyresnio amžiaus suaugusieji", adolescent: "paaugliai", child: "vaikai", infant: "kūdikiai" };
const SEXES_LT: Record<string, string> = { mixed: "vyrai ir moterys", male: "vyrai", female: "moterys" };
const HEALTH_LT: Record<string, string> = { healthy: "sveiki", general: "bendra populiacija", deficient: "su trūkumu", insufficient: "su nepakankamumu" };

export function populationPieces(lang: Lang): {
  ages: Record<string, string>;
  sexes: Record<string, string>;
  atBaseline: (v: string) => string;
  health: (v: string) => string;
} {
  if (lang === "lt") {
    return {
      ages: AGES_LT,
      sexes: SEXES_LT,
      atBaseline: (v) => `${HEALTH_LT[v] ?? v.replace(/_/g, " ")} pradžioje`,
      health: (v) => HEALTH_LT[v] ?? v.replace(/_/g, " "),
    };
  }
  return {
    ages: AGES_EN,
    sexes: SEXES_EN,
    atBaseline: (v) => `${v.replace(/_/g, " ")} at baseline`,
    health: (v) => v.replace(/_/g, " "),
  };
}

/* ---------------------------------------------------------------------- */
/*  Ledger display words (lib/evidence-ledger/index.ts keeps the English). */
/* ---------------------------------------------------------------------- */
const LEDGER_LT: Record<string, string> = {
  "Harm reported": "Pranešta apie žalą",
  "No meaningful effect": "Reikšmingo poveikio nėra",
  "Small benefit": "Nedidelė nauda",
  "Moderate benefit": "Vidutinė nauda",
  "Large benefit": "Didelė nauda",
  Unclear: "Neaišku",
  Insufficient: "Nepakankami",
  "Very low": "Labai žemas",
  Low: "Žemas",
  Moderate: "Vidutinis",
  High: "Aukštas",
  "No match": "Neatitinka",
  "Poor match": "Prastas atitikimas",
  "Partial match": "Dalinis atitikimas",
  "Close match": "Artimas atitikimas",
  "Exact match": "Tikslus atitikimas",
  "Not tested": "Netirta",
  Unknown: "Nežinoma",
  Works: "Veikia",
  "Probably works": "Tikriausiai veikia",
  "Probably does not work": "Tikriausiai neveikia",
  "Evidence against": "Įrodymai prieš",
  "Not scored": "Neįvertinta",
  "No meaningful benefit": "Reikšmingos naudos nėra",
  "No human controlled trial": "Nėra kontroliuojamo tyrimo su žmonėmis",
  "Only one RCT": "Tik vienas RCT",
  "Best RCT is small or short": "Geriausias RCT mažas arba trumpas",
  "Outcome is a surrogate marker": "Rezultatas yra pakaitinis žymuo",
};

/** Display word for a ledger string produced by lib/evidence-ledger (score label, effect/certainty/fit word, gate). */
export function ledgerWord(lang: Lang, english: string): string {
  return lang === "lt" ? LEDGER_LT[english] ?? english : english;
}

const STRENGTH_LT: Record<string, string> = { strong: "stiprūs įrodymai", moderate: "vidutiniai įrodymai", limited: "riboti įrodymai", none: "įrodymų nėra" };

/** "<strength> evidence" (EN) / the agreeing Lithuanian phrase, from the stored evidence_strength value. */
export function strengthLabel(lang: Lang, value: string): string {
  return lang === "lt" ? STRENGTH_LT[value] ?? `${value.replace(/_/g, " ")} įrodymai` : `${value} evidence`;
}
