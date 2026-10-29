# Retail Signal

A site-selection map for multifamily and single-family investors. It scores every part of the US by which site-selective chains have chosen to open nearby (Costco, Trader Joe's, Whole Foods, Chick-fil-A, Life Time, CAVA and about 35 more), then layers neighborhood demographics, county growth and current market trends on top.

Chains like these spend heavily on site research before they sign a lease. Where several of them cluster, incomes, traffic and growth usually back it up. Where early movers have arrived but the big anchors haven't yet, prices often haven't caught up.

## What it does

- **Investment lenses.** Multifamily, Single-family, Retail signal and Frontier each set a chain weighting and starting filters for that buyer. Everything stays adjustable.
- **Top areas.** A ranked list of the best-scoring areas, filtered by household income, price-to-income, renter share, county population growth and rent growth. Rank by signal score, population growth, domestic migration, rent growth, income, affordability or gross yield.
- **Site reports.** Click anywhere (or search an address) for a report on that spot: signal score and national percentile; trade-area rent, renter share, rental vacancy, apartment share, income, home value, price-to-income, gross yield, age of housing, education and density; county population growth, domestic migration, and Zillow rent and home value trends; and every chain nearby with Google Maps links to confirm each store. Reports print cleanly to PDF.
- **Map overlays.** Color the map by any neighborhood or county metric. Neighborhood metrics draw by census tract when zoomed in and by county when zoomed out.
- **Shareable links.** The address bar always holds the current view, lens, filters and open report. Copy link and send it.
- **Announced openings.** Coming-soon stores from company lists and local reporting, shown on the map and optionally counted in scores. Add your own.
- **Your own chains.** Add any brand as a new signal or inside an existing one, then load its stores from OpenStreetMap, an All the Places file or a CSV.

## Data

| What | Source | Level | Updated |
|---|---|---|---|
| Store locations (~38,600) | [All the Places](https://www.alltheplaces.xyz/) (CC0) and [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL) | Store | Snapshot of Oct 28, 2026 |
| Income, home value, rent, tenure, vacancy, units in structure, year built, education | Census American Community Survey 5-year, 2020–2024 | Census tract and county | Yearly (December) |
| Population, domestic migration | Census population estimates, vintage 2025 | County | Yearly (spring) |
| Typical home value and rent, 1/3/5-year change | Zillow Home Value Index and Zillow Observed Rent Index | County | Monthly |

Trade-area figures combine the census tracts centered within the radius, weighted by households. They're averages of tract medians: a solid screen, not a true median.

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

Address search uses OpenStreetMap's free Nominatim service, which allows light use (about one search per second across all visitors). If the site gets heavy traffic, swap in a paid geocoder in `geocode()` in `assets/app.js`.

## Project layout

```
index.html                 page shell
assets/app.css             styles (light and dark)
assets/app.js              map, scoring, lenses, reports
data/stores.json           bundled store locations
data/upcoming.json         announced openings
data/tracts.json           census tract data (column layout)
data/counties.json         county Census, population and Zillow data
data/counties-10m.json     county outlines (us-atlas)
scripts/                   data builders
.github/workflows/         deploy and monthly data refresh
```
