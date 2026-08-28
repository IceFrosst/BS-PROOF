# Archived runs — scoring model `v12-dose-closeness`

the composite's dose term is the product's CLOSENESS to the range of doses where positive effects occurred (founder design 2026-08-12: 'take all the dosages where there was a positive effect, and see how close our dose is'). Same 0..1 scale and same role-split as the form term: the arc's verdict/coverage remain the PICTURE of what trials near your dose found, closeness is the SCORE input, and direction lives in the effect term alone. Benefit trials far from your dose stop voting FOR you and become the yardstick you are measured against: 20 g loading benefits pushed a 4.4 g product's power composite to 62 under v11; under v12 they define a ~20 g range the product is far below (closeness 0.10, composite 44). DELIBERATE LOSS, founder call: the score no longer distinguishes 'dosed where trials failed' from 'dosed where nobody looked' -- both are outside the range that worked; null_range and the arc still show a reader the difference. KNOWN FRAGILITY, recorded not fixed: the range is a min-max of benefit doses, so one odd benefit trial at an extreme dose stretches it, and a range built on 2 trials reads identically to one built on 15. No benefit range (nothing worked, or no benefit trial carried a dose) falls back to eff x MISSING_DOSE_PENALTY.

**Do not compare these numbers with runs under a different model.** The
same corpus produces different scores under each, because the formula
changed — not because the evidence did.

Files here are never edited or deleted. They record what the pipeline
said on the day they were produced.
