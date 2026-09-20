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
