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
 * worker reports none), so the progress bar is indeterminate and says so; a
 * search snippet or a page summary is never "a paper read"; failed fetches,
 * walls and refusals are "no content", never access; an audit is experimental
 * and ungraded and carries no score; /scan shows this live research ONLY, so
 * every screen that has no completed audit says that no saved, cached or
 * model-recalled evidence is shown in its place; nothing claims that this
 * research is more complete than anyone else's.
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
  /* the screen between the label read and the result */
  loadingTitle: string;
  loadingLead: string;
  progressLabel: string;
  leaveNote: string;
  notRequestedTitle: string;
  problemTitle: string;
  noFallback: string;
  retryPhoto: string;
  blendNote: string;
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
    ungradedNote: "Experimental and ungraded: a model searched the web for this product, no person has checked it, and it has no score. It is not a clinical approval and does not feed any score.",
    idle: "This saved scan has no live research loaded on this page. Nothing was re-run, and research was not requested by opening it.",
    load: "Request live research for this scan",
    loadHint: "If research was already requested for this scan, asking again shows that job; it never starts a second one. If there is none, this queues one for the private research worker.",
    starting: "Checking live research…",
    queued: "Queued for the private research worker.",
    running: "Research is running.",
    succeeded: "Research audit returned.",
    failed: "Research did not complete.",
    disabled: "Live research is off on this deployment; research was not assessed.",
    unavailable: "Live research is temporarily unavailable; research was not assessed.",
    startFailed: "Could not start live research; research was not assessed.",
    noId: "This scan was not saved to your history, so live research could not be started for it. Live research runs only on a saved scan; scan again to try once more.",
    auth: "Sign in to view private live research.",
    error: "Research status could not be loaded; research was not assessed.",
    busy: "The research worker is busy. Try again later; research was not assessed.",
    notResearchable: "This saved scan is not eligible for live research; research was not assessed.",
    notFound: "No research was found for this account, so nothing is shown.",
    retry: "Check again",
    loadingTitle: "Researching your supplement live",
    loadingLead: "A research worker is searching the web for studies about this product, form and dose. Only this live research is shown for your scan; nothing is filled in from saved or cached results.",
    progressLabel: "Live research progress (indeterminate)",
    leaveNote: "You can leave this screen: leaving only stops this page from checking and does not cancel the research. Open this scan from History to look it up again.",
    notRequestedTitle: "Live research not requested",
    problemTitle: "Live research is not available for this scan",
    noFallback: "This page shows live research only. No saved, cached or model-recalled evidence is shown in its place, so there is no result for this scan.",
    retryPhoto: "Scan this photo again",
    blendNote: "This product lists several active ingredients. Research about one ingredient is not evidence about the blend.",
    noEstimate: "The bar is indeterminate on purpose: the research worker reports no percentage, so no progress figure, time estimate or count of studies found is shown. The steps below are the job’s real status.",
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
    missingHow: "Research is requested from your saved scan only, so they cannot be added on this screen. To research with them, scan again or type the supplement with its daily servings; nothing is assumed in the meantime.",
    model: "Model",
    prompt: "Prompt version",
    provenance: "Server provenance",
    evidenceStatus: "Evidence status",
    evidenceStatusValues: { experimental_unvalidated: "experimental, not validated" },
    affectsScore: "Changes a score",
    notAffectScore: "This audit has no score and does not change any score.",
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
    ungradedNote: "Eksperimentinis ir neįvertintas: modelis ieškojo šio produkto internete, žmogus to netikrino, balo nėra. Tai nėra klinikinis patvirtinimas ir jokio balo nekeičia.",
    idle: "Šiame puslapyje šiam išsaugotam skenavimui nėra įkelto tiesioginio tyrimo. Nieko nebuvo paleista iš naujo, o jį atvėrus tyrimas nebuvo užsakytas.",
    load: "Užsakyti šio skenavimo tiesioginį tyrimą",
    loadHint: "Jei šiam skenavimui tyrimas jau buvo užsakytas, paprašius dar kartą bus parodyta ta pati užduotis; antra niekada nepradedama. Jei jos nėra, bus įtraukta viena užduotis į privataus tyrimų vykdytojo eilę.",
    starting: "Tikrinamas tiesioginis tyrimas…",
    queued: "Laukia eilėje privačiam tyrimų vykdytojui.",
    running: "Tyrimas vykdomas.",
    succeeded: "Gautas tyrimo auditas.",
    failed: "Tyrimas nebaigtas.",
    disabled: "Šiame diegime tiesioginis tyrimas išjungtas; tyrimas nevertintas.",
    unavailable: "Tiesioginis tyrimas laikinai nepasiekiamas; tyrimas nevertintas.",
    startFailed: "Tiesioginio tyrimo pradėti nepavyko; tyrimas nevertintas.",
    noId: "Šis skenavimas nebuvo išsaugotas jūsų istorijoje, todėl tiesioginio tyrimo jam pradėti nepavyko. Tiesioginis tyrimas vykdomas tik išsaugotam skenavimui; nuskenuokite dar kartą.",
    auth: "Prisijunkite, kad matytumėte privatų tiesioginį tyrimą.",
    error: "Nepavyko gauti tyrimo būsenos; tyrimas nevertintas.",
    busy: "Tyrimų vykdytojas užimtas. Bandykite vėliau; tyrimas nevertintas.",
    notResearchable: "Šis išsaugotas skenavimas netinka tiesioginiam tyrimui; tyrimas nevertintas.",
    notFound: "Šiai paskyrai tyrimo nerasta, todėl nieko nerodoma.",
    retry: "Patikrinti dar kartą",
    loadingTitle: "Tiesiogiai tiriame jūsų papildą",
    loadingLead: "Tyrimų vykdytojas ieško internete tyrimų apie šį produktą, formą ir dozę. Jūsų skenavimui rodomas tik šis tiesioginis tyrimas; nieko nepildoma iš išsaugotų ar podėlyje esančių rezultatų.",
    progressLabel: "Tiesioginio tyrimo eiga (neapibrėžta)",
    leaveNote: "Galite palikti šį ekraną: išėjus šis puslapis tik nustoja tikrinti, o tyrimas neatšaukiamas. Skenavimą vėl atverkite iš istorijos.",
    notRequestedTitle: "Tiesioginis tyrimas neužsakytas",
    problemTitle: "Šiam skenavimui tiesioginis tyrimas nepasiekiamas",
    noFallback: "Šiame puslapyje rodomas tik tiesioginis tyrimas. Vietoje jo nerodomi išsaugoti, podėlyje esantys ar iš modelio atminties paimti įrodymai, todėl šiam skenavimui rezultato nėra.",
    retryPhoto: "Skenuoti šią nuotrauką dar kartą",
    blendNote: "Šiame produkte yra kelios veikliosios medžiagos. Tyrimas apie vieną medžiagą nėra įrodymas apie mišinį.",
    noEstimate: "Juosta tyčia neapibrėžta: tyrimų vykdytojas procentų nepraneša, todėl eigos skaičiai, laiko prognozė ar rastų tyrimų skaičius nerodomi. Toliau pateikti žingsniai yra tikra užduoties būsena.",
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
    missingHow: "Tyrimas užsakomas tik pagal jūsų išsaugotą skenavimą, todėl šiame ekrane jų pridėti negalima. Norėdami tirti su jais, nuskenuokite dar kartą arba įveskite papildą su dienos porcijomis; kol kas jokių prielaidų nedaroma.",
    model: "Modelis",
    prompt: "Užklausos versija",
    provenance: "Serverio kilmės duomenys",
    evidenceStatus: "Įrodymų būsena",
    evidenceStatusValues: { experimental_unvalidated: "eksperimentinis, nepatvirtintas" },
    affectsScore: "Keičia balą",
    notAffectScore: "Šis auditas balo neturi ir jokio balo nekeičia.",
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
