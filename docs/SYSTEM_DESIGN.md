# BS-PROOF scan — system design

**Status:** implemented 2026-09-07 (founder: "a finalized version of the product
where users scan a supplement and they get a result through deepseek api …
analyzes all parts of a background of the supplement: dose effectiveness,
company background, supplement type compatibility"). This document is the
design; the code is `lib/analyze/scan.ts` and its stage modules.

**Amended 2026-09-15 (founder-approved option 1):** `/scan` is a pure-white,
phone-first page where scanning owns the first viewport, and a second way in —
**"Search for your supplement"** — feeds the same stages 1–5 with a TYPED
ingredient × form × dose. §1a, §3a and §5 describe it. `/` remains the waitlist;
`/tester` is unchanged.

## 1. What the user gets

One photo of a Supplement Facts panel → one page, five blocks, each stamped
with **where it came from**:

| block | question it answers | source (basis) |
|---|---|---|
| What the label says | ingredient, form, dose, servings, actives, seals, brand, manufacturer | `label` — as printed |
| Does it work? | per outcome: 0–100 headline with its four arcs and verdict | `evidence_run` — retained scored run |
| What the literature says | *fallback when no run exists:* per outcome direction, strength of the literature, effective daily dose range, recalled pooled effect | `model_prior` — estimate, no score |
| Is your dose the dose that worked? | your daily dose vs the range where trials found benefit, and where they found nothing | `evidence_run` + `label` |
| Does the form and the mix hold up? | is your form the scored form; cited form notes; pairwise interactions among the actives | `evidence_run`, `curated_table`, `model_prior` |
| Who makes it, and what is on record? | printed seals; FDA recalls on file; the model's profile of the company, including a conservative MLM / direct-selling read (§1b) | `label`, `registry`, `model_prior` |
| Is the literature behind it trustworthy to read? | funding independence and publication bias, shown ONLY as a disclosure, never a score change (§1c) | `model_prior` |

Only the evidence run produces a **number**. Everything else qualifies.

### 1a. The manual path — "Search for your supplement" (2026-09-15)

For a person without the tub in front of them (or a label the reader cannot
parse), the page offers an expandable search below an "or" divider:

1. **Ingredient** — an accessible combobox over a **catalog derived on the
   server from `vocab/form.json`** (`lib/analyze/catalog.ts`, handed to the
   client as a prop and exposed by `GET /api/scan` as `catalog`). Search matches
   ingredient labels, ids, aliases and form labels/aliases, so "bisglycinate" or
   "Magtein" finds magnesium. Only vocabulary ingredients can be picked: a
   product outside it has no scorer, no conversion and no curated ladder.
2. **Exact form** — a required select over that ingredient's vocabulary forms,
   with the `*_unspecified` "not stated" entry offered last. No default: a
   pre-selected salt would be a guess typed on the user's behalf.
3. **Dose per serving (optional)** — a number and a unit from **mg, g, mcg
   only**, plus optional servings/day. **IU is refused**: its mass equivalent
   depends on the substance (40 IU D3 = 1 mcg; 1 IU vitamin E = 0.67 or 0.9 mg
   depending on the form), so accepting it would mean inferring a conversion
   (invariant 5). A CFU-counted ingredient (probiotics) takes no mass dose.
   Servings/day is a positive whole number. Both fields carry a **form sanity
   ceiling** (`lib/analyze/manual-dose.ts`: 100,000 mg per serving, 24
   servings/day, checked by the same function on the client and in
   `validateManualInput`) so an overflowing or absurd number cannot reach the
   scorer — input hygiene, not a dose judgement, and not a scoring constant.

The result is the same `ScanAnalysisV1`, with `source: "manual"`, an `input`
block echoing what was typed under basis **`user_input`**, no `label` block, no
read confidence, no quoted spans, no vision model, and a standing caveat
`typed_not_verified`. The UI keys off `source`, so typed figures render under
"What you entered · Typed by you" and can never be typeset as a label read.
Typed and photographed entries of the same tub produce identical `product`,
`evidence` and `dose_effectiveness` blocks (pinned in `tests/scan-manual.test.ts`).

**Camera (superseded 2026-09-16 -- see §1d below).** The 2026-09-15 text here
said "Take a photo" was a plain `<input type="file" capture="environment">`
because production sent `Permissions-Policy: camera=()`, which blocks
`getUserMedia` outright, so an in-page viewfinder could never open. That is no
longer true: the founder asked for a live camera viewfinder matching
https://bsproof.lovable.app, `vercel.json` now sends `camera=(self)`, and
`/scan` opens a real `getUserMedia` feed. The `capture="environment"` file
input is KEPT, unconditionally mounted, as the fallback for insecure
contexts, denial, or a browser with no `getUserMedia` at all -- §1d.

**Every supplement gets an answer** (founder 2026-09-08: "even if you don't
[have a retained run], do the analysis through the system prompt of the API
itself"). A retained run always wins. Today exactly one product has one —
creatine monohydrate — so in practice most scans take the fallback: stage 2b
asks the model what the published literature says and renders it as a marked
estimate. It works for ingredients outside the vocabulary too, so an unknown
botanical still returns an orientation, a compatibility read and a company
background instead of a dead end.

**Why the fallback carries no 0–100.** That number means "50 + signed/2,
discounted by applicability, computed from extracted trials each carrying a
quoted span". Minting one from recollection would make an estimate and a
measurement indistinguishable on screen, which is the failure the whole project
exists to prevent. The fallback instead reports, per outcome, a **direction**
(benefit / no effect / harm / insufficient) and the **strength of the
literature** behind it (strong / moderate / limited / none) — two facts a model
can honestly recall, and which separate "large well-replicated null" from
"three small trials pointing up". The dose comparison stays deterministic: the
model supplies the effective range, and `dose.doseFactorFor` — the same pinned
ramp the scored path uses — places the label's dose against it.

### 1b. Company background: MLM / direct-selling disclosure (2026-09-16)

The company MODEL profile (`CompanyProfile.business_model`, `schemas/company.json`,
`prompts/company.md`, `COMPANY_PROMPT_VERSION` bumped to `company-v1.1`, and to `company-v1.2` on
2026-09-16 when the prompt gained the shared plain-language rule) now
carries a conservative read of whether the company is structured as MLM /
direct-selling: `confirmed_mlm`, `suspected_mlm`, `no_evidence` or `unknown`,
each with a short factual `basis` and a `confidence`. `unknown` is the
mandatory default whenever the model is not sure — never guessed toward
`no_evidence` for an unrecognised brand, the same discipline as every other
model-prior field in this system.

**This is never a legal judgement and never a claim about the product.** The
field is titled "MLM / direct-selling business model", never "pyramid
scheme" or anything implying illegality — direct selling is a lawful, common
structure, and a company's distribution model is a completely separate
question from whether the ingredient it sells has evidence behind it. Both
facts are shown; neither is allowed to colour the other.

`lib/analyze/business-model.ts` holds the field's TYPE and the pure
`businessModelDisclosure()` rendering decision, deliberately split out of
`lib/analyze/company.ts` (which imports `node:fs` to read the prompt) so the
client component `components/scan-flow.tsx` can import the decision without
pulling a filesystem import into the browser bundle. `confirmed_mlm` /
`suspected_mlm` render the SAME warning visual language already used
elsewhere on this page for disclosures (`.la-alert.la-alert-warn` — the
caveats list and the run-validity banner in the evidence section), captioned
"Model knowledge — unverified" and "does not affect the evidence score".
`no_evidence` / `unknown` render nothing at all (founder: "only show the mlm
if confirmed or suspected"). **Placement amended 2026-09-16 (§1e):** the row now
lives in the single "Before you read the score" stack above the first number,
and the company profile carries a one-line pointer to it; class, role, wording
and the render-only-on-concern rule are unchanged. The field is invisible to scoring: `tests/company-business-
model.test.ts` proves two runs identical except for `business_model` produce
byte-identical `product`/`evidence`/`dose_effectiveness` output, and that no
scoring source file (Python or TypeScript) even mentions it.

### 1c. Literature disclosures: funding & independence, publication bias (2026-09-16)

The founder wanted two further disclosures "decided by the system prompt", the
same way as §1b's MLM read: **funding & independence** (does industry or a
named trade body dominate the trial base for this ingredient, or a specific
brand fund most of the positive trials) and **publication bias** (does the
published record show a documented small-study / funnel-plot-asymmetry
signal). New module `lib/analyze/literature-warnings.ts`
(`prompts/literature_warnings.md`, `schemas/literature_warnings.json`, own
cache domain `LITERATURE_WARNINGS_PROMPT_VERSION = "literature-warnings-v1.0"`,
bumped to `"literature-warnings-v1.1"` on 2026-09-16 for the plain-language rule)
asks per ingredient/form; each topic answers `concern` | `no_concern` |
`unknown`, with `unknown` mandatory whenever the model is not sure and
`concern` requiring a SPECIFIC, named reason -- never a vague impression that
"supplement research is often industry-funded".

**A `concern` is a disclosure, never a verdict.** It says who funded the
evidence or what the published record looks like; it never claims a result is
wrong, invalid or fabricated, and it never enters the evidence score, an arc or
a dose band -- the same rule invariant closed for the design-lab prototype on
2026-09-11 ("funding and publication bias are clickable disclosure warnings and
no longer touch any number"), now applied to the live `/scan` page instead of a
scoring penalty.

The TYPE and the pure rendering decision (`literatureDisclosures`) live in the
new, browser-safe `lib/analyze/literature-disclosures.ts` -- same split as
`business-model.ts` / `company.ts`, so the client component never pulls a
filesystem import into the bundle. Only `concern` renders anything, as a
`.la-alert.la-alert-warn` box (`role="note"`) titled "Funding & independence"
or "Publication bias", captioned "Model knowledge — unverified", stating the
basis, listing recalled funders/signals and the model's confidence, and
explicit that it does not affect the evidence score; `no_concern`, `unknown`
and every unavailable/skipped state render nothing. The two topics are
independent -- a product can show one, both, or neither. Rendered on `/scan`
immediately under the caveat warnings, before the Evidence section, because
these disclosures concern the evidence AS A WHOLE rather than one outcome.

**Runs for every scan**, not just the fallback path: scored, not-scored and
ingredient-not-supported all get it, in parallel with stages 2b/4/5 under the
same time-budget gating (`MIN_MODEL_BUDGET_MS`/`MAX_TEXT_CALL_MS`), and it
degrades to `unavailable` on its own like every other model section. Tests:
`tests/literature-warnings.test.ts` (schema/defaults, the pure rendering
decision, orchestration on all three scan paths, a byte-identical pin of
`product`/`evidence`/`dose_effectiveness` with the section present or
unavailable, a time-budget skip, and a source-text check that no scoring file
mentions it) and `tests/literature-warnings-render.test.tsx` (the rendered
page, confirming neither "fraud" nor "fabricated" ever appears).

### 1d. The camera-first redesign (2026-09-16)

Founder: "use your eyes" -- match the look of https://bsproof.lovable.app.
`/scan` became a page where a LIVE camera viewfinder owns most of the first
viewport. **Same day, second pass (founder: "make the background white and
scientific like before"):** the PAGE is back to the pure-white ground of
2026-09-15 -- white header, ink type, grey hints -- and only the viewfinder
block is dark. Also removed on this page at the founder's request: the
header's Methodology link (hidden via `body:has(.scan-page) .site-header
nav`), the staged-file name/size hint, and the "Only the evidence run
produces a number…" footer line. These are the founder-specified differences
from the reference:

- **Live camera, not the platform camera app.** `components/scan-camera.tsx`
  requests `getUserMedia({video:{facingMode:{ideal:"environment"}},
  audio:false})` the moment nothing is staged and shows the feed in one big
  rounded (24px) block -- 3:4 portrait under 640px, 16:9 at or above it -- with
  a top-to-transparent dark gradient overlay carrying the scan mark, the
  wordmark, the page's single `<h1 id="scan-title">` ("Does your Supplement
  actually work?") and a subline ("Scan and see."). A big round shutter under
  the block captures a frame via canvas (`lib/camera/capture.ts`,
  `maxLongEdge` 2048, JPEG quality 0.92) and hands it to the SAME `stageFile`
  path a picked file already used, so the multipart `POST /api/scan` upload is
  unchanged. The stream stops on capture, on unmount and when the tab is
  hidden, and restarts whenever the block should be active again (clearing
  the staged file, i.e. "Scan another"). Denial / no API / insecure context
  all collapse to one calm fallback message in the block, and the ORIGINAL
  `capture="environment"` file input stays mounted underneath as the recovery
  path -- nothing regresses for a browser or permission state that cannot
  open a live stream.
- **`vercel.json`'s `Permissions-Policy` changed `camera=()` -> `camera=(self)`**
  (every other directive unchanged) -- production was blocking `getUserMedia`
  outright before this change; see §1a above, which is now superseded.
- **"Search your supplement" moved above the block** as a full-width pill
  button, opening `<SearchSheet>` (`components/search-sheet.tsx`) -- an
  accessible dialog (`role="dialog"`, `aria-modal`, a focus trap, Escape and
  backdrop-click to close) around the unchanged `<SupplementSearch>` --
  instead of the 2026-09-15 inline expand/collapse panel below the capture
  buttons. The "or" divider is gone.
- **Results kept their 2026-09-15 rendering at this point** (every section, badge
  and yellow warning from §1/§1a/§1b/§1c, on light cards). **Superseded the same
  day by the design pass in §1e**, which also returned `app/manifest.ts`'s
  `background_color` to white to match the page (`theme_color` unchanged;
  `tests/pwa.test.ts` pins both).
- **Google sign-in is required for results where it is configured, and `/scan` is two tabs (Scan | History)** -- see §6 and §7 below. (2026-10-03: this replaces the 2026-09-16 "sign-in while results load" card.)

### 1e. The phone-first design system and the result STATE (2026-09-16, design pass)

Founder: "make design coherent, simplistic but look scientific … world class,
not vibecoded … phone optimised." Full plan, tokens, wireframe and the list of
template tells removed: `docs/design/2026-09-16-scan-design-system.md`;
before/after phone screenshots: `docs/design/ref/before/`, `docs/design/ref/after/`
(both 390 and 360 wide, every state, plus consecutive viewport tiles of the
result). Nothing in `lib/analyze/**`, `app/api/**`, a prompt, a schema or a
scoring constant changed; this is `components/scan-flow.tsx`,
`components/supplement-search.tsx` (one option label), `app/globals.css`
(everything from the `/scan` block on, scoped to `.scan-page` / `.sc-*` /
`.scan-*` — shared `.la-*` rules are untouched and get `.scan-page .la-*`
overrides), `app/manifest.ts` (`background_color` back to white, pinned by
`tests/pwa.test.ts`) and `scripts/design_shots.mjs`.

**The page is a state machine and each state owns the viewport.** `landing →
staged → loading → result | error`, with `Scan another` returning to
`landing`. The bug this fixes: after a scan finished, the staged photo and its
three buttons stayed at the top and the report rendered below the fold with no
transition, so people reported "no results after photo". Now, the instant an
answer (or an error) lands, the capture chrome unmounts, a compact
**scanned-product header** (56px thumbnail of the photo — or an `Aa` chip for a
typed entry — kicker, product name, brand, `Scan another`) takes the top, and
focus + scroll move to it (`scrollIntoView`, instant under
`prefers-reduced-motion`). `Scan another` is repeated as a full-width button at
the very end of the report, so the primary action is thumb-reachable at both
ends; nothing is sticky, so nothing covers content. The **loading** state is a
progress panel (dimmed thumbnail, indeterminate bar, the stage list with the
current step marked) — never a disabled "Scanning…" pill. (The 2026-09-16
Google "Save your result" card is gone: where sign-in is configured a scan is
not sent until a person is signed in, so nothing asks for a login mid-load; §7.)

**The report** is a lab-grade evidence read, left-aligned, sections separated by
1px rules rather than boxed. In order: the one-line facts summary
("Creatine monohydrate, 5 g compound per serving, 4.4 g active, 1 serving a
day." with its `As printed` / `Typed by you` badge; read confidence, quoted
spans and the full definition list under a `Label details` / `Entry details`
`<details>`); **"Before you read the score"** — ONE stack holding the run-validity
banner (always open, load-bearing, always above the first number) and then the
caveats, the funding / publication-bias disclosures (§1c) and the MLM disclosure
(§1b, moved here from the company profile, which now carries a one-line pointer
to it) as one-line rows whose full text opens in a native `<details>`; every row
still carries the `la-alert la-alert-warn` class and `role="note"`/`aria-label`
the tests key on, and rows still render ONLY for concern/confirmed/suspected.
Then **Does it work?** — one card per outcome: name, verdict word, the 0–100
composite as the page's single bold moment (40px), and the **four arcs as stacked,
prominent full-width tracks**. Each dimension has a label / directional verdict /
coverage header above its own 10px track; the effect, form and dose values are the
arc `verdict` fields, never form strength or dose closeness. Invariant 8: every
verdict stays with its coverage, and an arc at 0% coverage gets a striped track
and the words "0% · untested", so `0.00 @ 0%` and `−0.70 @ 100%` cannot render
alike across effect, form or dose (pinned in `tests/scan-result-state.test.tsx`).
Trials, applicability, form basis and dose match follow as a footnote line. Dose,
form-and-mix and company sections keep every fact; the model's recalled company
facts (founded, HQ, ownership, third-party testing, COA, confidence, reputation
notes, caveats) sit under a `<details>` inside the dashed model-knowledge card.
The badge legend and a **Technical details** block (how the numbers were
produced + the retained run's parameters, models, per-stage timings, prompt
versions, `run_id`, `app_version`, persistence status, a link to /methodology)
close the report, both collapsed. Measured on the rich photo fixture after the
stacked-track preview: **9911 → 5227 px at 390 wide, 10424 → 5445 px at 360**
(about −47% / −48%), no horizontal overflow at either width, with the composite
visible on the second screen.

**Tokens** (scoped to `.scan-page`): one neutral ramp (`#fff` ground, `#f3f5f4`
tint, `#dde1df` line, `#5a6660` muted text, `#16231d` ink), plus `#0b6b5a`
**measured** and `#885a00` **unverified / read with care** for their existing
semantic roles. The four evidence tracks use restrained teal / blue / coral /
gold identities as scanning aids only; their written labels, signed verdicts and
coverage carry the meaning. Cream (`--paper`, `--white: #fffdf8`) and card shadows
remain absent from the report (the viewfinder keeps its one shadow). Type: the system stack
already loaded in `layout.tsx`, scale 13 / 15 / 17 / 22 / 28 / 40, sentence case
everywhere, tabular numerals in every column, prose capped at 62ch. One 12px
radius for contained things. All targets ≥ 44px; `env(safe-area-inset-bottom)`
on the page bottom, footer and sheet. axe (wcag2a/aa, 2.1, 2.2) reports zero
violations on landing, sheet, staged, loading and result (collapsed and with
every `<details>` open) at Pixel 7 width; the hidden file inputs gained
`aria-label`s so they are labelled in every state.

**Badges** are one quiet outlined family in sentence case (`Evidence run`,
`Public registry`, `Curated & cited`, `As printed`, `Typed by you`); **Model
knowledge** alone is dashed and amber, so model text is distinguishable at a
glance and is still never typeset like a measurement. The `user_input` badge is
no longer dotted — the LABEL carries the distinction, and §1a's rule that a
typed entry never shows a read confidence, quoted spans or a vision model is
unchanged and pinned. Template tells removed (ALL-CAPS eyebrows, middle-dot meta
strings, per-tone card borders, the five-colour badge kit, repeated "% of the
evidence" sentences) are enumerated in the design doc; the four restrained track
identities are retained because they make the stacked evidence dimensions scan.

## 2. The one rule

**A model's recollection never becomes a measurement.** DeepSeek does four
jobs in a scan — reads the label, fills in interactions the curated table does
not cover, profiles the company, and discloses funding independence /
publication bias for the literature — and each output is either fed to
deterministic code (the label read) or displayed under a dashed
"Model knowledge — unverified" badge (the other three). No model output enters
a score, a dose band or an arc. This is what separates the product from typing
the brand into a chat window: the chat gives fluent text with no provenance; the
scan gives numbers with receipts and text with a warning label.

## 3. Pipeline

```
POST /api/scan  (multipart, one image, ≤12 MB, 60 s)
             or (application/json {source:"manual", ingredient, form, dose?, servings_per_day?})
  │
  ├─ 0  readLabel            lib/analyze/vision.ts   prompts/label.md v1.1      [MODEL vision]
  │       → LabelRead: ingredient, form, compound dose, servings/day, actives[],
  │         certifications[], manufacturer, country, warnings, claims, spans
  │   -- or --
  ├─ 0' validateManualInput  lib/analyze/scan.ts     against lib/analyze/catalog.ts  [exact, no model]
  │       → ProductFacts with every untyped field empty; ManualEntry echoed as user_input
  │
  │   analyzeFromLabel(facts, run) — ONE implementation of stages 1-5 for both paths
  │
  ├─ 1  identity + dose      vocab.resolveIngredientForm, elementalDoseRangeMg   [exact]
  │       scored dose = per-serving elemental × servings/day when printed,
  │       else per-serving with a caveat (never assume one serving)
  │
  ├─ 2  evidence             product-score.scoreProduct                          [exact]
  │       → rows: composite (v14), four arcs, verdict, validity, run id
  │       → not_scored / form_not_scored / recompute_refused triggers 2b
  │
  ├─ 2b evidence orientation evidence-prior.ts  prompts/evidence_prior.md   [MODEL text]
  │       ONLY when 2 found no usable run. Per outcome: direction, evidence
  │       strength, effective daily dose range, recalled pooled effect. No
  │       composite. Dose placed by the deterministic ramp, not by the model.
  │
  ├─ 3  dose effectiveness   dose-effectiveness.ts                               [exact]
  │       → per outcome: benefit range, null range, closeness, tone, reading
  │
  ├─ 4  form & compatibility compatibility.ts        ┐ run in PARALLEL after
  │       curated: vocab/compatibility.json (cited)  │ stage 1; each degrades
  │       model:   prompts/compatibility.md          │ alone [MODEL text]
  │                for uncovered pairs only           │
  ├─ 5  company background   company.ts               │
  │       label:    seals, manufacturer, country (as printed)               │
  │       registry: openFDA /food/enforcement, recalling_firm + product_description │
  │       model:    prompts/company.md, cross-checked against registry [MODEL text] │
  └─ 5b literature disclosures literature-warnings.ts ┘
          funding independence + publication bias, prompts/literature_warnings.md
          [MODEL text]. `concern` | `no_concern` | `unknown` per topic, DISCLOSURE
          only -- never enters the score, an arc or a dose band. Runs for EVERY
          scan (scored, not-scored, ingredient-not-supported), same time budget.

  → ScanAnalysisV1 { source, label | input, product, evidence, dose_effectiveness,
                     compatibility, company, literature_warnings, caveats,
                     basis_legend, meta }
```

### 3a. Route contract

| body | path | needs a model key? | refused when |
|---|---|---|---|
| multipart `image` | photo (stage 0) | yes — 503 `analyzer_unavailable` without one | kill switch, no key, bad file |
| JSON `source:"manual"` | manual (stage 0′) | **no** — evidence score is deterministic; model sections degrade to `unavailable` | kill switch (503), invalid input (400 `manual_input_invalid`) |

**Authentication gate (2026-10-03, §7).** With `SCAN_REQUIRE_AUTH` on, BOTH
paths first require `Authorization: Bearer <Supabase access token>` of a
Supabase-verified Google user: 401 `unauthorized` (missing / invalid / expired /
non-Google token) or 503 `auth_unavailable` (no server Supabase config, or Auth
cannot answer) — **before the body is read, before any model call, storage
write or history insert**. The route never trusts a caller-supplied user id.

`GET /api/scan` reports `analyzer_available`, `manual_available`, the scored
products, the basis legend, the slim `catalog` (labels, aliases, `unspecified`,
`dose_conversion` ∈ exact/bounded/refused, `scored`) and the manual body shape.
It never exposes molar masses, formulae or hydrate data — the converter's
*behaviour* is described by probing it, not by restating its inputs.

**Time budget.** 60 s route ceiling. The vision read is 10–20 s on DeepSeek.
The remaining budget minus a 4 s margin caps the two text calls (max 25 s
each, run concurrently); below 6 s they are skipped with `reason: time budget`
and a caveat, so the evidence score is never lost to a slow profile.

**Failure isolation.** Every stage after the label read returns
`status: "unavailable", reason` on its own error. A 429 from the model, an
openFDA outage or a schema violation costs one block, not the page.

## 4. The model boundary

`lib/analyze/llm.ts` is the **only** TypeScript file that calls a model API
(enforced by `pipeline.invariants` — a second `chat/completions` string
anywhere under `lib/`, `app/` or `components/` fails the gate). It provides:

- `chat(request)` — one stateless OpenAI-compatible request, temperature 0,
  no tools, bearer key, timeout, 429 → `quota`, empty content → `empty`
- `extractJson(text)` — forgives a markdown fence, refuses anything else
- `validateAgainstSchema(obj, schemaFile)` — Ajv against `schemas/*.json`;
  unknown top-level keys are dropped, wrong types are fatal
- `chatJson(request)` — the three above in sequence, the shape every
  pure-function call uses

Provider is config: `DEEPSEEK_API_KEY`, `MODEL_API_URL`
(default `https://api.deepseek.com/chat/completions`), `LABEL_MODEL`
(default `deepseek-flash`; the old `deepseek-v4-flash-vision-exp` id is retired and
served by it), `TEXT_MODEL` (default `deepseek-chat`). The label read sends DeepSeek's
`thinking: {type: "disabled"}` (only to `api.deepseek.com`), because the current
Flash model thinks by default and its reasoning counts against `max_tokens`.
Verify a model id with the provider before setting it.

Each prompt has its own version constant and cache domain (invariant 3):
`LABEL_PROMPT_VERSION` (mirrored in `label_adapter.py`),
`COMPAT_PROMPT_VERSION`, `COMPANY_PROMPT_VERSION`,
`LITERATURE_WARNINGS_PROMPT_VERSION`.

The deployed label read uses native JSON-object mode when the provider supports
it and supplies a complete typed JSON template in `prompts/label.md`
(`label-v1.2`; `label-v1.3` also states every schema list/length limit so a
busy panel cannot fail the read on an unstated cap). If an OpenAI-compatible vision endpoint rejects
`response_format` with HTTP 400, the shared transport repeats the same stateless
request without that parameter. Returned prose, quoted booleans, wrong types and
truncated JSON still fail closed; the parser does not repair or coerce a dose.

## 5. Source ranking, as shown to the user

1. **Evidence run** — scored from extracted trials with quoted provenance
2. **Public registry** — a dated public record (openFDA)
3. **Curated & cited** — every entry in `vocab/compatibility.json` cites an NIH
   ODS fact sheet or a position stand; an entry without a source belongs in the
   model fill-in, not the table
4. **As printed** — a claim the product makes about itself
5. **Typed by you** (`user_input`, 2026-09-15) — entered by hand on the search
   path; weaker than a label read because nothing was even photographed. Same
   outlined badge family as the rest, labelled "Typed by you" (dotted until the
   2026-09-16 design pass, §1e); no confidence, no spans
6. **Model knowledge** — unverified, orientation only, dashed badge, never scored

The company profile's regulatory items are the one place model text makes a
factual claim about a named company. They are cross-checked: a recall the model
asserts is marked `registry_corroborated: false` when openFDA holds nothing
under that firm name, and a recall the model omits still appears from the
registry.

## 6. Durable scan-run history (2026-09-16)

Every ACCEPTED `POST /api/scan` run — photo or manual, one that reached
`analyzeScan`/`analyzeManual` rather than being rejected first (bad JSON,
oversize, wrong content type, kill switch) — is now durably recorded, so the
owner can inspect any past run: what was asked, what the app answered, and
exactly which release of the app answered it.

**What is stored** (`lib/scan-history/store.ts`, table `public.scan_runs`,
`docs/scan-history.sql`):

- the COMPLETE `ScanAnalysis` JSON the caller received (not a summary)
- request facts/metadata — the typed body for a manual run, or
  `{ content_type, size_bytes }` for a photo run; **never image bytes or
  base64**
- the terminal `status` / `error`
- the OWNER (2026-10-03): `user_id` / `user_email` of the Supabase-verified
  caller, written in the SAME INSERT as the run (§7) — null only for a legacy or
  anonymous run, never fabricated, never changed afterwards
- the exact app release: `package.json` version plus, on Vercel,
  `VERCEL_GIT_COMMIT_SHA`/`_REF`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_ENV` and
  `VERCEL_URL` — honestly `null` off Vercel, never guessed
- for a photo run, the ORIGINAL IMAGE in a **private** Supabase Storage
  bucket (`scan-images`), with only its bucket, path, MIME type, byte size and
  SHA-256 recorded in the row — the bytes never touch the database

**How it is wired.** The run id is generated by `app/api/scan/route.ts`
**before** `analyzeScan`/`analyzeManual` runs (`crypto.randomUUID`, so the row
and the image path can never disagree), and `run_id`, `app_version` and
`persistence` are attached to the response **after** those functions return —
neither function knows history exists, so their extensive existing test
coverage (`tests/scan.test.ts`, `tests/scan-manual.test.ts`) needed no change.
Persistence itself reuses the exact shape of `lib/waitlist/store.ts`: server-only
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix), plain
`fetch` against Supabase's PostgREST and Storage REST APIs, no
`@supabase/supabase-js`.

**Honest by construction.** `persistence.status` is `stored` / `unavailable` /
`failed` — never `stored` unless the write actually succeeded — and a photo's
image outcome is reported SEPARATELY on `persistence.image.status`, because a
row can be written while its image failed to upload. With no Supabase project
configured, every run still answers normally with `persistence.status:
"unavailable"` (local/test builds need no credentials). Setting
`SCAN_HISTORY_REQUIRED=1` makes this **fail closed**: a run whose history
could not be durably recorded (row AND, for a photo, its image) is answered
with `scan_history_required_failed` (500) or, if the store is not even
configured, refused up front with `scan_history_required_unavailable` (503)
before any model call runs — never an unrecorded result served as a normal
answer. On a DB insert failure after a successful image upload, the now-
orphaned image is best-effort deleted.

**Read path and what is still deliberately not built (reworked 2026-10-03).**
Until 2026-10-02 nothing in the app could read this table back. Now exactly two
routes can, both for the SIGNED-IN OWNER only (§7): `GET /api/scan/history`
(their newest 20 runs, metadata only) and `GET /api/scan/history/[id]` (one
saved analysis). They use the service role key, which BYPASSES row level
security, so the access control is an application filter: `user_id =
<the id Supabase Auth verified for the bearer token>` is in the database query
itself AND is re-checked on every returned row (`lib/scan-history/reader.ts`);
any future reader of this table must do the same. The anon and authenticated
database roles still see nothing (RLS on, no policies). Still true: **no signed
image URL is ever minted, no storage path, image hash, request body or email is
ever returned, and nothing re-runs the model or the pipeline** — a saved result
is read back exactly as it was stored.

`docs/scan-history.sql` is additive and re-runnable against ITS OWN objects (it
creates, alters and revokes, never drops, creates no extension, no policy and
no role, and is NEVER run by the app or CI): a private bucket, the `scan_runs`
table, RLS enabled with **no anon policies** (identical discipline to
`docs/waitlist.sql`) and `anon`/`authenticated` table privileges revoked as a
second wall, the indexes the read patterns need — including the 2026-10-03
partial owner index `scan_runs_user_created_idx (user_id, created_at desc, id
desc) where user_id is not null` — and the `scan_users` table (unpopulated
today, §7a). **The Supabase project is SHARED with other apps**, so the file
opens with a PREFLIGHT (inspect `scan_*` tables, the `scan-images` bucket and
every `storage.objects` policy first) and a read-only guard block that aborts
before creating anything if it would adopt another app's table or bucket, flip
nothing public, or sit beside a storage policy that names no bucket. It never
creates, alters or drops a storage policy, so another app's policies are never
touched. **Retention is indefinite** (§7e).
Image uploads send `x-upsert: false`: a stored object is never overwritten, and
a collision fails honestly on the run's `persistence.image`.

## 7. Sign-in, owner-bound runs and private history (2026-09-16; reworked 2026-10-03)

**STATUS: implemented and tested; NOT enabled in production.** Nothing below
runs on the live deployment until the provisioning checklist at the end of this
section is done by the owner. Everything was verified against fakes (in-memory
Supabase, mocked Google script, mocked browser network), never a real Google or
Supabase project.


Founder, 2026-09-16: "people log in once so we capture their email." Founder,
2026-09-23: real results depend on a Google login, and a signed-in person can
reopen their own past results. `/scan` therefore offers Google sign-in through
Supabase Auth -- in-page, no redirect -- and, where it is configured, REQUIRES
it before a scan is sent. A scan's result and its history are private to the
signed-in person.

**How it works.** The Google Identity Services script
(`https://accounts.google.com/gsi/client`) loads LAZILY, only when sign-in is
configured and a person has not signed in yet (`components/google-sign-in.tsx`).
Its button (`google.accounts.id.renderButton`, theme `filled_black`, size
`large`) returns an ID token; `supabase.auth.signInWithIdToken({provider:
"google", token})` turns that into a Supabase session, persisted the library's
default way (`localStorage`, auto-refreshing) -- so sign-in is once per
device, not once per scan. `lib/auth/supabase-browser.ts` holds the one
browser-side Supabase client (a singleton, `null` when any of the three env
vars below is missing) and is the only file in the app importing
`@supabase/supabase-js` -- every server-side store (`lib/waitlist/store.ts`,
`lib/scan-history/store.ts`, `lib/auth/claim.ts`) stays on plain `fetch`
against PostgREST/Auth, because an insert or a PATCH does not need an SDK; a
browser session that must persist and auto-refresh does.

**Client env** (`NEXT_PUBLIC_` because they are meant for the browser bundle,
unlike every other credential in `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. All three
must be set for any of this to appear (`authFullyConfigured()`); missing any
one is treated identically to "sign-in not offered" -- no card, no third-party
script load, scanning not gated, History says it is not available. Local/CI
builds carry none of them, by design. They are inlined at BUILD time, so
changing them needs a rebuild/redeploy.

**Supabase dashboard steps** (same project as `docs/waitlist.sql` /
`docs/scan-history.sql`):

1. **Authentication -> Providers -> Google**: enable it, then paste the Google
   OAuth Web client ID and client secret (from Google Cloud Console) into the
   provider's fields.
2. **Google Cloud Console -> that OAuth 2.0 Client -> Authorized JavaScript
   origins**: add `https://bs-proof-dashboard.vercel.app` and
   `http://localhost:3000`.
3. The **same client ID** goes into `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Vercel
   project env vars, plus `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Supabase's API settings page).

### 7a. The server decides who is calling (`lib/auth/server-auth.ts`)

The browser gate below is a convenience; **`SCAN_REQUIRE_AUTH` is the
protection.** Every server-side check asks Supabase Auth (`GET
{SUPABASE_URL}/auth/v1/user`, `apikey` = the server-only service key, the
caller's token as bearer) who a token belongs to. Rules, each pinned by a test:

1. A token is **never decoded and trusted locally**; a forged but well-formed
   JWT is a 401.
2. The caller **never supplies** a user id or email — a body, form, query or
   header field of that name is ignored (and no longer stored in the run's
   `request`). Id and email come only from the trusted response.
3. "Signed in with Google" is read from `identities[].provider` /
   `app_metadata` — **never `user_metadata`**, which the user can edit.
4. An invalid or expired token is a 401, **never a silent fall-back to
   anonymous**.
5. An Auth outage, timeout or garbage response, or a deployment with no
   `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, is **503 `auth_unavailable`, not
   401**, so a client does not discard a good session because Supabase blinked.
6. Every failure is a fixed generic message: no provider text, key, URL or
   exception ever reaches a caller. Bodies are size-capped (auth 64 KiB, list
   256 KiB, detail 2 MiB), and every response is `Cache-Control: no-store`.

**`POST /api/scan` and `POST /api/analyze-label`.** `SCAN_REQUIRE_AUTH` is
fail-closed: unset / empty / `0` / `false` / `no` / `off` = off; ANY other value
(`1`, `true`, a typo) = on. On, a missing / invalid / expired / non-Google token
is 401 `unauthorized` and an unverifiable request 503 `auth_unavailable`,
**before the body is read and before any model call** — an unauthenticated
caller can neither spend a model call through these routes nor make the server
buffer an image. The same `authenticateRequest` gate guards both model-spending
POST routes: the legacy `POST /api/analyze-label` (what `/tester` calls; it
runs the same DeepSeek label read and returns real evidence rows) was ungated
until the 2026-10-03 owner finding and is now gated identically (its
kill-switch / no-key 503 still answers first; its `GET` reports capabilities,
calls no model and stays public, like the static retained-run pages). Off
(local, CI): an anonymous request works exactly as before and records no owner,
but a bearer that IS sent is still verified (an invalid one is a 401). On
`/api/scan` the verified user is bound as owner; `/api/analyze-label` records
nothing. A verified non-Google user is accepted only in this off mode and can
never read history. The verified user's id/email are written **in the same
INSERT as the run** — photo, manual and terminal-failure records alike; no code
path assigns or changes an owner later.

**This is identity, not a budget.** The gate asks "does Supabase say this is a
Google-signed-in user of this project", not "is this person on a list". The
operator wants Google login to stay open (commission sign-ups), so there is **no
per-user quota, rate limit or allow-list**, and the shared project's Google
sign-up settings are neither read nor changed by this app. Any Google account
can still spend model calls; the gate narrows who and records who (`scan_runs.
user_email`), it does not cap how much. If spend ever needs a cap, that is a
separate change (a per-user count in `scan_runs` would be the place to start).

**`GET /api/scan/history`** (their newest 20 runs: `{id, created_at, source,
status, product_name}`; `next_cursor` is always null — "recent", not exhaustive)
and **`GET /api/scan/history/[id]`** (`{status:"ok", run_id, analysis}`, the
saved analysis verbatim). Both require a Google-backed bearer **regardless of
`SCAN_REQUIRE_AUTH`** — history is personal data, so there is no anonymous mode.
`id` must be a strict UUID (400 otherwise, before any query). A run that is
someone else's, a legacy run with no owner, and a run that does not exist are
**one indistinguishable 404** (same body), so the route is no existence oracle.
The detail response carries a `run_id` rebuilt from the row and an `app_version`
cut to its six known fields; it never carries `persistence`, storage paths,
hashes, the request or an email.

**`POST /api/scan/claim`** now only CONFIRMS: it verifies the token and that the
run is already owned by that user, answers `200 {status:"claimed"}` (meaning
"already yours") and refreshes the `scan_users` row (`scans` is the exact count
of owned runs, idempotent; `first_seen_at` never rewritten). It can never assign
or transfer ownership; an unowned, legacy, cross-owner or missing run is the
same 404. **The UI no longer calls it**, so `scan_users` is NOT populated by the
app and nothing reads it: a signed-in person's email is stored only in
`scan_runs.user_email` (the SQL file carries a query for "who has scanned").

### 7b. The browser (`components/scan-workspace.tsx`, `history-tab.tsx`, `scan-flow.tsx`)

`/scan` is a thin shell around `<ScanWorkspace>`: two tabs, **Scan** (the
existing `<ScanFlow>`, kept mounted while hidden so a held result survives a tab
switch; the camera is switched off and focus is not stolen while it is hidden)
and **History** (mounted only while open, and re-listed after a scan is stored). The workspace owns the ONLY `useSupabaseSession()`.

- **Sign-in not configured** (any of the three vars missing): the previous
  behaviour exactly; History says "History is not available here."
- **Configured, session still loading:** a neutral "Checking your sign-in…" —
  never the sign-in card, never an unlocked scan.
- **Configured, signed out:** a photo can be staged but the "Scan this label"
  button and the search form are replaced by the Google sign-in card; **no
  request is sent.** History shows "Sign in to see your history".
- **Signed in:** every `POST /api/scan` — photo FormData AND typed JSON —
  carries `Authorization: Bearer <live access token>`, re-read from the SDK at
  the moment of the request (`getAccessToken({ userId })`, which returns null if
  the live session belongs to someone else). A 401 triggers ONE
  `refreshSession()` and ONE retry, then the session is ended and the sign-in
  card shown with "Your session ended". 503 `auth_unavailable` keeps the session
  and shows the UI's own fixed message; for 401 / 503 the server's text is never
  echoed (other, pre-existing failure statuses still show their `error`).
- **Results are owner-stamped.** Request, pending state and held result carry
  the user id they belong to. Sign-out, expiry or switching Google account
  **aborts the in-flight request, discards a late reply and removes the held
  result from the page** (not blurred, not `inert` — gone). The History panel
  is keyed by user id, so another account never sees the previous list.
- **Refusals with no analysis get words, not a blank card.** With
  `SCAN_HISTORY_REQUIRED=1` the server can answer `scan_history_required_failed`
  (500: the scan ran but could not be recorded), `scan_history_required_
  unavailable` (503: refused up front, history storage is not configured) or
  `payload_too_large` (413). `<ScanFlow>` shows each as an error alert with a
  fixed plain-language sentence (what happened, that nothing is wrong with the
  person's photo or account, and to try again) and never echoes the server's
  detail, which names deployment settings. (Previously the header "Result" and a
  "!" rendered with no message.)
- **"Saved to your history."** appears only when the response says
  `persistence.status === "stored"`; `unavailable` / `failed` get explicit
  not-saved text; nothing is claimed when persistence is absent.
- **History replay.** The list is `GET /api/scan/history` (bearer, `no-store`,
  abortable). Opening a row `GET`s the detail and renders it with
  `<ScanFlow initialResult>` — **the same result renderer (the four-axis lab
  card) with the SAVED date shown, and no `POST /api/scan`, no model call and no
  new row** (a "Back to history" button replaces "Scan another"). A detail is
  rejected unless `status` is `ok`, its `run_id` equals the id asked for and its
  `analysis.basis_legend` exists. 401 → one refresh, then session-ended; 404 /
  503 / anything else → generic text.

**`/tester` (`components/label-analyzer.tsx`) follows the same rules** with the
same pieces — `useSupabaseSession`, the Google `SignInCard`, `getAccessToken({
userId })`: where sign-in is configured a photo can be picked or taken and stays
staged, but "Analyze" is replaced by the Google card and **no request, and no
anonymous request, is made** until a session exists; a returning session being
read is "Checking your sign-in…"; `POST /api/analyze-label` carries the live
bearer token; a 401 refreshes once and retries once, a second 401 signs out on
screen; sign-out / expiry / another Google account aborts the request in flight,
discards a late reply and removes the result and the photo that was being
analyzed. Where it is not configured (local, CI, previews) nothing changes. The
retained runs lower on `/tester` stay public.

### 7c. Verification status

Pinned by tests: `tests/scan-auth.test.ts`, `tests/scan-auth-route.test.ts`,
`tests/scan-history-reader.test.ts` (server, adversarial, fake Supabase that
APPLIES the owner filters); `tests/scan-workspace.test.tsx`,
`tests/scan-history-ui.test.tsx`, `tests/scan-signin.test.tsx`,
`tests/google-sign-in.test.tsx`, `tests/use-supabase-session.test.tsx` (browser,
fake session); **`tests/analyze-label-auth-route.test.ts`** (the legacy route's gate: 401 / 503,
body never read, zero model calls, non-Google, spoofed `user_metadata`, outage,
fail-closed flag, flag-off compatibility), **`tests/label-analyzer-auth.test.tsx`**
(`/tester`'s browser half), **`tests/scan-flow-refusals.test.tsx`** (the three
refusal statuses), **`tests/scan-history-sql.test.ts`** (static guards on the SQL
file), and **`tests/scan-auth-history-integration.test.tsx`** (the seam: the
REAL workspace's fetch wired to the REAL route handlers over the fake Supabase
with `SCAN_REQUIRE_AUTH=1` + `SCAN_HISTORY_REQUIRED=1` — owner bound at INSERT,
list/replay of exactly that user's run with no new row or model call, account
switch, uniform 404, signed-out sends nothing); and
`tests/e2e/scan-workspace.spec.ts` in a real browser, including a focused
second BUILD with clearly fake public env (`NEXT_PUBLIC_SUPABASE_URL=
https://e2e.supabase.invalid`, `…ANON_KEY=e2e-anon`, `…GOOGLE_CLIENT_ID=
e2e.apps.googleusercontent.com`) and `E2E_AUTH_CONFIGURED=1`, mocking the Google
script, the Supabase token endpoint and the scan/history APIs.

**Verified for real at release (2026-10-03, §7d):** the preflight on the shared
project (no `scan_*` relation, no `scan-images` bucket, two other-app storage
policies that both name their bucket), the SQL applied through the Management
API, and the resulting structure (RLS on, zero policies, no `anon` /
`authenticated` privilege, private bucket, everything else unchanged).

**Still NOT verified:** a real Google
credential becoming a real Supabase session (`signInWithIdToken`) — a real attempt
on 2026-10-03 FAILED with Google `400 origin_mismatch` (§7d); the PostgREST
JSON-path `select` in the list query (`analysis->label->>product_name`, …)
against the live project — it is emulated in tests only (the table now exists
but holds 0 rows); a real phone camera. Before the release the SQL file had only
been executed against an in-memory Postgres with stand-ins for the Supabase roles
and `storage` schema. A probe that the canonical origin renders the
Google button shows only that the button renders: Google's origin refusal
appears after the click, and it did (`origin_mismatch`, §7d). A rendered button
is **not** proof that a token exchange works.

### 7d. Production provisioning — steps 1–3 DONE 2026-10-03, step 4 read-only, step 5 BLOCKED (`origin_mismatch`)

**Status at release (2026-10-03):** steps 1–3 below were executed on the shared
project and the canonical Vercel project (production only) and checked; the exact
results are in `CLAUDE.md` → `Current state` → "Release stage". Step 4 was
**read only** (the provider was neither replaced nor changed; its client ID
equals the one in `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; `disable_signup` is `false`).
A real sign-in attempt on 2026-10-03 FAILED with Google `400 origin_mismatch`: the
production origin `https://bs-proof-dashboard.vercel.app` is not an Authorized
JavaScript origin of the Google OAuth client the shared Supabase provider uses, so
no one can sign in from it (and, with `SCAN_REQUIRE_AUTH=1`, scans are refused) until that
shared client's owner adds it in Google Cloud Console. Step 5 (the real phone
sign-in → scan → History → replay) is therefore **blocked and not verified**. The runbook below stays as written for any re-provisioning.

Do these IN ORDER. The Supabase project is shared with other apps; nothing here
may replace, recreate or reconfigure anything that is not BS-PROOF's.

1. **Preflight, then SQL — BEFORE any Vercel variable.** In a separate SQL Editor
   query run the three read-only checks at the top of `docs/scan-history.sql`
   (`to_regclass` for `scan_runs` / `scan_users`; the `scan-images` row in
   `storage.buckets`; every `storage.objects` policy with its `qual` /
   `with_check`) and keep the output with the release record. First provisioning
   needs both `to_regclass` values NULL and no bucket row. If another app's
   `scan_*` table or `scan-images` bucket exists, STOP: do not adopt it, rename
   it or drop it — choose a different prefixed name (a code change + review).
   Every policy on `storage.objects` must name its `bucket_id`; one that does
   not applies to every bucket (including `scan-images`) and its owner must scope
   it first. Never edit or drop another app's policy from this runbook. Then
   review and apply `docs/scan-history.sql` once; its guard block re-checks all
   of this and aborts, creating nothing, if it finds a problem. With the Vercel
   variables set and the tables missing, every scan spends its model call and
   then fails to record, which is why the SQL goes first.
2. **Confirm the server pair before relying on it** (never print, paste or log
   the key itself; run these in a shell where the values are already exported,
   e.g. from a Vercel env pull you delete afterwards):
   - `SUPABASE_URL` must equal `NEXT_PUBLIC_SUPABASE_URL` EXACTLY (same project,
     same scheme and host, no trailing path):
     `[ "${SUPABASE_URL%/}" = "${NEXT_PUBLIC_SUPABASE_URL%/}" ] && echo same || echo DIFFERENT`
   - `SUPABASE_SERVICE_ROLE_KEY` must be THAT project's **service-role** key (not
     the anon key, not another project's):
     `curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_URL/rest/v1/scan_runs?select=id&limit=1"`
     must print `200` (it proves the URL and key belong together, that the key
     is privileged, and that step 1's tables exist). The same request with
     `$NEXT_PUBLIC_SUPABASE_ANON_KEY` must NOT print `200` (it should be refused;
     that is the revoke in step 1 working).
   A wrong key or a mismatched URL is reported by the app as **401**, because
   Supabase's rejection of the apikey is indistinguishable from a rejected user
   token: everyone is bounced to "Your session ended" and signed out, which looks
   like an expiry, not a misconfiguration. When that happens, check these two
   values before anything else.
3. **Vercel production env** (after step 1): `SCAN_REQUIRE_AUTH=1`,
   `SCAN_HISTORY_REQUIRED=1` (exactly `1`; any other spelling silently leaves
   durable history OFF, unlike the fail-closed `SCAN_REQUIRE_AUTH`),
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the three `NEXT_PUBLIC_`
   sign-in vars. Then rebuild/redeploy (the public vars are inlined at build).
4. Google provider on the shared project is already enabled — **do not replace
   or recreate it, and do not change the project's sign-up settings**. The
   Google client ID in `NEXT_PUBLIC_GOOGLE_CLIENT_ID` must be the same one the
   Supabase provider accepts, or the exchange fails with "Unacceptable
   audience"; its Authorized JavaScript origins must include the production
   origin. (Whether the project accepts open Google sign-ups is a shared setting
   that has not been verified; this app deliberately has no allow-list.)
5. After deploying, do ONE real sign-in → scan → History → replay on a phone, one
   signed-in `/tester` label analysis, and one signed-out `/tester` attempt (it
   must show the Google card and send nothing), and confirm the list query
   against live PostgREST.

### 7e. Retention — stated plainly, nothing promised

With `SCAN_HISTORY_REQUIRED=1`, every accepted scan is kept **indefinitely**: the
full result, the signed-in person's Google email (`scan_runs.user_email`) and,
for a photo scan, the original photo in the private `scan-images` bucket. There
is **no expiry job, no deletion endpoint and no "delete my data" control**, and
the app shows **no retention notice** yet. Removing a person's data today means
the project owner deleting their `scan_runs` rows and `scan-images` objects by
hand in the Supabase dashboard. Writing the notice and building a deletion path
are open owner decisions; until both exist do not tell anyone their data can be
deleted, and do not enable production history without the owner having accepted
this.

**Deliberately not built:** no password/email-link sign-in (Google only), no
account page, no pagination or search beyond the latest 20, no way to view the
photo again (no signed image URL, no stored path ever returned), no DB-level
owner-immutability trigger (the app never UPDATEs `user_id`; kept off to keep the
migration additive), and no result is ever re-scored on replay.

## 8. What is deliberately NOT done

- **No pipeline run is started by a scan.** An unscored ingredient gets a
  literature count (Europe PMC, `is_a_score: false`) and a queue entry; a human
  starts extraction solo (CLAUDE.md, label-upload block).
- **No FDA warning-letter lookup.** There is no API; the model may recall one
  and it is shown as model knowledge only.
- **No drug interactions.** The scan reads a label, not a medicine cabinet.
- **No per-user goals yet.** The compatibility check is about the product's own
  actives. A "what else do you take" input is the obvious next step and would
  reuse the same curated table and prompt.
- **No branded-product search (option 2).** The manual path searches the
  ingredient × form vocabulary, not a catalogue of specific products. A
  branded-product catalogue is deferred until the algorithmic score satisfies
  LithuaniaBio acceptance (criteria not yet documented — see CLAUDE.md Next).
- **No IU, no CFU mass.** Unit handling on the manual path is exact mass only.
- **No per-user quota, rate limit or allow-list on scans** (operator decision:
  open Google login). The Google gate is identity, not a budget (§7a).
- **No retention limit, deletion path or retention notice** (§7e).
- **No public or anonymous read of scan-run history, and no signed image URL,
  anywhere.** §6's `scan_runs` table and `scan-images` bucket are written and
  read by the service role key from the server only; the one application read is
  the owner-filtered, Google-authenticated `GET /api/scan/history[/id]` (§7a).
  A saved result is replayed, never re-scored.

## 9. Files

```
lib/analyze/llm.ts               the model boundary
lib/analyze/vision.ts            label prompt + contract (uses llm)
lib/analyze/evidence-prior.ts    the no-run fallback (stage 2b)
lib/analyze/compatibility.ts     curated table + model fill-in
lib/analyze/company.ts           label + openFDA + model profile
lib/analyze/dose-effectiveness.ts readings off the scored rows
lib/analyze/census.ts            Europe PMC count + demand queue (shared)
lib/analyze/scan.ts              the orchestrator; ScanAnalysisV1; analyzeScan / analyzeManual → analyzeFromLabel
lib/analyze/catalog.ts           slim ingredient × form catalog from vocab/form.json (manual path)
lib/analyze/manual-dose.ts       mg / g / mcg → mg, exact factors, no IU (client-safe)
lib/analyze/business-model.ts    MLM / direct-selling disclosure: type + pure rendering decision (client-safe)
lib/analyze/literature-warnings.ts     funding-independence / publication-bias disclosures (uses llm)
lib/analyze/literature-disclosures.ts  same disclosures: type + pure rendering decision (client-safe)
lib/scan-history/store.ts        durable scan-run history WRITE: Supabase Storage + Postgres, plain fetch, server-only; binds the owner at INSERT
lib/scan-history/reader.ts       owner-filtered READ (list + detail): user_id filter in the query AND rechecked per row; uniform not_found
lib/camera/capture.ts            getUserMedia/canvas capture helpers, unit-testable without a real camera (client-safe)
lib/auth/supabase-browser.ts     the ONE browser Supabase client singleton; @supabase/supabase-js lives here only
lib/auth/use-supabase-session.ts hook: session state + getAccessToken({userId, forceRefresh}) (live token, owner-checked)
lib/auth/server-auth.ts          server-side identity: Supabase /auth/v1/user is the only authority; Google from identities/app_metadata; SCAN_REQUIRE_AUTH
lib/auth/claim.ts                server-side: verifies a token AND that the run is already that user's; refreshes scan_users; never assigns an owner
app/api/scan/route.ts            auth gate → multipart → analyzeScan; JSON → analyzeManual; GET catalog; wires scan-run history + owner
app/api/analyze-label/route.ts   legacy label route behind /tester: the SAME auth gate as /api/scan, before the body and any model call
app/api/scan/claim/route.ts      POST { run_id } + Bearer → 200 "claimed" (= already yours) or the uniform 404; the UI no longer calls it, so scan_users stays empty
app/api/scan/history/route.ts    GET: the signed-in owner's newest 20 runs (Google bearer always required)
app/api/scan/history/[id]/route.ts GET: one saved analysis, owner-filtered, uniform 404 (Google bearer always required)
app/scan/page.tsx, components/scan-workspace.tsx   the page shell: Scan | History tabs, the one session; app/scan-workspace.css (route-scoped)
components/scan-flow.tsx, components/supplement-search.tsx   the Scan tab (also replays a saved result via initialResult)
components/history-tab.tsx       the History tab: list, detail fetch, replay through <ScanFlow initialResult>
components/scan-camera.tsx       the live camera viewfinder block + shutter (2026-09-16)
components/search-sheet.tsx      accessible dialog wrapping <SupplementSearch> (2026-09-16)
components/google-sign-in.tsx    lazy-loaded Google button + the sign-in card shown in place of the scan button / history (2026-10-03)
components/label-analyzer.tsx    /tester's analyzer: same session hook, Google card and bearer rules as <ScanFlow> (2026-10-03)
public/scan-mark.svg             transparent scanner mark; derived by scripts/write_scan_mark.mjs
prompts/label.md (v1.1), prompts/company.md (v1.1), prompts/compatibility.md,
prompts/evidence_prior.md, prompts/literature_warnings.md
schemas/label.json, schemas/company.json, schemas/compatibility.json,
schemas/evidence_prior.json, schemas/literature_warnings.json
vocab/compatibility.json         curated, cited interactions and form notes
docs/scan-history.sql            shared-project preflight + guard, then: private bucket, scan_runs/scan_users tables, RLS (no policies), anon/authenticated revoked, indexes
tests/scan.test.ts               the whole flow against fakes, zero model calls
tests/camera-capture.test.ts     lib/camera/capture.ts: support detection, mocked-canvas capture, blob->File
tests/scan-signin.test.tsx       sign-in gating, Bearer on photo AND typed scans, owner-stamped results, abort on sign-out/switch (mocked supabase-browser)
tests/scan-workspace.test.tsx, tests/scan-history-ui.test.tsx, tests/google-sign-in.test.tsx, tests/use-supabase-session.test.tsx   browser half
tests/scan-auth.test.ts, tests/scan-auth-route.test.ts, tests/scan-history-reader.test.ts   server half, against tests/helpers/fake-supabase.ts (applies owner filters)
tests/analyze-label-auth-route.test.ts, tests/label-analyzer-auth.test.tsx   the legacy /api/analyze-label gate and /tester's browser half (2026-10-03)
tests/scan-flow-refusals.test.tsx, tests/scan-history-sql.test.ts   refusal statuses get words; static guards on the shared-project SQL
tests/scan-auth-history-integration.test.tsx   THE SEAM: real workspace fetch -> real route handlers -> fake Supabase; owner at INSERT, replay with no new scan
tests/e2e/scan-workspace.spec.ts tabs, a11y, History-not-configured; with a fake-public-env build + E2E_AUTH_CONFIGURED=1 the Google-required flow
tests/e2e/tester-auth.spec.ts    /tester: ungated on a default build; with the same fake-env build, no request until Google sign-in, bearer on the request, sign-out removes the result (2026-10-03)
tests/e2e/auth-mocks.ts          shared mocked Google script + Supabase token endpoint for both e2e specs
tests/scan-claim-route.test.ts   POST /api/scan/claim: confirms an owned run, never assigns, uniform 404, no secret in the response
tests/scan-manual.test.ts        catalog integrity, unit conversion, manual orchestration, route, source/basis honesty, mark drift
tests/scan-search.test.tsx       keyboard-driven combobox, / vs /scan vs /tester separation
tests/scan-history.test.ts       store: payload shape, image hashing/storage, app version, orphan cleanup, no-secret leakage
tests/scan-history-route.test.ts route wiring: run_id/app_version/persistence attached, SCAN_HISTORY_REQUIRED fail-closed
tests/company-business-model.test.ts  schema, defaults, the disclosure decision function, proof that scoring never sees the field
tests/scan-mlm-warning.test.tsx       the disclosure rendered in the real <ScanFlow> DOM, same warning class as other /scan disclosures
tests/literature-warnings.test.ts        schema, defaults, the disclosure decision function, all three scan paths, byte-identical pin, time-budget skip
tests/literature-warnings-render.test.tsx the disclosures rendered in the real <ScanFlow> DOM, only for "concern"
```

## 10. Exact retained Evidence Ledger audits (2026-09-17)

`lib/evidence-ledger/` is browser-safe and is the one implementation of the
Evidence Ledger types and `score()` used by the design lab and `/scan`. The
server-only selector in `retained-audits.ts` reads exactly one retained audit
when ingredient, form, single-ingredient status, stated servings/day, and
printed compound mass match exactly: creatine monohydrate 4000 mg, vitamin D3
(cholecalciferol) 0.05 mg / 50 mcg / 2000 IU, or magnesium glycinate 300 mg.
Missing servings, multi-ingredient labels, different forms, and every dose
mismatch return no audit. Only that matched audit and its matching plain-language
sidecar cross the browser boundary; the original audit wording and opened-source
inventory remain reachable in its expansions. The `/api/scan` server bundle
explicitly traces these retained JSON sidecars; the browser-safe module contains
no filesystem import.

The audit banner states retained previous audit, prompt version, target product
and dose, and not reverified on this scan. Effect keeps the audit's real −3..+3
state; certainty, form and dose use their native x/4 values, with unknown fit as
`—`. Production coverage is never converted or bucketed into /4. Unmatched
products retain the continuous v14 evidence API as a compatibility backup and
show an explicit no-exact-audit message. Funding/publication bias remain
concerns-only disclosures and do not change the Ledger score. Person fit is dropped; retained `studied_in` fields are source
context only. The retained **General score** is intentionally the plain mean of
scored outcome headlines, an aggregation outside canonical per-outcome
`score()` and explicitly not a probability of benefit. The audit remains
heuristic and unvalidated; arbitrary-product expansion needs a source-retrieval
service because the deployed model transport cannot open live sources.
