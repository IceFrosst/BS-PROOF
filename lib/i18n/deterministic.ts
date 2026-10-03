/*
 * DETERMINISTIC LOCALIZATION of text the server builds from templates.
 *
 * No model, no network. Everything here is either
 *   - a pure re-rendering of a sentence from the STRUCTURED fields the server
 *     already stored next to it (dose reading, dose note), or
 *   - an exact lookup of a fixed English sentence the server always emits
 *     (caveats, the evidence-prior disclaimer, registry notes, reasons).
 * Anything not recognised returns null and the caller falls back to the model
 * translator (or to the original English). The English output of the dose
 * functions is pinned against lib/analyze/dose-effectiveness.ts by test, so the
 * two cannot drift. Numbers, units, ranges and closeness are copied from the
 * stored fields, never recomputed or reformatted.
 */
import type { Lang } from "./lang";

type NullableNumber = number | null;

/** Same formatting as lib/analyze/dose-effectiveness.ts `mg()` -- units stay mg/g. */
export function mgText(value: NullableNumber | undefined): string {
  if (value === null || value === undefined) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2).replace(/\.?0+$/, "")} g` : `${Math.round(value)} mg`;
}

export interface DoseReadingInput {
  /** The scored dose (section.scored_dose_mg). */
  dose: NullableNumber;
  benefit: { low: NullableNumber; high: NullableNumber } | null;
  nulls: { low: NullableNumber; high: NullableNumber } | null;
  productMatch: string | null;
  closeness: NullableNumber;
}

export type DoseTone = "in_range" | "below" | "above" | "unassessable";

/**
 * The sentence AFTER "<outcome>: " for one dose reading, plus its tone. The
 * branch conditions are copied verbatim from `readOutcome` in
 * lib/analyze/dose-effectiveness.ts.
 */
export function doseReadingBody(lang: Lang, input: DoseReadingInput): { body: string; tone: DoseTone } {
  const { dose, closeness, productMatch: match } = input;
  const band = input.benefit && input.benefit.low !== null ? input.benefit : null;
  const nulls = input.nulls && input.nulls.low !== null ? input.nulls : null;
  const en = lang === "en";
  const close = closeness === null ? "—" : closeness.toFixed(2);
  const bandText = band ? `${mgText(band.low)}–${mgText(band.high)}` : "";
  const nullText = nulls ? `${mgText(nulls.low)}–${mgText(nulls.high)}` : "";

  let tone: DoseTone = "unassessable";
  let body: string;
  if (dose === null) {
    body = en
      ? "your dose could not be established from the label, so the dose axis is not assessed."
      : "tavo dozės nepavyko nustatyti iš etiketės, todėl dozės ašis neįvertinta.";
  } else if (!band) {
    body = en
      ? `no trial that found a benefit carried a usable dose, so there is no range to compare ${mgText(dose)} against.` +
        (nulls ? ` Trials that found nothing were dosed at ${nullText}.` : "")
      : `nė viename tyrime, kuriame rasta nauda, nebuvo tinkamos dozės, todėl nėra intervalo, su kuriuo būtų galima palyginti ${mgText(dose)}.` +
        (nulls ? ` Tyrimuose, kuriuose nieko nerasta, dozė buvo ${nullText}.` : "");
  } else if (match === "in_band" || (closeness !== null && closeness >= 0.999)) {
    tone = "in_range";
    body = en
      ? `${mgText(dose)} sits inside the range where trials found benefit (${bandText}).`
      : `${mgText(dose)} patenka į intervalą, kuriame tyrimuose rasta nauda (${bandText}).`;
  } else if (match === "low_50_99" || match === "below_50" || (closeness !== null && dose < (band.low ?? 0))) {
    tone = "below";
    body = en
      ? `${mgText(dose)} is below the range where benefit was seen (${bandText}); closeness ${close}.`
      : `${mgText(dose)} yra žemiau intervalo, kuriame matyta nauda (${bandText}); artumas ${close}.`;
  } else if (match === "above_200" || (closeness !== null && dose > (band.high ?? Infinity))) {
    tone = "above";
    body = en
      ? `${mgText(dose)} is above the range where benefit was seen (${bandText}); more than the trials used is not evidence of more effect.`
      : `${mgText(dose)} yra aukščiau intervalo, kuriame matyta nauda (${bandText}); didesnė už tyrimuose naudotą dozė nėra didesnio poveikio įrodymas.`;
  } else {
    body = en
      ? `${mgText(dose)} against a benefit range of ${bandText}; closeness ${close}.`
      : `${mgText(dose)} lyginant su naudos intervalu ${bandText}; artumas ${close}.`;
    tone = closeness !== null && closeness >= 0.999 ? "in_range" : "unassessable";
  }
  if (nulls && tone !== "unassessable" && dose !== null && nulls.low !== null && nulls.high !== null && dose >= nulls.low && dose <= nulls.high) {
    body += en
      ? ` Note: trials dosed at ${nullText} also found nothing, so this dose is contested.`
      : ` Pastaba: tyrimuose, kuriuose dozė buvo ${nullText}, taip pat nieko nerasta, todėl ši dozė ginčytina.`;
  }
  return { body, tone };
}

export interface DoseNoteInput {
  scored_dose_basis: "daily" | "per_serving" | "none";
  per_serving_elemental_mg: NullableNumber;
  servings_per_day: NullableNumber;
  daily_elemental_mg: NullableNumber;
  scored_dose_mg: NullableNumber;
}

/** `note` of the dose-effectiveness section, re-rendered from its own stored numbers. */
export function doseNoteText(lang: Lang, s: DoseNoteInput): string {
  const en = lang === "en";
  if (s.scored_dose_basis === "daily") {
    return en
      ? `Scored on the daily dose: ${mgText(s.per_serving_elemental_mg)} per serving × ${s.servings_per_day} servings/day = ${mgText(s.daily_elemental_mg)} of active moiety. Trials report daily doses, so this is the comparable figure.`
      : `Vertinta pagal paros dozę: ${mgText(s.per_serving_elemental_mg)} porcijoje × ${s.servings_per_day} porcijų per dieną = ${mgText(s.daily_elemental_mg)} veikliosios dalies. Tyrimuose nurodomos paros dozės, todėl tai palyginamas dydis.`;
  }
  if (s.scored_dose_basis === "per_serving") {
    return en
      ? `Scored on the per-serving dose (${mgText(s.scored_dose_mg)} of active moiety) because the label does not state servings per day. If you take more than one serving, your daily dose is higher than what was scored.`
      : `Vertinta pagal vienos porcijos dozę (${mgText(s.scored_dose_mg)} veikliosios dalies), nes etiketėje nenurodyta, kiek porcijų vartojama per dieną. Jei vartoji daugiau nei vieną porciją, tavo paros dozė didesnė nei įvertintoji.`;
  }
  return en
    ? "No elemental dose could be established from the label, so the dose axis is not assessed."
    : "Iš etiketės nepavyko nustatyti veikliosios dalies dozės, todėl dozės ašis neįvertinta.";
}

/* -------------------------------------------------------------------------- */
/*  Fixed server sentences                                                     */
/* -------------------------------------------------------------------------- */

const FIXED_LT: Record<string, string> = {
  // evidence-prior disclaimer (lib/analyze/evidence-prior.ts DISCLAIMER)
  "No extraction run exists for this ingredient, so this section is the model's own recollection of the literature — not trials we read, scored and can quote. Treat it as orientation. It carries no 0–100 score because that number means 'computed from extracted trials', and the two must not look alike.":
    "Šiai veikliajai medžiagai ekstrakcijos paleidimo nėra, todėl šis skyrius yra paties modelio prisiminimas apie literatūrą — ne tyrimai, kuriuos mes perskaitėme, įvertinome ir galime cituoti. Vertink tai kaip orientaciją. Jis neturi 0–100 balo, nes šis skaičius reiškia „apskaičiuota iš išgautų tyrimų“, ir šių dviejų negalima painioti.",
  // registry note (lib/analyze/company.ts)
  "Dietary supplements are regulated as food, so recalls appear in FDA's food enforcement reports. No match means no recall is on file under this exact firm name — not that the company has a clean history.":
    "Maisto papildai reguliuojami kaip maistas, todėl atšaukimai pateikiami FDA maisto vykdymo užtikrinimo ataskaitose. „Neradome“ reiškia, kad pagal šį tikslų įmonės pavadinimą atšaukimo įrašo nėra — o ne kad įmonės istorija švari.",
  "As printed on the label. A seal is a claim until the certifier's registry confirms it.":
    "Kaip atspausdinta etiketėje. Ženklas yra teiginys, kol sertifikuotojo registras jo nepatvirtina.",
  // reasons a model section is empty
  "no model provider configured": "nesukonfigūruotas modelio tiekėjas",
  "no brand printed on the label": "etiketėje neatspausdintas prekės ženklas",
  "time budget exhausted before the compatibility call": "laiko biudžetas baigėsi prieš suderinamumo užklausą",
  "time budget exhausted before the company call": "laiko biudžetas baigėsi prieš įmonės užklausą",
  "time budget exhausted before the evidence call": "laiko biudžetas baigėsi prieš įrodymų užklausą",
  "time budget exhausted before the literature-warnings call": "laiko biudžetas baigėsi prieš literatūros įspėjimų užklausą",
  // retained-audit target strings (lib/evidence-ledger/retained-audits.ts)
  "4,000 mg (4 g) printed compound per day": "4,000 mg (4 g) atspausdinto junginio per dieną",
  "0.05 mg (50 mcg / 2000 IU) printed per day": "0.05 mg (50 mcg / 2000 IU) atspausdinta per dieną",
  "300 mg printed compound per day": "300 mg atspausdinto junginio per dieną",
  "Retained previous audit. It was not re-verified on this scan.": "Išsaugotas ankstesnis auditas. Šio skenavimo metu jis nebuvo patikrintas iš naujo.",
  "No usable interval or point estimate was retained.": "Tinkamo intervalo ar taškinio įverčio neišsaugota.",
  "Unknown.": "Nežinoma.",
};

const PATTERNS_LT: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [
    /^You typed these figures\. Nobody read them off a label\. This analysis is about the ingredient, form and dose you entered\. Nothing here checked that a real product contains them\.$/,
    () => "Šiuos skaičius įvedei tu. Niekas jų neskaitė iš etiketės. Ši analizė apie įvestą veikliąją medžiagą, formą ir dozę. Niekas čia netikrino, ar tikras produktas jų turi.",
  ],
  [
    /^This product contains more than one active ingredient\. The evidence score is about (.+?) on its own\. A blend is a different question, and this score does not answer it\.$/,
    (m) => `Šiame produkte yra daugiau nei viena veiklioji medžiaga. Įrodymų balas yra tik apie ${m[1]}. Mišinys yra kitas klausimas, į kurį šis balas neatsako.`,
  ],
  [
    /^Your dose could not be checked\. No per-serving dose was entered\.$/,
    () => "Tavo dozės nepavyko patikrinti. Dozė porcijoje neįvesta.",
  ],
  [
    /^Your dose could not be checked\. The label prints no per-serving amount for this ingredient\.$/,
    () => "Tavo dozės nepavyko patikrinti. Etiketėje neatspausdintas šios veikliosios medžiagos kiekis porcijoje.",
  ],
  [
    /^Your dose could not be checked\. The label does not say how much of this form is water, so the amount of the active ingredient in it cannot be worked out without guessing\.$/,
    () => "Tavo dozės nepavyko patikrinti. Etiketėje nenurodyta, kiek šios formos masės sudaro vanduo, todėl veikliosios medžiagos kiekio joje negalima apskaičiuoti neatspėjant.",
  ],
  [
    /^You did not enter how many servings you take a day, so the dose in one serving was scored\. Your daily dose may be higher\.$/,
    () => "Neįvedei, kiek porcijų vartoji per dieną, todėl įvertinta vienos porcijos dozė. Tavo paros dozė gali būti didesnė.",
  ],
  [
    /^The label does not say how many servings are taken a day, so the dose in one serving was scored\. Your daily dose may be higher\.$/,
    () => "Etiketėje nenurodyta, kiek porcijų vartojama per dieną, todėl įvertinta vienos porcijos dozė. Tavo paros dozė gali būti didesnė.",
  ],
  [
    /^Reading the label used up most of the time this scan is allowed\. The company profile, the ingredient compatibility check and the literature disclosures were skipped\. The evidence score is complete\.$/,
    () => "Etiketės skaitymas sunaudojo didžiąją dalį šiam skenavimui skirto laiko. Įmonės profilis, sudedamųjų dalių suderinamumo patikra ir literatūros pranešimai buvo praleisti. Įrodymų balas yra pilnas.",
  ],
  // manual-entry validators (lib/analyze/manual-dose.ts, lib/analyze/scan.ts)
  [
    /^The dose unit must be one of (.+)\. IU is not accepted — enter the mass printed beside it\.$/,
    (m) => `Dozės vienetas turi būti vienas iš: ${m[1]}. TV (IU) nepriimami — įvesk šalia atspausdintą masę.`,
  ],
  [/^The dose must be a positive number\.$/, () => "Dozė turi būti teigiamas skaičius."],
  [
    /^The dose is too large to be a per-serving amount — the form accepts up to (.+) per serving\.$/,
    (m) => `Dozė per didelė, kad būtų kiekis porcijoje — forma priima iki ${m[1]} porcijoje.`,
  ],
  [/^Servings per day must be a whole number of 1 or more, or left empty\.$/, () => "Porcijų per dieną turi būti sveikasis skaičius nuo 1 arba palik tuščią."],
  [/^Servings per day must be (\d+) or fewer\.$/, (m) => `Porcijų per dieną turi būti ne daugiau kaip ${m[1]}.`],
  [/^Pick an ingredient from the list\.$/, () => "Pasirink veikliąją medžiagą iš sąrašo."],
  [/^Pick the exact form\. If the label does not say, choose the “not stated” entry\.$/, () => "Pasirink tikslią formą. Jei etiketėje nenurodyta, rinkis „nenurodyta“."],
  [/^Expected a JSON object\.$/, () => "Tikėtasi JSON objekto."],
  [/^Pick an ingredient from the catalog\.$/, () => "Pasirink veikliąją medžiagą iš katalogo."],
  [/^Pick a form of (.+) from the catalog\.$/, (m) => `Pasirink ${m[1]} formą iš katalogo.`],
  [/^The dose must be an object with a value and a unit\.$/, () => "Dozė turi būti objektas su reikšme ir vienetu."],
  [/^(.+) is dosed in CFU, which is a count, not a mass\. Leave the dose empty\.$/, (m) => `${m[1]} dozuojama KSV — tai skaičius, o ne masė. Dozės nepildyk.`],
  // readPriorDose (lib/analyze/evidence-prior.ts): numbers/ranges are captured verbatim.
  [/^Your dose could not be read off the label, so it cannot be compared\.$/, () => "Tavo dozės nepavyko nuskaityti iš etiketės, todėl jos palyginti negalima."],
  [
    /^No effective dose range was recalled for this outcome, so there is nothing to compare against\.$/,
    () => "Šiam rezultatui veiksmingos dozės intervalas neprisimintas, todėl nėra su kuo lyginti.",
  ],
  [/^The recalled dose range is not usable, so no comparison is shown\.$/, () => "Prisimintas dozės intervalas netinkamas naudoti, todėl palyginimas nerodomas."],
  [/^(.+)\/day sits inside the range the model recalls as effective \((.+)\)\.$/, (m) => `${m[1]}/dieną patenka į intervalą, kurį modelis prisimena kaip veiksmingą (${m[2]}).`],
  [/^(.+)\/day is below the range the model recalls as effective \((.+)\)\.$/, (m) => `${m[1]}/dieną yra žemiau intervalo, kurį modelis prisimena kaip veiksmingą (${m[2]}).`],
  [
    /^(.+)\/day is above the range the model recalls as effective \((.+)\); more is not evidence of more effect\.$/,
    (m) => `${m[1]}/dieną yra aukščiau intervalo, kurį modelis prisimena kaip veiksmingą (${m[2]}); daugiau nėra didesnio poveikio įrodymas.`,
  ],
];

/**
 * Lithuanian for a sentence the server always emits verbatim, or null when the
 * text is not one of them (the caller then asks the model translator).
 * English input returns itself.
 */
export function knownServerText(lang: Lang, english: string): string | null {
  if (lang === "en") return english;
  const text = english.trim();
  const fixed = FIXED_LT[text];
  if (fixed) return fixed;
  for (const [pattern, build] of PATTERNS_LT) {
    const match = text.match(pattern);
    if (match) return build(match);
  }
  return null;
}
