#!/usr/bin/env python3
"""Builds the demographic and market data the map ships with.

Everything comes from free bulk downloads that need no API key:
  - ACS 5-year table-based summary files (Census), by tract and county
  - Census tract internal points and land area (Census Gazetteer)
  - County population estimates, 2020 to latest vintage (Census PEP)
  - County building permits by structure size (Census Building Permits Survey)
  - County and ZIP home values (ZHVI) and rents (ZORI) (Zillow Research)
  - ZIP code (ZCTA) internal points and land area (Census Gazetteer)
  - County boundaries (us-atlas, from Census cartographic files)

Usage:
  python3 scripts/build_market_data.py [--acs auto] [--pep auto] [--cache .cache]

Writes data/tracts.json, data/counties.json, data/zips.json and data/counties-10m.json.
"""
import argparse, csv, hashlib, io, json, os, re, sys, urllib.request, zipfile
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

ACS_URL = "https://www2.census.gov/programs-surveys/acs/summary_file/{y}/table-based-SF/data/5YRData/acsdt5y{y}-{t}.dat"
GAZ_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{y}_Gazetteer/{y}_Gaz_tracts_national.zip"
GAZ_ZCTA_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{y}_Gazetteer/{y}_Gaz_zcta_national.zip"
PEP_URL = "https://www2.census.gov/programs-surveys/popest/datasets/2020-{y}/counties/totals/co-est{y}-alldata.csv"
BPS_URL = "https://www2.census.gov/econ/bps/County/co{code}.txt"   # code: yyyya (annual) or yymmy (year to date)
ZILLOW = "https://files.zillowstatic.com/research/public_csvs/"
ZHVI_URL = ZILLOW + "zhvi/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
ZORI_URL = ZILLOW + "zori/County_zori_uc_sfrcondomfr_sm_month.csv"
ZHVI_ZIP_URL = ZILLOW + "zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
ZORI_ZIP_URL = ZILLOW + "zori/Zip_zori_uc_sfrcondomfr_sm_month.csv"
# County outlines are pinned to one release and checked, since they're published to every visitor as-is.
ATLAS_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json"
ATLAS_SHA256 = "145aaf5d1433352a6a1d8e86b5f149c7c653f9171baf14aaf75ee66575def1b0"

# Output field -> (table, line numbers summed). Raw counts are kept so the map can combine neighborhoods.
FIELDS = {
    "pop":   ("b01003", [1]),          # total population
    "inc":   ("b19013", [1]),          # median household income
    "hv":    ("b25077", [1]),          # median value, owner-occupied
    "rent":  ("b25064", [1]),          # median gross rent
    "occ":   ("b25003", [1]),          # occupied units (= households)
    "rnt":   ("b25003", [3]),          # renter-occupied units
    "ed":    ("b15003", [1]),          # population 25+
    "bachN": ("b15003", [22, 23, 24, 25]),  # bachelor's or higher
    "vfr":   ("b25004", [2]),          # vacant, for rent
    "vrno":  ("b25004", [3]),          # rented, not occupied
    "units": ("b25024", [1]),          # all housing units
    "mf5n":  ("b25024", [6, 7, 8, 9]), # units in buildings with 5+ units
    "yb":    ("b25035", [1]),          # median year structure built
}
ORDER = list(FIELDS)


def fetch(url, cache, name):
    path = os.path.join(cache, name)
    if not os.path.exists(path):
        print(f"  downloading {url}", file=sys.stderr)
        tmp = path + ".part"
        req = urllib.request.Request(url, headers={"User-Agent": "retail-signal-map data build"})
        with urllib.request.urlopen(req, timeout=300) as r, open(tmp, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        os.replace(tmp, path)
    return path


def exists(url):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "retail-signal-map data build"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status == 200
    except Exception:
        return False


def latest_year(arg, url_for):
    """'auto' picks the newest release that has been published; a number is used as given."""
    if arg != "auto":
        return int(arg)
    this_year = date.today().year
    for y in range(this_year, this_year - 4, -1):
        if exists(url_for(y)):
            return y
    sys.exit("Couldn't find a recent release. Pass the year explicitly.")


def num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return None if x < 0 else x   # ACS uses large negative sentinels for "not available"


def read_acs(year, cache):
    tracts, counties = {}, {}
    for table in sorted({t for t, _ in FIELDS.values()}):
        path = fetch(ACS_URL.format(y=year, t=table), cache, f"acs{year}-{table}.dat")
        wanted = [(k, lines) for k, (t, lines) in FIELDS.items() if t == table]
        with open(path, encoding="utf-8", errors="replace") as f:
            head = f.readline().rstrip("\n").split("|")
            col = {h: i for i, h in enumerate(head)}
            idx = [(k, [col[f"{table.upper()}_E{n:03d}"] for n in lines]) for k, lines in wanted]
            for line in f:
                if line.startswith("1400000US"):
                    dest, gid = tracts, line[9:20]
                elif line.startswith("0500000US"):
                    dest, gid = counties, line[9:14]
                else:
                    continue
                parts = line.rstrip("\n").split("|")
                rec = dest.setdefault(gid, {})
                for k, cols in idx:
                    vals = [num(parts[c]) for c in cols]
                    rec[k] = None if any(v is None for v in vals) else sum(vals)
        print(f"  {table}: {len(tracts):,} tracts, {len(counties):,} counties", file=sys.stderr)
    return tracts, counties


def read_gazetteer(year, cache):
    path = fetch(GAZ_URL.format(y=year), cache, f"gaz{year}_tracts.zip")
    out = {}
    with zipfile.ZipFile(path) as z:
        with z.open(z.namelist()[0]) as raw:
            rows = csv.reader(io.TextIOWrapper(raw, encoding="latin-1"), delimiter="\t")
            head = [h.strip() for h in next(rows)]
            g, a, la, lo = (head.index(k) for k in ("GEOID", "ALAND", "INTPTLAT", "INTPTLONG"))
            for r in rows:
                out[r[g].strip()] = (float(r[la]), float(r[lo].strip()), int(r[a]))
    return out


def read_pep(year, cache):
    path = fetch(PEP_URL.format(y=year), cache, f"pep{year}.csv")
    out = {}
    with open(path, encoding="latin-1") as f:
        for r in csv.DictReader(f):
            if r["SUMLEV"] != "050":
                continue
            p20, p1, p = int(r["POPESTIMATE2020"]), int(r[f"POPESTIMATE{year - 1}"]), int(r[f"POPESTIMATE{year}"])
            dom = sum(int(r[f"DOMESTICMIG{y}"]) for y in range(2021, year + 1))
            out[r["STATE"] + r["COUNTY"]] = {
                "name": f'{r["CTYNAME"]}, {r["STNAME"]}',
                "pep": p,
                "popg": round((p / p20 - 1) * 100, 2) if p20 else None,
                "popg1": round((p / p1 - 1) * 100, 2) if p1 else None,
                "dmig": round(dom / p20 * 100, 2) if p20 else None,
            }
    return out


def read_zillow(url, cache, name, horizons, zip_level=False):
    path = fetch(url, cache, name)
    out, latest = {}, None
    with open(path, encoding="utf-8") as f:
        rows = csv.reader(f)
        head = next(rows)
        dcols = [i for i, h in enumerate(head) if re.fullmatch(r"\d{4}-\d{2}-\d{2}", h)]
        keys = ("RegionName", "Metro") if zip_level else ("StateCodeFIPS", "MunicipalCodeFIPS", "Metro")
        h = {k: head.index(k) for k in keys}
        for r in rows:
            if zip_level:
                fips = r[h["RegionName"]].zfill(5)
                if not re.fullmatch(r"\d{5}", fips):
                    continue
            else:
                fips = r[h["StateCodeFIPS"]].zfill(2) + r[h["MunicipalCodeFIPS"]].zfill(3)
            series = [(head[i], float(r[i])) for i in dcols if r[i]]
            if not series:
                continue
            month, v = series[-1]
            by = dict(series)
            last_i = dcols.index(head.index(month))
            rec = {"v": round(v), "metro": r[h["Metro"]] or None, "month": month[:7]}
            for label, months in horizons.items():
                j = last_i - months
                old = by.get(head[dcols[j]]) if j >= 0 else None
                rec[label] = round((v / old - 1) * 100, 2) if old else None
            out[fips] = rec
            latest = max(latest or "", month[:7])
    return out, latest


def read_permits(cache):
    """Units permitted per county in 1-unit and 5+ unit buildings: the latest full year, and the last three.

    Only annual files are used. The monthly county files count just the places that reported that month,
    so a county whose main city skips a month looks like its permits collapsed; the annual files fill those in.
    """
    def load(code):
        path = fetch(BPS_URL.format(code=code), cache, f"bps-{code}.txt")
        out = {}
        with open(path, encoding="latin-1") as f:
            for r in csv.reader(f):
                if len(r) < 18 or not r[1].strip().isdigit() or not r[2].strip().isdigit():
                    continue
                out[r[1].strip().zfill(2) + r[2].strip().zfill(3)] = (int(r[7] or 0), int(r[16] or 0))
        return out

    last = latest_year("auto", lambda y: BPS_URL.format(code=f"{y}a"))
    ann = [load(f"{y}a") for y in (last, last - 1, last - 2)]
    out = {}
    for fips, (p1, p5) in ann[0].items():
        out[fips] = {"p1": p1, "p5": p5, "p5_36": sum(a.get(fips, (0, 0))[1] for a in ann)}
    return out, last


def read_zcta(year, cache):
    path = fetch(GAZ_ZCTA_URL.format(y=year), cache, f"gaz{year}_zcta.zip")
    out = {}
    with zipfile.ZipFile(path) as z:
        with z.open(z.namelist()[0]) as raw:
            rows = csv.reader(io.TextIOWrapper(raw, encoding="latin-1"), delimiter="\t")
            head = [h.strip() for h in next(rows)]
            g, a, la, lo = (head.index(k) for k in ("GEOID", "ALAND", "INTPTLAT", "INTPTLONG"))
            for r in rows:
                out[r[g].strip()] = (float(r[la]), float(r[lo].strip()), int(r[a]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--acs", default="auto", help="last year of the ACS 5-year release, or 'auto' for the newest")
    ap.add_argument("--pep", default="auto", help="population estimates vintage, or 'auto' for the newest")
    ap.add_argument("--gaz", type=int, default=2024, help="gazetteer year for tract locations (2020 tracts last the decade)")
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache"))
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    a.acs = latest_year(a.acs, lambda y: ACS_URL.format(y=y, t="b19013"))
    a.pep = latest_year(a.pep, lambda y: PEP_URL.format(y=y))
    print(f"Using ACS {a.acs - 4}–{a.acs} and population estimates vintage {a.pep}", file=sys.stderr)

    print("ACS tables…", file=sys.stderr)
    acs_t, acs_c = read_acs(a.acs, a.cache)
    print("Tract locations…", file=sys.stderr)
    gaz = read_gazetteer(a.gaz, a.cache)
    print("Population estimates…", file=sys.stderr)
    pep = read_pep(a.pep, a.cache)
    print("Zillow…", file=sys.stderr)
    zhvi, zhvi_m = read_zillow(ZHVI_URL, a.cache, "zhvi_county.csv", {"g1": 12, "g5": 60})
    zori, zori_m = read_zillow(ZORI_URL, a.cache, "zori_county.csv", {"g1": 12, "g3": 36})
    zhvi_z, _ = read_zillow(ZHVI_ZIP_URL, a.cache, "zhvi_zip.csv", {"g1": 12, "g5": 60}, zip_level=True)
    zori_z, _ = read_zillow(ZORI_ZIP_URL, a.cache, "zori_zip.csv", {"g1": 12, "g3": 36}, zip_level=True)
    print("Building permits…", file=sys.stderr)
    permits, permits_m = read_permits(a.cache)
    print("ZIP locations…", file=sys.stderr)
    zcta = read_zcta(a.gaz, a.cache)
    atlas = fetch(ATLAS_URL, a.cache, "us-atlas-3.0.1-counties-10m.json")
    with open(atlas, "rb") as f:
        if hashlib.sha256(f.read()).hexdigest() != ATLAS_SHA256:
            sys.exit("The county outlines file doesn't match the pinned release. Not writing data.")

    def ival(v):
        return None if v is None else int(round(v))

    # Column layout (one array per field) compresses about 25% smaller than rows.
    # c: index into the county list; lat/lon: degrees x 10,000; area_k: land area in thousands of square meters.
    cty_list, cty_idx = [], {}
    cols = {k: [] for k in ["c", "lat", "lon", "area_k"] + ORDER}
    missing = 0
    for gid, rec in sorted(acs_t.items()):
        pt = gaz.get(gid)
        if not pt or not rec.get("pop"):
            missing += 0 if rec.get("pop") == 0 else 1
            continue
        lat, lon, area = pt
        fips = gid[:5]
        if fips not in cty_idx:
            cty_idx[fips] = len(cty_list)
            cty_list.append(fips)
        cols["c"].append(cty_idx[fips])
        cols["lat"].append(round(lat * 1e4))
        cols["lon"].append(round(lon * 1e4))
        cols["area_k"].append(max(1, round(area / 1000)))
        for k in ORDER:
            cols[k].append(ival(rec.get(k)))
    rows = cols["c"]
    tracts = {"acs": f"{a.acs - 4}–{a.acs}", "n": len(rows), "counties": cty_list, "cols": cols}

    counties = {}
    for fips in sorted(set(acs_c) | set(pep)):
        c = {k: ival(v) for k, v in acs_c.get(fips, {}).items()}
        p = pep.get(fips)
        if p:
            c.update({k: p[k] for k in ("name", "popg", "popg1", "dmig")})
            c["pep"] = p["pep"]
        if fips in zhvi:
            z = zhvi[fips]; c.update({"zhvi": z["v"], "zhvi1": z["g1"], "zhvi5": z["g5"], "metro": z["metro"]})
        if fips in zori:
            z = zori[fips]; c.update({"zori": z["v"], "zori1": z["g1"], "zori3": z["g3"]})
            c.setdefault("metro", z["metro"])
        if fips in permits:
            c.update(permits[fips])
        counties[fips] = {k: v for k, v in c.items() if v is not None}
    meta = {"acs": f"{a.acs - 4}–{a.acs}", "pep": a.pep, "zhvi": zhvi_m, "zori": zori_m, "permits": permits_m}

    # ZIPs with any Zillow series, placed at the ZIP code tabulation area's internal point.
    zcols = {k: [] for k in ("zip", "lat", "lon", "area_k", "zhvi", "zhvi1", "zhvi5", "zori", "zori1", "zori3")}
    for z in sorted(set(zhvi_z) | set(zori_z)):
        pt = zcta.get(z)
        if not pt:
            continue
        hv, rt = zhvi_z.get(z, {}), zori_z.get(z, {})
        for k, v in (("zip", z), ("lat", round(pt[0] * 1e4)), ("lon", round(pt[1] * 1e4)), ("area_k", max(1, round(pt[2] / 1000))),
                     ("zhvi", hv.get("v")), ("zhvi1", hv.get("g1")), ("zhvi5", hv.get("g5")),
                     ("zori", rt.get("v")), ("zori1", rt.get("g1")), ("zori3", rt.get("g3"))):
            zcols[k].append(v)
    zips = {"n": len(zcols["zip"]), "cols": zcols}

    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, "tracts.json"), "w") as f:
        json.dump(tracts, f, separators=(",", ":"))
    with open(os.path.join(DATA, "counties.json"), "w") as f:
        json.dump({"meta": meta, "counties": counties}, f, separators=(",", ":"))
    with open(os.path.join(DATA, "zips.json"), "w") as f:
        json.dump(zips, f, separators=(",", ":"))
    with open(atlas) as src, open(os.path.join(DATA, "counties-10m.json"), "w") as dst:
        dst.write(src.read())
    print(f"Wrote {len(rows):,} tracts ({missing} without a location), {len(counties):,} counties, {zips['n']:,} ZIPs. {meta}", file=sys.stderr)


if __name__ == "__main__":
    main()
