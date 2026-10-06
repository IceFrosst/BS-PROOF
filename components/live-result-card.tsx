"use client";

/*
 * The /scan LIVE RESEARCH RESULT CARD: the established card (Outcomes tab, one tab per
 * outcome, a warnings block, four expandable horizontal rows in the order Effect,
 * Evidence, Form, Dose), fed by a completed LIVE audit. The markup, class names and
 * interactions are the approved ones (app/design-lab/ab/ab.css; the production card of
 * components/scan-flow.tsx before the live-only change), so nothing here restyles them.
 *
 * What it adds is honesty, decided in lib/scan-research/result-card.ts and only drawn
 * here: every row says its state out loud (filled / data / unknown / not assessed / not
 * gradeable), a bar is filled ONLY where that adapter allows it, an unfilled bar names
 * its reason, and no row, tab or tile carries a score, a headline or a general number.
 *
 * Text the research MODEL wrote is drawn verbatim (never translated, trimmed or
 * rounded) and tagged lang="en" in Lithuanian; every control, label, state word and
 * warning is localised (lib/i18n/copy/research-card.ts).
 *
 * Accessibility: role=tablist / tab / tabpanel with roving tabindex and arrow / Home /
 * End keys; each row is a real button with aria-expanded / aria-controls; warnings are
 * native <details>; bars are decorative (aria-hidden) because the state word and the
 * number beside them carry the same facts as text.
 */
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { RESEARCH_CARD_COPY, type CardCopy } from "@/lib/i18n/copy/research-card";
import { RESEARCH_COPY, type ResearchLanguage } from "@/lib/i18n/copy/research";
import { RESULT_COPY, enumWord, ledgerWord } from "@/lib/i18n/copy/result";
import type { ResearchFacts } from "@/lib/scan-research/client";
import type { AxisId, AxisView, DetailBlock, LiveResultCardData, LiveWarning, OutcomeCard, SourceView } from "@/lib/scan-research/result-card";

const AXIS_COLOR: Record<AxisId, string> = { effect: "var(--ab-r1)", evidence: "var(--ab-r4)", form: "var(--ab-r2)", dose: "var(--ab-r3)" };
/** The established 0-4 fit words (lib/evidence-ledger FIT_WORDS), keyed by the audit's own number. */
const FIT_WORDS = ["No match", "Poor match", "Partial match", "Close match", "Exact match"] as const;
const EFFECT_TIER_WORDS: Record<string, string> = { "-3": "Harm reported", "0": "No meaningful effect", "1": "Small benefit", "2": "Moderate benefit", "3": "Large benefit", unclear: "Unclear" };

type Lang = ResearchLanguage;

function Chevron({ go = false }: { go?: boolean }) {
  return <span className={`ab-chev${go ? " go" : ""}`} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
}

/** A line the research MODEL wrote: verbatim, tagged English in the Lithuanian view. */
function Said({ label, children, lang }: { label: string; children: ReactNode; lang: Lang }) {
  return <p lang={lang === "lt" ? "en" : undefined}><b lang={lang}>{label}</b> {children}</p>;
}
/** A line made of the page's own words and facts (never model prose). */
function Line({ label, children }: { label: string; children: ReactNode }) {
  return <p><b>{label}</b> {children}</p>;
}

function axisWord(c: CardCopy, axis: AxisView, lang: Lang): string {
  if (axis.state === "filled" && axis.fit !== null) return ledgerWord(lang, FIT_WORDS[axis.fit]);
  if (axis.state === "data") return axis.id === "effect" ? c.axisWord.effectData : c.axisWord.evidenceData;
  if (axis.state === "filled") return c.axisWord.unknown;
  return c.axisWord[axis.state];
}

function listWord(c: CardCopy, row: OutcomeCard): string {
  if (row.context) return c.listWords.context;
  return row.sources.length === 0 ? c.listWords.none : c.listWords.ungraded;
}

function fitText(c: CardCopy, raw: string | null): string {
  if (raw === null) return c.labels.fitNone;
  if (raw === "unknown") return c.labels.fitUnknown;
  return /^[0-4]$/.test(raw) ? c.labels.fitOf(Number(raw)) : raw;
}

function DetailLines({ block, lang }: { block: DetailBlock | null; lang: Lang }) {
  const r = RESULT_COPY[lang];
  if (!block) return null;
  return <>
    {block.found !== null ? <Said label={r.found} lang={lang}>{block.found}</Said> : null}
    {block.missing !== null ? <Said label={r.missing} lang={lang}>{block.missing}</Said> : null}
    {block.move !== null ? <Said label={r.wouldMove} lang={lang}>{block.move}</Said> : null}
  </>;
}

function sourceMeta(c: CardCopy, s: SourceView, lang: Lang): string {
  const parts: string[] = [];
  if (s.year !== null) parts.push(String(s.year));
  if (s.design) parts.push(c.design[s.design] ?? s.design);
  if (s.n !== null) parts.push(`n=${s.n}`);
  if (s.direction) parts.push(c.direction[s.direction] ?? s.direction);
  parts.push(enumWord(lang, s.access));
  if (s.funding) parts.push(`${c.labels.funding}: ${c.fundingKind[s.funding] ?? s.funding}`);
  if (s.pooledIn) parts.push(`${c.labels.pooledIn} ${s.pooledIn}`);
  return parts.join(" · ");
}

function Sources({ c, row, lang }: { c: CardCopy; row: OutcomeCard; lang: Lang }) {
  if (row.sources.length === 0) return <p className="ab-srcs" data-testid="research-no-sources">{c.labels.noSources}</p>;
  return <div className="ab-srcs sc-live-sources" data-testid="research-sources">
    <p><b>{c.labels.sources}</b> {c.labels.sourcesNote}</p>
    <ul>
      {row.sources.map((s, i) => <li key={`${s.id}-${i}`}>
        <span className="sc-live-src-id">{s.href ? <a href={s.href} target="_blank" rel="noreferrer">{s.id}</a> : s.id}</span>{" "}
        <small>({sourceMeta(c, s, lang)})</small>
        {s.note !== null ? <span lang={lang === "lt" ? "en" : undefined} className="sc-live-src-note"> — {s.note}</span> : null}
      </li>)}
    </ul>
  </div>;
}

function AxisBody({ axisId, axis, row, card, facts, lang, c }: { axisId: AxisId; axis: AxisView; row: OutcomeCard; card: LiveResultCardData; facts: ResearchFacts | null; lang: Lang; c: CardCopy }) {
  const r = RESULT_COPY[lang];
  const yes = RESEARCH_COPY[lang].yes;
  const no = RESEARCH_COPY[lang].no;
  const tierWord = row.effectTier === null ? c.labels.tierNone : `${ledgerWord(lang, EFFECT_TIER_WORDS[row.effectTier])}${row.effectTier === "unclear" ? "" : ` (${row.effectTier})`}`;
  const yn = (v: boolean | null) => (v === null ? c.labels.notReported : v ? yes : no);
  const num = (v: number | null) => (v === null ? c.labels.notReported : String(v));
  return <>
    <p className="ab-stamp" data-testid="axis-stamp">{c.axisStamp[axis.state]}</p>
    <Line label={c.why}>{c.reasons[axis.reason]}</Line>

    {axisId === "effect" ? <>
      <Line label={c.labels.tier}>{tierWord}</Line>
      {row.effectBasis !== null ? <Said label={c.labels.basis} lang={lang}>{row.effectBasis}</Said> : null}
      {row.absoluteEffect !== null ? <Said label={c.labels.estimate} lang={lang}>{row.absoluteEffect}</Said> : null}
      {row.clinicallyMeaningful !== null ? <Said label={c.labels.meaningful} lang={lang}>{row.clinicallyMeaningful}</Said> : null}
      <Said label={c.labels.strongestStudy} lang={lang}>{row.strongestStudy}</Said>
      <Said label={c.labels.strongestDoubt} lang={lang}>{row.strongestDoubt}</Said>
      {row.studyThatWouldMove !== null ? <Said label={RESEARCH_COPY[lang].wouldMove} lang={lang}>{row.studyThatWouldMove}</Said> : null}
    </> : null}

    {axisId === "evidence" && row.gates ? <>
      <Line label={c.labels.rctCount}>{num(row.gates.rctCount)}</Line>
      <Line label={c.labels.largestRct}>{num(row.gates.largestRctN)}</Line>
      <Line label={c.labels.longestRct}>{num(row.gates.longestRctWeeks)}</Line>
      {row.gates.rctCount === 0 || row.gates.largestRctN === 0 || row.gates.longestRctWeeks === 0 ? <p className="ab-stamp">{c.labels.zeroNote}</p> : null}
      <Line label={c.labels.bodyIsRct}>{yn(row.bodyIsRct)}</Line>
      <Line label={c.labels.chronic}>{yn(row.gates.chronicOutcome)}</Line>
      <Line label={c.labels.surrogate}>{yn(row.gates.surrogate)}</Line>
    </> : null}
    {axisId === "evidence" && row.checklist.length ? <>
      <Line label={c.labels.checklist}>{row.checklist.map((e) => `${r.checklistNames[e.domain] ?? e.domain}: ${enumWord(lang, e.judgement)}`).join("; ")}</Line>
      {row.checklist.some((e) => e.judgement === "unknown") ? <p className="ab-stamp">{c.labels.uncheckedNote}</p> : null}
    </> : null}

    {axisId === "form" ? <>
      <Line label={c.labels.formOnScan}>{facts?.form ?? c.labels.notStated}</Line>
      <Line label={c.labels.modelFit}>{fitText(c, row.formFitRaw)}{axis.state === "filled" ? "" : ` · ${c.labels.textOnly}`}</Line>
    </> : null}

    {axisId === "dose" ? <>
      <Line label={RESEARCH_COPY[lang].factLabels.compoundPerServing}>{facts && facts.compoundPerServingMg !== null ? `${facts.compoundPerServingMg} mg` : c.labels.notStated}</Line>
      <Line label={RESEARCH_COPY[lang].factLabels.printedElementalPerServing}>{facts && facts.printedElementalPerServingMg !== null ? `${facts.printedElementalPerServingMg} mg` : c.labels.elementalNotStated}</Line>
      {facts?.unitAsPrinted ? <Line label={RESEARCH_COPY[lang].factLabels.unit}>{facts.unitAsPrinted}</Line> : null}
      <Line label={c.labels.servingsOnScan}>{facts && facts.servingsPerDay !== null && facts.servingsPerDay > 0 ? facts.servingsPerDay : c.labels.notStated}</Line>
      <Said label={c.labels.dailyDose} lang={lang}>{card.audit.dailyDose}</Said>
      {card.audit.doseNote !== null ? <Said label={c.labels.doseNote} lang={lang}>{card.audit.doseNote}</Said> : null}
      {row.effectiveDailyRange !== null ? <Said label={c.labels.range} lang={lang}>{row.effectiveDailyRange}</Said> : null}
      <Line label={c.labels.modelFit}>{fitText(c, row.doseFitRaw)}{axis.state === "filled" ? "" : ` · ${c.labels.textOnly}`}</Line>
    </> : null}

    <DetailLines block={row.detail[axisId]} lang={lang} />
    {axisId === "effect" ? <Sources c={c} row={row} lang={lang} /> : null}
  </>;
}

function WarningItem({ w, c, lang }: { w: LiveWarning; c: CardCopy; lang: Lang }) {
  const copy = c.warnings[w.id];
  const body = w.id === "blend" ? RESEARCH_COPY[lang].blendNote : (copy as { body: string }).body;
  return <details data-warning={w.id} data-scope={w.scope}>
    <summary>{copy.title} · {copy.status}</summary>
    <p>{body}</p>
    {w.id === "methodology" ? <ul>{w.reasons.map((reason) => <li key={reason}>{c.methodReasons[reason]}</li>)}</ul> : null}
    {w.id === "funding" || w.id === "publication" ? <>
      {w.reported.length ? <>
        <p className="ab-stamp">{c.reportedLead}</p>
        {w.reported.map((text, i) => <p key={i} lang={lang === "lt" ? "en" : undefined}>{text}</p>)}
      </> : <p>{c.noneReported}</p>}
    </> : null}
  </details>;
}

export function LiveResultCard({ card, facts, lang }: { card: LiveResultCardData; facts: ResearchFacts | null; lang: Lang }) {
  const c = RESEARCH_CARD_COPY[lang];
  const r = RESULT_COPY[lang];
  const scope = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [active, setActive] = useState<string | null>(null); // null = the Outcomes list
  const [open, setOpen] = useState<string | null>(null);
  const keys: Array<string | null> = [null, ...card.rows.map((row) => row.key)];
  const tabId = (key: string | null) => `${scope}-tab-${key ?? "list"}`;
  const panelId = `${scope}-panel`;
  const current = active === null ? null : card.rows.find((row) => row.key === active) ?? null;

  const select = (key: string | null, focus = false) => {
    setActive(key);
    setOpen(null);
    if (focus) {
      const at = keys.indexOf(key);
      // After the new panel is in place, put focus on the tab that now owns it.
      queueMicrotask(() => refs.current[at]?.focus());
    }
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? keys.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length;
    select(keys[next], true);
  };
  const en = lang === "lt" ? "en" : undefined;

  const list = <>
    <div className="ab-listhead">
      <h3>{r.outcomesTab}</h3>
      <p>{c.listLead}</p>
    </div>
    <ul className="ab-bars outcomes" data-testid="research-outcome-list">
      {card.rows.map((row) => <li key={row.key} data-outcome-key={row.key} data-context={row.context ? "true" : "false"}>
        <button type="button" onClick={() => select(row.key, true)}>
          <span className="ab-bar-name"><span lang={en}>{row.name}</span>{row.population ? <small lang={en}>{row.population}</small> : null}<small lang={en} className="sc-live-sentence">{row.sentence}</small></span>
          <span className="ab-bar-word">{listWord(c, row)}</span>
          <span className="ab-bar-pts" aria-hidden="true">—</span>
          <Chevron go />
          <span className="ab-bar-track hatch" aria-hidden="true" />
        </button>
      </li>)}
    </ul>
  </>;

  const outcome = current ? <>
    <div className="ab-headline muted sc-live-headline" data-testid="research-outcome-head">
      <div>
        <h3 lang={en}>{current.name}</h3>
        <p className="ab-pop"><b>{r.populationLabel}</b> <span lang={en}>{current.population ?? r.populationNotRecorded}</span></p>
        <p lang={en}>{current.sentence}</p>
        {current.context ? <p className="ab-stamp" data-testid="research-context-banner">{c.contextBanner}</p> : null}
      </div>
    </div>
    {current.warnings.length ? <details className="ab-warnings" key={current.key} data-testid="research-warnings" data-warning-count={current.warnings.length}>
      <summary><span>{r.warningCount(current.warnings.length)}</span></summary>
      <div className="ab-warning-list" aria-label={r.warningCount(current.warnings.length)}>
        {current.warnings.map((w) => <WarningItem key={w.id} w={w} c={c} lang={lang} />)}
      </div>
    </details> : <p className="ab-stamp" data-testid="research-no-warning">{c.noWarning}</p>}
    <ul className="ab-bars" data-testid="research-axes">
      {current.axes.map((axis) => {
        const isOpen = open === axis.id;
        const label = axis.id === "effect" ? r.dimEffect : axis.id === "evidence" ? r.dimEvidence : axis.id === "form" ? r.dimForm : r.dimDose;
        const detailId = `${scope}-${current.key}-${axis.id}`;
        const fill = axis.fill;
        return <li key={axis.id} className={isOpen ? "open" : ""} data-row-id={axis.id} data-axis-state={axis.state} data-axis-reason={axis.reason} data-fill={fill === null ? "none" : String(fill)}>
          <button type="button" aria-expanded={isOpen} aria-controls={detailId} onClick={() => setOpen(isOpen ? null : axis.id)}>
            <span className="ab-bar-name">{label}</span>
            <span className="ab-bar-word">{axisWord(c, axis, lang)}</span>
            <span className="ab-bar-pts">{axis.fit !== null ? `${axis.fit}/4` : "—"}</span>
            <Chevron />
            <span className={`ab-bar-track ${fill === null ? "hatch" : "fill"}`} aria-hidden="true">{fill !== null ? <i style={{ width: `${Math.round(fill * 100)}%`, background: AXIS_COLOR[axis.id] }} /> : null}</span>
          </button>
          {isOpen ? <div id={detailId} className="ab-bar-detail" data-testid={`research-axis-${axis.id}`}>
            <AxisBody axisId={axis.id} axis={axis} row={current} card={card} facts={facts} lang={lang} c={c} />
          </div> : null}
        </li>;
      })}
    </ul>
  </> : null;

  return <section className="ab-card scan-lab-card sc-live-card" aria-label={c.cardLabel} data-testid="research-audit" data-axis-order="effect,evidence,form,dose">
    <p className="ab-stamp scan-lab-validity"><b>{c.stamp}</b><span className="sc-live-stamp-line" lang={en}>{card.audit.runAt ? `${card.audit.runAt} · ` : ""}{card.audit.product}</span><span className="sc-live-stamp-line">{c.stampTail}</span></p>
    <div className="ab-tabs" role="tablist" aria-label={r.outcomeTablist}>
      {keys.map((key, index) => {
        const row = key === null ? null : card.rows[index - 1];
        const selected = key === active;
        return <button
          key={key ?? "list"}
          ref={(node) => { refs.current[index] = node; }}
          type="button"
          role="tab"
          id={tabId(key)}
          aria-selected={selected}
          aria-controls={panelId}
          tabIndex={selected ? 0 : -1}
          title={row?.population ?? undefined}
          data-outcome-tab={key ?? "list"}
          onClick={() => select(key)}
          onKeyDown={(event) => onKey(event, index)}
        >
          {row ? <span lang={en}>{row.name}</span> : r.outcomesTab}
          {row?.context ? <small>{c.contextTag}</small> : null}
        </button>;
      })}
    </div>
    <div role="tabpanel" id={panelId} aria-labelledby={tabId(active)} tabIndex={-1} data-testid="research-panel" data-active={active ?? "list"}>
      {current ? outcome : list}
    </div>
  </section>;
}
