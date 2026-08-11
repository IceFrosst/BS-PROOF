"""
The donut: score in the centre, ring arc = confidence. NO MODEL HERE.

SPEC section 9: "the `c` term drags weak evidence toward 0, and the donut's ring
arc shows `c` visually so the user can see *why* a number is small."

That sentence is the whole design. A user shown "+4" has no way to tell apart:

  * genuinely conflicting evidence  (d near 0, c high)   -> a real "we don't know"
  * almost no evidence at all       (d high,   c near 0) -> "nobody has looked"

Both render as a small number. Only the ARC distinguishes them, which is why the
arc is not decoration -- it is the part that stops a small score being misread as
a finding.

Pure rendering. It reads `score` and `components.c` off an ECU row and emits SVG.
It computes nothing and decides nothing.
"""
from __future__ import annotations
import math

# Band -> colour. Sign carries the meaning, so the ramp is diverging, and the
# inconclusive band is deliberately grey rather than a pale green/red: a near-zero
# score is not "slightly good", it is "no answer".
BAND_COLOUR = {
    "strong support": "#0f7b4f",
    "moderate support": "#3f9d63",
    "weak support": "#84b970",
    "inconclusive": "#8a8f98",
    "weak evidence against": "#d99150",
    "does not work": "#c4633a",
    "strong evidence against / harm": "#a32d21",
    "insufficient human evidence": "#5c6370",
}

TRACK = "#e3e5e8"


def confidence_label(c: float | None) -> str:
    """Plain words for the arc, so it is readable without a legend."""
    if c is None:
        return "no evidence mass"
    if c < 0.10:
        return "almost no evidence yet"
    if c < 0.30:
        return "very little evidence"
    if c < 0.60:
        return "some evidence"
    if c < 0.85:
        return "substantial evidence"
    return "extensive evidence"


def donut_svg(ecu: dict, *, size: int = 180, stroke: int = 16) -> str:
    """
    One ECU row -> a self-contained SVG donut.

    Centre  : the signed score, or "--" when the sufficiency gate fired.
    Arc     : c, the confidence term, as a fraction of the full ring.
    Colour  : the band.

    A gated row draws an EMPTY ring, not a full grey one -- "we will not give you
    a number" must not look like "we gave you zero".
    """
    score = ecu.get("score")
    band = ecu.get("band") or "inconclusive"
    c = (ecu.get("components") or {}).get("c")
    gated = bool(ecu.get("gate_fired")) or score is None

    colour = BAND_COLOUR.get(band, BAND_COLOUR["inconclusive"])
    r = (size - stroke) / 2
    cx = cy = size / 2
    circumference = 2 * math.pi * r
    frac = 0.0 if gated else max(0.0, min(1.0, float(c or 0.0)))
    dash = circumference * frac

    centre = "--" if gated else f"{score:+d}"
    font = int(size * 0.26) if not gated else int(size * 0.30)

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}"
     width="{size}" height="{size}" role="img"
     aria-label="{band}, {confidence_label(c)}">
  <circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="none"
          stroke="{TRACK}" stroke-width="{stroke}"/>
  <circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="none"
          stroke="{colour}" stroke-width="{stroke}" stroke-linecap="round"
          stroke-dasharray="{dash:.1f} {circumference - dash:.1f}"
          transform="rotate(-90 {cx} {cy})"/>
  <text x="{cx}" y="{cy}" text-anchor="middle" dominant-baseline="central"
        font-family="ui-sans-serif, system-ui, sans-serif"
        font-size="{font}" font-weight="600" fill="{colour}">{centre}</text>
</svg>"""


def donut_line(ecu: dict, label: str | None = None) -> str:
    """
    Terminal fallback: a text donut for runs that print rather than render.
    Same two facts -- the number and how full the ring is.
    """
    score = ecu.get("score")
    c = (ecu.get("components") or {}).get("c")
    gated = bool(ecu.get("gate_fired")) or score is None
    filled = 0 if gated else int(round(max(0.0, min(1.0, float(c or 0))) * 20))
    bar = "#" * filled + "." * (20 - filled)
    centre = " gated" if gated else f"{score:+5d}"
    name = label or ecu.get("outcome_vocab_id", "")
    return (f"{name:<26}{centre}  [{bar}]  c={0.0 if gated else (c or 0):.2f}"
            f"  {confidence_label(None if gated else c)}")


# --------------------------------------------------------------- three arcs

# The three questions a buyer actually has, in the order they matter.
# NOTE these are NOT three thirds of one score. Only the first is evidence about
# whether the thing works; the other two are APPLICABILITY -- how much that
# evidence has to do with the bottle in your hand. They can only ever shrink the
# verdict, never prop it up, which is why they are drawn as separate arcs around
# the same number rather than averaged into it.
ARCS = (
    ("effect", "Does it work?", "how much trustworthy evidence stands behind the verdict"),
    ("form",   "In your form?", "share of that evidence that used this exact preparation"),
    ("dose",   "At your dose?", "share carrying a usable dose, judged against the effective band"),
)

UNMEASURED = "#b9bec4"


def arc_detail(ecu: dict) -> dict:
    """
    Per axis: {fill, assessable}. `fill` is how much of the evidence weight
    matches your product; `assessable` is how much could be judged at all.

    The gap between them is drawn hatched, so the ring reads in three parts:
        filled    evidence that matches your bottle
        empty     evidence that was judged and does NOT match
        hatched   evidence nobody reported this axis for
    Collapsing the last two would turn "unknown" into "wrong".
    """
    app = ecu.get("applicability") or {}
    out = {"effect": {"fill": (ecu.get("components") or {}).get("c"),
                      "assessable": 1.0}}
    if app:
        for key in ("form", "dose"):
            a = app.get(key) or {}
            out[key] = {"fill": a.get("match"), "assessable": a.get("assessable", 0.0)}
        return out

    # Rows written before `applicability` existed. Derive what we can so an
    # older report does not silently render as "nothing was assessable".
    mix = ecu.get("form_mix") or {}
    total = sum(mix.values())
    out["form"] = {
        "fill": (mix.get("exact", 0) / total) if total else None,
        "assessable": (1 - mix.get("unspecified", 0) / total) if total else 0.0,
    }
    legacy_dose = ecu.get("dose") or {}
    has_band = legacy_dose.get("low") is not None
    out["dose"] = {
        "fill": legacy_dose.get("evidence_with_dose") if has_band else None,
        "assessable": legacy_dose.get("evidence_with_dose", 0.0) if has_band else 0.0,
    }
    return out


def arc_fills(ecu: dict) -> dict:
    """
    The three fill fractions, or None where the axis is genuinely unassessed.

    None is not zero. An unmeasured axis renders hatched, because "we did not
    check your dose" and "your dose is wrong" are opposite messages.
    """
    app = ecu.get("applicability")
    if app:
        d = arc_detail(ecu)
        return {k: (v["fill"] if v["assessable"] else None) for k, v in d.items()}

    # Legacy rows written before applicability existed.
    comp = ecu.get("components") or {}
    dose = ecu.get("dose") or {}
    fills = {"effect": comp.get("c")}
    mix = ecu.get("form_mix") or {}
    total = sum(mix.values())
    fills["form"] = (mix.get("exact", 0) / total) if total else None
    fills["dose"] = dose.get("evidence_with_dose") if dose.get("low") is not None else None
    return fills


def three_arc_svg(ecu: dict, *, size: int = 300) -> str:
    """
    One number, three concentric arcs. Outer = effect, middle = form, inner = dose.

    Concentric rather than a split ring on purpose: a ring cut into three equal
    segments reads as three things adding up to one total, which would invite
    "good form match" to visually compensate for thin evidence. Nested arcs read
    as three independent conditions on the same answer, which is what they are.
    """
    score = ecu.get("score")
    band = ecu.get("band") or "inconclusive"
    gated = bool(ecu.get("gate_fired")) or score is None
    colour = BAND_COLOUR.get(band, BAND_COLOUR["inconclusive"])
    fills = arc_fills(ecu)

    cx = cy = size / 2
    stroke = size * 0.055
    gap = stroke * 1.55
    rings, defs = [], (
        '<defs><pattern id="hatch" width="6" height="6" '
        'patternTransform="rotate(45)" patternUnits="userSpaceOnUse">'
        f'<rect width="6" height="6" fill="{TRACK}"/>'
        f'<line x1="0" y1="0" x2="0" y2="6" stroke="{UNMEASURED}" stroke-width="2.5"/>'
        "</pattern></defs>"
    )

    detail = arc_detail(ecu)
    for i, (key, _label, _desc) in enumerate(ARCS):
        r = (size / 2) - stroke / 2 - i * gap
        circ = 2 * math.pi * r
        f = fills.get(key)
        assessable = detail.get(key, {}).get("assessable", 0.0) or 0.0
        # Base ring: solid where the axis could be judged, hatched where it
        # could not. Unfilled-solid means "judged, does not match"; hatched
        # means "nobody reported it" -- opposite messages, drawn differently.
        rings.append(
            f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="none" '
            f'stroke="url(#hatch)" stroke-width="{stroke:.1f}"/>')
        if assessable > 0:
            solid = circ * min(1.0, assessable)
            rings.append(
                f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="none" stroke="{TRACK}" '
                f'stroke-width="{stroke:.1f}" stroke-dasharray="{solid:.1f} {circ - solid:.1f}" '
                f'transform="rotate(-90 {cx} {cy})"/>')
        if f is not None and not (gated and key == "effect"):
            dash = circ * max(0.0, min(1.0, float(f)))
            rings.append(
                f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="none" stroke="{colour}" '
                f'stroke-width="{stroke:.1f}" stroke-linecap="round" '
                f'stroke-dasharray="{dash:.1f} {circ - dash:.1f}" '
                f'transform="rotate(-90 {cx} {cy})" opacity="{1 - i * 0.22:.2f}"/>')

    centre = "--" if gated else f"{score:+d}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
            f'width="{size}" height="{size}" role="img" aria-label="{band}">{defs}'
            + "".join(rings) +
            f'<text x="{cx}" y="{cy}" text-anchor="middle" dominant-baseline="central" '
            f'font-family="ui-monospace, monospace" font-size="{size * 0.2:.0f}" '
            f'font-weight="600" fill="{colour}">{centre}</text></svg>')


# ---------------------------------------------------------------- four arcs

FOUR_ARCS = (
    ("effect",   "Does it work?",      "verdict across all the evidence"),
    ("form",     "In your form?",      "verdict from trials using your preparation"),
    ("dose",     "At your dose?",      "verdict from trials in your dose range"),
    ("evidence", "How much is known?", "total weight of trustworthy evidence"),
)

POSITIVE = "#0f7b4f"
NEGATIVE = "#a32d21"
QUANTITY = "#4a6fa5"      # the evidence arc has no direction, so it is not on
                          # the good/bad ramp -- a full ring here is neither.


def four_arc_svg(built: dict, *, size: int = 320) -> str:
    """
    `built` is pipeline.arcs.build() output. Four concentric rings, each showing
    a verdict AND how much evidence backs it:

        filled   the verdict, green positive / red negative
        solid    the share of evidence that could be judged on this axis
        hatched  the rest -- nobody reported it

    The centre is the 0-100 composite. A gated ECU shows "--" over empty rings,
    because refusing to answer must not look like answering zero.
    """
    a = built.get("arcs") or {}
    composite = built.get("composite")
    gated = built.get("gate_fired") or composite is None

    cx = cy = size / 2
    stroke = size * 0.048
    gap = stroke * 1.5
    parts = [
        '<defs><pattern id="h4" width="6" height="6" patternTransform="rotate(45)"'
        ' patternUnits="userSpaceOnUse">'
        f'<rect width="6" height="6" fill="{TRACK}"/>'
        f'<line x1="0" y1="0" x2="0" y2="6" stroke="{UNMEASURED}" stroke-width="2.5"/>'
        "</pattern></defs>"
    ]

    for i, (key, _label, _desc) in enumerate(FOUR_ARCS):
        r = (size / 2) - stroke / 2 - i * gap
        circ = 2 * math.pi * r
        arc = a.get(key) or {}
        coverage = float(arc.get("coverage") or 0.0)
        verdict = arc.get("verdict")

        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="none" '
                     f'stroke="url(#h4)" stroke-width="{stroke:.1f}"/>')
        if coverage > 0:
            solid = circ * min(1.0, coverage)
            parts.append(
                f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="none" stroke="{TRACK}" '
                f'stroke-width="{stroke:.1f}" stroke-dasharray="{solid:.1f} '
                f'{circ - solid:.1f}" transform="rotate(-90 {cx} {cy})"/>')

        if gated:
            continue
        if arc.get("is_quantity"):
            fill, colour = coverage, QUANTITY
        elif verdict is None:
            continue
        else:
            fill = abs(verdict)
            colour = POSITIVE if verdict >= 0 else NEGATIVE
        dash = circ * max(0.0, min(1.0, fill))
        parts.append(
            f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="none" stroke="{colour}" '
            f'stroke-width="{stroke:.1f}" stroke-linecap="round" '
            f'stroke-dasharray="{dash:.1f} {circ - dash:.1f}" '
            f'transform="rotate(-90 {cx} {cy})"/>')

    centre = "--" if gated else str(composite)
    tone = (TRACK if gated else
            POSITIVE if composite >= 55 else NEGATIVE if composite < 45 else "#8a8f98")
    parts.append(
        f'<text x="{cx}" y="{cy}" text-anchor="middle" dominant-baseline="central" '
        f'font-family="ui-monospace, monospace" font-size="{size * 0.19:.0f}" '
        f'font-weight="600" fill="{tone}">{centre}</text>')

    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
            f'width="{size}" height="{size}" role="img" '
            f'aria-label="{built.get("band", "score")} {centre} out of 100">'
            + "".join(parts) + "</svg>")


def four_arc_lines(built: dict) -> str:
    """Terminal view of the same four facts."""
    a = built.get("arcs") or {}
    out = []
    for key, label, _ in FOUR_ARCS:
        arc = a.get(key) or {}
        v, cov = arc.get("verdict"), float(arc.get("coverage") or 0)
        if arc.get("is_quantity"):
            bar = "#" * int(round(cov * 16)) + "." * (16 - int(round(cov * 16)))
            out.append(f"  {label:<20} [{bar}]  c={cov:.2f}")
            continue
        # FORM reads from `strength` since SCORING_MODEL v5: that is the number
        # the composite actually uses, and printing the signed subset verdict
        # instead made the two disagree on screen -- muscle_strength showed
        # "+0.02" beside a composite the ladder had just raised to 40. The
        # verdict is still shown, as the caveat it is.
        if key == "form" and "strength" in arc:
            st = float(arc.get("strength") or 0.0)
            n = int(round(st * 16))
            basis = arc.get("basis")
            if basis == "untested_in_form":
                tail = "nobody reported your form"
            elif basis == "all_negative_in_form":
                tail = f"EVERY trial in your form was negative ({v:+.2f} @ {cov:.0%})"
            else:
                tail = (f"best evidence in your form scores {st:.2f}"
                        + (f" ({v:+.2f} @ {cov:.0%})" if v is not None else ""))
            out.append(f"  {label:<20} [{'#' * n}{'.' * (16 - n)}]  {tail}")
            continue
        if v is None:
            out.append(f"  {label:<20} [{'/' * 16}]  no trials on this axis")
            continue
        n = int(round(abs(v) * 16))
        sign = "+" if v >= 0 else "-"
        out.append(f"  {label:<20} [{sign * n}{'.' * (16 - n)}]  "
                   f"{v:+.2f} from {cov:.0%} of the evidence")
    return "\n".join(out)
