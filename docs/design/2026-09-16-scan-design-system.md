# `/scan` design system — phone-first evidence report (2026-09-16)

**Brief (founder):** "make design coherent, simplistic but look scientific … world
class, not vibecoded … phone optimised." Keep the white page, the dark live-camera
block with its overlay, the "Search your supplement" pill above it, the round
shutter below, no Methodology header link, no filename hint, no footer sentence.

**Subject:** a lab-grade evidence report about one supplement, read on a phone in
a shop aisle. **Audience:** a buyer sceptical of marketing. **Primary job:** answer
"does it work, at my dose, in my form" honestly in the first two screens, then let
them dig.

## 1. Tokens (scoped to `.scan-page`)

### Colour — one neutral ramp, two accents

| token | value | role |
|---|---|---|
| `--sp-white` | `#ffffff` | the only ground. `--paper` / `--white: #fffdf8` never appear on this page |
| `--sp-tint` | `#f3f5f4` | the one grey tint: arc tracks, thumbnail wells, code |
| `--sp-line` | `#dde1df` | every 1px rule and card edge |
| `--sp-mute` | `#5a6660` | secondary text (6.3:1 on white, 5.8:1 on tint); also the "found nothing" dose band |
| `--sp-ink` | `#16231d` | text, the score, the dose marker (same ink as the rest of the site) |
| `--sp-measured` | `#0b6b5a` | **measured** things only: arc fills, benefit band, in-range reading |
| `--sp-unverified` | `#885a00` | **unverified / read-with-care** only: the "Model knowledge" badge text, the dashed model border, the warning stack's left mark |

Two accents, each with one meaning. Green means *a trial measured this*; amber
means *a model recalled this or you must read this before trusting a number*. No
coral, no blue, no gold-on-cream, no shadows (the viewfinder keeps its one shadow;
it is the page's single object).

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
│ │ Does it work?    +0.73 ▓▓▓▓▓▓ 100%  │ │  four arcs, one line each
│ │ In your form?     0.80 ▓▓▓▓▓░  92%  │ │  value + track + coverage
│ │ At your dose?     0.78 ▓▓▓░░░  51%  │ │
│ │ How much known?        ▓▓░░░░  36%  │ │
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
  white, green = measured, amber = unverified. The two accents carry meaning, not
  mood.
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
5. Four arc colours (teal, blue, coral, gold) decorating one card — one measured
   green; the value and coverage numbers do the differentiating.
6. Dashed / dotted / solid / tinted badge kit in five colours — one quiet outlined
   family, model knowledge alone is dashed + amber.
7. Coloured top borders per card tone — removed; the verdict word and the number
   say it.
8. Repeated "% of the evidence" sentence under every arc — one coverage cell.
9. Three separate yellow boxes + caveats + validity banner — one stack.
10. Loading state = greyed pill + one teal line — replaced by the progress panel.
11. Result rendered below the capture chrome with no transition — the capture
    chrome collapses into the scanned-product header and focus moves.

## 6. Build log — what the screenshots changed (three passes)

Measured with `scripts/design_shots.mjs` against `tests/fixtures/scan-photo-rich.json`
(3 actives, a recall, a suspected-MLM company, funding + publication concerns).

| pass | 390 px height | 360 px height | what moved |
|---|---|---|---|
| before | 9911 | 10424 | — |
| 1 | 6181 | 6458 | state model, one stack, one-line arcs, collapsed legend/technical |
| 2 | 5526 | 5756 | header facts → one sentence + `Label details`; notice rows → title-only on phones (the truncated lede was useless at 150 px); arc label "How well studied?"; footnotes inline |
| 3 | 4919 | 5137 | model company facts → `<details>`; spacing scale applied consistently; dose legend copy shortened; arc label "Well studied?" (fits 360 without ellipsis) |

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
