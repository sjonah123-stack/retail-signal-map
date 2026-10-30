"use strict";
// Retail Signal: a site-selection map for multifamily and single-family investors.
// Scores every cell of the US by which site-selective chains have a store nearby, then layers neighborhood
// demographics (Census ACS), county growth (Census population estimates) and market trends (Zillow) on top.

// ================= Signal definitions =================
// sel: OpenStreetMap feature filter. re: regex matched against brand and name (case-insensitive unless ci:false).
// ref: most recent reported US count found in public sources, used only to show coverage.
const GROUPS = [
  { name: "Chick-fil-A", cat: "food", color: "#e15759", why: "Within 5 miles of most suburbs, so it does little to tell them apart. Among single-family areas, the ones without it are usually newer and growing faster.", brands: [
    { name: "Chick-fil-A", sel: '["amenity"="fast_food"]', re: "^Chick-fil-A", ref: 3300, src: "About 3,290 US restaurants at end of 2025 (QSR 50). Excludes ~425 licensed airport and campus units." }] },
  { name: "Costco", cat: "shopping", color: "#4e79a7", brands: [
    { name: "Costco", sel: '["shop"]', re: "^Costco", ref: 641, src: "641 US and Puerto Rico warehouses, fiscal 2026." }] },
  { name: "Trader Joe's", cat: "grocery", color: "#b07aa1", brands: [
    { name: "Trader Joe's", sel: '["shop"="supermarket"]', re: "^Trader Joe", ref: 662, src: "662 US stores, Sept 2026 store-locator count (ScrapeHero)." }] },
  { name: "Regional grocer", cat: "grocery", color: "#59a14f", why: "Known for careful site picks that follow new rooftops; within their states, the one signal tied to both higher rents and faster growth. Each operates in only a few states (Texas, the Southeast, the Northeast), so heavy weights would push the rest of the country down a national ranking.", brands: [
    { name: "H-E-B", sel: '["shop"="supermarket"]', re: "^H-E-B", ref: null, src: "No recent official count found." },
    { name: "Publix", sel: '["shop"="supermarket"]', re: "^Publix", ref: 1434, src: "1,434 stores as of May 2026 (company filing)." },
    { name: "Wegmans", sel: '["shop"="supermarket"]', re: "^Wegmans", ref: 114, src: "About 114 stores, 2026." }] },
  { name: "Starbucks", cat: "food", color: "#1b7f5f", why: "Near about nine in ten scored areas, so it mostly separates towns from the countryside.", brands: [
    { name: "Starbucks", sel: '["amenity"="cafe"]', re: "^Starbucks", ref: 16944, src: "16,944 US stores, March 2026 (company). Includes licensed counters inside Target, grocery stores and airports, which OpenStreetMap rarely maps." }] },
  { name: "Target", cat: "shopping", color: "#c2185b", why: "Near most suburbs, so it adds little once rarer chains are counted.", brands: [
    { name: "Target", sel: '["shop"]', re: "^Target$", ref: 2019, src: "2,019 stores, Aug 1 2026 (10-Q)." }] },
  { name: "Home improvement", cat: "shopping", color: "#f28e2b", why: "Home Depot and Lowe's open ahead of incomes: a Frontier early mover, but near too many suburbs to help the other lenses.", brands: [
    { name: "Home Depot", sel: '["shop"]', re: "^(The )?Home Depot$", ref: 2021, src: "2,021 stores in the 50 states and DC, Feb 2026." },
    { name: "Lowe's", sel: '["shop"]', re: "^Lowe['’]s( Home Improvement)?$", ref: 1759, src: "1,759 stores, May 2026." }] },
  { name: "Dutch Bros", cat: "food", color: "#5aa9a3", why: "Opens where counties are gaining people, mostly in the West and Texas, ahead of incomes: counts in Growth suburbs and as a Frontier early mover.", brands: [
    { name: "Dutch Bros", sel: '["amenity"="cafe"]', re: "^Dutch Bros", ref: 1225, src: "1,225 shops, June 30 2026 (company)." }] },
  { name: "Cult regional QSR", cat: "food", color: "#9c755f", brands: [
    { name: "Whataburger", sel: '["amenity"="fast_food"]', re: "^Whataburger", ref: null, src: "No recent official count found." },
    { name: "In-N-Out", sel: '["amenity"="fast_food"]', re: "^In-N-Out", ref: 442, src: "442 restaurants, Aug 2026 store-locator count." },
    { name: "Wawa", sel: '["shop"]', re: "^Wawa$", ref: 1189, src: "1,189 stores, Jan 1 2026 (CSP Top 202)." }] },
  { name: "Whole Foods", cat: "grocery", color: "#7d9a2e", why: "Zillow found homes near new stores began appreciating faster than their metro after opening.", brands: [
    { name: "Whole Foods", sel: '["shop"="supermarket"]', re: "^Whole Foods", ref: 530, src: "About 530 US stores, early 2026 (third-party count)." }] },
  { name: "Sprouts", cat: "grocery", color: "#d4a514", why: "Core shopper is college-educated with above-average household income.", brands: [
    { name: "Sprouts", sel: '["shop"="supermarket"]', re: "^Sprouts", ref: 490, src: "490 stores, June 2026 (company)." }] },
  { name: "Life Time", cat: "fitness", color: "#6a5acd", why: "Clubs sit in affluent suburbs; member median household income is about $159K.", brands: [
    { name: "Life Time", sel: '["leisure"]', re: "^Life ?Time( Fitness| Athletic| Athletic Club)?$", ref: 195, src: "195 centers, June 2026 (company). A few are in Canada." }] },
  { name: "Upscale fast casual", cat: "food", color: "#e8749a", why: "Trade areas skew toward young, well-educated professionals, though both chains are broadening their price range.", brands: [
    { name: "CAVA", sel: '["amenity"~"^(restaurant|fast_food)$"]', re: "^CAVA$", ci: false, ref: 476, src: "476 restaurants, July 2026 (company)." },
    { name: "sweetgreen", sel: '["amenity"~"^(restaurant|fast_food)$"]', re: "^sweetgreen", ref: null, src: "No recent official count found." }] },
  { name: "ALDI", cat: "grocery", color: "#1f8fc4", w0: 0, why: "Off in the scoring lenses: its areas skew lower-income. A Frontier early mover: its areas are growing while still cheaper, and ATTOM found the best flip returns near ALDI.", brands: [
    { name: "ALDI", sel: '["shop"="supermarket"]', re: "^ALDI$", ref: null, src: "No recent official count found." }] },
  { name: "Shake Shack", cat: "food", color: "#475569", why: "Premium-priced fast casual with a deliberate US rollout.", brands: [
    { name: "Shake Shack", sel: '["amenity"~"^(fast_food|restaurant)$"]', re: "^Shake Shack", ref: 460, src: "About 460 US Shacks, Aug 2026 (company)." }] },
  { name: "First Watch", cat: "food", color: "#a16207", why: "Daytime dining expanding in suburbs, with 100+ projects in development.", brands: [
    { name: "First Watch", sel: '["amenity"~"^(restaurant|cafe|fast_food)$"]', re: "^First Watch", ref: 665, src: "665 restaurants in 33 states, June 2026 (company)." }] },
  { name: "Drive-thru growth", cat: "food", color: "#0891b2", why: "Fast-growing drive-thru chains moving into new suburbs; 7 Brew plans 400+ openings in 2026. So far their areas skew lower-income without growing faster, so only Frontier counts them.", brands: [
    { name: "Raising Cane's", sel: '["amenity"="fast_food"]', re: "^Raising Cane['’]s", ref: 1000, src: "Passed 1,000 restaurants in 2026 (third-party tracker). A few are outside the US." },
    { name: "7 Brew", sel: '["amenity"~"^(cafe|fast_food)$"]', re: "^7 ?Brew", ref: null, src: "No recent official count found." }] },
  { name: "Upscale specialty retail", cat: "shopping", color: "#a855f7", why: "A judgment-based group: affluent-skewing retailers, without the research backing of the other signals.", brands: [
    { name: "lululemon", sel: '["shop"]', re: "^lululemon", ref: null, src: "No recent official count found." },
    { name: "REI", sel: '["shop"]', re: "^REI( Co-op)?$", ci: false, ref: null, src: "No recent official count found." },
    { name: "Total Wine", sel: '["shop"]', re: "^Total Wine", ref: null, src: "No recent official count found." },
    { name: "Apple Store", sel: '["shop"~"^(electronics|computer|mobile_phone)$"]', re: "^Apple( |$)", ci: false, ref: null, src: "No recent official count found." },
    { name: "Alo Yoga", sel: '["shop"]', re: "^Alo( Yoga)?$", ref: null, src: "No recent official count found." },
    { name: "Vuori", sel: '["shop"]', re: "^Vuori$", ref: null, src: "No recent official count found." },
    { name: "Aritzia", sel: '["shop"]', re: "^Aritzia$", ref: null, src: "No recent official count found." },
    { name: "Warby Parker", sel: '["shop"]', re: "^Warby Parker", ref: null, src: "No recent official count found." }] },
  { name: "Luxury fitness", cat: "fitness", color: "#c026d3", why: "Memberships around $200–400 a month. Equinox is concentrated in dense, high-income urban cores, mostly New York and California.", brands: [
    { name: "Equinox", sel: '["leisure"]', re: "^Equinox", ref: 108, src: "108 US clubs in 15 states, Feb 2026 (third-party count)." },
    { name: "SoulCycle", sel: '["leisure"]', re: "^SoulCycle", ref: null, src: "No recent official count found." },
    { name: "Barry's", sel: '["leisure"]', re: "^Barry['’]s( Bootcamp)?$", ref: null, src: "No recent official count found." },
    { name: "solidcore", sel: '["leisure"]', re: "solidcore", ref: null, src: "No recent official count found." }] },
  { name: "Premium grocery", cat: "grocery", color: "#65a30d", why: "Specialty grocers priced above Whole Foods, in high-income neighborhoods.", brands: [
    { name: "Erewhon", sel: '["shop"]', re: "^Erewhon", ref: null, src: "No recent official count found." },
    { name: "The Fresh Market", sel: '["shop"]', re: "^The Fresh Market$", ref: null, src: "No recent official count found." },
    { name: "Central Market", sel: '["shop"="supermarket"]["addr:state"="TX"]', re: "^Central Market$", ref: null, src: "No recent official count found. H-E-B's upscale banner, Texas only: unrelated stores elsewhere share the name." }] },
  { name: "Premium home furnishings", cat: "shopping", color: "#92400e", why: "Big-ticket home spending follows homeowners with high incomes and home equity.", brands: [
    { name: "RH", sel: '["shop"~"^(furniture|department_store|interior_decoration|houseware)$"]', re: "^(RH( |$)|Restoration Hardware)", ci: false, ref: null, src: "No recent official count found. Includes RH outlets." },
    { name: "Williams-Sonoma", sel: '["shop"]', re: "^Williams[- ]Sonoma", ref: null, src: "No recent official count found." },
    { name: "Pottery Barn", sel: '["shop"]', re: "^Pottery Barn", ref: null, src: "No recent official count found." },
    { name: "Crate & Barrel", sel: '["shop"]', re: "^Crate (&|and) Barrel", ref: null, src: "No recent official count found." }] },
  { name: "Luxury department stores", cat: "shopping", color: "#1e3a8a", why: "Full-line stores only; Nordstrom Rack and Saks Off 5th are excluded.", brands: [
    { name: "Nordstrom", sel: '["shop"]', re: "^Nordstrom$", ref: null, src: "No recent official count found. Excludes Nordstrom Rack." },
    { name: "Neiman Marcus", sel: '["shop"]', re: "^Neiman Marcus$", ref: null, src: "No recent official count found." },
    { name: "Saks Fifth Avenue", sel: '["shop"]', re: "^Saks Fifth Avenue$", ref: null, src: "No recent official count found. Excludes Saks Off 5th." },
    { name: "Bloomingdale's", sel: '["shop"]', re: "^Bloomingdale['’]s$", ref: null, src: "No recent official count found. Excludes outlets." }] },
  { name: "Premium childcare", cat: "fitness", color: "#38bdf8", why: "Private early-education chains with high tuition. They follow affluent young families into new subdivisions, and they're the strongest single sign of high incomes and home values in this data.", brands: [
    { name: "Primrose Schools", sel: '["amenity"~"^(kindergarten|childcare|school)$"]', re: "^Primrose School", ref: null, src: "No recent official count found." },
    { name: "Goddard School", sel: '["amenity"~"^(kindergarten|childcare|school)$"]', re: "^(The )?Goddard School", ref: null, src: "No recent official count found." }] },
  { name: "Tesla", cat: "fitness", color: "#dc2626", why: "Showrooms and service centers; chargers are excluded.", brands: [
    { name: "Tesla", sel: '["shop"~"^(car|car_repair)$"]', re: "^Tesla", ref: null, src: "No recent official count found. Excludes Superchargers." }] },
];
const CATS = [["grocery", "Grocery"], ["food", "Restaurants and coffee"], ["shopping", "Shopping"], ["fitness", "Fitness and services"], ["custom", "Your chains"]];
const MAX_GROUPS = 30;   // scores are stored as bit flags, one per signal
const CUSTOM_COLORS = ["#e11d48", "#0ea5e9", "#84cc16", "#f59e0b", "#14b8a6", "#8b5cf6", "#ec4899", "#22c55e"];
let BRANDS = [], brandByName = new Map();
function rebuildBrands() {
  BRANDS = [];
  GROUPS.forEach((g, gi) => g.brands.forEach(b => { b.g = gi; b.rx = new RegExp(b.re, b.ci === false ? "" : "i"); BRANDS.push(b); }));
  brandByName = new Map(BRANDS.map(b => [b.name, b]));
}
rebuildBrands();

const byNames = (obj, dflt) => GROUPS.map(g => obj[g.name] ?? dflt);
// Each weighting is fitted to a goal: how much a chain's presence within 5 miles predicts that goal in census tracts,
// compared within each state and over and above every other chain. A chain counts only if the link held in both halves
// of the country. Weights on chains that operate in only a few regions are kept low, so a national ranking doesn't
// write off the regions they skip. See "How the weights were set" in the README.
const PRESETS = [
  { id: "mf", name: "Multifamily", w: byNames({ "Premium childcare": 3, "Life Time": 3, "Trader Joe's": 3, "Sprouts": 2, "Regional grocer": 1,
      "First Watch": 1, "Upscale fast casual": 1, "Luxury fitness": 1, "Whole Foods": 1, "Premium home furnishings": 1 }, 0),
    note: "Fitted to renter areas with high rents, college-educated adults, rent growth and in-migration. Premium preschools, Life Time and Trader Joe's predicted those best. Regional grocers predicted well too but cover only a few states, so they count 1×. Chains near almost every suburb (Starbucks, Target, Chick-fil-A, Home Depot) are off: they don't tell areas apart." },
  { id: "sf", name: "Single-family", w: byNames({ "Premium childcare": 3, "Life Time": 3, "Regional grocer": 2, "Premium home furnishings": 2, "Costco": 1 }, 0),
    note: "Fitted to family suburbs with high incomes, high ownership, newer homes and population growth. Premium preschools and Life Time lead; regional grocers and RH, Pottery Barn and their peers follow homeowners. Chick-fil-A, Target, Home Depot and the drive-thrus are off: they're near most suburbs, and the places without them are usually newer and growing faster." },
  { id: "all", name: "All signals", w: GROUPS.map(g => g.w0 ?? 1),
    note: "Every signal counts once, except ALDI: the plain read of where site-selective chains have chosen to be." },
  { id: "affluent", name: "Affluent", w: byNames({ "Trader Joe's": 3, "Premium childcare": 2, "Life Time": 2, "Whole Foods": 2, "Luxury fitness": 2,
      "Upscale fast casual": 2, "Regional grocer": 1, "Costco": 1, "Target": 1, "Starbucks": 1, "Sprouts": 1, "First Watch": 1, "Tesla": 1,
      "Luxury department stores": 1 }, 0),
    note: "Fitted to incomes, home values, rents and education. Trader Joe's is the strongest chain found nationwide; premium preschools, Life Time, Whole Foods, luxury fitness and CAVA and sweetgreen add depth. Value chains (ALDI, Home Depot and Lowe's, Dutch Bros, the drive-thrus) are off: their areas skew lower-income." },
  { id: "high", name: "High-end only", w: byNames({ "Luxury fitness": 3, "Whole Foods": 3, "Premium childcare": 2, "Life Time": 1, "Trader Joe's": 1,
      "Upscale specialty retail": 1, "Premium grocery": 1, "Premium home furnishings": 1, "Luxury department stores": 1, "Tesla": 1 }, 0),
    note: "Separates the top among areas with $100K+ incomes. Equinox, Barry's and their peers lead, then Whole Foods and premium preschools. Luxury retail and Tesla count 1×: they mark wealth but add little once those are counted." },
  { id: "growth", name: "Growth suburbs", w: byNames({ "Premium childcare": 3, "Regional grocer": 2, "Dutch Bros": 2, "Cult regional QSR": 2, "Life Time": 1 }, 0),
    note: "Fitted to suburbs gaining people and home value, and building new homes. Premium preschools lead, then regional grocers, Dutch Bros, and Whataburger, In-N-Out and Wawa. Raising Cane's and 7 Brew are off: their areas haven't grown faster." },
];

// A lens is a starting point: a weighting, a scoring mode and a set of filters for one kind of buyer.
const NO_FILTERS = { inc: 0, pti: 0, renter: 0, popg: -999, zori1: -999, pipe: 0, empg: -999, risk: 0 };
const LENSES = [
  { id: "mf", name: "Multifamily", short: "Well-paid renters, growing counties", preset: "mf", mode: "score", sort: "overall", filters: { renter: 30, popg: 0 },
    icon: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/>',
    desc: "Keeps areas where 30%+ of households rent in growing counties. The signal score weights the chains that best predicted high rents and college-educated renters (premium preschools, Life Time, Trader Joe's). Chains mark proven demand but not momentum, so Top areas rank on both." },
  { id: "sf", name: "Single-family", short: "Family growth suburbs, attainable prices", preset: "sf", mode: "score", sort: "overall", filters: { inc: 65000, pti: 5, popg: 3 },
    icon: '<path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-5h4v5"/>',
    desc: "Keeps areas with $65K+ incomes, homes under 5× income and 3%+ county growth since 2020. The signal score weights the few chains that marked the best family suburbs (premium preschools, Life Time, regional grocers). Chains are a weak guide here, so Top areas rank on market momentum too." },
  { id: "retail", name: "Retail signal", short: "Where site-selective chains cluster", preset: "all", mode: "score", filters: {},
    icon: '<path d="M5 8h14l-1 12H6L5 8ZM9 8V6a3 3 0 0 1 6 0v2"/>',
    desc: "Every signal counts once, with no filters: the plain read of where site-selective chains have chosen to be." },
  { id: "frontier", name: "Frontier", short: "Early movers in, anchors not yet", preset: "all", mode: "frontier", filters: {},
    icon: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
    desc: "Areas where early movers (Dutch Bros, ALDI, Home Depot or Lowe's, regional grocers, drive-thrus) have arrived but late anchors (Costco, Trader Joe's, Whole Foods, Life Time, premium preschools) haven't. These areas have grown faster than the rest of their state while prices stayed lower." },
];
const LENS_KPIS = {
  mf: ["rent", "renter", "vac", "mf5", "inc", "yld", "hv", "pti", "yb", "bach", "dens", "pop", "jobs", "taxr", "risk"],
  sf: ["hv", "pti", "inc", "yb", "renter", "bach", "rent", "yld", "dens", "vac", "mf5", "pop", "taxr", "risk", "jobs"],
  retail: ["inc", "hv", "rent", "bach", "pti", "renter", "yld", "dens", "yb", "vac", "mf5", "pop", "jobs", "taxr", "risk"],
};
const LENS_CHIPS = { mf: ["renter", "rent", "popg", "mfpipe", "opens"], sf: ["inc", "pti", "popg", "opens"], retail: ["inc", "hv", "popg", "opens"], frontier: ["inc", "pti", "popg", "opens"] };

const STATUS_LABEL = { opened: "Just opened", dated: "Date set", planned: "Planned", proposed: "Proposed" };
const STATE_ABBR = { alabama:"AL",alaska:"AK",arizona:"AZ",arkansas:"AR",california:"CA",colorado:"CO",connecticut:"CT",delaware:"DE","district of columbia":"DC",
  florida:"FL",georgia:"GA",hawaii:"HI",idaho:"ID",illinois:"IL",indiana:"IN",iowa:"IA",kansas:"KS",kentucky:"KY",louisiana:"LA",maine:"ME",maryland:"MD",
  massachusetts:"MA",michigan:"MI",minnesota:"MN",mississippi:"MS",missouri:"MO",montana:"MT",nebraska:"NE",nevada:"NV","new hampshire":"NH","new jersey":"NJ",
  "new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND",ohio:"OH",oklahoma:"OK",oregon:"OR",pennsylvania:"PA","rhode island":"RI",
  "south carolina":"SC","south dakota":"SD",tennessee:"TN",texas:"TX",utah:"UT",vermont:"VT",virginia:"VA",washington:"WA","west virginia":"WV",wisconsin:"WI",
  wyoming:"WY","puerto rico":"PR" };
const toAbbr = s => { s = (s || "").trim(); if (!s) return ""; if (s.length === 2) return s.toUpperCase(); return STATE_ABBR[s.toLowerCase()] || ""; };

let ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const SB = 0.5;
const CB_LAT = 0.2, CB_LON = 0.25, COARSE_BELOW = 7;
const TRACT_MIN_ZOOM = 8;   // below this, neighborhood metrics are drawn by county

// ================= Color =================
// Signal score: one warm hue, light to dark. Frontier: one green hue. Census magnitudes: blue (people) or violet (prices).
// Change and affordability: diverging red (worse) to blue (better) around a neutral middle.
const SCORE_RAMP = [[0, "#fde3cf"], [0.45, "#f9bf98"], [0.58, "#f39563"], [0.7, "#e06a35"], [0.82, "#b84a1c"], [0.93, "#7f2f0e"]];
const FRONT_RAMP = [[0, "#d9f0d3"], [0.45, "#a6dba0"], [0.58, "#5aae61"], [0.7, "#1b7837"], [0.82, "#0f5a2a"], [0.93, "#06391b"]];
const BLUE = ["#cde2fb", "#86b6ef", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const VIOLET = ["#e7e2fb", "#c4baf3", "#9d8fe8", "#7a66d8", "#5a45c0", "#3b2a8f"];
const DIV = ["#b3302d", "#e0716a", "#f3bdb6", "#b7d3f6", "#5598e7", "#1c5cab"];
const DIV_R = DIV.slice().reverse();
const T = {
  money: v => "$" + (v >= 1e6 ? v / 1e6 + "M" : v / 1e3 + "K"),
  dollars: v => "$" + v.toLocaleString("en-US"),
  pct: v => v + "%",
  chg: v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v) + "%",
  x: v => v + "×",
  year: v => String(v),
  num: v => v >= 1000 ? v / 1000 + "K" : String(v),
};
const METRICS = {
  inc: { name: "Household income", scope: "t", county: true, breaks: [50000, 65000, 80000, 100000, 125000], colors: BLUE, tick: T.money, note: "Median household income." },
  hv: { name: "Home value", scope: "t", county: true, breaks: [150000, 250000, 350000, 500000, 750000], colors: VIOLET, tick: T.money, note: "Median value of owner-occupied homes." },
  rent: { name: "Rent", scope: "t", county: true, breaks: [900, 1200, 1500, 1900, 2500], colors: VIOLET, tick: T.dollars, note: "Median gross rent per month, including utilities." },
  pti: { name: "Home price to income", scope: "t", county: true, breaks: [2.5, 3.5, 4.5, 5.5, 7], colors: DIV_R, tick: T.x, note: "Median home value ÷ median household income. Blue is more affordable." },
  yld: { name: "Gross rent yield", scope: "t", county: true, breaks: [5, 6.5, 8, 10, 12], colors: DIV, tick: T.pct, note: "Annual median rent ÷ median home value. A rough screen: the two medians describe different homes." },
  renter: { name: "Renter households", scope: "t", county: true, breaks: [20, 30, 40, 50, 60], colors: BLUE, tick: T.pct, note: "Share of occupied homes that are rented." },
  vac: { name: "Rental vacancy", scope: "t", county: true, breaks: [3, 5, 7, 10, 15], colors: DIV_R, tick: T.pct, note: "Vacant for-rent units as a share of rental stock. Tract figures are noisy; read clusters, not single dots." },
  mf5: { name: "Homes in 5+ unit buildings", scope: "t", county: true, breaks: [5, 15, 25, 40, 60], colors: BLUE, tick: T.pct, note: "Share of housing units in buildings with five or more units: existing apartment density." },
  yb: { name: "Median year built", scope: "t", county: true, breaks: [1960, 1975, 1990, 2000, 2010], colors: BLUE, tick: T.year, note: "Darker means newer housing stock." },
  bach: { name: "Bachelor's degree or higher", scope: "t", county: true, breaks: [20, 30, 40, 50, 60], colors: BLUE, tick: T.pct, note: "Share of adults 25 and older." },
  dens: { name: "Population density", scope: "t", county: false, breaks: [500, 1500, 3000, 6000, 12000], colors: BLUE, tick: T.num, note: "People per square mile of land." },
  popg: { name: "Population growth since 2020", scope: "c", breaks: [-2, 0, 3, 6, 10], colors: DIV, tick: T.chg, note: "Census estimates, July 2020 to July 2025." },
  popg1: { name: "Population growth, last year", scope: "c", breaks: [-0.5, 0, 0.5, 1, 2], colors: DIV, tick: T.chg, note: "Census estimates, July 2024 to July 2025." },
  dmig: { name: "Net domestic migration", scope: "c", breaks: [-3, 0, 2, 5, 10], colors: DIV, tick: T.chg, note: "People moving in from other US counties minus those leaving, 2021–25, as a share of 2020 population." },
  mfpipe: { name: "Apartment pipeline", scope: "c", breaks: [3, 6, 9, 12, 16], colors: DIV_R, tick: T.pct, note: "Units permitted in 5+ unit buildings over the last three years, as a share of existing apartment stock. Red means heavy new supply." },
  mfp: { name: "Apartment permits per 1,000 people", scope: "c", breaks: [0.5, 1, 2, 4, 6], colors: VIOLET, tick: String, note: "Units permitted in 5+ unit buildings in the latest full year, per 1,000 residents." },
  sfp: { name: "Single-family permits per 1,000 people", scope: "c", breaks: [1, 2, 4, 6, 10], colors: VIOLET, tick: String, note: "Single-family homes permitted in the latest full year, per 1,000 residents." },
  // Zillow series draw by ZIP code when zoomed in (over county shading) and by county when zoomed out.
  zori1: { name: "Rent change, 1 yr", scope: "c", zip: true, breaks: [0, 2, 3, 4, 6], colors: DIV, tick: T.chg, note: "Zillow Observed Rent Index." },
  zori3: { name: "Rent change, 3 yr", scope: "c", zip: true, breaks: [5, 10, 15, 20, 25], colors: DIV, tick: T.chg, note: "Zillow Observed Rent Index." },
  zhvi1: { name: "Home value change, 1 yr", scope: "c", zip: true, breaks: [-4, -2, 0, 2, 4], colors: DIV, tick: T.chg, note: "Zillow Home Value Index, mid-tier homes." },
  zhvi5: { name: "Home value change, 5 yr", scope: "c", zip: true, breaks: [10, 20, 30, 40, 55], colors: DIV, tick: T.chg, note: "Zillow Home Value Index, mid-tier homes." },
  zori: { name: "Typical rent (Zillow)", scope: "c", zip: true, breaks: [1000, 1300, 1600, 2000, 2600], colors: VIOLET, tick: T.dollars, note: "Zillow Observed Rent Index, all rental types." },
  zhvi: { name: "Typical home value (Zillow)", scope: "c", zip: true, breaks: [150000, 250000, 350000, 500000, 750000], colors: VIOLET, tick: T.money, note: "Zillow Home Value Index, mid-tier homes." },
  empg1: { name: "Job growth, 1 yr", scope: "c", breaks: [-1, 0, 1, 2, 3], colors: DIV, tick: T.chg, note: "Change in jobs from the same quarter a year earlier, all industries (BLS QCEW)." },
  wageg1: { name: "Wage growth, 1 yr", scope: "c", breaks: [1, 2, 3, 4, 5], colors: DIV, tick: T.chg, note: "Change in the average weekly wage from the same quarter a year earlier (BLS QCEW)." },
  jph: { name: "Jobs per household", scope: "t", county: false, breaks: [0.25, 0.5, 1, 2, 4], colors: BLUE, tick: String, note: "Jobs located in the neighborhood per household living there: above 1 marks a job center (Census LEHD)." },
  taxr: { name: "Property tax rate", scope: "t", county: true, breaks: [0.6, 0.9, 1.2, 1.6, 2], colors: DIV_R, tick: v => v + "%", note: "Median property taxes ÷ median home value, owner-occupied homes: an effective rate." },
  risk: { name: "Natural hazard risk", scope: "t", county: true, breaks: [20, 40, 60, 80, 95], colors: DIV_R, tick: String, note: "FEMA National Risk Index score, 0–100: how the area ranks nationally on expected losses from natural hazards, adjusted for vulnerability and resilience." },
  lossr: { name: "Expected hazard losses", scope: "t", county: true, breaks: [500, 1000, 1500, 2500, 4000], colors: DIV_R, tick: v => "$" + fmt(v), note: "Expected yearly building losses from natural hazards per $1M of building value (FEMA National Risk Index). A rough guide to insurance pressure." },
  dom: { name: "Days on market, for sale", scope: "c", zip: true, breaks: [40, 55, 70, 85, 100], colors: DIV_R, tick: String, note: "Median days on market for homes listed for sale (Realtor.com)." },
  invg: { name: "For-sale listings, 1 yr change", scope: "c", zip: true, breaks: [-10, 0, 10, 20, 35], colors: DIV_R, tick: T.chg, note: "Change in active for-sale listings from a year earlier; rising inventory gives buyers more leverage (Realtor.com)." },
  prc: { name: "Listings with a price cut", scope: "c", zip: true, breaks: [12, 16, 20, 24, 28], colors: DIV_R, tick: T.pct, note: "Share of active for-sale listings with a price reduction (Realtor.com)." },
  avac: { name: "Apartment vacancy", scope: "c", breaks: [5, 6, 7, 8, 9], colors: DIV_R, tick: T.pct, note: "Apartment List vacancy index: vacant units ÷ all units in listed apartment properties. County where published, otherwise the metro area." },
  conc: { name: "Apartment concessions", scope: "c", breaks: [10, 20, 30, 40, 50], colors: DIV_R, tick: T.pct, note: "Share of apartment listings offering a concession, such as free rent (Apartment List). County where published, otherwise the metro area." },
};
const hasMetric = k => typeof k === "string" && Object.hasOwn(METRICS, k);   // keys arrive from links, so skip inherited names
const COLOR_GROUPS = [
  ["Neighborhoods (Census ACS)", ["inc", "hv", "rent", "pti", "yld", "renter", "vac", "mf5", "yb", "bach", "dens"]],
  ["County growth (Census estimates)", ["popg", "popg1", "dmig"]],
  ["Housing supply (Census permits)", ["mfpipe", "mfp", "sfp"]],
  ["Market trends by ZIP and county (Zillow)", ["zori1", "zori3", "zhvi1", "zhvi5", "zori", "zhvi"]],
  ["Jobs (BLS, Census LEHD)", ["empg1", "wageg1", "jph"]],
  ["For-sale listings (Realtor.com)", ["dom", "invg", "prc"]],
  ["Apartments (Apartment List)", ["avac", "conc"]],
  ["Costs and risk (Census, FEMA)", ["taxr", "risk", "lossr"]],
];

// ================= State =================
let stores = [];                  // {g,b,lat,lon,city,st,src}
let upcoming = [];                // {g,b,place,status,when,src:{name,url},lat,lon}
let openings = [], closings = []; // tracked chains' store changes in the last 12 months: {g,b,place,lat,lon,d,since}
let changesMeta = null, changeBuckets = new Map();
let brandSrc = {};                // brand name -> data source label
let loadedBrands = new Set();     // brands that have been fetched or imported (even if zero stores came back)
let storeMeta = { saved: "" };
let lens = "mf";
let weights = PRESETS[0].w.slice();
let activePreset = 0;
let radius = 5, minFrac = 0.3, shadeOpacity = 0.7;
let showStores = true, showUpcoming = true, countAnnounced = false;
let colorBy = "score";
let filt = { ...NO_FILTERS }, sortBy = "score";
let grid = { latStep: 1, lonStep: 1, cellMi: 1 };
let cells = [], cellBuckets = new Map(), coarseBuckets = new Map(), storeBuckets = new Map();
let maxW = 0;
let gState = GROUPS.map(() => "idle");
let viewMode = "score";
// Early movers are chains whose areas grew faster than their state's without (yet) being richer; late anchors mark
// areas that are already well-off. Chick-fil-A and First Watch fit neither; premium preschools mark affluence.
const DEFAULT_ROLE = { "Regional grocer": "early", "Home improvement": "early", "Dutch Bros": "early", "Cult regional QSR": "early",
  "Drive-thru growth": "early", "ALDI": "early",
  "Costco": "late", "Trader Joe's": "late", "Whole Foods": "late", "Life Time": "late", "Premium grocery": "late", "Premium childcare": "late" };
let roles = GROUPS.map(g => DEFAULT_ROLE[g.name] || "none");
let minEarly = 4, maxLate = 0, lateRadius = 10;
let reportAt = null;              // {lat, lon, label}
// Market data
let counties = [], countyIdx = new Map(), cdata = new Map(), marketMeta = null;
let tracts = [], tractBuckets = new Map(), tractPlaces = [];   // tractPlaces: [name, state] of Census places
let zips = [], zipBuckets = new Map();
const market = { counties: false, tracts: false, zips: false, error: false };
// Sites pinned for side-by-side comparison, and the uploaded deal list.
const MAX_COMPARE = 4;
let compare = [];                 // {lat, lon, label}
let deals = [], dealHeaders = []; // {name, query, lat, lon, row, status}
const countyCache = new Map(), taCache = new Map();

// ================= Helpers =================
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = n => n.toLocaleString("en-US");
function escapeHtml(t) { return String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function distMi(a, b, c, d) {
  const dy = (a - c) * 69, dx = (b - d) * 69 * Math.cos(((a + c) / 2) * Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy);
}
function stepColor(f) { const st = viewMode === "frontier" ? FRONT_RAMP : SCORE_RAMP; let c = st[0][1]; for (const [t, col] of st) if (f >= t - 1e-9) c = col; return c; }
function threshold() { return viewMode === "frontier" ? Math.max(1, minEarly) : Math.max(1, Math.ceil(minFrac * maxW - 1e-9)); }
const cellKey = (i, j) => i * 40000 + (j + 20000);
const bucketKey = (i, j) => i * 4000 + (j + 2000);
const gmapsStore = s => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.b} near ${s.lat.toFixed(5)},${s.lon.toFixed(5)}`)}`;
const gmapsSpot = (lat, lon) => `https://www.google.com/maps/@?api=1&map_action=map&center=${lat.toFixed(5)},${lon.toFixed(5)}&zoom=14`;
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
const money = v => v == null ? "–" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : "$" + fmt(Math.round(v / 1000)) + "K";
const dollars = v => v ? "$" + fmt(Math.round(v)) : "–";
const pct = (v, d = 1) => v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d) + "%";
const share = (v, d = 0) => v == null ? "–" : v.toFixed(d) + "%";
const big = n => n == null ? "–" : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "K" : fmt(Math.round(n));
const tone = v => v == null ? "" : v > 0 ? "up" : v < 0 ? "dn" : "";
const monthName = ym => { if (!ym) return ""; const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" }); };
const groupVisible = g => viewMode === "frontier" ? roles[g] !== "none" : weights[g] > 0;
// Coordinates from files and links are checked against the US (incl. Alaska, Hawaii, Puerto Rico): out-of-range
// values would make the grid loops run for billions of steps.
const inUS = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= 17 && lat <= 72 && lon >= -180 && lon <= -60;
const safeColor = c => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : null;
const str = (v, max = 200) => v == null ? "" : String(v).slice(0, max);
const ICON_EXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

let toastT;
function toast(msg, err) {
  const t = $("toast"); t.textContent = msg; t.classList.toggle("err", !!err); t.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), err ? 6000 : 3200);
}
function setStatus(msg, err) { const s = $("status"); s.textContent = msg; s.classList.toggle("err", !!err); }
async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`); return r.json(); }
// Deploys stamp this script's URL with ?v=<commit> (scripts/build_site.sh). Data requests carry the same stamp,
// so a freshly deployed page never reads data its browser cached from the previous deploy.
const BUILD = (() => { try { return new URL(document.currentScript.src).searchParams.get("v") || ""; } catch (e) { return ""; } })();
const dataUrl = name => `data/${name}${BUILD ? `?v=${encodeURIComponent(BUILD)}` : ""}`;

// ================= Map =================
const dark = document.documentElement.dataset.theme === "dark" ||
  (document.documentElement.dataset.theme !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
const map = L.map("map", { preferCanvas: true, zoomSnap: 0.5, zoomControl: false, worldCopyJump: true }).setView([38.6, -96.5], 4.5);
L.control.zoom({ position: "bottomright" }).addTo(map);
map.attributionControl.addAttribution('Data: <a href="https://www.census.gov/data.html">US Census</a>, <a href="https://www.zillow.com/research/data/">Zillow</a>, <a href="https://www.alltheplaces.xyz/">All the Places</a>');
const esriAttr = 'Tiles &copy; Esri, HERE, Garmin &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const esri = name => `https://server.arcgisonline.com/ArcGIS/rest/services/${name}/MapServer/tile/{z}/{y}/{x}`;
for (const [name, z] of [["census", 300], ["signals", 350], ["site", 420], ["labels", 450]]) {
  map.createPane(name);
  map.getPane(name).style.zIndex = z;
  map.getPane(name).style.pointerEvents = "none";
}
const BASEMAPS = {
  map: {
    base: L.tileLayer(esri(`Canvas/${dark ? "World_Dark_Gray_Base" : "World_Light_Gray_Base"}`), { attribution: esriAttr, maxNativeZoom: 16, maxZoom: 19 }),
    labels: [L.tileLayer(esri(`Canvas/${dark ? "World_Dark_Gray_Reference" : "World_Light_Gray_Reference"}`), { pane: "labels", maxNativeZoom: 16, maxZoom: 19 })],
  },
  satellite: {
    base: L.tileLayer(esri("World_Imagery"), { attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics, USDA, USGS", maxNativeZoom: 18, maxZoom: 19 }),
    labels: [
      L.tileLayer(esri("Reference/World_Transportation"), { pane: "labels", maxNativeZoom: 18, maxZoom: 19, opacity: 0.75 }),
      L.tileLayer(esri("Reference/World_Boundaries_and_Places"), { pane: "labels", maxNativeZoom: 18, maxZoom: 19 }),
    ],
  },
};
let basemap = "map";
BASEMAPS.map.base.addTo(map);
BASEMAPS.map.labels.forEach(l => l.addTo(map));
function setBasemap(name) {
  if (name === basemap) return;
  const cur = BASEMAPS[basemap];
  map.removeLayer(cur.base); cur.labels.forEach(l => map.removeLayer(l));
  basemap = name;
  BASEMAPS[name].base.addTo(map); BASEMAPS[name].labels.forEach(l => l.addTo(map));
  document.querySelectorAll(".maptools button[data-b]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.b === name)));
  signalLayer.redraw();
}
let tileErrors = 0;
BASEMAPS.map.base.on("tileerror", () => {
  if (++tileErrors !== 4) return;
  const onMap = basemap === "map";
  if (onMap) { map.removeLayer(BASEMAPS.map.base); BASEMAPS.map.labels.forEach(l => map.removeLayer(l)); }
  BASEMAPS.map = { base: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 }), labels: [] };
  if (onMap) BASEMAPS.map.base.addTo(map);
});
document.querySelectorAll(".maptools button[data-b]").forEach(b => b.addEventListener("click", () => setBasemap(b.dataset.b)));
document.querySelectorAll(".maptools button[data-t]").forEach(b => b.addEventListener("click", () => {
  if (b.dataset.t === "stores") showStores = !showStores; else showUpcoming = !showUpcoming;
  b.setAttribute("aria-pressed", String(b.dataset.t === "stores" ? showStores : showUpcoming));
  signalLayer.redraw();
}));

// ================= Drawing layer (score shading, stores, openings) =================
const SignalLayer = L.GridLayer.extend({
  createTile(coords) {
    const tile = document.createElement("canvas");
    const size = this.getTileSize();
    const dpr = window.devicePixelRatio || 1;
    tile.width = size.x * dpr; tile.height = size.y * dpr;
    tile.style.width = size.x + "px"; tile.style.height = size.y + "px";
    if (!cells.length && !stores.length && !upcoming.length) return tile;
    const ctx = tile.getContext("2d");
    ctx.scale(dpr, dpr);
    const z = coords.z, m = this._map;
    const origin = coords.scaleBy(size);
    const nw = m.unproject(origin, z), se = m.unproject(origin.add(size), z);
    const coarseView = z < COARSE_BELOW;
    const ls = coarseView ? CB_LAT : grid.latStep, lo = coarseView ? CB_LON : grid.lonStep;
    const buckets = coarseView ? coarseBuckets : cellBuckets;
    const hl = ls / 2, hw = lo / 2;
    const latMin = se.lat - ls, latMax = nw.lat + ls, lonMin = nw.lng - lo, lonMax = se.lng + lo;
    const th = threshold();

    if (maxW > 0 && colorBy === "score") {
      ctx.globalAlpha = shadeOpacity * (z >= 13 ? 0.55 : z >= 11 ? 0.75 : 1);
      for (let bi = Math.floor(latMin); bi <= Math.floor(latMax); bi++) {
        for (let bj = Math.floor(lonMin); bj <= Math.floor(lonMax); bj++) {
          const arr = buckets.get(bucketKey(bi, bj));
          if (!arr) continue;
          for (const c of arr) {
            if (c.score < th) continue;
            if (c.lat < latMin || c.lat > latMax || c.lon < lonMin || c.lon > lonMax) continue;
            const p1 = m.project([c.lat + hl, c.lon - hw], z).subtract(origin);
            const p2 = m.project([c.lat - hl, c.lon + hw], z).subtract(origin);
            const w = p2.x - p1.x, h = p2.y - p1.y;
            ctx.fillStyle = stepColor(c.score / maxW);
            // Zoomed out, overlapping discs read as hot spots; tiny squares would vanish.
            if (coarseView) { ctx.beginPath(); ctx.arc(p1.x + w / 2, p1.y + h / 2, Math.max(2.6, Math.max(w, h) * 0.9), 0, Math.PI * 2); ctx.fill(); }
            else if (w > 7) ctx.fillRect(p1.x + 0.75, p1.y + 0.75, w - 1.5, h - 1.5);
            else ctx.fillRect(p1.x, p1.y, Math.max(1.2, w), Math.max(1.2, h));
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    const pad = 0.02;
    const inTile = (lat, lon) => lat >= se.lat - pad && lat <= nw.lat + pad && lon >= nw.lng - pad && lon <= se.lng + pad;
    const ringColor = basemap === "satellite" || !dark ? "#ffffff" : "#1a1a19";

    if (showStores && stores.length) {
      const r = z < 5 ? 1.3 : z < 6 ? 1.7 : z < 8 ? 2.3 : z < 10 ? 3.2 : z < 13 ? 4.2 : 5.5;
      const outlined = z >= 8;
      if (z < 6 && colorBy === "score") ctx.globalAlpha = 0.45;   // let the shading lead at national scale
      ctx.lineWidth = z >= 10 ? 1.5 : 1;
      ctx.strokeStyle = ringColor;
      for (let bi = Math.floor(latMin / SB); bi <= Math.floor(latMax / SB); bi++) {
        for (let bj = Math.floor(lonMin / SB); bj <= Math.floor(lonMax / SB); bj++) {
          const arr = storeBuckets.get(bucketKey(bi, bj));
          if (!arr) continue;
          for (const s of arr) {
            if (s.extra || !groupVisible(s.g) || !inTile(s.lat, s.lon)) continue;
            const p = m.project([s.lat, s.lon], z).subtract(origin);
            ctx.fillStyle = GROUPS[s.g].color;
            if (!outlined) { ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); continue; }
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // Stores opened in the past year get a green ring around their dot; closed ones a gray ring where they were.
    if (showUpcoming && (openings.length || closings.length) && z >= 6) {
      const r = (z < 8 ? 2.3 : z < 10 ? 3.2 : z < 13 ? 4.2 : 5.5) + 3;
      ctx.lineWidth = z >= 10 ? 2.5 : 2;
      for (const [list, col] of [[closings, dark ? "#8a8a85" : "#9a9a95"], [openings, "#16a34a"]]) {
        ctx.strokeStyle = col;
        ctx.setLineDash(list === closings ? [2, 2] : []);
        for (const x of list) {
          if (!groupVisible(x.g) || !inTile(x.lat, x.lon)) continue;
          const p = m.project([x.lat, x.lon], z).subtract(origin);
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    if (showUpcoming && upcoming.length) {
      const r = z < 6 ? 4.5 : z < 10 ? 6 : 8;
      for (const u of upcoming) {
        if (u.lat == null || !inTile(u.lat, u.lon)) continue;
        const p = m.project([u.lat, u.lon], z).subtract(origin);
        const col = GROUPS[u.g].color;
        ctx.save();
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
        ctx.fillStyle = basemap === "satellite" || !dark ? "rgba(255,255,255,.88)" : "rgba(26,26,25,.88)"; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        if (u.status === "opened") { ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = ringColor; ctx.stroke(); }
        else {
          ctx.lineWidth = 2.6; ctx.strokeStyle = col;
          if (u.status === "planned") ctx.setLineDash([4, 3]);
          if (u.status === "proposed") { ctx.setLineDash([1.5, 3]); ctx.globalAlpha = 0.75; }
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    return tile;
  },
});
const signalLayer = new SignalLayer({ pane: "signals", updateWhenZooming: false, noWrap: true });
signalLayer.addTo(map);

// ================= Scoring =================
// Stores used for scoring: real stores, recently opened stores the data lacks, and (optionally) announced openings.
function extraScoring() {
  const out = [];
  for (const u of upcoming) {
    if (u.lat == null) continue;
    const counts = u.status === "opened" || (countAnnounced && (u.status === "dated" || u.status === "planned"));
    if (!counts) continue;
    // skip a "just opened" entry if the store data already has that chain within 3 miles
    if (u.status === "opened" && stores.some(s => s.b === u.b && Math.abs(s.lat - u.lat) < 0.06 && distMi(s.lat, s.lon, u.lat, u.lon) < 3)) continue;
    out.push({ g: u.g, b: u.b, lat: u.lat, lon: u.lon, city: u.place.split(",")[0], st: "", extra: true, up: u });
  }
  return out;
}

function buildStoreBuckets(all) {
  storeBuckets = new Map();
  const freq = GROUPS.map(() => 0);
  for (const s of all) freq[s.g]++;
  const ordered = all.slice().sort((a, b) => freq[b.g] - freq[a.g]);   // rare chains draw on top
  for (const s of ordered) {
    const k = bucketKey(Math.floor(s.lat / SB), Math.floor(s.lon / SB));
    let a = storeBuckets.get(k); if (!a) storeBuckets.set(k, a = []);
    a.push(s);
  }
}

function computeGrid(all) {
  const cellMi = Math.max(1, radius / 3);
  const latStep = cellMi / 69, lonStep = cellMi / 54.4;
  grid = { latStep, lonStep, cellMi };
  const masks = new Map(), counts = new Map();
  const R2 = radius * radius;
  for (const s of all) {
    const cosl = Math.cos(s.lat * Math.PI / 180);
    const si = Math.floor(s.lat / latStep), sj = Math.floor(s.lon / lonStep);
    const di = Math.ceil(radius / cellMi) + 1;
    const dj = Math.ceil(radius / (lonStep * 69 * cosl)) + 1;
    const bit = 1 << s.g;
    for (let i = si - di; i <= si + di; i++) {
      const dy = ((i + 0.5) * latStep - s.lat) * 69;
      if (dy * dy > R2) continue;
      for (let j = sj - dj; j <= sj + dj; j++) {
        const dx = ((j + 0.5) * lonStep - s.lon) * 69 * cosl;
        if (dx * dx + dy * dy > R2) continue;
        const k = cellKey(i, j);
        masks.set(k, (masks.get(k) || 0) | bit);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
  }
  cells = [];
  for (const [k, mask] of masks) {
    const i = Math.floor(k / 40000), j = k - i * 40000 - 20000;
    cells.push({ k, lat: (i + 0.5) * latStep, lon: (j + 0.5) * lonStep, mask, lm: 0, n: counts.get(k), score: 0 });
  }
}

// Marks which late-role chains sit within lateRadius of each scored cell (a wider ring than the scoring radius).
let lastAll = [];
function computeLate(all = lastAll) {
  lastAll = all;
  for (const c of cells) c.lm = 0;
  const late = new Set(roles.map((r, i) => r === "late" ? i : -1).filter(i => i >= 0));
  if (!late.size || !cells.length) return;
  const idx = new Map(cells.map(c => [c.k, c]));
  const { latStep, lonStep, cellMi } = grid, R = lateRadius, R2 = R * R;
  for (const s of all) {
    if (!late.has(s.g)) continue;
    const cosl = Math.cos(s.lat * Math.PI / 180);
    const si = Math.floor(s.lat / latStep), sj = Math.floor(s.lon / lonStep);
    const di = Math.ceil(R / cellMi) + 1, dj = Math.ceil(R / (lonStep * 69 * cosl)) + 1;
    const bit = 1 << s.g;
    for (let i = si - di; i <= si + di; i++) {
      const dy = ((i + 0.5) * latStep - s.lat) * 69;
      if (dy * dy > R2) continue;
      for (let j = sj - dj; j <= sj + dj; j++) {
        const dx = ((j + 0.5) * lonStep - s.lon) * 69 * cosl;
        if (dx * dx + dy * dy > R2) continue;
        const c = idx.get(cellKey(i, j));
        if (c) c.lm |= bit;
      }
    }
  }
}

function maskSum(cache, m, valueOf) {
  let v = cache.get(m);
  if (v === undefined) { v = 0; for (let g = 0; g < GROUPS.length; g++) if (m & (1 << g)) v += valueOf(g); cache.set(m, v); }
  return v;
}
function rescore() {
  const wCache = new Map(), eCache = new Map(), lCache = new Map();
  if (viewMode === "frontier") {
    maxW = roles.filter(r => r === "early").length;
    for (const c of cells) {
      const e = maskSum(eCache, c.mask, g => roles[g] === "early" ? 1 : 0), l = maskSum(lCache, c.lm, g => roles[g] === "late" ? 1 : 0);
      c.score = e >= minEarly && l <= maxLate ? e : 0;
    }
  } else {
    maxW = weights.reduce((a, b) => a + b, 0);
    for (const c of cells) c.score = maskSum(wCache, c.mask, g => weights[g]);
  }
  cells.sort((a, b) => a.score - b.score || a.n - b.n);
  cellBuckets = new Map();
  for (const c of cells) {
    const k = bucketKey(Math.floor(c.lat), Math.floor(c.lon));
    let a = cellBuckets.get(k); if (!a) cellBuckets.set(k, a = []);
    a.push(c);
  }
  const coarse = new Map();
  for (const c of cells) {
    const i = Math.floor(c.lat / CB_LAT), j = Math.floor(c.lon / CB_LON);
    const k = i * 4000 + (j + 2000);
    const cur = coarse.get(k);
    if (!cur || c.score > cur.score) coarse.set(k, { lat: (i + 0.5) * CB_LAT, lon: (j + 0.5) * CB_LON, score: c.score });
  }
  coarseBuckets = new Map();
  for (const c of [...coarse.values()].sort((a, b) => a.score - b.score)) {
    const k = bucketKey(Math.floor(c.lat), Math.floor(c.lon));
    let a = coarseBuckets.get(k); if (!a) coarseBuckets.set(k, a = []);
    a.push(c);
  }
  markOpenings();
  updateThresholdLabel();
  renderLegend();
  signalLayer.redraw();
  updateTop();
  renderLensDesc();
  if (reportAt) renderReport();
  renderDeals(); renderCompare();
  syncUrl();
}

// ---------- Store openings and closings (data/changes.json, from scripts/track_stores.py) ----------
function setChanges(j) {
  const cut = new Date(j.updated); cut.setFullYear(cut.getFullYear() - 1);
  const since = cut.toISOString().slice(0, 10);
  changesMeta = { updated: j.updated, since };
  const item = x => {
    const b = brandByName.get(x.b), [city, st] = String(x.p || "").split("|");
    return b && inUS(x.lat, x.lon) ? { g: b.g, b: x.b, lat: x.lat, lon: x.lon, place: [city, st].filter(Boolean).join(", "), d: x.d, since: x.since } : null;
  };
  const recent = (j.items || []).filter(x => x.d > since);
  openings = recent.filter(x => x.k === "o").map(item).filter(Boolean);
  closings = recent.filter(x => x.k === "c").map(item).filter(Boolean);
  changeBuckets = new Map();
  for (const x of [...openings.map(o => ({ ...o, k: "o" })), ...closings.map(c => ({ ...c, k: "c" }))]) {
    const k = bucketKey(Math.floor(x.lat / SB), Math.floor(x.lon / SB));
    let a = changeBuckets.get(k); if (!a) changeBuckets.set(k, a = []); a.push(x);
  }
  if (cells.length) rescore();
}
// Openings and closings within R miles, nearest first.
function changesNear(lat, lon, R = radius, area = null) {
  if (area) return changesNear(lat, lon, area.reach).filter(x => inArea(area, x.lat, x.lon));
  const out = [], span = R / 69 + 0.05;
  for (let bi = Math.floor((lat - span) / SB); bi <= Math.floor((lat + span) / SB); bi++)
    for (let bj = Math.floor((lon - span * 1.6) / SB); bj <= Math.floor((lon + span * 1.6) / SB); bj++)
      for (const x of changeBuckets.get(bucketKey(bi, bj)) || []) {
        const d = distMi(lat, lon, x.lat, x.lon);
        if (d <= R) out.push({ ...x, dist: d });
      }
  return out.sort((a, b) => a.dist - b.dist);
}
const countsOpening = g => viewMode === "frontier" ? roles[g] !== "none" : weights[g] > 0;
const openingsNear = (lat, lon) => changesNear(lat, lon).filter(x => x.k === "o" && countsOpening(x.g)).length;
// How many openings of the lens's chains each scored cell has within the radius, and where that ranks nationally.
function markOpenings() {
  for (const c of cells) c.op = 0;
  if (!openings.length || !cells.length) return;
  const idx = new Map(cells.map(c => [c.k, c]));
  const { latStep, lonStep, cellMi } = grid, R2 = radius * radius;
  for (const o of openings) {
    if (!countsOpening(o.g)) continue;
    const cosl = Math.cos(o.lat * Math.PI / 180), si = Math.floor(o.lat / latStep), sj = Math.floor(o.lon / lonStep);
    const di = Math.ceil(radius / cellMi) + 1, dj = Math.ceil(radius / (lonStep * 69 * cosl)) + 1;
    for (let i = si - di; i <= si + di; i++) {
      const dy = ((i + 0.5) * latStep - o.lat) * 69;
      if (dy * dy > R2) continue;
      for (let j = sj - dj; j <= sj + dj; j++) {
        const dx = ((j + 0.5) * lonStep - o.lon) * 69 * cosl;
        if (dx * dx + dy * dy > R2) continue;
        const c = idx.get(cellKey(i, j));
        if (c) c.op++;
      }
    }
  }
  setRanking("opens", cells.filter(c => c.score > 0).map(c => [c.op, 1]));
}

// Share of scored cells (areas with any tracked store nearby) at or above a score.
function topShare(score) {
  if (!cells.length || score <= 0) return null;
  let lo = 0, hi = cells.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cells[mid].score < score) lo = mid + 1; else hi = mid; }
  return (cells.length - lo) / cells.length * 100;
}

function refreshAll() {
  const all = stores.concat(extraScoring()).filter(s => inUS(s.lat, s.lon));
  buildStoreBuckets(all);
  computeGrid(all);
  computeLate(all);
  rescore();
  renderGroups();
}

function nearbyStores(lat, lon, spanDeg) {
  const out = [];
  const bi0 = Math.floor(lat / SB), bj0 = Math.floor(lon / SB);
  const si = Math.ceil(spanDeg / SB), sj = Math.ceil((spanDeg * 1.5) / SB);
  for (let i = bi0 - si; i <= bi0 + si; i++)
    for (let j = bj0 - sj; j <= bj0 + sj; j++) {
      const a = storeBuckets.get(bucketKey(i, j));
      if (a) for (const s of a) out.push(s);
    }
  return out;
}

// The city, town or community (Census place) the nearest neighborhood is mostly in, plus the city most nearby stores
// give as their address when that's different (so "Kensington Park, FL · Sarasota area"). Outside any place, or before
// the neighborhoods load, just the store address city.
function placeLabel(lat, lon) {
  const t = tractPlaces.length ? nearestTract(lat, lon, 3) : null;
  const pl = t?.pl != null ? tractPlaces[t.pl] : null, near = storeCity(lat, lon);
  if (!pl) return near || countyAt(lat, lon)?.d?.name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  const [name, st] = pl, city = near?.endsWith(", " + st) ? near.slice(0, -4) : null;
  return city && city.toLowerCase() !== name.toLowerCase() ? `${name}, ${st} · ${city} area` : `${name}, ${st}`;
}
function storeCity(lat, lon) {
  const tally = new Map();
  for (const s of nearbyStores(lat, lon, 0.5)) {
    if (!s.city || distMi(lat, lon, s.lat, s.lon) > Math.max(3, radius)) continue;
    const k = s.st ? `${s.city}, ${s.st}` : s.city;
    tally.set(k, (tally.get(k) || 0) + (s.st ? 1.01 : 1) / (1 + distMi(lat, lon, s.lat, s.lon)));
  }
  let best = null, n = 0;
  for (const [k, v] of tally) if (v > n) { best = k; n = v; }
  return best;
}

// ================= Market data (Census, Zillow) =================
function derive(d, areaM2) {
  const occ = d.occ, rnt = d.rnt;
  const out = {
    inc: d.inc || null, hv: d.hv || null, rent: d.rent || null, yb: d.yb || null,
    pti: d.inc && d.hv ? d.hv / d.inc : null,
    yld: d.hv && d.rent ? d.rent * 12 / d.hv * 100 : null,
    renter: occ ? (rnt || 0) / occ * 100 : null,
    bach: d.ed ? (d.bachN || 0) / d.ed * 100 : null,
    vac: rnt != null && d.vfr != null && (rnt + d.vfr + (d.vrno || 0)) > 0 ? d.vfr / (rnt + d.vfr + (d.vrno || 0)) * 100 : null,
    mf5: d.units ? (d.mf5n || 0) / d.units * 100 : null,
    taxr: d.tax && d.hv ? d.tax / d.hv * 100 : null,   // effective property tax rate
    risk: d.risk ?? null, lossr: d.lossr ?? null,
    jph: d.jobs != null && occ ? d.jobs / occ : null,
  };
  if (areaM2) out.dens = d.pop / (areaM2 / 2589988);
  return out;
}

function topoFeatures(topo, objName) {
  const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
  const ring = idxs => {
    const pts = [];
    idxs.forEach((i, k) => { const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse(); a.forEach((p, j) => { if (k > 0 && j === 0) return; pts.push(p); }); });
    return pts;
  };
  return topo.objects[objName].geometries.map(g => {
    if (g.type === "Polygon") return { id: g.id, name: g.properties?.name || "", type: "Polygon", coords: g.arcs.map(ring) };
    if (g.type === "MultiPolygon") return { id: g.id, name: g.properties?.name || "", type: "MultiPolygon", coords: g.arcs.map(p => p.map(ring)) };
    return null;
  }).filter(Boolean);
}
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolys(x, y, polys) {
  for (const rings of polys) {
    if (!inRing(x, y, rings[0])) continue;
    let hole = false;
    for (let h = 1; h < rings.length; h++) if (inRing(x, y, rings[h])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}
function setCounties(topo) {
  counties = topoFeatures(topo, "counties").map(f => {
    const polys = f.type === "Polygon" ? [f.coords] : f.coords;
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    for (const rings of polys) for (const [x, y] of rings[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { id: f.id, name: f.name, polys, bbox: [x0, y0, x1, y1] };
  });
  countyIdx = new Map();
  for (const c of counties)
    for (let i = Math.floor(c.bbox[1]); i <= Math.floor(c.bbox[3]); i++)
      for (let j = Math.floor(c.bbox[0]); j <= Math.floor(c.bbox[2]); j++) {
        const k = bucketKey(i, j); let a = countyIdx.get(k); if (!a) countyIdx.set(k, a = []); a.push(c);
      }
  countyCache.clear();
}
function setCountyData(j) {
  marketMeta = j.meta;
  cdata = new Map();
  for (const [fips, d] of Object.entries(j.counties)) {
    if (d.name) d.name = d.name.replace(/^(.+), \1$/, "$1");   // "District of Columbia, District of Columbia"
    const c = Object.assign({ fips }, d, derive(d));
    // Housing supply from building permits: latest full year per 1,000 people, and three years against apartment stock.
    if (d.pep && d.p5 != null) { c.mfp = d.p5 / d.pep * 1000; c.sfp = d.p1 / d.pep * 1000; }
    if (d.mf5n && d.p5_36 != null) c.mfpipe = d.p5_36 / d.mf5n * 100;
    cdata.set(fips, c);
  }
  // ZIP listing counts swing too much year to year to rank on, so inventory change is ranked by county.
  for (const k of ["dmig", "popg1", "mfpipe", "empg1", "invg"]) setRanking(k, [...cdata.values()].map(c => [c[k], c.pep || c.pop]));
  countyCache.clear();
}
function setTracts(j) {
  const c = j.cols, n = j.n, list = new Array(n);
  for (let i = 0; i < n; i++) {
    const d = { pop: c.pop[i], inc: c.inc[i], hv: c.hv[i], rent: c.rent[i], occ: c.occ[i], rnt: c.rnt[i], ed: c.ed[i], bachN: c.bachN[i],
      vfr: c.vfr[i], vrno: c.vrno[i], units: c.units[i], mf5n: c.mf5n[i], yb: c.yb[i],
      tax: c.tax?.[i], jobs: c.jobs?.[i], risk: c.risk?.[i], lossr: c.lossr?.[i], haz: c.haz?.[i] };
    const area = c.area_k[i] * 1000;
    list[i] = { lat: c.lat[i] / 1e4, lon: c.lon[i] / 1e4, area, c: j.counties[c.c[i]], d, m: derive(d, area), pl: c.pl?.[i] ?? null };
  }
  tractPlaces = j.places || [];
  tracts = list.sort((a, b) => b.area - a.area);   // big tracts first so small ones draw on top
  for (const t of tracts) t.rm = Math.sqrt(t.area / Math.PI);
  tractBuckets = new Map();
  for (const t of tracts) {
    const k = bucketKey(Math.floor(t.lat / SB), Math.floor(t.lon / SB));
    let a = tractBuckets.get(k); if (!a) tractBuckets.set(k, a = []); a.push(t);
  }
  taCache.clear(); countyCache.clear();
}
function setZips(j) {
  const c = j.cols, list = [];
  for (let i = 0; i < j.n; i++) {
    const z = { zip: String(c.zip[i]), lat: c.lat[i] / 1e4, lon: c.lon[i] / 1e4, area: c.area_k[i] * 1000 };
    for (const k of ["zhvi", "zhvi1", "zhvi5", "zori", "zori1", "zori3", "dom", "invg", "lpg", "prc"]) z[k] = c[k]?.[i] ?? null;
    z.rm = Math.sqrt(z.area / Math.PI);
    list.push(z);
  }
  zips = list.sort((a, b) => b.area - a.area);
  for (const k of ["zori1", "zhvi1"]) setRanking(k, zips.map(z => [z[k], 1]));
  zipBuckets = new Map();
  for (const z of zips) {
    const k = bucketKey(Math.floor(z.lat / SB), Math.floor(z.lon / SB));
    let a = zipBuckets.get(k); if (!a) zipBuckets.set(k, a = []); a.push(z);
  }
}
// Zillow publishes by ZIP code; the nearest ZIP center with data stands in for "the ZIP this point is in".
function zipAt(lat, lon, maxMi = 5) {
  let best = null, bd = maxMi;
  const bi0 = Math.floor(lat / SB), bj0 = Math.floor(lon / SB);
  for (let i = bi0 - 1; i <= bi0 + 1; i++)
    for (let j = bj0 - 1; j <= bj0 + 1; j++)
      for (const z of zipBuckets.get(bucketKey(i, j)) || []) {
        const d = distMi(lat, lon, z.lat, z.lon);
        if (d < bd) { bd = d; best = z; }
      }
  return best;
}
function nearestTract(lat, lon, maxMi = 8) {
  let best = null, bd = maxMi;
  const bi0 = Math.floor(lat / SB), bj0 = Math.floor(lon / SB);
  for (let i = bi0 - 1; i <= bi0 + 1; i++)
    for (let j = bj0 - 1; j <= bj0 + 1; j++)
      for (const t of tractBuckets.get(bucketKey(i, j)) || []) {
        const d = distMi(lat, lon, t.lat, t.lon);
        if (d < bd) { bd = d; best = t; }
      }
  return best;
}
// The county under a point. Boundaries come from us-atlas, which still uses Connecticut's old counties, so
// when the polygon has no data (Connecticut) the nearest neighborhood's county is used instead.
function countyAt(lat, lon) {
  if (!counties.length && !tracts.length) return null;
  const key = Math.round(lat * 50) + ":" + Math.round(lon * 50);
  if (countyCache.has(key)) return countyCache.get(key);
  let id = null;
  for (const c of countyIdx.get(bucketKey(Math.floor(lat), Math.floor(lon))) || []) {
    const [x0, y0, x1, y1] = c.bbox;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    if (inPolys(lon, lat, c.polys)) { id = c.id; break; }
  }
  if ((!id || !cdata.has(id)) && tracts.length) { const t = nearestTract(lat, lon); if (t) id = t.c; }
  const out = id ? { id, d: cdata.get(id) || null } : null;
  if (countyCache.size > 200000) countyCache.clear();
  countyCache.set(key, out);
  return out;
}

// Combines neighborhoods whose center sits within R miles. Medians can't be combined exactly, so these are
// household-weighted averages of each neighborhood's median.
// zone: a drive-time area to use instead of the R-mile circle (tracts count when their center is inside it).
function tradeArea(lat, lon, R, zone = null) {
  if (!tracts.length) return null;
  const key = zone ? zone.key : Math.round(lat * 40) + ":" + Math.round(lon * 40) + ":" + R;
  if (taCache.has(key)) return taCache.get(key);
  let n = 0, pop = 0, area = 0, incW = 0, incH = 0, hvW = 0, hvO = 0, rentW = 0, rentR = 0, ed = 0, bachN = 0, occ = 0, rnt = 0,
    vfr = 0, vrno = 0, units = 0, mf5n = 0, ybW = 0, ybU = 0, jobs = 0, jobsN = 0, taxW = 0, taxO = 0, riskW = 0, lossW = 0, riskH = 0;
  const hazW = new Map();
  const span = (zone ? zone.reach : R) / 69 + 0.05;
  for (let bi = Math.floor((lat - span) / SB); bi <= Math.floor((lat + span) / SB); bi++)
    for (let bj = Math.floor((lon - span * 1.6) / SB); bj <= Math.floor((lon + span * 1.6) / SB); bj++) {
      for (const t of tractBuckets.get(bucketKey(bi, bj)) || []) {
        if (zone ? !inArea(zone, t.lat, t.lon) : Math.abs(t.lat - lat) > span || distMi(lat, lon, t.lat, t.lon) > R) continue;
        const x = t.d; n++;
        pop += x.pop || 0; area += t.area;
        if (x.inc && x.occ) { incW += x.inc * x.occ; incH += x.occ; }
        const owners = (x.occ || 0) - (x.rnt || 0);
        if (x.hv && owners > 0) { hvW += x.hv * owners; hvO += owners; }
        if (x.rent && x.rnt) { rentW += x.rent * x.rnt; rentR += x.rnt; }
        if (x.yb && x.units) { ybW += x.yb * x.units; ybU += x.units; }
        ed += x.ed || 0; bachN += x.bachN || 0; occ += x.occ || 0; rnt += x.rnt || 0;
        vfr += x.vfr || 0; vrno += x.vrno || 0; units += x.units || 0; mf5n += x.mf5n || 0;
        if (x.jobs != null) { jobs += x.jobs; jobsN++; }
        if (x.tax && owners > 0) { taxW += x.tax * owners; taxO += owners; }
        if (x.risk != null && x.occ) {
          riskW += x.risk * x.occ; lossW += (x.lossr || 0) * x.occ; riskH += x.occ;
          if (x.haz != null) hazW.set(x.haz, (hazW.get(x.haz) || 0) + (x.lossr || 0) * x.occ);
        }
      }
    }
  let out = null;
  if (n) {
    const inc = incH ? incW / incH : null, hv = hvO ? hvW / hvO : null, rent = rentR ? rentW / rentR : null;
    out = { n, pop, inc, hv, rent, pti: inc && hv ? hv / inc : null, yld: hv && rent ? rent * 12 / hv * 100 : null,
      bach: ed ? bachN / ed * 100 : null, renter: occ ? rnt / occ * 100 : null,
      vac: rnt + vfr + vrno > 0 ? vfr / (rnt + vfr + vrno) * 100 : null, mf5: units ? mf5n / units * 100 : null,
      yb: ybU ? ybW / ybU : null, dens: area ? pop / (area / 2589988) : null,
      jobs: jobsN ? jobs : null, jph: jobsN && occ ? jobs / occ : null,
      taxr: taxO && hv ? taxW / taxO / hv * 100 : null,
      risk: riskH ? riskW / riskH : null, lossr: riskH ? lossW / riskH : null,
      haz: hazW.size ? [...hazW].reduce((a, b) => b[1] > a[1] ? b : a)[0] : null };
  }
  if (taCache.size > 50000) taCache.clear();
  taCache.set(key, out);
  return out;
}
function areaDemo(lat, lon) {
  const ta = tradeArea(lat, lon, radius);
  const cty = countyAt(lat, lon), cd = cty?.d;
  const z = zipAt(lat, lon);
  const pick = k => ta?.[k] ?? cd?.[k] ?? null;
  const d = { ta, cty, z, inc: pick("inc"), hv: pick("hv"), rent: pick("rent"), pti: pick("pti"), yld: pick("yld"), renter: pick("renter"),
    taxr: pick("taxr"), risk: pick("risk"), popg: cd?.popg ?? null, ...marketOf(cd, z),
    opens: changesMeta ? openingsNear(lat, lon) : null };
  d.mom = momentum(d);
  return d;
}

// ---------- Market momentum ----------
// Where demand is heading now, read from the market data rather than the chains. Each part is ranked against the
// rest of the US (counties weighted by population, ZIP codes equally) and the ranks averaged, so 50 is a typical
// place. Chain clusters mark proven demand but not momentum, so the investor lenses rank Top areas on both.
const MOMENTUM = {
  mf: [["dmig", "migration"], ["popg1", "population growth last year"], ["empg1", "job growth"], ["zori1", "1-year rent change"],
    ["mfpipe", "apartment pipeline", -1], ["opens", "chain openings nearby"]],
  sf: [["dmig", "migration"], ["popg1", "population growth last year"], ["empg1", "job growth"], ["zhvi1", "1-year home value change"],
    ["invg", "for-sale listings change", -1], ["opens", "chain openings nearby"]],
};
const OVERALL_MIX = 0.5;   // share of the overall rank that comes from the signal score; the rest is momentum
const marketOf = (cd, z) => ({ dmig: cd?.dmig ?? null, popg1: cd?.popg1 ?? null, mfpipe: cd?.mfpipe ?? null,
  empg1: cd?.empg1 ?? null, invg: cd?.invg ?? null,
  zori1: z?.zori1 ?? cd?.zori1 ?? null, zhvi1: z?.zhvi1 ?? cd?.zhvi1 ?? null });
const rankings = {};
function setRanking(k, pairs) {
  const v = pairs.filter(([x, w]) => x != null && isFinite(x) && w > 0).sort((a, b) => a[0] - b[0]);
  const cum = new Float64Array(v.length + 1);
  v.forEach(([, w], i) => { cum[i + 1] = cum[i] + w; });
  rankings[k] = { x: v.map(p => p[0]), cum };
}
// Percent of the US below v, counting ties as half.
function pctRank(k, v) {
  const r = rankings[k];
  if (!r || !r.x.length || v == null || !isFinite(v)) return null;
  const bound = up => { let lo = 0, hi = r.x.length; while (lo < hi) { const m = (lo + hi) >> 1; if (r.x[m] < v || (up && r.x[m] === v)) lo = m + 1; else hi = m; } return lo; };
  const a = bound(false), b = bound(true);
  return (r.cum[a] + (r.cum[b] - r.cum[a]) / 2) / r.cum[r.x.length] * 100;
}
// d holds a place's market figures (see marketOf). Null for lenses without a momentum measure, or with under two parts.
function momentum(d, id = lens) {
  const spec = MOMENTUM[id];
  if (!spec || !d) return null;
  const parts = spec.map(([k, label, dir]) => { const p = pctRank(k, d[k]); return { k, label, inv: dir < 0, p: p == null ? null : dir < 0 ? 100 - p : p }; });
  const ok = parts.filter(x => x.p != null);
  return ok.length >= 2 ? { score: ok.reduce((a, x) => a + x.p, 0) / ok.length, parts: ok } : null;
}
const overallOf = (score, mom) => mom && maxW ? Math.round(100 * (OVERALL_MIX * score / maxW + (1 - OVERALL_MIX) * mom.score / 100)) : null;
const nth = p => { const n = Math.min(99, Math.max(1, Math.round(p))); return n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"); };

async function loadMarket() {
  setMarketPill("busy", "Loading market data");
  getJSON(dataUrl("landlord.json")).then(j => { landlord = j; if (reportAt) renderReport(); }).catch(e => console.warn(e));
  getJSON(dataUrl("changes.json")).then(setChanges).catch(e => console.warn(e));
  try {
    const [topo, cj, zj] = await Promise.all([getJSON(dataUrl("counties-10m.json")), getJSON(dataUrl("counties.json")), getJSON(dataUrl("zips.json"))]);
    setCounties(topo); setCountyData(cj); setZips(zj); buildCountyLayer();
    market.counties = market.zips = true; afterMarket();
    setMarketPill("busy", "Loading neighborhoods");
    setTracts(await getJSON(dataUrl("tracts.json")));
    market.tracts = true; afterMarket();
    setMarketPill("ok", `${fmt(tracts.length)} neighborhoods`);
  } catch (e) {
    console.warn(e);
    market.error = true;
    setMarketPill("", "Market data didn't load");
    toast("Market data didn't load. Store scores still work; reload to try again.", true);
  }
}
function setMarketPill(cls, text) {
  const p = $("mktPill"); p.className = "pill " + cls;
  p.innerHTML = `<span class="dot"></span>${escapeHtml(text)}`;
}
function afterMarket() {
  updateCensusLayers(); renderLegend(); updateTop(); renderSources(); renderDeals(); renderCompare();
  if (reportAt) renderReport();
}

// ---------- drawing ----------
function colorFor(v, key) {
  if (!hasMetric(key) || v == null || !isFinite(v)) return null;
  const c = METRICS[key];
  let i = 0; while (i < c.breaks.length && v >= c.breaks[i]) i++;
  return c.colors[i];
}
let countyLayer = null, censusMode = null;   // censusMode: "county" | "tract" | "zip" | null
function countyStyle(f) {
  const d = censusMode === "county" || censusMode === "zip" ? cdata.get(f.properties.id) : null;
  const col = d ? colorFor(d[colorBy], colorBy) : null;
  const fade = censusMode === "zip" ? 0.4 : 0.92;   // under ZIP circles the county fill is context, not the subject
  return { stroke: true, color: dark ? "#1a1a19" : "#ffffff", weight: 0.5, opacity: 0.8, fill: !!col, fillColor: col || "#000", fillOpacity: col ? shadeOpacity * fade : 0 };
}
function buildCountyLayer() {
  if (countyLayer) map.removeLayer(countyLayer);
  const features = counties.map(c => ({ type: "Feature", properties: { id: c.id }, geometry: { type: "MultiPolygon", coordinates: c.polys } }));
  countyLayer = L.geoJSON({ type: "FeatureCollection", features }, {
    pane: "census", interactive: false, renderer: L.canvas({ pane: "census", padding: 0.3 }), style: countyStyle,
  });
}
// Draws one circle per tract or ZIP, sized to its land area. options.mode picks which censusMode it serves.
const CirclesLayer = L.GridLayer.extend({
  createTile(coords) {
    const tile = document.createElement("canvas");
    const size = this.getTileSize(), dpr = window.devicePixelRatio || 1;
    tile.width = size.x * dpr; tile.height = size.y * dpr; tile.style.width = size.x + "px"; tile.style.height = size.y + "px";
    const isZip = this.options.mode === "zip";
    const buckets = isZip ? zipBuckets : tractBuckets;
    if (censusMode !== this.options.mode || !buckets.size) return tile;
    const key = colorBy;
    const ctx = tile.getContext("2d"); ctx.scale(dpr, dpr);
    const z = coords.z, m = this._map, origin = coords.scaleBy(size);
    const nw = m.unproject(origin, z), se = m.unproject(origin.add(size), z);
    const padDeg = 1.2;
    ctx.globalAlpha = shadeOpacity * 0.92;
    if (isZip) { ctx.lineWidth = 1; ctx.strokeStyle = dark ? "#1a1a19" : "#ffffff"; }
    for (let bi = Math.floor((se.lat - padDeg) / SB); bi <= Math.floor((nw.lat + padDeg) / SB); bi++)
      for (let bj = Math.floor((nw.lng - padDeg) / SB); bj <= Math.floor((se.lng + padDeg) / SB); bj++) {
        const arr = buckets.get(bucketKey(bi, bj));
        if (!arr) continue;
        for (const t of arr) {
          const col = colorFor(isZip ? t[key] : t.m[key], key);
          if (!col) continue;
          const mpp = 156543.03392 * Math.cos(t.lat * Math.PI / 180) / Math.pow(2, z);
          const r = Math.max(isZip ? 3 : 1.4, t.rm / mpp);
          const p = m.project([t.lat, t.lon], z).subtract(origin);
          if (p.x < -r || p.y < -r || p.x > size.x + r || p.y > size.y + r) continue;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
          if (isZip) ctx.stroke();
        }
      }
    return tile;
  },
});
const tractLayer = new CirclesLayer({ pane: "census", mode: "tract", updateWhenZooming: false, noWrap: true });
const zipLayer = new CirclesLayer({ pane: "census", mode: "zip", updateWhenZooming: false, noWrap: true });
tractLayer.addTo(map); zipLayer.addTo(map);

function wantedCensusMode() {
  if (!hasMetric(colorBy)) return null;
  const m = METRICS[colorBy], zoomedIn = map.getZoom() >= TRACT_MIN_ZOOM;
  if (m.scope === "c") return m.zip && zoomedIn && market.zips ? "zip" : market.counties ? "county" : null;
  if (!zoomedIn && m.county && market.counties) return "county";
  return market.tracts ? "tract" : (m.county && market.counties ? "county" : null);
}
function updateCensusLayers() {
  censusMode = wantedCensusMode();
  if (countyLayer) {
    if (censusMode === "county" || censusMode === "zip") { countyLayer.setStyle(countyStyle); if (!map.hasLayer(countyLayer)) countyLayer.addTo(map); }
    else if (map.hasLayer(countyLayer)) map.removeLayer(countyLayer);
  }
  tractLayer.redraw(); zipLayer.redraw();
  signalLayer.redraw();
}
map.on("zoomend", () => { if (hasMetric(colorBy) && wantedCensusMode() !== censusMode) { updateCensusLayers(); renderLegend(); } });

function fillColorBy() {
  const sel = $("colorBy");
  sel.innerHTML = `<option value="score">${viewMode === "frontier" ? "Frontier areas" : "Signal score"}</option>` +
    COLOR_GROUPS.map(([label, keys]) => `<optgroup label="${escapeHtml(label)}">${keys.map(k => `<option value="${k}">${escapeHtml(METRICS[k].name)}</option>`).join("")}</optgroup>`).join("");
  sel.value = colorBy;
}
function setColorBy(v) {
  colorBy = hasMetric(v) ? v : "score";
  $("colorBy").value = colorBy;
  updateCensusLayers(); renderLegend(); syncUrl();
}
function renderLegend() {
  const ramp = $("ramp"), note = $("lnote");
  if (colorBy === "score") {
    const steps = viewMode === "frontier" ? FRONT_RAMP : SCORE_RAMP;
    ramp.innerHTML = steps.map(([t, col], i) => `<div><span style="background:${col}"></span>${maxW ? (i === 0 ? "1+" : Math.max(1, Math.ceil(t * maxW - 1e-9)) + "+") : ""}</div>`).join("");
    note.textContent = !maxW ? "Turn on at least one signal to see scores."
      : viewMode === "frontier" ? `Early movers within ${radius} mi, in areas that pass the frontier test. Click anywhere for a site report.`
      : `Points within ${radius} mi, out of ${maxW}. Shaded from ${threshold()} points. Click anywhere for a site report.`;
    return;
  }
  const m = METRICS[colorBy];
  ramp.innerHTML = m.colors.map((col, i) => {
    const lab = i === 0 ? "<" + m.tick(m.breaks[0]) : i === m.colors.length - 1 ? m.tick(m.breaks[i - 1]) + "+" : m.tick(m.breaks[i - 1]);
    return `<div><span style="background:${col}"></span>${escapeHtml(lab)}</div>`;
  }).join("");
  const loading = censusMode == null ? (market.error ? "Market data didn't load. " : "Loading… ") : "";
  const level = censusMode === "county" ? (m.scope === "t" || m.zip ? `By county at this zoom; zoom in for ${m.zip ? "ZIP codes" : "neighborhoods"}.` : "By county.")
    : censusMode === "tract" ? "By neighborhood (census tract)."
    : censusMode === "zip" ? "Circles are ZIP codes; the faint fill behind them is the county." : "";
  const when = !marketMeta ? ""
    : /^z(ori|hvi)/.test(colorBy) ? ` Through ${monthName(colorBy.startsWith("zori") ? marketMeta.zori : marketMeta.zhvi)}.`
    : ["mfpipe", "mfp", "sfp"].includes(colorBy) ? ` Census building permits, ${colorBy === "mfpipe" ? `${marketMeta.permits - 2}–${marketMeta.permits}` : marketMeta.permits}.`
    : ["empg1", "wageg1"].includes(colorBy) ? ` ${marketMeta.qcew}.`
    : colorBy === "jph" ? ` Jobs ${marketMeta.lodes}, households ACS ${marketMeta.acs}.`
    : ["risk", "lossr"].includes(colorBy) ? ` ${marketMeta.nri} release.`
    : ["dom", "invg", "prc"].includes(colorBy) ? ` ${monthName(marketMeta.rdc)}.`
    : ["avac", "conc"].includes(colorBy) ? ` ${monthName(marketMeta.aptlist)}.`
    : m.scope === "t" ? ` ACS ${marketMeta.acs}.` : "";
  note.textContent = `${loading}${m.note}${when} ${level}`.trim();
}
$("colorBy").addEventListener("change", e => setColorBy(e.target.value));
$("opacity").addEventListener("input", e => {
  shadeOpacity = +e.target.value / 100;
  signalLayer.redraw(); tractLayer.redraw(); zipLayer.redraw();
  if (countyLayer && (censusMode === "county" || censusMode === "zip")) countyLayer.setStyle(countyStyle);
});
$("legendMin").addEventListener("click", () => {
  const card = $("legendCard"), min = card.classList.toggle("min");
  $("legendMin").setAttribute("aria-expanded", String(!min));
  $("legendMin").style.transform = min ? "rotate(180deg)" : "";
});

// ================= Top areas =================
const CHIP = {
  inc: d => d.inc && `<b>${money(d.inc)}</b> income`,
  hv: d => d.hv && `<b>${money(d.hv)}</b> home`,
  rent: d => d.rent && `<b>${dollars(d.rent)}</b> rent`,
  pti: d => d.pti && `<b>${d.pti.toFixed(1)}×</b> income`,
  yld: d => d.yld && `<b>${d.yld.toFixed(1)}%</b> yield`,
  renter: d => d.renter != null && `<b>${Math.round(d.renter)}%</b> renters`,
  popg: d => d.popg != null && `<b>${pct(d.popg)}</b> county pop`,
  dmig: d => d.dmig != null && `<b>${pct(d.dmig)}</b> migration`,
  zori1: d => d.zori1 != null && `<b>${pct(d.zori1)}</b> rent 1-yr`,
  mfpipe: d => d.mfpipe != null && `<b>${d.mfpipe.toFixed(1)}%</b> pipeline`,
  popg1: d => d.popg1 != null && `<b>${pct(d.popg1)}</b> pop last yr`,
  zhvi1: d => d.zhvi1 != null && `<b>${pct(d.zhvi1)}</b> home value 1-yr`,
  sig: d => d.score != null && `<b>${d.score}/${maxW}</b> signals`,
  mom: d => d.mom && `<b>${Math.round(d.mom.score)}</b> momentum`,
  empg1: d => d.empg1 != null && `<b>${pct(d.empg1)}</b> jobs`,
  risk: d => d.risk != null && `<b>${Math.round(d.risk)}</b> hazard risk`,
  opens: d => d.opens > 0 && `<b>${d.opens}</b> ${d.opens === 1 ? "opening" : "openings"}`,
};
const OVERALL_CHIPS = { mf: ["sig", "mom", "empg1", "zori1", "mfpipe", "opens"], sf: ["sig", "mom", "empg1", "zhvi1", "pti", "opens"] };
const SORT_ASC = new Set(["pti", "mfpipe", "risk"]);   // lower is better
// Equal scores are common at the top. The investor lenses put the faster-growing county first: chain clusters mark
// proven demand, not momentum, and store count (the fallback) favors built-out retail hubs.
const TIE_BY = { mf: "popg", sf: "popg", frontier: "popg" };
function passes(d) {
  if (filt.inc > 0 && !(d.inc >= filt.inc)) return false;
  if (filt.pti > 0 && !(d.pti != null && d.pti <= filt.pti)) return false;
  if (filt.renter > 0 && !(d.renter >= filt.renter)) return false;
  if (filt.popg > -999 && !(d.popg >= filt.popg)) return false;
  if (filt.zori1 > -999 && !(d.zori1 >= filt.zori1)) return false;
  if (filt.pipe > 0 && !(d.mfpipe != null && d.mfpipe <= filt.pipe)) return false;
  if (filt.empg > -999 && !(d.empg1 >= filt.empg)) return false;
  if (filt.risk > 0 && !(d.risk != null && d.risk <= filt.risk)) return false;
  return true;
}
const filtering = () => filt.inc > 0 || filt.pti > 0 || filt.renter > 0 || filt.popg > -999 || filt.zori1 > -999 || filt.pipe > 0 || filt.empg > -999 || filt.risk > 0;
// A ranked row: the overall rank out of 100 when there is one, otherwise the signal score.
function rankRow(score, ov, chips) {
  const f = ov != null ? ov / 100 : maxW ? score / maxW : 0, of = t => `<span style="color:var(--muted);font-weight:500">/${t}</span>`;
  return `<span class="tname"></span><span class="tscore">${ov != null ? ov + of(100) : score + of(maxW)}</span>
    <span class="tbar"><i style="width:${Math.round(f * 100)}%;background:${stepColor(f)}"></i></span>${chips ? `<span class="chips">${chips}</span>` : ""}`;
}
let topItems = [];
function updateTop() {
  const ol = $("top"); ol.innerHTML = "";
  const empty = $("topEmpty");
  topItems = [];
  if (!stores.length) { empty.textContent = "Loading store data…"; empty.hidden = false; return; }
  if (!cells.length || maxW === 0) { empty.textContent = "Turn on at least one signal in the Signals tab."; empty.hidden = false; return; }
  const haveDemo = market.counties || market.tracts;
  const useFilters = filtering() && haveDemo;
  const overall = sortBy === "overall" && haveDemo && !!MOMENTUM[lens];
  const ranked = sortBy !== "score" && !overall && haveDemo;
  const tie = sortBy === "score" && haveDemo ? TIE_BY[lens] : null;
  $("topNote").hidden = !overall;
  if (overall) {
    const parts = MOMENTUM[lens].map(([, label, dir]) => dir < 0 ? `${label} (less is better)` : label);
    $("topNote").textContent = `Overall is half the signal score and half market momentum: how the area ranks against the rest of the US on ${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}.`;
  }
  const onlyView = $("inView").checked, bnd = map.getBounds();
  const sep = Math.max(12, radius * 3);
  const limit = ranked || tie ? 160 : 25;
  const th = threshold();
  const picks = [];
  let checks = 0;
  if (overall) {
    // Spacing areas out keeps the first cell found in each cluster, which for the overall rank would be the busiest
    // retail spot rather than the best one. So rank a wide pool first, one cell per ~3-mile square, using only the
    // county and ZIP figures momentum needs (cheap), then space them out and fetch trade areas for the survivors.
    const pool = [], seen = new Set();
    for (let idx = cells.length - 1; idx >= 0 && pool.length < 3000; idx--) {
      const c = cells[idx];
      if (c.score <= 0 || c.score < th) break;
      if (onlyView && !bnd.contains([c.lat, c.lon])) continue;
      const bin = Math.floor(c.lat * 20) * 100000 + Math.floor(c.lon * 20);
      if (seen.has(bin)) continue;
      seen.add(bin);
      const m = { ...marketOf(countyAt(c.lat, c.lon)?.d, zipAt(c.lat, c.lon)), opens: changesMeta ? c.op : null };
      pool.push({ c, ov: overallOf(c.score, momentum(m)) });
    }
    pool.sort((a, b) => (b.ov ?? -1) - (a.ov ?? -1) || b.c.score - a.c.score);
    for (const { c, ov } of pool) {
      if (picks.length >= 25 || checks >= 8000) break;
      if (picks.some(q => distMi(q.c.lat, q.c.lon, c.lat, c.lon) < sep)) continue;
      checks++;
      const d = areaDemo(c.lat, c.lon);
      if (useFilters && !passes(d)) continue;
      d.score = c.score; d.overall = ov;
      picks.push({ c, d });
    }
  } else for (let idx = cells.length - 1; idx >= 0 && picks.length < limit && checks < 8000; idx--) {
    const c = cells[idx];
    if (c.score <= 0 || c.score < th) break;
    if (onlyView && !bnd.contains([c.lat, c.lon])) continue;
    if (picks.some(p => distMi(p.c.lat, p.c.lon, c.lat, c.lon) < sep)) continue;
    let d = {};
    if (haveDemo) { checks++; d = areaDemo(c.lat, c.lon); if (useFilters && !passes(d)) continue; }
    d.score = c.score;
    picks.push({ c, d });
  }
  if (ranked) {
    const asc = SORT_ASC.has(sortBy);
    picks.sort((a, b) => {
      const x = a.d[sortBy], y = b.d[sortBy];
      if (x == null) return 1; if (y == null) return -1;
      return asc ? x - y : y - x;
    });
    picks.length = Math.min(picks.length, 25);
  } else if (tie) {
    const v = p => p.d[tie] ?? -1e9;
    picks.sort((a, b) => b.c.score - a.c.score || v(b) - v(a));
    picks.length = Math.min(picks.length, 25);
  }
  if (!picks.length) {
    empty.textContent = filtering() && !haveDemo ? "Loading market data for the filters…"
      : useFilters ? "No areas match these filters. Loosen one, lower the score threshold, or widen the map view."
      : viewMode === "frontier" ? "No frontier areas match. Require fewer early movers or allow one late anchor."
      : "No areas in this view reach the score threshold.";
    empty.hidden = false; return;
  }
  empty.hidden = true;
  const chipKeys = (overall ? OVERALL_CHIPS[lens] : LENS_CHIPS[lens]).slice();
  if (ranked && !chipKeys.includes(sortBy)) chipKeys.unshift(sortBy);
  for (const { c, d } of picks) {
    const li = document.createElement("li");
    li.tabIndex = 0;
    li.innerHTML = rankRow(c.score, overall ? d.overall : null, haveDemo ? chipKeys.map(k => { const h = CHIP[k](d); return h ? `<span class="chip${ranked && k === sortBy ? " hl" : ""}">${h}</span>` : ""; }).join("") : "");
    li.querySelector(".tname").textContent = placeLabel(c.lat, c.lon);
    const go = () => {
      map.flyTo([c.lat, c.lon], Math.max(map.getZoom(), 11), { duration: 0.8 });
      openReport(c.lat, c.lon);
      ol.querySelectorAll("li.on").forEach(x => x.classList.remove("on")); li.classList.add("on");
    };
    li.addEventListener("click", go);
    li.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    ol.appendChild(li);
    topItems.push(c);
  }
}
$("topExport").addEventListener("click", () => {
  if (!topItems.length) { toast("No areas to export yet.", true); return; }
  const sites = topItems.map((c, i) => siteMetrics(c.lat, c.lon, null, { Rank: i + 1 }));
  downloadCSV(`retail-signal-top-areas-${lens}-${today()}.csv`, sites);
});
let moveT;
map.on("moveend", () => { syncUrl(); if ($("inView").checked) { clearTimeout(moveT); moveT = setTimeout(updateTop, 150); } });

// ================= Site report =================
const siteLayer = L.layerGroup().addTo(map);
// Centers the map on a spot in the part of the map the report panel doesn't cover (it covers the right side on wide
// screens and the bottom on narrow ones), so a pinned address isn't hidden behind its own report.
function flyToSpot(lat, lon, zoom) {
  const el = $("report"), m = $("map").getBoundingClientRect();
  if (el.hidden) { map.flyTo([lat, lon], zoom, { duration: 0.8 }); return; }
  const r = el.getBoundingClientRect(), wide = r.width < m.width * 0.8;
  const dx = wide ? (r.width + 12) / 2 : 0, dy = wide ? 0 : r.height / 2;
  const target = map.unproject(map.project([lat, lon], zoom).add([dx, dy]), zoom);
  map.flyTo(target, zoom, { duration: 0.8 });
}
// pin: the spot is an exact address or coordinates the visitor typed, so it's marked with a pin rather than a dot.
function openReport(lat, lon, label, pin = false) {
  if (!stores.length) return;
  reportAt = { lat, lon, label: label || null, pin };
  drawSite();
  renderReport();
  const el = $("report");
  el.hidden = false; $("mapwrap").classList.add("has-report");
  syncUrl();
}
function drawSite() {
  siteLayer.clearLayers();
  if (!reportAt) return;
  const ink = dark || basemap === "satellite" ? "#ffffff" : "#111110";
  const style = { pane: "site", color: ink, weight: 1.5, opacity: 0.8, dashArray: "5 5", fill: true, fillColor: ink, fillOpacity: 0.04, interactive: false };
  const area = reportArea();
  if (area) L.polygon(area.latlngs, style).addTo(siteLayer);
  else L.circle([reportAt.lat, reportAt.lon], { ...style, radius: radius * 1609.34 }).addTo(siteLayer);
  if (reportAt.pin) {
    const pin = L.marker([reportAt.lat, reportAt.lon], { pane: "site", interactive: false, keyboard: false,
      icon: L.divIcon({ className: "addr-pin", html: '<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 31s10-11.4 10-19A10 10 0 0 0 2 12c0 7.6 10 19 10 19Z"/><circle cx="12" cy="12" r="4"/></svg>', iconSize: [24, 32], iconAnchor: [12, 31] }) });
    if (reportAt.label) pin.bindTooltip(reportAt.label, { permanent: true, direction: "top", offset: [0, -30], className: "addr-tip", interactive: false });
    pin.addTo(siteLayer);
  } else L.circleMarker([reportAt.lat, reportAt.lon], { pane: "site", radius: 6.5, color: "#ffffff", weight: 2.5, fillColor: "#2a78d6", fillOpacity: 1, interactive: false }).addTo(siteLayer);
}
// ---------- Drive-time trade areas (site reports) ----------
// Areas reachable by car in 10 or 20 minutes, from the FOSSGIS public Valhalla server (OpenStreetMap roads, no
// traffic). It's for light use, so each spot and time is asked for once and kept for the session.
const VALHALLA = "https://valhalla1.openstreetmap.de/isochrone";
const DRIVE_TIMES = [10, 20];
let taMode = 0;                  // 0: the radius circle; otherwise minutes of driving
const isoCache = new Map();      // isoKey -> area, "loading", or null when it failed
const isoKey = (lat, lon, min) => `${lat.toFixed(4)},${lon.toFixed(4)},${min}`;
function reportArea() {
  const a = taMode && reportAt ? isoCache.get(isoKey(reportAt.lat, reportAt.lon, taMode)) : null;
  return a && a !== "loading" ? a : null;
}
async function loadIso(lat, lon, min) {
  const k = isoKey(lat, lon, min);
  isoCache.set(k, "loading");
  try {
    const q = { locations: [{ lat, lon }], costing: "auto", contours: [{ time: min }], polygons: true, denoise: 0.5, generalize: 120 };
    const r = await fetch(`${VALHALLA}?json=${encodeURIComponent(JSON.stringify(q))}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const g = (await r.json()).features?.[0]?.geometry;
    const polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : null;
    if (!polys?.length) throw new Error("No drive-time area came back");
    // Rings are [lon, lat]. The bounding box and reach (farthest edge) let lookups skip everything outside.
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90, reach = 0;
    for (const p of polys) for (const [x, y] of p[0]) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      reach = Math.max(reach, distMi(lat, lon, y, x));
    }
    isoCache.set(k, { key: "iso:" + k, min, polys, bbox: [x0, y0, x1, y1], reach: Math.min(reach, 60),
      latlngs: polys.map(p => p.map(ring => ring.map(([x, y]) => [y, x]))) });
  } catch (e) {
    console.warn(e);
    isoCache.set(k, null);
  }
  if (reportAt && isoKey(reportAt.lat, reportAt.lon, taMode) === k) { renderReport(); drawSite(); }
}
function inArea(a, lat, lon) {
  const [x0, y0, x1, y1] = a.bbox;
  return lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1 && inPolys(lon, lat, a.polys);
}
function closeReport() {
  reportAt = null; siteLayer.clearLayers();
  $("report").hidden = true; $("mapwrap").classList.remove("has-report");
  $("top").querySelectorAll("li.on").forEach(x => x.classList.remove("on"));
  syncUrl();
}
const KPI = {
  inc: ["Household income", ta => money(ta.inc)],
  hv: ["Home value", ta => money(ta.hv)],
  rent: ["Rent per month", ta => dollars(ta.rent)],
  pti: ["Home price to income", ta => ta.pti ? ta.pti.toFixed(1) + "×" : "–"],
  yld: ["Gross rent yield", ta => ta.yld ? ta.yld.toFixed(1) + "%" : "–"],
  renter: ["Renter households", ta => share(ta.renter)],
  vac: ["Rental vacancy", ta => share(ta.vac, 1)],
  mf5: ["Homes in 5+ unit buildings", ta => share(ta.mf5)],
  yb: ["Median year built", ta => ta.yb ? String(Math.round(ta.yb)) : "–"],
  bach: ["Bachelor's or higher", ta => share(ta.bach)],
  dens: ["People per sq mi", ta => ta.dens ? fmt(Math.round(ta.dens)) : "–"],
  pop: ["People", ta => big(ta.pop)],
  jobs: ["Jobs located here", ta => big(ta.jobs)],
  taxr: ["Property tax rate", ta => ta.taxr ? ta.taxr.toFixed(2) + "%" : "–"],
  risk: ["Hazard risk score", ta => ta.risk != null ? `${Math.round(ta.risk)} of 100` : "–"],
};
// The score at an exact point: closest store of each signal, and how many tracked stores sit within the radius.
// With a drive-time area, a signal counts when any of its stores is inside it; near still holds the closest store.
function scoreAt(lat, lon, area = null) {
  const near = GROUPS.map(() => null), inside = GROUPS.map(() => null);
  let within = 0;
  for (const s of nearbyStores(lat, lon, 1)) {
    const d = distMi(lat, lon, s.lat, s.lon), ins = area ? inArea(area, s.lat, s.lon) : d <= radius;
    if (ins) { within++; if (!inside[s.g] || d < inside[s.g].d) inside[s.g] = { d, s }; }
    const cur = near[s.g];
    if (!cur || d < cur.d) near[s.g] = { d, s };
  }
  const frontier = viewMode === "frontier";
  let score = 0;
  inside.forEach((n, g) => { if (n) score += frontier ? (roles[g] === "early" ? 1 : 0) : weights[g]; });
  const lateNear = GROUPS.map((g, i) => roles[i] === "late" && near[i] && near[i].d <= lateRadius ? `${g.name} (${near[i].d.toFixed(1)} mi)` : null).filter(Boolean);
  const qualifies = frontier && score >= minEarly && lateNear.length <= maxLate;
  return { near, inside, within, score, frontier, lateNear, qualifies };
}
const shareLabel = s => s == null ? "" : s < 1 ? "Top 1% of scored US areas" : s <= 50 ? `Top ${Math.ceil(s)}% of scored US areas` : "Below the median scored area";
const chg = v => `<span class="${tone(v)}">${pct(v)}</span>`;
const chgWorse = v => `<span class="${tone(-v)}">${pct(v)}</span>`;   // a rise is bad news (listings, vacancy)
const ptsWorse = v => v == null ? "–" : `<span class="${tone(-v)}">${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} pts</span>`;
const HAZARD_NAMES = { HRCN: "hurricanes", CFLD: "coastal flooding", IFLD: "inland flooding", WFIR: "wildfire", TRND: "tornadoes", HAIL: "hail",
  SWND: "strong wind", ERQK: "earthquakes", WNTW: "winter weather", HWAV: "heat waves", CWAV: "cold waves", LNDS: "landslides", LTNG: "lightning",
  ISTM: "ice storms", AVLN: "avalanches", TSUN: "tsunamis", VLCN: "volcanoes" };
const hazardName = i => i == null ? null : HAZARD_NAMES[marketMeta?.hazards?.[i]] || null;
const RENT_RULE = { statewide_cap: "Statewide rent cap", local: "Rent control in some localities", allowed: "Allowed, none adopted",
  preempted: "Rent control banned by state law", none: "No rent control" };
let landlord = null;   // state landlord-tenant rules (data/landlord.json)
const stateOf = cd => toAbbr((cd?.name || "").split(", ").pop());
// Costs an owner carries that the score doesn't see: property taxes, natural hazard exposure and state landlord rules.
function costRows(ta, cd) {
  const rows = [];
  if (ta?.taxr || cd?.taxr) rows.push(["Property tax rate", ta?.taxr ? ta.taxr.toFixed(2) + "%" : "–",
    `Median property taxes ÷ median home value, trade area${cd?.taxr ? ` · county ${cd.taxr.toFixed(2)}%` : ""}`]);
  const rk = ta?.risk != null ? ta : cd;
  if (rk?.risk != null) {
    const hz = hazardName(rk.haz);
    rows.push([`Natural hazard risk (FEMA, ${escapeHtml(marketMeta?.nri || "")})`, `${Math.round(rk.risk)} of 100`,
      `${rk.lossr != null ? `Expected building losses about $${fmt(Math.round(rk.lossr / 10) * 10)} a year per $1M of value` : "National percentile"}${hz ? `, mostly ${hz}` : ""}`]);
  }
  const st = stateOf(cd), law = landlord?.states?.[st];
  if (law) {
    const src = safeUrl(law.sources?.[0]);
    rows.push([`Landlord rules, ${st}`, escapeHtml(RENT_RULE[law.rent] || law.rent),
      `${escapeHtml(law.rent_note)}${law.just_cause ? " Statewide just-cause eviction." : ""}${law.just_cause_note && !law.just_cause ? " " + escapeHtml(law.just_cause_note) : ""} Notice before filing for unpaid rent: ${law.notice == null ? "unclear" : law.notice === 0 ? "none" : law.notice + " days"}.${law.confidence === "low" ? " Unverified." : ""} As of ${escapeHtml(landlord.as_of)}${src ? ` · <a href="${escapeHtml(src)}" target="_blank" rel="noopener">source</a>` : ""}; not legal advice.`]);
  }
  return rows;
}
function renderReport() {
  if (!reportAt) return;
  const { lat, lon } = reportAt;
  // A drive-time trade area replaces the circle in this report once it has loaded.
  const isoK = taMode ? isoKey(lat, lon, taMode) : null;
  if (isoK && !isoCache.has(isoK)) loadIso(lat, lon, taMode);
  const iso = isoK ? isoCache.get(isoK) : null, area = iso && iso !== "loading" ? iso : null;
  const where = area ? `a ${area.min}-minute drive` : `${radius} mi`;
  const isoNote = !taMode ? "" : iso === "loading" ? `Loading the ${taMode}-minute drive area…`
    : !iso ? `The ${taMode}-minute drive area didn't load, so this uses the ${radius} mi circle.`
    : `Drive time on OpenStreetMap roads without traffic (Valhalla). Map shading, Top areas and comparisons still use the ${radius} mi circle.`;
  const { near, inside, within, score, frontier, lateNear, qualifies } = scoreAt(lat, lon, area);

  const rowsIn = [], rowsOut = [];
  GROUPS.forEach((g, gi) => {
    if (frontier ? roles[gi] === "none" : weights[gi] === 0) return;
    const n = inside[gi] || near[gi];
    const close = n && n.d <= 50;
    const inR = !!inside[gi];
    const tag = frontier ? `<span class="w">${roles[gi]}</span>` : weights[gi] > 1 ? `<span class="w">${weights[gi]}×</span>` : "";
    const extra = close && n.s.extra ? ` <span class="tag">${n.s.up.status === "opened" ? "just opened" : "announced"}</span>` : "";
    const where = close ? `${escapeHtml(n.s.b)}${n.s.city ? ", " + escapeHtml(n.s.city) : ""}` : "None within 50 mi";
    const row = `<li${inR ? "" : ' class="far"'}><span class="sw" style="background:${g.color}"></span>
      <span class="cn"><b>${escapeHtml(g.name)}</b>${tag}${extra}<small>${where}</small></span>
      <span class="cd">${close ? n.d.toFixed(1) + " mi" : ""}</span>
      ${close && !n.s.extra ? `<a class="go" href="${gmapsStore(n.s)}" target="_blank" rel="noopener" aria-label="${escapeHtml(n.s.b)} on Google Maps" title="Check on Google Maps">${ICON_EXT}</a>` : "<span></span>"}</li>`;
    (inR ? rowsIn : rowsOut).push([n ? n.d : 1e9, row]);
  });
  rowsIn.sort((a, b) => a[0] - b[0]); rowsOut.sort((a, b) => a[0] - b[0]);
  const upNear = upcoming.filter(u => u.lat != null && distMi(lat, lon, u.lat, u.lon) <= Math.max(10, radius * 2))
    .map(u => [distMi(lat, lon, u.lat, u.lon), u]).sort((a, b) => a[0] - b[0]);
  const upRows = upNear.map(([d, u]) => `<li><span class="sw" style="background:${GROUPS[u.g].color}"></span>
      <span class="cn"><b>${escapeHtml(u.b)}</b><small>${escapeHtml(u.place)} · ${STATUS_LABEL[u.status]}: ${escapeHtml(u.when || "no date")}</small></span>
      <span class="cd">~${d.toFixed(0)} mi</span>
      ${u.src && safeUrl(u.src.url) ? `<a class="go" href="${escapeHtml(u.src.url)}" target="_blank" rel="noopener" aria-label="Source" title="Source">${ICON_EXT}</a>` : "<span></span>"}</li>`).join("");

  const ta = tradeArea(lat, lon, radius, area);
  const cty = countyAt(lat, lon), cd = cty?.d;
  const f = maxW ? score / maxW : 0;
  const shareTxt = shareLabel(frontier || area ? null : topShare(score));   // national ranks are for the circle
  const title = frontier ? `${score} of ${maxW} early movers within ${where}` : `${score} of ${maxW} signal points within ${where}`;
  const place = reportAt.label || placeLabel(lat, lon);
  const sub = [cd?.name, cd?.metro ? cd.metro + " metro" : null].filter(Boolean).map(escapeHtml).join(" · ") || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

  const kpiKeys = LENS_KPIS[lens] || LENS_KPIS.retail;
  const kpis = ta ? `<div class="kpis">${kpiKeys.map((k, i) => `<div class="kpi${i < 3 ? " lead" : ""}"><b>${KPI[k][1](ta)}</b><span>${KPI[k][0]}</span></div>`).join("")}</div>
      <p class="rp-fine">${fmt(ta.n)} census tracts centered within ${where}. Household-weighted averages of tract medians, ACS ${escapeHtml(marketMeta?.acs || "")}.</p>`
    : `<p class="rp-fine">${market.error ? "Neighborhood data didn't load." : market.tracts ? "No census tracts centered within this radius." : "Loading neighborhood data…"}</p>`;

  const dl = rows => `<dl class="mkt">${rows.map(([t, v, d]) => `<div><dt>${escapeHtml(t)}</dt><dd>${v}</dd>${d ? `<span class="d">${d}</span>` : ""}</div>`).join("")}</dl>`;
  const zp = zipAt(lat, lon);
  // Stores the tracked chains opened or closed nearby in the last year, as found by comparing All the Places runs.
  const ch = changesMeta ? changesNear(lat, lon, radius, area) : [];
  const opens = changesMeta ? ch.filter(x => x.k === "o" && countsOpening(x.g)).length : null;
  const mom = frontier ? null : momentum({ ...marketOf(cd, zp), opens });
  const mline = mom ? `<div class="verdict"><b>Overall ${overallOf(score, mom)} of 100 · market momentum ${Math.round(mom.score)}</b>Against the rest of the US: ${mom.parts.map((x, i) => `${escapeHtml(x.label)} ${nth(x.p)}${i ? "" : " percentile"}${x.inv ? " (less new supply ranks higher)" : ""}`).join(", ")}. Overall is half the signal score and half momentum.</div>` : "";
  const zipRows = [];
  if (zp?.zori) zipRows.push([`Typical rent (${monthName(marketMeta?.zori)})`, dollars(zp.zori), `${chg(zp.zori1)} 1 yr · ${chg(zp.zori3)} 3 yr`]);
  if (zp?.zhvi) zipRows.push([`Typical home value (${monthName(marketMeta?.zhvi)})`, money(zp.zhvi), `${chg(zp.zhvi1)} 1 yr · ${chg(zp.zhvi5)} 5 yr`]);
  if (zp?.dom != null) zipRows.push([`Homes for sale (Realtor.com, ${monthName(marketMeta?.rdc)})`, `${zp.dom} days`,
    `median days on market · listings ${chgWorse(zp.invg)} over the year${zp.prc != null ? ` · ${Math.round(zp.prc)}% with a price cut` : ""}`]);
  const zipBox = zipRows.length ? `<h3 class="rp-h">Submarket <span>ZIP ${escapeHtml(zp.zip)} · Zillow${zp.dom != null ? ", Realtor.com" : ""}</span></h3>${dl(zipRows)}` : "";

  const mktRows = [];
  if (cd) {
    if (cd.pep) mktRows.push(["Population", big(cd.pep), `${chg(cd.popg)} since 2020 · ${chg(cd.popg1)} last year`]);
    if (cd.dmig != null) mktRows.push(["Net domestic migration, 2021–25", chg(cd.dmig), "Moves in from other US counties minus moves out, as a share of 2020 population"]);
    if (cd.emp) mktRows.push([`Jobs (BLS, ${marketMeta?.qcew ?? ""})`, big(cd.emp), `${chg(cd.empg1)} over the year · average wage ${dollars(cd.wage)} a week, ${chg(cd.wageg1)}`]);
    if (cd.avac != null) mktRows.push([`Apartment vacancy (Apartment List, ${monthName(marketMeta?.aptlist)})`, `${cd.avac.toFixed(1)}%`,
      `${ptsWorse(cd.avacg)} over the year${cd.conc != null ? ` · ${Math.round(cd.conc)}% of listings offer a concession` : ""}${cd.alLevel === "metro" ? ` · ${escapeHtml(cd.cbsaName || "metro area")} figures` : ""}`]);
    if (cd.p5 != null) mktRows.push([`New supply, permits ${marketMeta?.permits ?? ""}`, `${fmt(cd.p5)} apts`,
      `${fmt(cd.p1)} single-family homes · ${cd.mfpipe != null ? `${cd.mfpipe.toFixed(1)}% of apartment stock permitted over 3 yrs` : "apartment pipeline n/a"}`]);
    if (cd.zori) mktRows.push([`Typical rent (Zillow, ${monthName(marketMeta?.zori)})`, dollars(cd.zori), `${chg(cd.zori1)} 1 yr · ${chg(cd.zori3)} 3 yr`]);
    if (cd.zhvi) mktRows.push([`Typical home value (Zillow, ${monthName(marketMeta?.zhvi)})`, money(cd.zhvi), `${chg(cd.zhvi1)} 1 yr · ${chg(cd.zhvi5)} 5 yr`]);
    if (cd.inc) mktRows.push(["County medians (ACS)", "", `Income ${money(cd.inc)} · home ${money(cd.hv)} · rent ${dollars(cd.rent)} · ${share(cd.renter)} renters`]);
  }
  const mkt = mktRows.length ? dl(mktRows)
    : `<p class="rp-fine">${market.counties ? "No county figures for this spot." : market.error ? "County data didn't load." : "Loading county data…"}</p>`;
  const costs = costRows(ta, cd);
  const chRow = x => `<li><span class="sw" style="background:${GROUPS[x.g].color}"></span>
      <span class="cn"><b>${escapeHtml(x.b)}</b><span class="w">${x.k === "o" ? "opened" : "closed"}</span><small>${escapeHtml(x.place || "")}${x.place ? " · " : ""}between ${monthName(x.since.slice(0, 7))} and ${monthName(x.d.slice(0, 7))}</small></span>
      <span class="cd">${x.dist.toFixed(1)} mi</span>
      <a class="go" href="${gmapsStore({ b: x.b, lat: x.lat, lon: x.lon })}" target="_blank" rel="noopener" aria-label="${escapeHtml(x.b)} on Google Maps" title="Check on Google Maps">${ICON_EXT}</a></li>`;
  const chBox = !changesMeta ? "" : `<h3 class="rp-h">Openings and closings <span>within ${where} · past 12 months</span></h3>${ch.length
    ? `<ul class="chains">${ch.slice(0, 12).map(chRow).join("")}</ul>${ch.length > 12 ? `<p class="rp-fine">And ${ch.length - 12} more.</p>` : ""}`
    : `<p class="rp-fine">None of the tracked chains opened or closed a store within ${where} between ${monthName(changesMeta.since.slice(0, 7))} and ${monthName(changesMeta.updated.slice(0, 7))}.</p>`}`;
  const pinned = compareIndex(lat, lon) >= 0;

  const fline = frontier ? `<div class="verdict${qualifies ? " yes" : ""}"><b>${qualifies ? "Frontier area" : "Not a frontier area"}</b>${lateNear.length ? `Late anchors within ${lateRadius} mi: ${escapeHtml(lateNear.join(", "))}.` : `No late anchors within ${lateRadius} mi.`} Needs ${minEarly}+ early movers and at most ${maxLate} late ${maxLate === 1 ? "anchor" : "anchors"}.</div>` : "";

  $("report").innerHTML = `
    <div class="rp-head">
      <div><p class="eyebrow" style="margin-bottom:4px">Site report · ${escapeHtml(LENSES.find(l => l.id === lens).name)}</p>
        <h2>${escapeHtml(place)}</h2><p class="rp-sub">${sub}</p></div>
      <button class="icon-btn" data-act="close" aria-label="Close site report">${ICON_X}</button>
    </div>
    <div class="rp-body">
      <div class="rp-score">
        <div class="dial" style="--f:${f.toFixed(3)};--c:${score ? stepColor(f) : "var(--chip)"}"><b>${score}<small>of ${maxW}</small></b></div>
        <div><p class="t">${title}</p><p class="s">${[shareTxt, `${fmt(within)} tracked stores nearby`].filter(Boolean).join(" · ")}</p></div>
      </div>
      <div class="ta-seg" role="group" aria-label="Trade area"><span>Trade area</span>${[0, ...DRIVE_TIMES].map(m =>
        `<button type="button" data-ta="${m}" aria-pressed="${m === taMode}">${m ? `${m}-min drive` : `${radius} mi`}</button>`).join("")}</div>
      ${isoNote ? `<p class="rp-fine">${isoNote}</p>` : ""}
      ${fline}${mline}
      <h3 class="rp-h">Trade area <span>within ${where}${ta ? ` · ${big(ta.pop)} people` : ""}</span></h3>
      ${kpis}
      ${zipBox}
      <h3 class="rp-h">County market${cd?.name ? ` <span>${escapeHtml(cd.name.split(",")[0])}</span>` : ""}</h3>
      ${mkt}
      ${costs.length ? `<h3 class="rp-h">Costs and risk</h3>${dl(costs)}` : ""}
      ${chBox}
      ${rowsIn.length ? `<h3 class="rp-h">Within ${where} <span>${rowsIn.length} ${frontier ? "chains" : "signals"}</span></h3><ul class="chains">${rowsIn.map(r => r[1]).join("")}</ul>` : ""}
      ${upRows ? `<h3 class="rp-h">Announced nearby <span>approximate</span></h3><ul class="chains">${upRows}</ul>` : ""}
      ${rowsOut.length ? `<h3 class="rp-h">Missing nearby <span>closest location</span></h3><ul class="chains">${rowsOut.map(r => r[1]).join("")}</ul>` : ""}
      <div class="rp-actions">
        <button class="btn${pinned ? " on" : ""}" data-act="cmp" type="button" aria-pressed="${pinned}">${pinned ? "In compare ✓" : "Add to compare"}</button>
        <a class="btn" href="${gmapsSpot(lat, lon)}" target="_blank" rel="noopener">${ICON_EXT}Google Maps</a>
        <button class="btn" data-act="copy" type="button">Copy link</button>
        <button class="btn" data-act="print" type="button">Print</button>
      </div>
    </div>`;
}
$("report").addEventListener("click", e => {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "close") closeReport();
  else if (act === "copy") copyLink();
  else if (act === "print") window.print();
  else if (e.target.closest("[data-ta]")) { taMode = +e.target.closest("[data-ta]").dataset.ta; renderReport(); drawSite(); syncUrl(); }
  else if (act === "cmp" && reportAt) toggleCompare(reportAt.lat, reportAt.lon, reportAt.label || placeLabel(reportAt.lat, reportAt.lon));
});
map.on("click", e => openReport(e.latlng.lat, e.latlng.lng));
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && cmpOpen) { closeCompare(); return; }
  if (e.key === "Escape" && reportAt) closeReport();
  if (e.key === "/" && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) { e.preventDefault(); $("place").focus(); }
});

// ================= Site metrics and CSV export =================
const lensName = () => LENSES.find(l => l.id === lens).name;
const today = () => new Date().toISOString().slice(0, 10);
const rnd = (v, d = 0) => v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d;
function siteMetrics(lat, lon, label, extra = {}) {
  const sc = scoreAt(lat, lon), cd = countyAt(lat, lon)?.d || {}, z = zipAt(lat, lon) || {};
  return { label: label || placeLabel(lat, lon), extra, lat, lon, sc, top: sc.frontier ? null : topShare(sc.score),
    ta: tradeArea(lat, lon, radius) || {}, cd, z, ch: changesNear(lat, lon),
    mom: sc.frontier ? null : momentum({ ...marketOf(cd, z), opens: changesMeta ? openingsNear(lat, lon) : null }) };
}
// One list drives both the CSV columns and the compare table. better: 1 = higher is better, -1 = lower is better.
const pctPlain = v => v.toFixed(1) + "%";
const F = (sec, label, get, show, better = 0, cmp = true) => ({ sec, label, get, show, better, cmp });
const SITE_FIELDS = [
  F("Location", "County", s => s.cd.name, null, 0, false),
  F("Location", "Metro", s => s.cd.metro, null, 0, false),
  F("Location", "ZIP", s => s.z.zip, null, 0, false),
  F("Location", "Latitude", s => rnd(s.lat, 5), null, 0, false),
  F("Location", "Longitude", s => rnd(s.lon, 5), null, 0, false),
  F("Score", "Signal score", s => s.sc.score, v => `${v} of ${maxW}`, 1),
  F("Score", "Max points", () => maxW, null, 0, false),
  F("Score", "Top % of scored US areas", s => rnd(s.top, 1), v => v < 1 ? "Top 1%" : `Top ${Math.ceil(v)}%`, -1),
  F("Score", "Market momentum (0-100)", s => rnd(s.mom?.score), String, 1),
  F("Score", "Overall (0-100)", s => s.mom ? overallOf(s.sc.score, s.mom) : null, String, 1),
  F("Score", "Tracked stores nearby", s => s.sc.within, fmt, 1),
  F("Score", "Chain openings nearby, past 12 months", s => changesMeta ? s.ch.filter(x => x.k === "o").length : null, String, 1),
  F("Score", "Chain closings nearby, past 12 months", s => changesMeta ? s.ch.filter(x => x.k === "c").length : null, String, -1),
  F("Score", "Signals present", s => GROUPS.filter((g, i) => s.sc.near[i] && s.sc.near[i].d <= radius && groupVisible(i)).map(g => g.name).join("; "), null, 0, false),
  F("Trade area", "People", s => rnd(s.ta.pop), big),
  F("Trade area", "Household income ($)", s => rnd(s.ta.inc), money, 1),
  F("Trade area", "Home value ($)", s => rnd(s.ta.hv), money),
  F("Trade area", "Rent per month ($)", s => rnd(s.ta.rent), dollars),
  F("Trade area", "Home price to income (x)", s => rnd(s.ta.pti, 1), v => v.toFixed(1) + "×", -1),
  F("Trade area", "Gross rent yield (%)", s => rnd(s.ta.yld, 1), pctPlain, 1),
  F("Trade area", "Renter households (%)", s => rnd(s.ta.renter, 1), pctPlain),
  F("Trade area", "Rental vacancy (%)", s => rnd(s.ta.vac, 1), pctPlain, -1),
  F("Trade area", "Homes in 5+ unit buildings (%)", s => rnd(s.ta.mf5, 1), pctPlain),
  F("Trade area", "Median year built", s => rnd(s.ta.yb), String),
  F("Trade area", "Bachelor's or higher (%)", s => rnd(s.ta.bach, 1), pctPlain, 1),
  F("Trade area", "People per sq mi", s => rnd(s.ta.dens), fmt),
  F("Trade area", "Jobs located within radius", s => rnd(s.ta.jobs), big),
  F("Trade area", "Property tax rate (%)", s => rnd(s.ta.taxr, 2), v => v.toFixed(2) + "%", -1),
  F("Trade area", "Hazard risk score (0-100)", s => rnd(s.ta.risk), String, -1),
  F("Trade area", "Expected hazard losses per $1M a year ($)", s => rnd(s.ta.lossr, -1), v => "$" + fmt(v), -1),
  F("Trade area", "Costliest hazard", s => hazardName(s.ta.haz), null),
  F("ZIP (Zillow)", "ZIP typical rent ($)", s => s.z.zori, dollars),
  F("ZIP (Zillow)", "ZIP rent change 1 yr (%)", s => s.z.zori1, pct, 1),
  F("ZIP (Zillow)", "ZIP rent change 3 yr (%)", s => s.z.zori3, pct, 1),
  F("ZIP (Zillow)", "ZIP typical home value ($)", s => s.z.zhvi, money),
  F("ZIP (Zillow)", "ZIP home value change 1 yr (%)", s => s.z.zhvi1, pct, 1),
  F("ZIP (Zillow)", "ZIP home value change 5 yr (%)", s => s.z.zhvi5, pct, 1),
  F("ZIP (Realtor.com)", "ZIP days on market, for sale", s => s.z.dom, String, -1),
  F("ZIP (Realtor.com)", "ZIP for-sale listings change 1 yr (%)", s => s.z.invg, pct, -1),
  F("ZIP (Realtor.com)", "ZIP listings with a price cut (%)", s => s.z.prc, pctPlain, -1),
  F("County", "County population", s => s.cd.pep, big),
  F("County", "County growth since 2020 (%)", s => s.cd.popg, pct, 1),
  F("County", "County growth last year (%)", s => s.cd.popg1, pct, 1),
  F("County", "Net domestic migration 2021-25 (%)", s => s.cd.dmig, pct, 1),
  F("County", "Apartment units permitted, latest year", s => s.cd.p5, fmt),
  F("County", "Single-family homes permitted, latest year", s => s.cd.p1, fmt),
  F("County", "Apartment pipeline, 3 yrs (% of stock)", s => rnd(s.cd.mfpipe, 1), pctPlain, -1),
  F("County", "County jobs", s => s.cd.emp, big),
  F("County", "County job growth 1 yr (%)", s => s.cd.empg1, pct, 1),
  F("County", "Average weekly wage ($)", s => s.cd.wage, dollars),
  F("County", "Wage growth 1 yr (%)", s => s.cd.wageg1, pct, 1),
  F("County", "Apartment vacancy (%)", s => s.cd.avac, pctPlain, -1),
  F("County", "Apartment concessions (% of listings)", s => s.cd.conc, pctPlain, -1),
  F("County", "Landlord rules (state)", s => RENT_RULE[landlord?.states?.[stateOf(s.cd)]?.rent] ?? null, null),
  F("County", "County Zillow rent ($)", s => s.cd.zori, dollars, 0, false),
  F("County", "County Zillow rent change 1 yr (%)", s => s.cd.zori1, pct, 1, false),
  F("County", "County Zillow home value ($)", s => s.cd.zhvi, money, 0, false),
  F("County", "County Zillow home value change 1 yr (%)", s => s.cd.zhvi1, pct, 1, false),
];
// A text cell starting with = + - @ would run as a formula in Excel or Sheets; prefixing ' keeps it text.
function csvCell(v) {
  if (v == null) return "";
  if (typeof v === "number") return isFinite(v) ? String(v) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadText(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// items: siteMetrics results, or {label, extra, unscored: "why"} for rows that couldn't be placed.
function downloadCSV(name, items) {
  const extraKeys = [...new Set(items.flatMap(s => Object.keys(s.extra || {})))];
  const header = ["Site", ...extraKeys, "Lens", "Radius (mi)", ...SITE_FIELDS.map(f => f.label)];
  const rows = items.map(s => [s.label, ...extraKeys.map(k => s.extra?.[k]), lensName(), radius,
    ...SITE_FIELDS.map(f => s.sc ? f.get(s) : null)]);
  downloadText(name, "﻿" + [header, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  toast(`Exported ${items.length} ${items.length === 1 ? "site" : "sites"}.`);
}

// ================= Compare =================
let cmpOpen = false;
const cmpLayer = L.layerGroup().addTo(map);
const compareIndex = (lat, lon) => compare.findIndex(c => Math.abs(c.lat - lat) < 1e-4 && Math.abs(c.lon - lon) < 1e-4);
function toggleCompare(lat, lon, label) {
  const i = compareIndex(lat, lon);
  if (i >= 0) compare.splice(i, 1);
  else {
    if (compare.length >= MAX_COMPARE) { toast(`Compare holds ${MAX_COMPARE} sites. Remove one first.`, true); return; }
    compare.push({ lat, lon, label: str(label, 80) });
    toast(compare.length === 1 ? "Added to compare. Pin up to 3 more, then click Compare at the top." : `${compare.length} sites in compare.`);
  }
  afterCompareChange();
}
function afterCompareChange() {
  $("cmpBtn").hidden = !compare.length;
  $("cmpCount").textContent = compare.length || "";
  cmpLayer.clearLayers();
  compare.forEach((c, i) => L.marker([c.lat, c.lon], {
    icon: L.divIcon({ className: "pin cmp-pin", html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
    title: c.label, keyboard: false,
  }).on("click", () => openReport(c.lat, c.lon, c.label)).addTo(cmpLayer));
  if (reportAt) renderReport();
  renderCompare(); syncUrl();
}
function openCompare() { if (!compare.length) return; cmpOpen = true; $("cmp").hidden = false; document.body.classList.add("cmp-open"); renderCompare(); }
function closeCompare() { cmpOpen = false; $("cmp").hidden = true; document.body.classList.remove("cmp-open"); }
function renderCompare() {
  if (!cmpOpen) return;
  if (!compare.length) { closeCompare(); return; }
  const sites = compare.map(c => siteMetrics(c.lat, c.lon, c.label));
  const head = sites.map((s, i) => `<th scope="col"><div class="cmp-site"><span class="pin-n">${i + 1}</span>
      <div><b>${escapeHtml(s.label)}</b><small>${escapeHtml([s.cd.name, s.z.zip ? "ZIP " + s.z.zip : ""].filter(Boolean).join(" · "))}</small></div>
      <button class="icon-btn" type="button" data-rm="${i}" aria-label="Remove ${escapeHtml(s.label)} from compare">${ICON_X}</button></div>
      <button class="linkish" type="button" data-open="${i}">Open report</button></th>`).join("");
  let sec = "", body = "";
  for (const f of SITE_FIELDS) {
    if (!f.cmp) continue;
    const vals = sites.map(s => f.get(s));
    if (vals.every(v => v == null || v === "")) continue;   // e.g. momentum, outside the investor lenses
    if (f.sec !== sec) { sec = f.sec; body += `<tr class="sec"><th colspan="${sites.length + 1}">${escapeHtml(sec === "Trade area" ? `Trade area · within ${radius} mi` : sec)}</th></tr>`; }
    const shown = vals.map(v => v == null || v === "" ? "–" : f.show ? f.show(v) : String(v));
    // Highlight by what's displayed, so two sites that both read "Top 1%" are treated as a tie.
    const nums = vals.filter(v => typeof v === "number" && isFinite(v));
    const best = f.better && nums.length > 1 ? shown[vals.indexOf(f.better > 0 ? Math.max(...nums) : Math.min(...nums))] : null;
    const tie = best != null && shown.every(t => t === best || t === "–");
    const label = f.label.replace(/^(ZIP|County) /, "").replace(/ \((%|\$|x)\)$/, "");
    body += `<tr><th scope="row">${escapeHtml(label.charAt(0).toUpperCase() + label.slice(1))}</th>${shown.map(t =>
      `<td${best != null && !tie && t === best ? ' class="best"' : ""}>${escapeHtml(t)}</td>`).join("")}</tr>`;
  }
  $("cmp").innerHTML = `
    <div class="cmp-head">
      <div><p class="eyebrow" style="margin-bottom:4px">Compare · ${escapeHtml(lensName())} lens · ${radius}-mile trade areas</p><h2>${sites.length} ${sites.length === 1 ? "site" : "sites"}</h2></div>
      <div class="cmp-actions">
        <button class="btn" type="button" data-act="export">Export CSV</button>
        <button class="btn" type="button" data-act="print">Print</button>
        <button class="btn" type="button" data-act="clear">Clear</button>
        <button class="icon-btn" type="button" data-act="close" aria-label="Close compare">${ICON_X}</button>
      </div>
    </div>
    <div class="cmp-scroll"><table class="cmp-table"><thead><tr><th scope="col"><span class="sr">Measure</span></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="rp-fine cmp-foot">Bold marks the best value in rows where higher or lower is clearly better. Scores and trade areas follow the current lens and radius.</p>`;
}
$("cmp").addEventListener("click", e => {
  const t = e.target.closest("[data-act],[data-rm],[data-open]"); if (!t) return;
  if (t.dataset.rm != null) { compare.splice(+t.dataset.rm, 1); afterCompareChange(); return; }
  if (t.dataset.open != null) { const c = compare[+t.dataset.open]; closeCompare(); map.flyTo([c.lat, c.lon], Math.max(map.getZoom(), 12), { duration: 0.8 }); openReport(c.lat, c.lon, c.label); return; }
  const act = t.dataset.act;
  if (act === "close") closeCompare();
  else if (act === "print") window.print();
  else if (act === "clear") { compare = []; afterCompareChange(); }
  else if (act === "export") downloadCSV(`retail-signal-compare-${today()}.csv`, compare.map(c => siteMetrics(c.lat, c.lon, c.label)));
});
$("cmpBtn").addEventListener("click", () => cmpOpen ? closeCompare() : openCompare());

// ================= Deal list =================
// Uploaded properties are kept in this browser only (localStorage), along with a cache of addresses already looked up.
const DEAL_KEY = "rs.deals.v1", GEO_KEY = "rs.geocode.v1";
const MAX_DEAL_ROWS = 500, MAX_GEOCODE = 100;
const local = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } },
};
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const DEAL_STATUS = { ok: "", pending: "Waiting to be located", skipped: "Not located yet (over the 100-address limit)", notfound: "Couldn't find this address", missing: "No address or coordinates", error: "Lookup failed; try again" };
const dealLayer = L.layerGroup().addTo(map);
let dealRun = 0;   // bumps to cancel a lookup in progress

function readDealCSV(text) {
  const rows = parseCSV(text.replace(/^﻿/, ""));
  if (rows.length < 2) throw new Error("The file looks empty.");
  const head = rows[0].map(h => str(h, 60).trim());
  const low = head.map(h => h.toLowerCase());
  const col = names => low.findIndex(h => names.includes(h));
  const ni = col(["name", "property", "property name", "site", "site name", "deal", "deal name", "asset", "project"]);
  const ai = col(["address", "street", "street address", "address 1", "address1", "property address", "full address", "location"]);
  const ci = col(["city", "town"]), si = col(["state", "st"]), zi = col(["zip", "zipcode", "zip code", "postal code", "postal", "postcode"]);
  const la = col(["lat", "latitude", "y"]), lo = col(["lon", "lng", "long", "longitude", "x"]);
  if (ai < 0 && ci < 0 && zi < 0 && (la < 0 || lo < 0)) throw new Error("Add an address column (or city and state, or ZIP), or latitude and longitude columns.");
  const keep = head.map(h => h && !BAD_KEYS.has(h) ? h : null);
  const list = [];
  for (const r of rows.slice(1, MAX_DEAL_ROWS + 1)) {
    const row = {};
    keep.forEach((h, i) => { if (h) row[h] = str(r[i], 300); });
    const lat = la >= 0 ? parseFloat(r[la]) : NaN, lon = lo >= 0 ? parseFloat(r[lo]) : NaN;
    const part = i => i >= 0 ? str(r[i], 120).trim() : "";
    const query = [part(ai), part(ci), part(si), part(zi)].filter(Boolean).join(", ");
    const placed = inUS(lat, lon);
    list.push({ name: str(part(ni) || part(ai) || query || `Row ${list.length + 1}`, 120), query, lat: placed ? lat : null, lon: placed ? lon : null,
      row, status: placed ? "ok" : query ? "pending" : "missing" });
  }
  return { head: keep.filter(Boolean), list, more: rows.length - 1 - MAX_DEAL_ROWS };
}
function saveDeals() {
  if (!deals.length) { local.del(DEAL_KEY); return; }
  local.set(DEAL_KEY, { head: dealHeaders, deals: deals.map(({ name, query, lat, lon, row, status }) => ({ name, query, lat, lon, row, status })) });
}
function restoreDeals() {
  const saved = local.get(DEAL_KEY);
  if (!saved || !Array.isArray(saved.deals)) return;
  dealHeaders = Array.isArray(saved.head) ? saved.head.map(h => str(h, 60)).filter(h => !BAD_KEYS.has(h)) : [];
  deals = saved.deals.slice(0, MAX_DEAL_ROWS).map(d => {
    const placed = inUS(+d.lat, +d.lon);
    const row = {};
    for (const h of dealHeaders) row[h] = str(d.row?.[h], 300);
    const status = placed ? "ok" : Object.hasOwn(DEAL_STATUS, d.status) && d.status !== "ok" ? (d.status === "pending" ? "skipped" : d.status) : "missing";
    return { name: str(d.name, 120), query: str(d.query, 300), lat: placed ? +d.lat : null, lon: placed ? +d.lon : null, row, status };
  });
}
async function locateDeals() {
  const run = ++dealRun;
  const todo = deals.filter(d => d.status === "pending" || d.status === "skipped" || d.status === "error");
  todo.forEach(d => { d.status = "pending"; });
  const cache = local.get(GEO_KEY) || {};
  let n = 0, asked = 0;
  $("dealProg").classList.add("on");
  for (const d of todo) {
    if (run !== dealRun) return;
    n++;
    $("dealProg").firstElementChild.style.width = `${Math.round(n / todo.length * 100)}%`;
    const key = d.query.toLowerCase();
    const hit = Object.hasOwn(cache, key) ? cache[key] : null;
    if (hit) {
      if (inUS(hit.lat, hit.lon)) Object.assign(d, { lat: hit.lat, lon: hit.lon, status: "ok" }); else d.status = "notfound";
      continue;
    }
    if (asked >= MAX_GEOCODE) { d.status = "skipped"; continue; }
    setDealStatus(`Locating ${n} of ${todo.length}: ${d.name}`);
    try {
      const r = await geocode(d.query);
      asked++;
      if (r && inUS(r.lat, r.lon)) { Object.assign(d, { lat: r.lat, lon: r.lon, status: "ok" }); cache[key] = { lat: r.lat, lon: r.lon }; }
      else { d.status = "notfound"; cache[key] = { lat: null, lon: null }; }
    } catch (e) { d.status = "error"; }
    if (run !== dealRun) return;
    if (asked % 5 === 0) { renderDeals(); saveDeals(); }
    await sleep(1100);   // OpenStreetMap's geocoder allows about one request per second
  }
  const keys = Object.keys(cache);
  if (keys.length > 1000) keys.slice(0, keys.length - 1000).forEach(k => delete cache[k]);
  local.set(GEO_KEY, cache);
  $("dealProg").classList.remove("on");
  saveDeals(); renderDeals();
  const ok = deals.filter(d => d.status === "ok").length, left = deals.filter(d => d.status === "skipped").length;
  setDealStatus(`${ok} of ${deals.length} sites placed and scored.${left ? ` ${left} still need locating; click Locate the rest.` : ""}`);
}
function setDealStatus(msg, err) { const s = $("dealStatus"); s.textContent = msg; s.classList.toggle("err", !!err); }
let dealRanked = [];
function renderDeals() {
  $("dealCountBadge").textContent = deals.length || "";
  $("dealResults").hidden = !deals.length;
  dealLayer.clearLayers();
  if (!deals.length) { dealRanked = []; return; }
  const placed = d => d.status === "ok" && stores.length;
  // Ranked like Top areas: by the overall rank in the investor lenses (once market data is in), else the signal score.
  const overall = market.counties && !!MOMENTUM[lens] && viewMode !== "frontier";
  dealRanked = deals.map(d => {
    const sc = placed(d) ? scoreAt(d.lat, d.lon) : null, demo = sc && market.counties ? areaDemo(d.lat, d.lon) : null;
    if (demo) demo.score = sc.score;
    return { d, sc, demo, ov: overall && demo ? overallOf(sc.score, demo.mom) : null };
  }).sort((a, b) => (b.ov ?? -1) - (a.ov ?? -1) || (b.sc?.score ?? -1) - (a.sc?.score ?? -1));
  const ok = dealRanked.filter(x => x.sc).length;
  $("dealHead").textContent = `${ok} of ${deals.length} ${deals.length === 1 ? "site" : "sites"} scored`;
  $("dealLens").textContent = `Ranked by ${lensName()}${overall ? ": signals and momentum" : ""}`;
  $("dealMore").hidden = !deals.some(d => d.status === "skipped" || d.status === "error");
  const ol = $("dealList"); ol.innerHTML = "";
  const chipKeys = overall ? OVERALL_CHIPS[lens] : LENS_CHIPS[lens];
  dealRanked.forEach(({ d, sc, demo, ov }, i) => {
    const li = document.createElement("li");
    li.tabIndex = 0;
    if (sc) {
      li.innerHTML = rankRow(sc.score, ov, demo ? chipKeys.map(k => { const h = CHIP[k](demo); return h ? `<span class="chip">${h}</span>` : ""; }).join("") : "");
      const go = () => { map.flyTo([d.lat, d.lon], Math.max(map.getZoom(), 12), { duration: 0.8 }); openReport(d.lat, d.lon, d.name); };
      li.addEventListener("click", go);
      li.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      L.marker([d.lat, d.lon], { icon: L.divIcon({ className: "pin deal-pin", html: `<span>${i + 1}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }), title: d.name, keyboard: false })
        .on("click", go).addTo(dealLayer);
    } else {
      li.classList.add("na");
      li.innerHTML = `<span class="tname"></span><span class="tscore">–</span><span class="chips"><span class="chip"></span></span>`;
      li.querySelector(".chip").textContent = DEAL_STATUS[d.status] || DEAL_STATUS.missing;
    }
    li.querySelector(".tname").textContent = d.name;
    ol.appendChild(li);
  });
}
$("dealUpload").addEventListener("click", () => $("dealFile").click());
$("dealFile").addEventListener("change", async e => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  if (file.size > 5e6) { setDealStatus("That file is over 5 MB. Split it into smaller lists.", true); return; }
  try {
    const { head, list, more } = readDealCSV(await file.text());
    dealRun++;   // stop any lookup still running for the previous list
    dealHeaders = head; deals = list;
    saveDeals(); renderDeals(); showTab("deals");
    const need = deals.filter(d => d.status === "pending").length;
    setDealStatus(`${deals.length} rows read${more > 0 ? ` (the first ${MAX_DEAL_ROWS}; ${more} more were left out)` : ""}.${need ? ` Locating ${Math.min(need, MAX_GEOCODE)} addresses, about ${Math.ceil(Math.min(need, MAX_GEOCODE) * 1.1 / 60)} min…` : ""}`);
    if (need) locateDeals();
  } catch (err) { setDealStatus(`Couldn't read ${file.name}: ${err.message}`, true); }
});
$("dealMore").addEventListener("click", () => { setDealStatus("Locating the rest…"); locateDeals(); });
$("dealClear").addEventListener("click", () => {
  dealRun++; deals = []; dealHeaders = []; saveDeals(); renderDeals();
  $("dealProg").classList.remove("on"); setDealStatus("Cleared. Nothing from that list is stored in this browser now.");
});
$("dealExport").addEventListener("click", () => {
  if (!dealRanked.length) return;
  downloadCSV(`retail-signal-deals-${lens}-${today()}.csv`, dealRanked.map(({ d, sc }, i) => sc
    ? siteMetrics(d.lat, d.lon, d.name, { Rank: i + 1, ...d.row })
    : { label: d.name, extra: { Rank: "", ...d.row, "Lookup status": DEAL_STATUS[d.status] } }));
});
$("dealCompare").addEventListener("click", () => {
  const top = dealRanked.filter(x => x.sc).slice(0, MAX_COMPARE);
  if (!top.length) { toast("No scored sites to compare yet.", true); return; }
  compare = top.map(({ d }) => ({ lat: d.lat, lon: d.lon, label: d.name }));
  afterCompareChange(); openCompare();
});
$("dealTemplate").addEventListener("click", () => downloadText("retail-signal-deal-template.csv",
  "name,address,city,state,zip,latitude,longitude,units,price\r\nLegacy West Apartments,6000 Legacy Dr,Plano,TX,75024,,,240,52000000\r\nEast Austin infill lot,,Austin,TX,78702,30.2600,-97.7200,,\r\n",
  "text/csv;charset=utf-8"));

// ================= Lens =================
function renderLens() {
  $("lens").innerHTML = LENSES.map(l => `<button type="button" role="radio" aria-checked="${l.id === lens}" data-lens="${l.id}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${l.icon}</svg>
    <b>${escapeHtml(l.name)}</b><span>${escapeHtml(l.short)}</span></button>`).join("");
  $("lens").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { if (b.dataset.lens !== lens || lensDirty()) applyLens(b.dataset.lens); }));
  $("sortBy").querySelector('[value="score"]').textContent = TIE_BY[lens] ? "Signal score, then county growth" : "Signal score";
  const ov = $("sortBy").querySelector('[value="overall"]');
  ov.hidden = ov.disabled = !MOMENTUM[lens];
  renderLensDesc();
}
function lensDefaults(id = lens) {
  const L0 = LENSES.find(l => l.id === id);
  return { L0, w: presetWeights(PRESETS.find(p => p.id === L0.preset)), f: { ...NO_FILTERS, ...L0.filters } };
}
function lensDirty() {
  const { L0, w, f } = lensDefaults();
  if (L0.mode === "score" && w.some((v, i) => v !== weights[i])) return true;
  if (L0.mode === "frontier" && roles.some((r, i) => r !== (DEFAULT_ROLE[GROUPS[i].name] || "none"))) return true;
  return Object.keys(f).some(k => f[k] !== filt[k]) || sortBy !== (L0.sort || "score");
}
function renderLensDesc() {
  const { L0 } = lensDefaults();
  $("lensDesc").innerHTML = escapeHtml(L0.desc) + (lensDirty() ? ` <span class="dirty">You've adjusted it.</span> <button type="button" id="lensReset">Reset</button>` : "");
  $("lensReset")?.addEventListener("click", () => applyLens(lens));
}
function applyLens(id) {
  const { L0, w, f } = lensDefaults(id);
  lens = L0.id;
  weights = w; activePreset = PRESETS.findIndex(p => p.id === L0.preset);
  filt = f; sortBy = L0.sort || "score";
  if (L0.mode === "frontier") roles = GROUPS.map(g => DEFAULT_ROLE[g.name] || "none");
  setFilterInputs();
  renderLens();
  renderPresets();
  setView(L0.mode);
}
function setFilterInputs() {
  $("fInc").value = filt.inc; $("fPti").value = filt.pti; $("fRenter").value = filt.renter; $("fPop").value = filt.popg; $("fRent").value = filt.zori1;
  $("fPipe").value = filt.pipe; $("fJobs").value = filt.empg; $("fRisk").value = filt.risk; $("sortBy").value = sortBy;
}
[["fInc", "inc"], ["fPti", "pti"], ["fRenter", "renter"], ["fPop", "popg"], ["fRent", "zori1"], ["fPipe", "pipe"], ["fJobs", "empg"], ["fRisk", "risk"]].forEach(([id, k]) =>
  $(id).addEventListener("change", e => { filt[k] = +e.target.value; updateTop(); renderLensDesc(); syncUrl(); }));
$("sortBy").addEventListener("change", e => { sortBy = e.target.value; updateTop(); renderLensDesc(); syncUrl(); });
$("inView").addEventListener("change", updateTop);

// ================= Signals tab =================
const presetWeights = p => GROUPS.map((g, i) => p.w[i] ?? 1);
function matchPreset() { return PRESETS.findIndex(p => presetWeights(p).every((v, k) => v === weights[k])); }
function renderPresets() {
  const box = $("presets"); box.innerHTML = "";
  PRESETS.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = p.name;
    b.setAttribute("aria-pressed", String(i === activePreset));
    b.addEventListener("click", () => { weights = presetWeights(p); activePreset = i; renderPresets(); renderGroups(); rescore(); });
    box.appendChild(b);
  });
  $("presetNote").textContent = activePreset >= 0 ? PRESETS[activePreset].note : "Your own weighting. Pick a preset to start from one of the fitted ones.";
}
const SRC_TAG = { "OpenStreetMap": "OSM", "All the Places": "ATP", "CSV": "CSV" };
function renderGroups() {
  const ul = $("groups"); ul.innerHTML = "";
  const found = new Map();
  for (const s of stores) found.set(s.b, (found.get(s.b) || 0) + 1);
  const frontier = viewMode === "frontier";
  for (const [cat, label] of CATS) {
    if (!GROUPS.some(g => g.cat === cat)) continue;
    const h = document.createElement("li"); h.className = "cat"; h.textContent = label; ul.appendChild(h);
    GROUPS.forEach((g, gi) => {
      if (g.cat !== cat) return;
      const li = document.createElement("li");
      li.className = "grp" + (!groupVisible(gi) ? " off" : "");
      const brandRows = g.brands.map(b => {
        const n = found.get(b.name) || 0;
        let right, p = null;
        if (gState[gi] === "loading") right = "Loading…";
        else if (gState[gi] === "error" && !n) right = "Didn't load";
        else if (stores.length && !loadedBrands.has(b.name)) right = "Not loaded yet";
        else if (!stores.length) right = b.ref ? `~${fmt(b.ref)} reported` : "";
        else {
          right = b.ref ? `${fmt(n)} of ~${fmt(b.ref)}` : `${fmt(n)} found`;
          if (b.ref) p = Math.min(100, Math.round(n / b.ref * 100));
        }
        const cls = p == null ? "" : p >= 85 ? "good" : p >= 60 ? "fair" : "thin";
        const src = n && brandSrc[b.name] ? `<span class="tag">${SRC_TAG[brandSrc[b.name]] || "CSV"}</span>` : "";
        const tip = `${b.src}${brandSrc[b.name] ? ` Store data: ${brandSrc[b.name]}.` : ""}`;
        const rmb = b.custom && !(g.custom && g.brands.length === 1) ? ` <button class="linkish rmb" type="button" data-b="${escapeHtml(b.name)}">remove</button>` : "";
        return `<div class="brand" title="${escapeHtml(tip)}"><span>${escapeHtml(b.name)}${src}${rmb}</span><span class="bn">${right}${p != null ? ` <b class="${cls}">${p}%</b>` : ""}</span></div>`;
      }).join("");
      const opts = frontier ? [["early", "Early"], ["late", "Late"], ["none", "–"]] : [["0", "Off"], ["1", "1×"], ["2", "2×"], ["3", "3×"]];
      const cur = frontier ? roles[gi] : String(weights[gi]);
      li.innerHTML = `<div class="ghead"><span class="sw" style="background:${g.color}"></span><span class="gname">${escapeHtml(g.name)}</span>
        <div class="wseg" role="group" aria-label="${frontier ? "Frontier role" : "Weight"} for ${escapeHtml(g.name)}">${opts.map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${t}</button>`).join("")}</div></div>
        ${brandRows}${g.why ? `<div class="why">${escapeHtml(g.why)}</div>` : ""}${g.custom ? `<div class="why"><button class="linkish rm" type="button">${g.brands.length > 1 ? "Remove this signal" : "Remove this chain"}</button></div>` : ""}`;
      li.querySelectorAll(".rmb").forEach(btn => btn.addEventListener("click", () => removeBrand(btn.dataset.b)));
      li.querySelector(".rm")?.addEventListener("click", () => removeGroup(gi));
      li.querySelectorAll(".wseg button").forEach(btn => btn.addEventListener("click", () => {
        li.querySelectorAll(".wseg button").forEach(x => x.setAttribute("aria-pressed", String(x === btn)));
        if (frontier) { roles[gi] = btn.dataset.v; updateFrontierControls(); computeLate(); }
        else { weights[gi] = +btn.dataset.v; activePreset = matchPreset(); renderPresets(); }
        li.classList.toggle("off", !groupVisible(gi));
        rescore();
      }));
      ul.appendChild(li);
    });
  }
}
function updateThresholdLabel() { $("minOut").textContent = maxW ? `${threshold()} of ${maxW} points` : "no signals on"; }
function updateFrontierControls() {
  const nE = roles.filter(r => r === "early").length, nL = roles.filter(r => r === "late").length;
  minEarly = Math.min(Math.max(1, minEarly), Math.max(1, nE)); maxLate = Math.min(maxLate, nL);
  $("fEarly").max = Math.max(1, nE); $("fEarly").value = minEarly; $("fEarlyOut").textContent = `${minEarly} of ${nE}`;
  $("fLate").max = nL; $("fLate").value = maxLate; $("fLateOut").textContent = maxLate === 0 ? "none" : `up to ${maxLate} of ${nL}`;
  $("fLateR").value = lateRadius; $("fLateROut").textContent = `${lateRadius} mi`;
}
function setView(mode) {
  viewMode = mode;
  $("frontierBox").hidden = mode !== "frontier";
  $("scoreOnly").hidden = mode === "frontier";
  $("presets").hidden = $("presetNote").hidden = mode === "frontier";
  updateFrontierControls();
  fillColorBy();
  computeLate();
  renderGroups(); rescore();
}
$("fEarly").addEventListener("input", e => { minEarly = +e.target.value; updateFrontierControls(); rescore(); });
$("fLate").addEventListener("input", e => { maxLate = +e.target.value; updateFrontierControls(); rescore(); });
$("fLateR").addEventListener("input", e => { $("fLateROut").textContent = `${e.target.value} mi`; });
$("fLateR").addEventListener("change", e => { lateRadius = +e.target.value; computeLate(); rescore(); });
$("rad").addEventListener("input", e => { $("radOut").textContent = `${e.target.value} mi`; });
$("rad").addEventListener("change", e => {
  radius = +e.target.value;
  if (stores.length) setTimeout(() => { refreshAll(); drawSite(); }, 20);
});
$("minFrac").addEventListener("input", e => { minFrac = +e.target.value / 100; updateThresholdLabel(); renderLegend(); signalLayer.redraw(); });
$("minFrac").addEventListener("change", () => { updateTop(); syncUrl(); });

// ================= Tabs =================
function showTab(name) {
  document.querySelectorAll(".tabs [role=tab]").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  document.querySelectorAll(".pane").forEach(p => { p.hidden = p.id !== "pane-" + name; });
  $("tabbody").scrollTop = 0;
}
document.querySelectorAll(".tabs [role=tab]").forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));

// ================= Search =================
// A query that starts with a house number is a street address: of the geocoder's matches, the one with a house
// number is the building itself (exact), where a street or neighborhood match would only be the general area.
async function geocode(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&limit=5&q=${encodeURIComponent(q)}`);
  const j = await r.json();
  if (!j.length) return null;
  const wantsAddress = /^\s*\d+[a-z]?\s+\S/i.test(q);
  const hit = (wantsAddress && j.find(x => x.address?.house_number)) || j[0];
  const a = hit.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const town = a.city || a.town || a.village || a.hamlet || a.suburb || "";
  const label = [street || hit.name, town].filter(Boolean).join(", ") || hit.display_name.split(",").slice(0, 2).join(",");
  return { lat: +hit.lat, lon: +hit.lon, bb: hit.boundingbox.map(Number), label, exact: !!a.house_number };
}
async function goPlace(e) {
  e?.preventDefault();
  const q = $("place").value.trim(); if (!q) return;
  const ll = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (ll) {
    const lat = +ll[1], lon = +ll[2];
    if (!inUS(lat, lon)) { toast("Those coordinates aren't in the US. Use latitude, longitude, like 33.08, -96.83.", true); return; }
    openReport(lat, lon, null, true); flyToSpot(lat, lon, Math.max(map.getZoom(), 14)); return;
  }
  try {
    const r = await geocode(q);
    if (!r) { toast(`No match for “${q}”. Try adding the state.`, true); return; }
    const [s, n, w, ea] = r.bb;
    const small = (n - s) < 0.08 && (ea - w) < 0.08;
    if (r.exact) {   // a street address: drop a pin on the building and open its report
      openReport(r.lat, r.lon, r.label, true);
      flyToSpot(r.lat, r.lon, Math.max(map.getZoom(), 15));
    } else if (small) {
      openReport(r.lat, r.lon, r.label);
      flyToSpot(r.lat, r.lon, 13);
    } else map.flyToBounds([[s, w], [n, ea]], { maxZoom: 12, duration: 0.8 });
    $("place").blur();
  } catch (err) { toast("Place search needs an internet connection.", true); }
}
$("searchForm").addEventListener("submit", goPlace);

// ================= Shareable links =================
let urlT, urlReady = false;
function syncUrl() { if (!urlReady) return; clearTimeout(urlT); urlT = setTimeout(writeUrl, 250); }
function writeUrl() {
  const p = new URLSearchParams();
  p.set("lens", lens);
  const c = map.getCenter();
  p.set("map", `${map.getZoom()}/${c.lat.toFixed(4)}/${c.lng.toFixed(4)}`);
  if (radius !== 5) p.set("r", radius);
  if (Math.round(minFrac * 100) !== 30) p.set("min", Math.round(minFrac * 100));
  if (colorBy !== "score") p.set("color", colorBy);
  const { L0, w, f } = lensDefaults();
  if (L0.mode === "score" && w.some((v, i) => v !== weights[i])) p.set("w", weights.join(""));
  if (L0.mode === "frontier") {
    if (roles.some((r, i) => r !== (DEFAULT_ROLE[GROUPS[i].name] || "none"))) p.set("roles", roles.map(r => r[0]).join(""));
    if (minEarly !== 4 || maxLate !== 0 || lateRadius !== 10) p.set("fr", `${minEarly}.${maxLate}.${lateRadius}`);
  }
  if (Object.keys(f).some(k => f[k] !== filt[k])) p.set("f", [filt.inc, filt.pti, filt.renter, filt.popg, filt.zori1, filt.pipe, filt.empg, filt.risk].join("_"));
  if (sortBy !== (L0.sort || "score")) p.set("sort", sortBy);
  if (reportAt) p.set("at", `${reportAt.lat.toFixed(5)},${reportAt.lon.toFixed(5)}${reportAt.pin ? "," + encodeURIComponent(reportAt.label || "") : ""}`);
  if (taMode) p.set("ta", taMode);
  if (compare.length) p.set("cmp", compare.map(c => `${c.lat.toFixed(5)},${c.lon.toFixed(5)},${encodeURIComponent(c.label)}`).join("|"));
  history.replaceState(null, "", "#" + p.toString());
}
const SORTS = ["overall", "score", "popg", "dmig", "zori1", "empg1", "opens", "inc", "pti", "yld", "mfpipe", "risk"];
function readUrl() {
  const p = new URLSearchParams(location.hash.slice(1));
  applyLens(LENSES.some(l => l.id === p.get("lens")) ? p.get("lens") : "mf");
  const num = (v, lo, hi, d) => { const n = parseFloat(v); return isFinite(n) && n >= lo && n <= hi ? n : d; };
  radius = num(p.get("r"), 1, 15, 5); $("rad").value = radius; $("radOut").textContent = `${radius} mi`;
  minFrac = num(p.get("min"), 10, 100, 30) / 100; $("minFrac").value = Math.round(minFrac * 100);
  const w = p.get("w");
  if (w && /^[0-3]+$/.test(w)) { weights = GROUPS.map((g, i) => i < w.length ? +w[i] : weights[i]); activePreset = matchPreset(); renderPresets(); }
  const r = p.get("roles");
  if (r && /^[eln]+$/.test(r)) roles = GROUPS.map((g, i) => i < r.length ? { e: "early", l: "late", n: "none" }[r[i]] : roles[i]);
  // Anything a link leaves out goes back to its default, so a second link applied in place doesn't inherit the first's.
  minEarly = 4; maxLate = 0; lateRadius = 10;
  taMode = DRIVE_TIMES.includes(+p.get("ta")) ? +p.get("ta") : 0;
  const fr = p.get("fr");
  if (fr) { const [a, b, c] = fr.split(".").map(Number); minEarly = num(a, 1, 30, minEarly); maxLate = num(b, 0, 30, maxLate); lateRadius = num(c, 3, 25, lateRadius); }
  const f = p.get("f");
  if (f) {
    const v = f.split("_").map(Number);
    // Older links carry 5 or 6 values; filters added since default to off.
    if (v.length >= 5 && v.length <= 8 && v.every(isFinite))
      filt = { inc: v[0], pti: v[1], renter: v[2], popg: v[3], zori1: v[4], pipe: v[5] || 0, empg: v[6] ?? -999, risk: v[7] || 0 };
  }
  const sort = p.get("sort");
  if (SORTS.includes(sort) && (sort !== "overall" || MOMENTUM[lens])) sortBy = sort;
  setFilterInputs();
  colorBy = hasMetric(p.get("color")) ? p.get("color") : "score";
  // Coordinates are range-checked: a link with an absurd value would otherwise freeze the grid loops.
  const mv = (p.get("map") || "").split("/").map(Number);
  if (mv.length === 3 && mv.every(isFinite) && Math.abs(mv[1]) <= 85 && Math.abs(mv[2]) <= 180) map.setView([mv[1], mv[2]], Math.min(19, Math.max(2, mv[0])), { animate: false });
  for (const part of (p.get("cmp") || "").split("|").slice(0, MAX_COMPARE)) {
    const [la, lo, ...rest] = part.split(",");
    let label = rest.join(",");
    try { label = decodeURIComponent(label); } catch (e) { /* not encoded; keep as typed */ }
    if (inUS(+la, +lo)) compare.push({ lat: +la, lon: +lo, label: str(label, 80) || `${(+la).toFixed(3)}, ${(+lo).toFixed(3)}` });
  }
  setView(viewMode);   // re-renders with everything above
  renderLens();
  const [la, lo, ...rest] = (p.get("at") || "").split(",");
  if (!inUS(+la, +lo)) return null;
  let label = rest.join(",");
  try { label = decodeURIComponent(label); } catch (e) { /* not encoded; keep as typed */ }
  return { lat: +la, lon: +lo, pin: rest.length > 0, label: str(label, 80) || null };
}
async function copyLink() {
  writeUrl();
  try { await navigator.clipboard.writeText(location.href); toast("Link copied. It opens this exact view."); }
  catch (e) { toast("Couldn't copy automatically. Copy the address bar instead.", true); }
}
$("shareBtn").addEventListener("click", copyLink);
// A link pasted into a tab that already has the site open only changes the part after #, which doesn't reload
// the page. Apply it in place. (The page's own URL updates use replaceState, which doesn't fire this event.)
window.addEventListener("hashchange", () => {
  if (tour) endTour();
  const prevRadius = radius;
  compare = [];
  const at = readUrl();
  if (stores.length && radius !== prevRadius) refreshAll();
  setColorBy(colorBy);
  if (stores.length) afterCompareChange();
  if (at) openReport(at.lat, at.lon, at.label, at.pin);
  else if (reportAt) closeReport();
  if (cmpOpen && !compare.length) closeCompare();
});

// ================= Upcoming openings =================
function renderUpcoming() {
  const ul = $("upList"); ul.innerHTML = "";
  $("upCountBadge").textContent = upcoming.length || "";
  const order = { opened: 0, dated: 1, planned: 2, proposed: 3 };
  for (const u of upcoming.slice().sort((a, b) => order[a.status] - order[b.status] || a.b.localeCompare(b.b))) {
    const li = document.createElement("li"); li.tabIndex = 0;
    const col = GROUPS[u.g].color;
    const dash = u.status === "planned" ? 'stroke-dasharray="3 2"' : u.status === "proposed" ? 'stroke-dasharray="1 2" opacity=".7"' : "";
    const icon = u.status === "opened" ? `<circle cx="8" cy="8" r="5.5" fill="${col}" stroke="#fff" stroke-width="2"/>` : `<circle cx="8" cy="8" r="5.5" fill="none" stroke="${col}" stroke-width="2.4" ${dash}/>`;
    li.innerHTML = `<svg width="16" height="16" aria-hidden="true" style="margin-top:2px">${icon}</svg><span><span class="un"></span><span class="um"></span></span>`;
    li.querySelector(".un").textContent = `${u.b}, ${u.place}`;
    li.querySelector(".um").textContent = `${STATUS_LABEL[u.status]}: ${u.when || "no date"}`;
    const go = () => { map.flyTo([u.lat, u.lon], 11, { duration: 0.8 }); openReport(u.lat, u.lon); };
    li.addEventListener("click", go);
    li.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    ul.appendChild(li);
  }
}
$("upCount").addEventListener("change", e => { countAnnounced = e.target.checked; refreshAll(); });
$("addBtn").addEventListener("click", async () => {
  const b = $("addBrand").value, place = $("addPlace").value.trim();
  if (!place) { toast("Enter an address or city for the opening.", true); return; }
  $("addBtn").disabled = true; $("addBtn").textContent = "Locating…";
  try {
    const pt = await geocode(place);
    if (!pt) toast(`Couldn't find “${place}”. Try adding the city and state.`, true);
    else {
      const url = safeUrl($("addSrc").value.trim());
      upcoming.push({ g: brandByName.get(b).g, b, place, status: $("addStatus").value, when: $("addWhen").value.trim(), src: url ? { name: "Your source", url } : null, lat: pt.lat, lon: pt.lon });
      $("addPlace").value = ""; $("addWhen").value = ""; $("addSrc").value = "";
      refreshAll(); renderUpcoming();
      map.flyTo([pt.lat, pt.lon], 11, { duration: 0.8 });
      toast(`Added ${b} in ${place}. Save data in the Data tab to keep it.`);
    }
  } catch (e) { toast("Locating an address needs an internet connection.", true); }
  $("addBtn").disabled = false; $("addBtn").textContent = "Add to map";
});

// ================= Your own chains =================
// customDefs keeps what you added, in order, so it can be saved and rebuilt:
//   {type:"section", id, label} | {type:"signal", name, alts, color, cat} | {type:"chain", name, alts, group}
let customDefs = [];
function regexFor(names) {
  const esc = n => n.replace(/[\\^$|\[\]{}"]/g, "").replace(/[.*+?()]/g, ch => `[${ch}]`).replace(/['’]/g, "['’]");
  return `^(${names.map(esc).join("|")})`;
}
const cleanNames = def => [def.name, ...(def.alts || [])].map(n => String(n).replace(/["\\]/g, "").trim()).filter(Boolean);
function makeBrand(names) {
  return { name: names[0], sel: "", re: regexFor(names), brandOnly: true, custom: true, ref: null,
    src: `Added by you${names.length > 1 ? `; also matches ${names.slice(1).join(", ")}` : ""}. OpenStreetMap loading matches the brand tag only.` };
}
function addSection(label) {
  const id = "u:" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!CATS.some(c => c[0] === id)) CATS.push([id, label]);
  return id;
}
// Applies one definition. Returns an error message, or "" on success.
function applyDef(def) {
  if (def.type === "section") { addSection(def.label); return ""; }
  const names = cleanNames(def);
  if (!names.length) return "Enter the chain's name first.";
  if (brandByName.has(names[0])) return `${names[0]} is already on the map.`;
  const sigName = (def.signal || names[0]).trim();
  if (def.type === "signal" && GROUPS.some(g => g.name.toLowerCase() === sigName.toLowerCase())) return `There's already a signal called ${sigName}.`;
  if (def.type === "chain") {
    const gi = GROUPS.findIndex(g => g.name === def.group);
    if (gi < 0) return `The signal "${def.group}" isn't on the map.`;
    GROUPS[gi].brands.push(makeBrand(names));
    rebuildBrands();
    gState[gi] = "idle";
    return "";
  }
  if (GROUPS.length >= MAX_GROUPS) return `The map supports up to ${MAX_GROUPS} signals. Add this chain inside an existing signal, or remove one you added.`;
  if (!CATS.some(c => c[0] === def.cat)) def.cat = "custom";
  // Colors from a saved file land in style attributes, so only plain hex colors are accepted.
  const color = safeColor(def.color) || CUSTOM_COLORS[GROUPS.filter(g => g.custom).length % CUSTOM_COLORS.length];
  def.color = color;
  GROUPS.push({ name: sigName, cat: def.cat, color, custom: true, why: "", brands: [makeBrand(names)] });
  rebuildBrands();
  weights.push(1); roles.push("none"); gState.push("idle");
  return "";
}
function afterCustomChange() {
  activePreset = matchPreset(); renderPresets(); refreshAll(); renderUpcoming(); fillAddBrand(); fillCustomForm(); updateFrontierControls();
}
function restoreCustom(list) {
  for (const raw of Array.isArray(list) ? list.slice(0, MAX_GROUPS * 4) : []) {
    if (!raw || typeof raw !== "object") continue;
    const def = raw.type ? { ...raw } : { type: "signal", name: raw.name, alts: raw.alts, color: raw.color, cat: "custom" };   // older files
    if (!["section", "signal", "chain"].includes(def.type)) continue;
    def.name = str(def.name, 80); def.label = str(def.label, 80); def.group = str(def.group, 80); def.cat = str(def.cat, 100);
    def.signal = def.signal == null ? undefined : str(def.signal, 80);
    def.alts = Array.isArray(def.alts) ? def.alts.slice(0, 10).map(a => str(a, 80)) : [];
    def.color = safeColor(def.color) || undefined;
    if (def.type === "section" ? CATS.some(c => c[1] === def.label) : brandByName.has(cleanNames(def)[0])) continue;
    if (!applyDef(def)) customDefs.push(def);
  }
}
function removeBrand(name) {
  const b = brandByName.get(name); if (!b || !b.custom) return;
  const gi = b.g, g = GROUPS[gi];
  if (g.custom && g.brands.length === 1) { removeGroup(gi); return; }
  const def0 = customDefs.find(d => d.type === "signal" && (d.signal || cleanNames(d)[0]) === g.name);
  if (def0 && cleanNames(def0)[0] === name) {   // the signal's founding chain is leaving; keep the signal with its other chains
    const next = g.brands.find(x => x !== b);
    Object.assign(def0, { name: next.name, alts: [], signal: g.name });
    customDefs = customDefs.filter(d => !(d.type === "chain" && cleanNames(d)[0] === next.name));
  }
  g.brands = g.brands.filter(x => x !== b);
  rebuildBrands();
  stores = stores.filter(s => s.b !== name); upcoming = upcoming.filter(u => u.b !== name);
  delete brandSrc[name]; loadedBrands.delete(name);
  customDefs = customDefs.filter(d => !(d.type === "chain" && cleanNames(d)[0] === name));
  afterCustomChange();
  toast(`Removed ${name}.`);
}
function removeGroup(gi) {
  const g = GROUPS[gi]; if (!g || !g.custom) return;
  const names = new Set(g.brands.map(b => b.name));
  GROUPS.splice(gi, 1); weights.splice(gi, 1); roles.splice(gi, 1); gState.splice(gi, 1);
  rebuildBrands();
  stores = stores.filter(s => !names.has(s.b)); stores.forEach(s => { s.g = brandByName.get(s.b).g; });
  upcoming = upcoming.filter(u => !names.has(u.b)); upcoming.forEach(u => { u.g = brandByName.get(u.b).g; });
  names.forEach(n => { delete brandSrc[n]; loadedBrands.delete(n); });
  customDefs = customDefs.filter(d => !((d.type === "signal" && (d.signal || cleanNames(d)[0]) === g.name) || (d.type === "chain" && d.group === g.name)));
  afterCustomChange();
  toast(`Removed ${g.name}.`);
}
function fillAddBrand() {
  const sel = $("addBrand"), cur = sel.value; sel.innerHTML = "";
  BRANDS.forEach(b => { const o = document.createElement("option"); o.value = b.name; o.textContent = b.name; sel.appendChild(o); });
  if (brandByName.has(cur)) sel.value = cur;
}
function fillCustomForm() {
  const sec = $("cuSec"), curS = sec.value || "custom";
  sec.innerHTML = CATS.map(([id, label]) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`).join("") + `<option value="__new">New section…</option>`;
  sec.value = [...CATS.map(c => c[0]), "__new"].includes(curS) ? curS : "custom";
  const grp = $("cuGrp"), curG = grp.value;
  grp.innerHTML = CATS.map(([id, label]) => {
    const opts = GROUPS.filter(g => g.cat === id).map(g => `<option value="${escapeHtml(g.name)}">${escapeHtml(g.name)}</option>`).join("");
    return opts ? `<optgroup label="${escapeHtml(label)}">${opts}</optgroup>` : "";
  }).join("");
  if (GROUPS.some(g => g.name === curG)) grp.value = curG;
  syncCustomForm();
}
function syncCustomForm() {
  const asChain = $("cuMode").value === "chain";
  $("cuGrpWrap").hidden = !asChain;
  $("cuSecWrap").hidden = asChain;
  $("cuSigWrap").hidden = asChain;
  $("cuNewSecWrap").hidden = asChain || $("cuSec").value !== "__new";
  $("cuAdd").textContent = asChain ? "Add chain to signal" : "Add chain as a signal";
}
["cuMode", "cuSec"].forEach(id => $(id).addEventListener("change", syncCustomForm));
$("cuAdd").addEventListener("click", () => {
  const name = $("cuName").value.trim();
  const alts = $("cuAlt").value.split(",").map(s => s.trim()).filter(Boolean);
  if (!name) { toast("Enter the chain's name first.", true); return; }
  const defs = [];
  let def;
  if ($("cuMode").value === "chain") def = { type: "chain", name, alts, group: $("cuGrp").value };
  else {
    let cat = $("cuSec").value;
    if (cat === "__new") {
      const label = $("cuNewSec").value.trim();
      if (!label) { toast("Name the new section, or pick an existing one.", true); return; }
      const sdef = { type: "section", label };
      cat = addSection(label);
      if (!customDefs.some(d => d.type === "section" && d.label === label)) defs.push(sdef);
    }
    def = { type: "signal", name, alts, cat, signal: $("cuSig").value.trim() || undefined };
  }
  const err = applyDef(def);
  if (err) { toast(err, true); return; }
  customDefs.push(...defs, def);
  $("cuName").value = ""; $("cuAlt").value = ""; $("cuNewSec").value = ""; $("cuSig").value = "";
  afterCustomChange();
  if ($("cuSec").value === "__new") $("cuSec").value = def.cat || "custom";
  syncCustomForm();
  $("loadBtn").textContent = "Load new and missing signals";
  toast(`Added ${name}. Load its stores from the Data tab: OpenStreetMap, an All the Places file or a CSV.`);
});

// ================= Data tab =================
function renderSources() {
  const n = stores.length;
  const bySrc = {};
  for (const s of stores) bySrc[s.src] = (bySrc[s.src] || 0) + 1;
  const srcLine = Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(" · ");
  const mm = marketMeta;
  const rows = [
    ["Store locations", n ? `${fmt(n)} stores` : "Loading…", n ? `${loadedBrands.size} chains${storeMeta.saved ? `, saved ${new Date(storeMeta.saved + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}. ${srcLine}.` : ""],
    ["Neighborhoods", tracts.length ? `${fmt(tracts.length)} tracts` : market.error ? "Didn't load" : "Loading…", `Census American Community Survey 5-year estimates${mm ? `, ${mm.acs}` : ""}.`],
    ["County growth", mm ? `Vintage ${mm.pep}` : "Loading…", "Census population estimates, July 2020 to July 2025, including domestic migration."],
    ["Home values and rents", mm ? `Through ${monthName(mm.zori)}` : "Loading…", `Zillow Home Value Index (mid-tier) and Zillow Observed Rent Index, by county and ${zips.length ? fmt(zips.length) + " " : ""}ZIP codes.`],
    ["Housing supply", mm ? `Permits ${mm.permits}` : "Loading…", "Census Building Permits Survey: units permitted by county, single-family and 5+ unit buildings, last three full years."],
    ["Announced openings", `${upcoming.length}`, "Company coming-soon lists and local reporting. Add your own in Openings."],
  ];
  $("sources").innerHTML = rows.map(([t, v, d]) => `<div><dt>${escapeHtml(t)}</dt><dd>${escapeHtml(v)}</dd><span class="sd">${escapeHtml(d)}</span></div>`).join("");
}

// ---------- OpenStreetMap loading ----------
function groupQuery(g) {
  const lines = g.brands.flatMap(b => {
    const f = b.ci === false ? "" : ",i";
    const lines = [`  nwr${b.sel}["brand"~"${b.re}"${f}](area.us);`];
    if (!b.brandOnly) lines.push(`  nwr${b.sel}["name"~"${b.re}"${f}](area.us);`);
    return lines;
  });
  return `[out:json][timeout:180];\narea["ISO3166-1"="US"][admin_level=2]->.us;\n(\n${lines.join("\n")}\n);\nout center;`;
}
async function checkConnection() {
  const kinds = [];
  for (const ep of ENDPOINTS) {
    try {
      const r = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent("[out:json][timeout:20];node(1);out ids;") });
      if (r.ok) { ENDPOINTS = [ep, ...ENDPOINTS.filter(e => e !== ep)]; return { ok: true }; }
      kinds.push(r.status === 429 || r.status === 504 ? "busy" : `HTTP ${r.status}`);
    } catch (e) { kinds.push("blocked"); }
  }
  return { ok: false, blocked: kinds.every(k => k === "blocked"), detail: kinds.join(", ") };
}
async function overpass(q) {
  let lastErr = null;
  for (const ep of ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
        if (r.status === 429 || r.status === 504) { lastErr = new Error(`${new URL(ep).host} busy (HTTP ${r.status})`); await sleep(10000 * (attempt + 1)); continue; }
        if (!r.ok) { lastErr = new Error(`${new URL(ep).host} returned HTTP ${r.status}`); break; }
        const j = await r.json();
        if (j.remark && /timed out|runtime error|out of memory/i.test(j.remark)) { lastErr = new Error(j.remark); break; }
        return j;
      } catch (e) { lastErr = e; break; }
    }
  }
  throw lastErr || new Error("No server responded");
}
const dedupeKey = (b, lat, lon) => b + ":" + Math.round(lat / 0.002) + ":" + Math.round(lon / 0.0025);   // ~200 m
function parseGroup(json, g) {
  const seen = new Set(), out = [];
  for (const el of json.elements || []) {
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const t = el.tags || {};
    const b = g.brands.find(b => b.rx.test(t.brand || "")) || g.brands.find(b => b.rx.test(t.name || ""));
    if (!b) continue;
    const k = dedupeKey(b.name, lat, lon);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ g: b.g, b: b.name, lat, lon, city: t["addr:city"] || "", st: toAbbr(t["addr:state"]), src: "OpenStreetMap" });
  }
  return out;
}
// Each chain's source is where most of its stores came from. It decides what the OpenStreetMap refresh may replace,
// so a chain mostly from All the Places, topped up from OpenStreetMap, keeps its better data.
function tagBrandSources() {
  const n = {};
  for (const s of stores) (n[s.b] ||= {})[s.src] = (n[s.b]?.[s.src] || 0) + 1;
  brandSrc = {};
  for (const [b, by] of Object.entries(n)) brandSrc[b] = Object.keys(by).reduce((a, c) => by[c] > by[a] ? c : a);
}
// Replace a set of brands' stores with new ones, recording the source.
function replaceBrands(got, brandNames) {
  const set = new Set(brandNames);
  stores = stores.filter(s => !set.has(s.b)).concat(got);
  for (const n of set) { const any = got.find(s => s.b === n); if (any) brandSrc[n] = any.src; else if (!stores.some(s => s.b === n)) delete brandSrc[n]; }
}

let loading = false;
async function loadGroups(indices) {
  if (loading) return;
  setStatus("Checking connection to OpenStreetMap…");
  const conn = await checkConnection();
  if (!conn.ok) {
    const msg = conn.blocked ? "Couldn't reach OpenStreetMap. A firewall, VPN or ad blocker may be blocking it." : "The free OpenStreetMap servers are busy. Try again in a minute or two.";
    setStatus(`${msg} (${conn.detail})`, true); toast(msg, true);
    return;
  }
  loading = true;
  $("loadBtn").disabled = true;
  $("progress").classList.add("on");
  let done = 0, next = 0;
  const failed = [], log = [], kept = [];
  const tick = () => { $("progress").firstElementChild.style.width = `${Math.max(3, Math.round(done / indices.length * 100))}%`; };
  tick();
  async function worker() {
    while (next < indices.length) {
      const gi = indices[next++];
      const g = GROUPS[gi];
      // Chains already loaded from All the Places or a CSV keep that better data.
      const osmBrands = g.brands.map(b => b.name).filter(n => !brandSrc[n] || brandSrc[n] === "OpenStreetMap");
      if (!osmBrands.length) { kept.push(g.name); gState[gi] = "done"; done++; tick(); continue; }
      gState[gi] = "loading"; renderGroups();
      setStatus(`Loading ${done + 1} of ${indices.length} signals… large chains like Starbucks can take a minute.`);
      try {
        const got = parseGroup(await overpass(groupQuery(g)), g).filter(s => osmBrands.includes(s.b));
        replaceBrands(got, osmBrands);
        osmBrands.forEach(n => loadedBrands.add(n));
        gState[gi] = "done";
      } catch (e) {
        gState[gi] = "error"; failed.push(gi); log.push(`${g.name}: ${e && e.message ? e.message : e}`); console.warn(g.name, e);
      }
      done++; tick();
      refreshAll();
      await sleep(1200);
    }
  }
  await Promise.all([worker(), worker()]);
  loading = false;
  $("loadBtn").disabled = false;
  $("progress").classList.remove("on");
  renderSources();
  if (failed.length) {
    $("loadBtn").textContent = "Retry missing signals";
    setStatus(`${fmt(stores.length)} stores. These didn't load: ${failed.map(i => GROUPS[i].name).join(", ")}. ${log.join("; ")}`, true);
    toast(`${failed.length} signals didn't load. Retry from the Data tab in a minute.`, true);
  } else {
    $("loadBtn").textContent = "Refresh from OpenStreetMap";
    setStatus(`${fmt(stores.length)} stores loaded.${kept.length ? ` Kept your file data for ${kept.join(", ")}.` : ""} Save data to keep the result.`);
    toast("Store data updated.");
  }
}
function groupComplete(gi) { return GROUPS[gi].brands.every(b => loadedBrands.has(b.name)); }
function loadClicked() {
  const missing = GROUPS.map((_, i) => i).filter(i => gState[i] === "error" || gState[i] === "idle" || !groupComplete(i));
  loadGroups(missing.length && stores.length ? missing : GROUPS.map((_, i) => i));
}
$("loadBtn").addEventListener("click", loadClicked);

// ---------- Opening files ----------
const matchBrand = (...names) => { for (const n of names) { if (!n) continue; const b = BRANDS.find(b => b.rx.test(String(n).trim())); if (b) return b; } return null; };

function parseGeoJSON(data) {
  const got = [], seen = new Set();
  let skipped = 0, foreign = 0;
  for (const f of data.features || []) {
    const p = f.properties || {}, geo = f.geometry;
    if (!geo || geo.type !== "Point") { skipped++; continue; }
    const [lon, lat] = geo.coordinates || [];
    if (!isFinite(lat) || !isFinite(lon)) { skipped++; continue; }
    const country = String(p["addr:country"] || "").toUpperCase();
    if ((country && country !== "US" && country !== "PR") || !inUS(lat, lon)) { foreign++; continue; }
    const b = matchBrand(p.brand, p.name);
    if (!b) { skipped++; continue; }
    const k = dedupeKey(b.name, lat, lon);
    if (seen.has(k)) continue;
    seen.add(k);
    got.push({ g: b.g, b: b.name, lat, lon, city: p["addr:city"] || "", st: toAbbr(p["addr:state"]), src: "All the Places" });
  }
  return { got, skipped, foreign };
}
function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === "," || c === "\t") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}
function readCSV(text) {
  const rows = parseCSV(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("empty");
  const head = rows[0].map(v => v.trim().toLowerCase());
  const col = names => head.findIndex(h => names.includes(h));
  const bi = col(["brand", "chain", "brand name", "store", "store name", "name", "company", "retailer", "location name"]);
  const la = col(["lat", "latitude", "y"]), lo = col(["lon", "lng", "long", "longitude", "x"]);
  const ci = col(["city", "addr:city"]), si = col(["state", "st", "addr:state", "region"]);
  const sti = col(["status", "store status"]), wi = col(["opening date", "open date", "expected", "opening", "date"]);
  if (bi < 0 || la < 0 || lo < 0) throw new Error("columns");
  const got = [], ups = []; let skipped = 0;
  const seen = new Set();
  for (const r of rows.slice(1)) {
    const lat = parseFloat(r[la]), lon = parseFloat(r[lo]);
    const b = matchBrand(r[bi]);
    if (!b || !inUS(lat, lon)) { skipped++; continue; }
    const status = sti >= 0 ? String(r[sti] || "") : "";
    if (/coming|planned|proposed|announced|upcoming|soon|future|construction/i.test(status)) {
      ups.push({ g: b.g, b: b.name, place: [ci >= 0 ? r[ci] : "", si >= 0 ? r[si] : ""].filter(Boolean).join(", ") || `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
        status: /proposed/i.test(status) ? "proposed" : "planned", when: wi >= 0 ? (r[wi] || "").trim() : "", src: { name: "Your CSV", url: "" }, lat, lon });
      continue;
    }
    const k = dedupeKey(b.name, lat, lon);
    if (seen.has(k)) continue;
    seen.add(k);
    got.push({ g: b.g, b: b.name, lat, lon, city: ci >= 0 ? (r[ci] || "").trim() : "", st: si >= 0 ? toAbbr(r[si]) : "", src: "CSV" });
  }
  if (!got.length && !ups.length) throw new Error("nomatch");
  return { got, ups, skipped };
}
function loadSaved(data) {
  restoreCustom(data.custom);
  activePreset = matchPreset(); renderPresets(); fillAddBrand(); fillCustomForm(); updateFrontierControls();
  const rows = Array.isArray(data.stores) ? data.stores : [];
  const SRCS = ["OpenStreetMap", "All the Places", "CSV"];
  stores = rows.filter(r => Array.isArray(r) && brandByName.has(r[0]) && inUS(r[1], r[2]))
    .map(r => ({ g: brandByName.get(r[0]).g, b: r[0], lat: r[1], lon: r[2], city: tidyCity(str(r[3], 80)), st: toAbbr(str(r[4], 30)), src: SRCS.includes(r[5]) ? r[5] : "OpenStreetMap" }));
  tagBrandSources();
  if (Array.isArray(data.upcoming)) upcoming = cleanUpcoming(data.upcoming);
  // Older saved files don't record which brands were fetched, so treat a brand with stores as loaded.
  loadedBrands = new Set((Array.isArray(data.loaded) ? data.loaded : []).filter(n => brandByName.has(n)));
  for (const s of stores) loadedBrands.add(s.b);
  gState = GROUPS.map((g, i) => groupComplete(i) ? "done" : "idle");
  storeMeta = { saved: String(data.saved || "").slice(0, 10) };
  return BRANDS.filter(b => !loadedBrands.has(b.name)).map(b => b.name);
}
$("importBtn").addEventListener("click", () => $("fileIn").click());
$("fileIn").addEventListener("change", async e => {
  const files = [...e.target.files]; e.target.value = "";
  if (!files.length) return;
  const notes = [], problems = [];
  const atp = [], csvStores = [];
  let atpForeign = 0;
  for (const f of files) {
    const text = await f.text();
    try {
      if (/\.(csv|tsv)$/i.test(f.name) || f.type === "text/csv") {
        const { got, ups, skipped } = readCSV(text);
        csvStores.push(...got);
        if (ups.length) { upcoming.push(...ups); notes.push(`${fmt(ups.length)} upcoming openings from ${f.name}`); }
        if (skipped) notes.push(`${fmt(skipped)} rows skipped in ${f.name}`);
        continue;
      }
      const data = JSON.parse(text);
      if (data.kind === "retail-signal-map") {
        const missing = loadSaved(data);
        notes.push(`opened data saved ${String(data.saved || "").slice(0, 10)}`);
        if (missing.length) { $("loadBtn").textContent = "Load new and missing signals"; notes.push(`not in that file yet: ${missing.join(", ")}`); }
      } else if (data.type === "FeatureCollection") {
        const r = parseGeoJSON(data);
        if (!r.got.length) problems.push(`${f.name} had no US locations for a tracked chain`);
        atp.push(...r.got); atpForeign += r.foreign;
      } else problems.push(`${f.name} isn't a format this map reads`);
    } catch (err) {
      const why = err.message === "columns" ? "it needs columns named brand (or name), latitude and longitude"
        : err.message === "nomatch" ? "none of its rows matched a tracked chain" : err.message === "empty" ? "it looks empty" : "it couldn't be read";
      problems.push(`${f.name}: ${why}`);
    }
  }
  for (const [list, label] of [[atp, "All the Places"], [csvStores, "CSV"]]) {
    if (!list.length) continue;
    const names = [...new Set(list.map(s => s.b))];
    replaceBrands(list, names);
    names.forEach(n => loadedBrands.add(n));
    names.forEach(n => { const gi = brandByName.get(n).g; if (groupComplete(gi)) gState[gi] = "done"; });
    notes.unshift(`${fmt(list.length)} stores from ${label} for ${names.join(", ")}`);
  }
  if (atpForeign) notes.push(`${fmt(atpForeign)} non-US locations left out`);
  refreshAll(); renderUpcoming(); renderSources();
  const msg = (notes.length ? notes.join(". ") + "." : "") + (problems.length ? ` Couldn't use: ${problems.join("; ")}.` : "");
  setStatus(msg.trim() || "Nothing to open.", problems.length > 0 && !notes.length);
  if (notes.length) toast("Files opened. Scores updated.");
});

// ---------- Save ----------
$("exportBtn").addEventListener("click", () => {
  const data = { kind: "retail-signal-map", version: 4, saved: new Date().toISOString(),
    stores: stores.map(s => [s.b, +s.lat.toFixed(5), +s.lon.toFixed(5), s.city, s.st, s.src]),
    upcoming: upcoming.map(({ g, ...u }) => u), census: null, loaded: [...loadedBrands], custom: customDefs };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `retail-signal-data-${data.saved.slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

// Announced openings from a file or the bundled data: known chain, known status, US coordinates, http(s) source.
function cleanUpcoming(list) {
  return list.filter(u => u && brandByName.has(u.b) && Object.hasOwn(STATUS_LABEL, u.status) && inUS(+u.lat, +u.lon)).slice(0, 2000).map(u => ({
    g: brandByName.get(u.b).g, b: u.b, place: str(u.place, 120), status: u.status, when: str(u.when, 80), lat: +u.lat, lon: +u.lon,
    src: u.src && safeUrl(u.src.url) ? { name: str(u.src.name, 120) || "Source", url: str(u.src.url, 500) } : null,
  }));
}

// ================= Guided tour =================
// A skippable walkthrough, offered once on a first plain visit and replayable from Tour. It borrows the page
// (a sample site report, the Top areas and Deals tabs) and puts everything back the way it was when it ends.
const TOUR_KEY = "rs.tour.v1";
const TOUR = [
  { intro: true, title: "Welcome to Retail Signal",
    text: "The map scores every part of the US by which site-selective chains, like Costco, Trader Joe's and Chick-fil-A, have opened nearby, then adds rents, incomes, growth and new supply on top. This short tour shows what you can do with it." },
  { el: () => $("lens").parentElement, side: "right", title: "Pick your strategy",
    text: "Each lens weights the chains and sets starting filters for one kind of buyer: multifamily, single-family, plain retail signal, or Frontier, where early movers have arrived but the big anchors haven't. Fine-tune any of it in the Signals tab." },
  { el: () => $("legendCard"), side: "right", title: "Read the map",
    text: "Darker orange means more of the lens's chains within the trade area. Use this menu to shade by something else instead, like rent growth by ZIP code, apartment pipeline by county or income by neighborhood." },
  { el: () => $("searchForm"), side: "bottom", title: "Search, or click anywhere",
    text: "Look up an address, city, county or ZIP code, or just click the map. Either way you get a site report for that spot. Press / to jump to search." },
  { el: () => $("report"), side: "left", report: true, before: () => { $("report").scrollTop = 0; }, title: "Site reports",
    text: () => `${tour.saved.report ? "This is the report you had open." : "Here's the report for the top-ranked area."} Each one covers the score and national rank, trade-area rent, income and home values, Zillow rent trends for the ZIP code, county growth and building permits, and every nearby chain with a Google Maps link to confirm it.` },
  { el: () => $("report").querySelector('[data-act="cmp"]'), side: "left", report: true, title: "Compare up to four sites",
    text: "Add sites from their reports, then click Compare at the top to see them side by side, with the best value in each row highlighted. Export or print the table." },
  { el: () => $("filterBlock"), tab: "areas", side: "right", title: "Top areas",
    text: "The best places under your lens are listed below these controls. Multifamily and Single-family rank them on the signal score and market momentum together. Filter by income, affordability, renter share, growth, rent growth and apartment pipeline, rank them your way, and export the list to CSV." },
  { el: () => $("dealIntro"), tab: "deals", side: "right", title: "Score your own deal list",
    text: "Upload a CSV of properties with addresses or coordinates. Each one is scored under the current lens and ranked, and your own columns, like units or price, carry through to the export. The list stays in your browser." },
  { el: () => $("shareBtn"), side: "bottom", title: "Share exactly what you see",
    text: "The link holds your lens, filters, map view and open report. Copy it, and whoever opens it sees the same thing." },
  { el: () => $("tourBtn"), side: "bottom", title: "You're all set",
    text: "Replay this tour anytime from here. Data sources and notes on how scores are built are in the Data tab." },
];
let tour = null;
function startTour() {
  if (tour) return;
  tour = {
    steps: TOUR.filter(s => !s.report || stores.length), i: 0, demo: false, raf: 0, lastFocus: document.activeElement,
    saved: { tab: document.querySelector(".tabs [aria-selected=true]")?.dataset.tab || "areas", center: map.getCenter(), zoom: map.getZoom(),
      report: reportAt && { ...reportAt }, cmp: cmpOpen, scrollY: window.scrollY },
  };
  local.set(TOUR_KEY, 1);
  if (cmpOpen) closeCompare();
  const root = tour.root = document.createElement("div");
  root.className = "tour";
  root.innerHTML = `<div class="tour-scrim"></div><div class="tour-hole"></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourText">
      <div class="tour-kicker"><span id="tourCount"></span><span class="tour-bar"><i id="tourFill"></i></span></div>
      <div aria-live="polite"><h2 id="tourTitle"></h2><p id="tourText"></p></div>
      <div class="tour-nav"><button type="button" class="tour-skip" data-t="skip"></button><span class="sp"></span>
        <button type="button" class="btn" data-t="back">Back</button><button type="button" class="btn primary" data-t="next"></button></div>
    </div>`;
  root.addEventListener("click", e => {
    const t = e.target.closest("[data-t]")?.dataset.t;
    if (t === "skip") endTour(); else if (t === "back") stepTour(-1); else if (t === "next") stepTour(1);
  });
  document.body.appendChild(root);
  document.querySelector(".top").inert = true; document.querySelector(".app").inert = true;
  window.addEventListener("keydown", tourKey, true);
  window.addEventListener("resize", placeTourSoon);
  document.addEventListener("scroll", placeTourSoon, true);
  tour.timer = setInterval(placeTour, 300);   // catches reports re-rendering and panels sliding in
  showTourStep(0);
}
function stepTour(d) {
  if (d < 0 && tour.i <= 1) return;
  if (tour.i + d >= tour.steps.length) endTour(); else showTourStep(tour.i + d);
}
function showTourStep(i) {
  const s = tour.steps[i], n = tour.steps.length - 1;
  tour.i = i;
  if (s.report) tourReport(); else if (!s.intro && reportAt) closeReport();
  if (s.tab) showTab(s.tab);
  s.before?.();
  tour.root.classList.toggle("intro", !!s.intro);
  $("tourCount").textContent = s.intro ? "Quick tour" : `${i} of ${n}`;
  $("tourFill").style.width = `${i / n * 100}%`;
  $("tourTitle").textContent = s.title;
  $("tourText").textContent = typeof s.text === "function" ? s.text() : s.text;
  const btn = t => tour.root.querySelector(`[data-t="${t}"]`);
  btn("skip").textContent = s.intro ? "Skip" : "Skip tour"; btn("skip").hidden = i === n;
  btn("back").hidden = i <= 1;
  btn("next").textContent = s.intro ? "Start the tour" : i === n ? "Done" : "Next";
  const el = s.el?.();
  if (el && getComputedStyle(el).position !== "fixed") {
    // Partly hidden, or no room beside it for the card (a phone): scroll it to the top, leaving the card room below.
    const r = el.getBoundingClientRect(), v = tourClip(el, 0), card = tour.root.children[2];
    if (!v || v.top > r.top + 1 || v.bottom < r.bottom - 1 || !tourSide(tourClip(el, 6), card.offsetWidth, card.offsetHeight, s.side)) {
      let p = el.parentElement;
      while (p && p !== document.body && !/auto|scroll/.test(getComputedStyle(p).overflowY)) p = p.parentElement;
      el.scrollIntoView({ block: "start" });
      (p && p !== document.body ? p : window).scrollBy(0, -12);
    }
  }
  placeTour();
  btn("next").focus();
}
// The step's sample report: the one the visitor had open, or else the top-ranked area.
function tourReport() {
  if (reportAt) return;
  const r = tour.saved.report;
  if (r) { openReport(r.lat, r.lon, r.label); return; }
  const c = topItems[0] || { lat: 30.2672, lon: -97.7431 };
  tour.demo = true;
  map.flyTo([c.lat, c.lon], Math.max(map.getZoom(), 11), { duration: 0.8 });
  openReport(c.lat, c.lon);
}
function placeTourSoon() { if (tour && !tour.raf) tour.raf = requestAnimationFrame(() => { tour.raf = 0; placeTour(); }); }
// The part of an element (grown by pad) that's actually on screen: inside the viewport and every scrolling panel around it.
function tourClip(el, pad) {
  const r = el.getBoundingClientRect();
  let left = r.left - pad, top = r.top - pad, right = r.right + pad, bottom = r.bottom + pad;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (getComputedStyle(p).overflowY === "visible") continue;
    const b = p.getBoundingClientRect();
    left = Math.max(left, b.left); top = Math.max(top, b.top); right = Math.min(right, b.right); bottom = Math.min(bottom, b.bottom);
  }
  left = Math.max(left, 4); top = Math.max(top, 4);
  right = Math.min(right, document.documentElement.clientWidth - 4); bottom = Math.min(bottom, window.innerHeight - 4);
  return r.width && right - left > 8 && bottom - top > 8 ? { left, top, right, bottom } : null;
}
// Rings the step's element and sets the card beside it on the preferred side, or whichever side has room.
function placeTour() {
  if (!tour) return;
  const s = tour.steps[tour.i], [scrim, hole, card] = tour.root.children;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 12, gap = 14;
  const el = s.el?.();
  const H = el && el.isConnected ? tourClip(el, 6) : null;
  // The dim layer gets a rectangular hole (zero-sized and centered when there's nothing to point at).
  const [l, t, r, b] = H ? [H.left, H.top, H.right, H.bottom] : [vw / 2, vh / 2, vw / 2, vh / 2];
  scrim.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px ${t}px)`;
  hole.classList.toggle("none", !H);
  Object.assign(hole.style, { left: `${l}px`, top: `${t}px`, width: `${r - l}px`, height: `${b - t}px` });
  const cw = card.offsetWidth, ch = card.offsetHeight;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  let x = (vw - cw) / 2, y = (vh - ch) / 2;
  if (H) {
    const side = tourSide(H, cw, ch, s.side);
    const midX = clamp((H.left + H.right - cw) / 2, m, vw - cw - m), midY = clamp((H.top + H.bottom - ch) / 2, m, vh - ch - m);
    if (side === "right") { x = H.right + gap; y = midY; }
    else if (side === "left") { x = H.left - gap - cw; y = midY; }
    else if (side === "bottom") { x = midX; y = H.bottom + gap; }
    else if (side === "top") { x = midX; y = H.top - gap - ch; }
    else { x = midX; y = vh - ch - m; }   // no free side (a report filling a phone screen): cover its lower part
  }
  card.style.left = `${Math.round(x)}px`; card.style.top = `${Math.round(y)}px`;
}
// Which side of the ringed area has room for the card, trying the step's preferred side first.
function tourSide(H, cw, ch, pref) {
  if (!H) return null;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 12, gap = 14;
  const room = { right: vw - H.right - gap - m, left: H.left - gap - m, bottom: vh - H.bottom - gap - m, top: H.top - gap - m };
  return [pref, "bottom", "top", "right", "left"].find(k => k && room[k] >= (k === "left" || k === "right" ? cw : ch)) || null;
}
function tourKey(e) {
  if (e.key === "Escape") endTour();
  else if (e.key === "ArrowRight") stepTour(1);
  else if (e.key === "ArrowLeft") stepTour(-1);
  else if (e.key === "Tab") {
    const f = [...tour.root.querySelectorAll("button:not([hidden])")];
    const k = f.indexOf(document.activeElement);
    f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  } else if (e.key !== "/") return;
  e.preventDefault(); e.stopPropagation();   // keep the map's own shortcuts (Escape, /) out of it
}
function endTour() {
  if (!tour) return;
  const { saved, root, lastFocus, demo } = tour;
  clearInterval(tour.timer); cancelAnimationFrame(tour.raf);
  window.removeEventListener("keydown", tourKey, true);
  window.removeEventListener("resize", placeTourSoon);
  document.removeEventListener("scroll", placeTourSoon, true);
  root.remove();
  tour = null;
  document.querySelector(".top").inert = false; document.querySelector(".app").inert = false;
  showTab(saved.tab);
  const r = saved.report;
  if (r && !(reportAt && reportAt.lat === r.lat && reportAt.lon === r.lon)) openReport(r.lat, r.lon, r.label);
  else if (!r && reportAt) closeReport();
  if (demo) { map.stop(); map.setView(saved.center, saved.zoom, { animate: false }); }
  if (saved.cmp) openCompare();
  if (window.scrollY !== saved.scrollY) window.scrollTo(0, saved.scrollY);
  if (lastFocus && lastFocus !== document.body && lastFocus.isConnected) lastFocus.focus();
}
$("tourBtn").addEventListener("click", startTour);

// ================= Start =================
// Some store locators publish cities in capitals ("ARLINGTON"); show them in title case.
const tidyCity = c => c && c === c.toUpperCase() && /[A-Z]{3}/.test(c) ? c.toLowerCase().replace(/(^|[\s\-'.])([a-z])/g, (m, p, ch) => p + ch.toUpperCase()) : c;
function applyBundledStores(j) {
  const places = j.places.map(p => { const [city, st] = p.split("|"); return { city: tidyCity(city || ""), st: st || "" }; });
  stores = [];
  for (const [bi, lat, lon, pi, si] of j.rows) {
    const b = brandByName.get(j.brands[bi]); if (!b) continue;
    stores.push({ g: b.g, b: b.name, lat, lon, city: places[pi].city, st: places[pi].st, src: j.srcs[si] });
  }
  tagBrandSources();
  loadedBrands = new Set((j.loaded || []).filter(n => brandByName.has(n)));
  for (const s of stores) loadedBrands.add(s.b);
  gState = GROUPS.map((g, i) => groupComplete(i) ? "done" : "idle");
  storeMeta = { saved: j.saved || "" };
}
async function start() {
  renderPresets(); fillAddBrand(); fillCustomForm(); fillColorBy();
  const at = readUrl();
  urlReady = true;
  try {
    const [s, up] = await Promise.all([getJSON(dataUrl("stores.json")), getJSON(dataUrl("upcoming.json")).catch(() => [])]);
    applyBundledStores(s);
    upcoming = cleanUpcoming(Array.isArray(up) ? up : []);
    restoreDeals();
    refreshAll(); renderUpcoming(); renderSources();
    $("overlay").hidden = true;
    if (compare.length) afterCompareChange();
    if (at) openReport(at.lat, at.lon, at.label, at.pin);
    // First visit: offer the tour, unless a shared link brought them to a specific report or comparison.
    else if (!compare.length && !local.get(TOUR_KEY)) setTimeout(startTour, 400);
  } catch (e) {
    console.error(e);
    $("overlay").classList.add("err");
    $("oTitle").textContent = "Store data didn't load";
    $("oText").textContent = location.protocol === "file:"
      ? "Browsers block data files opened straight from disk. Run a local server (see the README) or use the hosted site."
      : "Check your connection and reload the page.";
    return;
  }
  loadMarket();
}
start();
