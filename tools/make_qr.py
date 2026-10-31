"""Write the QR code(s) for the "online" pages of the menu screen.

Reads display/display.json; for every slide with "type": "online" it writes the SVG named in "qr"
(relative to display/) for the address in "url". Run again after changing the address:

    pip install segno
    python3 tools/make_qr.py

High error correction (H) so the logo in the middle and reflections on the shop window do not stop
phones from reading it. No quiet zone in the SVG: the white card around it on the page provides it.
"""
import json
from pathlib import Path

import segno

DISPLAY = Path(__file__).resolve().parents[1] / "display"


def main():
    config = json.loads((DISPLAY / "display.json").read_text(encoding="utf-8"))
    for slide in config["slides"]:
        if slide.get("type") != "online" or "url" not in slide:
            continue
        target = DISPLAY / slide["qr"]
        target.parent.mkdir(parents=True, exist_ok=True)
        qr = segno.make(slide["url"], error="h", boost_error=False)
        qr.save(str(target), kind="svg", border=0, dark="#111111", light=None, xmldecl=False, svgns=True, omitsize=True)
        print(f"{target.relative_to(DISPLAY.parent)}: {slide['url']} (version {qr.version}, {qr.symbol_size(border=0)[0]} modules)")


if __name__ == "__main__":
    main()
