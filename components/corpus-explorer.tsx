"use client";

import { useMemo, useState } from "react";

import type { DashboardStudy } from "@/lib/dashboard/types";
import { StudyExtractionDetail } from "./study-extraction";

export function CorpusExplorer({ studies }: { studies: DashboardStudy[] }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return studies;
    return studies.filter((study) => (
      `${study.title} ${study.year ?? ""} ${study.journal ?? ""} ${study.doi ?? ""} ${study.pmid ?? ""}`
        .toLowerCase()
        .includes(needle)
    ));
  }, [query, studies]);
  const years = useMemo(() => {
    const counts = new Map<number, number>();
    for (const study of studies) {
      if (study.year !== null) counts.set(study.year, (counts.get(study.year) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([left], [right]) => left - right);
  }, [studies]);
  const maxYearCount = Math.max(1, ...years.map(([, count]) => count));

  return (
    <div className="corpus-explorer">
      <figure className="histogram-card">
        <div className="chart-heading">
          <div><p className="eyebrow">Publication years</p><h3>Corpus over time</h3></div>
          <p>{studies.length} retained study records</p>
        </div>
        <div className="histogram" role="img" aria-label={`Histogram of ${studies.length} studies by publication year`}>
          {years.map(([year, count]) => (
            <div className="histogram-column" key={year} title={`${year}: ${count} studies`}>
              <span className="histogram-count">{count}</span>
              <span className="histogram-bar" style={{ height: `${Math.max(5, (count / maxYearCount) * 100)}%` }} />
              <span className="histogram-year">{year % 5 === 0 || year === years.at(-1)?.[0] ? year : ""}</span>
            </div>
          ))}
        </div>
        <figcaption className="chart-note">Year counts describe the retrieved run corpus; they do not represent study quality or outcome attribution.</figcaption>
      </figure>

      <div className="corpus-list-card">
        <div className="corpus-list-header">
          <label className="search-field">
            <span>Search the retained corpus</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, journal, DOI, PMID, year…"
            />
          </label>
          <p aria-live="polite">{visible.length} of {studies.length}</p>
        </div>
        <ol className="study-list">
          {visible.map((study) => (
            <li key={study.canonicalId}>
              <div className="study-meta">
                <span>{study.year ?? "Year unavailable"}</span>
                <span>{study.journal ?? "Journal unavailable"}</span>
                {study.failedPartial ? <span className="quality-flag">Partial extraction</span> : null}
                {study.predatoryVenue ? <span className="quality-flag quality-flag-danger">Venue flagged</span> : null}
              </div>
              <p>{study.title}</p>
              <div className="study-links">
                {study.doi ? <a href={`https://doi.org/${encodeURIComponent(study.doi)}`} rel="noreferrer" target="_blank">DOI <span className="sr-only">for {study.title}</span></a> : null}
                {study.pmid ? <a href={`https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(study.pmid)}/`} rel="noreferrer" target="_blank">PubMed <span className="sr-only">for {study.title}</span></a> : null}
              </div>
              <details className="study-more" data-testid="study-extraction">
                <summary>What the subagents extracted</summary>
                <StudyExtractionDetail extraction={study.extraction} />
              </details>
            </li>
          ))}
        </ol>
        {visible.length === 0 ? <p className="empty-state">No study records match that search.</p> : null}
      </div>
    </div>
  );
}
