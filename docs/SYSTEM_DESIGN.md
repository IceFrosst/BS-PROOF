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

**Camera.** "Take a photo" is `<input type="file" capture="environment">`.
Production sends `Permissions-Policy: camera=()`, which blocks
`getUserMedia`, so the in-page viewfinder is gone; the capture attribute hands
off to the platform camera and needs no policy change. "Upload an image" is the
same input without `capture`.

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
`no_evidence` / `unknown` render a plain, honest, non-accusatory line instead
of a warning box. The field is invisible to scoring: `tests/company-business-
model.test.ts` proves two runs identical except for `business_model` produce
byte-identical `product`/`evidence`/`dose_effectiveness` output, and that no
scoring source file (Python or TypeScript) even mentions it.

## 2. The one rule

**A model's recollection never becomes a measurement.** DeepSeek does three
jobs in a scan — reads the label, fills in interactions the curated table does
not cover, and profiles the company — and each output is either fed to
deterministic code (the label read) or displayed under a dashed
"Model knowledge — unverified" badge (the other two). No model output enters a
score, a dose band or an arc. This is what separates the product from typing
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
  ├─ 4  form & compatibility compatibility.ts        ┐ run in PARALLEL
  │       curated: vocab/compatibility.json (cited)  │ after stage 1; each
  │       model:   prompts/compatibility.md          │ degrades alone
  │                for uncovered pairs only           │ [MODEL text]
  │                                                    │
  └─ 5  company background   company.ts               ┘
          label:    seals, manufacturer, country (as printed)
          registry: openFDA /food/enforcement, recalling_firm + product_description
          model:    prompts/company.md, cross-checked against the registry [MODEL text]

  → ScanAnalysisV1 { source, label | input, product, evidence, dose_effectiveness,
                     compatibility, company, caveats, basis_legend, meta }
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
`COMPAT_PROMPT_VERSION`, `COMPANY_PROMPT_VERSION`.

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

## 7. What is deliberately NOT done

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

## 8. Files

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
lib/scan-history/store.ts        durable scan-run history: Supabase Storage + Postgres, plain fetch, server-only
app/api/scan/route.ts            multipart → analyzeScan; JSON → analyzeManual; GET catalog; wires scan-run history
app/scan/page.tsx, components/scan-flow.tsx, components/supplement-search.tsx   the UI
public/scan-mark.svg             transparent scanner mark; derived by scripts/write_scan_mark.mjs
prompts/label.md (v1.1), prompts/company.md (v1.1), prompts/compatibility.md,
prompts/evidence_prior.md
schemas/label.json, schemas/company.json, schemas/compatibility.json,
schemas/evidence_prior.json
vocab/compatibility.json         curated, cited interactions and form notes
docs/scan-history.sql            idempotent migration: private bucket, scan_runs table, RLS, indexes
tests/scan.test.ts               the whole flow against fakes, zero model calls
tests/scan-manual.test.ts        catalog integrity, unit conversion, manual orchestration, route, source/basis honesty, mark drift
tests/scan-search.test.tsx       keyboard-driven combobox, / vs /scan vs /tester separation
tests/scan-history.test.ts       store: payload shape, image hashing/storage, app version, orphan cleanup, no-secret leakage
tests/scan-history-route.test.ts route wiring: run_id/app_version/persistence attached, SCAN_HISTORY_REQUIRED fail-closed
tests/company-business-model.test.ts  schema, defaults, the disclosure decision function, proof that scoring never sees the field
tests/scan-mlm-warning.test.tsx       the disclosure rendered in the real <ScanFlow> DOM, same warning class as other /scan disclosures
```
