/*
 * Display copy of the owner-private live research panel (components/scan-research-panel.tsx), EN + LT.
 *
 * Every CONTROL, status, label and note the panel owns is written here in both
 * languages, and `ResearchCopy` makes a missing LT key a type error. The text a
 * research MODEL wrote (statements, study notes, doubts, limits it returned) is
 * deliberately NOT here and NOT translated: it is shown verbatim, tagged as
 * English, so no number, unit, quotation, study ID, bibliography entry or hedge
 * can be changed on the way to the screen (see the panel's `narrative` helper).
 *
 * Honesty rules the wording follows: no percentage and no time estimate (the
 * worker reports none); a search snippet or a page summary is never "a paper
 * read"; failed fetches, walls and refusals are "no content", never access; an
 * audit is experimental and ungraded and carries no score; nothing claims that
 * this research is more complete than anyone else's.
 */
import type { Lang } from "@/lib/i18n/lang";

export type ResearchLanguage = Lang;

export interface ResearchCopy {
  title: string;
  tagExperimental: string;
  tagUngraded: string;
  ungradedNote: string;
  /* status lines */
  idle: string;
  load: string;
  loadHint: string;
  starting: string;
  queued: string;
  running: string;
  succeeded: string;
  failed: string;
  disabled: string;
  unavailable: string;
  startFailed: string;
  noId: string;
  auth: string;
  error: string;
  busy: string;
  notResearchable: string;
  notFound: string;
  retry: string;
  /* progress: real job status only */
  noEstimate: string;
  stepsLabel: string;
  stages: { queued: string; running: string; finished: string; completed: string; failed: string };
  queuedAt: (when: string) => string;
  lastSignal: (when: string) => string;
  finishedAt: (when: string) => string;
  stalled: (when: string) => string;
  failureCode: string;
  failureUnknown: string;
  /* the facts the research had */
  factsTitle: string;
  factsRecorded: string;
  factLabels: { basis: string; product: string; ingredient: string; form: string; compoundPerServing: string; printedElementalPerServing: string; unit: string; servingsPerDay: string; multiIngredient: string };
  factBasis: { label: string; user_input: string };
  yes: string;
  no: string;
  missingLead: string;
  missing: { servings_per_day: string; dose_per_serving: string; form: string; other_ingredients: string };
  missingHow: string;
  /* the result */
  model: string;
  prompt: string;
  provenance: string;
  evidenceStatus: string;
  evidenceStatusValues: Record<string, string>;
  affectsScore: string;
  notAffectScore: string;
  runner: string;
  access: string;
  accessContent: string;
  accessNone: string;
  summaryLabels: { requests: string; errors: string; walls: string; refusals: string; search_snippets: string; fetch_summaries: string; original_documents: string };
  haikuNote: string;
  notAccessedNote: string;
  inventory: string;
  inventoryItem: string;
  inventoryNote: string;
  sourceLimitations: string;
  knownLimitations: Record<string, string>;
  couldNotAccess: string;
  narrativeNote: string;
  ownWordsNote: string;
  statement: string;
  population: string;
  basis: string;
  doubt: string;
  wouldMove: string;
  dailyRange: string;
  outcomeIds: string;
  none: string;
}

const KNOWN_EN = {
  "WebSearch snippets and WebFetch model summaries are not original papers.": "Search snippets and page summaries written by a model are not original papers.",
  "ID matching does not verify study numbers or clinical validity.": "Matching an ID does not verify study numbers or clinical validity.",
};
const KNOWN_LT = {
  "WebSearch snippets and WebFetch model summaries are not original papers.": "Paieškos ištraukos ir modelio parašytos puslapių santraukos nėra originalūs straipsniai.",
  "ID matching does not verify study numbers or clinical validity.": "Identifikatoriaus sutapimas nepatvirtina tyrimo skaičių ar klinikinio pagrįstumo.",
};

export const RESEARCH_COPY: Record<ResearchLanguage, ResearchCopy> = {
  en: {
    title: "Live research",
    tagExperimental: "Experimental",
    tagUngraded: "Ungraded",
    ungradedNote: "Experimental and ungraded: a model searched the web for this product, no person has checked it, and it has no score. It does not change your scan score or the saved audit above.",
    idle: "This saved scan is shown as it was. Nothing was re-run, and live research has not been requested from here.",
    load: "Look up live research for this scan",
    loadHint: "If this scan has no research yet, this queues one for the private research worker.",
    starting: "Checking live research…",
    queued: "Queued for the private research worker.",
    running: "Research is running.",
    succeeded: "Research audit returned.",
    failed: "Research did not complete.",
    disabled: "Live research is off on this deployment; research was not assessed.",
    unavailable: "Live research is temporarily unavailable; research was not assessed.",
    startFailed: "Could not start live research; research was not assessed.",
    noId: "This scan has no verified saved run ID; live research was not started.",
    auth: "Sign in to view private live research.",
    error: "Research status could not be loaded; research was not assessed.",
    busy: "The research worker is busy. Try again later; research was not assessed.",
    notResearchable: "This saved scan is not eligible for live research; research was not assessed.",
    notFound: "No research was found for this account, so nothing is shown.",
    retry: "Check again",
    noEstimate: "No percentage or time estimate is shown because the worker reports none.",
    stepsLabel: "Research status (real job status, no estimate)",
    stages: { queued: "Queued", running: "Running", finished: "Finished", completed: "Completed", failed: "Failed" },
    queuedAt: (t) => `Queued ${t}`,
    lastSignal: (t) => `Last update from the worker: ${t}`,
    finishedAt: (t) => `Finished ${t}`,
    stalled: (t) => `No update from the worker since ${t}. If it stays silent, the job may be picked up again or end as failed. This page keeps checking; no estimate is available.`,
    failureCode: "Failure code",
    failureUnknown: "unavailable",
    factsTitle: "Facts this research used",
    factsRecorded: "Taken from your saved scan, unchanged.",
    factLabels: { basis: "Source of the facts", product: "Product", ingredient: "Ingredient", form: "Form", compoundPerServing: "Compound mass per serving", printedElementalPerServing: "Printed elemental amount per serving", unit: "Unit as printed", servingsPerDay: "Servings per day", multiIngredient: "Several active ingredients" },
    factBasis: { label: "Read from the label photo", user_input: "Typed by you" },
    yes: "yes",
    no: "no",
    missingLead: "Not recorded on this scan, so research did not guess them:",
    missing: { servings_per_day: "servings per day", dose_per_serving: "dose per serving", form: "form", other_ingredients: "whether other active ingredients are present" },
    missingHow: "Research is requested from your saved scan only, so these cannot be added here.",
    model: "Model",
    prompt: "Prompt version",
    provenance: "Server provenance",
    evidenceStatus: "Evidence status",
    evidenceStatusValues: { experimental_unvalidated: "experimental, not validated" },
    affectsScore: "Changes scan score",
    notAffectScore: "This audit does not change the retained scan score.",
    runner: "Runner",
    access: "Source access summary",
    accessContent: "Returned content",
    accessNone: "Returned no content (not counted as access)",
    summaryLabels: { requests: "requests that returned content", errors: "errors (HTTP errors such as 403, redirects not followed)", walls: "walls (CAPTCHA, cookie or bot checks)", refusals: "refusals", search_snippets: "search snippets", fetch_summaries: "page summaries (written by Claude Haiku)", original_documents: "original documents opened" },
    haikuNote: "A page summary is a short text a smaller AI model (Claude Haiku) wrote about a web page. It is not the paper, and nothing here was checked against a paper’s full text.",
    notAccessedNote: "Errors, walls and refusals returned no content, so they are not counted as access, and this page shows no text from them.",
    inventory: "Study IDs the audit lists",
    inventoryItem: "found in returned snippet or summary text; paper not opened",
    inventoryNote: "An ID is listed only when it appears in text a search or page summary returned.",
    sourceLimitations: "Limitations",
    knownLimitations: KNOWN_EN,
    couldNotAccess: "Could not access",
    narrativeNote: "Model-written research text is shown in the original English.",
    ownWordsNote: "The study notes below are the model’s own wording, not quotations from papers.",
    statement: "Model’s statement",
    population: "Population",
    basis: "Strongest study (model’s wording)",
    doubt: "Strongest doubt",
    wouldMove: "What would change this",
    dailyRange: "Daily range (model’s wording)",
    outcomeIds: "Study IDs",
    none: "none",
  },
  lt: {
    title: "Tiesioginis tyrimas",
    tagExperimental: "Eksperimentinis",
    tagUngraded: "Be įvertinimo",
    ungradedNote: "Eksperimentinis ir neįvertintas: modelis ieškojo šio produkto internete, žmogus to netikrino, balo nėra. Tai nekeičia jūsų skenavimo balo ar aukščiau esančio išsaugoto audito.",
    idle: "Šis išsaugotas skenavimas rodomas toks, koks buvo. Nieko nebuvo paleista iš naujo, o tiesioginis tyrimas iš čia nebuvo užsakytas.",
    load: "Rasti šio skenavimo tiesioginį tyrimą",
    loadHint: "Jei šiam skenavimui tyrimo dar nėra, paspaudus jis bus įtrauktas į privataus tyrimų vykdytojo eilę.",
    starting: "Tikrinamas tiesioginis tyrimas…",
    queued: "Laukia eilėje privačiam tyrimų vykdytojui.",
    running: "Tyrimas vykdomas.",
    succeeded: "Gautas tyrimo auditas.",
    failed: "Tyrimas nebaigtas.",
    disabled: "Šiame diegime tiesioginis tyrimas išjungtas; tyrimas nevertintas.",
    unavailable: "Tiesioginis tyrimas laikinai nepasiekiamas; tyrimas nevertintas.",
    startFailed: "Tiesioginio tyrimo pradėti nepavyko; tyrimas nevertintas.",
    noId: "Šis skenavimas neturi patvirtinto išsaugoto vykdymo ID; tiesioginis tyrimas nepradėtas.",
    auth: "Prisijunkite, kad matytumėte privatų tiesioginį tyrimą.",
    error: "Nepavyko gauti tyrimo būsenos; tyrimas nevertintas.",
    busy: "Tyrimų vykdytojas užimtas. Bandykite vėliau; tyrimas nevertintas.",
    notResearchable: "Šis išsaugotas skenavimas netinka tiesioginiam tyrimui; tyrimas nevertintas.",
    notFound: "Šiai paskyrai tyrimo nerasta, todėl nieko nerodoma.",
    retry: "Patikrinti dar kartą",
    noEstimate: "Procentai ar laiko prognozė nerodomi, nes vykdytojas jų nepraneša.",
    stepsLabel: "Tyrimo būsena (tikra užduoties būsena, be prognozių)",
    stages: { queued: "Eilėje", running: "Vykdoma", finished: "Baigta", completed: "Užbaigta", failed: "Nepavyko" },
    queuedAt: (t) => `Įtraukta į eilę ${t}`,
    lastSignal: (t) => `Paskutinis vykdytojo atnaujinimas: ${t}`,
    finishedAt: (t) => `Baigta ${t}`,
    stalled: (t) => `Vykdytojas nieko nepranešė nuo ${t}. Jei jis ir toliau tylės, užduotis gali būti perimta iš naujo arba baigtis nesėkme. Šis puslapis toliau tikrina; prognozės nėra.`,
    failureCode: "Nesėkmės kodas",
    failureUnknown: "nepasiekiama",
    factsTitle: "Faktai, kuriais rėmėsi tyrimas",
    factsRecorded: "Paimta iš jūsų išsaugoto skenavimo, nekeista.",
    factLabels: { basis: "Faktų šaltinis", product: "Produktas", ingredient: "Veiklioji medžiaga", form: "Forma", compoundPerServing: "Junginio masė porcijoje", printedElementalPerServing: "Etiketėje nurodytas elementinis kiekis porcijoje", unit: "Etiketėje nurodytas vienetas", servingsPerDay: "Porcijos per dieną", multiIngredient: "Kelios veikliosios medžiagos" },
    factBasis: { label: "Nuskaityta iš etiketės nuotraukos", user_input: "Įvesta jūsų" },
    yes: "taip",
    no: "ne",
    missingLead: "Šiame skenavime nenurodyta, todėl tyrimas jų neatspėliojo:",
    missing: { servings_per_day: "porcijos per dieną", dose_per_serving: "dozė porcijoje", form: "forma", other_ingredients: "ar yra kitų veikliųjų medžiagų" },
    missingHow: "Tyrimas užsakomas tik pagal jūsų išsaugotą skenavimą, todėl čia šių faktų pridėti negalima.",
    model: "Modelis",
    prompt: "Užklausos versija",
    provenance: "Serverio kilmės duomenys",
    evidenceStatus: "Įrodymų būsena",
    evidenceStatusValues: { experimental_unvalidated: "eksperimentinis, nepatvirtintas" },
    affectsScore: "Keičia skenavimo balą",
    notAffectScore: "Šis auditas nekeičia išsaugoto skenavimo balo.",
    runner: "Vykdytojas",
    access: "Šaltinių prieigos suvestinė",
    accessContent: "Grąžintas turinys",
    accessNone: "Turinio negrąžino (neskaičiuojama kaip prieiga)",
    summaryLabels: { requests: "užklausos, grąžinusios turinį", errors: "klaidos (HTTP klaidos, pvz., 403, nesekti nukreipimai)", walls: "blokavimai (CAPTCHA, slapukų ar robotų patikros)", refusals: "atsisakymai", search_snippets: "paieškos ištraukos", fetch_summaries: "puslapių santraukos (parašė Claude Haiku)", original_documents: "atvertų originalių dokumentų" },
    haikuNote: "Puslapio santrauka – tai trumpas tekstas apie interneto puslapį, kurį parašė mažesnis dirbtinio intelekto modelis (Claude Haiku). Tai nėra straipsnis, ir nieko čia netikrinta pagal visą straipsnio tekstą.",
    notAccessedNote: "Klaidos, blokavimai ir atsisakymai turinio negrąžino, todėl jie neskaičiuojami kaip prieiga, o šis puslapis iš jų jokio teksto nerodo.",
    inventory: "Audito nurodomi tyrimų ID",
    inventoryItem: "rastas grąžintoje ištraukoje ar santraukoje; straipsnis neatvertas",
    inventoryNote: "ID nurodomas tik tada, kai jis yra paieškos ar puslapio santraukos grąžintame tekste.",
    sourceLimitations: "Apribojimai",
    knownLimitations: KNOWN_LT,
    couldNotAccess: "Nepavyko pasiekti",
    narrativeNote: "Modelio parašytas tyrimo tekstas rodomas originalia anglų kalba, neišverstas, todėl joks skaičius, vienetas, tyrimo ID ar atsargumo žodis nepakeistas.",
    ownWordsNote: "Toliau pateiktos tyrimų pastabos yra paties modelio formuluotės, o ne citatos iš straipsnių.",
    statement: "Modelio teiginys",
    population: "Populiacija",
    basis: "Stipriausias tyrimas (modelio formuluotė)",
    doubt: "Didžiausia abejonė",
    wouldMove: "Kas tai pakeistų",
    dailyRange: "Dienos dozės intervalas (modelio formuluotė)",
    outcomeIds: "Tyrimų ID",
    none: "nėra",
  },
};
