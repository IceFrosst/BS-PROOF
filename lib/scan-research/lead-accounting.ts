/*
 * Source-LEAD accounting for the LIVE research run: the server's recomputation of the follow-through verdict.
 *
 * MUST stay identical to pipeline/research_leads.py (the worker computes this verdict before it posts; the server
 * recomputes it from the posted receipts before it stores anything). tests/fixtures/lead-accounting-cases.json pins both,
 * including the two real shapes of the failed 2026-10-05 validation runs (one search + no page / two 403s of ONE
 * record in two locales, then an empty inventory) and the adversarial traces (a ledger that claims a request that
 * was never made, an invented address, the same blocked page in another language, an identical query repeated).
 *
 * WHAT IT IS. From the WebSearch / WebFetch requests and results of ONE run, in call order, it derives the LEADS
 * (every address a search result listed in its `Links: [...]` line, merged when they differ only by locale / tracking
 * parameters or carry the same record identifier), whether a WebFetch was REALLY requested for each, and whether the
 * model's `lead_ledger` accounts for all of them without claiming a request that was not made. It is NOT a fetch-count
 * quota, not a reading of any free text, and not a check that the science is right. Whatever the inventory holds (W1,
 * 2026-10-06), at least ONE WebFetch must have RETURNED CONTENT (`hasPageContent`); a single content-bearing page satisfies it.
 */

export const LEAD_ACCOUNTING_VERSION = "lead-accounting-v1" as const;
export const LEAD_DISPOSITIONS = ["opened", "not_opened_secondary", "not_opened_off_topic"] as const;

export const P_UNACCOUNTED = "lead_unaccounted";
export const P_UNKNOWN_ADDRESS = "ledger_unknown_address";
export const P_CLAIMS_OPEN = "ledger_claims_open_without_request";
export const P_IDENTIFIER_UNOPENED = "identifier_lead_unopened";
export const P_NO_FALLBACK = "blocked_without_independent_attempt";
export const P_EMPTY_NO_PAGE = "empty_without_any_page_request";
export const W_SAYS_UNOPENED_BUT_REQUESTED = "ledger_says_not_opened_but_requested";
export const MAX_ADDRESS_CHARS = 2000;

export type LeadEvent = {
  tool: "WebSearch" | "WebFetch";
  kind: "request" | "error" | "wall" | "refusal";
  request?: { query?: string; url?: string; prompt?: string };
  returned_text?: string;
};
export type LedgerRow = { address?: unknown; disposition?: unknown; note?: unknown };
export type LeadProblem = { code: string; address: string };
export type LeadInfo = {
  label: string;
  address: string;
  addresses: string[];
  record_ids: string[];
  from_search: boolean;
  attempted: boolean;
  outcome: "content" | "blocked" | "unattempted";
  content_via: "listed_address" | "mirror_same_record" | "model_chosen_address" | null;
  ledger: unknown[];
};
export type LeadReport = {
  version: typeof LEAD_ACCOUNTING_VERSION;
  satisfied: boolean;
  problems: LeadProblem[];
  warnings: LeadProblem[];
  summary: Record<string, number | boolean>;
  leads: LeadInfo[];
};

const ASCII_URL_RE = new RegExp(`^[\\x21-\\x7e]{8,${MAX_ADDRESS_CHARS}}$`);
const URL_RE = /^https?:\/\/([^/?#@\s]+)((?:\/[^?#\s]*)?)(?:\?([^#\s]*))?(?:#[^\s]*)?$/i;
const HOSTPORT_RE = /^([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?$/;
const LANGS = "en es fr de it pt nl sv no nb da fi pl cs sk hu ro bg el tr ru uk ar he fa hi bn th vi id ms zh ja ko ca hr sr sl lt lv et is ga cy sq mk bs ur ta te ml kn mr gu pa sw af".split(" ");
const LOCALE_RE = new RegExp(`^(?:${LANGS.join("|")})(?:[-_](?:[a-z]{2}|[a-z]{4}|[0-9]{3}))?$`, "i");
const DROP_PARAMS = new Set(["lang", "locale", "hl", "language", "lng", "fbclid", "gclid", "ref"]);

export function validAddress(url: unknown): url is string {
  return typeof url === "string" && ASCII_URL_RE.test(url) && URL_RE.test(url);
}

export function leadKey(url: unknown): string | null {
  if (!validAddress(url)) return null;
  const m = URL_RE.exec(url);
  if (!m) return null;
  const hp = HOSTPORT_RE.exec(m[1]);
  if (!hp) return null;
  let host = hp[1].toLowerCase().replace(/\.+$/, "");
  if (!host) return null;
  if (host.startsWith("www.")) host = host.slice(4);
  if (!host) return null;
  const port = hp[2];
  const portPart = port === undefined || port === "80" || port === "443" ? "" : `:${parseInt(port, 10)}`;
  let path = m[2] || "/";
  const segs = path.split("/"); // ["", first, ...]
  if (segs.length > 2 && segs[2] !== "" && LOCALE_RE.test(segs[1])) segs.splice(1, 1);
  path = segs.join("/");
  if (path.length > 1 && path.endsWith("/")) path = path.replace(/\/+$/, "") || "/";
  let query = "";
  if (m[3]) {
    const keep: string[] = [];
    for (const p of m[3].split("&")) {
      if (!p) continue;
      const name = p.split("=", 1)[0].toLowerCase();
      if (DROP_PARAMS.has(name) || name.startsWith("utm_")) continue;
      keep.push(p);
    }
    query = keep.sort().join("&");
  }
  return host + portPart + path + (query ? `?${query}` : "");
}

const LINK_VIEW_SUFFIXES = ["/full", "/pdf", "/abstract", "/fulltext", "/epdf"] as const;
const DOI_IN_URL_RE = /10\.[0-9]{4,9}\/[^\s"'<>)\]},;?#&]+/gi;
const PMID_IN_URL_RES = [
  /pubmed\.ncbi\.nlm\.nih\.gov\/([0-9]{5,9})(?![0-9])/gi,
  /ncbi\.nlm\.nih\.gov\/pubmed\/([0-9]{5,9})(?![0-9])/gi,
  /europepmc\.org\/(?:article|abstract)\/med\/([0-9]{5,9})(?![0-9])/gi,
];
const PMC_IN_URL_RE = /\bPMC[0-9]{5,9}\b/gi;
const NCT_IN_URL_RE = /\bNCT[0-9]{8}\b/gi;

export function urlRecordIds(url: unknown): string[] {
  if (!validAddress(url)) return [];
  const m = URL_RE.exec(url);
  if (!m) return [];
  const rest = ((m[2] || "") + (m[3] ? `?${m[3]}` : "")).replace(/%2f/gi, "/");
  const s = m[1] + rest;
  const ids = new Set<string>();
  for (const rx of PMID_IN_URL_RES) for (const g of s.matchAll(rx)) ids.add(`pmid:${g[1]}`);
  for (const g of s.matchAll(PMC_IN_URL_RE)) ids.add(g[0].toUpperCase());
  for (const g of s.matchAll(NCT_IN_URL_RE)) ids.add(g[0].toUpperCase());
  for (const g of rest.matchAll(DOI_IN_URL_RE)) {
    const doi = g[0].replace(/\.+$/, "").toLowerCase();
    ids.add(`doi:${doi}`);
    for (const suffix of LINK_VIEW_SUFFIXES) {
      if (doi.endsWith(suffix) && doi.length > suffix.length && doi.slice(0, -suffix.length).includes("/")) ids.add(`doi:${doi.slice(0, -suffix.length)}`);
    }
  }
  return [...ids].sort();
}

const LINKS_LINE_RE = /^Links:[ \t]*(\[[^\n]*\])[ \t]*$/gm;

export function parseLinks(text: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (typeof text !== "string") return out;
  for (const m of text.matchAll(LINKS_LINE_RE)) {
    let arr: unknown;
    try {
      arr = JSON.parse(m[1]);
    } catch {
      continue;
    }
    if (!Array.isArray(arr)) continue;
    for (const it of arr) {
      const u = it !== null && typeof it === "object" && !Array.isArray(it) ? (it as { url?: unknown }).url : undefined;
      if (typeof u === "string") {
        const t = u.trim();
        if (validAddress(t) && !seen.has(t)) {
          seen.add(t);
          out.push(t);
        }
      }
    }
  }
  return out;
}

export function normQuery(q: unknown): string {
  return String(q ?? "").split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

export function stripEcho(text: unknown, needle: unknown): string {
  const t = typeof text === "string" ? text : "";
  return typeof needle === "string" && needle ? t.split(needle).join(" ") : t;
}

const PCT_ESCAPE_RE = /%([0-9A-Fa-f]{2})/g;
const ADDRESS_DELIMITERS_RE = /[?#&=]/g;
const MAX_PCT_PASSES = 3;

/** Percent-escapes of ASCII characters (%00-%7F) decoded, nothing else: at most MAX_PCT_PASSES passes (a doubly encoded
 *  `%252F` is read too), stopping early when a pass changes nothing. A malformed or truncated escape, and every escape
 *  >= %80, stays exactly as written; never throws (unlike decodeURIComponent). A pure string rewrite: the address is never
 *  fetched, resolved or opened. Mirrors research_leads.unquote_ascii. */
export function unquoteAscii(input: string): string {
  let text = input;
  for (let pass = 0; pass < MAX_PCT_PASSES; pass++) {
    const decoded = text.replace(PCT_ESCAPE_RE, (m, h: string) => (parseInt(h, 16) < 0x80 ? String.fromCharCode(parseInt(h, 16)) : m));
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}

/** The address the model TYPED into a WebFetch, in the two forms a summariser may print an identifier from: as written, and
 *  percent-decoded with the query delimiters (? # & =) turned into spaces, so a DOI that ends at `?` / `#` / `&` is read whole.
 *  Read only for the loose own-request exclusion. Mirrors research_leads.request_address_text. */
export function requestAddressText(url: string): string {
  return `${url}\n${unquoteAscii(url).replace(ADDRESS_DELIMITERS_RE, " ")}`;
}

/** What the model itself TYPED into this call that a tool may echo or paraphrase back: the search query; or, for a WebFetch,
 *  the question (`prompt`) it put to the summariser AND the address it asked for (a page that repeats the id of its own
 *  address with a label does not thereby ground it). Mirrors research_leads.own_request_text. */
export function ownRequestText(event: LeadEvent): string {
  if (event.tool === "WebSearch") {
    const query = event.request?.query;
    return typeof query === "string" ? query : "";
  }
  const parts: string[] = [];
  const prompt = event.request?.prompt;
  const url = event.request?.url;
  if (typeof prompt === "string" && prompt) parts.push(prompt);
  if (typeof url === "string" && url) parts.push(requestAddressText(url));
  return parts.join("\n");
}

/** True for a WebFetch the tool actually ANSWERED with page content: tool WebFetch, kind `request` (an error, a cookie /
 *  captcha wall and a summariser refusal are failed tries, never content) and a non-empty returned text. A WebSearch never
 *  counts, and neither does a fetch that was only attempted. Mirrors research_leads.has_page_content. */
export function hasPageContent(event: LeadEvent): boolean {
  return event !== null && typeof event === "object" && event.tool === "WebFetch" && event.kind === "request" && typeof event.returned_text === "string" && event.returned_text.length > 0;
}

/** The returned text of one content-bearing event with the model's own request echo removed (V3 grounding): the search
 *  query, or for a WebFetch the requested address AND the model's own prompt (longer needle first, so one containing the
 *  other cannot leave a mangled remainder). A PARAPHRASED echo is not text-removable; the identifiers typed into the same
 *  call are excluded one level up (source-access-v3.ts groundedIdsV3). Mirrors research_leads.grounding_text. */
export function groundingText(event: LeadEvent): string {
  const req = event.request ?? {};
  const needles: unknown[] = event.tool === "WebSearch"
    ? [req.query]
    : [req.url, req.prompt].filter((n): n is string => typeof n === "string" && n.length > 0).sort((a, b) => b.length - a.length);
  let text: unknown = event.returned_text;
  for (const n of needles) text = stripEcho(text, n);
  return typeof text === "string" ? text : "";
}

type Node = { key: string; addresses: string[]; ids: Set<string>; from_search: boolean };
class Leads {
  nodes: Node[] = [];
  parent: number[] = [];
  keyIndex = new Map<string, number>();
  idIndex = new Map<string, number>();
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      const [lo, hi] = ra < rb ? [ra, rb] : [rb, ra];
      this.parent[hi] = lo;
    }
  }
  add(url: unknown, fromSearch: boolean): number | null {
    const k = leadKey(url);
    if (k === null) return null;
    let i = this.keyIndex.get(k);
    if (i === undefined) {
      i = this.nodes.length;
      this.keyIndex.set(k, i);
      this.nodes.push({ key: k, addresses: [], ids: new Set(), from_search: false });
      this.parent.push(i);
    }
    const node = this.nodes[i];
    const u = url as string;
    if (!node.addresses.includes(u)) node.addresses.push(u);
    if (fromSearch) node.from_search = true;
    for (const rid of urlRecordIds(u)) {
      node.ids.add(rid);
      const j = this.idIndex.get(rid);
      if (j === undefined) this.idIndex.set(rid, i);
      else this.union(i, j);
    }
    return i;
  }
  lookup(url: unknown): number | null {
    const k = leadKey(url);
    if (k === null) return null;
    const i = this.keyIndex.get(k);
    if (i !== undefined) return i;
    for (const rid of urlRecordIds(url)) {
      const j = this.idIndex.get(rid);
      if (j !== undefined) return j;
    }
    return null;
  }
}

type Comp = { label: string; addresses: string[]; ids: Set<string>; from_search: boolean; fetches: { event: number; node: number | null; kind: string; url: unknown }[]; rows: unknown[]; keys: Set<string> };

function byCodeThenAddress(a: LeadProblem, b: LeadProblem): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : a.address < b.address ? -1 : a.address > b.address ? 1 : 0;
}

export function account(eventsIn: unknown, ledgerIn: unknown, inventoryEmpty: boolean): LeadReport {
  const events = (Array.isArray(eventsIn) ? eventsIn : []) as LeadEvent[];
  const ledger = (Array.isArray(ledgerIn) ? ledgerIn : []) as LedgerRow[];
  const L = new Leads();
  const seenQueries = new Set<string>();
  const newQuery = new Map<number, boolean>();
  const fetches: { event: number; node: number | null; kind: string; url: unknown }[] = [];
  let nSearch = 0;
  events.forEach((e, i) => {
    const req = e.request ?? {};
    if (e.tool === "WebSearch") {
      nSearch++;
      const q = normQuery(req.query);
      newQuery.set(i, q !== "" && !seenQueries.has(q));
      if (q) seenQueries.add(q);
      if (e.kind === "request") for (const u of parseLinks(e.returned_text)) L.add(u, true);
    } else if (e.tool === "WebFetch") {
      const url = req.url;
      const node = typeof url === "string" ? L.add(url, false) : null;
      fetches.push({ event: i, node, kind: e.kind, url });
    }
  });

  const comps: Comp[] = [];
  const compOfRoot = new Map<number, Comp>();
  L.nodes.forEach((node, i) => {
    const r = L.find(i);
    let c = compOfRoot.get(r);
    if (!c) {
      c = { label: `L${comps.length + 1}`, addresses: [], ids: new Set(), from_search: false, fetches: [], rows: [], keys: new Set() };
      compOfRoot.set(r, c);
      comps.push(c);
    }
    for (const a of node.addresses) if (!c.addresses.includes(a)) c.addresses.push(a);
    for (const id of node.ids) c.ids.add(id);
    c.from_search = c.from_search || node.from_search;
    if (node.from_search) c.keys.add(node.key);
  });
  const fetchComp = new Map<number, string>();
  for (const f of fetches) {
    if (f.node !== null) {
      const c = compOfRoot.get(L.find(f.node))!;
      c.fetches.push(f);
      fetchComp.set(f.event, c.label);
    }
  }

  const problems: LeadProblem[] = [];
  const warnings: LeadProblem[] = [];
  const unknownSeen = new Set<string>();
  for (const row of ledger) {
    const addr = row !== null && typeof row === "object" ? row.address : undefined;
    const disp = row !== null && typeof row === "object" ? row.disposition : undefined;
    const idx = typeof addr === "string" ? L.lookup(addr) : null;
    if (idx === null) {
      const a = typeof addr === "string" ? addr : "";
      if (!unknownSeen.has(a)) {
        unknownSeen.add(a);
        problems.push({ code: P_UNKNOWN_ADDRESS, address: a.slice(0, MAX_ADDRESS_CHARS) });
      }
      continue;
    }
    compOfRoot.get(L.find(idx))!.rows.push(disp);
  }

  const leads: LeadInfo[] = [];
  for (const c of comps) {
    const content = c.fetches.filter((f) => f.kind === "request");
    const attempted = c.fetches.length > 0;
    const outcome = content.length ? "content" : attempted ? "blocked" : "unattempted";
    let via: LeadInfo["content_via"] = null;
    if (content.length) {
      via = content.some((f) => c.keys.has(leadKey(f.url) ?? "\u0000")) ? "listed_address" : c.from_search ? "mirror_same_record" : "model_chosen_address";
    }
    leads.push({ label: c.label, address: c.addresses[0], addresses: [...c.addresses], record_ids: [...c.ids].sort(), from_search: c.from_search, attempted, outcome, content_via: via, ledger: [...c.rows] });
    if (!c.from_search) continue; // an address the model chose itself needs no ledger row; it still counts as an attempt
    if (!c.rows.length) problems.push({ code: P_UNACCOUNTED, address: c.addresses[0] });
    if (c.rows.some((d) => d === "opened") && !attempted) problems.push({ code: P_CLAIMS_OPEN, address: c.addresses[0] });
    if (attempted && c.rows.some((d) => d === "not_opened_secondary" || d === "not_opened_off_topic")) warnings.push({ code: W_SAYS_UNOPENED_BUT_REQUESTED, address: c.addresses[0] });
    if (inventoryEmpty && c.ids.size && !attempted) problems.push({ code: P_IDENTIFIER_UNOPENED, address: c.addresses[0] });
    if (attempted && !content.length) {
      const lastFail = Math.max(...c.fetches.map((f) => f.event));
      let independent = false;
      for (let j = lastFail + 1; j < events.length; j++) {
        const ej = events[j];
        if (ej.tool === "WebSearch" && newQuery.get(j)) { independent = true; break; }
        if (ej.tool === "WebFetch") {
          const fc = fetchComp.get(j);
          if (fc !== undefined && fc !== c.label) { independent = true; break; }
        }
      }
      if (!independent) problems.push({ code: P_NO_FALLBACK, address: c.addresses[0] });
    }
  }
  // W1: whatever the inventory holds, at least one WebFetch must have RETURNED page content (one is enough; no quota).
  if (!events.some(hasPageContent)) problems.push({ code: P_EMPTY_NO_PAGE, address: "" });

  problems.sort(byCodeThenAddress);
  warnings.sort(byCodeThenAddress);
  const searchLeads = leads.filter((l) => l.from_search);
  const summary = {
    searches: nSearch,
    distinct_queries: seenQueries.size,
    fetches: fetches.length,
    fetches_with_content: fetches.filter((f) => f.kind === "request").length,
    fetches_failed: fetches.filter((f) => f.kind !== "request").length,
    leads: searchLeads.length,
    leads_with_content: searchLeads.filter((l) => l.outcome === "content").length,
    leads_blocked: searchLeads.filter((l) => l.outcome === "blocked").length,
    leads_unattempted: searchLeads.filter((l) => l.outcome === "unattempted").length,
    ledger_rows: ledger.length,
    inventory_empty: Boolean(inventoryEmpty),
  };
  return { version: LEAD_ACCOUNTING_VERSION, satisfied: problems.length === 0, problems, warnings, summary, leads };
}
