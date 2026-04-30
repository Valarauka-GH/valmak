#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["markdown>=3.5"]
# ///
"""Render README.md → docs/readme.html (smart-quotes, prose only).

Run with `uv run update_readme.py` (or directly if executable). The
`markdown` dep is declared inline above (PEP 723); uv handles it in
an ephemeral env — no pip install needed.

The chart SVG is owned by update_chart.py — run that separately when
the layout stats change."""

from __future__ import annotations

import sys
from pathlib import Path

import markdown as md_lib

ROOT = Path(__file__).resolve().parent
DOCS = ROOT / "docs"


def main() -> int:
    """Render README.md → docs/readme.html.

    The output is everything below the first ## heading, rendered with
    smart-quotes. img paths "docs/X" are rewritten to "X" since GitHub
    Pages serves the docs/ folder at the site root."""
    text = (ROOT / "README.md").read_text(encoding="utf-8")
    text = text.replace('src="docs/', 'src="')

    lines = text.split("\n")
    for i, line in enumerate(lines):
        if line.startswith("## "):
            html = md_lib.markdown("\n".join(lines[i:]), extensions=["smarty"])
            (DOCS / "readme.html").write_text(html, encoding="utf-8")
            return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
