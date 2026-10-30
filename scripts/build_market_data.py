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
  - County jobs and wages, latest quarter and change over the year (BLS QCEW)
  - Jobs located in each tract (Census LEHD LODES workplace file)
  - Natural hazard risk and expected building losses by tract and county (FEMA National Risk Index)
  - For-sale listings: inventory, days on market, price cuts by ZIP and county (Realtor.com research data)
  - Apartment vacancy and concessions by county and metro (Apartment List research data)
  - County to metro area (NBER copy of the Census CBSA delineation)
  - The city, town or community each tract is in (Census places and 2020 block assignment files)

Usage:
  python3 scripts/build_market_data.py [--acs auto] [--pep auto] [--cache .cache]

Writes data/tracts.json, data/counties.json, data/zips.json and data/counties-10m.json.
"""
import argparse, csv, gzip, hashlib, io, json, os, re, sys, urllib.parse, urllib.request, zipfile
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

ACS_URL = "https://www2.census.gov/programs-surveys/acs/summary_file/{y}/table-based-SF/data/5YRData/acsdt5y{y}-{t}.dat"
GAZ_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{y}_Gazetteer/{y}_Gaz_tracts_national.zip"
GAZ_ZCTA_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{y}_Gazetteer/{y}_Gaz_zcta_national.zip"
GAZ_PLACE_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{y}_Gazetteer/{y}_Gaz_place_national.zip"
BAF_URL = "https://www2.census.gov/geo/docs/maps-data/data/baf2020/BlockAssign_ST{fips}_{st}.zip"
PEP_URL = "https://www2.census.gov/programs-surveys/popest/datasets/2020-{y}/counties/totals/co-est{y}-alldata.csv"
BPS_URL = "https://www2.census.gov/econ/bps/County/co{code}.txt"   # code: yyyya (annual) or yymmy (year to date)
ZILLOW = "https://files.zillowstatic.com/research/public_csvs/"
ZHVI_URL = ZILLOW + "zhvi/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
ZORI_URL = ZILLOW + "zori/County_zori_uc_sfrcondomfr_sm_month.csv"
ZHVI_ZIP_URL = ZILLOW + "zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
ZORI_ZIP_URL = ZILLOW + "zori/Zip_zori_uc_sfrcondomfr_sm_month.csv"
QCEW_URL = "https://data.bls.gov/cew/data/api/{y}/{q}/industry/10.csv"   # all industries, every area
LODES_URL = "https://lehd.ces.census.gov/data/lodes/LODES8/{st}/wac/{st}_wac_S000_JT00_{y}.csv.gz"
NRI_URL = "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_{level}/FeatureServer/0/query"
RDC_URL = "https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_{level}.csv"
APTLIST_PAGE = "https://www.apartmentlist.com/research/category/data-rent-estimates"
CBSA_URL = "https://data.nber.org/cbsa-csa-fips-county-crosswalk/2023/cbsa2fipsxw_2023.csv"
STATES = ("al ak az ar ca co ct de dc fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa "
          "ri sc sd tn tx ut vt va wa wv wi wy").split()
STATE_FIPS = dict(zip(STATES + ["pr"], "01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 "
                     "35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56 72".split()))
PLACE_KIND = re.compile(r"\s+(city and borough|consolidated government|metropolitan government|metro government|unified government|urban county|"
                        r"city|town|village|borough|CDP|municipality|comunidad|zona urbana|plantation|township)$")
# National Risk Index hazards, in the order the map's codes refer to them.
HAZARDS = ["HRCN", "CFLD", "IFLD", "WFIR", "TRND", "HAIL", "SWND", "ERQK", "WNTW", "HWAV", "CWAV", "LNDS", "LTNG", "ISTM", "AVLN", "TSUN", "VLCN"]
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
    "tax":   ("b25103", [1]),          # median real estate taxes paid, owner-occupied
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


def read_qcew(cache):
    """Covered jobs and average weekly wage per county for the latest quarter BLS has published, with the change
    from the same quarter a year earlier (so seasonal swings cancel out)."""
    today = date.today()
    quarters = [(y, q) for y in (today.year, today.year - 1) for q in (4, 3, 2, 1)]
    y, q = next(((y, q) for y, q in quarters if (y, q) <= (today.year, (today.month - 1) // 3 + 1) and exists(QCEW_URL.format(y=y, q=q))), (None, None))
    if not y:
        sys.exit("Couldn't find a recent QCEW quarter.")
    path = fetch(QCEW_URL.format(y=y, q=q), cache, f"qcew-{y}q{q}.csv")
    out = {}
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            # agglvl 70: county, all industries, all ownerships. Disclosure "N" means suppressed.
            if r["agglvl_code"] != "70" or r["own_code"] != "0" or r["disclosure_code"] == "N":
                continue
            emp = num(r["month3_emplvl"])
            if not emp:
                continue
            out[r["area_fips"]] = {"emp": int(emp), "empg1": num_s(r["oty_month3_emplvl_pct_chg"]),
                                   "wage": num(r["avg_wkly_wage"]), "wageg1": num_s(r["oty_avg_wkly_wage_pct_chg"])}
    return out, f"{y} Q{q}"


def num_s(v):
    """A signed number (num() treats negatives as missing, which suits ACS but not changes)."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def read_lodes(cache):
    """Jobs located in each tract (all jobs, all workers), from each state's newest LODES workplace file."""
    out, years = {}, set()
    newest = date.today().year - 1
    for st in STATES:
        for y in range(newest, newest - 5, -1):
            if exists(LODES_URL.format(st=st, y=y)):
                break
        else:
            print(f"  no LODES file for {st}", file=sys.stderr)
            continue
        years.add(y)
        path = fetch(LODES_URL.format(st=st, y=y), cache, f"lodes-{st}-{y}.csv.gz")
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                t = r["w_geocode"][:11]   # block -> tract
                out[t] = out.get(t, 0) + int(r["C000"])
    return out, f"{min(years)}" if len(years) == 1 else f"{min(years)}–{max(years)}"


def read_nri(cache, level, key):
    """FEMA National Risk Index: composite risk score (a national percentile, 0–100), expected annual building
    losses from natural hazards per $1M of building value, and the hazard that drives most of those losses."""
    fields = ["NRI_VER", key, "RISK_SCORE", "BUILDVALUE", "EAL_VALB"] + [h + "_EALB" for h in HAZARDS]
    out, ver, offset = {}, None, 0
    while True:
        q = urllib.parse.urlencode({"where": "1=1", "outFields": ",".join(fields), "returnGeometry": "false",
                                    "orderByFields": "OBJECTID", "resultOffset": offset, "resultRecordCount": 2000, "f": "json"})
        path = fetch(NRI_URL.format(level=level) + "?" + q, cache, f"nri-{level}-{offset}.json")
        with open(path) as f:
            page = json.load(f)
        if "features" not in page:
            os.remove(path)
            sys.exit(f"National Risk Index query failed: {str(page)[:200]}")
        for feat in page["features"]:
            a = feat["attributes"]
            ver = ver or a.get("NRI_VER")
            bv, loss = a.get("BUILDVALUE") or 0, a.get("EAL_VALB")
            losses = [(a.get(h + "_EALB") or 0, i) for i, h in enumerate(HAZARDS)]
            top = max(losses)
            out[a[key]] = {"risk": None if a.get("RISK_SCORE") is None else round(a["RISK_SCORE"], 1),
                           "lossr": round(loss / bv * 1e6) if bv and loss is not None else None,
                           "haz": top[1] if top[0] > 0 else None}
        if not page.get("exceededTransferLimit") and len(page["features"]) < 2000:
            break
        offset += 2000
    return out, ver


def read_rdc(cache, level, key):
    """Realtor.com for-sale listings for the latest month: median days on market, active listings and listing
    price change over the year, and the share of listings with a price cut."""
    path = fetch(RDC_URL.format(level=level), cache, f"rdc-{level.lower()}.csv")
    out, month = {}, None
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if not r.get("month_date_yyyymm", "").isdigit():
                continue   # the files end with a notes row
            month = month or r["month_date_yyyymm"]
            k = r[key].zfill(5)
            pct = lambda c: None if num_s(r.get(c)) is None else round(num_s(r[c]) * 100, 1)
            out[k] = {"dom": num(r["median_days_on_market"]), "invg": pct("active_listing_count_yy"),
                      "lpg": pct("median_listing_price_yy"), "prc": pct("price_reduced_share"),
                      "n": int(num(r["active_listing_count"]) or 0)}
    return out, f"{month[:4]}-{month[4:]}" if month else None


def read_aptlist(cache):
    """Apartment List's vacancy index and concession rate (share of listings offering one) for the latest month,
    by county where it publishes one and by metro area (CBSA code) otherwise."""
    page = fetch(APTLIST_PAGE, cache, "aptlist.html")
    with open(page, encoding="utf-8", errors="replace") as f:
        html = f.read()
    out, month = {"county": {}, "metro": {}}, None
    for kind, field in (("Vacancy_Index", "avac"), ("Concession_Rates", "conc")):
        m = re.search(r"//[a-z]+\.ctfassets\.net/[\w/]+/Apartment_List_%s_(\d{4})_(\d{2})\.csv" % kind, html)
        if not m:
            print(f"  Apartment List {kind} file not found on the page", file=sys.stderr)
            continue
        path = fetch("https:" + m.group(0), cache, f"aptlist-{kind}-{m.group(1)}{m.group(2)}.csv")
        with open(path, encoding="utf-8") as f:
            rows = csv.reader(f)
            head = next(rows)
            months = [i for i, h in enumerate(head) if re.fullmatch(r"\d{4}_\d{2}", h)]
            t, code = head.index("location_type"), head.index("location_fips_code")
            for r in rows:
                level = {"County": "county", "Metro": "metro"}.get(r[t])
                vals = [(head[i], num_s(r[i])) for i in months if r[i]]
                if not level or not vals:
                    continue
                last, v = vals[-1]
                rec = out[level].setdefault(r[code].zfill(5), {})
                rec[field] = round(v * 100, 1)
                if field == "avac":   # change in the vacancy rate over the year, in percentage points
                    by = dict(vals)
                    y0 = f"{int(last[:4]) - 1}{last[4:]}"
                    if by.get(y0) is not None:
                        rec["avacg"] = round((v - by[y0]) * 100, 1)
                month = max(month or "", last.replace("_", "-"))
    return out, month


def read_places(year, cache):
    """Census places (incorporated cities and towns, and unincorporated communities): GEOID -> (name, state)."""
    path = fetch(GAZ_PLACE_URL.format(y=year), cache, f"gaz{year}_place.zip")
    out = {}
    with zipfile.ZipFile(path) as z:
        with z.open(z.namelist()[0]) as raw:
            rows = csv.reader(io.TextIOWrapper(raw, encoding="latin-1"), delimiter="\t")
            head = [h.strip() for h in next(rows)]
            g, n, st = (head.index(k) for k in ("GEOID", "NAME", "USPS"))
            for r in rows:
                name = re.sub(r"\s*\(balance\)$", "", r[n].strip())
                out[r[g].strip()] = (PLACE_KIND.sub("", name), r[st].strip())
    return out


def read_tract_places(cache):
    """The place most of each tract's blocks fall in, from the Census 2020 block assignment files, when that's at least
    a quarter of them (otherwise the tract is mostly unincorporated)."""
    out = {}
    for st, fips in STATE_FIPS.items():
        path = fetch(BAF_URL.format(fips=fips, st=st.upper()), cache, f"baf2020-{st}.zip")
        tally = {}
        with zipfile.ZipFile(path) as z:
            with z.open(next(n for n in z.namelist() if n.endswith("_INCPLACE_CDP.txt"))) as raw:
                for line in io.TextIOWrapper(raw, encoding="latin-1"):
                    block, _, place = line.strip().partition("|")
                    if block[:1].isdigit():
                        t = tally.setdefault(block[:11], {})
                        t[place] = t.get(place, 0) + 1
        for tract, c in tally.items():
            place, n = max(((p, k) for p, k in c.items() if p), key=lambda x: x[1], default=(None, 0))
            if place and n * 4 >= sum(c.values()):
                out[tract] = fips + place
    return out


def read_cbsa(cache):
    """County -> (metro or micro area code, its title)."""
    path = fetch(CBSA_URL, cache, "cbsa2fipsxw_2023.csv")
    out = {}
    with open(path, encoding="latin-1") as f:
        for r in csv.DictReader(f):
            if r.get("cbsacode") and r.get("fipsstatecode"):
                out[r["fipsstatecode"].zfill(2) + r["fipscountycode"].zfill(3)] = (r["cbsacode"], r["cbsatitle"])
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
    print("Jobs…", file=sys.stderr)
    qcew, qcew_m = read_qcew(a.cache)
    lodes, lodes_m = read_lodes(a.cache)
    print("Natural hazard risk…", file=sys.stderr)
    nri_t, nri_v = read_nri(a.cache, "Census_Tracts", "TRACTFIPS")
    nri_c, _ = read_nri(a.cache, "Counties", "STCOFIPS")
    print("Listings, apartment vacancy and concessions…", file=sys.stderr)
    rdc_z, rdc_m = read_rdc(a.cache, "Zip", "postal_code")
    rdc_c, _ = read_rdc(a.cache, "County", "county_fips")
    apt, apt_m = read_aptlist(a.cache)
    cbsa = read_cbsa(a.cache)
    print("Places…", file=sys.stderr)
    places, tract_place = read_places(a.gaz, a.cache), read_tract_places(a.cache)
    atlas = fetch(ATLAS_URL, a.cache, "us-atlas-3.0.1-counties-10m.json")
    with open(atlas, "rb") as f:
        if hashlib.sha256(f.read()).hexdigest() != ATLAS_SHA256:
            sys.exit("The county outlines file doesn't match the pinned release. Not writing data.")

    def ival(v):
        return None if v is None else int(round(v))

    # Column layout (one array per field) compresses about 25% smaller than rows.
    # c: index into the county list; lat/lon: degrees x 10,000; area_k: land area in thousands of square meters.
    # jobs: jobs located in the tract. risk: FEMA risk score; lossr: expected annual building losses per $1M of
    # building value; haz: index into HAZARDS of the costliest hazard.
    cty_list, cty_idx = [], {}
    cols = {k: [] for k in ["c", "lat", "lon", "area_k"] + ORDER + ["jobs", "risk", "lossr", "haz", "pl"]}
    place_list, place_idx = [], {}
    missing = 0
    # LODES still codes Connecticut tracts under the old counties; the tract numbers match the planning-region codes.
    ct = {t[5:]: v for t, v in lodes.items() if t.startswith("09")}
    jobs_at = lambda gid: lodes.get(gid, ct.get(gid[5:]) if gid.startswith("09") else None)
    ct_place = {t[5:]: v for t, v in tract_place.items() if t.startswith("09")}   # the same for the 2020 block files
    for gid, rec in sorted(acs_t.items()):
        pt = gaz.get(gid)
        if not pt or not (rec.get("pop") or jobs_at(gid)):   # job centers with no residents still count for jobs
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
        n = nri_t.get(gid, {})
        cols["jobs"].append(jobs_at(gid))
        cols["risk"].append(ival(n.get("risk")))
        cols["lossr"].append(n.get("lossr"))
        cols["haz"].append(n.get("haz"))
        pg = tract_place.get(gid) or (ct_place.get(gid[5:]) if gid.startswith("09") else None)
        if pg in places and pg not in place_idx:
            place_idx[pg] = len(place_list)
            place_list.append(list(places[pg]))
        cols["pl"].append(place_idx.get(pg))
    rows = cols["c"]
    # pl: index into places, the [name, state] of the city, town or community the tract is mostly in.
    tracts = {"acs": f"{a.acs - 4}–{a.acs}", "n": len(rows), "counties": cty_list, "places": place_list, "cols": cols}

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
        if fips in qcew:
            c.update(qcew[fips])
        if fips in nri_c:
            c.update({k: (ival(v) if k == "risk" else v) for k, v in nri_c[fips].items()})
        if fips in rdc_c:
            c.update({k: v for k, v in rdc_c[fips].items() if k != "n"})
        # Apartment List publishes some counties directly; the rest get their metro area's figures.
        cb = cbsa.get(fips)
        if cb:
            c["cbsa"], c["cbsaName"] = cb
        al = apt["county"].get(fips) or (apt["metro"].get(cb[0]) if cb else None)
        if al:
            c.update(al)
            c["alLevel"] = "county" if fips in apt["county"] else "metro"
        counties[fips] = {k: v for k, v in c.items() if v is not None}
    meta = {"acs": f"{a.acs - 4}–{a.acs}", "pep": a.pep, "zhvi": zhvi_m, "zori": zori_m, "permits": permits_m,
            "qcew": qcew_m, "lodes": lodes_m, "nri": nri_v, "hazards": HAZARDS, "rdc": rdc_m, "aptlist": apt_m}

    # ZIPs with any Zillow series, placed at the ZIP code tabulation area's internal point, with Realtor.com
    # listings figures where that ZIP has enough listings to read (Realtor.com's quality flag).
    zkeys = ("zip", "lat", "lon", "area_k", "zhvi", "zhvi1", "zhvi5", "zori", "zori1", "zori3", "dom", "invg", "lpg", "prc")
    zcols = {k: [] for k in zkeys}
    for z in sorted(set(zhvi_z) | set(zori_z)):
        pt = zcta.get(z)
        if not pt:
            continue
        hv, rt, ls = zhvi_z.get(z, {}), zori_z.get(z, {}), rdc_z.get(z, {})
        if ls.get("n", 0) < 10:   # a handful of listings makes the yearly change meaningless
            ls = {}
        for k, v in (("zip", z), ("lat", round(pt[0] * 1e4)), ("lon", round(pt[1] * 1e4)), ("area_k", max(1, round(pt[2] / 1000))),
                     ("zhvi", hv.get("v")), ("zhvi1", hv.get("g1")), ("zhvi5", hv.get("g5")),
                     ("zori", rt.get("v")), ("zori1", rt.get("g1")), ("zori3", rt.get("g3")),
                     ("dom", ival(ls.get("dom"))), ("invg", ls.get("invg")), ("lpg", ls.get("lpg")), ("prc", ls.get("prc"))):
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
