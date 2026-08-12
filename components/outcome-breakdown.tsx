import { humanize } from "@/lib/dashboard/format";
import { buildScoreStory, isMeasuredRoute } from "@/lib/dashboard/story";
import type { DashboardOutcome, DashboardStudy } from "@/lib/dashboard/types";

interface OutcomeBreakdownProps {
  outcome: DashboardOutcome;
  studiesById: Map<string, DashboardStudy>;
}

/**
 * "How the score came to be" — the reviewer view inside an outcome card.
 *
 * No hooks and no client-only APIs: this renders inside the client
 * OutcomeExplorer but stays a plain component so it can also be unit-tested
 * with renderToStaticMarkup like FourRingScore.
 *
 * Every number here is read off the artifact; nothing is recomputed. When the
 * artifact predates per-study attribution (contributions empty) the component
 * says so explicitly — an empty table would read as "no evidence", which is
 * the null-vs-zero confusion this dashboard exists to avoid.
 */
export function OutcomeBreakdown({ outcome, studiesById }: OutcomeBreakdownProps) {
  const story = buildScoreStory(outcome);
  const contributions = [...outcome.contributions].sort(
    (a, b) => Math.abs(b.points ?? 0) - Math.abs(a.points ?? 0),
  );

  if (!contributions.length) {
    return (
      <div className="outcome-breakdown">
        <p className="breakdown-fallback">
          Per-study attribution was not recorded in this run&apos;s artifact.
          Runs produced after 2026-08-12 carry it.
        </p>
        <DoseStory outcome={outcome} />
      </div>
    );
  }

  const measured = contributions.filter((item) => isMeasuredRoute(item.effectRoute)).length;

  return (
    <div className="outcome-breakdown">
      {story ? <p className="breakdown-story">{story}</p> : null}
      <div className="breakdown-scroll" tabIndex={0} role="group" aria-label="Per-study contributions">
      <table className="breakdown-contributions">
        <caption>
          Per-study pull on the signed score, largest first.{" "}
          {measured} of {contributions.length} from measured effects.
        </caption>
        <thead>
          <tr>
            {/* Points immediately after the study: it is the headline number,
                and on a narrow card the rightmost columns scroll out of view --
                seen live 2026-08-12. */}
            <th scope="col">Study</th>
            <th scope="col">Points</th>
            <th scope="col">Basis</th>
            <th scope="col">Direction</th>
            <th scope="col">s</th>
            <th scope="col">Weight</th>
          </tr>
        </thead>
        <tbody>
          {contributions.map((item, index) => {
            const study = item.id ? studiesById.get(item.id) : undefined;
            const measuredRoute = isMeasuredRoute(item.effectRoute);
            return (
              <tr key={item.id ?? index}>
                <th scope="row" className="contribution-study">
                  {study?.title ?? item.id ?? "Unknown study"}
                </th>
                <td className={`numeric points ${item.points !== null && item.points < 0 ? "points-negative" : "points-positive"}`}>
                  {item.points === null ? "—" : `${item.points > 0 ? "+" : ""}${item.points.toFixed(1)}`}
                </td>
                <td>
                  <span
                    className={measuredRoute ? "route-chip route-measured" : "route-chip route-label"}
                    title={
                      measuredRoute
                        ? `Contribution came from a measured effect (${item.effectRoute})`
                        : `Direction label decided; number unavailable or refused (${item.effectRoute ?? "label"})`
                    }
                  >
                    {measuredRoute ? "measured effect" : "direction label"}
                  </span>
                </td>
                <td>{item.direction ? humanize(item.direction) : "—"}</td>
                <td className="numeric">{item.s === null ? "—" : item.s.toFixed(2)}</td>
                <td className="numeric">{item.w === null ? "—" : item.w.toFixed(3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <DoseStory outcome={outcome} />
      <FormBasis outcome={outcome} />
    </div>
  );
}

function formatMg(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1000) {
    const grams = value / 1000;
    return `${Number.isInteger(grams) ? grams : grams.toFixed(1)} g`;
  }
  return `${Math.round(value)} mg`;
}

function DoseStory({ outcome }: { outcome: DashboardOutcome }) {
  const story = outcome.doseStory;
  if (!story) return null;
  const closeness = outcome.arcs.dose.closeness ?? story.productFactor;
  return (
    <dl className="breakdown-dose">
      <div>
        <dt>Benefit observed at</dt>
        <dd>
          {story.low === null
            ? "no dosed benefit trial"
            : `${formatMg(story.low)}–${formatMg(story.high)} (${story.nBenefit ?? "?"} trials)`}
        </dd>
      </div>
      {story.nullRange ? (
        <div>
          <dt>No effect found at</dt>
          <dd>
            {formatMg(story.nullRange.low)}–{formatMg(story.nullRange.high)} ({story.nNull ?? "?"} trials)
          </dd>
        </div>
      ) : null}
      <div>
        <dt>Product closeness</dt>
        <dd>
          {closeness === null ? "unassessed" : closeness.toFixed(2)}
          {story.productMatch ? ` (${humanize(story.productMatch)})` : null}
        </dd>
      </div>
    </dl>
  );
}

function FormBasis({ outcome }: { outcome: DashboardOutcome }) {
  const form = outcome.arcs.form;
  if (form.verdict === null && form.coverage === null) return null;
  return (
    <p className="breakdown-form">
      Form arc: verdict {form.verdict === null ? "—" : form.verdict.toFixed(2)} at{" "}
      {form.coverage === null ? "—" : `${Math.round(form.coverage * 100)}%`} coverage of
      evidence in {outcome.formVocabId ? humanize(outcome.formVocabId) : "the product's form"}.
    </p>
  );
}
