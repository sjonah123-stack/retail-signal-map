#!/usr/bin/env python3
"""Turns a file saved from the map ("Save data") into the store data the site ships with.

Usage:
  python3 scripts/import_stores.py path/to/retail-signal-data-YYYY-MM-DD.json

Writes data/stores.json (compact) and data/upcoming.json.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        saved = json.load(f)
    if saved.get("kind") != "retail-signal-map":
        sys.exit("That isn't a file saved from the map.")

    brands, places, srcs = [], [], []
    bi, pi, si = {}, {}, {}

    def idx(table, lookup, key):
        if key not in lookup:
            lookup[key] = len(table)
            table.append(key)
        return lookup[key]

    rows = []
    for b, lat, lon, city, st, src in saved["stores"]:
        place = f"{city}|{st}" if city or st else ""
        rows.append([idx(brands, bi, b), round(lat, 5), round(lon, 5), idx(places, pi, place), idx(srcs, si, src or "OpenStreetMap")])
    rows.sort(key=lambda r: (r[0], r[1], r[2]))

    out = {"saved": saved.get("saved", "")[:10], "loaded": saved.get("loaded", []), "brands": brands,
           "places": places, "srcs": srcs, "rows": rows}
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, "stores.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    with open(os.path.join(DATA, "upcoming.json"), "w") as f:
        json.dump(saved.get("upcoming", []), f, indent=1)
    print(f"Wrote {len(rows):,} stores across {len(brands)} chains and {len(saved.get('upcoming', []))} announced openings.")


if __name__ == "__main__":
    main()
