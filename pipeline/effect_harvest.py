"""Conservative table candidates for BS-PROOF effect extraction.

This module deliberately stops before interpreting an effect.  It only returns a
row when a supplied outcome term and *exactly two explicitly aliased* arm
columns contain mean +/- SD values.  It does not assign an arm role, choose a
visit, decide endpoint versus change, or infer allocation.

Accepted input is JSON-like table data (a table mapping, a sequence of table
mappings, or a JSON string) or a small markdown/tab-delimited table string::

    {"caption": "Table 1", "columns": ["Outcome", "Intervention (n=20)",
     "Placebo (n=19)"], "rows": [["Strength", "10.2 +/- 2.1", "8.1 +/- 2.0"]]}

``harvest_candidates`` returns ``list[TableCandidate]``.  The
``harvest_serialized`` wrapper is the machine-facing shape and returns only a
``CANDIDATES`` key; an empty list is the normal refusal result.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import math
import re
from collections.abc import Mapping, Sequence
from typing import Any


_NUMBER = r"[+-]?\d+(?:[.,]\d+)?"
_MEAN_SD = re.compile(
    rf"^\s*(?:mean\s*=\s*)?(?P<mean>{_NUMBER})\s*"
    r"(?:±|\+/-|\+−)\s*(?:sd\s*=\s*)?"
    rf"(?P<sd>{_NUMBER})\s*(?:[a-z%]+)?\s*"
    r"(?:\([^)]*\)|\[[^]]*\]|[*†‡])?\s*$",
    re.IGNORECASE,
)
# Sample sizes must have an explicit literal n/N marker.  In particular,
# ``age=44`` is not an n value.  Keep a sign so non-positive values are
# refused rather than mistaken for an omitted sample size.  Consume the whole
# numeric token so grouped and decimal values cannot be truncated to integers.
_N_MARKER = re.compile(r"\bn\s*=", re.IGNORECASE)
_N = re.compile(r"\bn\s*=\s*(?P<n>[+-]?\d[\d.,]*)(?![\w.,])", re.IGNORECASE)
# These markers are intentionally broad.  Without a requested visit or
# contrast, selecting one of these rows would silently make a claim about it.
_ENDPOINT_MARKER = re.compile(
    r"\b(?:baseline|pre[- ]?(?:treatment|intervention)|change\s+from\s+baseline|"
    r"change|delta|post[- ]?(?:treatment|intervention)|follow[- ]?up)\b",
    re.IGNORECASE,
)
_TIMEPOINT_MARKER = re.compile(
    r"\b(?:week|weeks|month|months|day|days|hour|hours|year|years|visit|"
    r"timepoint|time\s*point|endpoint)\s*[-+]?\s*\d*\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class CellProvenance:
    """Location and untouched text for one source cell."""

    table_index: int
    caption: str
    row_index: int
    column_index: int
    column: str
    cell_verbatim: str


@dataclass(frozen=True)
class ArmValue:
    """A parsed value, retaining the user-supplied arm label and its cell."""

    arm_alias: str
    column: str
    mean: float
    sd: float
    n: int | None
    cell_verbatim: str
    provenance: CellProvenance


@dataclass(frozen=True)
class TableCandidate:
    """A possible two-arm result, never a final effect claim.

    The three explicitly-null fields are intentional: this harvester has no
    authority to infer allocation, timepoint, or endpoint/change semantics.
    """

    table_index: int
    caption: str
    row_index: int
    row_verbatim: tuple[str, ...]
    outcome_term: str
    outcome_cell: CellProvenance
    arms: tuple[ArmValue, ...]
    allocation: None = None
    timepoint: None = None
    endpoint_kind: None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class _Table:
    caption: str
    columns: tuple[str, ...]
    rows: tuple[tuple[str, ...], ...]


def _text(value: Any) -> str:
    """Stringify a cell without normalising away its source representation."""

    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


def _normalise(value: str) -> str:
    value = value.casefold().replace("−", "-").replace("–", "-")
    value = re.sub(r"\bn\s*=\s*\d+\b", "", value)
    value = re.sub(r"[^\w]+", " ", value, flags=re.UNICODE)
    return " ".join(value.split())


def _contains_term(text: str, term: str) -> bool:
    haystack = _normalise(text)
    needle = _normalise(term)
    if not haystack or not needle:
        return False
    return re.search(rf"(?<!\w){re.escape(needle)}(?!\w)", haystack) is not None


def _parse_number(value: str) -> float | None:
    # A comma as decimal punctuation is common in copied tables, but a token
    # such as ``1,234`` is ambiguous with a thousands separator.  Refuse that
    # shape rather than silently changing its meaning to 1.234.
    if re.fullmatch(r"[+-]?\d+,\d{3}", value):
        return None
    try:
        parsed = float(value.replace(",", "."))
    except ValueError:
        return None
    return parsed if math.isfinite(parsed) else None


def _parse_mean_sd(value: str) -> tuple[float, float] | None:
    match = _MEAN_SD.fullmatch(value)
    if not match:
        return None
    mean = _parse_number(match.group("mean"))
    sd = _parse_number(match.group("sd"))
    if mean is None or sd is None or sd <= 0:
        return None
    return mean, sd


def _n_status(value: str) -> tuple[bool, int | None]:
    """Return whether n was reported and its value when it is an integer."""

    marker = _N_MARKER.search(value)
    if marker is None:
        return False, None
    match = _N.search(value, marker.start())
    if match is None or match.start() != marker.start():
        return True, None
    token = match.group("n")
    if not re.fullmatch(r"[+-]?\d+", token):
        return True, None
    try:
        return True, int(token)
    except ValueError:
        return True, None


def _header_n(header: str) -> int | None:
    return _n_status(header)[1]


def _value_n(value: str) -> int | None:
    return _n_status(value)[1]


def _split_markdown(line: str) -> list[str]:
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [part.strip() for part in stripped.split("|")]


def _is_markdown_separator(row: Sequence[str]) -> bool:
    return bool(row) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in row)


def _table_from_mapping(item: Mapping[str, Any]) -> _Table | None:
    caption = _text(item.get("caption", item.get("title", ""))).strip()
    columns_raw = item.get("columns", item.get("headers", item.get("header")))
    rows_raw = item.get("rows")
    if rows_raw is None and isinstance(item.get("table"), Mapping):
        return _table_from_mapping(item["table"])
    if rows_raw is None:
        text = item.get("text")
        return _parse_text(_text(text), caption=caption) if text is not None else None
    if not isinstance(rows_raw, Sequence) or isinstance(rows_raw, (str, bytes)):
        return None

    columns: list[str]
    rows: list[tuple[str, ...]] = []
    if isinstance(columns_raw, Sequence) and not isinstance(columns_raw, (str, bytes)):
        columns = [_text(c) for c in columns_raw]
    else:
        columns = []

    for raw_row in rows_raw:
        if isinstance(raw_row, Mapping):
            if not columns:
                columns = [_text(key) for key in raw_row.keys()]
            rows.append(tuple(_text(raw_row.get(column, "")) for column in columns))
        elif isinstance(raw_row, Sequence) and not isinstance(raw_row, (str, bytes)):
            cells = tuple(_text(cell) for cell in raw_row)
            if not columns:
                columns = [f"column_{i + 1}" for i in range(len(cells))]
            rows.append(cells)
        else:
            rows.append((_text(raw_row),))

    if not columns:
        return None
    width = len(columns)
    rows = [row + ("",) * (width - len(row)) if len(row) < width else row[:width] for row in rows]
    return _Table(caption=caption, columns=tuple(columns), rows=tuple(rows))


def _parse_text(text: str, caption: str = "") -> _Table | None:
    lines = [line.rstrip("\n") for line in text.splitlines() if line.strip()]
    if not lines:
        return None
    markdown = [line for line in lines if "|" in line]
    if len(markdown) >= 2:
        header = _split_markdown(markdown[0])
        start = 1
        if start < len(markdown) and _is_markdown_separator(_split_markdown(markdown[start])):
            start += 1
        rows = [_split_markdown(line) for line in markdown[start:]]
        if header and rows:
            width = len(header)
            rows = [tuple(row + [""] * (width - len(row)) if len(row) < width else row[:width]) for row in rows]
            return _Table(caption=caption or (lines[0] if "|" not in lines[0] else ""), columns=tuple(header), rows=tuple(rows))
    tabbed = [line.split("\t") for line in lines]
    if len(tabbed) >= 2 and len(tabbed[0]) >= 2:
        width = len(tabbed[0])
        rows = [tuple(row + [""] * (width - len(row)) if len(row) < width else row[:width]) for row in tabbed[1:]]
        return _Table(caption=caption, columns=tuple(tabbed[0]), rows=tuple(rows))
    return None


def _coerce_tables(serialized: Any) -> list[_Table]:
    if isinstance(serialized, bytes):
        try:
            serialized = serialized.decode("utf-8")
        except UnicodeDecodeError:
            return []
    if isinstance(serialized, str):
        try:
            decoded = json.loads(serialized)
        except json.JSONDecodeError:
            table = _parse_text(serialized)
            return [table] if table else []
        return _coerce_tables(decoded)
    if isinstance(serialized, Mapping):
        # A payload may wrap one or more tables under ``tables``.
        if "tables" in serialized and isinstance(serialized["tables"], Sequence):
            return _coerce_tables(serialized["tables"])
        table = _table_from_mapping(serialized)
        return [table] if table else []
    if isinstance(serialized, Sequence):
        result: list[_Table] = []
        for item in serialized:
            if isinstance(item, Mapping):
                table = _table_from_mapping(item)
                if table:
                    result.append(table)
            elif isinstance(item, str):
                table = _parse_text(item)
                if table:
                    result.append(table)
        return result
    return []


def _normalise_aliases(arm_aliases: Mapping[str, Any] | Sequence[str]) -> dict[str, tuple[str, ...]]:
    if isinstance(arm_aliases, Mapping):
        result: dict[str, tuple[str, ...]] = {}
        for label, aliases in arm_aliases.items():
            values = [aliases] if isinstance(aliases, str) else list(aliases) if isinstance(aliases, Sequence) else []
            values = [str(value) for value in values if str(value).strip()]
            if str(label).strip() not in values:
                values.insert(0, str(label))
            if values:
                result[str(label)] = tuple(dict.fromkeys(values))
        return result
    if isinstance(arm_aliases, Sequence) and not isinstance(arm_aliases, (str, bytes)):
        return {str(alias): (str(alias),) for alias in arm_aliases if str(alias).strip()}
    return {}


def _matched_arm(header: str, aliases: Mapping[str, tuple[str, ...]]) -> tuple[str, str] | None | bool:
    """Return (user label, matching alias), None for no match, False ambiguous."""

    normal_header = _normalise(header)
    matches: list[tuple[str, str]] = []
    for label, values in aliases.items():
        for alias in values:
            normal_alias = _normalise(alias)
            if normal_alias and re.search(rf"(?<!\w){re.escape(normal_alias)}(?!\w)", normal_header):
                matches.append((label, alias))
                break
    labels = {label for label, _ in matches}
    if len(labels) > 1:
        return False
    if len(labels) == 1:
        return matches[0]
    return None


def harvest_candidates(
    serialized_tables: Any,
    outcome_terms: Sequence[str] | str,
    arm_aliases: Mapping[str, Any] | Sequence[str],
) -> list[TableCandidate]:
    """Harvest conservative two-arm table candidates.

    ``arm_aliases`` is a mapping from an already-known label to one or more
    literal header aliases, or a sequence of literal labels.  A header must
    match one and only one label.  No positional ``first = intervention`` rule
    exists.  Rows with endpoint/change markers are refused because no target
    visit or contrast is supplied.
    """

    terms = [outcome_terms] if isinstance(outcome_terms, str) else [str(t) for t in outcome_terms]
    terms = [term for term in terms if term.strip()]
    aliases = _normalise_aliases(arm_aliases)
    if not terms or len(aliases) < 2:
        return []
    tables = _coerce_tables(serialized_tables)
    candidates: list[TableCandidate] = []

    for table_index, table in enumerate(tables):
        matched_columns: list[tuple[int, str, str]] = []
        ambiguous_header = False
        for column_index, header in enumerate(table.columns):
            matched = _matched_arm(header, aliases)
            if matched is False:
                ambiguous_header = True
                continue
            if matched is not None:
                label, alias = matched
                matched_columns.append((column_index, label, alias))
        # Any ambiguous arm header or duplicate known label is a refusal.  A
        # table with three explicitly labelled arms is also not a two-arm row.
        if ambiguous_header or len(matched_columns) != 2 or len({m[1] for m in matched_columns}) != 2:
            continue

        # The first column is the identified descriptor column for this
        # conservative table shape.  Do not search the complete row: notes,
        # footnotes, and other cells are not outcome descriptors.
        descriptor_column = 0
        for row_index, row in enumerate(table.rows):
            row_verbatim = tuple(row)
            row_text = " | ".join(row)
            descriptor_text = row[descriptor_column] if descriptor_column < len(row) else ""
            if _ENDPOINT_MARKER.search(row_text) or _TIMEPOINT_MARKER.search(row_text):
                continue
            matched_terms = [term for term in terms if _contains_term(descriptor_text, term)]
            if not matched_terms:
                continue
            longest = max(len(_normalise(term)) for term in matched_terms)
            longest_terms = [term for term in matched_terms if len(_normalise(term)) == longest]
            if len(longest_terms) != 1:
                continue
            outcome_term = longest_terms[0]

            arm_values: list[ArmValue] = []
            refused = False
            for column_index, label, _alias in matched_columns:
                verbatim = row[column_index] if column_index < len(row) else ""
                parsed = _parse_mean_sd(verbatim)
                if parsed is None:
                    refused = True
                    break
                mean, sd = parsed
                header_has_n, header_n = _n_status(table.columns[column_index])
                value_has_n, value_n = _n_status(verbatim)
                # An explicitly reported malformed or non-positive n violates
                # the schema; refuse it instead of treating it as unknown.
                if (header_has_n and (header_n is None or header_n <= 0)) or (
                    value_has_n and (value_n is None or value_n <= 0)
                ):
                    refused = True
                    break
                if header_n is not None and value_n is not None and header_n != value_n:
                    refused = True
                    break
                provenance = CellProvenance(
                    table_index=table_index,
                    caption=table.caption,
                    row_index=row_index,
                    column_index=column_index,
                    column=table.columns[column_index],
                    cell_verbatim=verbatim,
                )
                arm_values.append(
                    ArmValue(
                        arm_alias=label,
                        column=table.columns[column_index],
                        mean=mean,
                        sd=sd,
                        n=header_n if header_n is not None else value_n,
                        cell_verbatim=verbatim,
                        provenance=provenance,
                    )
                )
            if refused or len(arm_values) != 2:
                continue

            outcome_cell = CellProvenance(
                table_index=table_index,
                caption=table.caption,
                row_index=row_index,
                column_index=descriptor_column,
                column=table.columns[descriptor_column],
                cell_verbatim=row[descriptor_column] if row else "",
            )
            candidates.append(
                TableCandidate(
                    table_index=table_index,
                    caption=table.caption,
                    row_index=row_index,
                    row_verbatim=row_verbatim,
                    outcome_term=outcome_term,
                    outcome_cell=outcome_cell,
                    arms=tuple(arm_values),
                )
            )
    return candidates


def harvest_serialized(
    serialized_tables: Any,
    outcome_terms: Sequence[str] | str,
    arm_aliases: Mapping[str, Any] | Sequence[str],
) -> dict[str, list[dict[str, Any]]]:
    """Return the strict wire shape: ``{"CANDIDATES": [...]}`` only."""

    return {"CANDIDATES": [candidate.to_dict() for candidate in harvest_candidates(serialized_tables, outcome_terms, arm_aliases)]}


# Short alias for callers that prefer a verb over the public descriptive name.
harvest = harvest_candidates


def _self_check() -> None:
    valid = {
        "caption": "Table 1. Strength outcomes",
        "columns": ["Outcome", "Creatine (n=20)", "Placebo (n=19)"],
        "rows": [["Muscle strength", "10.2 ± 2.1", "8.4 +/- 2.0"]],
    }
    # Scalar mapping values are valid aliases, not sequences to be expanded.
    found = harvest_candidates(valid, ["muscle strength"], {"arm_a": "Creatine", "arm_b": "Placebo"})
    assert len(found) == 1
    assert found[0].arms[0].mean == 10.2 and found[0].arms[0].sd == 2.1
    assert found[0].arms[0].n == 20 and found[0].arms[1].n == 19
    assert found[0].caption == "Table 1. Strength outcomes"
    assert found[0].arms[0].provenance.cell_verbatim == "10.2 ± 2.1"
    assert found[0].outcome_cell.column_index == 0
    assert found[0].outcome_cell.cell_verbatim == "Muscle strength"
    assert found[0].allocation is None and found[0].timepoint is None and found[0].endpoint_kind is None

    age_is_not_n = {
        "caption": "age annotation",
        "columns": ["Outcome", "Treatment (age=44)", "Control (n=19)"],
        "rows": [["Muscle strength", "10.2 ± 2.1", "8.4 +/- 2.0"]],
    }
    age_found = harvest_candidates(age_is_not_n, "muscle strength", {"arm_a": "Treatment", "arm_b": "Control"})
    assert len(age_found) == 1
    assert age_found[0].arms[0].n is None and age_found[0].arms[1].n == 19

    age_value_is_not_n = {
        "caption": "age in value note",
        "columns": ["Outcome", "Treatment", "Control"],
        "rows": [["Muscle strength", "10.2 ± 2.1 (age=44)", "8.4 +/- 2.0"]],
    }
    age_value_found = harvest_candidates(age_value_is_not_n, "muscle strength", ["Treatment", "Control"])
    assert len(age_value_found) == 1 and age_value_found[0].arms[0].n is None

    ambiguous_comma = {
        "caption": "ambiguous comma",
        "columns": ["Outcome", "Treatment", "Control"],
        "rows": [["Muscle strength", "1,234 ± 2.1", "8.4 +/- 2.0"]],
    }
    assert harvest_candidates(ambiguous_comma, "muscle strength", ["Treatment", "Control"]) == []

    # Conversion of a syntactically valid but too-large number can produce
    # infinity; non-finite means and SDs are not table statistics.
    assert _parse_number("9" * 400) is None
    non_finite_mean = {
        "caption": "non-finite mean",
        "columns": ["Outcome", "Treatment", "Control"],
        "rows": [["Muscle strength", f"{'9' * 400} ± 2.1", "8.4 +/- 2.0"]],
    }
    assert harvest_candidates(non_finite_mean, "muscle strength", ["Treatment", "Control"]) == []
    non_finite_sd = {
        "caption": "non-finite SD",
        "columns": ["Outcome", "Treatment", "Control"],
        "rows": [["Muscle strength", f"10.2 ± {'9' * 400}", "8.4 +/- 2.0"]],
    }
    assert harvest_candidates(non_finite_sd, "muscle strength", ["Treatment", "Control"]) == []

    for malformed_n in ("1,234", "20.5"):
        malformed_n_header = {
            "caption": "malformed n in header",
            "columns": ["Outcome", f"Treatment (n={malformed_n})", "Control (n=19)"],
            "rows": [["Muscle strength", "10.2 ± 2.1", "8.4 +/- 2.0"]],
        }
        assert harvest_candidates(malformed_n_header, "muscle strength", ["Treatment", "Control"]) == []
        malformed_n_value = {
            "caption": "malformed n in value",
            "columns": ["Outcome", "Treatment", "Control"],
            "rows": [["Muscle strength", f"10.2 ± 2.1 (n={malformed_n})", "8.4 +/- 2.0"]],
        }
        assert harvest_candidates(malformed_n_value, "muscle strength", ["Treatment", "Control"]) == []

    outcome_only_in_notes = {
        "caption": "notes are not descriptors",
        "columns": ["Outcome", "Treatment", "Notes", "Control"],
        "rows": [["Unrelated measure", "10.2 ± 2.1", "muscle strength", "8.4 +/- 2.0"]],
    }
    assert harvest_candidates(outcome_only_in_notes, "muscle strength", ["Treatment", "Control"]) == []

    single_arm = {
        "caption": "single arm",
        "columns": ["Outcome", "Treatment (n=20)", "Notes"],
        "rows": [["Muscle strength", "10.2 ± 2.1", "not reported"]],
    }
    assert harvest_candidates(single_arm, "muscle strength", {"treatment": "Treatment", "control": "Control"}) == []

    missing_sd = {
        "caption": "missing SD",
        "columns": ["Outcome", "Treatment", "Control"],
        "rows": [["Muscle strength", "10.2", "8.4 ± 2.0"]],
    }
    assert harvest_candidates(missing_sd, "muscle strength", ["Treatment", "Control"]) == []

    non_positive_sd = {
        "caption": "non-positive SD",
        "columns": ["Outcome", "Treatment", "Control"],
        "rows": [["Muscle strength", "10.2 ± 0", "8.4 +/- 2.0"]],
    }
    assert harvest_candidates(non_positive_sd, "muscle strength", ["Treatment", "Control"]) == []
    negative_sd = {
        "caption": "negative SD",
        "columns": ["Outcome", "Treatment", "Control"],
        "rows": [["Muscle strength", "10.2 ± -2.1", "8.4 +/- 2.0"]],
    }
    assert harvest_candidates(negative_sd, "muscle strength", ["Treatment", "Control"]) == []

    non_positive_n = {
        "caption": "non-positive n",
        "columns": ["Outcome", "Treatment (n=0)", "Control (n=19)"],
        "rows": [["Muscle strength", "10.2 ± 2.1", "8.4 +/- 2.0"]],
    }
    assert harvest_candidates(non_positive_n, "muscle strength", ["Treatment", "Control"]) == []
    negative_n = {
        "caption": "negative n",
        "columns": ["Outcome", "Treatment", "Control"],
        "rows": [["Muscle strength", "10.2 ± 2.1 (n=-1)", "8.4 +/- 2.0 (n=19)"]],
    }
    assert harvest_candidates(negative_n, "muscle strength", ["Treatment", "Control"]) == []

    ambiguous_arms = {
        "caption": "ambiguous labels",
        "columns": ["Outcome", "Treatment", "Control / Placebo"],
        "rows": [["Muscle strength", "10.2 ± 2.1", "8.4 ± 2.0"]],
    }
    assert harvest_candidates(
        ambiguous_arms,
        "muscle strength",
        {"treatment": "Treatment", "control": "Control", "placebo": "Placebo"},
    ) == []

    baseline_change = {
        "caption": "baseline versus change",
        "columns": ["Measure", "Treatment", "Control"],
        "rows": [
            ["Body weight baseline", "70.0 ± 4.0", "69.5 ± 4.2"],
            ["Body weight change from baseline", "1.2 ± 1.0", "0.1 ± 0.9"],
        ],
    }
    assert harvest_candidates(baseline_change, "body weight", ["Treatment", "Control"]) == []


if __name__ == "__main__":
    _self_check()
    print("effect_harvest self-check: PASS")
