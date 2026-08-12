import { formatMoney, formatNumber, humanize } from "@/lib/dashboard/format";
import type { DashboardRun } from "@/lib/dashboard/types";
import { UsageDownload } from "./usage-download";

/*
 * SIMPLIFIED 2026-08-12 (founder: "just how much in total it was, and the
 * breakdown of each agent"). The tier/model/routing/efficiency tables, token
 * stack, operations card and metric grid left the PAGE, not the data — the
 * full ledger remains in the artifact and in the JSON download.
 */

function value(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  return null;
}

function display(valueToDisplay: unknown): string {
  if (valueToDisplay === null || valueToDisplay === undefined || valueToDisplay === "") return "Unavailable";
  if (typeof valueToDisplay === "number") return formatNumber(valueToDisplay, 4);
  return String(valueToDisplay);
}

function tokenAmount(row: Record<string, unknown>): number | null {
  const direct = value(row, "total_tokens", "totalTokens");
  if (typeof direct === "number") return direct;
  const nested = value(row, "tokens");
  if (typeof nested === "number") return nested;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    const directParts = ["input", "cache_write", "cache_read", "output"].map((key) => row[key]);
    return directParts.every((item) => typeof item === "number")
      ? (directParts as number[]).reduce((sum, item) => sum + item, 0)
      : null;
  }
  const tokenRecord = nested as Record<string, unknown>;
  const total = value(tokenRecord, "total", "total_tokens", "totalTokens");
  if (typeof total === "number") return total;
  const keys = Object.prototype.hasOwnProperty.call(tokenRecord, "fresh_input")
    ? ["fresh_input", "cache_write", "cache_read", "output"]
    : ["input", "cache_write", "cache_read", "output"];
  const parts = keys.map((key) => tokenRecord[key]);
  return parts.every((item) => typeof item === "number" && Number.isFinite(item))
    ? (parts as number[]).reduce((sum, item) => sum + item, 0)
    : null;
}

export function TelemetryPanel({ dashboardRun }: { dashboardRun: DashboardRun }) {
  const usage = dashboardRun.usage;
  const status = usage?.status ?? "unavailable";
  const currency = usage?.currency ?? "USD";
  const rows = usage?.byAgent ?? [];
  const maxTokens = Math.max(1, ...rows.map((row) => tokenAmount(row) ?? 0));
  const maxCost = Math.max(0.000001, ...rows.map((row) => Number(value(row, "api_equivalent_cost", "apiEquivalentCost", "cost")) || 0));

  return (
    <div className="telemetry-card" data-testid="telemetry-panel">
      <div className="telemetry-heading">
        <div>
          <p className="eyebrow">Run telemetry</p>
          <h3 data-testid="telemetry-status">{humanize(status)}</h3>
        </div>
        {usage && status !== "unavailable" ? <UsageDownload runId={dashboardRun.run.id} usage={usage} /> : null}
      </div>
      <p className="telemetry-explanation">
        {usage?.telemetryExplanation ?? "Usage telemetry is unavailable for this retained run. Missing values are not treated as zero."}
      </p>
      <div className="cost-pair">
        <article><p className="eyebrow">Recorded marginal spend</p><strong>{formatMoney(usage?.spentUsd ?? null, currency)}</strong><p>{usage?.billingBasis ?? "Billing basis unavailable."}</p></article>
        <article><p className="eyebrow">API-equivalent estimate</p><strong>{formatMoney(usage?.apiEquivalentUsd ?? null, currency)}</strong><p>{usage?.apiEquivalentUsd === null || usage?.apiEquivalentUsd === undefined ? "API-equivalent price was not recorded; it is not inferred from subscription access." : "Counterfactual API-rate estimate; not the amount paid for the run."}</p></article>
      </div>
      {rows.length ? (
        <div className="table-card telemetry-table" tabIndex={0} role="group" aria-label="Cost breakdown by agent">
          <table>
            <caption>Cost breakdown by agent</caption>
            <thead><tr><th scope="col">Agent</th><th scope="col">Calls</th><th scope="col">Failures</th><th scope="col">Tokens</th><th scope="col">API-equivalent</th></tr></thead>
            <tbody>
              {rows.map((row, index) => {
                const tokens = tokenAmount(row);
                const cost = value(row, "api_equivalent_cost", "apiEquivalentCost", "cost");
                return (
                  <tr key={`${String(value(row, "agent"))}-${index}`}>
                    <th scope="row">{display(value(row, "agent"))}</th>
                    <td>{display(value(row, "calls", "live_calls", "liveCalls"))}</td>
                    <td>{display(value(row, "failures", "fail"))}</td>
                    <td><span>{display(tokens)}</span>{tokens !== null ? <span className="mini-bar" aria-hidden="true"><i style={{ width: `${(tokens / maxTokens) * 100}%` }} /></span> : null}</td>
                    <td><span>{typeof cost === "number" ? formatMoney(cost) : "Unavailable"}</span>{typeof cost === "number" ? <span className="mini-bar mini-bar-cost" aria-hidden="true"><i style={{ width: `${(cost / maxCost) * 100}%` }} /></span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="breakdown-empty">Per-agent breakdown: unavailable for this retained run.</p>
      )}
      <p className="chart-note">The full ledger — tokens by kind, tiers, model routing, latency, efficiency — is retained in the artifact and included in the JSON download above.</p>
    </div>
  );
}
