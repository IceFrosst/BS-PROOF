# BS-PROOF scan — system design

**Status:** implemented 2026-09-07 (founder: "a finalized version of the product
where users scan a supplement and they get a result through deepseek api …
analyzes all parts of a background of the supplement: dose effectiveness,
company background, supplement type compatibility"). This document is the
design; the code is `lib/analyze/scan.ts` and its stage modules.

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
| Who makes it, and what is on record? | printed seals; FDA recalls on file; the model's profile of the company | `label`, `registry`, `model_prior` |

Only the evidence run produces a **number**. Everything else qualifies.

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
  │
  ├─ 0  readLabel            lib/analyze/vision.ts   prompts/label.md v1.1      [MODEL vision]
  │       → LabelRead: ingredient, form, compound dose, servings/day, actives[],
  │         certifications[], manufacturer, country, warnings, claims, spans
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

  → ScanAnalysisV1 { label, product, evidence, dose_effectiveness,
                     compatibility, company, caveats, basis_legend, meta }
```

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
5. **Model knowledge** — unverified, orientation only, dashed badge, never scored

The company profile's regulatory items are the one place model text makes a
factual claim about a named company. They are cross-checked: a recall the model
asserts is marked `registry_corroborated: false` when openFDA holds nothing
under that firm name, and a recall the model omits still appears from the
registry.

## 6. What is deliberately NOT done

- **No pipeline run is started by a scan.** An unscored ingredient gets a
  literature count (Europe PMC, `is_a_score: false`) and a queue entry; a human
  starts extraction solo (CLAUDE.md, label-upload block).
- **No FDA warning-letter lookup.** There is no API; the model may recall one
  and it is shown as model knowledge only.
- **No drug interactions.** The scan reads a label, not a medicine cabinet.
- **No per-user goals yet.** The compatibility check is about the product's own
  actives. A "what else do you take" input is the obvious next step and would
  reuse the same curated table and prompt.

## 7. Files

```
lib/analyze/llm.ts               the model boundary
lib/analyze/vision.ts            label prompt + contract (uses llm)
lib/analyze/evidence-prior.ts    the no-run fallback (stage 2b)
lib/analyze/compatibility.ts     curated table + model fill-in
lib/analyze/company.ts           label + openFDA + model profile
lib/analyze/dose-effectiveness.ts readings off the scored rows
lib/analyze/census.ts            Europe PMC count + demand queue (shared)
lib/analyze/scan.ts              the orchestrator; ScanAnalysisV1
app/api/scan/route.ts            upload validation → analyzeScan
app/scan/page.tsx, components/scan-flow.tsx   the UI
prompts/label.md (v1.1), prompts/company.md, prompts/compatibility.md,
prompts/evidence_prior.md
schemas/label.json, schemas/company.json, schemas/compatibility.json,
schemas/evidence_prior.json
vocab/compatibility.json         curated, cited interactions and form notes
tests/scan.test.ts               the whole flow against fakes, zero model calls
```
