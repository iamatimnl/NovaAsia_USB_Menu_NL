#!/usr/bin/env python3
"""Build display/menu.json from the same menu publication the Kiosk uses.

Prices are not re-implemented here: the publication is expanded with the backend's
own `expand_published_source` and priced with the Kiosk's own catalog view model
(`static/kiosk/js/catalog-view-model.js`), so "Vanaf" prices match the Kiosk exactly.

Usage (from this repo, with the three Nova Asia repos checked out side by side):

  python3 tools/build_menu_snapshot.py \
      --source ../nova-asia/catalog/operations-menu-source.json \
      --managed ../nova-asia/scripts/mobile_storefront_preview_support/public-menu.json \
      --backend ../flask-order-api --kiosk ../nova-asia-kiosk

`--source` may also be the live publication URL
(https://www.novaasia.nl/api/menu/kiosk-publication), which already contains the
products added in the Dashboard; then `--managed` is not needed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "display" / "menu.json"


def load(source: str) -> dict:
    if source.startswith("http"):
        with urllib.request.urlopen(source, timeout=15) as response:  # noqa: S310 (fixed https source)
            return json.load(response)
    return json.loads(Path(source).read_text(encoding="utf-8"))


def expand(source: dict, backend: Path) -> dict:
    sys.path.insert(0, str(backend))
    from kiosk_backend.catalog import expand_published_source  # type: ignore

    # Unavailable items are never shown; leaving them out also skips products whose option
    # rules the Kiosk cannot sell yet (Bubble Tea), exactly as the Kiosk does.
    kept = dict(source)
    kept["items"] = [i for i in source["items"] if i.get("available") and not i.get("sold_out")]
    return expand_published_source(kept)


def kiosk_prices(expanded: dict, kiosk: Path) -> dict:
    script = (
        "const VM=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{"
        "const n=VM.normalize(JSON.parse(s));process.stdout.write(JSON.stringify(n.items.map(i=>"
        "[i.id,i.display_price_cents,i.price_kind,i.kiosk_saleable])));});"
    )
    vm = kiosk / "static" / "kiosk" / "js" / "catalog-view-model.js"
    result = subprocess.run(["node", "-e", script, str(vm)], input=json.dumps(expanded),
                            capture_output=True, text=True, check=True)
    return {row[0]: row[1:] for row in json.loads(result.stdout)}


def managed_products(path: str | None, known_ids: set[str]) -> list[dict]:
    """Products added in the Dashboard; only in a captured public menu, so marked for checking."""
    if not path:
        return []
    capture = load(path)
    rows = []
    for product in capture.get("products", []):
        if product["id"] in known_ids or not str(product["id"]).startswith("dish-"):
            continue
        rows.append({
            "id": product["id"], "name": product["name"].strip(), "description": (product.get("description") or "").strip(),
            "category": product.get("category_id"), "price_cents": product["price_cents"], "price_kind": "fixed",
            "image": product.get("image_url"), "available": product.get("available") is not False,
            "source": f"website capture {capture.get('captured_at', '')[:10]}", "verify": True,
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--managed")
    parser.add_argument("--backend", required=True, type=Path)
    parser.add_argument("--kiosk", required=True, type=Path)
    parser.add_argument("--source-label", default="")
    args = parser.parse_args()

    source = load(args.source)
    expanded = expand(source, args.backend)
    prices = kiosk_prices(expanded, args.kiosk)
    categories = [{"id": c["category_id"], "name": c["category_name"]}
                  for c in sorted(source["categories"], key=lambda c: c.get("sort_order", 0))]
    items = []
    for item in expanded["items"]:
        price, kind, saleable = prices.get(item["item_id"], [item["base_price_cents"], "fixed", True])
        items.append({
            "id": item["item_id"], "name": " ".join(item["name"].split()), "description": (item.get("description") or "").strip(),
            "category": item["category_id"], "price_cents": price,
            "price_kind": "build" if kind == "from" and not price else kind,
            "image": item.get("image_url"), "available": bool(item["available"] and not item["sold_out"] and saleable),
        })
    items += managed_products(args.managed, {i["id"] for i in items})
    snapshot = {
        "schema": "nova-display-menu-v1",
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "source": args.source_label or args.source,
        "catalog_version": expanded.get("catalog_version"),
        "categories": categories,
        "items": items,
    }
    OUT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(items)} items, {sum(1 for i in items if i.get('verify'))} to verify")


if __name__ == "__main__":
    main()
