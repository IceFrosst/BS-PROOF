/*
 * Static UI copy for the scan flow, the search sheet, the sign-in card, the
 * workspace tabs and the page chrome. English strings are the ones the app has
 * always shown (existing tests key on them); Lithuanian is display-only.
 *
 * Lithuanian register matches the Ignas PR3 landing copy (informal "tu").
 * Anything the server or a model writes is NOT here: it is original text that
 * is translated (or left original and labelled) by lib/i18n/translate-client.ts.
 */
import type { Lang } from "../lang";

/** LT plural of "serving/porcija": 1 porcija, 2-9 porcijos, 10-20 / x0 porcijų. */
function ltPlural(n: number, one: string, few: string, many: string): string {
  if (!Number.isInteger(n)) return few;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 === 0 || (mod100 >= 11 && mod100 <= 19)) return many;
  return few;
}

export interface FlowCopy {
  // ---- workspace + page chrome ------------------------------------------
  workspaceLabel: string;
  tabScan: string;
  tabHistory: string;
  switchTo: string;
  switchShort: string;
  skipLink: string;
  methodology: string;
  primaryNav: string;
  homeLabel: string;
  footerLine1: string;
  footerLine2: string;
  // ---- camera ------------------------------------------------------------
  camera: {
    viewfinder: string;
    hint: string;
    unavailable: string;
    starting: string;
    torchOn: string;
    torchOff: string;
    shutter: string;
  };
  // ---- landing / staging -------------------------------------------------
  scanRegion: string;
  savedScanRegion: string;
  headline: string;
  subline: string;
  upload: string;
  uploadLabel: string;
  search: string;
  searchLabel: string;
  captureInputLabel: string;
  fileInputLabel: string;
  takePhoto: string;
  uploadPhoto: string;
  fileHint: string;
  signInHint: string;
  stagedAlt: string;
  scanThis: string;
  checkingSignIn: string;
  retake: string;
  chooseOther: string;
  // ---- loading -----------------------------------------------------------
  loadingTitle: string;
  loadingSub: string;
  loadingCovers: string;
  photoStages: string[];
  manualStages: string[];
  // ---- sign-in -----------------------------------------------------------
  signInScanTitle: string;
  signInScanBody: string;
  signInSearchTitle: string;
  signInSearchBody: string;
  signInHistoryTitle: string;
  signInHistoryBody: string;
  signedInAs: string;
  signOut: string;
  googleLoading: string;
  googleSigningIn: string;
  googleLoadFailed: string;
  googleExchangeFailed: string;
  googleExchangeSlow: string;
  tryAgain: string;
  sessionEnded: string;
  signedOutCleared: string;
  signedOutStopped: string;
  // ---- search sheet ------------------------------------------------------
  searchTitle: string;
  searchLede: string;
  searchClose: string;
  // ---- errors / refusals -------------------------------------------------
  couldNotScan: string;
  imageTooLarge: (mb: string) => string;
  notSetUpToSignIn: string;
  signInUnavailable: string;
  requestFailed: (status: number) => string;
  analysisCouldNotRun: string;
  couldNotReach: (detail: string) => string;
  refusalHistoryFailed: string;
  refusalHistoryUnavailable: string;
  refusalTooLarge: string;
  // ---- replay / saved ----------------------------------------------------
  savedScanFrom: string;
  savedScan: string;
  replayExplain: string;
  backToHistory: string;
  scanAnother: string;
  savedToHistory: string;
  historyUnavailableNotSaved: string;
  historySaveFailed: string;
  // ---- header ------------------------------------------------------------
  kickerCouldNot: string;
  kickerEntered: string;
  kickerLabel: string;
  kickerDidNotFinish: string;
  kickerResult: string;
  nameDidNotFinish: string;
  nameNotSupplement: string;
  namePhotoCouldNot: string;
  nameResult: string;
  nameUnnamed: string;
  subtitleTyped: string;
  subtitleLabel: string;
  typedProductEntry: string;
  photoPreviewUnavailable: string;
  heroFormLabel: string;
  labelAlt: string;
  // ---- servings ----------------------------------------------------------
  servingsPerDay: (n: number) => string;
}

export const FLOW_EN: FlowCopy = {
  workspaceLabel: "Scan workspace",
  tabScan: "Scan",
  tabHistory: "History",
  switchTo: "Lietuviškai",
  switchShort: "LT",
  skipLink: "Skip to main content",
  methodology: "Methodology",
  primaryNav: "Primary navigation",
  homeLabel: "BS Proof home",
  footerLine1: "Evidence made inspectable. Scores are not medical advice.",
  footerLine2: "BS Proof · retained laboratory artifacts",
  camera: {
    viewfinder: "Live camera viewfinder",
    hint: "Fill the frame · avoid glare",
    unavailable: "Camera unavailable — upload a photo instead.",
    starting: "Opening the camera…",
    torchOn: "Turn the flashlight on",
    torchOff: "Turn the flashlight off",
    shutter: "Take a photo",
  },
  scanRegion: "Scan a supplement",
  savedScanRegion: "Saved scan",
  headline: "Does your Supplement actually work?",
  subline: "Scan and see.",
  upload: "Upload",
  uploadLabel: "Upload a photo",
  search: "Search",
  searchLabel: "Search your supplement",
  captureInputLabel: "Photograph the label with the camera",
  fileInputLabel: "Choose an image of the label",
  takePhoto: "Take a photo",
  uploadPhoto: "Upload a photo",
  fileHint: "PNG, JPEG or WebP, up to 12 MB.",
  signInHint: "Results need a Google sign-in. You can take or upload a photo first.",
  stagedAlt: "The label you staged for analysis",
  scanThis: "Scan this label",
  checkingSignIn: "Checking your sign-in…",
  retake: "Retake photo",
  chooseOther: "Choose a different image",
  loadingTitle: "Checking your supplement",
  loadingSub: "Usually about 10 seconds.",
  loadingCovers: "This check covers",
  photoStages: ["Reading the label", "Checking your dose", "Comparing with clinical trials", "Checking safety records", "Looking up the brand"],
  manualStages: ["Checking your dose", "Comparing with clinical trials", "Looking up what is known"],
  signInScanTitle: "Sign in to scan this label",
  signInScanBody: "Results are saved to your Google account so you can find them again in History. Your photo stays on this device until you scan.",
  signInSearchTitle: "Sign in to search",
  signInSearchBody: "Results are saved to your Google account so you can find them again in History.",
  signInHistoryTitle: "Sign in to see your history",
  signInHistoryBody: "Your saved scans belong to your Google account, so they only show once you are signed in.",
  signedInAs: "Signed in as",
  signOut: "Sign out",
  googleLoading: "Loading Google sign-in…",
  googleSigningIn: "Signing you in…",
  googleLoadFailed: "Google sign-in did not load. Check your connection, turn off any blocker for accounts.google.com, then try again.",
  googleExchangeFailed: "Google accepted you, but sign-in did not finish. Use the Google button to try again.",
  googleExchangeSlow: "Sign-in is taking longer than expected. Wait a moment, or use the Google button to try again.",
  tryAgain: "Try again",
  sessionEnded: "Your session ended. Sign in again to continue.",
  signedOutCleared: "You signed out, so the last result was cleared from this screen.",
  signedOutStopped: "You signed out, so the scan in progress was stopped.",
  searchTitle: "Search your supplement",
  searchLede: "Pick the ingredient and its exact form, add the dose if you know it — the result is marked as typed, not read from a label.",
  searchClose: "Close search",
  couldNotScan: "Could not scan that.",
  imageTooLarge: (mb) => `That image is ${mb} MB. The limit is 12 MB.`,
  notSetUpToSignIn: "This page is not set up to sign in, but scanning here needs a signed-in account. Try again later.",
  signInUnavailable: "Sign-in is unavailable right now, so this scan could not run. Try again in a few minutes.",
  requestFailed: (status) => `Request failed (${status}).`,
  analysisCouldNotRun: "The analysis could not run.",
  couldNotReach: (detail) => `Could not reach the analyzer: ${detail}`,
  refusalHistoryFailed: "The scan finished, but this site could not save it, and it only shows results it can save. Nothing is wrong with your photo or your account. Please try again in a few minutes.",
  refusalHistoryUnavailable: "Scanning is paused because saving results is not working on this site right now. Nothing was scanned and nothing is wrong with your photo or your account. Please try again later.",
  refusalTooLarge: "That request is too large for this site. Use a smaller photo, or a shorter typed entry, and try again.",
  savedScanFrom: "Saved scan from",
  savedScan: "Saved scan.",
  replayExplain: "This is the result as it was stored. Nothing was re-run and no new research was done for this view.",
  backToHistory: "Back to history",
  scanAnother: "Scan another",
  savedToHistory: "Saved to your history.",
  historyUnavailableNotSaved: "History is unavailable right now, so this result was not saved.",
  historySaveFailed: "Saving this result to your history failed. It will not appear in History.",
  kickerCouldNot: "Could not scan that",
  kickerEntered: "What you entered",
  kickerLabel: "What the label says",
  kickerDidNotFinish: "Scan did not finish",
  kickerResult: "Result",
  nameDidNotFinish: "Scan did not finish",
  nameNotSupplement: "Not a supplement label",
  namePhotoCouldNot: "Photo could not be analysed",
  nameResult: "Result",
  nameUnnamed: "Unnamed product",
  subtitleTyped: "What you entered · source supplied by you",
  subtitleLabel: "What the label says",
  typedProductEntry: "Typed product entry",
  photoPreviewUnavailable: "Photo preview unavailable",
  heroFormLabel: "FORM",
  labelAlt: "The label you scanned",
  servingsPerDay: (n) => `${n} serving${n === 1 ? "" : "s"} a day`,
};

export const FLOW_LT: FlowCopy = {
  workspaceLabel: "Skenavimo erdvė",
  tabScan: "Skenuoti",
  tabHistory: "Istorija",
  switchTo: "English",
  switchShort: "EN",
  skipLink: "Pereiti prie pagrindinio turinio",
  methodology: "Metodika",
  primaryNav: "Pagrindinė naršymo juosta",
  homeLabel: "BS Proof pradžia",
  footerLine1: "Įrodymai, kuriuos galima patikrinti. Balai nėra medicininis patarimas.",
  footerLine2: "BS Proof · išsaugoti laboratoriniai artefaktai",
  camera: {
    viewfinder: "Gyvas kameros vaizdas",
    hint: "Užpildyk rėmelį · venk atspindžių",
    unavailable: "Kamera nepasiekiama — įkelk nuotrauką.",
    starting: "Atidaroma kamera…",
    torchOn: "Įjungti žibintuvėlį",
    torchOff: "Išjungti žibintuvėlį",
    shutter: "Fotografuoti",
  },
  scanRegion: "Skenuoti papildą",
  savedScanRegion: "Išsaugotas skenavimas",
  headline: "Ar tavo papildas tikrai veikia?",
  subline: "Nuskenuok ir pamatyk.",
  upload: "Įkelti",
  uploadLabel: "Įkelti nuotrauką",
  search: "Ieškoti",
  searchLabel: "Ieškoti papildo",
  captureInputLabel: "Nufotografuoti etiketę kamera",
  fileInputLabel: "Pasirinkti etiketės nuotrauką",
  takePhoto: "Fotografuoti",
  uploadPhoto: "Įkelti nuotrauką",
  fileHint: "PNG, JPEG arba WebP, iki 12 MB.",
  signInHint: "Rezultatams reikia prisijungti su Google. Nuotrauką gali pasiimti ar įkelti ir anksčiau.",
  stagedAlt: "Etiketė, paruošta analizei",
  scanThis: "Skenuoti šią etiketę",
  checkingSignIn: "Tikrinama tavo prisijungimo būsena…",
  retake: "Fotografuoti iš naujo",
  chooseOther: "Pasirinkti kitą nuotrauką",
  loadingTitle: "Tikriname tavo papildą",
  loadingSub: "Paprastai apie 10 sekundžių.",
  loadingCovers: "Šis patikrinimas apima",
  photoStages: ["Skaitome etiketę", "Tikriname dozę", "Lyginame su klinikiniais tyrimais", "Tikriname saugumo įrašus", "Ieškome gamintojo"],
  manualStages: ["Tikriname dozę", "Lyginame su klinikiniais tyrimais", "Ieškome, kas žinoma"],
  signInScanTitle: "Prisijunk, kad nuskenuotum šią etiketę",
  signInScanBody: "Rezultatai išsaugomi tavo Google paskyroje, todėl vėliau gali juos rasti Istorijoje. Nuotrauka lieka tavo įrenginyje, kol nuskenuoji.",
  signInSearchTitle: "Prisijunk, kad galėtum ieškoti",
  signInSearchBody: "Rezultatai išsaugomi tavo Google paskyroje, todėl vėliau gali juos rasti Istorijoje.",
  signInHistoryTitle: "Prisijunk, kad pamatytum istoriją",
  signInHistoryBody: "Išsaugoti skenavimai priklauso tavo Google paskyrai, todėl jie rodomi tik prisijungus.",
  signedInAs: "Prisijungta kaip",
  signOut: "Atsijungti",
  googleLoading: "Kraunamas prisijungimas su Google…",
  googleSigningIn: "Jungiama…",
  googleLoadFailed: "Prisijungimas su Google neįsikrovė. Patikrink ryšį, išjunk accounts.google.com blokavimą ir bandyk dar kartą.",
  googleExchangeFailed: "Google tave priėmė, bet prisijungimas nebaigtas. Bandyk dar kartą paspausdamas Google mygtuką.",
  googleExchangeSlow: "Prisijungimas trunka ilgiau nei tikėtasi. Palauk akimirką arba bandyk dar kartą paspausdamas Google mygtuką.",
  tryAgain: "Bandyti dar kartą",
  sessionEnded: "Tavo sesija baigėsi. Prisijunk dar kartą, kad tęstum.",
  signedOutCleared: "Atsijungei, todėl paskutinis rezultatas pašalintas iš šio ekrano.",
  signedOutStopped: "Atsijungei, todėl vykstantis skenavimas sustabdytas.",
  searchTitle: "Ieškoti papildo",
  searchLede: "Pasirink veikliąją medžiagą ir tikslią jos formą, pridėk dozę, jei ją žinai — rezultatas bus pažymėtas kaip įvestas, o ne nuskaitytas iš etiketės.",
  searchClose: "Uždaryti paiešką",
  couldNotScan: "Nepavyko nuskenuoti.",
  imageTooLarge: (mb) => `Šis paveikslėlis yra ${mb} MB. Riba — 12 MB.`,
  notSetUpToSignIn: "Šiame puslapyje prisijungimas nesukonfigūruotas, bet čia skenuoti galima tik prisijungus. Bandyk vėliau.",
  signInUnavailable: "Prisijungimas šiuo metu nepasiekiamas, todėl skenavimo atlikti nepavyko. Bandyk po kelių minučių.",
  requestFailed: (status) => `Užklausa nepavyko (${status}).`,
  analysisCouldNotRun: "Analizės atlikti nepavyko.",
  couldNotReach: (detail) => `Nepavyko pasiekti analizatoriaus: ${detail}`,
  refusalHistoryFailed: "Skenavimas baigtas, bet svetainė jo neišsaugojo, o ji rodo tik tuos rezultatus, kuriuos gali išsaugoti. Su tavo nuotrauka ar paskyra viskas gerai. Bandyk dar kartą po kelių minučių.",
  refusalHistoryUnavailable: "Skenavimas sustabdytas, nes šiuo metu svetainėje neveikia rezultatų išsaugojimas. Nieko nenuskenuota, o su tavo nuotrauka ar paskyra viskas gerai. Bandyk vėliau.",
  refusalTooLarge: "Ši užklausa per didelė šiai svetainei. Naudok mažesnę nuotrauką arba trumpesnį įvestą aprašą ir bandyk dar kartą.",
  savedScanFrom: "Išsaugotas skenavimas,",
  savedScan: "Išsaugotas skenavimas.",
  replayExplain: "Tai rezultatas tokia forma, kokia jis buvo išsaugotas. Nieko nebuvo paleista iš naujo ir šiam vaizdui jokių naujų tyrimų neatlikta.",
  backToHistory: "Atgal į istoriją",
  scanAnother: "Skenuoti kitą",
  savedToHistory: "Išsaugota tavo istorijoje.",
  historyUnavailableNotSaved: "Istorija šiuo metu nepasiekiama, todėl šis rezultatas neišsaugotas.",
  historySaveFailed: "Nepavyko išsaugoti šio rezultato istorijoje. Jo Istorijoje nebus.",
  kickerCouldNot: "Nepavyko nuskenuoti",
  kickerEntered: "Ką įvedei",
  kickerLabel: "Ką sako etiketė",
  kickerDidNotFinish: "Skenavimas nebaigtas",
  kickerResult: "Rezultatas",
  nameDidNotFinish: "Skenavimas nebaigtas",
  nameNotSupplement: "Tai nėra papildo etiketė",
  namePhotoCouldNot: "Nuotraukos išanalizuoti nepavyko",
  nameResult: "Rezultatas",
  nameUnnamed: "Produktas be pavadinimo",
  subtitleTyped: "Ką įvedei · šaltinis — tu",
  subtitleLabel: "Ką sako etiketė",
  typedProductEntry: "Įvestas produktas",
  photoPreviewUnavailable: "Nuotraukos peržiūra nepasiekiama",
  heroFormLabel: "FORMA",
  labelAlt: "Etiketė, kurią nuskenavai",
  servingsPerDay: (n) => `${n} ${ltPlural(n, "porcija", "porcijos", "porcijų")} per dieną`,
};

export const FLOW_COPY: Record<Lang, FlowCopy> = { en: FLOW_EN, lt: FLOW_LT };
