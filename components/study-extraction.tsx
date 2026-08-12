import { humanize } from "@/lib/dashboard/format";
import type { StudyExtraction } from "@/lib/dashboard/types";

/**
 * What each subagent extracted from one paper — the reviewer's verification
 * surface. Verbatim evidence spans render as quotes (founder decision
 * 2026-08-12: the quote is what lets a scientist check extraction against the
 * paper without opening it). Plain component, no hooks: embedded by the client
 * CorpusExplorer but unit-testable via renderToStaticMarkup.
 */
export function StudyExtractionDetail({ extraction }: { extraction: StudyExtraction | null }) {
  if (!extraction) {
    return (
      <p className="extraction-fallback">
        Extraction detail was not retained for this run. Runs produced after
        2026-08-12 carry it.
      </p>
    );
  }
  const { s3, s4, s5Claims, s7, s8 } = extraction;
  return (
    <div className="study-extraction">
      {s3 ? (
        <section className="extraction-group">
          <h4>S3 · Study facts</h4>
          <dl className="extraction-facts">
            {s3.populationText ? <div><dt>Population</dt><dd>{s3.populationText}</dd></div> : null}
            {s3.nRandomised !== null ? <div><dt>Randomised</dt><dd>{s3.nRandomised}</dd></div> : null}
            {s3.nAnalysed !== null ? <div><dt>Analysed</dt><dd>{s3.nAnalysed}</dd></div> : null}
            {s3.durationDays !== null ? <div><dt>Duration</dt><dd>{s3.durationDays} days</dd></div> : null}
            {s3.comparator ? <div><dt>Comparator</dt><dd>{humanize(s3.comparator)}</dd></div> : null}
            {s3.ingredientIsolated ? <div><dt>Ingredient isolated</dt><dd>{s3.ingredientIsolated}</dd></div> : null}
            {s3.selfDeclaredUnderpowered !== null ? (
              <div><dt>Self-declared underpowered</dt><dd>{s3.selfDeclaredUnderpowered ? "yes" : "no"}</dd></div>
            ) : null}
            {s3.registrationId ? <div><dt>Registration</dt><dd>{s3.registrationId}</dd></div> : null}
          </dl>
          <Spans spans={s3.evidenceSpans} />
        </section>
      ) : null}

      {s5Claims.length ? (
        <section className="extraction-group">
          <h4>S5 · Claims ({s5Claims.length})</h4>
          <ul className="extraction-claims">
            {s5Claims.map((claim, index) => (
              <li key={index} className={claim.discarded ? "claim-discarded" : undefined}>
                <div className="claim-line">
                  <strong>{claim.outcomeRaw ?? "Unnamed endpoint"}</strong>
                  <span className={`direction-chip direction-${claim.direction ?? "unknown"}`}>
                    {claim.direction ? humanize(claim.direction) : "direction unknown"}
                  </span>
                  {claim.outcomeVocabId ? (
                    <span className="claim-mapped">→ {humanize(claim.outcomeVocabId)}</span>
                  ) : (
                    <span className="claim-mapped claim-unmapped">unmapped</span>
                  )}
                  {claim.discarded ? <span className="claim-mapped claim-unmapped">discarded</span> : null}
                </div>
                <p className="claim-numbers">
                  {claim.effectSize !== null ? `effect ${claim.effectSize}${claim.effectUnit ? ` ${claim.effectUnit}` : ""}` : "no effect size"}
                  {claim.effectFavours ? ` · favours ${claim.effectFavours}` : ""}
                  {claim.effectSd !== null ? ` · SD ${claim.effectSd}${claim.effectSdBasis ? ` (${claim.effectSdBasis})` : ""}` : ""}
                  {claim.ciLow !== null && claim.ciHigh !== null ? ` · CI [${claim.ciLow}, ${claim.ciHigh}]` : ""}
                  {claim.pValue !== null ? ` · p ${claim.pValue}` : ""}
                  {claim.magnitude ? ` · ${claim.magnitude}` : ""}
                  {claim.contrast ? ` · ${humanize(claim.contrast)}` : ""}
                  {claim.isPrimaryOutcome ? " · primary outcome" : ""}
                </p>
                {claim.evidenceSpan ? <blockquote className="evidence-quote">{claim.evidenceSpan}</blockquote> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {s7 ? (
        <section className="extraction-group">
          <h4>S7 · Form &amp; dose</h4>
          <dl className="extraction-facts">
            {s7.formVocabId ? <div><dt>Form</dt><dd>{humanize(s7.formVocabId)}</dd></div> : null}
            {s7.formRaw ? <div><dt>As written</dt><dd>{s7.formRaw}</dd></div> : null}
            {s7.elementalDoseMg !== null ? <div><dt>Dose</dt><dd>{s7.elementalDoseMg} mg/day</dd></div> : null}
            {s7.compoundDoseMg !== null ? <div><dt>Compound dose</dt><dd>{s7.compoundDoseMg} mg/day</dd></div> : null}
            {s7.dosePerKgMg !== null ? <div><dt>Per-kg dose</dt><dd>{s7.dosePerKgMg} mg/kg/day</dd></div> : null}
            {s7.meanBodyMassKg !== null ? <div><dt>Stated mean body mass</dt><dd>{s7.meanBodyMassKg} kg</dd></div> : null}
            {s7.doseBasis ? <div><dt>Dose basis</dt><dd>{humanize(s7.doseBasis)}</dd></div> : null}
          </dl>
          {s7.evidenceSpan ? <blockquote className="evidence-quote">{s7.evidenceSpan}</blockquote> : null}
        </section>
      ) : null}

      {s4 ? (
        <section className="extraction-group">
          <h4>S4 · Risk of bias</h4>
          <dl className="extraction-facts">
            {s4.items.map((item) => (
              <div key={item.key}>
                <dt>{item.label}</dt>
                <dd>{item.value === null ? "unknown" : item.value === 1 ? "ok" : "concern"}</dd>
              </div>
            ))}
          </dl>
          <Spans spans={s4.evidenceSpans} />
        </section>
      ) : null}

      {s8 ? (
        <section className="extraction-group">
          <h4>S8 · Funding</h4>
          <dl className="extraction-facts">
            {s8.fundingClass ? <div><dt>Class</dt><dd>{humanize(s8.fundingClass)}</dd></div> : null}
            {s8.funderNames.length ? <div><dt>Funders</dt><dd>{s8.funderNames.join(", ")}</dd></div> : null}
            {s8.authorCoi !== null ? <div><dt>Author COI</dt><dd>{s8.authorCoi ? "declared" : "none declared"}</dd></div> : null}
          </dl>
          {s8.evidenceSpan ? <blockquote className="evidence-quote">{s8.evidenceSpan}</blockquote> : null}
        </section>
      ) : null}
    </div>
  );
}

function Spans({ spans }: { spans: string[] }) {
  if (!spans.length) return null;
  return (
    <div className="evidence-quotes">
      {spans.map((span, index) => (
        <blockquote className="evidence-quote" key={index}>{span}</blockquote>
      ))}
    </div>
  );
}
