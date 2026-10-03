# Team status — 2026-10-03 (BIO-RED pitch day)

## Update: live research code integrated on current main (WIP branch, research OFF)

- Branch `feat/live-research-release-20261003` (from `main` `224715a`, which includes the dose release, `b30b017` desktop CSS and `5dcee28`) holds the reviewed backend + owner-private UI. Both lanes were independently reviewed and accepted (backend after its elemental-field fix; UI 14 tests). Main was not touched.
- Integrated gates: 36 Vitest files/547 tests (research, History, localization, referrer/Google/auth, analyze-label/dose), 6 research files/89 tests, 49 Python tests/0 skips, typecheck, scoped ESLint, `pipeline.invariants` + `pipeline.selftest`, `bash -n` on the release script, `git diff --check`, `npm audit` (0 vulnerabilities) and the production build all passed. Two older sign-in tests were narrowed to ignore the panel's `/api/scan/research` probe. One test (`plain-language-prompts`, `compat-v1.1` vs `compat-v1.2`) already fails on pristine main `224715a`; not introduced here, not edited.
- Research is OFF. No SQL, worker token, systemd service or model has been provisioned or smoke-tested. The mainPC user systemd socket is orphaned (no user DBus; sudo needs a password), so installing the persistent worker needs owner action; a small deployment fix (node PATH, system-unit variant, doc) comes first.
- Next: scoped provision, one real job smoke, then parent promotion. Not claimed: owner Claude Code verification, real-phone test, Google consent/Supabase session roundtrip, clinical validation.
- Supersedes the older 'offline lanes active / research unmerged / pending review' wording, the dose 'publish next' step, and the Google 'origin still rejected' note below; they stay as history.

## Update: verified dose release and live research next

- Printed elemental mineral dose is preserved exactly once across scan, legacy label API, Python CLI and active rows; legacy compound conversion and exact retained audit matching are unchanged. EN/LT new results and old History replay preserve dose basis.
- Final source review accepted all six regression groups. Integrated validation: 88 focused tests, four Python tests, typecheck, scoped lint, both Python gates, diff check and 296-page build passed. Owner Claude Code verification and a real vision read were not performed.
- Preserves friend commit `c9730cf` (guide crop/single top bar), logo, caller-isolated translation cache, Google fix and benchmark publication.
- Google origin fix is deployed: fresh production browser showed `strict-origin` metadata, GSI HTTP 200 and a clickable button without any temporary override. Full session/History roundtrip remains an independent verification item.
- User now explicitly asks to enable live research with Sonnet 5.5. Offline backend/provenance and frontend lanes are active in separate worktrees; WIP baseline is backed up on `feat/live-sonnet-research-integration-20261003`. Main PC Claude subscription login is verified; no research job has run. Next: reconcile contracts, source-summary honesty and private UI, review security/SQL, then provision and prove a real job before enabling normal use. This supersedes the historical no-activation note only for that reviewed, gated rollout.

## Update: Google origin/referrer diagnosis

- Owner's saved JavaScript origin and deployed client ID are correct. Actual root cause: production's `Referrer-Policy: no-referrer` removes the public origin from the GSI button request.
- Controlled browser test changed only document policy to `strict-origin`: Referer contained only the canonical HTTPS origin; GSI returned 200 and rendered a clickable button instead of HTTP 400. No production/provider configuration was changed during that test.
- Owner approved the `/scan`-only metadata fix, with explicit `no-referrer` root metadata and unchanged global Vercel security headers. Policy/Google tests (16), typecheck, scoped lint, both Python gates and build (296 pages) passed. Fresh independent source/security review accepted the fix; verified publication is the next step.
- Next: verify deployed HTML policy, real Google consent → Supabase session, owner-private History, authenticated scan and replay. A working button alone is not full-flow verification.

## Update: reviewed translation-cache release

- Preserves Ignas's logo commit `eb30db0` and the merged UI/EN-LT work.
- Translation cache is partitioned by the server-verified user ID; anonymous/unscoped callers do not share entries. User IDs never enter model prompts, responses or logs.
- Validation: 85 focused translation/client tests, typecheck, changed-file ESLint, both Python gates, diff check, and production build (296 pages) passed. Fresh independent source/security review accepted; owner Claude Code verification and live model translation were not performed.
- The user saved the exact canonical origin on the deployed Google client. Last fresh browser check still returned HTTP 400 with the origin-not-allowed message; propagation and real consent/session verification remain open. Vercel already serves the correct client ID, so no redeploy is needed for that Google setting. Authentication stays enforced.
- Magnesium fix is separate, uncommitted WIP: remaining legacy-replay/API parity regressions and tests must pass before review/release. Research remains unmerged and inactive; do not provision or activate under the current owner note.
- Next: complete magnesium regression coverage/review, then verify real sign-in → scan → History → replay. Research contract/source provenance and UI wiring remain offline follow-up work.

## Earlier teammate checkpoint — 12:30

Main = `700557a` (auto-deployed to https://bs-proof-dashboard.vercel.app, Vercel status: success).

## What is on main now

| Merged | What it does |
|---|---|
| `fix/scan-localization-20261003` (`f2d45ff`) | Whole `/scan` workspace in EN/LT (persisted choice, English default), read-time AI translation with "unverified translation" note, numbers/units guarded, LT proofread (KSV, grammar, warnings wording). Display-only: no scoring change. |
| `fix/scan-ignas-en-lt-20261003` (`b1fc4ff`) | Ignas PR #3 landing (headline above framed camera, Upload / shutter / Search row, 4K camera request, uploads >3.5 MB shrunk). Label read fails closed on malformed `actives` / `other_actives` (no silent drops, non-numeric dose rejected). Sign-out button on the landing. |
| Merge commit `700557a` | Resolved `scan-flow.tsx` conflict: kept localization `FLOW_COPY`/`useLang`, landing sign-out uses `f.signOut`. |

## Checked before the push

- `npm run typecheck` — pass
- `npm run lint` — 0 errors, 6 old warnings
- `vitest` — 844/844 (the 2 `scan-history-sql` tests fail only on a Windows checkout with CRLF; with LF they pass 8/8 — repo stores LF)
- `npm run build` (Supabase public vars unset) — pass, 296 pages
- Live after deploy: `/scan/`, `/`, `/tests/supplements/` = 200; 390 px phone width, no horizontal overflow; unauthenticated `POST /api/scan/` = 401 (auth gate works)
- NOT run: Playwright e2e, real phone, real Google sign-in

## What works

- `/scan` landing, camera, upload, search UI, Scan | History tabs, EN/LT switch
- Retained pages (`/tests/supplements`, run pages), public GETs
- Label reading (DeepSeek fast path) — accurate in earlier tests (22/22 actives on a multivitamin)

## What does NOT work (blocking the live demo)

1. **Google sign-in in production: `Error 400: origin_mismatch`.** With `SCAN_REQUIRE_AUTH` on, every scan is refused. Owner fix (pick one):
   - Google Cloud Console → OAuth client `42984642369` → Authorized JavaScript origins → add `https://bs-proof-dashboard.vercel.app`
   - or remove `SCAN_REQUIRE_AUTH` from Vercel production env and redeploy (re-opens anonymous model use; turn it back on after the pitch)
2. **Known result bugs (from 2026-10-02 tests, not fixed):**
   - Empty result ("Not assessed") for most real products: `retainedAuditForProduct` needs an exact dose match + printed servings/day (creatine 5 g shows nothing).
   - Magnesium "(as bisglycinate) 200 mg" is treated as compound mass → ~28 mg (7× too low). Needs an elemental-dose flag in the label prompt/conversion.
   - Multivitamins rejected as "not in vocabulary" (flow needs one main active).

## Not merged (on purpose)

- `feat/scan-research-queue-20261003` (`00b17d9`) and `feat/pc-research-worker-20261003` (`a74160e`): need contract/client, UI waiting states, SQL + token + worker provisioning and a security review (owner note: do not provision or activate). Flag is off; merging would add nothing to the demo.
- `Jans_attempt`: large in-progress refactor (moves/rewrites `scan-flow.tsx`, `globals.css`), author marked "not done yet". Will conflict heavily with main — rebase after the pitch.

## Next steps (in order)

1. Owner: unblock Google sign-in (above), then test one real phone sign-in → scan → History → replay.
2. Fix magnesium elemental dose (small, isolated).
3. Decide servings/day handling for retained audits (ask the user, never assume — per CLAUDE.md).
4. Multi-ingredient result list.
5. Research queue/worker: finish review, provision, enable flag.
6. Rebase `Jans_attempt` onto main.

## Pitch material (outside this repo)

Deck (claude.ai Slides), logo brief for Claude Design, ChatGPT-vs-BS-PROOF test protocol: kept by Ignas.
