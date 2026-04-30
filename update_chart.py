#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# ///
"""Refresh docs/metrics-chart.svg from the layout stats below.

Run with `uv run update_chart.py` (or directly if executable). No
external deps — the inline PEP 723 header is just for parity with
update_readme.py.

To refresh the chart, edit LayoutStats / LAYOUTS below and re-run."""

from __future__ import annotations

from dataclasses import dataclass, field, fields
from pathlib import Path
from string import Template

ROOT = Path(__file__).resolve().parent
DOCS = ROOT / "docs"

# ─── Metrics chart data ─────────────────────────────────────────────────
# Stats are from cyanophage's analyzer — https://cyanophage.github.io.
# Bars in the rendered chart show each non-baseline layout's percentage
# difference vs the baseline, scaled so the largest bar fits.

# Field metadata carries the display label and direction-of-better;
# the chart renderer iterates fields(LayoutStats) for the metric ordering.
@dataclass
class LayoutStats:
    sfb:    float = field(metadata={"label": "SFBs",        "lower_better": True})
    red:    float = field(metadata={"label": "Redirects",   "lower_better": True})
    lsb:    float = field(metadata={"label": "Stretches",   "lower_better": True})
    inroll: float = field(metadata={"label": "In-rolls",    "lower_better": False})
    alt:    float = field(metadata={"label": "Alternation", "lower_better": False})
    pinky:  float = field(metadata={"label": "Pinky-off",   "lower_better": True})


LAYOUTS = {
    "Colemak-DH": LayoutStats(sfb=0.91, red=5.33, lsb=1.27, inroll=26.68, alt=30.90, pinky=0.78),
    "valmak":     LayoutStats(sfb=0.65, red=1.47, lsb=0.11, inroll=31.83, alt=44.61, pinky=1.34),
    "Enthium v14":    LayoutStats(sfb=0.55, red=1.48, lsb=0.07, inroll=28.54, alt=42.55, pinky=2.92),
}

BASELINE = "Colemak-DH"
COMPARE = ["valmak", "Enthium v14"]
LAYOUT_CLASS = {"valmak": "v", "Enthium v14": "e"}


# ─── Geometry ───────────────────────────────────────────────────────────

WIDTH = 580
BAR_X = 125
BAR_MAX = 400
BAR_H = 12
BAR_GAP = 3
ROW_PITCH = BAR_H * 2 + BAR_GAP + 10
HEADER_H = 44
LEGEND_H = 30


# ─── SVG framing ────────────────────────────────────────────────────────
# Hardcoded palette so the chart renders consistently as a static <img>
# on GitHub and on the live site, regardless of theme. A neutral beige
# panel + warm-medium colors read on both modes.

SVG_HEAD = Template("""\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $w $h" role="img" aria-label="$aria">
<title>$aria</title>
<style>
.bg { fill: #e0d8c8; }
.v { fill: #a85040; }
.e { fill: #6e7e8e; }
.metrics text { font-family: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace; fill: #4a4540; }
.heading { font-size: 14px; }
.label { font-size: 13px; }
.value { font-size: 11px; }
.legend { font-size: 12px; }
</style>
<rect class="bg" x="0" y="0" width="$w" height="$h" rx="6" ry="6"/>
<g class="metrics">""")

SVG_TAIL = "</g>\n</svg>"


# ─── SVG element helpers ────────────────────────────────────────────────

def _attrs(items: dict) -> str:
    """Format attribute pairs. Underscores in keys become hyphens
    (text_anchor → text-anchor)."""
    return " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in items.items())


def text(content: str, *, x, y, cls: str, **extra) -> str:
    extra_str = (" " + _attrs(extra)) if extra else ""
    return f'<text x="{x}" y="{y}"{extra_str} class="{cls}">{content}</text>'


def rect(*, x, y, w, h, cls: str) -> str:
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" class="{cls}"/>'


# ─── Computations ───────────────────────────────────────────────────────

def signed_change_pct(value: float, baseline: float) -> float:
    """Signed % change vs baseline (+ if value went up, - if down).
    Independent of which direction is "better" — that's a row-label
    concern."""
    if baseline == 0:
        return 0.0
    return (value - baseline) / baseline * 100


def is_regression(value: float, baseline: float, lower_is_better: bool) -> bool:
    """True when the value is worse than baseline on this metric."""
    return (value > baseline) if lower_is_better else (value < baseline)


# ─── Renderer ───────────────────────────────────────────────────────────

def generate_chart_svg() -> str:
    """Render the chart as a standalone SVG string."""
    baseline_data = LAYOUTS[BASELINE]
    primary = COMPARE[0]
    metrics = fields(LayoutStats)
    height = HEADER_H + len(metrics) * ROW_PITCH + LEGEND_H
    aria = f"{' and '.join(COMPARE)} compared to {BASELINE}"

    out = [SVG_HEAD.substitute(w=WIDTH, h=height, aria=aria)]
    out.append(text(f'Compared to {BASELINE}', x=WIDTH // 2, y=20,
                    cls='heading', text_anchor='middle'))

    for i, m in enumerate(metrics):
        out.extend(_render_row(i, m, baseline_data, primary))

    out.extend(_render_legend(height))
    out.append(SVG_TAIL)
    return "\n".join(out)


def _render_row(i: int, m, baseline_data, primary: str) -> list[str]:
    """One metric row: row label + one bar per non-baseline layout. The
    default scale is 1% = BAR_MAX/100 px so absolute lengths are
    comparable across rows; rows with a max change > 100% rescale
    independently so the largest bar fills the row.

    Rows where the primary comparison layout is *worse* than baseline
    get a "(worse)" tag dropped onto a second line of the label, since
    the bar magnitudes there represent regression rather than
    improvement."""
    label = m.metadata["label"]
    lower_better = m.metadata["lower_better"]
    y_row = HEADER_H + i * ROW_PITCH

    baseline_value = getattr(baseline_data, m.name)
    layout_values = {name: getattr(LAYOUTS[name], m.name) for name in COMPARE}
    row_changes = [signed_change_pct(layout_values[name], baseline_value) for name in COMPARE]
    row_max = max((abs(c) for c in row_changes), default=0)
    row_scale = BAR_MAX / row_max if row_max > 100 else BAR_MAX / 100

    is_worse = is_regression(layout_values[primary], baseline_value, lower_better)
    row_label = (
        f'<tspan x="115" dy="-0.4em">{label}</tspan>'
        f'<tspan x="115" dy="1.2em">(worse)</tspan>'
        if is_worse
        else label
    )

    label_y = y_row + BAR_H + BAR_GAP // 2
    parts = [text(row_label, x=115, y=label_y, cls='label',
                  text_anchor='end', dominant_baseline='middle')]

    for j, name in enumerate(COMPARE):
        change = signed_change_pct(layout_values[name], baseline_value)
        bar_y = y_row + j * (BAR_H + BAR_GAP)
        bar_w = abs(change) * row_scale
        sign = "+" if change >= 0 else "−"  # Unicode minus reads better
        value_text = f'{sign}{round(abs(change))}%'

        parts.append(rect(x=BAR_X, y=bar_y, w=f'{bar_w:.1f}', h=BAR_H, cls=LAYOUT_CLASS[name]))
        parts.append(text(value_text, x=f'{BAR_X + bar_w + 4:.1f}', y=bar_y + BAR_H / 2,
                          cls='value', dominant_baseline='middle'))

    return parts


def _render_legend(height: int) -> list[str]:
    """Centered swatch + label items along the bottom legend band."""
    swatch_w = 11
    label_gap = 4
    item_gap = 18
    char_w = 7.2  # approx for IBM Plex Mono 12px
    item_widths = [swatch_w + label_gap + int(len(name) * char_w) for name in COMPARE]
    total_w = sum(item_widths) + (len(COMPARE) - 1) * item_gap
    cur_x = (WIDTH - total_w) / 2
    legend_y = height - 10

    parts = []
    for name, iw in zip(COMPARE, item_widths):
        parts.append(rect(x=f'{cur_x:.0f}', y=legend_y - 10, w=swatch_w, h=11, cls=LAYOUT_CLASS[name]))
        parts.append(text(name, x=f'{cur_x + swatch_w + label_gap:.0f}', y=legend_y, cls='legend'))
        cur_x += iw + item_gap
    return parts


def main() -> None:
    (DOCS / "metrics-chart.svg").write_text(generate_chart_svg(), encoding="utf-8")


if __name__ == "__main__":
    main()
