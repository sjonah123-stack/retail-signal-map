#!/usr/bin/env python3
"""Keeps the bundled store data current and records which chains opened or closed stores.

Each run takes every tracked chain's stores from the newest All the Places run, compares them with the run the data
last used, records stores that appeared (openings) or disappeared (closings) in data/changes.json, and replaces the
chain's stores in data/stores.json. data/store_runs.json remembers which run and collector each chain came from.

Usage:
  python3 scripts/track_stores.py                 update to the newest All the Places run (the monthly job)
  python3 scripts/track_stores.py --backfill 12   start tracking: walk the last 12 months a quarter at a time,
                                                  recording what changed between each, then update

A collector is a scraper of the chain's own store locator, so a change can also mean the scraper broke, started
covering more stores or re-placed them. So: a chain whose count falls more than 15% is left as it was; one that jumps by
more than a quarter, or whose openings or closings in one step are implausibly many for a real chain (over 10% or 6%
of its stores, or over 1% each at once), is refreshed without recording anything; an opening and a closing of the same chain within 1.5 miles of
each other count as a move, not as either; and a store that disappears and comes back later cancels out. Chains only in
OpenStreetMap aren't tracked, since a newly mapped store isn't a newly opened one, and neither is 7 Brew, whose
collector no longer lists most stores' addresses.
"""
import argparse, json, math, os, re, sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import refresh_brands as rb   # noqa: E402  (shares the brand filters, downloads and geocoding)

ROOT = rb.ROOT
ATP_HISTORY = "https://data.alltheplaces.xyz/runs/history.json"
# Chain (as assets/app.js names it) -> All the Places collector.
CHAINS = {
    "Chick-fil-A": "chick_fil_a", "Costco": "costco_ca_gb_us", "Trader Joe's": "trader_joes_us", "H-E-B": "h_e_b_us",
    "Publix": "publix_us", "Wegmans": "wegmans_us", "Starbucks": "starbucks_us", "Target": "target_us", "Home Depot": "home_depot",
    "Lowe's": "lowes_us", "Dutch Bros": "dutch_bros", "Whataburger": "whataburger", "In-N-Out": "innout", "Wawa": "wawa",
    "Whole Foods": "whole_foods", "Sprouts": "sprouts_farmers_market", "Life Time": "life_time", "CAVA": "cava_us",
    "sweetgreen": "sweetgreen_us", "ALDI": "aldi_sud_us", "Shake Shack": "shake_shack", "First Watch": "first_watch",
    "Raising Cane's": "raising_canes_us", "lululemon": "lululemon_ca_us", "REI": "rei_us",
    "Total Wine": "total_wine_and_more_us", "Apple Store": "apple", "Vuori": "vuori", "Warby Parker": "warby_parker",
    "Equinox": "equinox", "SoulCycle": "soulcycle", "Barry's": "barrys", "solidcore": "solidcore_us",
    "The Fresh Market": "fresh_market_us", "Williams-Sonoma": "williams_sonoma_us", "Pottery Barn": "williams_sonoma_us",
    "Nordstrom": "nordstrom", "Neiman Marcus": "neiman_marcus_us", "Saks Fifth Avenue": "saks_fifth_avenue_us",
    "Bloomingdale's": "bloomingdales_us", "Primrose Schools": "primrose_school_us", "Goddard School": "goddard_school_us",
    "Tesla": "tesla",
}
SAME_STORE_MI = 0.3     # an opening or closing must be this far from every store of the chain on the other side
MOVE_MI = 1.5           # an opening and a closing this close together are one store moving (or being re-placed)
DROP, JUMP = 0.85, 1.25
MAX_OPEN, MAX_CLOSE = 0.10, 0.06   # share of a chain's stores it could plausibly open or close between two runs
MIXED = 0.01                       # ...or both open and close
KEEP_MONTHS = 24


def miles(a, b):
    dy = (a[0] - b[0]) * 69
    dx = (a[1] - b[1]) * 69 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)


class Index:
    """Stores bucketed on a 0.1° grid for 'is there one within x miles' checks."""
    def __init__(self, pts):
        self.b = {}
        for p in pts:
            self.b.setdefault((int(p[0] * 10 // 1), int(p[1] * 10 // 1)), []).append(p)

    def near(self, p, mi):
        i, j = int(p[0] * 10 // 1), int(p[1] * 10 // 1)
        return any(miles(p, q) <= mi for di in (-1, 0, 1) for dj in (-1, 0, 1) for q in self.b.get((i + di, j + dj), ()))


def run_date(run):
    return run[:10]


def valid_json(body):
    json.loads(body)   # raises on the empty or partial files some runs serve, so they aren't cached


def collect(brand, spider, run, cache):
    """The chain's stores in one run: [(lat, lon, city, state)], one per ~200 m, as the map dedupes."""
    try:
        feats = json.loads(rb.fetch(rb.ATP_OUTPUT.format(run=run, spider=spider), cache, check=valid_json))["features"]
        got = rb.from_features(feats, brand, cache)
    except Exception as e:   # a collector missing from that run, or a download that failed
        print(f"  {brand}: no data from {spider} in {run} ({e})")
        return None
    out, seen = [], set()
    for s in got:
        lat, lon = s.get("lat"), s.get("lon")
        if not rb.in_us(lat, lon):
            continue
        k = (round(lat / 0.002), round(lon / 0.0025))
        if k in seen:
            continue
        seen.add(k)
        city = rb.text(s.get("city"), 80).replace("|", " ").title() if isinstance(s.get("city"), str) and s["city"].isupper() else rb.text(s.get("city"), 80).replace("|", " ")
        st = rb.text(s.get("st"), 10).upper()
        out.append((round(lat, 5), round(lon, 5), city, st if re.fullmatch(r"[A-Z]{2}", st) else ""))
    return out


def compare(brand, old, new, when, since, log):
    """Openings and closings between two snapshots, or None when the counts suggest the collector itself changed."""
    if len(new) < DROP * len(old):
        log.append(f"{brand}: {len(old):,} -> {len(new):,} stores in {when}; looks like the collector broke, kept the earlier stores")
        return None
    if len(new) > JUMP * len(old) + 10:
        log.append(f"{brand}: {len(old):,} -> {len(new):,} stores in {when}; looks like the collector's coverage grew, refreshed without recording openings")
        return []
    io, inew = Index(old), Index(new)
    opened = [s for s in new if not io.near(s, SAME_STORE_MI)]
    closed = [s for s in old if not inew.near(s, SAME_STORE_MI)]
    for o in list(opened):   # moves and re-placed stores: pair each opening with a nearby closing
        twin = min(closed, key=lambda c: miles(o, c), default=None)
        if twin and miles(o, twin) <= MOVE_MI:
            opened.remove(o)
            closed.remove(twin)
    churn = len(opened) > MAX_OPEN * len(old) + 5 or len(closed) > MAX_CLOSE * len(old) + 5
    # Real chains rarely open and close many stores at once; a collector that re-placed its stores does both.
    churn = churn or min(len(opened), len(closed)) > MIXED * len(old) + 3
    if churn:
        log.append(f"{brand}: {len(opened):,} openings and {len(closed):,} closings among {len(old):,} stores in {when}; "
                   "looks like the collector changed, refreshed without recording them")
        return []
    return [{"b": brand, "k": "o", "lat": s[0], "lon": s[1], "p": f"{s[2]}|{s[3]}", "d": when, "since": since} for s in opened] + \
           [{"b": brand, "k": "c", "lat": s[0], "lon": s[1], "p": f"{s[2]}|{s[3]}", "d": when, "since": since} for s in closed]


def record(items, found):
    """Adds new changes, cancelling a closing against a later reopening at the same spot (and the reverse)."""
    for ch in found:
        twin = next((x for x in items if x["b"] == ch["b"] and x["k"] != ch["k"] and miles((x["lat"], x["lon"]), (ch["lat"], ch["lon"])) <= SAME_STORE_MI), None)
        if twin:
            items.remove(twin)
        else:
            items.append(ch)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--backfill", type=int, metavar="MONTHS", help="walk this many months of past runs, a quarter at a time")
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache", "stores"))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    rb.BRANDS = rb.read_brands()
    for b in CHAINS:
        if b not in rb.BRANDS:
            sys.exit(f'"{b}" isn\'t a chain in assets/app.js.')

    paths = {k: os.path.join(ROOT, "data", f"{k}.json") for k in ("stores", "changes", "store_runs")}
    with open(paths["stores"], encoding="utf-8") as f:
        data = json.load(f)
    state = json.load(open(paths["store_runs"])) if os.path.exists(paths["store_runs"]) else {"chains": {}}
    changes = json.load(open(paths["changes"])) if os.path.exists(paths["changes"]) else {"items": [], "log": []}
    history = [r["run_id"] for r in json.loads(rb.fetch(ATP_HISTORY, None)) if r.get("end_time")]
    latest = history[-1]
    bidx = {b: i for i, b in enumerate(data["brands"])}
    srcs = data["srcs"]

    def rows_of(brand, src=None):
        bi = bidx.get(brand)
        return [r for r in data["rows"] if r[0] == bi and (src is None or srcs[r[4]] == src)]

    def place(r):
        city, _, st = data["places"][r[3]].partition("|")
        return (r[1], r[2], city, st)

    # Where each chain stands now: the stores of its last tracked run (or, for backfill, of the run a year back).
    snap, log = {}, []
    if args.backfill:
        y, m = int(latest[:4]), int(latest[5:7])
        steps = []
        for back in range(args.backfill, -1, -3):
            ty, tm = (y * 12 + m - 1 - back) // 12, (y * 12 + m - 1 - back) % 12 + 1
            target = f"{ty:04d}-{tm:02d}-{latest[8:10]}"
            steps.append(min(history, key=lambda r: abs((datetime.fromisoformat(r[:10]) - datetime.fromisoformat(target)).days)))
        steps = sorted(set(steps))
        if steps[-1] != latest:
            steps.append(latest)
        print("Backfilling through runs:", ", ".join(steps))
        changes = {"items": [], "log": []}
        for brand, spider in CHAINS.items():
            first = collect(brand, spider, steps[0], args.cache)
            snap[brand] = {"run": steps[0], "stores": first} if first else None
        walk = steps[1:]
    else:
        for brand, spider in CHAINS.items():
            st = state["chains"].get(brand)
            if st and st.get("spider") == spider:
                snap[brand] = {"run": st["run"], "stores": [place(r) for r in rows_of(brand, "All the Places")]}
            else:
                snap[brand] = None   # not tracked from this collector yet: the next run sets its baseline
        walk = [latest]

    for run in walk:
        when = run_date(run)
        print(f"Run {run}")
        for brand, spider in CHAINS.items():
            prev = snap.get(brand)
            if prev and prev["run"] >= run:
                continue
            new = collect(brand, spider, run, args.cache)
            if not new:
                if new is not None or prev is None:
                    log.append(f"{brand}: {spider} returned no stores in {when}; kept the earlier stores")
                continue
            if prev is None or not prev["stores"]:
                snap[brand] = {"run": run, "stores": new}
                continue
            found = compare(brand, prev["stores"], new, when, run_date(prev["run"]), log)
            if found is None:
                continue
            record(changes["items"], found)
            snap[brand] = {"run": run, "stores": new}

    # Write the newest snapshot of every tracked chain into the store data.
    tables = {k: {v: i for i, v in enumerate(data[k])} for k in ("brands", "places", "srcs")}

    def idx(table, key):
        if key not in tables[table]:
            tables[table][key] = len(data[table])
            data[table].append(key)
        return tables[table][key]

    atp = idx("srcs", "All the Places")
    for brand, s in snap.items():
        if not s:
            continue
        bi = idx("brands", brand)
        rows = [[bi, lat, lon, idx("places", f"{city}|{st}" if city or st else ""), atp] for lat, lon, city, st in s["stores"]]
        before = len(rows_of(brand))
        data["rows"] = [r for r in data["rows"] if r[0] != bi] + rows
        if brand not in data["loaded"]:
            data["loaded"].append(brand)
        state["chains"][brand] = {"spider": CHAINS[brand], "run": s["run"], "n": len(s["stores"])}
        if before != len(rows):
            print(f"  {brand}: {before:,} -> {len(rows):,} stores")
    data["rows"].sort(key=lambda r: (r[0], r[1], r[2]))
    data["saved"] = run_date(latest)

    # Keep two years of changes, newest first.
    cutoff = date.fromisoformat(run_date(latest))
    cutoff = cutoff.replace(year=cutoff.year - KEEP_MONTHS // 12).isoformat()
    changes["items"] = sorted((x for x in changes["items"] if x["d"] >= cutoff), key=lambda x: (x["d"], x["b"], x["lat"]), reverse=True)
    changes["updated"] = run_date(latest)
    changes["log"] = (log + changes.get("log", []))[:200]
    state["run"] = latest
    with open(paths["stores"], "w") as f:
        json.dump(data, f, separators=(",", ":"))
    with open(paths["changes"], "w") as f:
        json.dump(changes, f, separators=(",", ":"))
    with open(paths["store_runs"], "w") as f:
        json.dump(state, f, indent=1)
    opened = sum(1 for x in changes["items"] if x["k"] == "o")
    print("\n".join(log))
    print(f"Wrote {len(data['rows']):,} stores; {opened:,} openings and {len(changes['items']) - opened:,} closings on record since {cutoff}.")


if __name__ == "__main__":
    main()
