#!/usr/bin/env python3
"""
Generate assets/js/readme-data.js from README.md so the docs view works offline.
Run `python3 scripts/build-readme.py` after updating README.md.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
markdown_path = ROOT / "README.md"
output_path = ROOT / "assets" / "js" / "readme-data.js"

markdown_text = markdown_path.read_text(encoding="utf-8")
timestamp = datetime.now(timezone.utc).isoformat()

banner = (
    "// Auto-generated from README.md on "
    f"{timestamp}\n// Do not edit manually – run `python3 scripts/build-readme.py` instead.\n"
)

payload = f"{banner}window.__PCI_README__ = {json.dumps(markdown_text)};\n"

output_path.write_text(payload, encoding="utf-8")
print(f"Embedded README.md into {output_path.relative_to(ROOT)}")
