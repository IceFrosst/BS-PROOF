# Conference demo plan — scientists test the app (T-minus 2 days)

Founder gameplan 2026-08-23. Three supplements demoed live: **creatine,
vitamin D, omega-3 fish oil**. A scientist photographs a tub and gets a
score fast, answered from **full-pipeline scored runs** — never the census
fallback.

## Day 0 (today) — foundations + scoring
- [x] Kill switch: quick label analysis toggled OFF while we prep
      (`LABEL_ANALYZER_ENABLED=0` on Vercel prod; code `2fe9d24`)
- [x] `HANDOFF.md` running change log at repo root — append after every change
- [ ] **Scoring tune FIRST, before the big runs.** Artifacts are stamped with
      the scoring model and mismatches get QUARANTINED at build time. Order:
      retune constants in Python (canonical) → regenerate
      `tests/golden_scoring_parity.json` → re-sync TS ports until the parity
      suite passes.
- [ ] Vocab prep for vitamin D + omega-3 (`vocab/form.json`): D3 vs D2,
      **IU→µg conversion** (labels print IU), EPA/DHA vs total-oil mg,
      triglyceride vs ethyl ester. Without this the elemental conversion
      refuses and the dose arc dies on stage.

## Day 1 — the three runs + camera
- [ ] Pipeline runs **strictly sequential, nothing else running** (the
      2026-08-10 lesson: a competing session cost 364 of 906 calls).
      Creatine already has the 177-study run. Vitamin D is the biggest
      literature — start it in the morning; omega-3 after.
- [ ] Live camera capture: `<input type="file" accept="image/*"
      capture="environment">` on the existing drop zone. getUserMedia
      viewfinder only if time remains.
- [ ] Fix the vocab quirk: DeepSeek returns the FORM id in
      `ingredient_vocab_id`; normalize form-id → parent ingredient before the
      catalog lookup so every photo hits the scored path.

## Day 2 — event mode + rehearsal
- [ ] Event mode: analyzer restricted to the 3 scored ingredients; anything
      else → polite "not in this demo", never census. Consider `DEMO_MODE=1`.
- [ ] **RE-ENABLE the analyzer** (`LABEL_ANALYZER_ENABLED` → remove or `1`,
      redeploy). The photo→score flow RUNS THROUGH the analyzer; the toggle
      is prep-only. This is the trap; do not ship the demo with it off.
- [ ] Dress rehearsal with the ACTUAL physical tubs handed to scientists —
      buy/pick them now; glossy curved bottles under venue lighting ≠ a
      synthetic PNG.
- [ ] Check DeepSeek balance/rate limits; a read is ~20–25 s — make the
      analyzing state look intentional.
- [ ] Freeze, deploy, verify, update HANDOFF.md.

## At the event (non-engineering, explicit goals)
- [ ] Demo the three supplements.
- [ ] **Recruit an academic collaborator/PI.** This is the eligibility path
      for Anthropic's research programs (below) — for-profits alone don't
      qualify. A scientist who liked the demo IS the application.

## Post-event workstream — apply to Anthropic's science programs
Verified current as of 2026-08-23; applications reviewed the **first Monday
of each month**, so prepare materials now and submit right after the event
(ideally with a collaborator's institutional affiliation attached).

- [ ] **AI for Science program** — up to **$20k free API credits** / 6 mo.
      Directly attacks our documented #1 bottleneck ("the remaining ceiling
      is throughput, not access"): API credits convert vitamin-D-sized runs
      from overnight rationing into a parallel afternoon.
      https://support.claude.com/en/articles/11199177
- [ ] **Claude Science projects call** — up to **$30k credits + Modal
      compute** (the 2026 call's July deadline passed; watch for the next
      round).
- [ ] **Research-lab Team plan** — $15/user/mo for verified academic labs,
      includes the Claude Science workbench; needs the collaborator.
- [ ] Evaluate **Claude Science** (workbench beta, Pro/Max plans) as an
      independent second verifier for extractions — its reviewer agent does
      citation/calculation checks with provenance, mirroring paper-verifier.
      Per project rule: a second opinion, never silently merged.
- [ ] Application pitch: "AI-assisted evidence synthesis for supplement
      claims, validated against full texts, refusal-first scoring" — lead
      with the audit/provenance design, it is exactly what the program funds.

## Fallbacks
- Vitamin D extraction doesn't finish in time → demo creatine + omega-3
  scored, present vitamin D as "watch the pipeline run live".
- DeepSeek quota/outage at venue → keys for Gemini free tier as backup
  provider (one env triple swap + redeploy).
