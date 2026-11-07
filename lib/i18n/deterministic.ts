/*
 * DETERMINISTIC LOCALIZATION of text the server builds from templates.
 *
 * No model, no network: an exact lookup of a fixed English sentence the server
 * always emits (caveats, the evidence-prior disclaimer, registry notes,
 * reasons, manual-entry validation). Anything not recognised returns null and
 * the caller falls back to the model translator (or to the original English).
 * Numbers and ranges inside a pattern are copied verbatim, never reformatted.
 * (The v14 dose-effectiveness re-rendering was removed with v14.)
 */
import type { Lang } from "./lang";

/* -------------------------------------------------------------------------- */
/*  Fixed server sentences                                                     */
/* -------------------------------------------------------------------------- */

const FIXED_LT: Record<string, string> = {
  // evidence-prior disclaimer (lib/analyze/evidence-prior.ts DISCLAIMER)
  "This section is the model's own recollection of the literature — not trials we read, checked and can quote. Treat it as orientation. It carries no grade, because a grade means 'computed from extracted trials', and the two must not look alike.":
    "Šis skyrius yra paties modelio prisiminimas apie literatūrą — ne tyrimai, kuriuos mes perskaitėme, patikrinome ir galime cituoti. Vertink tai kaip orientaciją. Jis neturi įvertinimo, nes įvertinimas reiškia „apskaičiuota iš išgautų tyrimų“, ir šių dviejų negalima painioti.",
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
};

const PATTERNS_LT: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [
    /^You typed these figures\. Nobody read them off a label\. This analysis is about the ingredient, form and dose you entered\. Nothing here checked that a real product contains them\.$/,
    () => "Šiuos skaičius įvedei tu. Niekas jų neskaitė iš etiketės. Ši analizė apie įvestą veikliąją medžiagą, formą ir dozę. Niekas čia netikrino, ar tikras produktas jų turi.",
  ],
  [
    /^This product contains more than one active ingredient\. Everything here is about (.+?) on its own\. A blend is a different question\.$/,
    (m) => `Šiame produkte yra daugiau nei viena veiklioji medžiaga. Viskas čia yra tik apie ${m[1]}. Mišinys yra kitas klausimas.`,
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
    /^You did not enter how many servings you take a day, so the dose in one serving was used\. Your daily dose may be higher\.$/,
    () => "Neįvedei, kiek porcijų vartoji per dieną, todėl naudota vienos porcijos dozė. Tavo paros dozė gali būti didesnė.",
  ],
  [
    /^The label does not say how many servings are taken a day, so the dose in one serving was used\. Your daily dose may be higher\.$/,
    () => "Etiketėje nenurodyta, kiek porcijų vartojama per dieną, todėl naudota vienos porcijos dozė. Tavo paros dozė gali būti didesnė.",
  ],
  [
    /^Reading the label used up most of the time this scan is allowed\. The literature orientation, the company profile, the ingredient compatibility check and the literature disclosures were skipped\.$/,
    () => "Etiketės skaitymas sunaudojo didžiąją dalį šiam skenavimui skirto laiko. Literatūros apžvalga, įmonės profilis, sudedamųjų dalių suderinamumo patikra ir literatūros pranešimai buvo praleisti.",
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
