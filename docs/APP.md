# The app — `/scan`

The Next.js app on Vercel: `/scan` reads a supplement label (photo or typed) and
says what can be said about the product. Rules are in `CLAUDE.md`; the evidence
method is `docs/METHOD.md`.

Code cites this file by section number (`APP §11`). Do not renumber; add new
sections at the end. The full design history is
`docs/history/2026-09-16-scan-design-log.md` (it describes the v14 result card,
since removed; the capture flow and tokens are still current).

**Routes:** `/` (waitlist only), `/scan` (the product, unlisted, `noindex`),
`/methodology` (how grading will work), `POST /api/scan`, `POST /api/scan/claim`,
`POST /api/waitlist`.

---

## 1. What the user gets

One photo of a Supplement Facts panel — or a typed ingredient, form and dose —
gives one page. **Evidence grading is not active yet (§4)**, so the page shows no
grade, score or verdict; every block says where it came from:

| Block | Answers | Basis |
|---|---|---|
| Evidence grades are not active yet | why there is no grade today | — (a notice, §4) |
| What the label says / What you entered | ingredient, form, dose, servings, actives, seals, brand | `label` or `user_input` |
| What the literature says | per outcome: direction, strength of the literature, effective dose range the model recalls, and the product's dose against it in words | `model_prior` |
| Does the form and the mix hold up? | cited form notes and interactions among the actives | `curated_table`, `model_prior` |
| Who makes it, and what is on record? | printed seals, FDA recalls on file, the model's company profile including a conservative MLM / direct-selling read (§1b) | `label`, `registry`, `model_prior` |
| Warnings | caveats; funding-independence and publication-bias disclosures (§1c); the MLM disclosure (§1b) | `model_prior` for the disclosures |

### 1a. The typed path — "Search your supplement"

A dialog over a catalog derived on the server from `vocab/form.json`
(`lib/analyze/catalog.ts`): pick an ingredient (search matches labels, ids,
aliases and form names, so "bisglycinate" finds magnesium), its exact form
(required, no default — a preselected salt would be a guess), and optionally a
dose in **mg, g or mcg** plus servings per day. **IU is refused** (its mass
depends on the substance) and CFU-counted ingredients take no mass dose. Sanity
ceilings live in `lib/analyze/manual-dose.ts` (input hygiene, not a dose
judgement).

The result is the same `ScanAnalysisV1` with `source: "manual"`, an `input`
block under basis `user_input`, no label block, no read confidence, no quoted
spans, and a standing `typed_not_verified` caveat. The UI keys off `source`, so
typed figures can never look like a label read. Typed and photographed entries
of the same tub produce identical `product` blocks.

### 1b. MLM / direct-selling disclosure

The company profile (`prompts/company.md`, `COMPANY_PROMPT_VERSION`) carries
`business_model`: `confirmed_mlm` | `suspected_mlm` | `no_evidence` | `unknown`,
with a basis and a confidence; `unknown` whenever the model is not sure. Only
confirmed / suspected render, as a warning titled "MLM / direct-selling business
model", captioned "Model knowledge — unverified". It is never a legal judgement
and never a claim about the product. The rendering decision is the client-safe
`lib/analyze/business-model.ts`.

### 1c. Literature disclosures

`lib/analyze/literature-warnings.ts` (`prompts/literature_warnings.md`) asks per
ingredient and form about **funding & independence** and **publication bias**:
`concern` | `no_concern` | `unknown`, a concern requiring a specific named
reason. Only `concern` renders, as a disclosure; it never claims a result is
wrong. Runs for every scan; the rendering decision is
`lib/analyze/literature-disclosures.ts`.

## 2. The one rule

**A model's recollection never becomes a measurement.** The app's model (DeepSeek
by default) reads the label, recalls the literature, fills interactions the
curated table does not cover, profiles the company and writes the two
disclosures. The label read feeds deterministic code; everything else is shown
under a dashed "Model knowledge — unverified" badge. When grading is switched on
(§4), only an evidence run will produce a grade.

## 3. The scan pipeline

```
POST /api/scan  (multipart: one image ≤ 12 MB)  or  (JSON: {source:"manual", ingredient, form, dose?, servings_per_day?})
  ├─ 0  readLabel            lib/analyze/vision.ts, prompts/label.md         [MODEL vision]
  │  0′ validateManualInput  lib/analyze/scan.ts against the catalog        [exact]
  │
  │  analyzeFromLabel — ONE implementation of the rest for both paths
  ├─ 1  identity + dose      vocab.resolveIngredientForm, elementalDoseRangeMg
  │                          daily dose = per serving × servings/day when stated, else per serving + caveat
  ├─ 2  evidence grade       NOT ACTIVE → status "not_graded" (§4)
  ├─ 2b literature           lib/analyze/evidence-prior.ts                  [MODEL text]
  ├─ 4  form & mix           lib/analyze/compatibility.ts: vocab/compatibility.json (cited) + model fill-in   [MODEL text]
  ├─ 5  company              lib/analyze/company.ts: label + openFDA enforcement + model profile            [MODEL text]
  └─ 5b disclosures          lib/analyze/literature-warnings.ts                                            [MODEL text]
     + census                lib/analyze/census.ts: a Europe PMC count (never a score) and a demand-queue entry
```

Stages 2b, 4, 5 and 5b run in parallel after stage 1, and each degrades to
`unavailable` on its own error. **Time budget:** the route allows 60 s; the
vision read takes 10–20 s; the text calls get the rest minus a 4 s margin (max
25 s each) and are skipped with a caveat below 6 s.

**Statuses:** `not_graded` (a supported ingredient), `ingredient_not_supported`
(outside the vocabulary — still gets 2b, 4, 5, 5b), `not_a_supplement_label`,
`label_unreadable`, `manual_input_invalid`, `analyzer_unavailable` (photo path
without a model key, or the kill switch: 503). The route itself can also answer
`payload_too_large` (413) and `bad_request` (400) before any analysis runs.

| Body | Needs a model key? | Refused when |
|---|---|---|
| multipart `image` | yes — 503 `analyzer_unavailable` without one | kill switch (`LABEL_ANALYZER_ENABLED=0`), no key, bad file |
| JSON `source:"manual"` | no — the model sections degrade to `unavailable` | kill switch, invalid input (400) |

`GET /api/scan` reports availability, `grading_active: false`, the basis legend,
the slim catalog and the manual body shape (never molar masses or formulae).

## 4. Evidence grading — not active

Removed 2026-10-15: the v14 score, its dose bars and the Evidence Ledger card
(`docs/history/v14-scoring-model.md`). Evidence method v2 is not connected until
it validates (`docs/METHOD.md` §16, `docs/DECISIONS.md`).

- **What the user sees:** `<GradingNotice>` ("Evidence grades are not active
  yet…") on the landing screen and at the top of every result, and
  `/methodology` explains why.
- **What is built:** `lib/analyze/grade-v2.ts` re-matches a run's stored
  `evidence_v2` block (newest `reports/runs/*_context.json` for the ingredient)
  to the scanned product's form and daily elemental dose, adding GRADE
  indirectness only. It is parity-pinned to Python (`tests/grade-v2-parity.test.ts`)
  and **not called**.
- **To switch on:** call `gradeProductV2` in `analyzeFromLabel` stage 2, build a
  grade card that shows each letter with its estimate, CI, k and certainty
  (CLAUDE.md invariant 8) -- the letter at the outcome's threshold M only, with
  a "borderline" marker when the M/2 or 2M letter differs (founder 2026-10-25), remove the notice, and trace the run files into the
  `/api/scan` bundle (`next.config.ts` `outputFileTracingIncludes`).

## 5. The model boundary

`lib/analyze/llm.ts` is the **only** TypeScript file that calls a model API
(enforced by `python3 -m pipeline.invariants`): one stateless OpenAI-compatible
request, temperature 0, no tools; JSON extracted and validated against
`schemas/*.json` (unknown top-level keys dropped, wrong types fatal).

Provider is config: `DEEPSEEK_API_KEY`, `MODEL_API_URL` (default DeepSeek),
`LABEL_MODEL` (default `deepseek-flash`), `TEXT_MODEL` (default
`deepseek-chat`). The label read sends `thinking: {type: "disabled"}` to DeepSeek
only, because its reasoning counts against `max_tokens`. Verify a model id with
the provider before setting it.

Each prompt has its own version constant and cache domain (CLAUDE.md
invariant 3): `LABEL_PROMPT_VERSION` (`vision.ts`), `COMPAT_PROMPT_VERSION`,
`COMPANY_PROMPT_VERSION`, `EVIDENCE_PRIOR_PROMPT_VERSION`,
`LITERATURE_WARNINGS_PROMPT_VERSION`.

## 6. Scan-run history (optional)

Every accepted `POST /api/scan` is recorded when Supabase is configured
(`lib/scan-history/store.ts`, `docs/scan-history.sql`): the complete response,
the request facts (never image bytes in the row), the status, and the exact app
release (package version plus Vercel commit and deployment ids). A photo's
original image goes to a **private** Storage bucket (`scan-images`) with its
path, size and SHA-256 in the row.

`persistence.status` is `stored` / `unavailable` / `failed` — never `stored`
unless the write succeeded; the image outcome is reported separately. Without
Supabase, runs answer normally with `unavailable`. `SCAN_HISTORY_REQUIRED=1`
fails closed (503 before any model call when unconfigured; 500 when the write
fails). There is deliberately **no read endpoint and no signed image URL**:
reading history is a Supabase SQL-editor job. Unverified against a real project.

## 7. Sign-in and email capture (optional)

While a scan loads, and over the finished result until a session exists, `/scan`
offers Google sign-in through Supabase Auth, in-page, so the computed result is
never lost. When sign-in is configured and nobody is signed in, the result is
blurred and `inert` under a "Save your result" card; signing in removes the blur
(no re-fetch). `POST /api/scan/claim` (`lib/auth/claim.ts`) verifies the
caller's token server-side, attaches the user to the `scan_runs` row and upserts
`scan_users` (its `scans` counter is a best-effort read-then-write, not an
atomic increment).

**Setup** (all three client vars must be set, or sign-in is simply not offered):

1. Supabase → Authentication → Providers → Google: enable, paste the Google
   OAuth web client id and secret.
2. Google Cloud Console → that OAuth client → Authorised JavaScript origins:
   `https://bs-proof-dashboard.vercel.app` and `http://localhost:3000`.
3. Vercel env: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (same client id),
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; server-side
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Run `docs/scan-history.sql`.

`lib/auth/supabase-browser.ts` is the only file importing `@supabase/supabase-js`;
every server store uses plain `fetch`. Unverified against a real project.

## 8. Source ranking, as shown to the user

1. **Evidence run** — graded from extracted trials with quoted provenance (not
   active yet)
2. **Public registry** — a dated public record (openFDA)
3. **Curated & cited** — `vocab/compatibility.json`, every entry citing an NIH
   ODS fact sheet or a position stand
4. **As printed** — what the label says about itself
5. **Typed by you** — entered by hand; nothing verified it
6. **Model knowledge** — unverified, orientation only, dashed badge

The company profile's recalls are cross-checked: a recall the model asserts is
marked `registry_corroborated: false` when openFDA holds nothing for that firm,
and a recall the model omits still appears from the registry.

## 9. Deliberately not done

- A scan never starts a pipeline run; an ingredient with no run gets a
  literature count and a demand-queue entry.
- No FDA warning-letter lookup (no API), no drug interactions, no per-user
  goals, no branded-product catalogue, no IU or CFU mass.
- No public read endpoint for scan history, no signed image URL.
- No offline cache: cached evidence would go stale.

## 10. Files

```
app/scan/page.tsx, app/api/scan/route.ts, app/api/scan/claim/route.ts
lib/analyze/scan.ts            the orchestrator, ScanAnalysisV1
lib/analyze/llm.ts             the one model boundary
lib/analyze/vision.ts          label prompt + contract
lib/analyze/evidence-prior.ts  literature orientation (stage 2b)
lib/analyze/compatibility.ts   curated table + model fill-in
lib/analyze/company.ts         label + openFDA + model profile
lib/analyze/literature-warnings.ts, literature-disclosures.ts, business-model.ts   disclosures
lib/analyze/catalog.ts, manual-dose.ts, vocab.ts, census.ts   catalog, units, dose conversion, census
lib/analyze/grade-v2.ts        v2 product grade — built, not connected (§4)
lib/scan-history/, lib/auth/, lib/camera/, lib/waitlist/
components/scan/               scan-flow (state machine in flow-state.ts), capture-views,
                               scan-camera, search-sheet, supplement-search, report-sections,
                               google-sign-in, primitives, format
app/styles/                    base, ab (card primitives), scan, scan-result, article, front-door
prompts/{label,company,compatibility,evidence_prior,literature_warnings}.md + schemas/
vocab/compatibility.json, docs/scan-history.sql, docs/waitlist.sql
```

## 11. `/scan` design system

**Brief (founder):** "coherent, simplistic but look scientific … world class,
not vibecoded … phone optimised." A lab-grade report read on a phone in a shop
aisle by a buyer sceptical of marketing.

**Tokens** (scoped to `.scan-page`, `app/styles/scan.css`): `--sp-white` the only
ground; `--sp-tint` the one grey tint; `--sp-line` every 1 px rule; `--sp-mute`
secondary text (6.3:1); `--sp-ink` text; `--sp-measured` (`#0b6b5a`) measured
things only; `--sp-unverified` (`#885a00`) model-recalled things only;
`--sp-danger` errors. Type: system stack, 13 / 15 / 17 / 22 px,
sentence case, `tabular-nums` in columns, prose ≤ 62ch. One radius (12 px; the
viewfinder 24 px), rules not boxes, targets ≥ 44 px, no shadows on the report.

**State model** — each state owns the viewport (`components/scan/flow-state.ts`):

```
landing ──shutter/upload──▶ staged ──"Scan this label"──▶ loading ──▶ result
   ▲                          │ Retake                        │          │
   └──────────────────────  landing                        error ◀───────┘
   └───────── "Search your supplement" ──▶ sheet ──▶ loading(manual) ──▶ result
```

| State | Owns the viewport | Primary action |
|---|---|---|
| landing | grading notice, search pill, dark live viewfinder with the H1, shutter, "Upload a photo" | shutter |
| staged | the photo | "Scan this label"; retake |
| loading | progress panel with the stage list; the "Save your result" card when sign-in is configured | — |
| result | compact header, grading notice, warnings, report sections; focus and scroll move to it (instant under reduced motion) | "Scan another" (top and bottom) |
| error / not a label / not supported | the same header slot plus one note | "Scan another" |

**Camera:** a live `getUserMedia` viewfinder (`components/scan/scan-camera.tsx`,
capture via `lib/camera/capture.ts`), stopped on capture, unmount and hidden
tab. `vercel.json` sends `Permissions-Policy: camera=(self)`. A
`capture="environment"` file input stays mounted as the fallback for denial,
insecure contexts and browsers without `getUserMedia`.

Phone screenshots of every state: `npm run build && PORT=3111 npm run start &`,
then `node scripts/design_shots.mjs`.

## 12. Installable PWA

`app/manifest.ts` → `/manifest.webmanifest`: launches `/scan/`, standalone,
`background_color #ffffff`, `theme_color #0B0F14`; Android 192/512 icons (any +
maskable), iOS `public/apple-touch-icon.png`, `public/favicon.svg`. No service
worker. Phone check (unverified): iOS Safari on `/scan/` → Share → Add to Home
Screen; Android Chrome → Install app. Launch should open `/scan/` without
browser chrome.
