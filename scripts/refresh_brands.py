#!/usr/bin/env python3
"""Replaces a few chains' stores in data/stores.json with fresh ones from All the Places or OpenStreetMap.

Usage:
  python3 scripts/refresh_brands.py "Dutch Bros=atp:dutch_bros" "Lowe's=atp:lowes_us@2026-07-11-13-32-25" "Erewhon=osm"

Each argument is a chain name exactly as assets/app.js lists it, then its source:
  atp:<spider>        that spider's output from the latest All the Places run
  atp:<spider>@<run>  the same from an earlier run, for when a spider has since broken
  file:<path>         a GeoJSON file in the same form, such as an All the Places file you've corrected
  osm                 OpenStreetMap, through the same Overpass query the map's Refresh button sends
                      (or QLever's copy of OpenStreetMap when every Overpass server is down)
Join sources with + to combine them ("7 Brew=atp:7_brew_us+osm"): each later source only adds stores more than
half a mile from every store the earlier ones found.

Stores are matched to the chain with the map's own brand pattern, and All the Places stores must also pass the chain's
OpenStreetMap category filter (which keeps Tesla showrooms and drops Superchargers), unless the spider tags its
stores some other way. Stores the source lists without coordinates are located from their street address with the
Census Bureau's batch geocoder. Downloads are cached in .cache/stores/.
"""
import argparse, csv, hashlib, io, json, math, os, re, urllib.error, urllib.parse, urllib.request, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATP_RUNS = "https://data.alltheplaces.xyz/runs/latest.json"
ATP_OUTPUT = "https://alltheplaces-data.openaddresses.io/runs/{run}/output/{spider}.geojson"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
QLEVER = "https://qlever.dev/api/osm-planet"
GEOCODER = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
AGENT = "retail-signal-map/1.0 (+https://github.com/sjonah123-stack/retail-signal-map)"


def in_us(lat, lon):
    return isinstance(lat, (int, float)) and isinstance(lon, (int, float)) and math.isfinite(lat) and math.isfinite(lon) \
        and 17 <= lat <= 72 and -180 <= lon <= -60


def text(v, limit):
    return v.strip()[:limit] if isinstance(v, str) else ""


def read_brands():
    """Brand definitions from assets/app.js: name -> (OpenStreetMap selector, compiled name pattern, raw pattern, case-insensitive)."""
    with open(os.path.join(ROOT, "assets", "app.js"), encoding="utf-8") as f:
        src = f.read()
    out = {}
    for m in re.finditer(r'\{ name: "((?:[^"\\]|\\.)*)", sel: \'((?:[^\'\\]|\\.)*)\', re: "((?:[^"\\]|\\.)*)"(, ci: false)?', src):
        name, sel, pat, cs = m.group(1), m.group(2), m.group(3), m.group(4)
        out[name] = (sel, re.compile(pat, 0 if cs else re.I), pat, not cs)
    return out


def selector_ok(sel, tags):
    """Whether OSM-style tags satisfy a selector like ["shop"], ["amenity"="cafe"] or ["shop"~"^(car|car_repair)$"]."""
    for key, op, val in re.findall(r'\["([^"]+)"(?:(=|~)"([^"]*)")?\]', sel):
        v = tags.get(key)
        if v is None or (op == "=" and v != val) or (op == "~" and not re.search(val, str(v))):
            return False
    return True


def fetch(url, cache, data=None, headers=None, timeout=300, check=None):
    """Downloads once and keeps the answer in the cache (pass cache=None to always fetch). check() raises on a bad answer."""
    key = hashlib.sha1((url + "\n" + (data.decode("utf-8", "replace") if data else "")).encode()).hexdigest()[:16]
    path = cache and os.path.join(cache, key)
    if path and os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()
    req = urllib.request.Request(url, data=data, headers={"User-Agent": AGENT, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
    if check:
        check(body)
    if path:
        with open(path, "wb") as f:
            f.write(body)
    return body


def from_atp(spider, run, brand, cache):
    if not run:
        run = json.loads(fetch(ATP_RUNS, None))["run_id"]
    feats = json.loads(fetch(ATP_OUTPUT.format(run=run, spider=spider), cache))["features"]
    return from_features(feats, brand, cache), f"All the Places {run} {spider}"


def from_features(feats, brand, cache):
    """Stores from All the Places-style GeoJSON features (OSM tags as properties)."""
    _, rx, _, _ = BRANDS[brand]
    feats = [f for f in feats if rx.search(text((f.get("properties") or {}).get("brand"), 200)) or rx.search(text((f.get("properties") or {}).get("name"), 200))]
    sel = BRANDS[brand][0]
    if any(selector_ok(sel, f.get("properties") or {}) for f in feats):
        feats = [f for f in feats if selector_ok(sel, f.get("properties") or {})]
    else:
        print(f"  {brand}: the spider tags stores differently from OpenStreetMap, so its category filter is skipped")
    stores, need = [], []
    for f in feats:
        p, g = f.get("properties") or {}, f.get("geometry") or {}
        if text(p.get("addr:country"), 10).upper() not in ("", "US", "PR"):
            continue
        row = {"city": p.get("addr:city"), "st": p.get("addr:state")}
        if g.get("type") == "Point" and len(g.get("coordinates") or []) == 2:
            row["lon"], row["lat"] = g["coordinates"]
            stores.append(row)
        else:
            street = text(p.get("addr:street_address"), 200) or " ".join(filter(None, [text(p.get("addr:housenumber"), 20), text(p.get("addr:street"), 150)]))
            if street:
                row["addr"] = [street, text(p.get("addr:city"), 80), text(p.get("addr:state"), 30), text(p.get("addr:postcode"), 10)[:5]]
                need.append(row)
    if need:
        located = geocode([r["addr"] for r in need], cache)
        for r, ll in zip(need, located):
            if ll:
                r["lat"], r["lon"] = ll
                stores.append(r)
        print(f"  {brand}: located {sum(1 for x in located if x)} of {len(need)} stores listed without coordinates")
    return stores


def geocode(addresses, cache):
    """[[street, city, state, zip]] -> [(lat, lon) or None], through the Census batch geocoder (no key, up to 10,000 a call)."""
    buf = io.StringIO()
    csv.writer(buf).writerows([[i, *a] for i, a in enumerate(addresses)])
    boundary = uuid.uuid4().hex
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="benchmark"\r\n\r\nPublic_AR_Current\r\n',
             f'--{boundary}\r\nContent-Disposition: form-data; name="addressFile"; filename="a.csv"\r\nContent-Type: text/csv\r\n\r\n{buf.getvalue()}\r\n',
             f"--{boundary}--\r\n"]
    body = fetch(GEOCODER, cache, "".join(parts).encode(), {"Content-Type": f"multipart/form-data; boundary={boundary}"}, timeout=900)
    out = [None] * len(addresses)
    for row in csv.reader(io.StringIO(body.decode("utf-8", "replace"))):
        if len(row) >= 6 and row[2] == "Match" and row[0].isdigit() and int(row[0]) < len(out):
            lon, lat = (float(v) for v in row[5].split(","))
            out[int(row[0])] = (lat, lon)
    return out


def from_osm(brand, cache):
    sel, rx, pat, ci = BRANDS[brand]
    flag = ",i" if ci else ""
    q = (f'[out:json][timeout:180];\narea["ISO3166-1"="US"][admin_level=2]->.us;\n(\n  nwr{sel}["brand"~"{pat}"{flag}](area.us);\n'
         f'  nwr{sel}["name"~"{pat}"{flag}](area.us);\n);\nout center;')
    def check(body):
        remark = json.loads(body).get("remark") or ""
        if re.search(r"timed out|runtime error|out of memory", remark, re.I):
            raise RuntimeError(remark)
    ep = overpass_server()
    try:
        j = json.loads(fetch(ep, cache, urllib.parse.urlencode({"data": q}).encode(), {"Content-Type": "application/x-www-form-urlencoded"}, check=check)) if ep else None
    except (urllib.error.URLError, OSError, RuntimeError, ValueError) as e:
        print(f"  {brand}: {urllib.parse.urlparse(ep).netloc} failed ({e})")
        j = None
    if j is None:
        return from_qlever(brand, cache)
    stores = []
    for el in j.get("elements") or []:
        t = el.get("tags") or {}
        if not (rx.search(t.get("brand", "")) or rx.search(t.get("name", ""))):
            continue
        lat, lon = el.get("lat", (el.get("center") or {}).get("lat")), el.get("lon", (el.get("center") or {}).get("lon"))
        stores.append({"lat": lat, "lon": lon, "city": t.get("addr:city"), "st": t.get("addr:state")})
    return stores, "OpenStreetMap (Overpass)"


def overpass_server():
    """The first Overpass server that answers a trivial query, checked once per run; None when they're all down."""
    global OVERPASS_UP
    if OVERPASS_UP is None:
        OVERPASS_UP = ""
        for ep in OVERPASS:
            try:
                fetch(ep, None, b"data=%5Bout%3Ajson%5D%3Bnode%281%29%3Bout%20ids%3B", {"Content-Type": "application/x-www-form-urlencoded"}, timeout=30)
                OVERPASS_UP = ep
                break
            except (urllib.error.URLError, OSError) as e:
                print(f"  {urllib.parse.urlparse(ep).netloc} isn't answering ({e})")
    return OVERPASS_UP


def from_qlever(brand, cache):
    """The same OpenStreetMap search through QLever's copy of the planet, for when every Overpass server is down."""
    sel, rx, pat, ci = BRANDS[brand]
    p = json.dumps(pat, ensure_ascii=False)
    flag = ', "i"' if ci else ""
    q = f"""PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX ogc: <http://www.opengis.net/rdf#>
PREFIX osmrel: <https://www.openstreetmap.org/relation/>
SELECT ?osm ?brand ?name ?shop ?amenity ?leisure ?city ?state ?wkt WHERE {{
  {{ ?osm osmkey:brand ?m . FILTER(REGEX(?m, {p}{flag})) }} UNION {{ ?osm osmkey:name ?m . FILTER(REGEX(?m, {p}{flag})) }}
  ?osm ogc:sfIntersects osmrel:148838 .
  ?osm geo:hasGeometry/geo:asWKT ?wkt .
  OPTIONAL {{ ?osm osmkey:brand ?brand }} OPTIONAL {{ ?osm osmkey:name ?name }}
  OPTIONAL {{ ?osm osmkey:shop ?shop }} OPTIONAL {{ ?osm osmkey:amenity ?amenity }} OPTIONAL {{ ?osm osmkey:leisure ?leisure }}
  OPTIONAL {{ ?osm osmkey:addr:city ?city }} OPTIONAL {{ ?osm osmkey:addr:state ?state }}
}}"""
    print(f"  {brand}: Overpass is down; asking QLever (about a minute)")
    body = fetch(QLEVER, cache, urllib.parse.urlencode({"query": q}).encode(),
                 {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/sparql-results+json"}, timeout=900)
    stores, seen = [], set()
    for b in json.loads(body)["results"]["bindings"]:
        t = {k: v["value"] for k, v in b.items()}
        t.update({f"addr:{k}": t[k] for k in ("city", "state") if k in t})   # selectors use the OSM key names
        if t["osm"] in seen or not selector_ok(sel, t) or not (rx.search(t.get("brand", "")) or rx.search(t.get("name", ""))):
            continue
        seen.add(t["osm"])
        pts = [(float(x), float(y)) for x, y in re.findall(r"(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)", t["wkt"])]   # a point, or a building's outline
        if pts:
            stores.append({"lat": sum(y for _, y in pts) / len(pts), "lon": sum(x for x, _ in pts) / len(pts), "city": t.get("city"), "st": t.get("state")})
    return stores, "OpenStreetMap (QLever)"


def main():
    global BRANDS
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("chains", nargs="+", help='"Chain=atp:spider[@run]", "Chain=file:path.geojson" or "Chain=osm"')
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache", "stores"))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    BRANDS = read_brands()
    path = os.path.join(ROOT, "data", "stores.json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    tables = {k: {v: i for i, v in enumerate(data[k])} for k in ("brands", "places", "srcs")}

    def idx(table, key):
        if key not in tables[table]:
            tables[table][key] = len(data[table])
            data[table].append(key)
        return tables[table][key]

    for arg in args.chains:
        brand, _, sources = arg.partition("=")
        if brand not in BRANDS:
            raise SystemExit(f'"{brand}" isn\'t a chain in assets/app.js.')
        bi = idx("brands", brand)
        rows, seen, labels = [], set(), []
        # Sources joined with + are combined: a later source only adds stores more than half a mile from any already in.
        for n, source in enumerate(sources.split("+")):
            if source == "osm":
                got, label = from_osm(brand, args.cache)
                src = "OpenStreetMap"
            elif source.startswith("atp:"):
                spider, _, run = source[4:].partition("@")
                got, label = from_atp(spider, run, brand, args.cache)
                src = "All the Places"
            elif source.startswith("file:"):
                with open(source[5:], encoding="utf-8") as f:
                    got, label = from_features(json.load(f)["features"], brand, args.cache), os.path.basename(source[5:])
                src = "All the Places"
            else:
                raise SystemExit(f'Unknown source "{source}" for {brand}.')
            earlier, added = list(rows), 0
            for s in got:
                lat, lon = s.get("lat"), s.get("lon")
                if not in_us(lat, lon):
                    continue
                k = (round(lat / 0.002), round(lon / 0.0025))   # one store per ~200 m, as the map dedupes
                if k in seen or any(abs(r[1] - lat) < 0.008 and abs(r[2] - lon) < 0.01 for r in earlier):
                    continue
                seen.add(k)
                city = text(s.get("city"), 80).replace("|", " ")
                st = text(s.get("st"), 10).upper() if re.fullmatch(r"[A-Za-z]{2}", text(s.get("st"), 10)) else ""
                rows.append([bi, round(lat, 5), round(lon, 5), idx("places", f"{city}|{st}" if city or st else ""), idx("srcs", src)])
                added += 1
            labels.append(f"{label}: {added:,}" if n else label)
        before = sum(1 for r in data["rows"] if r[0] == bi)
        data["rows"] = [r for r in data["rows"] if r[0] != bi] + rows
        if brand not in data["loaded"]:
            data["loaded"].append(brand)
        print(f"{brand}: {before:,} -> {len(rows):,} stores ({'; plus '.join(labels)})")
    data["rows"].sort(key=lambda r: (r[0], r[1], r[2]))
    with open(path, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"Wrote {len(data['rows']):,} stores across {len(data['brands'])} chains.")


BRANDS, OVERPASS_UP = {}, None
if __name__ == "__main__":
    main()
