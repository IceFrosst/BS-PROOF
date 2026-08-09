import { formatMoney, formatNumber, formatPercent, humanize } from "@/lib/dashboard/format";
import type { DashboardRun } from "@/lib/dashboard/types";
import { UsageDownload } from "./usage-download";

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

function seconds(valueToDisplay: number | null): string {
  return valueToDisplay === null ? "Unavailable" : `${formatNumber(valueToDisplay, 1)} s`;
}

function rowMetric(row: Record<string, unknown>, ...keys: string[]): unknown {
  const direct = value(row, ...keys);
  if (direct !== null && direct !== undefined) return direct;
  const latency = value(row, "latency");
  return latency && typeof latency === "object" && !Array.isArray(latency)
    ? value(latency as Record<string, unknown>, ...keys)
    : null;
}

function BreakdownTable({ rows, identity, caption }: { rows: Array<Record<string, unknown>>; identity: string; caption: string }) {
  if (!rows.length) return <p className="breakdown-empty">{caption}: unavailable for this retained run.</p>;
  const maxTokens = Math.max(1, ...rows.map((row) => tokenAmount(row) ?? 0));
  const maxCost = Math.max(0.000001, ...rows.map((row) => Number(value(row, "api_equivalent_cost", "apiEquivalentCost", "cost")) || 0));
  return (
    <div className="table-card telemetry-table"><table><caption>{caption}</caption><thead><tr><th scope="col">{humanize(identity)}</th><th scope="col">Calls</th><th scope="col">Failures</th><th scope="col">Avg latency</th><th scope="col">P95 latency</th><th scope="col">Tokens</th><th scope="col">API-equivalent</th></tr></thead><tbody>{rows.map((row, index) => {
      const tokens = tokenAmount(row);
      const cost = value(row, "api_equivalent_cost", "apiEquivalentCost", "cost");
      const averageLatency = rowMetric(row, "average_s", "average_latency_s", "avg_latency_s", "latency_average_s");
      const p95Latency = rowMetric(row, "p95_s", "p95_latency_s", "latency_p95_s");
      return <tr key={`${String(value(row, identity))}-${index}`}><th scope="row">{display(value(row, identity))}</th><td>{display(value(row, "calls", "live_calls", "liveCalls"))}</td><td>{display(value(row, "failures", "fail"))}</td><td>{typeof averageLatency === "number" ? seconds(averageLatency) : "Unavailable"}</td><td>{typeof p95Latency === "number" ? seconds(p95Latency) : "Unavailable"}</td><td><span>{display(tokens)}</span>{tokens !== null ? <span className="mini-bar" aria-hidden="true"><i style={{ width: `${(tokens / maxTokens) * 100}%` }} /></span> : null}</td><td><span>{typeof cost === "number" ? formatMoney(cost) : "Unavailable"}</span>{typeof cost === "number" ? <span className="mini-bar mini-bar-cost" aria-hidden="true"><i style={{ width: `${(cost / maxCost) * 100}%` }} /></span> : null}</td></tr>;
    })}</tbody></table></div>
  );
}

export function TelemetryPanel({ dashboardRun }: { dashboardRun: DashboardRun }) {
  const usage = dashboardRun.usage;
  const status = usage?.status ?? "unavailable";
  const currency = usage?.currency ?? "USD";
  const tokenParts = usage ? [
    ["Fresh input", usage.freshInputTokens, "token-fresh"],
    ["Cache write", usage.cacheWriteTokens, "token-write"],
    ["Cache read", usage.cacheReadTokens, "token-read"],
    ["Output", usage.outputTokens, "token-output"],
  ] as const : [];
  const tokenTotal = tokenParts.every(([, amount]) => amount !== null)
    ? tokenParts.reduce((total, [, amount]) => total + (amount ?? 0), 0)
    : null;
  const operation = (key: string) => usage?.operations[key] ?? null;
  const efficiencyRows = usage ? Object.entries(usage.efficiency).map(([scope, raw]) => ({ scope, ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {}) })) : [];
  const routingRows = usage?.modelRouting.length ? usage.modelRouting : (usage?.byAgent ?? []);

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
      <dl className="metric-grid telemetry-metrics">
        <div><dt>Live calls</dt><dd>{formatNumber(usage?.calls ?? null)}</dd></div>
        <div><dt>Cache hits</dt><dd>{formatNumber(usage?.cacheHits ?? null)}</dd></div>
        <div><dt>Retries</dt><dd>{formatNumber(usage?.retries ?? null)}</dd></div>
        <div><dt>Failures</dt><dd>{formatNumber(usage?.failures ?? null)}</dd></div>
        <div><dt>Wall time</dt><dd>{seconds(usage?.latencyWallTimeSeconds ?? null)}</dd></div>
        <div><dt>Average latency</dt><dd>{seconds(usage?.latencyAverageSeconds ?? null)}</dd></div>
        <div><dt>P95 latency</dt><dd>{seconds(usage?.latencyP95Seconds ?? null)}</dd></div>
        <div><dt>Peak concurrency</dt><dd>{formatNumber(usage?.peakConcurrency ?? null)}</dd></div>
      </dl>
      <p className="chart-note">Latency basis: {usage?.latencyBasis ?? "Unavailable"}</p>

      <div className="telemetry-split">
        <figure className="token-card">
          <div className="chart-heading"><div><p className="eyebrow">Token composition</p><h3>{tokenTotal === null ? "Tokens unavailable" : `${formatNumber(tokenTotal)} tokens`}</h3></div><p>Fresh input, cache write, cache read, and output stay separate.</p></div>
          {tokenTotal !== null && tokenTotal > 0 ? <div className="token-stack" role="img" aria-label={tokenParts.map(([label, amount]) => `${label}: ${formatNumber(amount)}`).join(", ")}>{tokenParts.map(([label, amount, className]) => <span className={className} key={label} style={{ width: `${((amount ?? 0) / tokenTotal) * 100}%` }} />)}</div> : <div className="missing-visual">Token counts were not recorded for this run.</div>}
          <ul className="token-legend">{tokenParts.map(([label, amount, className]) => <li key={label}><i className={className} aria-hidden="true" /><span>{label}</span><strong>{formatNumber(amount)}</strong></li>)}</ul>
          <figcaption className="chart-note">Cache read/write tokens can be priced differently from fresh input. This panel does not apply prices unless the artifact retains them.</figcaption>
        </figure>
        <figure className="operation-card">
          <div className="chart-heading"><div><p className="eyebrow">Call outcomes</p><h3>Cache &amp; failure breakdown</h3></div></div>
          <dl className="detail-list"><div><dt>Successful</dt><dd>{formatNumber(operation("successful_calls"))}</dd></div><div><dt>Failed</dt><dd>{formatNumber(operation("failed_calls"))}</dd></div><div><dt>Cached</dt><dd>{formatNumber(operation("cache_hits"))}</dd></div><div><dt>Timeouts</dt><dd>{formatNumber(operation("timeouts"))}</dd></div><div><dt>Auth failures</dt><dd>{formatNumber(operation("auth_failures"))}</dd></div><div><dt>Fail rate</dt><dd>{formatPercent(operation("fail_rate"))}</dd></div><div><dt>Concurrency limit</dt><dd>{formatNumber(operation("concurrency_limit"))}</dd></div></dl>
          <figcaption className="chart-note">A cache hit avoids a live call; infrastructure or subscription cost is outside API-equivalent model pricing.</figcaption>
        </figure>
      </div>

      <div className="telemetry-breakdowns">
        <BreakdownTable rows={usage?.byAgent ?? []} identity="agent" caption="Token and cost breakdown by agent" />
        <BreakdownTable rows={usage?.byTier ?? []} identity="tier" caption="Token and cost breakdown by tier" />
        <BreakdownTable rows={usage?.byModel ?? []} identity="model" caption="Per-model aggregate" />
      </div>

      <div className="table-card telemetry-table"><table><caption>Model routing</caption><thead><tr><th scope="col">Agent</th><th scope="col">Tier</th><th scope="col">Provider</th><th scope="col">Full model</th><th scope="col">Effort</th><th scope="col">Prompt</th><th scope="col">Status</th></tr></thead><tbody>{routingRows.length ? routingRows.map((row, index) => {
        const agent = display(value(row, "agent"));
        const configuredModel = value(row, "full_model", "model", "configured_model") ?? dashboardRun.run.models[agent] ?? null;
        return <tr key={`${agent}-${index}`}><th scope="row">{agent}</th><td>{display(value(row, "tier"))}</td><td>{display(value(row, "provider") ?? dashboardRun.run.provider)}</td><td>{display(configuredModel)}</td><td>{display(value(row, "effort", "reasoning_effort"))}</td><td>{display(value(row, "prompt_version") ?? dashboardRun.run.promptVersion)}</td><td>{humanize(String(value(row, "status") ?? "unavailable"))}</td></tr>;
      }) : <tr><td colSpan={7}>Model routing breakdown unavailable.</td></tr>}</tbody></table></div>

      <div className="table-card telemetry-table"><table><caption>Per-study and per-outcome efficiency</caption><thead><tr><th scope="col">Scope</th><th scope="col">Denominator</th><th scope="col">Calls</th><th scope="col">Tokens</th><th scope="col">API-equivalent</th></tr></thead><tbody>{efficiencyRows.length ? efficiencyRows.map((row) => <tr key={row.scope}><th scope="row">{humanize(row.scope)}</th><td>{display(value(row, "denominator"))}</td><td>{display(value(row, "calls"))}</td><td>{display(value(row, "tokens"))}</td><td>{typeof value(row, "api_equivalent_cost") === "number" ? formatMoney(value(row, "api_equivalent_cost") as number, currency) : "Unavailable"}</td></tr>) : <tr><td colSpan={5}>Efficiency denominators unavailable.</td></tr>}</tbody></table></div>

      <div className="telemetry-notes"><p><strong>Cache pricing:</strong> cached input may have a distinct price from fresh input, and cache hits are operational events rather than zero-token calls. No price is applied without retained token records.</p><p><strong>Infrastructure boundary:</strong> Vercel hosting is separate from model-run cost. Supabase is unused in v1, and free literature APIs are not model costs. Orchestration, storage, networking, and subscription overhead remain separate unless explicitly recorded.</p></div>
    </div>
  );
}
