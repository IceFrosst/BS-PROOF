"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { humanize } from "@/lib/dashboard/format";
import type { DashboardOutcome, DashboardStudy } from "@/lib/dashboard/types";
import { FourRingScore } from "./four-ring-score";
import { OutcomeBreakdown } from "./outcome-breakdown";

interface OutcomeExplorerProps {
  outcomes: DashboardOutcome[];
  runId: string;
  studies: DashboardStudy[];
}

type Filter = "all" | "scored" | "gated";

export function OutcomeExplorer({ outcomes, runId, studies }: OutcomeExplorerProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const studiesById = useMemo(
    () => new Map(studies.map((study) => [study.canonicalId, study])),
    [studies],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return outcomes.filter((outcome) => {
      const matchesText = !needle || `${outcome.label} ${outcome.id} ${outcome.kind ?? ""}`.toLowerCase().includes(needle);
      const matchesState = filter === "all" || (filter === "scored" ? outcome.displayScore !== null : outcome.displayScore === null);
      return matchesText && matchesState;
    });
  }, [filter, outcomes, query]);

  return (
    <div className="outcome-explorer">
      <div className="explorer-controls">
        <label className="search-field">
          <span>Find an outcome</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search strength, sleep, side effects…"
          />
        </label>
        <fieldset className="segmented-control">
          <legend>Evidence state</legend>
          {(["all", "scored", "gated"] as const).map((value) => (
            <button
              aria-pressed={filter === value}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {humanize(value)}
            </button>
          ))}
        </fieldset>
      </div>
      <p className="result-count" aria-live="polite">Showing {visible.length} of {outcomes.length} outcomes</p>
      <div className="outcome-grid">
        {visible.map((outcome) => (
          <article
            className={`outcome-card ${outcome.displayScore === null ? "outcome-gated" : ""}`}
            data-outcome-state={outcome.displayScore === null ? "unavailable" : "scored"}
            data-testid="outcome-card"
            key={outcome.id}
          >
            <div className="outcome-heading">
              <div>
                <p className="eyebrow">{humanize(outcome.kind)}</p>
                <h3>{outcome.label}</h3>
              </div>
              <span className="outcome-state">{outcome.displayScore === null ? "Evidence gated" : humanize(outcome.band)}</span>
            </div>
            <FourRingScore outcome={outcome} compact />
            <p className="outcome-verdict">{outcome.verdictLabel ?? "Verdict unavailable"}</p>
            <details className="outcome-more" data-testid="outcome-more">
              <summary>More info — how this score came to be</summary>
              <OutcomeBreakdown outcome={outcome} studiesById={studiesById} />
            </details>
            <div className="outcome-footer">
              <span>{outcome.nPrimaries ?? "—"} primary studies</span>
              <Link href={`/runs/${runId}/outcomes/${outcome.id}`} aria-label={`Inspect ${outcome.label}`}>
                Inspect <span aria-hidden="true">→</span>
              </Link>
            </div>
          </article>
        ))}
      </div>
      {visible.length === 0 ? <p className="empty-state">No outcomes match this filter.</p> : null}
    </div>
  );
}
