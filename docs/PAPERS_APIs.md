# Paper sources and API keys

Where the pipeline gets the full text of a trial, and which accounts or keys
would let it read more. How to install a key and hand it over to the company is
in `docs/PIPELINE.md` §2 "API keys"; keys live only in the gitignored
`.env.pipeline`, never in the repo.

**Why it matters.** Text is the binding limit. Only a trial whose methods and
results we can read is extracted (abstracts are never extracted, founder
2026-10-17), and the method needs several trials per outcome before a letter
means anything. The vitamin C run (`20261103_101034`) read 52 of 116 studies and
ended with k ≤ 1 on every outcome.

## How the numbers were measured (2026-11-03)

For each supplement already analysed, every RCT in the store that passes the
relevance gate was run down the text ladder with no model calls
(`sources/fulltext.best_text`, network only). Each trial is credited to the
**first** source that gave readable text. An unreadable trial is counted under
its publisher, which is the source that could unlock it.

| | Creatine | Vitamin C |
|---|--:|--:|
| Relevant RCTs | 400 | 298 |
| **Readable today** | **134** | **62** |
| Unreadable | 266 | 236 |

The "Readable today" figures assume the 2026-11-03 widened full-text filter (a DOI is enough when a keyed source is configured). Before that fix, 29 readable creatine RCTs and 3 vitamin C RCTs were dropped before any source was tried.

Counts in the "could add" columns for sources without a working key are
**upper bounds**: the unreadable trials that publisher holds. A publisher API
returns full text only for articles the key's owner is entitled to, which
means open access plus whatever an institutional subscription covers. Without
an institution, expect only the open-access part.

## Sources in use

| # | Source | Key | Status | Creatine: trials read | Vitamin C: trials read |
|---|---|---|---|--:|--:|
| 1 | Europe PMC, open-access JATS | none | working | 77 | 39 |
| 2 | Open copies listed by Europe PMC, OpenAlex, Unpaywall | email only (`BSPROOF_CONTACT_EMAIL`) | working | 20 | 13 |
| 3 | **CORE** (core.ac.uk, university repositories) | `CORE_API_KEY` | **working** (founder's personal key) | 10 | 5 |
| 4 | **Semantic Scholar** open-access links | `S2_API_KEY` | **working** (founder's personal key) | 27 | 5 |
| 5 | **Elsevier** Article Retrieval API | `ELSEVIER_API_KEY` | **key valid, full text blocked**: Elsevier must enable it | up to 31 | up to 64 |

Notes:
- **CORE** reads only results whose DOI matches exactly. 3 vitamin C texts were
  refused because their minus signs read as "2" (Cambridge symbol font).
- **Semantic Scholar** links to PubMed Central pages for articles outside
  PMC's open-access set. PMC's terms forbid downloading those automatically, so
  they are skipped (3 vitamin C trials). A link already tried by step 2 is not
  tried again.
- **Elsevier**: AJCN and J Nutr moved to Elsevier, so this is the largest vitamin C
  block. A plain key may only unlock open-access and open-archive articles.

## Sources that need an account we do not have yet

Each row is a publisher holding many of our unreadable trials. "Needs" is what
the publisher asks for before it gives machine-readable full text.

| # | Source | Needs | Creatine: could add | Vitamin C: could add | Notes |
|---|---|---|--:|--:|---|
| 6 | **Wolters Kluwer / Ovid** (LWW: *Med Sci Sports Exerc*, *J Strength Cond Res*) | institutional subscription or a licence; no free key | up to 55 | up to 10 | The biggest creatine block. The sports-science journals live here |
| 7 | **Human Kinetics** (*IJSNEM*, *IJSPP*) | institutional subscription; no API | up to 30 | up to 10 | Ask them directly about a text-mining licence |
| 8 | **Springer Nature** API (dev.springernature.com) | free key for open-access text; subscription for the rest | up to 29 | up to 25 | The free key is worth getting (no institution needed); expect the open-access part only |
| 9 | **Wiley** text-and-data-mining token | Wiley account linked to an ORCID iD, plus entitlement | up to 16 | up to 21 | An ORCID iD is free for anyone at orcid.org, with no institution needed. Without a subscription the token still serves Wiley's open-access articles |
| 10 | **Taylor & Francis** TDM | institutional subscription | up to 13 | up to 18 | |
| 11 | **American Physiological Society** (*J Appl Physiol*) | none for reading (free after 12 months), but the site blocks scripts | up to 11 | up to 6 | Ask APS for text-mining access |
| 12 | **Canadian Science Publishing** (*Appl Physiol Nutr Metab*) | subscription | up to 10 | up to 2 | |
| 13 | **Oxford University Press** | subscription | up to 6 | up to 10 | Old AJCN/J Nutr DOIs now resolve to Elsevier (row 5) |
| 14 | SAGE, Thieme, Karger, Cambridge, BMJ, ADA, AMA | subscription | 18 together | 16 together | Small; Cambridge PDFs also have the broken-sign font |
| 15 | **A university library affiliation** | an institutional login (staff, student, or a research partnership) | most of rows 5–14 | most of rows 5–14 | The one account that unlocks the most: publisher text-mining access follows the institution's subscriptions |

## Trials no account will unlock

| Group | Creatine | Vitamin C | Why |
|---|--:|--:|---|
| PubMed Central, outside the open-access set | 12 | 15 | Free to read in a browser, but the publisher forbids automated download. Only that publisher's permission helps |
| No DOI (overlaps the rows above) | 22 | 21 | Every keyed source looks a trial up by its DOI. A DOI lookup step (Crossref) could recover some |
| Publisher unknown or other | 35 | 39 | Mixed small publishers and regional journals |

## Keys that do not add papers

- **NCBI API key** (free, ncbi.nlm.nih.gov account): raises the PubMed rate limit
  from 3 to 10 requests per second. Faster retrieval, no new papers.
- **Scopus** (works with the Elsevier key): abstracts and citations only. We
  already have abstracts.

## Commercial use

The free keys above (CORE, Semantic Scholar, Elsevier, Springer, Wiley) are
offered for research. BS-PROOF is a product, so before launch the company must
read each source's terms and, where needed, buy a commercial licence. CORE and
Elsevier say outright that their free terms are non-commercial.

## Keep this table true

Re-measure after adding a key: run `--demo` for the ingredient. Its census
prints the readable count. Update the counts here with the date.
