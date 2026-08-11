# Archived runs — scoring model `v6-form-ladder-per-study`

identical to v5 except form-ladder eligibility is PER STUDY: rank the studies in your form whose own result is non-negative and average the top-3, walking down the hierarchy when the highest ranks are negative. A negative pooled verdict no longer zeroes the arc; it stays in the verdict as the warning it is. Also adds per-study score contributions (scoring.contributions) which sum exactly to the signed score. S_VALUE null_effect was still -0.7. Superseded 2026-08-11.

**Do not compare these numbers with runs under a different model.** The
same corpus produces different scores under each, because the formula
changed — not because the evidence did.

Files here are never edited or deleted. They record what the pipeline
said on the day they were produced.
