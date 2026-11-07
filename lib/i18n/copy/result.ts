/*
 * Static labels for the /scan result (label facts, grading notice, warnings,
 * evidence orientation, form and mix, company, technical details). Display
 * only: the stored values never change, only the words around them.
 *
 * "Display words" for scientific enums (direction, strength, confidence...) are
 * a lookup applied at render time to the STORED value; the stored value itself
 * is never edited, so history replays and exact-match rules are unaffected.
 */
import type { Lang } from "../lang";

export interface ResultCopy {
  sourcesUsed: string;
  // evidence grading is not active (2026-10-15)
  gradingNoticeTitle: string;
  gradingNoticeBody: string;
  gradingNoticeAria: string;
  formFitNotGraded: string;
  // basis badges (keyed by Basis) -- label + means
  basis: Record<"evidence_run" | "registry" | "curated_table" | "label" | "user_input" | "model_prior", { label: string; means: string }>;
  legendTitle: string;
  // validity / warnings
  warningCount: (n: number) => string;
  disclosureAria: (title: string) => string;
  businessModelAria: string;
  caveatTitle: Record<string, string>;
  // entered / label details
  whatYouEntered: string;
  typedNotRead: string;
  labelDetails: string;
  ingredient: string;
  form: string;
  dosePerServing: string;
  servingsPerDayLabel: string;
  readConfidence: string;
  sourceLabel: string;
  readFrom: string;
  formNotStated: string;
  notStated: string;
  /** Dose per serving on a label that printed none (or a read that could not find it). */
  doseNotStated: string;
  /** Row label for the unit the label printed (mcg, IU, mg ...). */
  unitAsPrinted: string;
  noDoseEntered: string;
  compoundSuffix: string; // "compound" in "4 mg compound"
  compoundPerServing: (mg: string) => string;
  elementalPerServing: (mg: string) => string;
  // empty states
  analyzerNotConfigured: string;
  analyzerNeedsKey: string;
  notSupplementTitle: string;
  notSupplementBody: string;
  ingredientNotSupported: (name: string | null) => string;
  nothingRun: string;
  requestRecorded: string;
  coveredSoFar: string;
  // ledger tabs
  estimate: string;
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
  techSource: string;
  techTyped: string;
  techPhoto: string;
  techTook: string;
  techVision: string;
  techRunId: string;
  techAppVersion: string;
  techRunStored: string;
  persistenceStatus: Record<string, string>;
  // translation status
  translating: string;
  translationPartial: string;
  machineTranslated: string;
  showOriginal: string;
}

const EN: ResultCopy = {
  sourcesUsed: "Sources used in this section",
  gradingNoticeTitle: "Evidence grades are not active yet.",
  gradingNoticeBody: "We are still validating how we grade the research behind each supplement, so no product gets a grade today. What you see is what the label says and background marked “unverified”.",
  gradingNoticeAria: "Evidence grading is not active yet",
  formFitNotGraded: "Evidence grading is not active yet, so no form has been graded.",
  basis: {
    evidence_run: { label: "Evidence run", means: "Scored from extracted trials with quoted provenance. The only source that produces a number." },
    registry: { label: "Public registry", means: "A dated public record (FDA enforcement reports via openFDA)." },
    curated_table: { label: "Curated & cited", means: "A maintained table where every entry cites a regulator fact sheet or a position stand." },
    label: { label: "As printed", means: "Read off the label. A claim the product makes about itself, not a verification." },
    user_input: { label: "Typed by you", means: "Entered by hand, not read from a label. Nothing here checked that the product contains what was typed." },
    model_prior: { label: "Model knowledge", means: "What the model recalls from training data. Unverified; shown for orientation only and never scored." },
  },
  legendTitle: "How to read the source badges",
  warningCount: (n) => `${n} evidence warning${n === 1 ? "" : "s"}`,
  disclosureAria: (title) => `${title} disclosure`,
  businessModelAria: "Business model disclosure",
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
  servingsPerDayLabel: "Servings per day",
  readConfidence: "Read confidence",
  sourceLabel: "Source",
  readFrom: "Read from:",
  formNotStated: "form not stated",
  notStated: "not stated",
  doseNotStated: "not stated on the label",
  unitAsPrinted: "Unit as printed",
  noDoseEntered: "no dose entered",
  compoundSuffix: "compound",
  compoundPerServing: (m) => `${m} compound per serving`,
  elementalPerServing: (m) => `${m} elemental per serving`,
  analyzerNotConfigured: "Scanning is not configured on this deployment.",
  analyzerNeedsKey: "The server needs a model API key (DEEPSEEK_API_KEY) to read a photo. Searching for a supplement by name still works.",
  notSupplementTitle: "That does not look like a supplement label.",
  notSupplementBody: "Photograph the Supplement Facts panel so the ingredient and dose can be read.",
  ingredientNotSupported: (n) => `${n ?? "That ingredient"} is not in the evidence vocabulary yet.`,
  nothingRun: "Nothing has been run for it.",
  requestRecorded: "Your request was recorded.",
  coveredSoFar: "Covered so far:",
  estimate: "Estimate",
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
  techSource: "Source",
  techTyped: "typed",
  techPhoto: "photo",
  techTook: "Took",
  techVision: "Vision model",
  techRunId: "Run id",
  techAppVersion: "App version",
  techRunStored: "Run stored",
  persistenceStatus: {},
  translating: "Translating…",
  translationPartial: "Some text is shown in the original English.",
  machineTranslated: "Some text on this page is machine-translated from English and has not been checked by a person. The English original is the record.",
  showOriginal: "Show the English original",
};

const LT: ResultCopy = {
  sourcesUsed: "Šiame skyriuje naudoti šaltiniai",
  gradingNoticeTitle: "Įrodymų įvertinimai dar neaktyvūs.",
  gradingNoticeBody: "Vis dar tikriname, kaip vertiname kiekvieno papildo tyrimus, todėl šiandien joks produktas įvertinimo negauna. Matai tai, ką sako etiketė, ir foninę informaciją, pažymėtą „nepatikrinta“.",
  gradingNoticeAria: "Įrodymų vertinimas dar neaktyvus",
  formFitNotGraded: "Įrodymų vertinimas dar neaktyvus, todėl jokia forma neįvertinta.",
  basis: {
    evidence_run: { label: "Įrodymų paleidimas", means: "Įvertinta pagal išgautus tyrimus su cituojama kilme. Vienintelis šaltinis, kuris duoda skaičių." },
    registry: { label: "Viešas registras", means: "Datuotas viešas įrašas (FDA vykdymo užtikrinimo ataskaitos per openFDA)." },
    curated_table: { label: "Kuruojama ir cituojama", means: "Prižiūrima lentelė, kurioje kiekvienas įrašas remiasi reguliuotojo informacijos lapu arba pozicijos dokumentu." },
    label: { label: "Kaip atspausdinta", means: "Nuskaityta iš etiketės. Tai pačios prekės teiginys apie save, o ne patikrinimas." },
    user_input: { label: "Įvedei tu", means: "Įvesta ranka, o ne nuskaityta iš etiketės. Niekas netikrino, ar produkte yra tai, kas įvesta." },
    model_prior: { label: "Modelio žinios", means: "Ką modelis prisimena iš mokymo duomenų. Nepatikrinta; rodoma tik orientacijai ir niekada neįvertinama." },
  },
  legendTitle: "Kaip skaityti šaltinių ženklelius",
  warningCount: (n) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11 ? "įrodymų įspėjimas" : mod10 === 0 || (mod100 >= 11 && mod100 <= 19) ? "įrodymų įspėjimų" : "įrodymų įspėjimai";
    return `${n} ${word}`;
  },
  disclosureAria: (title) => `${title} — atskleidimas`,
  businessModelAria: "Verslo modelio atskleidimas",
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
  servingsPerDayLabel: "Porcijos per dieną",
  readConfidence: "Nuskaitymo patikimumas",
  sourceLabel: "Šaltinis",
  readFrom: "Nuskaityta iš:",
  formNotStated: "forma nenurodyta",
  notStated: "nenurodyta",
  doseNotStated: "etiketėje nenurodyta",
  unitAsPrinted: "Etiketėje nurodytas vienetas",
  noDoseEntered: "dozė neįvesta",
  compoundSuffix: "junginio",
  compoundPerServing: (m) => `${m} junginio porcijoje`,
  elementalPerServing: (m) => `${m} elementinio kiekio porcijoje`,
  analyzerNotConfigured: "Šioje svetainės versijoje skenavimas nesukonfigūruotas.",
  analyzerNeedsKey: "Serveriui reikia modelio API rakto (DEEPSEEK_API_KEY), kad nuskaitytų nuotrauką. Papildo paieška pagal pavadinimą vis tiek veikia.",
  notSupplementTitle: "Atrodo, tai nėra papildo etiketė.",
  notSupplementBody: "Nufotografuok „Supplement Facts“ lentelę, kad būtų galima nuskaityti medžiagą ir dozę.",
  ingredientNotSupported: (n) => `${n ?? "Ši medžiaga"} dar nėra įrodymų žodyne.`,
  nothingRun: "Jai nieko nebuvo paleista.",
  requestRecorded: "Tavo užklausa užfiksuota.",
  coveredSoFar: "Kol kas apima:",
  estimate: "Įvertis",
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
  techSource: "Šaltinis",
  techTyped: "įvesta",
  techPhoto: "nuotrauka",
  techTook: "Truko",
  techVision: "Vaizdo modelis",
  techRunId: "Paleidimo ID",
  techAppVersion: "Programos versija",
  techRunStored: "Paleidimas išsaugotas",
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

const STRENGTH_LT: Record<string, string> = { strong: "stiprūs įrodymai", moderate: "vidutiniai įrodymai", limited: "riboti įrodymai", none: "įrodymų nėra" };

/** "<strength> evidence" (EN) / the agreeing Lithuanian phrase, from the stored evidence_strength value. */
export function strengthLabel(lang: Lang, value: string): string {
  return lang === "lt" ? STRENGTH_LT[value] ?? `${value.replace(/_/g, " ")} įrodymai` : `${value} evidence`;
}
