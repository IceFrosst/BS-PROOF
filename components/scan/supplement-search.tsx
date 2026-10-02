"use client";

/*
 * "Search for your supplement" -- the manual path on /scan (2026-09-15).
 *
 * Three steps, in the order the pipeline needs them: an INGREDIENT from the
 * catalog (an accessible combobox over labels and aliases), the EXACT FORM
 * from that ingredient's vocabulary (a native select -- no default, because a
 * pre-selected salt would be a guess typed on the user's behalf), then an
 * OPTIONAL per-serving dose in mg / g / mcg and optional servings per day.
 *
 * Dose, unit and servings are RESET whenever the ingredient or the query
 * changes: the dose fieldset is hidden until a form is picked, so a value typed
 * for the previous ingredient would otherwise ride along invisibly into the
 * next submission. Validation is the same `checkManualDose` /
 * `checkServingsPerDay` the server runs, so the form cannot accept what the
 * route refuses.
 *
 * What it will not do: accept IU (the mass equivalent depends on the
 * substance, see lib/analyze/manual-dose.ts), accept a mass dose for a
 * CFU-counted ingredient, or accept an ingredient or form the catalog does not
 * list. The catalog is server-derived from vocab/form.json and handed in as a
 * prop, so the client holds no second copy of the vocabulary.
 *
 * Combobox follows the WAI-ARIA APG pattern: role=combobox on the input,
 * aria-expanded / aria-controls / aria-activedescendant, a role=listbox of
 * role=option children, and Arrow / Enter / Escape / Home / End handling.
 * tests/scan-search.test.tsx drives it by keyboard alone.
 */

import { useCallback, useId, useMemo, useState, type KeyboardEvent } from "react";

import type { CatalogForm, CatalogIngredient } from "@/lib/analyze/catalog";
import {
  checkManualDose,
  checkServingsPerDay,
  MANUAL_DOSE_UNITS,
  MAX_SERVINGS_PER_DAY,
  maxManualDoseInUnit,
  type ManualDoseUnit,
} from "@/lib/analyze/manual-dose";
import type { ManualScanInput } from "@/lib/analyze/scan";

export const MAX_MATCHES = 8;

export interface CatalogMatch {
  ingredient: CatalogIngredient;
  /** Why it matched, so the list can say "matches: Magtein" when the label does not contain the query. */
  via: string | null;
}

function fold(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Rank: label prefix, then label substring, then ingredient alias, then a form
 * label or alias (typing "bisglycinate" or "Magtein" finds magnesium). Pure, so
 * it is unit-tested apart from the component.
 */
export function matchCatalog(catalog: CatalogIngredient[], query: string): CatalogMatch[] {
  const q = fold(query);
  if (!q) return [];
  const ranked: Array<{ rank: number; match: CatalogMatch }> = [];
  for (const ingredient of catalog) {
    const label = fold(ingredient.label);
    if (label.startsWith(q)) {
      ranked.push({ rank: 0, match: { ingredient, via: null } });
      continue;
    }
    if (label.includes(q) || fold(ingredient.id).includes(q)) {
      ranked.push({ rank: 1, match: { ingredient, via: null } });
      continue;
    }
    const alias = ingredient.aliases.find((a) => fold(a).includes(q));
    if (alias) {
      ranked.push({ rank: 2, match: { ingredient, via: alias } });
      continue;
    }
    let viaForm: string | null = null;
    for (const form of ingredient.forms) {
      if (fold(form.label).includes(q)) {
        viaForm = form.label;
        break;
      }
      const fa = form.aliases.find((a) => fold(a).includes(q));
      if (fa) {
        viaForm = fa;
        break;
      }
    }
    if (viaForm) ranked.push({ rank: 3, match: { ingredient, via: viaForm } });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.match.ingredient.label.localeCompare(b.match.ingredient.label));
  return ranked.slice(0, MAX_MATCHES).map((r) => r.match);
}

function conversionNote(form: CatalogForm, ingredient: CatalogIngredient): string {
  if (ingredient.dose_basis_kind === "cfu") return "Counted in CFU, not mass — the analysis runs without a dose axis.";
  switch (form.dose_conversion) {
    case "exact":
      return "A typed dose converts exactly to the active amount.";
    case "bounded":
      return "This salt's hydration is often unstated, so a typed dose converts to a bounded range rather than one number.";
    default:
      return "A dose for this form cannot be converted to an active amount, so the dose axis stays unavailable. The rest of the analysis still runs.";
  }
}

export function SupplementSearch({
  catalog,
  busy,
  onSubmit,
}: {
  catalog: CatalogIngredient[];
  busy: boolean;
  onSubmit: (input: ManualScanInput) => void;
}) {
  const uid = useId();
  const inputId = `${uid}-ingredient`;
  const listId = `${uid}-listbox`;
  const formId = `${uid}-form`;
  const doseId = `${uid}-dose`;
  const unitId = `${uid}-unit`;
  const servingsId = `${uid}-servings`;
  const helpId = `${uid}-help`;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [ingredientId, setIngredientId] = useState<string | null>(null);
  const [form, setForm] = useState("");
  const [dose, setDose] = useState("");
  const [unit, setUnit] = useState<ManualDoseUnit>("mg");
  const [servings, setServings] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const matches = useMemo(() => (ingredientId ? [] : matchCatalog(catalog, query)), [catalog, query, ingredientId]);
  const ingredient = useMemo(() => catalog.find((i) => i.id === ingredientId) ?? null, [catalog, ingredientId]);
  const chosenForm = ingredient?.forms.find((f) => f.id === form) ?? null;
  const takesMass = ingredient ? ingredient.dose_basis_kind !== "cfu" : true;
  const listOpen = open && matches.length > 0;

  // Everything downstream of the ingredient is cleared with it; see the header.
  const resetDetails = useCallback(() => {
    setForm("");
    setDose("");
    setUnit("mg");
    setServings("");
    setProblem(null);
  }, []);

  const choose = useCallback(
    (match: CatalogMatch) => {
      setIngredientId(match.ingredient.id);
      setQuery(match.ingredient.label);
      resetDetails();
      setOpen(false);
      setActive(-1);
    },
    [resetDetails],
  );

  const onQueryChange = (value: string) => {
    setQuery(value);
    setIngredientId(null);
    resetDetails();
    setOpen(true);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!matches.length) return;
        setOpen(true);
        setActive((i) => (listOpen ? Math.min(i + 1, matches.length - 1) : 0));
        return;
      case "ArrowUp":
        e.preventDefault();
        if (!listOpen) return;
        setActive((i) => Math.max(i - 1, 0));
        return;
      case "Home":
        if (!listOpen) return;
        e.preventDefault();
        setActive(0);
        return;
      case "End":
        if (!listOpen) return;
        e.preventDefault();
        setActive(matches.length - 1);
        return;
      case "Enter":
        if (listOpen && active >= 0 && active < matches.length) {
          e.preventDefault();
          choose(matches[active]);
        } else if (listOpen && matches.length === 1) {
          e.preventDefault();
          choose(matches[0]);
        }
        return;
      case "Escape":
        if (listOpen) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
        }
        return;
      case "Tab":
        setOpen(false);
        return;
      default:
        return;
    }
  };

  const submit = () => {
    if (!ingredient) {
      setProblem("Pick an ingredient from the list.");
      return;
    }
    if (!chosenForm) {
      setProblem("Pick the exact form. If the label does not say, choose the “not stated” entry.");
      return;
    }
    // Only fields that are actually rendered may submit: a CFU-counted
    // ingredient shows neither the dose nor the servings input.
    let doseValue: number | null = null;
    if (takesMass && dose.trim() !== "") {
      const checked = checkManualDose(Number(dose), unit);
      if (!checked.ok) {
        setProblem(checked.error);
        return;
      }
      doseValue = Number(dose);
    }
    let servingsValue: number | null = null;
    if (takesMass && servings.trim() !== "") {
      const checked = checkServingsPerDay(Number(servings));
      if (!checked.ok) {
        setProblem(checked.error);
        return;
      }
      servingsValue = checked.servings;
    }
    setProblem(null);
    onSubmit({
      ingredient: ingredient.id,
      form: chosenForm.id,
      dose: doseValue === null ? null : { value: doseValue, unit },
      servings_per_day: servingsValue,
    });
  };

  return (
    <form
      className="sc-search"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <div className="sc-field">
        <label htmlFor={inputId}>Ingredient</label>
        <div className="sc-combo">
          <input
            id={inputId}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. magnesium, creatine, vitamin D"
            value={query}
            disabled={busy}
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-activedescendant={listOpen && active >= 0 ? `${listId}-opt-${active}` : undefined}
            aria-describedby={helpId}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => {
              if (!ingredientId) setOpen(true);
            }}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
          />
          <ul id={listId} role="listbox" aria-label="Matching ingredients" className="sc-listbox" hidden={!listOpen}>
            {matches.map((m, i) => (
              <li
                key={m.ingredient.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={`sc-option${i === active ? " is-active" : ""}`}
                // mousedown, not click: the input blurs on click and the list
                // would close before the click landed.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(m);
                }}
                onMouseMove={() => setActive(i)}
              >
                <span>{m.ingredient.label}</span>
                {m.via ? <small>matches “{m.via}”</small> : null}
              </li>
            ))}
          </ul>
        </div>
        <p id={helpId} className="sc-help">
          {query && !ingredientId && !matches.length
            ? "Nothing in the catalog matches. Only ingredients with a vocabulary entry can be analysed."
            : `${catalog.length} ingredients in the catalog — the same vocabulary the label reader uses.`}
        </p>
      </div>

      {ingredient ? (
        <div className="sc-field">
          <label htmlFor={formId}>Exact form of {ingredient.label}</label>
          <select id={formId} value={form} disabled={busy} onChange={(e) => setForm(e.target.value)} required>
            <option value="">Choose the form…</option>
            {ingredient.forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
                {f.scored ? " (has an evidence run)" : ""}
              </option>
            ))}
          </select>
          {chosenForm ? <p className="sc-help">{conversionNote(chosenForm, ingredient)}</p> : null}
        </div>
      ) : null}

      {ingredient && chosenForm ? (
        <fieldset className="sc-dose">
          <legend>Dose per serving (optional)</legend>
          {takesMass ? (
            <div className="sc-dose-row">
              <div className="sc-field">
                <label htmlFor={doseId}>Amount</label>
                <input
                  id={doseId}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={maxManualDoseInUnit(unit)}
                  step="any"
                  placeholder="e.g. 400"
                  value={dose}
                  disabled={busy}
                  onChange={(e) => setDose(e.target.value)}
                />
              </div>
              <div className="sc-field">
                <label htmlFor={unitId}>Unit</label>
                <select id={unitId} value={unit} disabled={busy} onChange={(e) => setUnit(e.target.value as ManualDoseUnit)}>
                  {MANUAL_DOSE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sc-field">
                <label htmlFor={servingsId}>Servings / day</label>
                <input
                  id={servingsId}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_SERVINGS_PER_DAY}
                  step={1}
                  placeholder="e.g. 1"
                  value={servings}
                  disabled={busy}
                  onChange={(e) => setServings(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <p className="sc-help">{ingredient.label} is counted in CFU. Leave the dose empty; the analysis runs without a dose axis.</p>
          )}
          <p className="sc-help">
            Enter the compound mass as printed. Units are mg, g and mcg only — IU is not accepted because its mass depends on the
            substance.
          </p>
        </fieldset>
      ) : null}

      {problem ? (
        <p className="sc-problem" role="alert">
          {problem}
        </p>
      ) : null}

      <button type="submit" className="button button-dark sc-submit" disabled={busy || !ingredient || !chosenForm}>
        {busy ? "Analysing…" : "Analyse this supplement"}
      </button>
    </form>
  );
}
