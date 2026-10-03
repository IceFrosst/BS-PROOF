/* Static copy for the History tab (list, empty/error states, saved-scan opener). */
import type { Lang } from "../lang";

export interface HistoryCopy {
  yourScans: string;
  notAvailableTitle: string;
  notAvailableBody: string;
  typedSupplement: string;
  unnamedLabel: string;
  noSavedTitle: string;
  noSavedBody: string;
  goToScan: string;
  yourGoogleAccount: string;
  latest: (n: number) => string;
  typedSearch: string;
  photoScan: string;
  saved: string;
  loadingScans: string;
  couldNotLoadTitle: string;
  listNotFound: string;
  listUnavailable: string;
  listFailed: string;
  detailNotFound: string;
  detailUnavailable: string;
  detailFailed: string;
  couldNotOpen: string;
  openingSaved: string;
  statusWords: Record<string, string>;
}

const EN: HistoryCopy = {
  yourScans: "Your scans",
  notAvailableTitle: "History is not available here.",
  notAvailableBody: "Saved scans need Google sign-in, which is not set up on this deployment. Scanning still works without it.",
  typedSupplement: "Typed supplement",
  unnamedLabel: "Unnamed label",
  noSavedTitle: "No saved scans yet.",
  noSavedBody: "Scan a label or search a supplement while signed in and the result is saved here.",
  goToScan: "Go to Scan",
  yourGoogleAccount: "your Google account",
  latest: (n) => `Your latest ${n === 1 ? "scan" : `${n} scans`}. Opening one shows the saved result; nothing is re-run.`,
  typedSearch: "Typed search",
  photoScan: "Photo scan",
  saved: "Saved",
  loadingScans: "Loading your scans…",
  couldNotLoadTitle: "Could not load your history.",
  listNotFound: "Your history could not be found. Try again in a moment.",
  listUnavailable: "Scan history is unavailable right now. Try again in a moment.",
  listFailed: "Could not load your scans. Check your connection and try again.",
  detailNotFound: "That saved scan was not found. It may no longer exist.",
  detailUnavailable: "Saved scans are unavailable right now. Try again in a moment.",
  detailFailed: "That saved scan could not be opened. Try again.",
  couldNotOpen: "Could not open that scan.",
  openingSaved: "Opening your saved scan…",
  statusWords: {},
};

function ltScans(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} skenavimas`;
  if (mod10 === 0 || (mod100 >= 11 && mod100 <= 19)) return `${n} skenavimų`;
  return `${n} skenavimai`;
}

const LT: HistoryCopy = {
  yourScans: "Tavo skenavimai",
  notAvailableTitle: "Istorija čia nepasiekiama.",
  notAvailableBody: "Išsaugoti skenavimai reikalauja prisijungimo su Google, kuris šioje svetainės versijoje nesukonfigūruotas. Skenuoti vis tiek galima ir be jo.",
  typedSupplement: "Įvestas papildas",
  unnamedLabel: "Etiketė be pavadinimo",
  noSavedTitle: "Išsaugotų skenavimų dar nėra.",
  noSavedBody: "Nuskenuok etiketę arba surask papildą prisijungęs — rezultatas bus išsaugotas čia.",
  goToScan: "Eiti į Skenuoti",
  yourGoogleAccount: "tavo Google paskyra",
  latest: (n) => `${n === 1 ? "Tavo naujausias skenavimas" : `Tavo naujausi ${ltScans(n)}`}. Atidarius rodomas išsaugotas rezultatas; nieko nepaleidžiama iš naujo.`,
  typedSearch: "Įvesta paieška",
  photoScan: "Nuotraukos skenavimas",
  saved: "Išsaugota",
  loadingScans: "Kraunami tavo skenavimai…",
  couldNotLoadTitle: "Nepavyko įkelti tavo istorijos.",
  listNotFound: "Tavo istorijos nepavyko rasti. Bandyk po akimirkos.",
  listUnavailable: "Skenavimų istorija šiuo metu nepasiekiama. Bandyk po akimirkos.",
  listFailed: "Nepavyko įkelti tavo skenavimų. Patikrink ryšį ir bandyk dar kartą.",
  detailNotFound: "To išsaugoto skenavimo nerasta. Galbūt jo nebėra.",
  detailUnavailable: "Išsaugoti skenavimai šiuo metu nepasiekiami. Bandyk po akimirkos.",
  detailFailed: "Nepavyko atidaryti to išsaugoto skenavimo. Bandyk dar kartą.",
  couldNotOpen: "Nepavyko atidaryti to skenavimo.",
  openingSaved: "Atidaromas tavo išsaugotas skenavimas…",
  statusWords: {
    label_unreadable: "etiketė neperskaitoma",
    not_a_supplement_label: "ne papildo etiketė",
    ingredient_not_supported: "medžiaga nepalaikoma",
    analyzer_unavailable: "analizatorius nepasiekiamas",
    analyzer_failed: "analizatoriaus klaida",
    scored: "įvertinta",
    not_scored: "neįvertinta",
    form_not_scored: "forma neįvertinta",
  },
};

export const HISTORY_COPY: Record<Lang, HistoryCopy> = { en: EN, lt: LT };
