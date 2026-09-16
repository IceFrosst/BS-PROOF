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
`prompts/company.md`, `COMPANY_PROMPT_VERSION` bumped to `company-v1.1`) now
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
if confirmed or suspected"). The field is invisible to scoring: `tests/company-business-
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
cache domain `LITERATURE_WARNINGS_PROMPT_VERSION = "literature-warnings-v1.0"`)
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
- **Results keep their existing rendering** (every section, badge and yellow
  warning, unchanged from §1/§1a/§1b/§1c) and stay on light/white cards for
  contrast, per the founder's "result cards may stay light/white on the dark
  ground" instruction -- only the page ground and the pre-result capture
  chrome went dark. `app/manifest.ts`'s `background_color` followed the ground
  to `#050B18` (`theme_color` unchanged); `tests/pwa.test.ts` pins both.
- **Sign-in while results load** -- see §7 below.

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
(default `deepseek-v4-flash-vision-exp`), `TEXT_MODEL` (default `deepseek-chat`).
Verify a model id with the provider before setting it.

Each prompt has its own version constant and cache domain (invariant 3):
`LABEL_PROMPT_VERSION` (mirrored in `label_adapter.py`),
`COMPAT_PROMPT_VERSION`, `COMPANY_PROMPT_VERSION`,
`LITERATURE_WARNINGS_PROMPT_VERSION`.

## 5. Source ranking, as shown to the user

1. **Evidence run** — scored from extracted trials with quoted provenance
2. **Public registry** — a dated public record (openFDA)
3. **Curated & cited** — every entry in `vocab/compatibility.json` cites an NIH
   ODS fact sheet or a position stand; an entry without a source belongs in the
   model fill-in, not the table
4. **As printed** — a claim the product makes about itself
5. **Typed by you** (`user_input`, 2026-09-15) — entered by hand on the search
   path; weaker than a label read because nothing was even photographed. Dotted
   badge, no confidence, no spans
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

**Deliberately not built.** No read endpoint and no signed image URL exist
anywhere in the app — reading this history back is a job for the Supabase SQL
editor (or a future owner-only tool) against the service-role key directly,
never this app's own runtime. `docs/scan-history.sql` is idempotent: a private
bucket, the `scan_runs` table, RLS enabled with **no anon policies** (identical
discipline to `docs/waitlist.sql`), and the indexes the two read patterns
(newest-first, filter by status) actually need.

## 7. Sign-in and email capture (2026-09-16)

Founder: "people log in once so we capture their email." While a scan or a
search's loading-stage messages show, and again over the finished result until
a session exists, `/scan` offers Google sign-in through Supabase Auth --
in-page, no redirect, so the analysis already sitting in component state is
never lost to a navigation.

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
one is treated identically to "sign-in not offered" -- no card, no locked
result, no third-party script load. Local/CI builds carry none of them, by
design.

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

**Behaviour while a result is loading or ready.** When sign-in is configured
and nobody is signed in: a "Save your result" card (title, one line of copy,
the Google button) renders in the loading area the instant a scan/search is
submitted, and — if the analysis finishes before a session appears — again
above a blurred, `inert` copy of the ALREADY-COMPUTED result (no re-fetch;
signing in just removes the blur and the `inert` attribute). When sign-in is
not configured, or somebody is already signed in, results render exactly as
before, plus a small "Signed in as x@y · Sign out" line in the result meta
once there is a session.

**Server-side capture, `POST /api/scan/claim` (`lib/auth/claim.ts`).** The
client calls this the moment both a Supabase session and a scan's `run_id`
exist, whichever arrived second — right after sign-in if a result is already
in state, or right after a result arrives if already signed in. The route
verifies the caller's access token itself, the same "never trust the client"
discipline as the rest of this app: a plain `fetch GET {SUPABASE_URL}
/auth/v1/user` with `apikey: SUPABASE_SERVICE_ROLE_KEY` and the caller's token
as the bearer. A verified token then (a) PATCHes `public.scan_runs` (service
role, bypassing RLS) to set `user_id`/`user_email` on that run, and (b)
upserts `public.scan_users` (`user_id` primary key, `email`, `first_seen_at`,
`last_seen_at`, a best-effort `scans` counter), both in
`docs/scan-history.sql`. The route never throws past a reported outcome: 401
on a bad/expired/missing token, 404 when the run id matches no row, 503 when
Supabase env vars are not configured, and the JSON response never carries a
secret. Extending `docs/scan-history.sql` is idempotent (`add column if not
exists`, `create table if not exists`), matching every other migration file
in this repo.

**Deliberately not built:** no password/email-link sign-in (Google only,
matching the founder's ask), no account page, no way for a signed-in user to
see their own scan history in the app (still an owner-only Supabase SQL Editor
job, per §6), and no atomic increment for `scan_users.scans` (a best-effort
read-then-write, documented as such in the SQL file).

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
- **No public read endpoint for scan-run history, and no signed image URL,
  anywhere.** §6's `scan_runs` table and `scan-images` bucket are written by
  the service role key only; reading them back is a Supabase SQL editor / a
  future owner-only tool, never a route this app serves.

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
lib/scan-history/store.ts        durable scan-run history: Supabase Storage + Postgres, plain fetch, server-only
lib/camera/capture.ts            getUserMedia/canvas capture helpers, unit-testable without a real camera (client-safe)
lib/auth/supabase-browser.ts     the ONE browser Supabase client singleton; @supabase/supabase-js lives here only
lib/auth/use-supabase-session.ts hook: session state (email/access token) for <ScanFlow>
lib/auth/claim.ts                server-side: verifies a Supabase access token, claims a scan_runs row, upserts scan_users
app/api/scan/route.ts            multipart → analyzeScan; JSON → analyzeManual; GET catalog; wires scan-run history
app/api/scan/claim/route.ts      POST { run_id } + Authorization: Bearer <token> → attaches the signed-in user to a run
app/scan/page.tsx, components/scan-flow.tsx, components/supplement-search.tsx   the UI
components/scan-camera.tsx       the live camera viewfinder block + shutter (2026-09-16)
components/search-sheet.tsx      accessible dialog wrapping <SupplementSearch> (2026-09-16)
components/google-sign-in.tsx    lazy-loaded Google button + the "Save your result" card (2026-09-16)
public/scan-mark.svg             transparent scanner mark; derived by scripts/write_scan_mark.mjs
prompts/label.md (v1.1), prompts/company.md (v1.1), prompts/compatibility.md,
prompts/evidence_prior.md, prompts/literature_warnings.md
schemas/label.json, schemas/company.json, schemas/compatibility.json,
schemas/evidence_prior.json, schemas/literature_warnings.json
vocab/compatibility.json         curated, cited interactions and form notes
docs/scan-history.sql            idempotent migration: private bucket, scan_runs/scan_users tables, RLS, indexes
tests/scan.test.ts               the whole flow against fakes, zero model calls
tests/camera-capture.test.ts     lib/camera/capture.ts: support detection, mocked-canvas capture, blob->File
tests/scan-signin.test.tsx       sign-in card gating, locked/unlocked result rendering, claim call wiring (mocked supabase-browser module)
tests/scan-claim-route.test.ts   POST /api/scan/claim: 401 bad token, 404 unknown run, 200 happy path, no secret in the response
tests/scan-manual.test.ts        catalog integrity, unit conversion, manual orchestration, route, source/basis honesty, mark drift
tests/scan-search.test.tsx       keyboard-driven combobox, / vs /scan vs /tester separation
tests/scan-history.test.ts       store: payload shape, image hashing/storage, app version, orphan cleanup, no-secret leakage
tests/scan-history-route.test.ts route wiring: run_id/app_version/persistence attached, SCAN_HISTORY_REQUIRED fail-closed
tests/company-business-model.test.ts  schema, defaults, the disclosure decision function, proof that scoring never sees the field
tests/scan-mlm-warning.test.tsx       the disclosure rendered in the real <ScanFlow> DOM, same warning class as other /scan disclosures
tests/literature-warnings.test.ts        schema, defaults, the disclosure decision function, all three scan paths, byte-identical pin, time-budget skip
tests/literature-warnings-render.test.tsx the disclosures rendered in the real <ScanFlow> DOM, only for "concern"
```
