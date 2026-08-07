> **HISTORICAL — closed 2026-08-08.** Every issue listed here has been fixed or
> superseded. Notably: the excalidraw is regenerated from code now
> (`pipeline_v2_demo.excalidraw`), the donut has FOUR arcs, and CLAUDE.md
> "Current state" is live again. Do not act on this file — it is a snapshot of
> problems, not a task list.

# Repo & docs inconsistency audit

**Date:** 2026-08-07  
**Scope:** documentation vs code vs live Grok/Claude paths

---

## Critical / high

| Issue | Where | Reality |
|-------|--------|--------|
| **CLAUDE.md “Current state” stale** | CLAUDE.md bottom | Still says Grok is scaffold / needs XAI_API_KEY / wire `--grok`. **False:** `run_pipeline --grok` works; Windows CLI path + reports exist. |
| **SPEC status “pre-build”** | docs/SPEC.md header | Still “design, pre-build”, last updated 2026-08-05. Code + live runs are far past that. |
| **Diagram filename drift** | SPEC companion artifacts | SPEC cites `supplement_pipeline_v1.excalidraw`. Repo has **`pipeline_v1.excalidraw`** only. No `docs/architecture/`. |
| **Excalidraw outdated** | pipeline_v1.excalidraw | Pre-dates Grok path, `--with-sr`, dose bands, 3-arc donut, dual backends, reports archive. Use **`docs/ARCHITECTURE.md`** until redrawn. |
| **AGENTS.md vs practice** | AGENTS.md | Says “never push directly to main without confirmation.” Founder/agents push to main constantly. Policy or practice must change. |
| **README quick start Claude-only** | README.md | Omits Grok CLI path and `--grok` / `--with-sr` / reports auto-push. |
| **Retrieve caps disagree** | CLAUDE.md vs run_pipeline | CLAUDE demo table: 150 primaries / 50 SRs. Code: **300 / 80**. |
| **Predatory journals** | SPEC §7 / §15 | SPEC: predatory → **hard zero weight**; static list “download once.” **Code:** `venue_ok` / `predatory_venue` field exists; **no list loaded, never set at retrieve.** Effectively **not enforced**. |
| **Venue factor incomplete** | scoring.py | Only boolean `venue_ok` (0 or full). SPEC’s Q1–Q4 ×0.85 path **not implemented**. |
| **Storage story** | SPEC §11 Postgres | Runtime is **SQLite** (`out/*.sqlite`). Schema is “Postgres-shaped” for later. |

## Medium

| Issue | Detail |
|-------|--------|
| **PROMPT_VERSION** | Claude path bumped to v1.3 (S5 bounds). Confirm grok_adapter shares same constant via import (it imports from claude_adapter — OK if import path live). |
| **Dose axis** | SPEC once said unbanded only; Claude wired dose derivation 2026-08-07. SPEC §5 “absent” language partially stale. |
| **Donut** | SPEC §9: single arc = c. Code: 3 concentric arcs (evidence / form / dose). Spec needs update. |
| **Reports on GitHub without local Grok DBs** | auto_report on Claude machine showed no `grok_*.sqlite` while Windows had them. Reports are machine-local unless DB committed (usually gitignored). |
| **Dual-backend auth docs** | CLAUDE.md table still implies Grok needs `XAI_API_KEY`; Windows path uses **Grok Build CLI subscription**. |
| **Unpaywall** | SPEC changelog: marginal 0 pp over OpenAlex. Some older docs still call it largest uplift. |
| **`--demo` vs production** | Easy to screenshot as real science. Need watermark in reports (partially printed). |

## Low / hygiene

| Issue | Detail |
|-------|--------|
| requirements.txt | Tiny; may under-document deps. |
| sys.path hacks | Day-1 acceptable; package install still pending. |
| INDEX.md footer | Sometimes still says “no runs committed”. |
| Email typo in git config | `gmai.com` appeared on one commit author. |

---

## Predatory journal check — answer

**Designed: yes. Enforced: no.**

- SPEC: predatory venue → `w_study = 0`; flag bus can surface it.  
- `Study.weight()`: `if not self.venue_ok: return 0.0`.  
- `assemble`: `venue_ok=not record.get("predatory_venue", False)`.  
- **Missing:** Beall-style / Cabells / curated list load + journal match at ingest.  

**Retractions:** Crossref/Retraction Watch planned in SPEC; `retracted` field zeros weight if set — population of that field not verified end-to-end on every retrieve.

---

## Full-text only — answer

**SPEC policy:** do **not** exclude abstracts permanently (OA bias). Discount via OA factor 0.55.

**Demo / quality mode:** **yes, you can.** Flag `--full-text-only` keeps only `full_text` / green-tier OA in the extraction batch. Raises weight ceiling; **shrinks N**; can bias venue mix.

---

## Recommended doc fixes (priority)

1. Refresh CLAUDE.md Current state / Next (Grok live).  
2. Point SPEC companion diagram → `docs/ARCHITECTURE.md` + `pipeline_v1.excalidraw` (legacy).  
3. Implement or explicitly “v1.1” predatory list.  
4. README: Grok + meeting runs link.  
5. Align retrieve caps in CLAUDE.md with code.  
