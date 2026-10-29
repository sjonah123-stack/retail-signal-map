#!/usr/bin/env python3
"""Turns a file saved from the map ("Save data") into the store data the site ships with.

Usage:
  python3 scripts/import_stores.py path/to/retail-signal-data-YYYY-MM-DD.json

Writes data/stores.json (compact) and data/upcoming.json. Everything in the file is checked first,
since whatever lands in data/ is published to every visitor: rows outside the US, unknown statuses,
non-web links and oversized text are dropped or trimmed.
"""
import json, math, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SOURCES = {"OpenStreetMap", "All the Places", "CSV"}
STATUSES = {"opened", "dated", "planned", "proposed"}


def in_us(lat, lon):
    return (isinstance(lat, (int, float)) and isinstance(lon, (int, float)) and math.isfinite(lat) and math.isfinite(lon)
            and 17 <= lat <= 72 and -180 <= lon <= -60)


def text(v, limit):
    return v.strip()[:limit] if isinstance(v, str) else ""


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        saved = json.load(f)
    if not isinstance(saved, dict) or saved.get("kind") != "retail-signal-map":
        sys.exit("That isn't a file saved from the map.")

    brands, places, srcs = [], [], []
    bi, pi, si = {}, {}, {}

    def idx(table, lookup, key):
        if key not in lookup:
            lookup[key] = len(table)
            table.append(key)
        return lookup[key]

    rows, dropped = [], 0
    for r in saved.get("stores") or []:
        if not isinstance(r, list) or len(r) < 3 or not text(r[0], 80) or not in_us(r[1], r[2]):
            dropped += 1
            continue
        b, lat, lon = text(r[0], 80), r[1], r[2]
        city = text(r[3], 80) if len(r) > 3 else ""
        st = text(r[4], 10).upper() if len(r) > 4 and re.fullmatch(r"[A-Za-z]{2}", text(r[4], 10)) else ""
        src = r[5] if len(r) > 5 and r[5] in SOURCES else "OpenStreetMap"
        place = f"{city.replace('|', ' ')}|{st}" if city or st else ""
        rows.append([idx(brands, bi, b), round(lat, 5), round(lon, 5), idx(places, pi, place), idx(srcs, si, src)])
    rows.sort(key=lambda r: (r[0], r[1], r[2]))

    upcoming = []
    for u in saved.get("upcoming") or []:
        if not isinstance(u, dict) or u.get("status") not in STATUSES or not text(u.get("b"), 80) or not in_us(u.get("lat"), u.get("lon")):
            dropped += 1
            continue
        src = u.get("src") if isinstance(u.get("src"), dict) else {}
        url = text(src.get("url"), 500)
        upcoming.append({"b": text(u["b"], 80), "place": text(u.get("place"), 120), "status": u["status"], "when": text(u.get("when"), 80),
                         "src": {"name": text(src.get("name"), 120) or "Source", "url": url} if re.match(r"^https?://", url, re.I) else None,
                         "lat": u["lat"], "lon": u["lon"]})

    loaded = [text(n, 80) for n in saved.get("loaded") or [] if text(n, 80)]
    out = {"saved": text(saved.get("saved"), 10), "loaded": loaded, "brands": brands, "places": places, "srcs": srcs, "rows": rows}
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, "stores.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    with open(os.path.join(DATA, "upcoming.json"), "w") as f:
        json.dump(upcoming, f, indent=1)
    print(f"Wrote {len(rows):,} stores across {len(brands)} chains and {len(upcoming)} announced openings."
          + (f" Dropped {dropped} rows that failed checks." if dropped else ""))


if __name__ == "__main__":
    main()
