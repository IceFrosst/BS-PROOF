/*
 * Display copy of the LIVE research RESULT CARD (components/live-result-card.tsx), EN + LT.
 * `CardCopy` makes a missing LT key a type error.
 *
 * Only the card's own words live here: tabs reuse the existing result copy
 * (RESULT_COPY: Outcomes, Effect / Evidence / Form / Dose, Found / Missing / Would move
 * it, "n evidence warnings"), so the labels cannot drift from the approved card.
 * The text a research MODEL wrote is never here and never translated: it is drawn
 * verbatim and, in Lithuanian, tagged lang="en".
 *
 * Wording rules: no sentence says "score", "grade" or "verdict" as something this
 * page produced; "unknown" is never "zero"; a bar that is not drawn says why; a
 * missing assessment is never "no risk"; a source is a snippet or a model-written
 * summary, never "a paper read". The Lithuanian is written to the same rules and has
 * NOT been checked by a native speaker.
 */
import type { Lang } from "@/lib/i18n/lang";
import type { AxisReason, AxisState, MethodologyReason, WarningId } from "@/lib/scan-research/result-card";

export interface WarningCopy { title: string; status: string; body: string }

export interface CardCopy {
  cardLabel: string;
  stamp: string;
  stampTail: string;
  listLead: string;
  contextTag: string;
  contextBanner: string;
  listWords: { context: string; none: string; ungraded: string };
  axisWord: { effectData: string; evidenceData: string; unknown: string; not_assessed: string; not_gradeable: string };
  axisStamp: Record<AxisState, string>;
  why: string;
  reasons: Record<AxisReason, string>;
  labels: {
    tier: string; tierNone: string; basis: string; estimate: string; meaningful: string; strongestStudy: string; strongestDoubt: string;
    range: string; modelFit: string; fitOf: (n: number) => string; fitUnknown: string; fitNone: string; textOnly: string;
    formOnScan: string; servingsOnScan: string; notStated: string; elementalNotStated: string; dailyDose: string; doseNote: string;
    rctCount: string; largestRct: string; longestRct: string; zeroNote: string; bodyIsRct: string; chronic: string; surrogate: string; notReported: string;
    checklist: string; uncheckedNote: string; sources: string; sourcesNote: string; noSources: string; funding: string; year: string; pooledIn: string;
  };
  design: Record<string, string>;
  direction: Record<string, string>;
  fundingKind: Record<string, string>;
  warnings: Record<Exclude<WarningId, "blend">, WarningCopy> & { blend: { title: string; status: string } };
  methodReasons: Record<MethodologyReason, string>;
  reportedLead: string;
  noneReported: string;
  noWarning: string;
  moreTitle: string;
  moreLead: string;
  moreLabels: { product: string; note: string; selfConfidence: string; confidenceNote: string };
}

const EN: CardCopy = {
  cardLabel: "Live research result",
  stamp: "Live research · experimental, ungraded",
  stampTail: "A model’s findings from web search snippets and page summaries. No person has checked them. They give no score.",
  listLead: "Pick an outcome to see its four rows (Effect, Evidence, Form and Dose) and the warnings for that outcome. No row is graded: every bar stays unfilled, and any number the research gave is shown only as text.",
  contextTag: "Context only",
  contextBanner: "Context only: this row is about a single ingredient or part, not about this product. It is shown for background. It is not graded, and it is never added or averaged into the combination.",
  listWords: { context: "Context only · not graded", none: "No study cited", ungraded: "Not graded" },
  axisWord: { effectData: "Size not graded", evidenceData: "Data · not graded", unknown: "Unknown", not_assessed: "Not assessed", not_gradeable: "Not gradeable" },
  axisStamp: {
    data: "What follows is the research’s own finding. Nothing here is graded, so the bar is unfilled.",
    unknown: "Unknown, which is not zero. The bar is unfilled.",
    not_assessed: "Not assessed: no study was cited. That does not mean no evidence exists. The bar is unfilled.",
    not_gradeable: "Not gradeable here. The bar is unfilled.",
  },
  why: "Why",
  reasons: {
    context_only: "A context row for a combination product: evidence about one ingredient says nothing about this product, so no row of it is graded.",
    no_source: "No study ID was cited for this outcome in this run, so nothing was assessed. That is not a finding that no evidence exists.",
    size_not_graded: "The research describes the size of the effect in words, not as a structured estimate with an interval, and this page does not turn its tier into a bar. The model’s own tier is listed below as text.",
    effect_unclear: "The research could not size the effect and marked it unclear. Unclear is not zero and not “no effect”.",
    snippet_only: "Every source cited is a search snippet or a page summary written by a model; no paper was opened. This page does not grade the strength of that evidence, so the bar is unfilled. The research’s own counts and judgements are listed below.",
    fit_not_graded: "The research gave its own 0–4 match number for this row. It is the model’s judgement from snippets, it has not been checked, and this research is not graded, so no bar is drawn from it and no grade word is given. The number is listed below as text only.",
    fit_unknown: "The research marked this unknown. Unknown is not 0 and not a partial match, so the bar is unfilled.",
    fit_missing: "The research gave no usable match number for this row, so the bar is unfilled.",
    form_not_stated: "Your scan does not record the form, and the research does not guess one, so no form match can be judged.",
    dose_not_stated: "Your scan does not record a dose per serving, so no dose match can be judged.",
    servings_not_stated: "Servings per day are not recorded. A daily dose is not computed and one serving a day is not assumed, so no dose match can be judged.",
    blend: "This is a combination product. Form and dose belong to each ingredient, so there is no single form or dose match for the whole formula. Nothing is averaged.",
    facts_unavailable: "The scan facts this research used are not available on this page, so this row cannot be checked against them.",
  },
  labels: {
    tier: "Research’s own effect tier (model’s wording, not checked)",
    tierNone: "not given",
    basis: "Why that tier (model’s wording)",
    estimate: "Estimate (model’s wording)",
    meaningful: "Meaningful? (model’s wording)",
    strongestStudy: "Strongest study (model’s wording)",
    strongestDoubt: "Strongest doubt",
    range: "Daily range (model’s wording)",
    modelFit: "Research’s own match number",
    fitOf: (n) => `${n} of 4`,
    fitUnknown: "unknown",
    fitNone: "not given",
    textOnly: "text only (not graded)",
    formOnScan: "Form on your scan",
    servingsOnScan: "Servings per day on your scan",
    notStated: "not stated",
    elementalNotStated: "not stated (nothing is converted or guessed)",
    dailyDose: "Daily dose the research used (its wording)",
    doseNote: "Dose note (its wording)",
    rctCount: "Randomised trials counted",
    largestRct: "Largest trial (people)",
    longestRct: "Longest trial (weeks)",
    zeroNote: "A 0 here can mean the research did not report it.",
    bodyIsRct: "Body of evidence is randomised trials",
    chronic: "Long-term outcome",
    surrogate: "Surrogate-marker outcome",
    notReported: "not reported",
    checklist: "Checklist (the research’s own judgements)",
    uncheckedNote: "Unknown is not a pass: it means the research did not judge it.",
    sources: "Sources cited",
    sourcesNote: "Each is an ID the research saw in a search snippet or a model-written page summary. No paper was opened and no ID has been verified. A link is built from the shape of the ID only.",
    noSources: "No study ID was cited for this outcome.",
    funding: "funding",
    year: "year",
    pooledIn: "already inside",
  },
  design: { sr_ma: "systematic review / meta-analysis", rct: "randomised trial", nrct: "non-randomised trial", cohort: "cohort study", case_series: "case series", other: "other design" },
  direction: { benefit: "benefit", none: "no effect", harm: "harm", unclear: "unclear" },
  fundingKind: { independent: "independent", industry: "industry", mixed: "mixed", unknown: "unknown" },
  warnings: {
    context_only: { title: "Context only · not this product", status: "Not graded", body: "This row is evidence about one ingredient or part, not about the combination you scanned. It is shown for background only; it is not graded and not added to anything." },
    blend: { title: "More than one active ingredient", status: "Combination product" },
    other_ingredients_unknown: { title: "Other ingredients not recorded", status: "Unknown", body: "The scan does not say whether other active ingredients are present, so this research could not tell a single ingredient from a blend. Nothing is assumed." },
    servings_not_stated: { title: "Servings per day not stated", status: "Daily dose not computed", body: "The scan does not record how many servings are taken a day. A daily dose is not computed and one serving a day is not assumed (no assumption is made)." },
    dose_not_stated: { title: "Dose per serving not recorded", status: "Unknown", body: "The scan does not record a dose per serving, so the research could not compare any dose with a studied dose. Nothing is converted or guessed." },
    form_not_stated: { title: "Form not stated", status: "Unknown", body: "The scan does not record the form (for example which salt or ester), and the research does not guess one." },
    facts_unavailable: { title: "Scan facts unavailable", status: "Unknown", body: "The facts this research was given are not available on this page, so form, dose and servings could not be checked." },
    no_human_controlled_trial: { title: "No human controlled trial", status: "None counted in this run", body: "The research counted no randomised human trial for this outcome. A randomised trial puts people into the treatment or the comparison group by chance, so the two groups can be compared fairly. Missing evidence in this run is not proof that the product fails, and it is not proof that it works." },
    methodology: { title: "Method concerns recorded", status: "Reported by the research", body: "The research recorded the concerns listed below about the studies behind this outcome. They are disclosures, not a score." },
    funding: { title: "Funding & independence", status: "Funding / one-lab flag reported", body: "Who paid for a trial can pull the result their way, but funding on its own does not show that a result is wrong. The research flagged that the positive evidence it counted comes only from industry-funded work or from one laboratory; it does not say which of the two. This is a disclosure: it changes no score." },
    publication: { title: "Publication bias", status: "Concern reported", body: "Publication bias means studies that found something are more likely to be published than studies that found nothing, which can make an ingredient look better than it is. The research recorded a concern. A search that finds no sign of it would not prove it is absent. This is a disclosure: it changes no score." },
  },
  methodReasons: {
    risk_of_bias: "risk of bias",
    consistency: "inconsistent results",
    precision: "imprecise estimate",
    directness: "indirect evidence (not the same people, dose or outcome)",
    one_rct: "only one randomised trial counted",
    small_or_short: "the best trial counted is small or short",
    surrogate: "the outcome is a surrogate marker, not something a person feels",
  },
  reportedLead: "The research’s own sentences that mention it:",
  noneReported: "The research kept no sentence about this, so no detail is shown. That is unknown, not a sign that the concern is absent.",
  noWarning: "This research recorded no warning for this outcome. That is not a statement that nothing is wrong: whatever it did not assess is unknown.",
  moreTitle: "How this research was done",
  moreLead: "Model, sources, access limits and timestamps. Secondary detail; the result is above.",
  moreLabels: { product: "Product, ingredient, form and daily dose the research reports (its wording)", note: "The research’s own note about access (its wording)", selfConfidence: "The research’s own confidence (not validated)", confidenceNote: "Its note on that confidence (its wording)" },
};

const LT: CardCopy = {
  cardLabel: "Tiesioginio tyrimo rezultatas",
  stamp: "Tiesioginis tyrimas · eksperimentinis, neįvertintas",
  stampTail: "Modelio išvados iš interneto paieškos ištraukų ir puslapių santraukų. Jų niekas nepatikrino. Balo jos neduoda.",
  listLead: "Pasirinkite rezultatą – pamatysite jo keturias eilutes (Poveikis, Įrodymai, Forma ir Dozė) ir to rezultato įspėjimus. Nė viena eilutė nevertinama: visos juostos lieka neužpildytos, o tyrimo pateiktas skaičius rodomas tik kaip tekstas.",
  contextTag: "Tik kontekstas",
  contextBanner: "Tik kontekstas: ši eilutė apie vieną ingredientą ar dalį, o ne apie šį produktą. Ji rodoma kaip fonas. Ji nevertinama ir niekada nėra sudedama ar vidurkinama su kombinacija.",
  listWords: { context: "Tik kontekstas · nevertinta", none: "Tyrimų nenurodyta", ungraded: "Nevertinta" },
  axisWord: { effectData: "Dydis nevertintas", evidenceData: "Yra duomenų · nevertinta", unknown: "Nežinoma", not_assessed: "Neįvertinta", not_gradeable: "Nevertintina" },
  axisStamp: {
    data: "Toliau – paties tyrimo išvada. Čia niekas nevertinama, todėl juosta neužpildyta.",
    unknown: "Nežinoma, o tai ne nulis. Juosta neužpildyta.",
    not_assessed: "Neįvertinta: nenurodytas nė vienas tyrimas. Tai nereiškia, kad įrodymų nėra. Juosta neužpildyta.",
    not_gradeable: "Čia nevertintina. Juosta neužpildyta.",
  },
  why: "Kodėl",
  reasons: {
    context_only: "Kombinuoto produkto konteksto eilutė: vieno ingrediento įrodymai nieko nesako apie šį produktą, todėl tokia eilutė nevertinama.",
    no_source: "Šiame tyrime šiam rezultatui nenurodytas joks tyrimo ID, todėl niekas nebuvo vertinama. Tai nereiškia, kad įrodymų nėra.",
    size_not_graded: "Tyrimas poveikio dydį aprašo žodžiais, o ne struktūruotu įverčiu su intervalu, ir šis puslapis jo lygio nevirsta juosta. Paties modelio lygis pateiktas žemiau kaip tekstas.",
    effect_unclear: "Tyrimas negalėjo įvertinti poveikio dydžio ir pažymėjo „neaišku“. Neaišku nėra nulis ir nėra „poveikio nėra“.",
    snippet_only: "Visi nurodyti šaltiniai yra paieškos ištraukos arba modelio parašytos puslapių santraukos; nė vienas straipsnis neatidarytas. Šis puslapis nevertina šių įrodymų stiprumo, todėl juosta neužpildyta. Paties tyrimo skaičiai ir vertinimai pateikti žemiau.",
    fit_not_graded: "Tyrimas šiai eilutei pateikė savo 0–4 atitikimo skaičių. Tai modelio vertinimas iš ištraukų, jis nepatikrintas, o šis tyrimas nevertinamas, todėl pagal jį juosta nepiešiama ir vertinimo žodis nesuteikiamas. Skaičius pateiktas žemiau tik kaip tekstas.",
    fit_unknown: "Tyrimas tai pažymėjo kaip nežinomą. Nežinoma nėra 0 ir nėra dalinis atitikimas, todėl juosta neužpildyta.",
    fit_missing: "Tyrimas šiai eilutei nepateikė tinkamo atitikimo skaičiaus, todėl juosta neužpildyta.",
    form_not_stated: "Jūsų nuskaityme forma neužfiksuota, o tyrimas jos nespėlioja, todėl formos atitikimo įvertinti negalima.",
    dose_not_stated: "Jūsų nuskaityme dozė porcijai neužfiksuota, todėl dozės atitikimo įvertinti negalima.",
    servings_not_stated: "Porcijų per dieną skaičius neužfiksuotas. Paros dozė neskaičiuojama ir viena porcija per dieną nepriimama, todėl dozės atitikimo įvertinti negalima.",
    blend: "Tai kombinuotas produktas. Forma ir dozė priklauso kiekvienam ingredientui, todėl visai formulei nėra vieno formos ar dozės atitikimo. Niekas nevidurkinama.",
    facts_unavailable: "Šiame puslapyje nėra faktų, kuriuos naudojo šis tyrimas, todėl šios eilutės pagal juos patikrinti negalima.",
  },
  labels: {
    tier: "Paties tyrimo poveikio lygis (modelio formuluotė, nepatikrinta)",
    tierNone: "nenurodyta",
    basis: "Kodėl toks lygis (modelio formuluotė)",
    estimate: "Įvertis (modelio formuluotė)",
    meaningful: "Ar reikšminga? (modelio formuluotė)",
    strongestStudy: "Stipriausias tyrimas (modelio formuluotė)",
    strongestDoubt: "Didžiausia abejonė",
    range: "Paros intervalas (modelio formuluotė)",
    modelFit: "Paties tyrimo atitikimo skaičius",
    fitOf: (n) => `${n} iš 4`,
    fitUnknown: "nežinoma",
    fitNone: "nenurodyta",
    textOnly: "tik tekstas (nevertinama)",
    formOnScan: "Forma jūsų nuskaityme",
    servingsOnScan: "Porcijų per dieną jūsų nuskaityme",
    notStated: "nenurodyta",
    elementalNotStated: "nenurodyta (niekas nekonvertuojama ir nespėliojama)",
    dailyDose: "Paros dozė, kurią naudojo tyrimas (jo formuluotė)",
    doseNote: "Pastaba apie dozę (jo formuluotė)",
    rctCount: "Suskaičiuoti atsitiktinių imčių tyrimai",
    largestRct: "Didžiausias tyrimas (žmonių)",
    longestRct: "Ilgiausias tyrimas (savaičių)",
    zeroNote: "0 čia gali reikšti, kad tyrimas to nenurodė.",
    bodyIsRct: "Įrodymų visuma – atsitiktinių imčių tyrimai",
    chronic: "Ilgalaikis rezultatas",
    surrogate: "Pakaitinio žymens rezultatas",
    notReported: "nenurodyta",
    checklist: "Kontrolinis sąrašas (paties tyrimo vertinimai)",
    uncheckedNote: "Nežinoma nėra „praėjo“: tai reiškia, kad tyrimas to neįvertino.",
    sources: "Nurodyti šaltiniai",
    sourcesNote: "Kiekvienas – ID, kurį tyrimas matė paieškos ištraukoje ar modelio parašytoje puslapio santraukoje. Straipsnis neatidarytas ir joks ID nepatikrintas. Nuoroda sudaroma tik pagal ID formą.",
    noSources: "Šiam rezultatui nenurodytas joks tyrimo ID.",
    funding: "finansavimas",
    year: "metai",
    pooledIn: "jau įtraukta į",
  },
  design: { sr_ma: "sisteminė apžvalga / metaanalizė", rct: "atsitiktinių imčių tyrimas", nrct: "ne atsitiktinių imčių tyrimas", cohort: "kohortinis tyrimas", case_series: "atvejų serija", other: "kitas dizainas" },
  direction: { benefit: "nauda", none: "poveikio nėra", harm: "žala", unclear: "neaišku" },
  fundingKind: { independent: "nepriklausomas", industry: "pramonės", mixed: "mišrus", unknown: "nežinoma" },
  warnings: {
    context_only: { title: "Tik kontekstas · ne šis produktas", status: "Nevertinta", body: "Ši eilutė – įrodymai apie vieną ingredientą ar dalį, o ne apie jūsų nuskaitytą kombinaciją. Ji rodoma tik kaip fonas; nevertinama ir niekur nesumuojama." },
    blend: { title: "Daugiau nei viena veiklioji medžiaga", status: "Kombinuotas produktas" },
    other_ingredients_unknown: { title: "Kiti ingredientai neužfiksuoti", status: "Nežinoma", body: "Nuskaityme nenurodyta, ar yra kitų veikliųjų medžiagų, todėl šis tyrimas negalėjo atskirti vieno ingrediento nuo mišinio. Nieko nepriimama kaip duota." },
    servings_not_stated: { title: "Porcijų per dieną nenurodyta", status: "Paros dozė neskaičiuojama", body: "Nuskaityme neužfiksuota, kiek porcijų vartojama per dieną. Paros dozė neskaičiuojama ir viena porcija per dieną nepriimama (prielaida nedaroma)." },
    dose_not_stated: { title: "Dozė porcijai neužfiksuota", status: "Nežinoma", body: "Nuskaityme nėra dozės porcijai, todėl tyrimas negalėjo palyginti jokios dozės su tirta doze. Nieko nekonvertuojama ir nespėliojama." },
    form_not_stated: { title: "Forma nenurodyta", status: "Nežinoma", body: "Nuskaityme nėra formos (pavyzdžiui, kokia druska ar esteris), o tyrimas jos nespėlioja." },
    facts_unavailable: { title: "Nuskaitymo faktai nepasiekiami", status: "Nežinoma", body: "Šiame puslapyje nėra faktų, kuriuos gavo tyrimas, todėl formos, dozės ir porcijų patikrinti negalima." },
    no_human_controlled_trial: { title: "Nėra kontroliuojamo tyrimo su žmonėmis", status: "Šiame tyrime nė vieno nesuskaičiuota", body: "Tyrimas šiam rezultatui nesuskaičiavo nė vieno atsitiktinių imčių tyrimo su žmonėmis. Atsitiktinių imčių tyrime žmonės į gydymo ar palyginimo grupę paskirstomi atsitiktinai, kad grupes būtų galima sąžiningai palyginti. Įrodymų trūkumas šiame tyrime nėra įrodymas, kad produktas neveikia, ir nėra įrodymas, kad veikia." },
    methodology: { title: "Užfiksuoti metodikos trūkumai", status: "Pranešta paties tyrimo", body: "Tyrimas užfiksavo toliau išvardytus šio rezultato tyrimų trūkumus. Tai atskleidimai, o ne balas." },
    funding: { title: "Finansavimas ir nepriklausomumas", status: "Pranešta apie finansavimo / vienos laboratorijos požymį", body: "Kas sumokėjo už tyrimą, gali pakreipti rezultatą, bet vien finansavimas nerodo, kad rezultatas klaidingas. Tyrimas pažymėjo, kad jo suskaičiuoti teigiami įrodymai gauti tik iš pramonės finansuotų darbų arba iš vienos laboratorijos; jis nenurodo, kurio iš dviejų. Tai atskleidimas: jis nekeičia jokio balo." },
    publication: { title: "Publikavimo šališkumas", status: "Pranešta apie abejonę", body: "Publikavimo šališkumas reiškia, kad tyrimai, kurie ką nors rado, dažniau publikuojami nei tie, kurie nieko nerado, todėl ingredientas gali atrodyti geresnis, nei yra. Tyrimas užfiksavo tokią abejonę. Paieška, nerandanti jokio jos požymio, neįrodytų, kad jos nėra. Tai atskleidimas: jis nekeičia jokio balo." },
  },
  methodReasons: {
    risk_of_bias: "šališkumo rizika",
    consistency: "nenuoseklūs rezultatai",
    precision: "netikslus įvertis",
    directness: "netiesioginiai įrodymai (ne tie patys žmonės, dozė ar rezultatas)",
    one_rct: "suskaičiuotas tik vienas atsitiktinių imčių tyrimas",
    small_or_short: "geriausias suskaičiuotas tyrimas mažas arba trumpas",
    surrogate: "rezultatas – pakaitinis žymuo, o ne tai, ką žmogus junta",
  },
  reportedLead: "Paties tyrimo sakiniai, kuriuose tai minima:",
  noneReported: "Tyrimas apie tai sakinio nesaugojo, todėl detalių nerodoma. Tai nežinoma, o ne ženklas, kad abejonės nėra.",
  noWarning: "Šis tyrimas šiam rezultatui neužfiksavo jokio įspėjimo. Tai nereiškia, kad viskas gerai: ko jis neįvertino, tas nežinoma.",
  moreTitle: "Kaip atliktas šis tyrimas",
  moreLead: "Modelis, šaltiniai, prieigos ribos ir laiko žymos. Antrinė informacija; rezultatas – aukščiau.",
  moreLabels: { product: "Produktas, ingredientas, forma ir paros dozė, kuriuos nurodo tyrimas (jo formuluotė)", note: "Paties tyrimo pastaba apie prieigą (jo formuluotė)", selfConfidence: "Paties tyrimo pasitikėjimas (nepatvirtintas)", confidenceNote: "Jo pastaba apie šį pasitikėjimą (jo formuluotė)" },
};

export const RESEARCH_CARD_COPY: Record<Lang, CardCopy> = { en: EN, lt: LT };
