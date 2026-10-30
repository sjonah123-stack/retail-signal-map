#!/usr/bin/env node
// Checks each preset's chain weights against the goal it was fitted to, using the bundled data. Rerun after a store or
// market data refresh to see whether the weights still hold:  node scripts/check_lens_weights.mjs
//
// For every census tract with a signal nearby, it measures which chain groups have a store within 5 miles, the 5-mile
// trade area's Census figures (as the site report computes them), county growth and the nearest ZIP's Zillow trends.
// Per goal it prints:
//   fit    how much a group's presence moves the goal (in standard deviations), compared within each state and holding
//          every other group fixed; "." where the two halves of the country disagree on the direction
//   now    the preset's current weight
// and how well the preset ranks areas: rank correlation with the goal, the goal's average among the top tenth of
// scores, and the regional mix of the top 5% against the goal's own top 5%.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "assets/app.js"), "utf8");
const slice = (start, end) => app.slice(app.indexOf(start) + start.length, app.indexOf(end));
const GROUPS = eval(slice("const GROUPS = ", ";\nconst CATS"));
const byNames = (obj, dflt) => GROUPS.map(g => obj[g.name] ?? dflt);   // used by the PRESETS source
const PRESETS = eval(slice("const PRESETS = ", ";\n\n// A lens is"));
const DEFAULT_ROLE = eval("(" + slice("const DEFAULT_ROLE = ", ";\nlet roles") + ")");
const G = GROUPS.length, groupOf = new Map();
GROUPS.forEach((g, gi) => g.brands.forEach(b => groupOf.set(b.name, gi)));

const load = f => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));
const S = load("stores.json"), T = load("tracts.json"), Z = load("zips.json"), C = load("counties.json");
const R = 5, LATE_R = 10;
const key = (i, j) => i * 100000 + j;
const dist = (a, b, c, d) => Math.hypot((d - b) * Math.cos((a + c) / 2 * Math.PI / 180), c - a) * 69;
function buckets(items) {
  const m = new Map();
  for (const it of items) { const k = key(Math.floor(it.lat * 10), Math.floor(it.lon * 10)); if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
  return m;
}
// 0.1° buckets: 10 mi spans two either way in latitude and three in longitude as far north as the border.
function* near(m, lat, lon, r) {
  const di = r > 5 ? 2 : 1, dj = r > 5 ? 3 : 2, i0 = Math.floor(lat * 10), j0 = Math.floor(lon * 10);
  for (let i = -di; i <= di; i++) for (let j = -dj; j <= dj; j++) for (const it of m.get(key(i0 + i, j0 + j)) || []) if (dist(lat, lon, it.lat, it.lon) <= r) yield it;
}
const sb = buckets(S.rows.map(([bi, lat, lon]) => ({ g: groupOf.get(S.brands[bi]), lat, lon })).filter(s => s.g != null));
const tc = T.cols, tb = buckets(Array.from({ length: T.n }, (_, t) => ({ t, lat: tc.lat[t] / 1e4, lon: tc.lon[t] / 1e4 })));
const zc = Z.cols, zb = buckets(Array.from({ length: Z.n }, (_, i) => ({ i, lat: zc.lat[i] / 1e4, lon: zc.lon[i] / 1e4 })));
function nearestZip(lat, lon, f) {
  let best = null, bd = R;
  for (const z of near(zb, lat, lon, R)) if (zc[f][z.i] != null) { const d = dist(lat, lon, z.lat, z.lon); if (d < bd) { bd = d; best = zc[f][z.i]; } }
  return best;
}
function tradeArea(lat, lon) {
  let pop = 0, area = 0, incW = 0, incH = 0, hvW = 0, hvO = 0, rentW = 0, rentR = 0, ed = 0, bachN = 0, occ = 0, rnt = 0, ybW = 0, ybU = 0;
  for (const { t } of near(tb, lat, lon, R)) {
    const o = tc.occ[t] || 0, r = tc.rnt[t] || 0;
    pop += tc.pop[t] || 0; area += tc.area_k[t] * 1000;
    if (tc.inc[t] && o) { incW += tc.inc[t] * o; incH += o; }
    if (tc.hv[t] && o - r > 0) { hvW += tc.hv[t] * (o - r); hvO += o - r; }
    if (tc.rent[t] && r) { rentW += tc.rent[t] * r; rentR += r; }
    if (tc.yb[t] && tc.units[t]) { ybW += tc.yb[t] * tc.units[t]; ybU += tc.units[t]; }
    ed += tc.ed[t] || 0; bachN += tc.bachN[t] || 0; occ += o; rnt += r;
  }
  const inc = incH ? incW / incH : null, hv = hvO ? hvW / hvO : null;
  return { inc, hv, rent: rentR ? rentW / rentR : null, pti: inc && hv ? hv / inc : null, bach: ed ? bachN / ed * 100 : null,
    renter: occ ? rnt / occ * 100 : null, yb: ybU ? ybW / ybU : null, dens: area ? pop / (area / 2589988) : null };
}

const rows = [];
for (let t = 0; t < T.n; t++) {
  const lat = tc.lat[t] / 1e4, lon = tc.lon[t] / 1e4, pres = new Array(G).fill(0), p10 = new Array(G).fill(0);
  for (const s of near(sb, lat, lon, LATE_R)) { p10[s.g] = 1; if (dist(lat, lon, s.lat, s.lon) <= R) pres[s.g] = 1; }
  if (!pres.some(Boolean)) continue;   // the map only scores places with a signal nearby
  const fips = T.counties[tc.c[t]], cd = C.counties[fips];
  if (!cd || !tc.pop[t]) continue;
  const ta = tradeArea(lat, lon);
  if (!ta.inc || !ta.hv || !ta.rent || ta.bach == null) continue;
  rows.push({ st: fips.slice(0, 2), fips, pres, p10, ta, popg: cd.popg ?? null, dmig: cd.dmig ?? null,
    zori3: nearestZip(lat, lon, "zori3") ?? cd.zori3 ?? null, zhvi5: nearestZip(lat, lon, "zhvi5") ?? cd.zhvi5 ?? null, y: {} });
}

// Each goal: the areas it applies to (the lens's starting filters) and the parts it averages, each standardized.
const log = f => r => Math.log(f(r));
const GOALS = {
  mf: { label: "Multifamily: rents, educated renters, rent growth, in-migration", where: r => r.ta.renter >= 30 && r.popg >= 0,
    parts: [[log(r => r.ta.rent), 1 / 4], [r => r.ta.bach, 1 / 4], [r => r.zori3, 1 / 6], [r => r.dmig, 1 / 6], [r => r.popg, 1 / 6]] },
  sf: { label: "Single-family: incomes, ownership, newer homes, growth", where: r => r.ta.inc >= 65000 && r.ta.pti <= 5 && r.popg >= 3,
    parts: [[log(r => r.ta.inc), 0.2], [r => 100 - r.ta.renter, 0.2], [r => r.zhvi5, 0.15], [r => r.popg, 0.15], [r => r.dmig, 0.15], [r => r.ta.yb, 0.15]] },
  affluent: { label: "Affluent: incomes, home values, rents, education", where: () => true,
    parts: [[log(r => r.ta.inc), 1 / 4], [log(r => r.ta.hv), 1 / 4], [log(r => r.ta.rent), 1 / 4], [r => r.ta.bach, 1 / 4]] },
  high: { label: "High-end only: the same, among $100K+ areas", where: r => r.ta.inc >= 100000,
    parts: [[log(r => r.ta.inc), 1 / 4], [log(r => r.ta.hv), 1 / 4], [log(r => r.ta.rent), 1 / 4], [r => r.ta.bach, 1 / 4]] },
  growth: { label: "Growth suburbs: population, migration, home values, newer homes", where: r => r.ta.dens < 4000,
    parts: [[r => r.popg, 1 / 4], [r => r.dmig, 1 / 4], [r => r.zhvi5, 1 / 4], [r => r.ta.yb, 1 / 4]] },
};
const zscores = v => { const mu = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length); return v.map(x => (x - mu) / sd); };
for (const [id, g] of Object.entries(GOALS)) {
  g.rows = rows.filter(r => g.where(r) && g.parts.every(([f]) => Number.isFinite(f(r))));
  const z = g.parts.map(([f]) => zscores(g.rows.map(f)));
  g.rows.forEach((r, i) => { r.y[id] = g.parts.reduce((a, [, w], k) => a + w * z[k][i], 0); });
}

function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
// Least squares of the goal on every group's presence, demeaned within state, so a regional chain isn't credited for
// its region.
function fit(sample, id) {
  const X = sample.map(r => r.pres.slice()), Y = sample.map(r => r.y[id]), byState = new Map();
  sample.forEach((r, i) => { if (!byState.has(r.st)) byState.set(r.st, []); byState.get(r.st).push(i); });
  for (const idx of byState.values()) {
    const m = new Array(G + 1).fill(0);
    for (const i of idx) { for (let j = 0; j < G; j++) m[j] += X[i][j]; m[G] += Y[i]; }
    for (const i of idx) { for (let j = 0; j < G; j++) X[i][j] -= m[j] / idx.length; Y[i] -= m[G] / idx.length; }
  }
  const XtX = Array.from({ length: G }, () => new Array(G).fill(0)), Xty = new Array(G).fill(0);
  for (let i = 0; i < X.length; i++) for (let a = 0; a < G; a++) { Xty[a] += X[i][a] * Y[i]; for (let b = 0; b < G; b++) XtX[a][b] += X[i][a] * X[i][b]; }
  for (let a = 0; a < G; a++) XtX[a][a] += 1e-3;
  return solve(XtX, Xty);
}
const half = fips => (((+fips * 2654435761) >>> 0) >>> 15) & 1;   // two halves of the country by county
const ranks = v => { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(v.length);
  for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const corr = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; } return ab / Math.sqrt(aa * bb); };
const score = (r, w) => r.pres.reduce((a, p, g) => a + p * w[g], 0);
const REGION = st => "09 23 25 33 44 50 34 36 42".includes(st) ? "Northeast" : "17 18 26 39 55 19 20 27 29 31 38 46".includes(st) ? "Midwest"
  : "04 08 16 30 32 35 49 56 02 06 15 41 53".includes(st) ? "West" : "South";
const REGIONS = ["Northeast", "Midwest", "South", "West"];
const topMix = (sample, f) => {
  const top = sample.map(r => [f(r), Math.sin(r.ta.inc), r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]).slice(0, Math.ceil(sample.length / 20)).map(x => x[2]);
  return REGIONS.map(g => Math.round(top.filter(r => REGION(r.st) === g).length / top.length * 100));
};
const sgn = v => (v >= 0 ? "+" : "") + v.toFixed(2);

for (const [id, g] of Object.entries(GOALS)) {
  const w = PRESETS.find(p => p.id === id).w, smp = g.rows;
  const b = fit(smp, id), h = [0, 1].map(k => fit(smp.filter(r => half(r.fips) === k), id));
  console.log(`\n${g.label} (${smp.length.toLocaleString()} tracts)`);
  console.log(`  ${"group".padEnd(26)}  near    fit  now`);
  GROUPS.map((gr, gi) => ({ gr, gi, b: Math.sign(h[0][gi]) === Math.sign(h[1][gi]) ? b[gi] : null }))
    .sort((x, y) => (y.b ?? -9) - (x.b ?? -9))
    .forEach(({ gr, gi, b: v }) => console.log(`  ${gr.name.padEnd(26)} ${String(Math.round(smp.filter(r => r.pres[gi]).length / smp.length * 100)).padStart(4)}%  ${v == null ? "    ." : sgn(v)}  ${w[gi] ? w[gi] + "×" : "off"}`));
  const s = smp.map(r => score(r, w)), y = smp.map(r => r.y[id]);
  const top = s.map((v, i) => [v, Math.sin(i), y[i]]).sort((a, c) => c[0] - a[0] || c[1] - a[1]).slice(0, Math.ceil(s.length / 10));
  console.log(`  ranks areas: rank correlation ${corr(ranks(s), ranks(y)).toFixed(2)}, top tenth averages ${sgn(top.reduce((a, x) => a + x[2], 0) / top.length)} SD`);
  console.log(`  top 5% by region (${REGIONS.join(", ")}): score ${topMix(smp, r => score(r, w)).join("/")}%, goal ${topMix(smp, r => r.y[id]).join("/")}%`);
}

// Frontier: areas with 4+ early movers within 5 mi and no late anchor within 10 mi, against the rest of their state.
{
  const smp = rows.filter(r => [r.popg, r.dmig, r.zhvi5, r.zori3].every(Number.isFinite));
  const zs = [r => r.popg, r => r.dmig, r => r.zhvi5, r => r.zori3].map(f => zscores(smp.map(f)));
  const zi = zscores(smp.map(r => Math.log(r.ta.inc))), zv = zscores(smp.map(r => Math.log(r.ta.hv)));
  smp.forEach((r, i) => { r.gro = zs.reduce((a, z) => a + z[i], 0) / 4; r.aff = (zi[i] + zv[i]) / 2; });
  const st = new Map();
  for (const r of smp) { const m = st.get(r.st) || { n: 0, gro: 0, aff: 0, pti: 0 }; m.n++; m.gro += r.gro; m.aff += r.aff; m.pti += r.ta.pti; st.set(r.st, m); }
  const early = GROUPS.map((g, i) => DEFAULT_ROLE[g.name] === "early" ? i : -1).filter(i => i >= 0);
  const late = GROUPS.map((g, i) => DEFAULT_ROLE[g.name] === "late" ? i : -1).filter(i => i >= 0);
  const q = smp.filter(r => early.filter(g => r.pres[g]).length >= 4 && late.every(g => !r.p10[g]));
  const vs = k => sgn(q.reduce((a, r) => a + r[k] - st.get(r.st)[k] / st.get(r.st).n, 0) / q.length);
  const pti = q.reduce((a, r) => a + r.ta.pti - st.get(r.st).pti / st.get(r.st).n, 0) / q.length;
  console.log(`\nFrontier: ${q.length.toLocaleString()} tracts in ${new Set(q.map(r => r.st)).size} states qualify. Against the rest of their state:`);
  console.log(`  growth ${vs("gro")} SD, incomes and home values ${vs("aff")} SD, home price to income ${sgn(pti)}×`);
}
