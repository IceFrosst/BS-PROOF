# Team status — 2026-10-03 12:30 (BIO-RED pitch day)

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
