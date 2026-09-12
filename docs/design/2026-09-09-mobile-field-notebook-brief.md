# Mobile launch design brief — "Field Notebook" (2026-09-09)

Direction written by Claude Fable 5.1 (`anthropic/claude-fable-5-1`) as a design
subagent. The subagent had no shell or web tools, so its source list is prior
knowledge marked *not fetched*. The parent session then ran a live web search
(xAI web_search tool) that reached: Apple HIG Buttons and Layout pages (full),
Material 3 Navigation Bar guidelines (full), NN/g Progressive Disclosure (full,
2006), plus 2026 snippets (72Technologies, djEnterprises, Dogtown Media, AP News)
and two Reddit threads available only as search snippets. Instagram Reels were
not viewable; no Reel content is claimed. Live findings agreed with the brief on
44/48pt targets, labelled bottom navigation, progressive disclosure, honest
determinate progress, reduced-motion support and keeping gamification about the
user's own research process rather than supplement consumption.

Implemented as a development-only prototype at `/design-lab/mobile`
(`app/design-lab/mobile/`). All data, progress and rings are simulated.

---


## ⚠️ Access scope for this run (read first)
This subagent had **only `Read` and `Write` tools** — no shell (the Brave skill's `search.js`/`content.js` need `node` execution), no `web_search`, no browser. **No live web, Reddit or Instagram research was performed.** Every source below is cited from prior knowledge of stable, authoritative documentation and is marked **[not fetched this run — verify]**. I did **not** read any Reels or Reddit threads and make no claims about their content. Section "Live-search plan" gives exact queries for the parent to run with the Brave skill when a shell is available.

Files inspected: `app/design-lab/prototype.tsx` (full), `app/design-lab/prototype.css` (lines 1–80). The current lab is a desktop editorial layout (1400px shell, 64px gutters, two-column grids, 9px labels); it needs a mobile-first rebuild rather than a squeeze.

## Summary
Build one direction — **"Field Notebook"**: a warm, tactile, card-based 390px flow with a friendly lens/magnifier mascot ("Lumen"), chunky chips, milestone stamps for *process* progress only (scan → confirm → outcomes → research → report), and rigor signalled through visible provenance, honest empty states and always-on safety. Two colour themes (Meadow / Slate) share the same tokens. Gamification is limited to completion of the user's own research steps — never to dose, efficacy or streaks.

## Findings (practical recommendations, with evidence basis)
1. **Touch targets ≥ 44×44 pt (Apple) / 48×48 dp (Material); 8 pt minimum gap.** Every chip, ring legend row, "Edit" link and step tab in the prototype must meet this; the current 8px-padding text buttons do not. [Apple HIG – Layout](https://developer.apple.com/design/human-interface-guidelines/layout) · [Material 3 – Accessibility](https://m3.material.io/foundations/accessible-design/accessibility-basics) **[not fetched this run — verify]**
2. **Bottom navigation: 3–5 top-level destinations, always visible, label every icon.** Material 3's navigation bar spec and Apple's tab bar guidance both discourage unlabeled icons and >5 items. Use 4: *Scan · Library · Learn · Safety*. [M3 Navigation bar](https://m3.material.io/components/navigation-bar/guidelines) · [Apple HIG – Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) **[not fetched]**
3. **Progress indicators must be honest: determinate when steps are known, with visible step labels; avoid fake percentages.** NN/g's progress-indicator guidance: show determinate progress when duration/steps are known and keep the user informed of what is happening. The existing 5-phase list is right; keep "0/5 stages", drop any "/100" numeric display while data is simulated. [NN/g – Progress Indicators](https://www.nngroup.com/articles/progress-indicators/) **[not fetched]**
4. **Progressive disclosure: show verdict + one limitation first; full 11-question report behind an explicit expander.** NN/g: defer advanced/rare features to a secondary screen to reduce error and learning cost. Keep `<details>` semantics for a11y. [NN/g – Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) **[not fetched]**
5. **Gamification without dark patterns: reward *process*, not *behaviour you can't verify*.** Streaks tied to consumption or "health points" nudge overuse and fabricate authority; NN/g warns gamification must serve user goals, not engagement metrics. So: milestone stamps for "Label confirmed", "Outcomes chosen", "Research complete", "Report read" — nothing for dose or days taken. [NN/g – Gamification in UX](https://www.nngroup.com/articles/gamification/) **[not fetched]**
6. **Respect `prefers-reduced-motion`; cap purposeful motion at ~200–300 ms; no autoplay loops.** Material motion guidance + WCAG 2.3.3 (Animation from Interactions, AAA) and 2.2.2 (pause/stop for moving content). Ring fills and confetti-less "stamp" pops must have a static fallback. [MDN – prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) · [WCAG 2.2 – 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) **[not fetched]**
7. **Body text ≥ 16 px (17 pt iOS default), min 12 px for captions; contrast ≥ 4.5:1 body, ≥ 3:1 large/UI.** The lab's 9–11 px labels fail on phones. [Apple HIG – Typography](https://developer.apple.com/design/human-interface-guidelines/typography) · [WCAG 2.2 – 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) **[not fetched]**
8. **Editable confirmation screens beat "smart" OCR that guesses.** NN/g form guidance: prefill but make every field visibly editable, label above field, one column on mobile, numeric keyboards via `inputMode`. Current prototype already does `inputMode="decimal"` — keep it. [NN/g – Mobile form design](https://www.nngroup.com/articles/mobile-input-checklist/) **[not fetched]**
9. **Trust cues that actually work: provenance, timestamps, "what we didn't find", plain-language limits.** NN/g credibility research emphasises transparency and admitting uncertainty over polish. Every card gets a "Sources · Method · Not medical advice" footer row even in the simulated state. [NN/g – Trust & credibility](https://www.nngroup.com/articles/trustworthy-design/) **[not fetched]**
10. **Desktop should show a phone frame, not a stretched layout.** Common device-frame pattern: fixed 390×844 canvas centred in a muted backdrop with a note "Preview at iPhone 14/15 size". No external source needed; it's a presentation convention.

## Visual blueprint — "Field Notebook" (single direction)

### Palette (tokens; same names in both themes)
| Token | Meadow (light, default) | Slate (dark) |
|---|---|---|
| `--bg` | `#F6F3EA` | `#151A17` |
| `--surface` | `#FFFDF7` | `#1F2622` |
| `--surface-2` | `#EEF0E3` | `#2A332D` |
| `--ink` | `#1F3A2D` | `#EDEFE6` |
| `--ink-muted` | `#5F6B60` | `#A6B0A7` |
| `--line` | `#D9DCCC` | `#3A453E` |
| `--accent` (primary) | `#2F5D45` | `#8FCBA5` |
| `--accent-ink` | `#F7F9F1` | `#10201A` |
| `--ring-effect` | `#2F5D45` | `#8FCBA5` |
| `--ring-form` | `#6F9B6B` | `#A9D3A0` |
| `--ring-dose` | `#B7C36F` | `#D7DE9A` |
| `--ring-evidence` | `#D1A54E` | `#E9C77A` |
| `--warn` (safety) | `#B54A2E` | `#F08B6E` |
| `--warn-bg` | `#FBEDE7` | `#3A241D` |
| `--focus` | `#A0612E` | `#F4B77A` |
Contrast: `--ink` on `--bg` ≥ 12:1; `--accent` on `--surface` ≥ 7:1; `--warn` on `--warn-bg` ≥ 4.5:1 (recheck after any tweak).

### Type scale (system stack: `-apple-system, "SF Pro", Roboto, "Segoe UI", sans-serif`; serif accent `Georgia` for `em` only)
Display 32/36 700 · H1 26/30 700 · H2 20/26 600 · Body 16/24 400 · Body-strong 16/24 600 · Caption 13/18 500 · Overline 12/16 700 uppercase, 0.08em tracking (floor, never 9 px). Numbers use `font-variant-numeric: tabular-nums`.

### Spacing & shape
4-pt base: 4/8/12/16/24/32/48. Screen padding 20 px; card padding 16; chip 12×16. Radii: card 20, chip 999, button 14, phone frame 44. Shadow: `0 2px 0 var(--line), 0 8px 24px rgba(31,58,45,.08)` — a "paper stack" feel; pressed state translates 2 px down (tactile, cheap).

### Mascot / motif — "Lumen"
A rounded magnifying-glass character: lens = circle with a soft highlight, handle = short rounded stick, two dot eyes inside the lens, no mouth (neutral, not cheering). Built in inline SVG, ≤ 3 KB, currentColor so it re-themes. States: *idle* (slight tilt), *reading* (lens over a label card), *done* (lens becomes a check-stamp). Lumen never comments on efficacy; its lines are about *process* ("I'm reading both sides.").

### Screens (390 px, bottom nav 64 px + safe-area)
1. **Scan** — full-bleed camera placeholder card with dashed corners; Lumen idle bottom-left; CTA `Scan a label` (primary, 56 px tall); secondary `Use the demo bottle`. Overline: "DEMO · No photo leaves this device".
2. **Confirm** — header "First, the facts." Body: "Everything is editable. Blank beats a guess." Single-column fields (Brand, Supplement, Form, Amount + Unit inline, Servings/day). Sticky footer: `Confirm product →`. Below fields, a **live status pill**: pulsing dot + "Provisional research started · simulated". Changing a field resets the pill with toast "Restarted with your edits."
3. **Outcomes** — H1 "What matters to you?" Chips grid (2-col, 48 px tall, icon + label, `aria-pressed`), `+ Add one` chip opens inline input. Footer count "2 chosen · all declared outcomes get researched". CTA `Research these →`.
4. **Research** — Milestone track: 5 stamps in a row (empty circle → filled with tick). Current step text large; sub-copy "Simulated activity. No searches are running." Lumen in *reading* pose. Buttons: `Skip wait (demo)` text link, never a fake spinner.
5. **Results** — Product strip (edit link) → **safety card first** (`--warn-bg`, icon "!", "Safety stays visible whatever you filter." + "No safety assessment made in this demo") → outcome cards. Each card: title, **four concentric rings** (stroke 10, gaps 4, Effect outermost; centre shows "—" and "DEMO"), legend rows with 44 px hit height, verdict line, one limitation, `Explore the report ▾` expander revealing the 11 questions as an accordion. Footer chip row: `Sources · Method · Not medical advice`. `Show all N researched` at end.
6. **Library / Learn** (nav stubs) — Library lists past scans as stamps; Learn = 3 static cards ("How we read a study", "Why dose matters", "What 'evidence' means here").

### Bottom navigation
4 items, 64 px, labels always on, active = filled pill behind icon (`--surface-2`) + `--accent` icon; `aria-current="page"`. Safety tab badge only when a real caution exists (none in demo → hidden).

### Microcopy rules
Lead with the user's action, admit uncertainty, no exclamation marks, no "great job", no health/dose language. Approved milestone names: *Label confirmed · Outcomes chosen · Research complete · Report opened*.

### Motion
Chip select: scale .97→1, 160 ms ease-out. Ring fill: stroke-dashoffset 600 ms once on mount. Stamp: 240 ms pop. Screen change: 200 ms fade+8 px slide. Under `prefers-reduced-motion: reduce` → all transitions 0 ms, rings render final state, pulse dot becomes static filled dot with text "in progress".

### Phone frame desktop preview
`@media (min-width: 760px)`: backdrop `--surface-2`, centred `.phone` 390×844, radius 44, 10 px `--ink` bezel, inner scroll, caption "Preview at 390 × 844 · all data simulated". Theme toggle (Meadow/Slate) and "Restart" live outside the frame.

## Live-search plan for the parent (run with Brave skill when a shell is available)
- `site:reddit.com r/UI_Design mobile onboarding card design 2025` · `site:reddit.com r/userexperience gamification health app trust` · `r/Supplements app scan label review`
- `site:instagram.com/reel mobile app ui micro interactions` (expect snippet-only; do not claim viewing)
- `m3.material.io navigation bar guidelines` · `developer.apple.com human-interface-guidelines tab-bars` · `nngroup progress indicators` — to confirm the URLs above and capture publish dates.

## Sources
- Kept (prior knowledge, **not fetched this run**): Apple HIG Layout / Typography / Tab bars; Material 3 Navigation bar & Accessibility; NN/g Progress Indicators, Progressive Disclosure, Gamification, Mobile input checklist, Trustworthy design; MDN prefers-reduced-motion; WCAG 2.2 SC 1.4.3 & 2.3.3 — foundational, stable specs that directly drive the numeric recommendations above.
- Dropped: all Reddit/Instagram material — not accessed; no claims made.

## Gaps
- Zero live verification of URLs, dates, or current Reddit/Reels sentiment. Run the plan above and re-check every link before publishing.
- Colour contrast values are estimates; verify with a contrast checker after implementation.
- Mascot needs a quick 3-frame sketch from a human/illustrator pass; SVG spec is a starting point only.
