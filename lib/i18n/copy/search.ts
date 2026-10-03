/* Static copy for the manual "Search your supplement" form. Ingredient and form
 * labels come from the catalog and stay as they are (they are names). */
import type { Lang } from "../lang";

export interface SearchCopy {
  ingredient: string;
  placeholder: string;
  matchingList: string;
  matchesVia: (via: string) => string;
  nothingMatches: string;
  catalogCount: (n: number) => string;
  exactFormOf: (label: string) => string;
  chooseForm: string;
  hasEvidenceRun: string;
  cfuNote: string;
  convExact: string;
  convBounded: string;
  convNone: string;
  doseLegend: string;
  amount: string;
  amountPlaceholder: string;
  unit: string;
  servings: string;
  servingsPlaceholder: string;
  cfuCounted: (label: string) => string;
  doseHelp: string;
  pickIngredient: string;
  pickForm: string;
  analysing: string;
  analyse: string;
}

const EN: SearchCopy = {
  ingredient: "Ingredient",
  placeholder: "e.g. magnesium, creatine, vitamin D",
  matchingList: "Matching ingredients",
  matchesVia: (v) => `matches “${v}”`,
  nothingMatches: "Nothing in the catalog matches. Only ingredients with a vocabulary entry can be analysed.",
  catalogCount: (n) => `${n} ingredients in the catalog — the same vocabulary the label reader uses.`,
  exactFormOf: (l) => `Exact form of ${l}`,
  chooseForm: "Choose the form…",
  hasEvidenceRun: " (has an evidence run)",
  cfuNote: "Counted in CFU, not mass — the analysis runs without a dose axis.",
  convExact: "A typed dose converts exactly to the active amount.",
  convBounded: "This salt's hydration is often unstated, so a typed dose converts to a bounded range rather than one number.",
  convNone: "A dose for this form cannot be converted to an active amount, so the dose axis stays unavailable. The rest of the analysis still runs.",
  doseLegend: "Dose per serving (optional)",
  amount: "Amount",
  amountPlaceholder: "e.g. 400",
  unit: "Unit",
  servings: "Servings / day",
  servingsPlaceholder: "e.g. 1",
  cfuCounted: (l) => `${l} is counted in CFU. Leave the dose empty; the analysis runs without a dose axis.`,
  doseHelp: "Enter the compound mass as printed. Units are mg, g and mcg only — IU is not accepted because its mass depends on the substance.",
  pickIngredient: "Pick an ingredient from the list.",
  pickForm: "Pick the exact form. If the label does not say, choose the “not stated” entry.",
  analysing: "Analysing…",
  analyse: "Analyse this supplement",
};

const LT: SearchCopy = {
  ingredient: "Veiklioji medžiaga",
  placeholder: "pvz., magnis, kreatinas, vitaminas D",
  matchingList: "Tinkančios veikliosios medžiagos",
  matchesVia: (v) => `atitinka „${v}“`,
  nothingMatches: "Kataloge niekas neatitinka. Galima analizuoti tik tas medžiagas, kurios turi žodyno įrašą.",
  catalogCount: (n) => `Kataloge yra ${n} veikliųjų medžiagų — tas pats žodynas, kurį naudoja etikečių skaitytuvas.`,
  exactFormOf: (l) => `Tiksli „${l}“ forma`,
  chooseForm: "Pasirink formą…",
  hasEvidenceRun: " (turi įrodymų paleidimą)",
  cfuNote: "Skaičiuojama KFV, o ne mase — analizė vykdoma be dozės ašies.",
  convExact: "Įvesta dozė tiksliai perskaičiuojama į veikliąją medžiagą.",
  convBounded: "Šios druskos hidratacija dažnai nenurodoma, todėl įvesta dozė perskaičiuojama į ribotą intervalą, o ne į vieną skaičių.",
  convNone: "Šios formos dozės negalima perskaičiuoti į veikliosios medžiagos kiekį, todėl dozės ašis lieka neprieinama. Likusi analizė vis tiek vykdoma.",
  doseLegend: "Dozė porcijoje (nebūtina)",
  amount: "Kiekis",
  amountPlaceholder: "pvz., 400",
  unit: "Vienetas",
  servings: "Porcijos per dieną",
  servingsPlaceholder: "pvz., 1",
  cfuCounted: (l) => `${l} skaičiuojama KFV. Dozės nepildyk; analizė vykdoma be dozės ašies.`,
  doseHelp: "Įvesk junginio masę, kaip atspausdinta. Vienetai tik mg, g ir mcg — TV (IU) nepriimamos, nes jų masė priklauso nuo medžiagos.",
  pickIngredient: "Pasirink veikliąją medžiagą iš sąrašo.",
  pickForm: "Pasirink tikslią formą. Jei etiketėje nenurodyta, rinkis „nenurodyta“.",
  analysing: "Analizuojama…",
  analyse: "Analizuoti šį papildą",
};

export const SEARCH_COPY: Record<Lang, SearchCopy> = { en: EN, lt: LT };
