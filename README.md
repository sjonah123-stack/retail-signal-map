# Retail Signal

**[Open the live map →](https://sjonah123-stack.github.io/retail-signal-map/)**  
https://sjonah123-stack.github.io/retail-signal-map/

Or jump straight to an example:

- [Multifamily site report for downtown Austin](https://sjonah123-stack.github.io/retail-signal-map/#lens=mf&map=11/30.27/-97.74&at=30.2672,-97.7431)
- [Single-family site report for Legacy West in Plano](https://sjonah123-stack.github.io/retail-signal-map/#lens=sf&map=11/33.08/-96.83&at=33.0778,-96.8267)
- [Dallas–Fort Worth rent growth by ZIP code](https://sjonah123-stack.github.io/retail-signal-map/#lens=mf&map=10/32.95/-96.85&color=zori1)
- [Apartment supply pipeline by county](https://sjonah123-stack.github.io/retail-signal-map/#lens=mf&map=4.5/38.6/-96.5&color=mfpipe)
- [Austin, Plano and Charlotte pinned for comparison](https://sjonah123-stack.github.io/retail-signal-map/#lens=mf&map=5%2F34.2000%2F-88.5000&cmp=30.26720%2C-97.74310%2CDowntown%2520Austin%7C33.07780%2C-96.82670%2CLegacy%2520West%252C%2520Plano%7C35.20870%2C-80.85710%2CUptown%2520Charlotte) (click **Compare** at the top)

A site-selection map for multifamily and single-family investors. It scores every part of the US by which site-selective chains have chosen to open nearby (Costco, Trader Joe's, Whole Foods, Chick-fil-A, Life Time, CAVA and about 35 more), then layers neighborhood demographics, county growth and current market trends on top.

Chains like these spend heavily on site research before they sign a lease. Where several of them cluster, incomes, traffic and growth usually back it up. Where early movers have arrived but the big anchors haven't yet, prices often haven't caught up.

## What it does

- **Investment lenses.** Multifamily, Single-family, Retail signal and Frontier each set a chain weighting and starting filters for that buyer. The weightings are fitted to what each buyer is looking for (see [How the weights were set](#how-the-weights-were-set)). Everything stays adjustable.
- **Top areas.** A ranked list of the best-scoring areas, filtered by household income, price-to-income, renter share, county population growth, rent growth, apartment pipeline, job growth and natural hazard risk. Multifamily and Single-family rank by an overall score, half signal score and half market momentum (see [Overall rank](#overall-rank)). Or rank by signal score, population growth, domestic migration, rent growth, job growth, income, affordability, gross yield, least new supply or lowest hazard risk. Export the list to CSV.
- **Site reports.** Click anywhere (or search an address) for a report on that spot, using the radius or a 10- or 20-minute drive as the trade area: signal score and national percentile; trade-area rent, renter share, rental vacancy, apartment share, income, home value, price-to-income, gross yield, age of housing, education, density and jobs located there; the ZIP code's Zillow rent and home value trends and Realtor.com for-sale listings (days on market, inventory change, price cuts); county population growth, domestic migration, jobs and wages, apartment vacancy and concessions, building permits and apartment pipeline; costs and risk (effective property tax rate, FEMA natural hazard risk and expected losses, and the state's rent control and eviction rules); and every chain nearby with Google Maps links to confirm each store. Reports print cleanly to PDF.
- **Compare.** Pin up to four sites from their reports and see them side by side, with the best value in each row highlighted. Export to CSV or print.
- **Score a deal list.** Upload a CSV of properties (addresses or coordinates). Every site is located, scored under the current lens and ranked, with your own columns (units, price) carried through to the export. The list stays in your browser.
- **Housing supply.** Census building permits by county: apartment and single-family units permitted, and the apartment pipeline (three years of 5+ unit permits as a share of existing apartment stock) to flag supply risk.
- **Map overlays.** Color the map by any neighborhood, county or ZIP metric, including job and wage growth, jobs per household, property tax rates, hazard risk, for-sale inventory and apartment vacancy and concessions. Neighborhood metrics draw by census tract when zoomed in and by county when zoomed out; Zillow and Realtor.com trends draw by ZIP code over county shading.
- **Shareable links.** The address bar always holds the current view, lens, filters and open report. Copy link and send it.
- **Announced openings.** Coming-soon stores from company lists and local reporting, shown on the map and optionally counted in scores. Add your own.
- **Your own chains.** Add any brand as a new signal or inside an existing one, then load its stores from OpenStreetMap, an All the Places file or a CSV.
- **Guided tour.** A short, skippable walkthrough of the above opens on a first visit; the Tour button replays it.

## Data

| What | Source | Level | Updated |
|---|---|---|---|
| Store locations (~43,400) | [All the Places](https://www.alltheplaces.xyz/) (CC0) and [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL) | Store | Monthly for 43 chains (All the Places run of Oct 17, 2026); see [Updating the data](#updating-the-data) |
| Store openings and closings, past 12 months | Comparing All the Places runs (`scripts/track_stores.py`) | Store | Monthly |
| Income, home value, rent, tenure, vacancy, units in structure, year built, education | Census American Community Survey 5-year, 2020–2024 | Census tract and county | Yearly (December) |
| Population, domestic migration | Census population estimates, vintage 2025 | County | Yearly (spring) |
| Typical home value and rent, 1/3/5-year change | Zillow Home Value Index and Zillow Observed Rent Index | County and ZIP code | Monthly |
| Units permitted, single-family and 5+ unit buildings | Census Building Permits Survey, 2023–2025 | County | Yearly (spring) |
| Jobs and average weekly wage, change over the year | [BLS Quarterly Census of Employment and Wages](https://www.bls.gov/cew/), 2026 Q1 | County | Quarterly (about 6 months behind) |
| Jobs located in each neighborhood | [Census LEHD LODES](https://lehd.ces.census.gov/data/), 2021–2023 by state (none for Alaska) | Census tract | Yearly |
| Property taxes (median taxes paid ÷ median home value) | Census American Community Survey 5-year, 2020–2024 | Census tract and county | Yearly (December) |
| Natural hazard risk score, expected building losses, costliest hazard | [FEMA National Risk Index](https://hazards.fema.gov/nri/), December 2025 release | Census tract and county | Irregular |
| For-sale listings: days on market, inventory change, price cuts | [Realtor.com research data](https://www.realtor.com/research/data/) | ZIP code and county | Monthly |
| Apartment vacancy and concessions | [Apartment List research data](https://www.apartmentlist.com/research/category/data-rent-estimates) | County where published, else metro | Monthly |
| Area names: the city, town or community each neighborhood is mostly in | Census places (Gazetteer) and 2020 block assignment files | Census tract | With Census releases |
| Rent control, just-cause eviction and notice before filing for unpaid rent | Researched from statutes, state agencies, the NMHC 2026 chart and law firm summaries, with sources per state in `data/landlord.json` | State | By hand; as of Oct 30, 2026 |

Trade-area figures combine the census tracts centered within the radius, weighted by households. They're averages of tract medians: a solid screen, not a true median.

ZIP figures come from the nearest ZIP code with Zillow data. Building permits use full calendar years only: the Census's monthly county files count just the places that reported that month, which can make a county look like its permits collapsed.

Census tracts in Connecticut use the state's new planning regions; the county outlines on the map still show the old counties, so Connecticut's county shading is blank while its tract data works normally.

## How the weights were set

Each preset is fitted to a goal for its buyer, then checked against it. The unit is the census tract: about 66,000 tracts with a signal nearby, each measured over the same 5-mile trade area the site report uses.

1. **A goal for each preset**, averaged from standardized measures, among the areas the lens's starting filters keep:
   - **Multifamily:** high rents and college-educated adults (half), plus rent growth, net domestic migration and population growth (half). Areas where 30%+ of households rent, in counties that are still growing.
   - **Single-family:** incomes, homeownership, newer homes, home-value growth, population growth and migration. Areas with $65K+ incomes, homes under 5× income and 3%+ county growth.
   - **Affluent:** incomes, home values, rents and education. **High-end only:** the same, among $100K+ areas.
   - **Growth suburbs:** population growth, migration, home-value growth and newer homes, outside dense cores.
2. **What each chain group adds.** A regression of the goal on which groups have a store within 5 miles, compared within each state (so a regional chain isn't credited with its region's growth) and holding every other group fixed. A group counts only if its direction held in both halves of the country.
3. **Weights.** The strongest groups get 3×, then 2× and 1×. Chains near almost every suburb (Starbucks, Target, Chick-fil-A, Home Depot and Lowe's) mostly separate towns from the countryside, so they're off in the investor presets.
4. **Regional reach.** Regional grocers (H-E-B, Publix, Wegmans) predict well, but each operates in only a few states. At 3× they pushed every Western and Midwestern market out of Multifamily's top 5%, so they count 1× there. The final weights keep the top-scoring areas' regional mix close to where each goal is actually highest.

How well each preset ranks areas against its goal (rank correlation; 1 would be a perfect ranking):

| Preset | Before | After | Counts most now |
|---|---|---|---|
| Multifamily | 0.43 | 0.50 | Premium preschools, Life Time, Trader Joe's |
| Single-family | −0.13 | 0.06 | Premium preschools, Life Time |
| Affluent | 0.62 | 0.64 | Trader Joe's, then premium preschools, Life Time, Whole Foods, luxury fitness, CAVA and sweetgreen |
| High-end only | 0.45 | 0.46 | Luxury fitness, Whole Foods |
| Growth suburbs | 0.13 | 0.26 | Premium preschools, then regional grocers, Dutch Bros, Whataburger, In-N-Out and Wawa |

Frontier's roles were checked the same way. Early movers should be chains whose areas grow faster than the rest of their state without being richer yet; late anchors mark areas that are already well-off. Chick-fil-A and First Watch fit neither, premium preschools turned out to be the strongest sign of affluence (so they're now a late anchor), and ALDI is the clearest early mover. With the new roles, qualifying areas are growing a bit faster than the rest of their state (+0.33 SD, was +0.30) and are cheaper relative to it (home prices 0.75 years of income below the state's typical ratio, was 0.61). Fewer areas qualify: 2,292 tracts in 25 states, down from 3,490 in 32.

What the fit showed:

- **Chain clusters mark proven demand, not momentum.** In renter areas, more chains went with slower recent rent growth and in-migration under every weighting tried. The Multifamily score finds strong renter areas; use the rent change, county growth and apartment pipeline filters for momentum.
- **Chains are a weak guide for single-family** once the lens's filters apply. The old weights ranked areas slightly backwards, because everyday chains mark older, built-out suburbs, and the newer, faster-growing ones often don't have them yet.
- **Premium preschools (Primrose, Goddard) are the strongest single signal in the data**, ahead of Life Time and Trader Joe's.
- **California is underrated** by every weighting tried: its home values and rents top the national affluence measures, but premium preschools, Life Time and the regional grocers are scarce there.

### Overall rank

Because chains mark proven demand but not momentum, Multifamily and Single-family rank Top areas, deal lists and comparisons on an overall score out of 100: half the signal score (as a share of its maximum) and half market momentum. Momentum averages where the area ranks against the rest of the US, from 0 to 100, on:

| Multifamily | Single-family |
|---|---|
| Net domestic migration, 2021–25 (county) | Net domestic migration, 2021–25 (county) |
| Population growth last year (county) | Population growth last year (county) |
| Job growth over the year (county) | Job growth over the year (county) |
| Openings by the lens's chains within the radius, past 12 months (ranked against all scored areas) | Same |
| Rent change, 1 year (ZIP, else county) | Home value change, 1 year (ZIP, else county) |
| Apartment pipeline (county; less new supply ranks higher) | For-sale listings change, 1 year (county; fewer listings ranks higher) |

County measures are ranked against every county weighted by population, so 50 is where a typical American lives; ZIP measures against every ZIP with Zillow data. With chains alone, 16 Multifamily areas tied at the maximum; the overall score spreads the top 25 from 88 down to 73. Each cluster of nearby areas is represented by its best-ranked spot, not its busiest. The map's shading is still the signal score. A 1-year ZIP change can be noisy, so the site report lists each part's percentile.

To recheck the weights after a data refresh (it prints each group's fit next to its current weight, and each preset's ranking quality):

```bash
node scripts/check_lens_weights.mjs
```

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

**Store data** refreshes itself too: the *Refresh store data* workflow runs on the 5th of each month. For 43 chains it takes the stores from the newest finished [All the Places](https://www.alltheplaces.xyz/) run, compares them with the run the data last used, records stores that opened or closed in `data/changes.json`, and redeploys. The map shows the past 12 months of those as rings around store dots (green for opened, gray for closed), in site reports, as an "openings" chip and ranking in Top areas, and as one part of market momentum. To run it by hand:

```bash
python3 scripts/track_stores.py
```

All the Places scrapes each chain's own store locator, so a change can also mean a scraper broke, started covering more stores, or moved them on the map. The tracker leaves a chain as it was when its count falls more than 15%; refreshes it without recording anything when its count jumps more than a quarter, or when one step shows more openings or closings than a real chain makes (over 10% or 6% of its stores, or over 1% each at once); counts an opening and a closing within 1.5 miles of each other as a move; and cancels a closing when the store comes back. What's left is a good guide, not a ledger: a store counts as opened in the quarter or month the chain's locator first listed it, which can run ahead of the actual opening or behind it. The first year was backfilled from quarterly runs (Oct 2025 to Oct 2026) with `--backfill 12`.

Not tracked: Erewhon, Central Market, Alo Yoga, Aritzia, RH and Crate & Barrel, which All the Places doesn't cover (they come from OpenStreetMap, where a newly mapped store isn't a newly opened one), and 7 Brew, whose collector no longer lists most stores' addresses.

To patch a chain by hand, `scripts/refresh_brands.py` replaces just its stores with a chosen source: an All the Places spider (`atp:spider`, or `atp:spider@run` to use an earlier run when a spider has broken), a GeoJSON file (`file:path`), or OpenStreetMap (`osm`, which falls back to QLever's copy of OpenStreetMap when the Overpass servers are down). Join sources with `+` to fill one's gaps from another. Stores listed without coordinates are located from their addresses with the Census Bureau's batch geocoder.

```bash
python3 scripts/refresh_brands.py "Erewhon=osm"
```

Chains not on the monthly All the Places refresh, and where their stores come from:

| Chains | Source |
|---|---|
| Lowe's | All the Places, Jul 2026 run; the tracker keeps it until the collector recovers (it has returned almost nothing since) |
| 7 Brew | All the Places, Oct 17, 2026 run, with addresses read from each store's page URL and located; plus OpenStreetMap stores more than half a mile from any of those |
| Erewhon, Central Market (Texas only), Alo Yoga, Aritzia, RH, Crate & Barrel | OpenStreetMap through QLever, Oct 29, 2026 |

OpenStreetMap is thin for some of these: Alo Yoga and Aritzia show about a third to a half of their US stores, so a missing one there means less than a missing Lowe's. `data/store_runs.json` records which run and collector every tracked chain last came from.

## Hosting

The *Deploy site* workflow publishes to GitHub Pages on every push to `main`. In the repository's Settings → Pages, set Source to **GitHub Actions** once. `scripts/build_site.sh` assembles the published copy and stamps the script, stylesheet and data URLs with the commit, so visitors never pair a new page with files their browser cached from an older deploy.

Drive-time trade areas come from the FOSSGIS public [Valhalla](https://valhalla1.openstreetmap.de) server on OpenStreetMap roads (no traffic), one request per spot and drive time, kept for the session. It's meant for light use; with heavy traffic, point `VALHALLA` in `assets/app.js` at a keyed routing service and add its host to the Content Security Policy.

Address search and deal-list lookups use OpenStreetMap's free Nominatim service, which allows light use (about one request per second). Deal lists are capped at 100 lookups per upload and cached in the browser. If the site gets heavy traffic, swap in a paid geocoder in `geocode()` in `assets/app.js` and add its host to the Content Security Policy in `index.html`.

## Security

See [SECURITY.md](SECURITY.md) for what's in place and how to report a problem privately.

## Project layout

```
index.html                 page shell
assets/app.css             styles (light and dark)
assets/app.js              map, scoring, lenses, reports
data/stores.json           bundled store locations
data/changes.json          store openings and closings found by comparing All the Places runs
data/store_runs.json       which run and collector each tracked chain last came from
data/upcoming.json         announced openings
data/tracts.json           census tract data, jobs and hazard risk (column layout)
data/counties.json         county Census, population, permits, jobs, Zillow, listings, apartment and hazard data
data/zips.json             ZIP code Zillow and Realtor.com data (column layout)
data/landlord.json         state rent control and eviction rules, with sources
data/counties-10m.json     county outlines (us-atlas)
scripts/                   data builders, the store tracker, the weight check and the Pages build step
.github/workflows/         deploy, and the monthly market and store refreshes
```
