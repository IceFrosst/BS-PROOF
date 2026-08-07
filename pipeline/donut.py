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
