# BS-PROOF architecture (2026-08-07)

**Canonical diagram for demos.**  
`pipeline_v1.excalidraw` at repo root is the **original** sketch; this file is the **current** system. SPEC still says `supplement_pipeline_v1.excalidraw` in one place — that filename does not exist (name drift).

```text
                    ┌─────────────────────────────────────┐
                    │  PRODUCT: ingredient + form (+ dose) │
                    └─────────────────┬───────────────────┘
                                      │
          ┌───────────────────────────▼───────────────────────────┐
          │  RETRIEVE (code)  Europe PMC / PubMed / CT.gov / OA   │
          │  SRs first → primaries · dedup NCT>DOI>PMID>fp        │
          └───────────────────────────┬───────────────────────────┘
                                      │
                    ┌─────────────────▼─────────────────┐
                    │  STORE  study + registry_facts      │
                    │  (SQLite now → Postgres later)      │
                    └─────────────────┬─────────────────┘
                                      │
     ┌────────────────────────────────┼────────────────────────────────┐
     │                                │                                │
     ▼                                ▼                                ▼
┌─────────────┐              ┌────────────────┐              ┌─────────────────┐
│ S2 on SRs   │              │ RCT primaries  │              │ Prefer full-text│
│ (--with-sr) │              │ S3 S4 S5 S7 S8 │              │ in batch order  │
│ → resolve   │              │ (+ S6 map)     │              │ optional FT-only│
└──────┬──────┘              └────────┬───────┘              └────────┬────────┘
       │                              │                               │
       │         ┌────────────────────▼───────────────────┐           │
       │         │  ADAPTER (only model boundary)         │           │
       │         │  claude_adapter | pilot | grok_adapter │◄──────────┘
       │         │  pure function · pinned prompt_version │
       │         └────────────────────┬───────────────────┘
       │                              │
       └──────────────┬───────────────┘
                      ▼
          ┌───────────────────────────┐
          │  ASSEMBLE (code)          │
          │  form / dose / pop match  │
          │  dose band from trials    │
          │  form transfer mix print  │
          └─────────────┬─────────────┘
                        ▼
          ┌───────────────────────────┐
          │  SCORE (code)             │
          │  w = design×RoB×size×…    │
          │  score = 100·d·c·(1−0.4H) │
          │  SR → E' only (≤+30%)     │
          └─────────────┬─────────────┘
                        ▼
          ┌───────────────────────────┐
          │  ECU rows + DONUT         │
          │  reports/ → GitHub        │
          └───────────────────────────┘
```

## Three extraction backends (never silent-merge)

| Path | Flag | Auth |
|------|------|------|
| Claude production | (default with API key) | `ANTHROPIC_API_KEY` + `--bare` |
| Claude pilot | `--pilot` | subscription |
| Grok pure-function | `--grok` | Grok CLI / subscription |

## Demo / quality flags

| Flag | Effect |
|------|--------|
| `--with-sr` | S2 on meta-analyses → capped confidence boost |
| `--demo` | Exact form only + ignore population (**not production**) |
| `--full-text-only` | Score only studies with OA full text / green OA |

## Weight factors (score path)

```text
w_study = design × RoB × size × funding × OA × form × dose × pop
          × (0 if retracted or venue_ok=False)
```

**Venue / predatory:** SPEC requires predatory → weight 0. Code has `venue_ok`
but **no live predatory-journal list is applied at retrieve time yet** (see
`docs/AUDIT_INCONSISTENCIES.md`).

## Open Excalidraw in the app

1. Open [excalidraw.com](https://excalidraw.com)
2. Load `pipeline_v1.excalidraw` for history
3. Prefer redrawing from this markdown for meetings (current truth)
