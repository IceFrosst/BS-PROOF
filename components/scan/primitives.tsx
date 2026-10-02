/* Small presentational building blocks shared across the /scan result. */

import type { ReactNode } from "react";

import type { ScanAnalysis } from "@/lib/analyze/scan";

export type Basis = keyof ScanAnalysis["basis_legend"];
export type Legend = ScanAnalysis["basis_legend"];

export function BasisBadge({ kind, legend }: { kind: Basis; legend: Legend }) {
  const entry = legend[kind];
  return (
    <span className={`scan-badge scan-badge-${kind}`} title={entry.means}>
      {entry.label}
    </span>
  );
}

export function Section({
  id,
  title,
  basis,
  legend,
  children,
}: {
  id: string;
  title: string;
  basis: Basis[];
  legend: Legend;
  children: ReactNode;
}) {
  return (
    <details className="scan-section scan-lab-disclosure" id={`scan-${id}`}>
      <summary className="scan-section-head" id={`scan-${id}-title`}>
        <h3>{title}</h3>
        <div className="scan-badges" aria-label="Sources used in this section">
          {basis.map((b) => <BasisBadge key={b} kind={b} legend={legend} />)}
        </div>
      </summary>
      <div className="scan-section-body">{children}</div>
    </details>
  );
}

/* One "before you read the score" row: a one-line summary, the full text
 * inside a native <details>. The wrapper keeps the `la-alert la-alert-warn`
 * class every disclosure on this page has always carried (tests key on it). */
export function Notice({
  title,
  body,
  lede,
  role,
  ariaLabel,
}: {
  title: string;
  body: string;
  lede?: string;
  role?: "note";
  ariaLabel?: string;
}) {
  return (
    <details className="ab-warning-row la-alert la-alert-warn" role={role} aria-label={ariaLabel}>
      <summary><strong>{title}</strong>{lede ? <span>{lede}</span> : null}</summary>
      <p>{body}</p>
    </details>
  );
}

/* A line of expanded detail, shared by retained and unmatched cards. */
export function DetailLine({ term, children }: { term: string; children: ReactNode }) {
  return <p><b>{term}</b> {children}</p>;
}

export function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="sc-facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
