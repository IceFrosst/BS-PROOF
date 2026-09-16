# AI research launch pivot — proposal

Branch: launch/ai-wrapper-planning. Planning only; main and production unchanged.

## Founder requirements
- Live, in-depth web research for every product; no knowledge-only fallback presented as research.
- Preserve the headline score and four-ring presentation.
- Implement research and scoring architecture before broader prompt polish.
- Consolidate production on a controlled Vercel project after preview validation.

## Proposed architecture
1. Extract and let users confirm label facts (including daily dose and botanical standardization); distinguish missing facts from inferred ones.
2. Start a durable asynchronous research job, not a single 60-second scan request. Stream actual job events; persist results and support reconnect. Select job/store infrastructure explicitly before implementation.
3. Research each claim using live search and opened sources: syntheses, human trials, conflicting/null findings, population, magnitude, dose/form match, safety and funding. Record searches, accessible text scope, source identifiers and supporting passages. An abstract-only source must be labelled.
4. Require a claim coverage checklist. Missing data, access barriers, exhausted budget and unresolved contradictions remain explicit. Failure or budget exhaustion yields incomplete status, never a completed score. Research is bounded, but optional detail is not silently skipped.
5. Produce schema-validated findings and an auditable scoring input record. Keep the existing scorer and historical scores untouched.
6. Reuse the four-ring component: effect, form, dose and evidence. Define a NEW versioned AI-research scoring contract before coding any numeric mapping. Do not reuse old coverage values: retrieved-source coverage is not weighted extracted-trial coverage. Missing applicability data renders unknown, not zero. Founder approval is required for rubric constants; propose them in docs/REVIEW_PENDING.md and document in docs/SPEC.md.
7. Render a 0–100 AI-research assessment only when required research and scoring inputs are complete. Identify it explicitly as distinct from historical extracted-trial scores. Show sources, limitations and derivation beside the rings.

## Execution phases
A. Choose search-capable provider and async job infrastructure; approve ring semantics and numeric rubric.
B. Build one end-to-end research job and source validation path on the branch. No pipeline extraction, retained-run dependence or silent model-memory fallback.
C. Integrate a separately versioned deterministic research-assessment scorer and existing ring UI.
D. Evaluate familiar, weak-evidence, botanical, blended and unreadable-label products; test conflicting evidence, missing doses, hallucinated references, unavailable full text, timeouts and reconnects. Run both Python gates plus relevant TS, UI and build gates; owner review required.
E. Polish remaining prompt language and launch UX after architecture is proven.
F. Configure and verify canonical bs-proof-dashboard preview/production; confirm ownership of bs-proof.vercel.app before redirect/transfer. No destructive deployment changes without confirmed access and approval.

## Open decisions
- Search provider/model and actual tool support (the current chat-completions transport has no search).
- Per-scan research budget and acceptable wait; budgets must not force false completion.
- Durable job infrastructure (repository currently has no durable scan store).
- Exact meaning of each ring, source coverage and 0–100 scale; no invented constants.

## Handoff
Planning only. No prompt, runtime, scoring, deployment or production configuration changes made. Existing untracked scripts left untouched.

## Scoring and progress discussion — proposed, not approved
- Use research hierarchy + source-backed quality checklist + fixed mapping, NOT points for source counts or free-form AI scores. Review-first research, supplemented by newer pivotal and contradictory human trials; do not rebuild full per-study S1–S8 extraction for launch.
- Source priority is not automatic quality: assess relevant syntheses, human RCTs, then other human research; observational safety and regulator warnings are evaluated separately. Animal/mechanistic evidence cannot establish human efficacy. Deduplicate overlapping reviews/trials; never invent unique-trial counts.
- Per claim/outcome/population, record source-backed findings, practical effect and precision; assess bias, consistency, precision, directness and publication-bias concerns using a GRADE-inspired checklist, not a claimed formal GRADE review. Fields are supported, concern, or unknown, with source passages. Unknown does not count as passing or as demonstrated poor methodology.
- Effect ring: direction and meaningfulness of benefit, not source popularity; nonsignificance alone is not no-effect proof.
- Evidence ring: certainty of the body of evidence, explicitly a new meaning from historical evidence mass. Keep access/search completeness separate; high certainty can support no benefit.
- Form ring: strength of clinical applicability to exact form/preparation; bioavailability alone is not efficacy. Carry subset findings/limitations alongside any fill.
- Dose ring: match to relevant tested regimens, with population, elemental mass, extract standardization and duration. Higher dose does not increase credit automatically; successful isolated doses do not establish a continuous effective interval. Matching a tested ineffective dose does not imply efficacy. Unknown label/regimen prevents a numeric match rating.
- Score per outcome; do not average unrelated benefits into a universal product score. Mixtures require formula-level distinction and cannot inherit a whole-product score from ingredient scores.
- Headline proposal: effect direction/magnitude qualified by certainty and justified applicability, never a simple average of four rings. No exact weights or numeric tier mapping approved. No-data is unscored, not 50; complete but genuinely inconclusive evidence can be neutral. Safety alerts stay visible independently of benefit. Historical scorer unchanged.
- Numeric rubric requires founder approval and expert/anchor testing, plus repeat research runs and frozen-record reproducibility tests. Every score stores source snapshot, structured findings, rubric/model/prompt versions and reasons.
- Loading UI uses actual events: label confirmed; searching reviews; opening sources; checking contrary findings; comparing form/dose; assessing certainty; validating result. Show source counts with scope (found/opened/included), elapsed time, access barriers, reconnectable job link. No invented percentages, chain-of-thought or fabricated progress. Completion checklist tracks all 11 prompt questions per claim; unresolved fields explicitly reported, skipped work marked incomplete.

## Founder-approved UX requirements and layout choices
- Real-event loading screen approved.
- After label extraction, ask user to confirm/edit brand, supplement/ingredients, form, amount and units, per-serving vs daily basis, servings/day and botanical standardization where relevant. Preserve unknowns; never infer a daily regimen.
- Start provisional research from extracted identity while confirmation is in progress. Mark it provisional; snapshot/version the inputs. User edits trigger invalidation and cancellation/supersession of affected work. Reuse only valid source material; no stale scores may appear. Debounce edits to avoid repeated paid jobs. Lock final scoring to confirmed input version.
- Next ask which outcomes interest the user. Research/scoring continues for all outcomes in a declared discovered scope, independent of user selection. Selection controls presentation only and does not bias research. Show scope and allow adding a missed outcome; do not promise exhaustive coverage of every possible outcome.
- Default results show selected outcomes only; offer Show all researched outcomes. Safety warnings stay visible regardless of selection. Show incomplete/unknown rather than fabricated ratings.
- Present layout alternatives before building: A guided full-screen wizard (recommended mobile launch); B single-page workspace with editable product panel, outcome chips and research progress; C conversational guided assistant with structured confirmation controls and ring-based results.
- Shared result structure: confirmed product header; selected outcome cards with headline plus four rings; plain-language verdict and key limitation; expandable source-backed details; global safety; research timestamp/status and all-outcomes toggle. All mock scores are placeholders, not assessments.
- No frontend implementation until user chooses layout. Numeric ring rubric still pending approval.
