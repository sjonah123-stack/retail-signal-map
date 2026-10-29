# Retail Signal

A site-selection map for multifamily and single-family investors. It scores every part of the US by which site-selective chains have chosen to open nearby (Costco, Trader Joe's, Whole Foods, Chick-fil-A, Life Time, CAVA and about 35 more), then layers neighborhood demographics, county growth and current market trends on top.

Chains like these spend heavily on site research before they sign a lease. Where several of them cluster, incomes, traffic and growth usually back it up. Where early movers have arrived but the big anchors haven't yet, prices often haven't caught up.

## What it does

- **Investment lenses.** Multifamily, Single-family, Retail signal and Frontier each set a chain weighting and starting filters for that buyer. Everything stays adjustable.
- **Top areas.** A ranked list of the best-scoring areas, filtered by household income, price-to-income, renter share, county population growth, rent growth and apartment pipeline. Rank by signal score, population growth, domestic migration, rent growth, income, affordability, gross yield or least new supply. Export the list to CSV.
- **Site reports.** Click anywhere (or search an address) for a report on that spot: signal score and national percentile; trade-area rent, renter share, rental vacancy, apartment share, income, home value, price-to-income, gross yield, age of housing, education and density; the ZIP code's Zillow rent and home value trends; county population growth, domestic migration, building permits and apartment pipeline; and every chain nearby with Google Maps links to confirm each store. Reports print cleanly to PDF.
- **Compare.** Pin up to four sites from their reports and see them side by side, with the best value in each row highlighted. Export to CSV or print.
- **Score a deal list.** Upload a CSV of properties (addresses or coordinates). Every site is located, scored under the current lens and ranked, with your own columns (units, price) carried through to the export. The list stays in your browser.
- **Housing supply.** Census building permits by county: apartment and single-family units permitted, and the apartment pipeline (three years of 5+ unit permits as a share of existing apartment stock) to flag supply risk.
- **Map overlays.** Color the map by any neighborhood, county or ZIP metric. Neighborhood metrics draw by census tract when zoomed in and by county when zoomed out; Zillow trends draw by ZIP code over county shading.
- **Shareable links.** The address bar always holds the current view, lens, filters and open report. Copy link and send it.
- **Announced openings.** Coming-soon stores from company lists and local reporting, shown on the map and optionally counted in scores. Add your own.
- **Your own chains.** Add any brand as a new signal or inside an existing one, then load its stores from OpenStreetMap, an All the Places file or a CSV.

## Data

| What | Source | Level | Updated |
|---|---|---|---|
| Store locations (~38,600) | [All the Places](https://www.alltheplaces.xyz/) (CC0) and [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL) | Store | Snapshot of Oct 28, 2026 |
| Income, home value, rent, tenure, vacancy, units in structure, year built, education | Census American Community Survey 5-year, 2020–2024 | Census tract and county | Yearly (December) |
| Population, domestic migration | Census population estimates, vintage 2025 | County | Yearly (spring) |
| Typical home value and rent, 1/3/5-year change | Zillow Home Value Index and Zillow Observed Rent Index | County and ZIP code | Monthly |
| Units permitted, single-family and 5+ unit buildings | Census Building Permits Survey, 2023–2025 | County | Yearly (spring) |

Trade-area figures combine the census tracts centered within the radius, weighted by households. They're averages of tract medians: a solid screen, not a true median.

ZIP figures come from the nearest ZIP code with Zillow data. Building permits use full calendar years only: the Census's monthly county files count just the places that reported that month, which can make a county look like its permits collapsed.

Census tracts in Connecticut use the state's new planning regions; the county outlines on the map still show the old counties, so Connecticut's county shading is blank while its tract data works normally.

## Running it locally

It's a static site with no build step. Browsers won't load the data files from a page opened straight from disk, so serve the folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Updating the data

**Market data** (Census and Zillow) refreshes itself: the *Refresh market data* workflow runs on the 20th of each month, rebuilds `data/`, and redeploys when anything changed. It picks up new Census releases automatically. To run it by hand:

```bash
python3 scripts/build_market_data.py
```

It downloads about 400 MB of public files into `.cache/` the first time.

**Store data** is a snapshot. To refresh it, open the site, go to Data, then either *Refresh from OpenStreetMap* or *Open files* with the latest [All the Places](https://www.alltheplaces.xyz/) brand files, and click *Save data*. Then turn the saved file into the bundled data and commit:

```bash
python3 scripts/import_stores.py ~/Downloads/retail-signal-data-YYYY-MM-DD.json
```

## Hosting

The *Deploy site* workflow publishes to GitHub Pages on every push to `main`. In the repository's Settings → Pages, set Source to **GitHub Actions** once.

Address search and deal-list lookups use OpenStreetMap's free Nominatim service, which allows light use (about one request per second). Deal lists are capped at 100 lookups per upload and cached in the browser. If the site gets heavy traffic, swap in a paid geocoder in `geocode()` in `assets/app.js` and add its host to the Content Security Policy in `index.html`.

## Security

See [SECURITY.md](SECURITY.md) for what's in place and how to report a problem privately.

## Project layout

```
index.html                 page shell
assets/app.css             styles (light and dark)
assets/app.js              map, scoring, lenses, reports
data/stores.json           bundled store locations
data/upcoming.json         announced openings
data/tracts.json           census tract data (column layout)
data/counties.json         county Census, population, permits and Zillow data
data/zips.json             ZIP code Zillow data (column layout)
data/counties-10m.json     county outlines (us-atlas)
scripts/                   data builders
.github/workflows/         deploy and monthly data refresh
```
