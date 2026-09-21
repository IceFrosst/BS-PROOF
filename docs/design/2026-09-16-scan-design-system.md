# `/scan` design system — phone-first evidence report (2026-09-16)

> **Preview amendment — four evidence tracks.** The branch
> `preview/restore-four-evidence-lines` restores the result card's defining
> visual: four prominent horizontal tracks stacked vertically. Each dimension
> now owns a full-width row with a label/value/coverage header and a 10px track.
> Teal / blue / coral / gold identify the four dimensions, while the written
> labels and numbers carry the meaning. Exactly 0% is striped and says
> “0% · untested”; it cannot resemble fully tested negative evidence. This
> amendment supersedes only the compact one-line arc treatment and the
> two-accent limit below. The result-state, collapsed details, warnings stack,
> phone ergonomics and all other 2026-09-16 decisions remain in force. Preview
> only; not shipped or deployed.

**Brief (founder):** "make design coherent, simplistic but look scientific … world
class, not vibecoded … phone optimised." Keep the white page, the dark live-camera
block with its overlay, the "Search your supplement" pill above it, the round
shutter below, no Methodology header link, no filename hint, no footer sentence.

**Subject:** a lab-grade evidence report about one supplement, read on a phone in
a shop aisle. **Audience:** a buyer sceptical of marketing. **Primary job:** answer
"does it work, at my dose, in my form" honestly in the first two screens, then let
them dig.

## 1. Tokens (scoped to `.scan-page`)

### Colour — one neutral ramp, semantic accents, four restrained track identities

| token | value | role |
|---|---|---|
| `--sp-white` | `#ffffff` | the only ground. `--paper` / `--white: #fffdf8` never appear on this page |
| `--sp-tint` | `#f3f5f4` | the one grey tint: arc tracks, thumbnail wells, code |
| `--sp-line` | `#dde1df` | every 1px rule and card edge |
| `--sp-mute` | `#5a6660` | secondary text (6.3:1 on white, 5.8:1 on tint); also the "found nothing" dose band |
| `--sp-ink` | `#16231d` | text, the score, the dose marker (same ink as the rest of the site) |
| `--sp-measured` | `#0b6b5a` | **measured** things only: arc fills, benefit band, in-range reading |
| `--sp-unverified` | `#885a00` | **unverified / read-with-care** only: the "Model knowledge" badge text, the dashed model border, the warning stack's left mark |
| `--sp-arc-effect` | `#087769` | “Does it work?” track identity |
| `--sp-arc-form` | `#315ca8` | “In your form?” track identity |
| `--sp-arc-dose` | `#d85d42` | “At your dose?” track identity |
| `--sp-arc-evidence` | `#a06a00` | “Well studied?” track identity |

Green still marks measured content elsewhere and amber still marks model-recalled
or read-with-care content. Inside the outcome card, the four restrained hues are
identity cues for repeated dimensions, not verdicts: every row spells out its
label, numeric value and coverage, and the track length carries coverage. There
are no shadows on the report (the viewfinder keeps its one shadow; it is the
page's single object).

### Type — one family, one scale

System stack already loaded by `layout.tsx` (`Inter, ui-sans-serif, system-ui…`);
no web-font request is added.

| step | px | use |
|---|---|---|
| 13 | `--fs-1` | small labels, coverage %, badges, meta |
| 15 | `--fs-2` | body copy, dl values, readings |
| 17 | `--fs-3` | outcome names, product name in the scanned header |
| 22 | `--fs-4` | section titles ("Does it work?") |
| 28 | `--fs-5` | reserved (sheet title on wide screens) |
| 40 | `--fs-6` | **the score** — the page's one bold moment |

Sentence case everywhere. No tracked ALL-CAPS labels. Numerals are
`tabular-nums` wherever they sit in a column (arc values, coverage, dl values,
dose scale). Line length is capped at `62ch` for prose.

### Shape & space

- `--sp-radius: 12px` — the ONE radius (outcome cards, thumbnail, chips use it;
  the viewfinder keeps its 24px because it is not a card, it is the camera).
- Rules, not boxes: sections are separated by a 1px `--sp-line` top rule. Only
  the outcome cards, the model-knowledge items and the warning stack are
  contained; everything else flows on the white ground.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 (`--sp-1 … --sp-6`).
- Targets ≥ 44px. Primary action of every state at the bottom of that state.
  `env(safe-area-inset-bottom)` on the sheet and the page's bottom padding.

## 2. State model

```
landing ──shutter/upload──▶ staged ──"Scan this label"──▶ loading ──▶ result
   ▲                          │ Retake                        │          │
   │                          ▼                               ▼          │
   └──────────────────────  landing                        error ◀───────┘
   ▲                                                                     │
   └───────────── "Search your supplement" ──▶ sheet ──▶ loading(manual) ─┘
```

| state | what owns the viewport | primary action (bottom) |
|---|---|---|
| **landing** | search pill, dark viewfinder with H1 overlay, shutter, "Upload a photo" | shutter |
| **staged** | the photo, full width | "Scan this label"; Retake / Choose a different image under it |
| **loading** | a progress panel: photo thumbnail dimmed at left, stage list with the current step marked, indeterminate bar; the Google "Save your result" card is the ONE call to action when configured | (none disabled — nothing looks broken) |
| **result** | the report. The capture chrome is GONE; a compact scanned-product header (56px thumbnail or a "Typed by you" chip, product name, brand, "Scan another") sits at the top, focus and scroll move to it (`prefers-reduced-motion` → instant) | "Scan another" (header, and repeated at the very end) |
| **error** | the same header slot with the error note ("Could not scan that." + reason) | "Scan another" |
| **not a label** | header + one note: what it needs instead | "Scan another" |
| **ingredient not supported** | header + note ("no data, not a low score"), covered list, any literature disclosure | "Scan another" |
| **manual result** | identical to result, header shows a "Typed by you" chip instead of a thumbnail, facts under "What you entered"; never a read confidence, spans or vision model | "Scan another" |

Sign-in lock (when configured, signed out): the "Save your result" card sits above
the report, which is blurred and `inert` — unchanged behaviour, restyled to the
same card treatment.

## 3. Result page wireframe at 390px

```
┌──────────────────────────────────────────┐
│ B·S PROOF                                │  site header (unchanged)
├──────────────────────────────────────────┤
│ ┌────┐  Creatine Pro 5000        Scan    │  scanned-product header
│ │img │  by Nordic Labs          another  │  (thumbnail / typed chip)
│ └────┘  As printed ⟨badge⟩               │
│ Ingredient        Creatine Monohydrate   │  facts as a 2-col dl
│ Form              creatine monohydrate   │
│ Dose per serving  5 g compound           │
│ Active moiety     4.4 g                  │
│ Servings per day  1                      │
│ Read confidence   high                   │
│ Read from: "Creatine Monohydrate 5 g"…   │
├──────────────────────────────────────────┤
│ Before you read the score                │  ONE compact stack
│ ▌Not a product claim — run is marked     │  validity: always open
│ ▌experimental. Not approved for public…  │
│ ▌Multi-ingredient product            ▸   │  <details> rows,
│ ▌Funding & independence              ▸   │  one line each,
│ ▌Publication bias                    ▸   │  full text inside
│ ▌MLM / direct-selling business model ▸   │
├──────────────────────────────────────────┤
│ Does it work?            Evidence run    │  section title + badge
│ ┌──────────────────────────────────────┐ │
│ │ Endurance performance          60   │ │  score = the bold moment
│ │ probably works                      │ │
│ │ Does it work?    +0.73   100% coverage│ │  four full-width rows
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │  label + value + coverage,
│ │ In your form?    +0.70    92% coverage│ │  then a prominent track
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░ │ │
│ │ At your dose?    +0.47    51% coverage│ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░ │ │
│ │ Well studied?             36% coverage│ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░ │ │
│ │ 3 trials   79% applies to your tub  │ │
│ └──────────────────────────────────────┘ │
│ … ×4 outcomes                            │
├──────────────────────────────────────────┤
│ Is your dose the dose that worked?       │
│           Evidence run  As printed       │
│ Endurance performance     closeness 0.78 │
│ ░░░░▓░░░░░░░│░░░░░░░░░░░░░░  0 — 5.5 g   │  bar: benefit band, null band, marker
│ 4.4 g sits inside the range…             │
│ … ×4                                     │
├──────────────────────────────────────────┤
│ Does the form and the mix hold up?       │
│ …form fit, cited notes, actives, pairs   │  model items: dashed amber edge + badge
├──────────────────────────────────────────┤
│ Who makes it, and what is on record?     │
│ Printed on the label      As printed     │
│ FDA enforcement reports   Public registry│
│ Company profile           Model knowledge│
├──────────────────────────────────────────┤
│ How to read the source badges         ▸  │  collapsed <details>
│ Technical details                     ▸  │  models, stage timings, run id,
│                                          │  app version, how numbers were made
│ ┌──────────────────────────────────────┐ │
│ │            Scan another              │ │  thumb-reachable
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

Alignment: everything left-aligned (a report is read); only the camera overlay
and the shutter are centred (a viewfinder is aimed). Numbers right-align in
their columns.

## 4. Critique against the skill's defaults (before building)

Worked through "what would I produce for any evidence-report page?" and compared:

- *Default:* big number + small label + supporting stats + gradient accent. *Here:*
  the number IS the subject (invariant 8 says it must never travel without its
  arcs), so it stays, but the "supporting stats" are the four arcs as a ruled
  table, there is no gradient, and every other number on the page is 13–15px.
  Kept, deliberately.
- *Default:* cream ground, terracotta accent (the current page). *Changed:* pure
  white, green = measured, amber = unverified. In the preview card only, four
  restrained track hues aid repeated-dimension scanning; words and track length,
  never hue alone, carry meaning.
- *Default:* SaaS card kit (identical rounded cards, one radius everywhere,
  soft shadows). *Changed:* rules between sections, cards only for the
  outcome rows and the model-knowledge items where containment says
  "this is one unit"; one radius; no shadows on the report.
- *Default:* tracked ALL-CAPS eyebrows above every heading, middle-dot meta
  strings. *Removed* — see §5.
- *Default:* broadsheet hairlines with zero radius. *Avoided:* 12px radius on
  contained things, generous 24px section spacing; it should read as a lab
  report, not a newspaper.
- *Default:* `→` on buttons, "WORD — fragment" labels. None.
- *Default:* fade-in on every section. *Only motion:* the scroll to the result
  (answers the user's action; instant under `prefers-reduced-motion`) and the
  indeterminate loading bar (which is the information).

## 5. Tells removed from the current page

1. ALL-CAPS tracked eyebrow above every section title ("EVIDENCE", "DOSE" …) —
   deleted; the question-form title carries the section alone.
2. ALL-CAPS arc labels, dl terms, badge text, severity labels, field labels in
   the sheet — all sentence case.
3. Middle-dot meta strings (`87% of the evidence · ladder`, `2024-03-11 · Class II
   · Terminated`, `Supplement Facts panel · PNG, JPEG, WebP · up to 12 MB`,
   `absorption · moderate`, `kind · year`) — rewritten as separate cells,
   commas or sentences.
4. Cream card washes (`--paper`, `--paper-2`, `--white: #fffdf8`) inside a white
   page — gone; white and one tint.
5. Four arc colours originally collapsed to one measured green. **Preview
   amendment:** teal, blue, coral and gold return only as restrained track
   identities because the four stacked lines were the product's main visual;
   labels, values, track lengths and coverage text still do all semantic work.
6. Dashed / dotted / solid / tinted badge kit in five colours — one quiet outlined
   family, model knowledge alone is dashed + amber.
7. Coloured top borders per card tone — removed; the verdict word and the number
   say it.
8. Repeated "% of the evidence" sentence under every arc — one coverage cell.
9. Three separate yellow boxes + caveats + validity banner — one stack.
10. Loading state = greyed pill + one teal line — replaced by the progress panel.
11. Result rendered below the capture chrome with no transition — the capture
    chrome collapses into the scanned-product header and focus moves.

## 6. Build log — what the screenshots changed (original pass + preview)

Measured with `scripts/design_shots.mjs` against `tests/fixtures/scan-photo-rich.json`
(3 actives, a recall, a suspected-MLM company, funding + publication concerns).

| pass | 390 px height | 360 px height | what moved |
|---|---|---|---|
| before | 9911 | 10424 | — |
| 1 | 6181 | 6458 | state model, one stack, one-line arcs, collapsed legend/technical |
| 2 | 5526 | 5756 | header facts → one sentence + `Label details`; notice rows → title-only on phones (the truncated lede was useless at 150 px); arc label "How well studied?"; footnotes inline |
| 3 | 4919 | 5137 | model company facts → `<details>`; spacing scale applied consistently; dose legend copy shortened; arc label "Well studied?" (fits 360 without ellipsis) |
| four-lines preview 1 | 5227 | 5445 | each dimension moved to a full-width 10px track with teal / blue / coral / gold identity; zero coverage striped; 0px horizontal overflow |
| four-lines preview final | **5227** | **5445** | visual review found the evidence row's em dash implied missing data even though that dimension is pure quantity; removed that dash and retained right-aligned coverage; 0px horizontal overflow |

The preview adds only 308px at each width versus pass 3 and remains 47% shorter
than the pre-redesign 390 page (5227 vs 9911) and 48% shorter at 360 (5445 vs
10424). Final references copied from `/tmp/four-lines-shots`:

- `docs/design/ref/four-lines-preview/390-5-result-full.png`
- `docs/design/ref/four-lines-preview/390-5-result-tile-01.png`
- `docs/design/ref/four-lines-preview/390-5-result-tile-02.png`
- `docs/design/ref/four-lines-preview/360-5-result-full.png`
- `docs/design/ref/four-lines-preview/360-5-result-tile-01.png`
- `docs/design/ref/four-lines-preview/360-5-result-tile-02.png`

Decisions taken against the wireframe while looking at the tiles:

- The header's definition list was 1.3 screens tall on its own; the buyer's
  question is answered by one sentence ("Creatine monohydrate, 5 g compound per
  serving, 4.4 g active, 1 serving a day."), so the dl (read confidence, quoted
  spans) moved under `Label details`. The basis badge stays on the sentence.
- Notice rows: on phones the row is title + chevron only. The lede reappears at
  ≥ 421 px, truncated to one line. The full text is always one tap away.
- `.sc-again` sits in the header at every width (3-column grid, 48 px thumb
  under 380 px) rather than dropping to its own row.
- The shared footer's middle-dot tagline is hidden on this page only; "Scores
  are not medical advice." stays.
- The 503 `analyzer_unavailable` answer comes back with a `status`, so it is a
  result, not an error: header reads "Scan did not finish / Photo could not be
  analysed" and the explanatory box says what to do (search by name).
- Playwright's full-page capture paints the fixed skip-link mid-page when the
  page is scrolled; the script scrolls to the top before every full-page shot.
  It is a capture artefact, not a UI bug (verified `document.activeElement` is
  the result header after every scan).

axe (wcag2a/aa/2.1/2.2, Pixel 7): 0 violations on landing, sheet, staged,
loading, result, and result with every `<details>` open. Keyboard: first Tab
after a result lands on `Scan another` with a 3 px ink outline.

## Preview addendum — outcome tabs (2026-09-16, preview branch only)

The "Does it work?" section now renders `OutcomeTabs` instead of a vertical
stack of cards. Tab 1 **Outcomes (n)** is a list: one row per outcome with its
score /100, verdict word and a chevron; there is deliberately **no averaged
overall number** (a product is not one benefit — see
`2026-09-11-effect-bar-and-outcomes-tab.md`). Every further tab is one outcome
and shows its full card with the four full-width tracks. Tapping a list row
opens that outcome's tab and moves focus to the panel; `← All outcomes` returns.
WAI-ARIA tablist/tab/tabpanel with arrow/Home/End keys; strip scrolls
horizontally on phones; 44 px targets. Result height @390: 4253 px (was 5227
with all cards stacked). Screenshots: `docs/design/ref/tabs-preview/`.

### Outcomes list, revised (founder, 2026-09-16 evening)
Rows are progress bars: name, score as a percentage, bar filled to it, and a
compact `More` button beneath the percentage, opening that outcome's tab. Visible legacy “Test rubric” stamps are removed from the card. The verdict word is gone
from the list (bar + number carry it). Immediately above the Outcomes heading/list sits a compact **General score** tile: the mean in a white rounded square, with "Average of N outcome scores" beside it. This reverses the 2026-09-11 "no overall number" rule by founder
decision; the label is the guard against reading it as a verdict. Same treatment in `app/design-lab/ab` (Hero + Overlap layouts only).

Score bars use a continuous direction palette: low scores move through red, middle scores through amber, and stronger scores toward green. Evidence coverage/certainty controls saturation and lightness, so a weak signal is visibly washed rather than painted with the confidence of a strong one; color never replaces the numeric score. Outcome rows use a quiet underlined `More` action in the right column, directly under the percentage, with the full-width bar below both columns. Warning disclosures are hidden behind one native `<details>` summary (`N warnings` / `N evidence warnings`); the run-validity banner remains visible before every score.

### Four founder corrections to the outcome rows and warnings (2026-09-16, later — preview branch only)

All four are **presentation-only**: no scoring constant, no `lib/analyze/**`, no
`app/api/**`, no prompt, schema or anything under `pipeline/` was touched. Both
surfaces were changed together so the lab card and `/scan` stay identical:
`app/design-lab/ab/prototype.tsx` + `ab.css`, `components/scan-flow.tsx` + the
`/scan` block of `app/globals.css`.

1. **The warnings summary is one clean row.** The sub-line "disclosure only, no
   score penalty" (lab) and "Open before deciding" (`/scan`) are deleted; the
   count alone is the label (`⚠ N evidence warnings` / `N warnings`) with the
   chevron hard right. Both summaries are now `display:flex` with
   `justify-content:space-between` instead of a two-row grid. The policy the old
   sub-line stated has not changed and is still written inside each warning
   ("does not reduce Evidence or the outcome score").
2. **A funding or publication-bias warning is built only when there is a real
   concern.** Filtered at the SOURCE by status in
   `app/design-lab/ab/evidence-warnings.ts`, never by matching a title in the
   view: `auditWarnings` emits the funding row only when the audit's
   industry/one-lab gate fired and the publication row only when the checklist
   recorded `concern`. `unknown`, `supported` and not-assessed emit nothing, so
   an outcome with no real concern shows **no warnings block at all** (measured
   on the retained audits: 2 of 30 outcomes now carry a warning, and none carries
   a funding one). `researchWarnings` was deleted with the same reasoning — the
   effect-only pass grades neither topic, so every row it produced was a
   not-assessed placeholder; each source's funding sentence is still a line in
   the Effect row ("Funding — disclosure only, never a score penalty") and any
   Egger/funnel note is still printed under "Method limits". On `/scan`,
   `lib/analyze/literature-disclosures.ts` already rendered only `concern` and
   was verified unchanged. Silence is not a clean bill of health, and the
   Evidence row still says so in words.
3. **The gates flag strip is gone** (`<details class="ab-gates">`, "⚑ Best RCT is
   small or short") along with its CSS and the now-unused `firedGates` read in
   the view. `score()` still computes `firedGates` — it is what applies the caps
   — and the caps are still spelled out in the Evidence row's "Current rubric"
   sentence.
4. **The outcome row is ONE unit.** It was reading as three fragments: a lone
   "More" link floating in the middle of the row and a bar detached at the
   bottom. Now, in both surfaces: line 1 = outcome name (left, semibold) and the
   percentage (right, tabular, coloured by the score ramp), line 2 = population
   in muted small text (lab only — `/scan` rows carry no population), line 3 =
   the full-width progress bar, and the only affordance is a **single small
   chevron on the right of line 1**. The "More" link is deleted rather than
   moved: the whole row already was the button, so a second visual control was
   claiming to be a separate target it never was. Two grid rows rather than
   three keeps the bar tied to the text it belongs to. The row stays one
   keyboard-focusable control with no nested interactive elements; measured
   heights 67–92px (`/scan`) and 72–105px (lab), all past 44px, with the 3px
   focus ring drawn around the whole row (verified by keyboard Tab, not
   `element.focus()`). Kept unchanged: the score colour ramp (red→amber→green by
   score, saturation/lightness by evidence coverage), the General score tile
   above the list, and gated outcomes rendering "—" over a hatched track.

Result height @390 is 4226px (was 4230 before these changes); horizontal
overflow 0px at both 390 and 360. References (Playwright, iPhone 13 / Pixel 5
emulation and a 1440px desktop):
`docs/design/ref/tabs-preview/2026-09-16-*.png` plus the refreshed
`390-5b/5c`, `360-5b/5c`, `lab-ab-hero.png`, `lab-warning-collapsed.png` and
`lab-warning-open.png`; `public/previews/lab-ab-hero.png` and
`public/previews/scan-tabs-outcomes-390.png` were refreshed from the same run.
Tests: `tests/evidence-warnings.test.tsx` (concern-only construction, plus a new
case proving an unknown-status outcome renders no warnings block),
`tests/effect-presentation.test.ts` (row is one unit, one button, chevron order;
no gates strip), `tests/scan-result-state.test.tsx` (single-row summary with no
`<small>`; row children are exactly name / score / chevron / track).

---

## 2026-09-16 — four more warning kinds in the lab card's collapsed block (preview only)

Same collapsed `⚠ N evidence warnings` block, four more kinds, each built **only
when it is actually true** for the selected product/outcome. Changed files:
`app/design-lab/ab/evidence-warnings.ts`, `app/design-lab/ab/prototype.tsx`,
`tests/evidence-warnings.test.tsx`. `/scan` is untouched — it already carries
the same three product warnings in its own bundle (`data.caveats` supplies
`multi_ingredient_product` and `servings_not_stated`, `businessModelDisclosure`
supplies MLM), verified and pinned by a source-text test rather than edited.
No scoring constant, `lib/analyze/**`, `app/api/**`, prompt, schema or
`pipeline/` file was changed.

**The rows, in display order** (product-level first, then outcome-level):

| id | scope | fires when | wording source |
|---|---|---|---|
| `multi_ingredient_product` | product | the scenario declares more than one active | the `multi_ingredient_product` caveat text in `lib/analyze/scan.ts`, verbatim (its ingredient slot filled as "this ingredient") |
| `servings_not_stated` | product | the scenario declares that servings per day are not on the label | the `servings_not_stated` caveat text in `lib/analyze/scan.ts`, label branch, verbatim |
| `mlm` | product | the scenario declares a `confirmed_mlm` / `suspected_mlm` seller | built by calling production `businessModelDisclosure()`, so title and body are the same bytes `/scan` shows |
| `no_human_controlled_trial` | outcome | `ledger.gates.rctCount === 0` — the same condition that makes `score()` push "No human controlled trial" | new one-liner in the same voice; states it is a **cap**, not a disclosure (certainty held at 0, no outcome score) |
| `funding` | outcome | unchanged (industry/one-lab gate fired) | unchanged |
| `publication` | outcome | unchanged (checklist `concern`) | unchanged |

**Honesty — how the three product facts are sourced.** They are never inferred.
`ProductDeclarations` is optional per scenario and every field defaults to
absent, so a scenario that declares nothing renders nothing. The three retained
audits (creatine, vitamin D, magnesium) and the three effect-only research
passes declare **nothing at all**: they are single-ingredient products with a
stated daily dose and no known MLM seller, and asserting any of these three
about a real brand would be inventing a fact. A test renders all 30 retained
audit outcomes and asserts none of the three ids, nor the strings "MLM /
direct-selling", "more than one active" or "Servings per day", ever appears.

Which scenario carries which flag, and why that is truthful:

- **`none` — "Nothing to score", Sample blend D · 2 capsules** (fictional):
  `multiIngredient` + `servingsNotStated`. True by construction — the sample is
  a proprietary multi-active blend whose own Form/Dose text already says
  "amounts per ingredient not printed", and its dose is "2 capsules" with no
  servings per day, which is exactly what `servings_not_stated` describes.
- **`thin` — "One small trial", Sample extract C · 400 mg/day** (fictional):
  `businessModel.status = confirmed_mlm`. No existing fictional scenario had a
  seller, so one was declared here; the card says so in three places — the
  sidebar picker (`· fictional seller`), the fictional footnote ("Its seller is
  fictional too: the MLM / direct-selling disclosure here exercises the row and
  names no real company") and a stamp inside the row itself ("Fictional sample
  seller — declared by this hand-written sample, not a model read of any real
  company"). MLM keeps its production semantics: a disclosure that never
  changes a number.
- **`no_human_controlled_trial`** is derived from real ledger data, so it *does*
  fire on a real audit — magnesium "Diagnosed anxiety disorder" (`rctCount: 0`)
  shows it as its single warning. That is required, not a leak: it is read off
  the run's own counted trials.

Rendering: each row is still a native `<details>` whose `<summary>` is
`title · status`, same markup and CSS family, no new visual kit. The
retained-audit stamp, the quoted source notes and the per-outcome source links
now render **only** for the two audit-prose warnings (`auditQuoted`), because a
label fact or a counted-trial cap has no quoted commentary and printing "no
specific source detail was retained" under it would invent a missing literature
note. Statuses were shortened once after looking at the screenshots ("Evidence
is about one ingredient", "Daily dose not computed", "Disclosure only") so each
summary wraps to two lines and the three-row stack does not read as cramped.

References (Playwright, 1440px desktop, `DESIGN_LAB=1` production build on
:3111), `docs/design/ref/tabs-preview/`:
`2026-09-16-lab-warning-real-publication-{collapsed,open}.png` (creatine
"Strength when you lift weights": publication bias only),
`2026-09-16-lab-warning-fictional-product-{collapsed,open,rows-expanded}.png`
(blend D "Cognitive function": 3 warnings, multi-ingredient → servings → cap),
`2026-09-16-lab-warning-fictional-mlm-{open,rows-expanded}.png` (extract C
"Energy": MLM → cap), `2026-09-16-lab-warning-real-gate-open.png` (magnesium
"Diagnosed anxiety disorder": the cap on a real audit) and
`2026-09-16-lab-warning-none.png` (magnesium "Sleep quality (poor sleepers)":
no block at all). `public/previews/lab-warning-collapsed.png` and
`lab-warning-open.png` were refreshed from the blend-D pair, which is the
scenario that shows the stack and the count.
Tests: `tests/evidence-warnings.test.tsx` — declared-nothing builds nothing,
one row per declared fact in product order, production-wording equality (read
out of `lib/analyze/scan.ts` and out of `businessModelDisclosure`), the gate
row derived from `rctCount === 0` across all 30 audit outcomes, no
multi-ingredient/servings/MLM on any real audit or research pass, the count
always equal to the number of rows drawn, and an outcome where none of the four
conditions holds drawing no block.

## 2026-09-16 — the lab card reads in plain language, the audit's wording stays one tap away (preview only)

**What changed.** Every expandable dimension row on the lab A/B card
(`/design-lab/ab/`) now renders a **plain-language body**: the same facts in
shop-floor English, jargon explained inline the first time it appears ("1RM (the
heaviest weight you can lift once)", "I2 = 0% (the trials agreed with each
other)"). Under it sits one quiet native `<details>` labelled **"Exact wording
from the audit"** holding the audit's own sentences, verbatim and complete, for
exactly the same fields. Nothing is removed and nothing is summarised away.

**Where the plain text comes from, and what it is not.** It is
**model-written**, from sidecar files at `app/design-lab/ab/audits/plain/
{creatine,vitamin-d,magnesium}.json`, keyed `"<outcome name>||<population>"`
then dimension then field (plus a `summary` group for the reported-effect
lines). A typed loader, `app/design-lab/ab/plain-language.ts`, validates each
file at module load (unknown group, unknown field, non-string or blank value →
throw) and exposes `plainFor(productKey, outcomeKey)` and
`plainPair(entry, dimension, field, original) -> {plain, original, rewritten}`.

Three properties, all enforced rather than promised:

1. **No number was changed.** The rewrite carries every figure, unit, interval,
   p-value, sample size and direction across unchanged; it may re-order them
   into a clearer sentence and may not round, drop or invent one. The audit
   original is retained verbatim and is reachable in one tap, so any sentence
   can be checked against the sentence it came from.
2. **It is presentation only.** No score, ledger, gate, cap or warning reads the
   sidecar. `score()`, `ledgerFromAudit()`, `auditWarnings()` and the warnings
   block are untouched, as are the `Previous AI audit · not reverified` stamp,
   the `Found / Missing / Would move it` labels and the source links.
3. **A missing key falls back to the original.** `plainPair()` returns the audit
   text when the sidecar has nothing, so a partially covered outcome renders the
   audit sentence rather than a gap. In the shipped data exactly one field
   family falls back: creatine's `form.move` (all 8 creatine outcomes), which
   the audit itself records as "—". Where a field falls back, the body already
   IS the audit's wording, so the details shows the audit block only when at
   least one field on that row differs.

The Evidence row's generated "Current rubric:" sentence is appended to BOTH
versions by the same `evidenceDetail()` call, so the plain body and the verbatim
block each carry the live scoring rule and neither can read as the audit's.
Person fit is dropped from both surfaces; retained population fields are plain
source context and carry no score or details.

**Style.** No new visual kit and no new colour. The plain body is the normal
`.ab-bar-detail` body text; `.ab-verbatim` is a hairline, an 11px muted
`600`-weight summary with the same `⌄` caret idiom as `.ab-warnings`, and, when
open, an indented 11.5px quotation behind a `var(--ab-line)` rule, opening with
the `.ab-stamp` line that says the body above was written by a model and that no
number was changed. One iteration after looking at the first screenshots: the
summary had `display:flex` and so lost its disclosure triangle (it read as a
heading), and the opened block sat at the same weight as the body — the caret
and the indented smaller quotation fixed both.

References (Playwright, 1440px desktop, `DESIGN_LAB=1` production build on
:3111), `docs/design/ref/tabs-preview/`:
`2026-09-16-plain-effect-body.png` (creatine "Strength when you lift weights",
Effect expanded: plain body under the untouched stamp and warnings block),
`2026-09-16-plain-effect-verbatim-{closed,open}.png` and
`2026-09-16-plain-evidence-verbatim-{closed,open}.png`.
Tests: `tests/plain-language.test.tsx` — all 30 retained audit outcomes have a
sidecar entry with all four dimensions, each file parses with no empty string
and a malformed one throws, the rendered card shows the plain text ABOVE the
details and the audit string INSIDE it (spot check plus all 30 Effect rows), the
Evidence row prints "Current rubric:" exactly twice, and an uncovered field
(creatine `form.move`) falls back to the audit text.

## 2026-09-16 — the plain-language rule moves INTO the prompts, and the warning bodies follow (preview only)

**Why.** The previous pass rewrote audit prose in a sidecar, which fixes the lab
card and nothing else: the model still WROTE in journal English, and every
sentence `/scan` gets live from a model was untouched. So the rule now lives in
the prompt, and the code-authored warning bodies were rewritten to the same
standard by hand. Target reader: someone who finished high school, reading on a
phone in a shop.

**Where the rule lives.** `prompts/_shared.md` is NOT the carrier. It is
prepended by `claude_adapter._system_prompt()` to the S1–S8 extraction agents
only; the deployed app's loaders (`lib/analyze/{compatibility,company,
literature-warnings,evidence-prior,vision}.ts`) each `readFileSync` their own
prompt with no shared preamble. Putting the block in `_shared.md` would have
missed every user-facing prompt and invalidated ~1000 cached S1–S8 extractions
for nothing. The block is therefore pasted **byte-identically** into the five
prompts whose free text a person reads, pinned by
`tests/plain-language-prompts.test.ts`:

| prompt | version before | version after | pinned in |
|---|---|---|---|
| `prompts/compatibility.md` | `compat-v1.0` | `compat-v1.1` | `lib/analyze/compatibility.ts` |
| `prompts/company.md` | `company-v1.1` | `company-v1.2` | `lib/analyze/company.ts` |
| `prompts/literature_warnings.md` | `literature-warnings-v1.0` | `literature-warnings-v1.1` | `lib/analyze/literature-warnings.ts` |
| `prompts/evidence_prior.md` | `evidence-prior-v1.0` | `evidence-prior-v1.1` | `lib/analyze/evidence-prior.ts` |
| `prompts/research_audit.md` | `audit-v0.2` | `audit-v0.4` | the prompt header itself (offline audit path; no deployed model call) |

The rule requires, for every free-text field: 2–4 short sentences, active voice,
sentence case, plain words (a per-field "one sentence" or character limit still
wins); every number, unit, confidence interval, p-value and sample size kept
exactly, never rounded, dropped or invented; each technical term explained
inline in parentheses the first time it appears; no softening and no
strengthening, a hedge stays a hedge, no advice or recommendation; no markdown,
bullets, emoji, em-dash connectors or marketing voice; uncertainty stated as a
plain fact ("nobody has tested this"), not as jargon.

**Not touched.** `prompts/label.md` (its free text is verbatim label copy —
`evidence_spans`, `warnings_printed`, `claims_printed` — and a "rewrite it
plainly" rule there would break the copy-exactly contract) and the S1–S8
extraction prompts, whose output is numbers, enums and quoted spans and is never
rendered as prose to an end user (`/scan` reads retained artifacts through
`lib/analyze/product-score.ts`, which surfaces numbers plus the run's own
validity note). The three retained audits still record `audit-v0.2`, because
that is the prompt they were actually run against.

**Warning bodies, both surfaces, meaning unchanged.** Rewritten in
`lib/analyze/literature-disclosures.ts` (funding, publication bias),
`lib/analyze/business-model.ts` (MLM), the five caveats in
`lib/analyze/scan.ts` (`typed_not_verified`, `multi_ingredient_product`,
`dose_not_convertible`, `servings_not_stated`, `model_sections_skipped`) and the
six lab explanations in `app/design-lab/ab/evidence-warnings.ts`. Every
qualifier survives: a funding or publication row still says it is a disclosure
and not a score penalty ("it does not affect the evidence score"), the MLM row
still opens "Model knowledge — unverified" and still says a distribution model
is not a legal judgement and does not affect the score, and the
no-human-controlled-trial row is still described as a cap, not a disclosure.
The shared strings stay byte-identical across the surfaces: the lab reuses
production `businessModelDisclosure()` for MLM and copies the two caveat
sentences out of `lib/analyze/scan.ts`, which `tests/evidence-warnings.test.tsx`
re-pins against the new wording.

Examples (before → after):

- `typed_not_verified`: "These figures were typed, not read from a label. The
  analysis is about the ingredient, form and dose entered; nothing here checked
  that a product actually contains them." → "You typed these figures. Nobody
  read them off a label. This analysis is about the ingredient, form and dose
  you entered. Nothing here checked that a real product contains them."
- `dose_not_convertible` (hydrate branch): "The dose axis is unavailable: this
  form's hydration state is not stated, so its elemental dose cannot be computed
  without guessing." → "Your dose could not be checked. The label does not say
  how much of this form is water, so the amount of the active ingredient in it
  cannot be worked out without guessing."
- publication bias (lab): "Positive results may be more likely to be published,
  making a literature look more favourable. …" → "Publication bias means studies
  that found something are more likely to get published than studies that found
  nothing. That can make an ingredient look better than it is. …"

**No scoring, gating or condition changed.** Which condition fires which
warning, the status gating (`concern`-only for the two literature disclosures,
`confirmed_mlm`/`suspected_mlm`-only for MLM, `rctCount === 0` for the cap), the
scores, the schemas and the pipeline maths are all untouched; these are display
strings and prompt prose.

**Cache finding.** The deployed app has **no model-response cache**: nothing in
`lib/analyze/` or `app/api/scan` stores or keys a model reply (the route sends
`Cache-Control: no-store`), and the prompt-version constants are cache-DOMAIN
markers stamped into `meta.prompt_versions` for provenance. So the bumps cannot
invalidate stale prose — there is none to invalidate — and the residual risk is
only stored artifacts and fixtures written under the old versions, each of which
carries its own version stamp.

**One iteration after looking at the shots.** The MLM sentence and the
publication-bias sentence were each one long clause-joined sentence, which also
became the collapsed one-line lede on `/scan` (`firstSentence()`); both were
split in two so the lede is short and the body reads in phone-sized sentences.

References (Playwright, `DESIGN_LAB=1` production build on :3111),
`docs/design/ref/tabs-preview/`:
`2026-09-16-plainwarn-scan-{390,360}-bundle-open.png` (the `/scan` warnings
bundle expanded with all four bodies open, from `scripts/design_shots.mjs`,
which gained the expand-and-shoot step),
`2026-09-16-plainwarn-scan-390-viewport.png`, and the lab rows
`2026-09-16-plainwarn-lab-{product-warnings,publication,gate,mlm}.png`.
Tests: `tests/plain-language-prompts.test.ts` (block byte-identical in all five
prompts, each rule present, absent from `_shared.md`/`label.md`/the S-prompts,
all four constants bumped) plus the updated
`tests/{evidence-warnings,company-business-model,literature-warnings,
literature-warnings-render,scan,scan-manual,scan-mlm-warning,
research-audit-schema}` and `tests/fixtures/scan-photo-rich.json`.

---

## The design-lab A/B card's design now SHIPS on `/scan` (2026-09-16, preview branch)

**Founder:** ship the design-lab card's look and interaction model on the live
scanner. `app/design-lab/ab/prototype.tsx` + `ab.css` stay exactly as they are —
they remain the visual reference and the route keeps working; `ab.css` is **not**
imported into production. Everything below is `components/scan-flow.tsx` plus the
`/scan` block of `app/globals.css` (scoped `.scan-page` / `.sc-*`). **No scoring,
API, prompt, schema or pipeline file changed. No new number is minted:** the
General score is still the labelled plain mean of the outcome composites, and
every value on the card is read straight off the answer the route already
returns.

### What was adopted

- **The card shell.** The tab panel is now one calm paper surface
  (`--sp-paper: #fafbfa`, 18px radius, one hairline, no shadow) holding either the
  Outcomes landing list or one outcome — the lab's `.ab-card`, translated into
  this page's neutral ramp so the "no cream, no shadows on the report" token rule
  from §1 still holds.
- **The outcome tab strip** and the **Outcomes landing list with the compact
  General score tile** (both already shipped in the tabs preview) keep the lab's
  geometry: one row = name + score + one chevron on line 1, the full-width
  coloured track across the bottom, the whole row a single 44px+ control.
- **The per-outcome view is now the lab's headline block**: the composite in its
  own rounded white tile beside the outcome name, the verdict word under it, and
  the population as a plain line — on a tint mixed from the score's own colour
  (the shared `scoreSignalColor` ramp, no second ramp).
- **Each dimension is now ONE tappable line** — label, the plain word production
  actually computes, the signed value, a chevron, with the coloured track
  full-width underneath and the coverage under that — **expanding in place** into
  a detail block, exactly like the lab's rows.
- **The collapsed warnings block** with one native `<details>` per warning was
  already shipped in the "Before you read the score" stack and is unchanged; it
  stays above the first number so the validity banner keeps its place.

### What was DROPPED or REMAPPED, because production does not measure it

| lab element | production data source | what renders when it is missing |
|---|---|---|
| 5th bar **"Studied in you"** (person fit) | **none.** Person fit is dropped from the shared rubric and both surfaces; retained `studied_in` data is source context only | **Dropped entirely.** No fifth bar, no profile input, no "population match". The run's recorded `evidence.population` renders as a plain FACT line — once above the Outcomes list ("every outcome below was scored in healthy adults, men and women") and once in the outcome headline — never as a scored bar |
| ordinals **"2/4"**, **"Exact match"**, **"Low"** | **none.** They are the lab rubric's ladders (`certainty/4`, `formFit/4`, `doseFit/4`) | **Dropped.** Each row renders the run's real **signed verdict** (`arcs.<dim>.verdict`, 2 dp, signed) **and** its real **coverage** (`arcs.<dim>.coverage`), per invariant 8. `0.00 @ 0%` keeps its striped "0% · untested" track; `−0.70 @ 100%` is a full track with a red value. The evidence row has no verdict at all (it is a quantity), so it shows coverage only |
| the plain WORD beside each bar | only two exist: the dose axis's `tone` from `lib/analyze/dose-effectiveness.ts` (`in range` / `below the range` / `above the range` / `not assessable`) and the product-level `compatibility.evidence_form_fit.status` (`exact form scored`, …) | **Effect and evidence show no word.** A word was not invented for a number that has none |
| the Effect **reported interval** on its own axis | **none.** A retained run carries no pooled estimate and no CI; the lab draws one because its audit files record `absolute_effect` | **No axis is drawn.** The row keeps the existing coverage track, and the expansion says in words: "This run keeps no pooled estimate or confidence interval, so none is drawn." If a run ever carries one, that is the place to add it |
| "Found / Missing / Would move it" audit prose + "Exact wording from the audit" | **none.** That is written by the research-audit pass, which `/scan` does not run | The expansion is built only from facts the answer carries: what the dimension means, the verdict, the coverage, trial count, polarity, form strength + ladder basis, form-fit status and the forms run so far, your daily dose, the benefit band, the band where nothing was found, closeness, the run's dose tier ("in band"), the server's own dose reading sentence, applicability, the composite, and the retained run id + scoring model. Every fact the old per-card footnote line carried (trials, applicability, form basis, dose match) is in there, under the dimension it belongs to |
| per-outcome warnings inside the card | product-level caveats + literature disclosures + MLM | Unchanged: they stay in the one "Before you read the score" stack **above** the first number (the validity banner must precede every number) |
| the illustrated jar / "FIELD NOTES" photo block | the scanned photo | Unchanged: the real thumbnail in the scanned-product header |

### Everything kept

Camera, shutter, staged photo, upload fallback, search sheet, loading progress
panel, Google sign-in card, the `landing → staged → loading → result | error`
state machine with focus moving to the result, the always-visible run-validity
banner before any number, basis badges on every section, label/entry facts,
company + recalls + certifications, the dose bar, technical details, the badge
legend, and every empty/error state (`analyzer_unavailable`,
`not_a_supplement_label`, `ingredient_not_supported`, `form_not_scored`,
`not_scored`, network error). Nothing reachable before is unreachable now: the
per-outcome footnote line (trials, applicability, form basis, dose match) moved
into the dimension expansions, where each fact sits under the dimension it
belongs to.

### Measurements

Built app, Playwright, mocked `POST /api/scan` with
`tests/fixtures/scan-photo-rich.json` (`scripts/design_shots.mjs`):

| | before (tabs preview) | after (lab card shipped) |
|---|---:|---:|
| result height @390 | 4226 px | **4325 px** |
| result height @360 | 4437 px | **4511 px** |
| horizontal overflow | 0 px | **0 px** |

The ~100 px is the population fact line plus the card's own padding; the report
is still less than half the pre-redesign 9911 px. Targets stay ≥44px (each
dimension row is one 56px-min button), the focus ring is unchanged,
`env(safe-area-inset-bottom)` is unchanged, and the one new transition (the
dimension row's chevron rotation) was added to the existing
`prefers-reduced-motion` block beside `.sc-shutter-ring` and the two summary
chevrons.

**axe (wcag2a/aa, 2.1, 2.2) on the RESULT state at Pixel 7 width: zero
violations** — outcomes list, one outcome, one outcome with all four dimensions
expanded, and with every `<details>` open. Getting there fixed a **pre-existing**
contrast failure: the score ramp's fill lightness (amber `#c68f2f`) is 2.6–2.9:1
as 22–40px type, so the General tile and the outcome-row percentages were failing
WCAG 1.4.3 before this change. `scoreSignalColor` gained a `usage: "fill" |
"text"` argument that keeps the SAME hue and only darkens it (`--sc-score-text`
beside `--sc-score-color`); bars and tints are unchanged. This is not a second
ramp — the hue, and therefore the meaning, is identical, and a test pins that the
dominant channel matches the bar's while the text is darker.

**Two class-name collisions and one wording bug were found by looking at the
shots:** the first pass
named the outcome headline `.sc-headline`, which is the LIVE CAMERA overlay's
`<h1>` class (white text + text-shadow), so the outcome name rendered white and
ghosted. Renamed to `.sc-outcome-headline` / `.sc-outcome-headline-main` /
`.sc-outcome-number`; the viewfinder H1 is untouched. The outcome name also
broke mid-word ("Endurance performanc/e") under the page-wide
`overflow-wrap: anywhere`, fixed with `break-word` on that heading, and the form
expansion read "0.80 on the evidence ladder (ladder)" because the arc's `basis`
is literally `ladder`.

References (`docs/design/ref/tabs-preview/`, prefix `2026-09-16-shipped-`):
`scan-{390,360}-outcomes`, `scan-{390,360}-outcome`, `scan-390-dose-open`,
`scan-390-form-open`, `scan-360-evidence-open`, `scan-390-untested-0pct` beside
`scan-390-failed-100pct` (invariant 8, side by side), `scan-{390,360}-result-full`,
`scan-390-{landing,loading,manual-full,error-503,not-a-label,not-supported}`, and
the design-lab reference at the same width, `lab-390-outcomes` / `lab-390-outcome`.
`public/previews/scan-tabs-outcomes-390.png` and
`public/previews/scan-tabs-outcome-390.png` were refreshed from the same run.
Tests: `tests/scan-result-state.test.tsx` (four rows with verdict **and**
coverage per outcome, the expansion built from real run facts with no person bar /
no ordinals / no interval, the population as a fact line, `0.00 @ 0%` vs
`−0.70 @ 100%`, the validity banner before the first number, and every empty /
error state).

**A live scan was NOT exercised: no model API key exists in this environment.**
The mocked fixture in `scripts/design_shots.mjs` is the substitute.

---

## Retained Evidence Ledger on `/scan` (2026-09-17)

The lab card remains the visual reference, but the live result now selects the
simpler retained Evidence Ledger for an exact single-ingredient match only. The
three targets are shown in the result provenance: creatine monohydrate, 4000 mg
printed compound/day; vitamin D3 (cholecalciferol), 0.05 mg / 50 mcg / 2000 IU
printed/day; and magnesium glycinate, 300 mg printed compound/day. Matching uses
integer-normalized printed mass, exact form, and an explicitly stated daily
serving count. There is no tolerance and no nearby-audit fallback.

The validity line appears before the first number and says the audit is retained
from a previous run, gives its prompt version and target product/dose, and was not
reverified on this scan. Outcomes, General, tabs, and the four expandable rows
come from that matched audit and the shared `score()` implementation: Effect is
its real −3..+3 state (not /4), certainty is x/4, and form/dose are x/4 or `—`
when unknown. The original audit wording, plain-language sidecar and source
inventory are reachable from each relevant expansion. Person fit is not rendered.
Funding and publication bias remain disclosures only.

For every unmatched scan the product facts and existing caveats/company/label
sections remain, the continuous v14 rows remain available as a compatibility
backup, and the page says `No /4 audit for this exact form and daily dose yet`.
Coverage is never converted to /4. A future arbitrary-product audit needs a
source-retrieval service before `research_audit` can be run; the deployed chat
transport has no web access.
