# Legacy continuous v14 scorer (backup)

The retained continuous scorer remains the compatibility path for existing API consumers and historical artifacts. Its code is unchanged in `lib/analyze/product-score.ts`, `lib/analyze/scoring.ts`, and the Python pipeline: it computes the signed v14 applicability-discount result and four arcs from retained trial runs.

When an exact single-ingredient product matches one of the three retained Evidence Ledger targets, `/scan` uses the retained audit and `lib/evidence-ledger` instead. It never converts production coverage into `/4`; the Ledger's effect, certainty, form-fit and dose-fit values are the audit rubric's own states and scales. For every other product, the API still returns the continuous `evidence.rows` shape and the UI says `No /4 audit for this exact form and daily dose yet`; it does not relabel those rows as Ledger grades.

To re-enable the continuous presentation as the primary display, change only the `/scan` evidence branch in `components/scan-flow.tsx` to select `OutcomeTabs` before `LedgerOutcomeTabs`. Keep `ledger_audit` in the API for consumers that opt into the retained audit, and do not change either scorer or any scoring constant. A future expansion of live arbitrary-product audits requires a source-retrieval service capable of opening and recording live sources; the deployed model transport cannot satisfy `research_audit` by itself.

The Ledger itself remains heuristic and unvalidated. Funding and publication bias are disclosures only and do not alter certainty or headline.
