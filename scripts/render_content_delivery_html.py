"""Regenerate content/CONTENT_DELIVERY_GUIDE.html from the markdown (then Print to PDF from browser, or use Edge --headless)."""
from pathlib import Path

import markdown

REPO = Path(__file__).resolve().parents[1]
MD = REPO / "content" / "CONTENT_DELIVERY_GUIDE.md"
OUT = REPO / "content" / "CONTENT_DELIVERY_GUIDE.html"

body = markdown.markdown(
    MD.read_text(encoding="utf-8"),
    extensions=["fenced_code", "tables", "nl2br"],
)
html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Relentless — Content Authoring Kit</title>
<style>
body {{ font-family: system-ui, "Segoe UI", sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.55; color: #1a1a1a; }}
h1, h2, h3, h4 {{ line-height: 1.25; margin-top: 1.5em; }}
code, pre {{ background: #f2f2f2; font-size: 0.9em; }}
code {{ padding: 0.1em 0.35em; border-radius: 3px; }}
pre {{ padding: 0.9rem; overflow-x: auto; border-radius: 4px; }}
pre code {{ background: none; padding: 0; }}
table {{ border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.95em; }}
th, td {{ border: 1px solid #ccc; padding: 0.4rem 0.5rem; text-align: left; }}
a {{ color: #0b57d0; }}
@media print {{ body {{ max-width: 100%; }} }}
</style>
</head>
<body>
{body}
</body>
</html>
"""
OUT.write_text(html, encoding="utf-8")
print("Wrote", OUT)
