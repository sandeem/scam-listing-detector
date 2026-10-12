"""Write a simple HTML report. This is the screen you film."""
from __future__ import annotations

import html
from datetime import datetime

COLORS = {"LOW RISK": "#1f9d55", "SUSPICIOUS": "#d69e2e", "LIKELY SCAM": "#e02424"}


def write_report(assessments, path: str, mock: bool, glasser_calls: int) -> None:
    rows = []
    for a in sorted(assessments, key=lambda x: -x.risk):
        l = a.listing
        color = COLORS[a.label]
        why = "<br>".join(html.escape(r) for r in a.reasons) or "No red flags found."
        rows.append(
            f"<tr><td>{html.escape(l['title'])}<br><small>{html.escape(l['city'])} · "
            f"{l['beds']} bd · ${l['price']:,}/mo</small></td>"
            f"<td style='color:{color};font-weight:700'>{a.label}</td>"
            f"<td>{a.risk:.0%}</td><td><small>{why}</small></td></tr>"
        )
    banner = ("<p style='background:#fef3c7;padding:8px'>MOCK MODE: keyword rules, not real Jev.</p>"
              if mock else "")
    doc = f"""<!doctype html><meta charset="utf-8"><title>Scam Listing Detector</title>
<style>body{{font-family:system-ui;max-width:980px;margin:40px auto}}
table{{border-collapse:collapse;width:100%}}td,th{{border-bottom:1px solid #ddd;padding:10px;text-align:left;vertical-align:top}}
</style>
<h1>Scam Listing Detector</h1>
<p>Glasser got the evidence. Jev made the decision. AdaL built the tool.</p>{banner}
<table><tr><th>Listing</th><th>Verdict</th><th>Risk</th><th>Why</th></tr>{''.join(rows)}</table>
<p><small>{datetime.now():%Y-%m-%d %H:%M} · Glasser paid calls: {glasser_calls}</small></p>"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(doc)
