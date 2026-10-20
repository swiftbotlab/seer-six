/* Risk Pricing (risk.seer.pm) — page script. Prefix rk- (see SYSTEM.md).
   Concept by Swift Bot Labs · not affiliated with Seer.
   Every figure is SAMPLE DATA from assets/sample-data.js (window.SEER_SAMPLE): 33 fictional assets on
   board #2850. Values derived here are deterministic and marked "derived": the traders' range around each
   price (seeded by asset, wider where liquidity is thin), the 12-week change, hazard shares for No to All.
   Seer facts restated as published: the Risk Pricing default definition, the quarterly token mechanics,
   the four bands and the annual <-> quarterly conversion. All text goes in via textContent. */
(function () {
  "use strict";
  var D = window.SEER_SAMPLE, S = window.Seer;
  if (!D || !S || !S.ui) return;
  var F = S.fmt, el = S.el, sv = S.svgEl, $ = S.$, $$ = S.$$;
  var NOW = D.now, DAY = 864e5;
  var BOARD = D.risk, MKT = D.market(BOARD.marketId) || { id: "2850", volume: 0, liquidity: 0, address: "" };
  var BANDS = D.bands, BAND = {}; BANDS.forEach(function (b) { BAND[b.id] = b; });
  var GROUPS = BOARD.groups, GLABEL = {}; GROUPS.forEach(function (g) { GLABEL[g.id] = g.label; });
  var CLOSES = Date.parse(BOARD.trading.closes), OPENED = Date.parse(BOARD.trading.opens);
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ======================= maths ======================= */
  function log10(x) { return Math.log(x) / Math.LN10; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  var DOM_Y = [0.0004, 0.4];                      // 3 decades of yearly PD
  var TICKS = [.0002, .0005, .001, .002, .005, .01, .02, .05, .1, .2];
  var EDGES = [.02, .05, .1];                     // band edges, per year
  function hv(x, h) { return h === "q" ? D.quarterly(x) : x; } // x is a yearly PD
  function dom(h) { return [hv(DOM_Y[0], h), hv(DOM_Y[1], h)]; }
  function pos(p, h) { var d = dom(h), a = log10(d[0]), b = log10(d[1]); return clamp((log10(Math.max(p, 1e-9)) - a) / (b - a), 0, 1); }
  function fromPos(t) { var a = log10(DOM_Y[0]), b = log10(DOM_Y[1]); return Math.pow(10, a + clamp(t, 0, 1) * (b - a)); } // -> yearly PD
  function ticks(h) { var d = dom(h); return TICKS.filter(function (t) { return t >= d[0] * .999 && t <= d[1] * 1.001; }); }
  function mant(t) { return Math.round(t / Math.pow(10, Math.floor(log10(t) + 1e-9))); }
  function edges(h) { return EDGES.map(function (e) { return hv(e, h); }); }
  function phi(z) { var t = 1 / (1 + .2316419 * Math.abs(z)), d = .3989423 * Math.exp(-z * z / 2), p = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
  function hazard(p) { return -Math.log(1 - p); }

  /* ======================= formatters ======================= */
  function pdF(p) { return F.pct(p, 2); }
  function tickF(p) { var v = p * 100; return (v >= 1 ? String(Math.round(v)) : String(+v.toPrecision(1))) + "%"; }
  function edgeF(p, h) { return h === "q" ? pdF(p) : tickF(p); }
  // y-axis formatter for log charts: exact ticks get a short label (band edges also name the band); other values 2 dp
  function tickFmt(tks, h) {
    var ed = edges(h);
    return function (v) {
      for (var i = 0; i < tks.length; i++) if (Math.abs(log10(tks[i]) - v) < 1e-9) {
        for (var k = 0; k < ed.length; k++) if (Math.abs(ed[k] - tks[i]) / tks[i] < .02) return tickF(tks[i]) + " · " + BANDS[k + 1].label;
        return tickF(tks[i]);
      }
      return pdF(Math.pow(10, v));
    };
  }
  function centsF(p) { return F.num(p * 100, 2) + "¢"; }
  // #2850 is multi-categorical: 1 sDAI is split between the assets that default, so a token trades a little under
  // its quarterly PD. tokP(q) = q x riskScale (the same prices the App shows for #2850).
  var SCALE = MKT.riskScale || 1;
  function tokP(q) { return q * SCALE; }
  function hWord(h) { return h === "q" ? "per quarter" : "per year"; }
  function hShort(h) { return h === "q" ? "/ qtr" : "/ yr"; }
  function times(x) { return (x >= 10 ? F.num(x, 0) : F.num(x, 1)) + "×"; }
  function daysTo(t) { return Math.max(0, Math.round((t - NOW) / DAY)); }

  /* ======================= derived data ======================= */
  // derived: traders' range = lognormal spread of position-weighted estimates, wider where liquidity is thin
  var A = D.riskAssets.map(function (a) {
    var r = D.rng("rk-spread:" + a.id), thin = 1 - Math.min(1, a.liquidity / 10000);
    var sd = .07 + thin * .16 + r() * .07, lp = log10(a.pdAnnual);
    var h0 = a.history[0][1];
    return {
      id: a.id, sym: a.symbol, name: a.name, group: a.group, y: a.pdAnnual, band: a.band, sd: sd,
      p10: Math.pow(10, lp - 1.2816 * sd), p90: Math.pow(10, lp + 1.2816 * sd),
      change: a.pdAnnual / h0 - 1, history: a.history, token: a.outcomeToken, liquidity: a.liquidity,
      agree: sd < .13 ? "Tight" : sd < .19 ? "Mixed" : "Wide"
    };
  });
  var AM = {}; A.forEach(function (a) { AM[a.id] = a; });
  function find(id) { if (!id) return null; if (AM[id]) return AM[id]; var l = String(id).toLowerCase(); for (var i = 0; i < A.length; i++) if (A[i].id.toLowerCase() === l) return A[i]; return null; }
  var BYP = A.slice().sort(function (a, b) { return a.y - b.y; });

  /* ======================= state ======================= */
  var st = {
    h: "y", group: "all", bands: { low: true, mod: true, high: true, crit: true }, q: "", sort: "group", view: "bars",
    active: "obETH", cmp: [], cmpColor: {}, mine: {}, open: { ETH: true }, basket: {}, amt: 10000, slipAmt: 100
  };
  ["hlETH", "qrETH", "obETH"].forEach(function (id, i) { st.cmp.push(id); st.cmpColor[id] = i; });
  A.forEach(function (a) { st.basket[a.id] = true; });
  var PAL = ["var(--c1)", "var(--c5)", "var(--c-no)", "var(--c4)"]; // entity colours: never a band colour (amber/red/green mean risk bands here)
  function est(a) { return st.mine[a.id] != null ? st.mine[a.id] : a.y; }
  function edited(a) { return st.mine[a.id] != null; }
  function editedList() { return A.filter(edited); }

  /* ======================= small builders ======================= */
  function bandChip(id, txt) { return el("span", { class: "s-band", data: { band: id }, text: txt || BAND[id].label }); }
  function changeEl(c) {
    var up = c > 0, big = Math.abs(c) >= .05;
    return el("span", { class: "rk-chg " + (big ? (up ? "t-neg" : "t-pos") : "t-3"), title: "Change in the estimate over 12 weeks", attrs: { "aria-label": (up ? "Up " : "Down ") + F.num(Math.abs(c) * 100, 0) + "% in 12 weeks" } },
      el("span", { attrs: { "aria-hidden": "true" }, text: Math.abs(c) < .005 ? "→" : up ? "↑" : "↓" }), F.num(Math.abs(c) * 100, 0) + "%");
  }
  function iconBtn(icon, label, onClick, cls) { var b = el("button", { class: "s-icon-btn " + (cls || ""), attrs: { type: "button", "aria-label": label }, html: S.icon(icon, 16) }); if (onClick) b.addEventListener("click", onClick); return b; }
  function pct(x) { return (x * 100).toFixed(3) + "%"; }
  function download(name, text) {
    try {
      var url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      var a = el("a", { href: url, attrs: { download: name } }); document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
      S.toast("Downloaded " + name, "download");
    } catch (e) { S.toast("This browser blocked the download.", "alert"); }
  }
  function later(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms || 60); }; }

  /* ======================= horizon controls (hero + toolbar) ======================= */
  $$("[data-hgroup]").forEach(function (g) {
    [["y", "Per year"], ["q", "Per quarter"]].forEach(function (it) {
      var b = el("button", { attrs: { type: "button", "aria-pressed": String(st.h === it[0]) }, data: { h: it[0] }, text: it[1] });
      b.addEventListener("click", function () { setH(it[0]); });
      g.appendChild(b);
    });
  });
  function setH(h) {
    if (st.h === h) return; st.h = h;
    $$("[data-hgroup] button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.h === h)); });
    renderAll();
  }

  /* ======================= 1. hero poster: the board on one axis ======================= */
  var plot = $("#rk-plot"), cap = $("#rk-cap"), geo = null;
  var LANE_GAPS = [26, 15, 9, 5.5], LANE_OPS = [.12, .17, .23, .32];
  function drawPlot() {
    var W = Math.round(plot.clientWidth), H = Math.round(plot.clientHeight); if (!W || !H) return;
    var narrow = W < 520, mid = W < 760, h = st.h;
    var ml = narrow ? 44 : 70, mr = narrow ? 8 : 14, mt = 30, mb = 42, pw = W - ml - mr, ph = H - mt - mb, laneH = ph / GROUPS.length;
    var X = function (p) { return ml + pos(p, h) * pw; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true" });
    var defs = sv("defs"); svg.appendChild(defs);
    var d = dom(h), ed = [d[0]].concat(edges(h), [d[1]]);
    // band zones: 45° stripes whose density rises with the band (the motif carries the scale)
    BANDS.forEach(function (b, i) {
      var x0 = X(ed[i]), x1 = X(ed[i + 1]), cid = "rk-zc" + i;
      var cp = sv("clipPath", { id: cid }); cp.appendChild(sv("rect", { x: x0, y: mt, width: Math.max(0, x1 - x0), height: ph })); defs.appendChild(cp);
      var g = sv("g", { "clip-path": "url(#" + cid + ")", class: "rk-p-stripes" }); g.style.opacity = LANE_OPS[i];
      for (var x = x0 - ph; x < x1; x += LANE_GAPS[i]) g.appendChild(sv("path", { d: "M" + x.toFixed(1) + " " + (mt + ph) + "L" + (x + ph).toFixed(1) + " " + mt }));
      svg.appendChild(g);
      if (i > 0) svg.appendChild(sv("line", { class: "rk-p-edge", x1: x0, x2: x0, y1: mt - 4, y2: mt + ph }));
      var rail = sv("line", { class: "rk-p-rail", x1: x0 + (i ? 2 : 0), x2: x1 - 2, y1: mt + ph + 7, y2: mt + ph + 7 }); rail.style.stroke = "var(--band-" + b.id + ")"; svg.appendChild(rail);
      var gl = sv("g", { class: "rk-p-band" });
      if (narrow) gl.appendChild(shape(b.id, (x0 + x1) / 2, mt - 14, 7)); // labels move to the legend under the plot
      else { var tx = sv("text", { x: x0 + 20, y: mt - 12 }); tx.textContent = b.label.toUpperCase(); gl.appendChild(tx); gl.appendChild(shape(b.id, x0 + 11, mt - 15.5, 7)); }
      svg.appendChild(gl);
    });
    // lanes
    GROUPS.forEach(function (g, i) {
      var y0 = mt + laneH * i;
      if (i) svg.appendChild(sv("line", { class: "rk-p-lane", x1: 0, x2: W - mr, y1: y0, y2: y0 }));
      var n = A.filter(function (a) { return a.group === g.id; }).length;
      var t = sv("text", { class: "rk-p-lanelbl", x: 0, y: y0 + laneH / 2 - (narrow ? 0 : 3) }); t.textContent = g.id === "Funds" ? "FUNDS" : g.id; svg.appendChild(t);
      if (!narrow) { var t2 = sv("text", { class: "rk-p-lanen", x: 0, y: y0 + laneH / 2 + 11 }); t2.textContent = n + " assets"; svg.appendChild(t2); }
    });
    // ticks
    ticks(h).forEach(function (t) {
      var m = mant(t); if (narrow && m !== 1) return; if (mid && !narrow && m === 2) return;
      var tx = sv("text", { class: "rk-p-tick", x: X(t), y: H - 10, "text-anchor": "middle" }); tx.textContent = tickF(t); svg.appendChild(tx);
    });
    var ax = sv("text", { class: "rk-p-axis", x: 0, y: H - 10 }); ax.textContent = h === "q" ? "PD / QTR" : "PD / YR"; svg.appendChild(ax);
    // dots: a beeswarm per lane so close estimates never hide each other
    var r = narrow ? 4.6 : 6, step = r * 2 + 1.5, P = {};
    GROUPS.forEach(function (g, gi) {
      var yc = mt + laneH * (gi + .5), maxOff = laneH / 2 - r - 3, placed = [];
      A.filter(function (a) { return a.group === g.id; }).sort(function (a, b) { return a.y - b.y; }).forEach(function (a) {
        var x = X(hv(a.y, h)), best = 0;
        for (var k = 0; k < 9; k++) {
          var off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step; if (Math.abs(off) > maxOff) continue;
          var ok = placed.every(function (p) { var dx = p.x - x, dy = p.y - (yc + off); return dx * dx + dy * dy >= step * step; });
          if (ok) { best = off; break; }
        }
        var pt = { x: x, y: yc + best, a: a }; placed.push(pt); P[a.id] = pt;
      });
    });
    var gd = sv("g", { class: "rk-p-dots" });
    A.forEach(function (a) {
      var p = P[a.id], c = sv("circle", { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: r, class: "rk-p-dot" });
      gd.appendChild(c);
      if (edited(a)) {
        var mx = X(hv(est(a), h));
        gd.appendChild(sv("line", { class: "rk-p-link", x1: p.x, x2: mx, y1: p.y, y2: p.y }));
        gd.appendChild(sv("circle", { class: "rk-p-mine", cx: mx.toFixed(1), cy: p.y.toFixed(1), r: r - .5 }));
      }
    });
    svg.appendChild(gd);
    // active asset: range whisker + ring + label
    var act = AM[st.active] || BYP[BYP.length - 1], ap = P[act.id];
    if (ap) {
      var x10 = X(hv(act.p10, h)), x90 = X(hv(act.p90, h)), ga = sv("g", { class: "rk-p-act" });
      ga.appendChild(sv("line", { class: "rk-p-rng", x1: x10, x2: x90, y1: ap.y, y2: ap.y }));
      ga.appendChild(sv("line", { class: "rk-p-rng", x1: x10, x2: x10, y1: ap.y - 6, y2: ap.y + 6 }));
      ga.appendChild(sv("line", { class: "rk-p-rng", x1: x90, x2: x90, y1: ap.y - 6, y2: ap.y + 6 }));
      ga.appendChild(sv("circle", { class: "rk-p-dot is-on", cx: ap.x, cy: ap.y, r: r + 3 }));
      var lt = sv("text", { class: "rk-p-lbl", x: ap.x, y: ap.y - r - 10, "text-anchor": ap.x > W - 90 ? "end" : ap.x < ml + 50 ? "start" : "middle" });
      lt.textContent = act.sym + " " + pdF(hv(act.y, h)); ga.appendChild(lt);
      svg.appendChild(ga);
    }
    S.clear(plot).appendChild(svg);
    geo = { P: P, r: r };
    renderCap();
  }
  function shape(band, cx, cy, s) {
    var n;
    if (band === "high") n = sv("circle", { cx: cx, cy: cy, r: s / 2 });
    else if (band === "crit") n = sv("rect", { x: cx - s / 2, y: cy - s / 2, width: s, height: s, rx: 1, transform: "rotate(45 " + cx + " " + cy + ")" });
    else n = sv("rect", { x: cx - s / 2, y: cy - s / 2, width: s, height: s, rx: 1.6 });
    n.style.fill = "var(--band-" + band + ")"; return n;
  }
  function renderCap() {
    var a = AM[st.active]; if (!a) return; var h = st.h, o = h === "q" ? "y" : "q";
    S.clear(cap);
    cap.appendChild(el("div", { class: "rk-cap__l" },
      el("b", { text: a.sym + " · " + a.name }),
      el("span", { class: "rk-cap__meta" }, el("span", { text: GLABEL[a.group] }), bandChip(a.band), el("span", { text: "Traders' range " + pdF(hv(a.p10, h)) + "–" + pdF(hv(a.p90, h)) }))));
    cap.appendChild(el("div", { class: "rk-cap__r" }, el("span", { class: "rk-cap__num", text: pdF(hv(a.y, h)) }), el("small", { text: hWord(h) + " · " + pdF(hv(a.y, o)) + " " + hWord(o).replace("per ", "/ ") })));
  }
  function setActive(id) { if (!AM[id] || st.active === id) return; st.active = id; drawPlot(); renderFormula(); }
  plot.addEventListener("pointermove", function (e) {
    if (!geo) return; var bb = plot.getBoundingClientRect(), x = e.clientX - bb.left, y = e.clientY - bb.top, best = null, bd = 18 * 18;
    for (var id in geo.P) { var p = geo.P[id], dx = p.x - x, dy = p.y - y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = id; } }
    plot.style.cursor = best ? "pointer" : "default";
    if (best) setActive(best);
  });
  plot.addEventListener("click", function (e) {
    if (!geo) return; var bb = plot.getBoundingClientRect(), x = e.clientX - bb.left, y = e.clientY - bb.top;
    for (var id in geo.P) { var p = geo.P[id]; if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < 20 * 20) { setActive(id); openDrawer(id); return; } }
  });
  plot.addEventListener("keydown", function (e) {
    var i = BYP.indexOf(AM[st.active]);
    if (e.key === "ArrowRight" || e.key === "ArrowUp") i = Math.min(BYP.length - 1, i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") i = Math.max(0, i - 1);
    else if (e.key === "Home") i = 0; else if (e.key === "End") i = BYP.length - 1;
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDrawer(st.active); return; }
    else return;
    e.preventDefault(); setActive(BYP[i].id);
  });

  function renderFacts() {
    var f = $("#rk-facts"); S.clear(f);
    var crit = A.filter(function (a) { return a.band === "crit"; }).length, nta = A.reduce(function (acc, a) { return acc * (1 - hv(a.y, st.h)); }, 1);
    [["No to All", pdF(nta), st.h === "q" ? "this quarter" : "per year"], ["Assets", "33", "in 4 groups"], ["Critical", String(crit), "assets"], ["Closes", F.dayMon(CLOSES), "in " + daysTo(CLOSES) + "d"]].forEach(function (x) {
      f.appendChild(el("div", {}, el("dt", { text: x[0] }), el("dd", {}, x[1], el("small", { text: x[2] }))));
    });
  }

  /* ======================= 2. board ======================= */
  $("#rk-qspecs").appendChild(S.ui.specs([{ html: "Mkt <b>#" + MKT.id + "</b>" }, { text: "33 assets + No to All", class: "s-hide-sm" }, { html: "<b>Trading</b>" }]));
  (function () { var lg = $("#rk-plotlegend"); BANDS.forEach(function (b) { lg.appendChild(bandChip(b.id)); }); })();
  function renderStats() {
    var box = $("#rk-stats"), h = st.h; S.clear(box);
    var nta = A.reduce(function (acc, a) { return acc * (1 - hv(a.y, h)); }, 1), ntaO = A.reduce(function (acc, a) { return acc * (1 - hv(a.y, h === "q" ? "y" : "q")); }, 1);
    var sorted = A.map(function (a) { return hv(a.y, h); }).sort(function (a, b) { return a - b; }), med = sorted[Math.floor(sorted.length / 2)];
    var cnt = {}; A.forEach(function (a) { cnt[a.band] = (cnt[a.band] || 0) + 1; });
    box.appendChild(S.ui.stat("No to All", pdF(nta), { unit: hShort(h), note: pdF(ntaO) + " " + hWord(h === "q" ? "y" : "q") }));
    box.appendChild(S.ui.stat("Median estimate", pdF(med), { unit: hShort(h), note: "Half the board sits below this" }));
    box.appendChild(S.ui.stat("High or critical", String((cnt.high || 0) + (cnt.crit || 0)), { unit: "assets", note: (cnt.mod || 0) + " moderate · " + (cnt.low || 0) + " low" }));
    box.appendChild(S.ui.stat("Liquidity", F.usd(MKT.liquidity), { note: "Across all outcomes, sDAI" }));
    box.appendChild(S.ui.stat("Volume", F.usd(MKT.volume), { note: "Since " + F.dayMon(OPENED) }));
    box.appendChild(S.ui.stat("Trading closes", F.dayMon(CLOSES), { unit: "in " + daysTo(CLOSES) + "d", note: "Reports open " + F.dayMon(Date.parse(MKT.openingDate || "2027-01-01T00:00:00Z")) }));
  }
  // groups (kit category row) + band filters
  var counts = {}; A.forEach(function (a) { counts[a.group] = (counts[a.group] || 0) + 1; });
  $("#rk-groups").appendChild(S.ui.chipRow([["all", "All assets", A.length]].concat(GROUPS.map(function (g) { return [g.id, g.label, counts[g.id]]; })), st.group, function (v) { st.group = v; renderBoard(); }));
  BANDS.forEach(function (b) {
    var n = A.filter(function (a) { return a.band === b.id; }).length;
    var btn = el("button", { class: "rk-bandbtn", attrs: { type: "button", "aria-pressed": "true", "aria-label": b.label + " band, " + n + " assets" } }, bandChip(b.id), el("span", { class: "rk-bandbtn__n", text: String(n) }));
    btn.addEventListener("click", function () { st.bands[b.id] = !st.bands[b.id]; btn.setAttribute("aria-pressed", String(st.bands[b.id])); renderBoard(); });
    $("#rk-bandf").appendChild(btn);
  });
  $("#rk-view").appendChild(S.ui.seg([["bars", "Risk bars"], ["time", "Over time"], ["table", "Table"]], st.view, function (v) { st.view = v; renderBoard(); }, "View"));
  $("#rk-sort").addEventListener("change", function (e) { st.sort = e.target.value; renderBoard(); });
  var qIn = $("#rk-q");
  qIn.addEventListener("input", function () { st.q = qIn.value; var si = $("[data-shell-search] input"); if (si && si.value !== qIn.value) si.value = qIn.value; renderBoard(); });
  document.addEventListener("seer:search", function (e) {
    st.q = (e.detail && e.detail.q) || ""; qIn.value = st.q; renderBoard();
    if (st.q && window.scrollY < $("#board").offsetTop - 200) $("#board").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  });

  function filtered() {
    var q = st.q.trim().toLowerCase();
    return A.filter(function (a) {
      return (st.group === "all" || a.group === st.group) && st.bands[a.band] &&
        (!q || (a.sym + " " + a.name + " " + GLABEL[a.group]).toLowerCase().indexOf(q) > -1);
    });
  }
  var GORD = { ETH: 0, USD: 1, BTC: 2, Funds: 3 };
  function sortList(list) {
    var s = st.sort, l = list.slice();
    l.sort(function (a, b) {
      if (s === "group") return GORD[a.group] - GORD[b.group] || b.y - a.y;
      if (s === "high") return b.y - a.y;
      if (s === "low") return a.y - b.y;
      if (s === "move") return b.change - a.change;
      if (s === "range") return b.sd - a.sd;
      return a.sym.toLowerCase() < b.sym.toLowerCase() ? -1 : 1;
    });
    return l;
  }
  function renderBoard() {
    var body = $("#rk-boardbody"), list = sortList(filtered()), key = $("#rk-key"); S.clear(body);
    body.dataset.view = st.view;
    if (!list.length) {
      body.appendChild(S.ui.empty({ title: "No assets match", text: "Try another group, turn a band back on, or clear the filter.", motif: "stripes", motifOpts: { gap: 12, width: 2, w: 120, h: 72 }, action: { label: "Show the whole board", onClick: resetFilters } }));
      key.textContent = ""; return;
    }
    if (st.view === "bars") { body.appendChild(barsView(list)); key.textContent = "Dot: market estimate. Line: traders' range, the spread of estimates traders set when they trade (10th to 90th percentile, size-weighted, from the Participate sliders). Ring: your estimate. Log scale, so each step to the right is the same multiple of risk; dashed lines are band edges."; }
    else if (st.view === "time") { body.appendChild(timeView(list)); key.textContent = "Weekly closing estimate over 12 weeks. Each card has its own scale to show the trend; use Compare to put assets on one scale."; }
    else { tableView(body, list); key.textContent = "Select a column to sort. Token price is a little under the quarterly chance of a default (× " + F.num(SCALE, 2) + "), because 1 sDAI is split when several assets default."; }
  }
  function resetFilters() {
    st.group = "all"; st.q = ""; qIn.value = ""; BANDS.forEach(function (b) { st.bands[b.id] = true; });
    $$("#rk-bandf button").forEach(function (b) { b.setAttribute("aria-pressed", "true"); });
    $$("#rk-groups .s-chip").forEach(function (c, i) { c.setAttribute("aria-pressed", String(i === 0)); });
    renderBoard();
  }

  // --- risk bars (dot + range on a log axis) ---
  function axisRow() {
    var h = st.h, track = el("div", { class: "rk-axis__track" }), d = dom(h), ed = [d[0]].concat(edges(h), [d[1]]);
    BANDS.forEach(function (b, i) {
      var x0 = pos(ed[i], h), x1 = pos(ed[i + 1], h);
      track.appendChild(el("span", { class: "rk-axis__band", style: { left: pct(x0), width: pct(x1 - x0) } }, bandChip(b.id, ({ low: "Low", mod: "Mod.", high: "High", crit: "Crit." })[b.id])));
    });
    ticks(h).forEach(function (t) { var m = mant(t); track.appendChild(el("span", { class: "rk-axis__tick" + (m === 2 ? " is-minor" : m === 5 ? " is-mid" : ""), style: { left: pct(pos(t, h)) }, text: tickF(t) })); });
    return el("div", { class: "rk-axis", attrs: { "aria-hidden": "true" } }, el("span", { class: "rk-axis__c" }), el("span", { class: "rk-axis__a", text: "Asset" }), track, el("span", { class: "rk-axis__v", text: st.h === "q" ? "PD / qtr" : "PD / yr" }), el("span", { class: "rk-axis__b", text: "Band" }), el("span", { class: "rk-axis__m", text: "12 wk" }));
  }
  function trackEl(a) {
    var h = st.h, t = el("div", { class: "rk-tr", attrs: { "aria-hidden": "true" } }), d = dom(h), ed = [d[0]].concat(edges(h), [d[1]]);
    BANDS.forEach(function (b, i) { var x0 = pos(ed[i], h), x1 = pos(ed[i + 1], h); t.appendChild(el("i", { class: "rk-tr__z", data: { band: b.id }, style: { left: pct(x0), width: pct(x1 - x0) } })); });
    t.appendChild(el("i", { class: "rk-tr__base" }));
    var l = pos(hv(a.p10, h), h), r = pos(hv(a.p90, h), h);
    t.appendChild(el("i", { class: "rk-tr__rng", style: { left: pct(l), width: pct(r - l) } }));
    if (edited(a)) {
      var m = pos(hv(est(a), h), h), p = pos(hv(a.y, h), h);
      t.appendChild(el("i", { class: "rk-tr__link", style: { left: pct(Math.min(m, p)), width: pct(Math.abs(m - p)) } }));
      t.appendChild(el("i", { class: "rk-tr__mine", style: { left: pct(m) } }));
    }
    t.appendChild(el("i", { class: "rk-tr__dot", style: { left: pct(pos(hv(a.y, h), h)) } }));
    return t;
  }
  function spark(a) {
    var s = S.chart.spark(a.history.map(function (p) { return log10(p[1]); }), { w: 56, h: 20, color: "var(--violet-2)" });
    s.setAttribute("aria-hidden", "true"); s.classList.add("rk-spark"); return s;
  }
  function rowEl(a) {
    var h = st.h, o = h === "q" ? "y" : "q", inCmp = st.cmp.indexOf(a.id) > -1;
    var row = el("div", { class: "rk-row" + (inCmp ? " is-cmp" : ""), attrs: { role: "listitem" }, data: { id: a.id } });
    var cb = el("input", { attrs: { type: "checkbox", "aria-label": "Compare " + a.sym } }); cb.checked = inCmp;
    cb.addEventListener("change", function () { if (!toggleCmp(a.id)) cb.checked = st.cmp.indexOf(a.id) > -1; row.classList.toggle("is-cmp", st.cmp.indexOf(a.id) > -1); });
    var sw = el("i", { class: "rk-row__sw" }); if (inCmp) sw.style.background = PAL[st.cmpColor[a.id]];
    row.appendChild(el("label", { class: "rk-row__cmp", title: "Add to compare" }, cb, sw));
    var asset = el("button", { class: "rk-row__asset", attrs: { type: "button", "aria-label": a.sym + ", " + a.name + ": " + pdF(hv(a.y, h)) + " " + hWord(h) + ", " + BAND[a.band].label + " band. Open details" } }, el("b", { text: a.sym }), el("span", { text: a.name }));
    asset.addEventListener("click", function () { openDrawer(a.id); });
    row.appendChild(asset);
    row.appendChild(trackEl(a));
    row.appendChild(el("div", { class: "rk-row__val" }, el("b", { text: pdF(hv(a.y, h)) }), el("span", { text: pdF(hv(a.y, o)) + " " + hShort(o) })));
    row.appendChild(el("div", { class: "rk-row__band" }, bandChip(a.band)));
    row.appendChild(el("div", { class: "rk-row__chg" }, spark(a), changeEl(a.change)));
    row.addEventListener("click", function (e) { if (e.target.closest("input,label,button,a")) return; openDrawer(a.id); });
    row.addEventListener("pointerenter", function () { if (st.active !== a.id) { st.active = a.id; drawPlot(); renderFormula(); } });
    return row;
  }
  var GLIM = 3; // by group: the three riskiest per group; "Show all" opens a group, "Expand all" the board
  function barsView(list) {
    var box = el("div", { class: "rk-board" }), rows = el("div", { class: "rk-rows", attrs: { role: "list", "aria-label": "Assets on the board" } });
    box.appendChild(axisRow());
    var fold = st.sort === "group" && !st.q, hidden = 0, k = 0;
    st.gopen = st.gopen || {};
    var lastG = null;
    list.forEach(function (a) {
      if (st.sort === "group" && a.group !== lastG) {
        lastG = a.group; k = 0;
        var inG = list.filter(function (x) { return x.group === a.group; });
        var nta = inG.reduce(function (acc, x) { return acc * (1 - hv(x.y, st.h)); }, 1);
        var head = el("div", { class: "rk-ghead", attrs: { role: "presentation" } }, el("b", { text: GLABEL[a.group] }), el("span", { class: "rk-ghead__n", text: String(inG.length) }), el("span", { class: "rk-ghead__nta t-meta", text: "None of these defaults: " + pdF(nta) + " " + hShort(st.h) }));
        if (fold && inG.length > GLIM) {
          var g = a.group, open = !!st.gopen[g];
          var tg = el("button", { class: "rk-ghead__more", attrs: { type: "button", "aria-expanded": String(open) }, text: open ? "Top " + GLIM : "All " + inG.length });
          tg.addEventListener("click", function () { st.gopen[g] = !st.gopen[g]; renderBoard(); });
          head.appendChild(tg);
        }
        rows.appendChild(head);
      }
      var r = rowEl(a);
      if (fold && !st.gopen[a.group] && k >= GLIM) { r.hidden = true; hidden++; }
      k++;
      rows.appendChild(r);
    });
    box.appendChild(rows);
    if (fold) {
      var anyOpen = Object.keys(st.gopen).some(function (g) { return st.gopen[g]; });
      if (hidden || anyOpen) {
        var all = el("button", { class: "s-btn s-btn--sm s-btn--ghost rk-expand", attrs: { type: "button" }, text: hidden ? "Expand all " + list.length + " assets" : "Collapse to the top " + GLIM + " per group" });
        all.addEventListener("click", function () { var on = hidden > 0; GROUPS.forEach(function (g) { st.gopen[g.id] = on; }); renderBoard(); });
        box.appendChild(el("div", { class: "rk-expandwrap" }, el("span", { class: "t-meta", text: hidden ? "Showing the " + GLIM + " riskiest assets in each group · " + hidden + " more folded" : "All " + list.length + " assets shown" }), all));
      }
    }
    return box;
  }

  // --- over time: small multiples ---
  function timeView(list) {
    var grid = el("div", { class: "rk-smgrid" }), h = st.h;
    list.forEach(function (a) {
      var vals = a.history.map(function (p) { return [p[0], hv(p[1], h)]; }), ys = vals.map(function (p) { return log10(p[1]); });
      var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), pad = Math.max(.04, (hi - lo) * .25); lo -= pad; hi += pad;
      var W = 200, Hh = 64, t0 = vals[0][0], t1 = vals[vals.length - 1][0];
      var X = function (t) { return (t - t0) / (t1 - t0) * W; }, Y = function (v) { return Hh - (log10(v) - lo) / (hi - lo) * Hh; };
      var svg = sv("svg", { viewBox: "0 0 " + W + " " + Hh, preserveAspectRatio: "none", "aria-hidden": "true" });
      edges(h).forEach(function (e) { var y = Y(e); if (y > 1 && y < Hh - 1) svg.appendChild(sv("line", { class: "rk-sm__edge", x1: 0, x2: W, y1: y, y2: y, "vector-effect": "non-scaling-stroke" })); });
      var dd = vals.map(function (p, k) { return (k ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join("");
      svg.appendChild(sv("path", { class: "rk-sm__area", d: dd + "L" + W + " " + Hh + "L0 " + Hh + "Z" }));
      svg.appendChild(sv("path", { class: "rk-sm__line", d: dd, "vector-effect": "non-scaling-stroke" }));
      var last = vals[vals.length - 1];
      var chart = el("div", { class: "rk-sm__chart" }, svg, el("i", { class: "rk-sm__dot", style: { left: "100%", top: (Y(last[1]) / Hh * 100).toFixed(2) + "%" } }));
      var minV = Math.min.apply(null, vals.map(function (p) { return p[1]; })), maxV = Math.max.apply(null, vals.map(function (p) { return p[1]; }));
      var card = el("button", { class: "rk-sm", attrs: { type: "button", "aria-label": a.sym + ", " + a.name + ": " + pdF(last[1]) + " " + hWord(h) + ", 12-week range " + pdF(minV) + " to " + pdF(maxV) + ". Open details" } },
        el("span", { class: "rk-sm__head" }, el("span", { class: "rk-sm__id" }, el("b", { text: a.sym }), el("small", { text: a.name })), el("b", { class: "rk-sm__v", text: pdF(last[1]) })),
        chart,
        el("span", { class: "rk-sm__foot" }, bandChip(a.band), el("span", { class: "t-meta", text: pdF(minV) + "–" + pdF(maxV) }), changeEl(a.change)));
      card.addEventListener("click", function () { openDrawer(a.id); });
      grid.appendChild(card);
    });
    return grid;
  }

  // --- table ---
  function tableView(body, list) {
    var h = st.h;
    S.ui.table(body, [
      { key: "sym", label: "Asset", sort: function (a) { return a.sym.toLowerCase(); }, render: function (a) { return el("span", { class: "rk-tcell" }, el("b", { text: a.sym }), el("span", { class: "t-meta", text: a.name })); } },
      { key: "group", label: "Group", sort: function (a) { return GORD[a.group]; }, render: function (a) { return GLABEL[a.group]; }, class: "s-hide-sm" },
      { key: "y", label: "PD / yr", num: true, sort: true, render: function (a) { return el("b", { text: pdF(a.y) }); } },
      { key: "qq", label: "PD / qtr", num: true, sort: function (a) { return a.y; }, render: function (a) { return pdF(D.quarterly(a.y)); } },
      { key: "tok", label: "Token", num: true, sort: function (a) { return a.y; }, render: function (a) { return centsF(tokP(D.quarterly(a.y))); }, class: "s-hide-sm" },
      { key: "band", label: "Band", sort: function (a) { return a.y; }, render: function (a) { return bandChip(a.band); } },
      { key: "sd", label: "Traders' range", num: true, sort: true, render: function (a) { return pdF(hv(a.p10, h)) + "–" + pdF(hv(a.p90, h)); } },
      { key: "agree", label: "Agreement", sort: function (a) { return a.sd; }, render: function (a) { return a.agree; }, class: "s-hide-sm" },
      { key: "change", label: "12 wk", num: true, sort: true, render: function (a) { return changeEl(a.change); } },
      { key: "liquidity", label: "Liquidity", num: true, sort: true, render: function (a) { return F.tok(a.liquidity, "sDAI", 0); }, class: "s-hide-sm" }
    ], { rows: list, sortKey: "y", sortDir: "desc", compact: true, caption: "Default estimates for the assets on board #2850", onRow: function (a) { openDrawer(a.id); } });
  }

  $("#rk-csv").addEventListener("click", function () {
    var lines = ["# SAMPLE DATA - illustrative, not live. Fictional assets. Concept by Swift Bot Labs; not affiliated with Seer.",
      "symbol,name,group,pd_annual,pd_quarterly,token_price_sdai,band,range_p10_annual,range_p90_annual,change_12w,liquidity_sdai"];
    sortList(filtered()).forEach(function (a) {
      lines.push([a.sym, '"' + a.name + '"', a.group, a.y.toFixed(5), D.quarterly(a.y).toFixed(5), D.quarterly(a.y).toFixed(5), BAND[a.band].label, a.p10.toFixed(5), a.p90.toFixed(5), a.change.toFixed(4), a.liquidity].join(","));
    });
    download("seer-risk-2850-q4-2026-SAMPLE.csv", lines.join("\n") + "\n");
  });

  /* ======================= 3. compare ======================= */
  var PRESETS = [
    ["Staked vs restaked ETH", ["hlETH", "tsETH", "qrETH", "obETH"]],
    ["Backed vs synthetic dollars", ["plUSD", "hrbUSD", "mosUSD", "vyUSD"]],
    ["BTC wrappers", ["anBTC", "cobBTC", "lmBTC", "spBTC"]],
    ["Treasury vs credit funds", ["MTBF", "RTF", "CCF-I", "BPC"]],
    ["Closest to a band edge", A.slice().sort(function (a, b) { return edgeDist(a) - edgeDist(b); }).slice(0, 4).map(function (a) { return a.id; })]
  ];
  function edgeDist(a) { return Math.min.apply(null, EDGES.map(function (e) { return Math.abs(log10(a.y) - log10(e)); })); }
  PRESETS.forEach(function (p) {
    var b = el("button", { class: "s-chip s-chip--filled", attrs: { type: "button" }, text: p[0] });
    b.addEventListener("click", function () { st.cmp = []; st.cmpColor = {}; p[1].forEach(function (id, i) { st.cmp.push(id); st.cmpColor[id] = i; }); renderCompare(); syncCmp(); });
    $("#rk-presets").appendChild(b);
  });
  var addSel = $("#rk-cmp-add");
  addSel.addEventListener("change", function () { if (addSel.value) toggleCmp(addSel.value); });
  function toggleCmp(id) {
    var i = st.cmp.indexOf(id);
    if (i > -1) { st.cmp.splice(i, 1); delete st.cmpColor[id]; }
    else {
      if (st.cmp.length >= 4) { S.toast("Compare holds four assets. Remove one first.", "info"); return false; }
      var used = st.cmp.map(function (x) { return st.cmpColor[x]; }), slot = [0, 1, 2, 3].filter(function (s) { return used.indexOf(s) < 0; })[0];
      st.cmp.push(id); st.cmpColor[id] = slot;
    }
    renderCompare(); syncCmp(); return true;
  }
  function syncCmp() {
    $$("#rk-boardbody .rk-row").forEach(function (r) {
      var id = r.dataset.id, on = st.cmp.indexOf(id) > -1, cb = $("input", r), sw = $(".rk-row__sw", r);
      r.classList.toggle("is-cmp", on); if (cb) cb.checked = on; if (sw) sw.style.background = on ? PAL[st.cmpColor[id]] : "";
    });
    drawPlot();
    if (drawerId) renderDrawer(drawerId);
  }
  var cmpDist = null, cmpLine = null;
  function cmpAssets() { return st.cmp.map(function (id) { return AM[id]; }).filter(Boolean); }
  function renderCompare() {
    var list = cmpAssets(), h = st.h, chips = $("#rk-cmp-chips");
    S.clear(chips);
    list.forEach(function (a) {
      chips.appendChild(el("span", { class: "rk-cmpchip" }, el("i", { class: "rk-cmpchip__sw", style: { background: PAL[st.cmpColor[a.id]] } }), el("b", { text: a.sym }), el("span", { class: "rk-cmpchip__nm", text: a.name }),
        iconBtn("close", "Remove " + a.sym + " from compare", function () { toggleCmp(a.id); }, "s-icon-btn--sm s-icon-btn--bare")));
    });
    if (!list.length) chips.appendChild(el("span", { class: "t-meta", text: "Nothing selected. Pick a set below or add assets one by one." }));
    // add select
    S.clear(addSel);
    addSel.appendChild(el("option", { attrs: { value: "" }, text: st.cmp.length >= 4 ? "Compare is full (4)" : "Add an asset…" }));
    GROUPS.forEach(function (g) {
      var og = el("optgroup", { attrs: { label: g.label } });
      A.filter(function (a) { return a.group === g.id && st.cmp.indexOf(a.id) < 0; }).sort(function (a, b) { return a.y - b.y; }).forEach(function (a) { og.appendChild(el("option", { attrs: { value: a.id }, text: a.sym + " · " + pdF(a.y) })); });
      addSel.appendChild(og);
    });
    addSel.value = ""; addSel.disabled = st.cmp.length >= 4;
    // charts
    var distBox = $("#rk-cmp-dist"), lineBox = $("#rk-cmp-line"), tbl = $("#rk-cmp-table");
    S.clear(lineBox); S.clear(tbl); cmpLine = null;
    if (!list.length) {
      S.clear(distBox); cmpDist = null;
      distBox.appendChild(S.ui.empty({ title: "Pick assets to compare", text: "Their ranges and 12-week paths appear here on one scale.", motif: "stripes", motifOpts: { gap: 12, width: 2, w: 120, h: 72 }, action: { label: "Compare the three highest", onClick: function () { BYP.slice(-3).reverse().forEach(function (a, i) { st.cmp.push(a.id); st.cmpColor[a.id] = i; }); renderCompare(); syncCmp(); } } }));
      return;
    }
    var curves = list.map(function (a) { return { a: a, name: a.sym + " · " + a.name, short: a.sym, color: PAL[st.cmpColor[a.id]] }; });
    if (!cmpDist) { S.clear(distBox); cmpDist = rkDist(distBox, { curves: curves, height: 230 }); } else cmpDist.update({ curves: curves });
    // line chart, log scale
    var series = curves.map(function (c) { return { name: c.name, short: c.short, color: c.color, values: c.a.history.map(function (p) { return [p[0], log10(hv(p[1], h))]; }) }; });
    var all = [].concat.apply([], series.map(function (s) { return s.values.map(function (p) { return p[1]; }); }));
    var lo = Math.min.apply(null, all) - .12, hi = Math.max.apply(null, all) + .12;
    var tks = TICKS.map(function (t) { return t; }).filter(function (t) { var v = log10(t); return v >= lo && v <= hi; });
    if (tks.length < 2) { lo -= .3; hi += .3; tks = TICKS.filter(function (t) { var v = log10(t); return v >= lo && v <= hi; }); }
    if (tks.length > 5) tks = tks.filter(function (t) { return mant(t) !== 2; });
    var tickLogs = tks.map(log10);
    var yf = tickFmt(tks, h);
    var refs = edges(h).map(function (e) { return { y: log10(e) }; }).filter(function (r) { return r.y > lo + .02 && r.y < hi - .02; });
    cmpLine = S.chart.line(lineBox, { series: series, y: { min: lo, max: hi, ticks: tickLogs, format: yf }, x: { format: F.dayMon }, height: 260, refs: refs, label: "Estimates over 12 weeks, log scale" });
    // side-by-side table
    var minP = Math.min.apply(null, list.map(function (a) { return a.y; }));
    var rows = [
      ["Per year", function (a) { return el("b", { text: pdF(a.y) }); }],
      ["Per quarter", function (a) { return pdF(D.quarterly(a.y)); }],
      ["Token price", function (a) { return centsF(tokP(D.quarterly(a.y))); }],
      ["Band", function (a) { return bandChip(a.band); }],
      ["Relative to the lowest here", function (a) { return times(a.y / minP); }],
      ["Traders' range " + hShort(h), function (a) { return pdF(hv(a.p10, h)) + "–" + pdF(hv(a.p90, h)); }],
      ["Agreement", function (a) { return a.agree; }],
      ["12-week change", function (a) { return changeEl(a.change); }],
      ["Liquidity", function (a) { return F.tok(a.liquidity, "sDAI", 0); }],
      ["Your estimate", function (a) { return edited(a) ? pdF(hv(est(a), h)) : "—"; }]
    ];
    var thead = el("tr", {}, el("th", { attrs: { scope: "col" } }, el("span", { class: "s-sr", text: "Measure" })));
    list.forEach(function (a) { thead.appendChild(el("th", { class: "num", attrs: { scope: "col" } }, el("span", { class: "rk-th" }, el("i", { style: { background: PAL[st.cmpColor[a.id]] } }), a.sym))); });
    var tb = el("tbody");
    rows.forEach(function (r) { var tr = el("tr", {}, el("th", { attrs: { scope: "row" }, text: r[0] })); list.forEach(function (a) { var td = el("td", { class: "num" }); var v = r[1](a); td.appendChild(typeof v === "string" ? document.createTextNode(v) : v); tr.appendChild(td); }); tb.appendChild(tr); });
    var t = el("table", { class: "s-table s-table--compact rk-ctable" }, el("caption", { class: "s-sr", text: "Selected assets side by side" }), el("thead", {}, thead), tb);
    var none = list.reduce(function (acc, a) { return acc * (1 - hv(a.y, h)); }, 1);
    tbl.appendChild(el("div", { class: "s-table-wrap" }, t));
    tbl.appendChild(el("p", { class: "rk-cmpfoot" }, el("span", { class: "s-spec", text: "Together" }), el("span", { text: "Chance at least one of these " + list.length + " defaults " + (h === "q" ? "this quarter" : "within a year") + ": " }), el("b", { text: pdF(1 - none) })));
  }

  // page-local distribution chart on a log axis (Seer.chart.dist is linear; this one keeps 1-2-5 ticks)
  function rkDist(container, opt) {
    var root = el("div", { class: "s-chart rk-distc" }); container.appendChild(root);
    var holder = el("div"); root.appendChild(holder); var lg = el("div", { class: "u-mt-2" }); root.appendChild(lg);
    var cursor = null;
    function draw() {
      if (!root.clientWidth) return;
      var h = st.h, curves = opt.curves, W = Math.max(260, root.clientWidth), Hh = opt.height || 220, ml = 4, mr = 6, mt = 22, mb = 24, pw = W - ml - mr, ph = Hh - mt - mb;
      var lo = Math.min.apply(null, curves.map(function (c) { return log10(hv(c.a.y, h)) - 2.6 * c.a.sd; })), hi = Math.max.apply(null, curves.map(function (c) { return log10(hv(c.a.y, h)) + 2.6 * c.a.sd; }));
      var d = dom(h); lo = Math.max(log10(d[0]), lo); hi = Math.min(log10(d[1]), hi); if (hi - lo < .6) { var mid = (hi + lo) / 2; lo = mid - .3; hi = mid + .3; }
      var X = function (v) { return ml + (v - lo) / (hi - lo) * pw; };
      var peak = Math.max.apply(null, curves.map(function (c) { return 1 / c.a.sd; }));
      var Y = function (dd) { return mt + ph - dd / peak * ph * .9; };
      var svg = sv("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", tabindex: "0", "aria-label": "Spread of traders' estimates for " + curves.map(function (c) { return c.short; }).join(", ") + " on a log scale. Arrow keys move the reading line." });
      svg.appendChild(sv("line", { class: "rk-d-base", x1: ml, x2: ml + pw, y1: mt + ph + .5, y2: mt + ph + .5 }));
      var tk = TICKS.filter(function (t) { var v = log10(t); return v >= lo && v <= hi; }); if (tk.length > 6 || pw < 420) tk = tk.filter(function (t) { return mant(t) !== 2; });
      tk.forEach(function (t) { var tx = sv("text", { x: X(log10(t)), y: Hh - 6, "text-anchor": "middle" }); tx.textContent = tickF(t); svg.appendChild(tx); });
      edges(h).forEach(function (e, i) { var v = log10(e); if (v <= lo || v >= hi) return; var x = X(v); svg.appendChild(sv("line", { class: "ref", x1: x, x2: x, y1: mt - 8, y2: mt + ph })); var t = sv("text", { class: "lbl", x: x + 4, y: mt - 10 }); t.textContent = BANDS[i + 1].label; svg.appendChild(t); });
      var labels = [];
      curves.forEach(function (c) {
        var m = log10(hv(c.a.y, h)), sd = c.a.sd, pts = [];
        for (var i = 0; i <= 120; i++) { var v = lo + (hi - lo) * i / 120, dd = Math.exp(-.5 * Math.pow((v - m) / sd, 2)) / sd; pts.push(X(v).toFixed(1) + " " + Y(dd).toFixed(1)); }
        var g = sv("g", { class: "series" }), dd2 = "M" + pts.join("L");
        var ar = sv("path", { class: "area", d: dd2 + "L" + X(hi) + " " + (mt + ph) + "L" + X(lo) + " " + (mt + ph) + "Z" }); ar.style.fill = c.color; g.appendChild(ar);
        var ln = sv("path", { class: "line", d: dd2 }); ln.style.stroke = c.color; g.appendChild(ln);
        var dot = sv("circle", { class: "dot", cx: X(m), cy: Y(1 / sd), r: 4.5 }); dot.style.fill = c.color; g.appendChild(dot);
        svg.appendChild(g); labels.push({ x: X(m), y: Y(1 / sd) - 10, t: c.short });
      });
      labels.sort(function (a, b) { return a.y - b.y; }).forEach(function (l, i) {
        var clash = labels.slice(0, i).some(function (o) { return o.drawn && Math.abs(o.x - l.x) < 46 && Math.abs(o.y - l.y) < 14; });
        if (clash || l.y < 10) return; l.drawn = true;
        var t = sv("text", { class: "lbl-strong", x: clamp(l.x, ml + 20, ml + pw - 20), y: l.y, "text-anchor": "middle" }); t.textContent = l.t; svg.appendChild(t);
      });
      var xh = sv("line", { class: "xhair", x1: 0, x2: 0, y1: mt, y2: mt + ph, visibility: "hidden" }); svg.appendChild(xh);
      var hit = sv("rect", { class: "hit", x: ml, y: mt, width: pw, height: ph }); svg.appendChild(hit);
      function read(v, cx, cy) {
        var x = X(v); xh.setAttribute("x1", x); xh.setAttribute("x2", x); xh.setAttribute("visibility", "visible");
        var bb = svg.getBoundingClientRect();
        S.tip.show(cx != null ? cx : bb.left + x * bb.width / W, cy != null ? cy : bb.top + 30, (h === "q" ? "PD / qtr" : "PD / yr") + " ≥ " + pdF(Math.pow(10, v)),
          curves.map(function (c) { return { label: c.short + " estimates above", value: F.pct0(1 - phi((v - log10(hv(c.a.y, h))) / c.a.sd)), color: c.color }; }));
      }
      function off() { xh.setAttribute("visibility", "hidden"); S.tip.hide(); }
      hit.addEventListener("pointermove", function (e) { var bb = svg.getBoundingClientRect(), px = (e.clientX - bb.left) * W / bb.width; cursor = lo + (px - ml) / pw * (hi - lo); read(cursor, e.clientX, e.clientY); });
      hit.addEventListener("pointerleave", off); svg.addEventListener("blur", off);
      svg.addEventListener("keydown", function (e) { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); if (cursor == null || cursor < lo || cursor > hi) cursor = (lo + hi) / 2; cursor = clamp(cursor + (e.key === "ArrowRight" ? 1 : -1) * (hi - lo) / 40, lo, hi); read(cursor); });
      S.clear(holder).appendChild(svg);
      S.clear(lg); if (curves.length > 1) lg.appendChild(S.chart.legend(curves, "line"));
    }
    draw(); S.onResize(root, draw);
    return { update: function (o) { for (var k in o) opt[k] = o[k]; draw(); }, draw: draw };
  }

  /* ======================= 4. No to All + basket ======================= */
  var ntaField = $("#rk-nta-field");
  function basketList() { return A.filter(function (a) { return st.basket[a.id]; }); }
  function drawField() {
    var W = Math.round(ntaField.clientWidth), H = Math.round(ntaField.clientHeight); if (!W || !H) return;
    var h = st.h, list = A.slice().map(function (a) { return { a: a, hz: hazard(hv(a.y, h)) }; }).sort(function (x, y) { return y.hz - x.hz; });
    var tot = list.reduce(function (s, x) { return s + x.hz; }, 0), span = W + H * .6, usable = span * .34, gap = (span - usable) / (list.length - 1);
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true" });
    var x = -H * .6, polys = [];
    list.forEach(function (it) {
      var w = Math.max(1, it.hz / tot * usable), inB = st.basket[it.a.id];
      var p = sv("polygon", { points: [x + "," + H, (x + w) + "," + H, (x + w + H) + "," + 0, (x + H) + "," + 0].join(" "), class: "rk-f-s" + (inB ? "" : " is-out") + (st.active === it.a.id ? " is-on" : "") });
      p.dataset.id = it.a.id; svg.appendChild(p); polys.push({ el: p, it: it, share: it.hz / tot });
      x += w + gap;
    });
    S.clear(ntaField).appendChild(svg);
    svg.addEventListener("pointermove", function (e) {
      var t = e.target.closest && e.target.closest("polygon"); if (!t) { S.tip.hide(); return; }
      var hit = polys.filter(function (p) { return p.el === t; })[0]; if (!hit) return;
      polys.forEach(function (p) { p.el.classList.toggle("is-hot", p === hit); });
      S.tip.show(e.clientX, e.clientY, hit.it.a.sym + " · " + hit.it.a.name, [{ label: "Share of the board's risk", value: F.pct(hit.share, 1) }, { label: "Estimate " + hShort(h), value: pdF(hv(hit.it.a.y, h)) }, { label: "In your basket", value: st.basket[hit.it.a.id] ? "Yes" : "No" }]);
    });
    svg.addEventListener("pointerleave", function () { polys.forEach(function (p) { p.el.classList.remove("is-hot"); }); S.tip.hide(); });
    svg.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("polygon"); if (t) openDrawer(t.dataset.id); });
    // accessible summary
    var top = polys.slice(0, 4).map(function (p) { return p.it.a.sym + " " + F.pct(p.share, 0); }).join(", ");
    ntaField.setAttribute("aria-label", "Each stripe is one asset, as wide as its share of the board's risk. Largest: " + top + ".");
    return polys;
  }
  function renderNTA() {
    var h = st.h, o = h === "q" ? "y" : "q";
    var none = A.reduce(function (acc, a) { return acc * (1 - hv(a.y, h)); }, 1), noneO = A.reduce(function (acc, a) { return acc * (1 - hv(a.y, o)); }, 1);
    var specs = $("#rk-nta-specs"); S.clear(specs);
    [{ html: "No to All" }, { html: "<b>33</b> assets" }, h === "q" ? "This quarter" : "Per year"].forEach(function (x) { specs.appendChild(el("span", typeof x === "string" ? { text: x } : x)); });
    var num = $("#rk-nta-num"); S.clear(num);
    num.appendChild(el("span", { class: "rk-nta__big", text: pdF(none) }));
    num.appendChild(el("span", { class: "rk-nta__sub", text: "chance that none of the 33 assets defaults " + (h === "q" ? "this quarter" : "within a year") + ". " + pdF(noneO) + " " + (o === "q" ? "for Q4 alone" : "over a full year") + "." }));
    var hz = A.map(function (a) { return { a: a, hz: hazard(hv(a.y, h)) }; }), tot = hz.reduce(function (s, x) { return s + x.hz; }, 0);
    var share = function (band) { return hz.filter(function (x) { return x.a.band === band; }).reduce(function (s, x) { return s + x.hz; }, 0) / tot; };
    var nCrit = A.filter(function (a) { return a.band === "crit"; }).length, nLow = A.filter(function (a) { return a.band === "low"; }).length;
    $("#rk-nta-cap").textContent = "Each stripe is one asset, as wide as its share of the board's risk. The " + nCrit + " critical assets carry " + F.pct(share("crit"), 0) + " of it; the " + nLow + " low ones, " + F.pct(share("low"), 0) + " together.";
    drawField();
    renderBasket();
  }
  var BK_PRESETS = [
    ["all", "Whole board", function () { return A; }],
    ["low", "Low band only", function () { return A.filter(function (a) { return a.band === "low"; }); }],
    ["usd", "Dollars only", function () { return A.filter(function (a) { return a.group === "USD"; }); }],
    ["cmp", "Compare set", function () { return cmpAssets(); }]
  ];
  BK_PRESETS.forEach(function (p) {
    var b = el("button", { class: "s-chip s-chip--filled", attrs: { type: "button" }, text: p[1] });
    b.addEventListener("click", function () { st.basket = {}; p[2]().forEach(function (a) { st.basket[a.id] = true; }); renderBasket(); drawField(); });
    $("#rk-bk-presets").appendChild(b);
  });
  var gBoxes = {};
  GROUPS.forEach(function (g) {
    var cb = el("input", { attrs: { type: "checkbox" } }); gBoxes[g.id] = cb;
    cb.addEventListener("change", function () { A.forEach(function (a) { if (a.group === g.id) { if (cb.checked) st.basket[a.id] = true; else delete st.basket[a.id]; } }); renderBasket(); drawField(); });
    $("#rk-bk-groups").appendChild(el("label", { class: "s-check" }, cb, el("span", { text: g.label }), el("span", { class: "rk-bk-n", text: String(counts[g.id]) })));
  });
  var amtIn = $("#rk-bk-amt");
  [1000, 5000, 10000, 50000].forEach(function (c) {
    var b = el("button", { attrs: { type: "button" }, text: "+$" + (c >= 1000 ? c / 1000 + "K" : c) });
    b.addEventListener("click", function () { st.amt = Math.min(1e9, st.amt + c); amtIn.value = "$" + F.num(st.amt, 2); renderBasket(); });
    $("#rk-bk-chips").appendChild(b);
  });
  amtIn.addEventListener("input", function () { st.amt = Math.min(1e9, parseFloat(amtIn.value.replace(/[^0-9.]/g, "")) || 0); renderBasket(); });
  amtIn.addEventListener("blur", function () { amtIn.value = st.amt ? "$" + F.num(st.amt, 2) : ""; });
  function renderBasket() {
    var h = st.h, list = basketList(), n = list.length;
    $("#rk-bk-count").textContent = n + " of " + A.length + " assets";
    GROUPS.forEach(function (g) {
      var ids = A.filter(function (a) { return a.group === g.id; }), inn = ids.filter(function (a) { return st.basket[a.id]; }).length;
      gBoxes[g.id].checked = inn === ids.length; gBoxes[g.id].indeterminate = inn > 0 && inn < ids.length;
    });
    var box = $("#rk-bk-stats"); S.clear(box);
    var none = list.reduce(function (acc, a) { return acc * (1 - hv(a.y, h)); }, 1), sum = list.reduce(function (s, a) { return s + hv(a.y, h); }, 0);
    var when = h === "q" ? "this quarter" : "per year";
    box.appendChild(S.ui.stat("None defaults", n ? pdF(none) : "—", { note: when }));
    box.appendChild(S.ui.stat("At least one", n ? pdF(1 - none) : "—", { note: when }));
    box.appendChild(S.ui.stat("Expected defaults", n ? F.num(sum, 2) : "—", { unit: n ? "assets" : "", note: when }));
    box.appendChild(S.ui.stat("Expected loss", n && st.amt ? F.usd(st.amt * sum / n, true) : "—", { note: "if a default is a total loss" }));
    var stack = $("#rk-bk-stack"); S.clear(stack);
    if (!n) { stack.appendChild(el("p", { class: "t-meta", text: "The basket is empty. Pick a preset or tick a group." })); return; }
    var items = BANDS.map(function (b) {
      var inB = list.filter(function (a) { return a.band === b.id; });
      return { band: b.id, label: b.label + " · " + inB.length, value: inB.reduce(function (s, a) { return s + hazard(hv(a.y, h)); }, 0), color: "color-mix(in srgb, var(--band-" + b.id + ") 55%, var(--surface))" };
    }).filter(function (x) { return x.value > 0; });
    bandStack(stack, items);
  }
  // 100% stack in band order (Low -> Critical), so the bar reads like the axis; legend uses the band chips
  function bandStack(container, items) {
    var tot = items.reduce(function (s, x) { return s + x.value; }, 0) || 1;
    var bar = el("div", { class: "s-stackbar s-stackbar--lg", attrs: { role: "img", "aria-label": "Share of the basket's risk by band: " + items.map(function (i) { return i.label + " " + F.pct(i.value / tot, 0); }).join(", ") } });
    items.forEach(function (it) {
      var seg = el("i", { style: { flex: "0 0 calc(" + (it.value / tot * 100).toFixed(3) + "% - 2px)", "--seg": it.color }, attrs: { tabindex: "0", "aria-label": it.label + " " + F.pct(it.value / tot, 0) } });
      var show = function (e) { var bb = seg.getBoundingClientRect(); S.tip.show(e && e.clientX || bb.left, e && e.clientY || bb.top, it.label, [{ label: "Share of the basket's risk", value: F.pct(it.value / tot, 1), color: it.color }]); };
      seg.addEventListener("pointermove", show); seg.addEventListener("focus", function () { show(); }); seg.addEventListener("pointerleave", S.tip.hide); seg.addEventListener("blur", S.tip.hide);
      bar.appendChild(seg);
    });
    container.appendChild(bar);
    container.appendChild(el("div", { class: "rk-bk-legend" }, items.map(function (it) { return el("span", {}, bandChip(it.band, it.label), el("b", { text: F.pct(it.value / tot, 0) })); })));
  }

  /* ======================= 5. participate ======================= */
  var acc = $("#rk-acc"), refs = {}, slip = $("#rk-slip");
  function buildAcc() {
    S.clear(acc); refs = {};
    GROUPS.forEach(function (g) {
      var open = !!st.open[g.id], items = A.filter(function (a) { return a.group === g.id; });
      var head = el("button", { class: "rk-acc__head", attrs: { type: "button", "aria-expanded": String(open), "aria-controls": "rk-acc-" + g.id } },
        el("span", { class: "rk-acc__dot", attrs: { "aria-hidden": "true" } }), el("b", { text: g.label }), el("span", { class: "rk-acc__n", text: String(items.length) }),
        el("span", { class: "rk-acc__ed t-meta", data: { g: g.id } }), el("span", { class: "rk-acc__chev", html: S.icon("chevron-down", 16), attrs: { "aria-hidden": "true" } }));
      var body = el("div", { class: "rk-acc__body", attrs: { id: "rk-acc-" + g.id, role: "region", "aria-label": g.label + " estimates" } });
      if (!open) body.hidden = true;
      head.addEventListener("click", function () { st.open[g.id] = !st.open[g.id]; head.setAttribute("aria-expanded", String(st.open[g.id])); body.hidden = !st.open[g.id]; syncExpand(); });
      items.slice().sort(function (a, b) { return b.y - a.y; }).forEach(function (a) { body.appendChild(estRow(a)); });
      acc.appendChild(el("div", { class: "rk-acc__grp", data: { g: g.id } }, head, body));
    });
    syncExpand(); updateEdited();
  }
  function estRow(a) {
    var range = el("input", { class: "s-range rk-er__range", attrs: { type: "range", min: "0", max: "1000", step: "1", "aria-label": "Your yearly estimate for " + a.sym, "aria-valuetext": pdF(est(a)) } });
    var mk = el("i", { class: "rk-er__mkt", style: { "--m": String(pos(a.y, "y")) }, title: "Market " + pdF(a.y) });
    var input = el("input", { class: "s-input rk-er__in", attrs: { type: "text", inputmode: "decimal", "aria-label": "Your yearly estimate for " + a.sym + ", percent" } });
    var band = el("span", { class: "rk-er__band" }), delta = el("span", { class: "rk-er__delta t-meta" });
    var reset = iconBtn("close", "Reset " + a.sym + " to the market estimate", function () { setMine(a.id, null); }, "s-icon-btn--sm s-icon-btn--bare rk-er__reset");
    var row = el("div", { class: "rk-er", data: { id: a.id } },
      el("div", { class: "rk-er__id" }, el("b", { text: a.sym }), el("span", { class: "t-meta", text: "Market " + pdF(a.y) })),
      el("div", { class: "rk-er__slide" }, el("div", { class: "rk-er__rail" }, range, mk)),
      el("label", { class: "rk-er__val" }, input, el("span", { class: "rk-er__unit", text: "%" })),
      band, delta, reset);
    range.addEventListener("input", function () { setMine(a.id, fromPos(+range.value / 1000), "range"); });
    input.addEventListener("change", function () {
      var v = parseFloat(input.value.replace(",", ".").replace(/[^0-9.]/g, ""));
      if (!isFinite(v) || v <= 0 || v >= 100) { S.toast("Enter a yearly estimate between 0 and 100%.", "alert"); updateRow(a.id); return; }
      setMine(a.id, v / 100, "input");
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") input.blur(); });
    refs[a.id] = { row: row, range: range, input: input, band: band, delta: delta, reset: reset };
    updateRow(a.id);
    return row;
  }
  function updateRow(id) {
    var a = AM[id], r = refs[id]; if (!r) return; var e = est(a), ed = edited(a);
    var v = Math.round(pos(e, "y") * 1000);
    if (document.activeElement !== r.range) r.range.value = String(v);
    r.range.style.setProperty("--v", (pos(e, "y") * 100).toFixed(1) + "%");
    r.range.setAttribute("aria-valuetext", pdF(e) + " per year");
    if (document.activeElement !== r.input) r.input.value = F.num(e * 100, e < .001 ? 3 : 2);
    S.clear(r.band).appendChild(bandChip(D.bandOf(e).id));
    r.delta.textContent = ed ? (e > a.y ? "Higher " : "Lower ") + times(Math.max(e, a.y) / Math.min(e, a.y)) : "At market";
    r.row.classList.toggle("is-edited", ed);
    r.reset.style.visibility = ed ? "visible" : "hidden";
  }
  var lateBoard = later(function () { renderBoard(); drawPlot(); if (cmpAssets().some(edited)) renderCompare(); }, 120);
  function setMine(id, v, src) {
    var a = AM[id]; if (!a) return;
    if (v == null) delete st.mine[id];
    else { v = clamp(v, DOM_Y[0], .99); if (Math.abs(log10(v) - log10(a.y)) < .004) delete st.mine[id]; else st.mine[id] = v; }
    updateRow(id); updateEdited(); renderSlip(); lateBoard();
  }
  function updateEdited() {
    $$(".rk-acc__ed").forEach(function (s) { var n = A.filter(function (a) { return a.group === s.dataset.g && edited(a); }).length; s.textContent = n ? n + " edited" : ""; });
    renderNtaRow();
  }
  function syncExpand() { var all = GROUPS.every(function (g) { return st.open[g.id]; }); $("#rk-expand").textContent = all ? "Collapse all" : "Expand all"; }
  $("#rk-expand").addEventListener("click", function () {
    var all = GROUPS.every(function (g) { return st.open[g.id]; });
    GROUPS.forEach(function (g) { st.open[g.id] = !all; });
    $$(".rk-acc__grp").forEach(function (grp) { var o = st.open[grp.dataset.g]; $(".rk-acc__head", grp).setAttribute("aria-expanded", String(o)); $(".rk-acc__body", grp).hidden = !o; });
    syncExpand();
  });
  $("#rk-reset").addEventListener("click", function () {
    if (!editedList().length) { S.toast("Every estimate is already at the market.", "info"); return; }
    st.mine = {}; A.forEach(function (a) { updateRow(a.id); }); updateEdited(); renderSlip(); lateBoard(); S.toast("Estimates reset to the market.", "check");
  });

  // No to All row: dragging it scales every estimate so the product of survivals hits the target
  var ntaRow = $("#rk-nta-row"), ntaRange, ntaYours, ntaNote, ntaSnap = null;
  (function () {
    var market = A.reduce(function (acc, a) { return acc * (1 - a.y); }, 1);
    ntaRange = el("input", { class: "s-range", attrs: { type: "range", min: "50", max: "950", step: "1", "aria-label": "No to All: your chance that no asset defaults within a year" } });
    ntaYours = el("b", { class: "rk-ntar__v" }); ntaNote = el("span", { class: "t-meta" });
    var mk = el("i", { class: "rk-er__mkt", style: { "--m": String((market * 1000 - 50) / 900) }, title: "Market " + pdF(market) });
    ntaRow.appendChild(el("div", { class: "rk-ntar__head" },
      el("span", { class: "rk-ntar__t" }, el("i", { class: "rk-acc__dot", attrs: { "aria-hidden": "true" } }), el("b", { text: "No to All" }), el("span", { class: "t-meta", text: "chance no listed asset defaults within a year" })),
      el("span", { class: "rk-ntar__r" }, ntaYours, el("span", { class: "t-meta", text: "yours" }))));
    ntaRow.appendChild(el("div", { class: "rk-er__rail" }, ntaRange, mk));
    ntaRow.appendChild(el("div", { class: "rk-ntar__foot" }, el("span", { class: "t-meta", text: "Market estimate " + pdF(market) }), ntaNote));
    ntaRange.addEventListener("input", function () {
      if (!ntaSnap) ntaSnap = A.map(function (a) { return est(a); });
      var target = +ntaRange.value / 1000, base = ntaSnap.reduce(function (acc, e) { return acc * (1 - e); }, 1), k = Math.log(target) / Math.log(base);
      A.forEach(function (a, i) { var e = 1 - Math.pow(1 - ntaSnap[i], k); e = clamp(e, DOM_Y[0], .99); if (Math.abs(log10(e) - log10(a.y)) < .004) delete st.mine[a.id]; else st.mine[a.id] = e; updateRow(a.id); });
      updateEdited(); renderSlip(); lateBoard();
    });
    ntaRange.addEventListener("change", function () { ntaSnap = null; });
  })();
  function renderNtaRow() {
    var yours = A.reduce(function (acc, a) { return acc * (1 - est(a)); }, 1), n = editedList().length;
    ntaYours.textContent = pdF(yours);
    if (!ntaSnap) { ntaRange.value = String(Math.round(clamp(yours, .05, .95) * 1000)); }
    ntaRange.style.setProperty("--v", ((clamp(yours, .05, .95) * 1000 - 50) / 9).toFixed(1) + "%");
    ntaRange.setAttribute("aria-valuetext", pdF(yours));
    ntaNote.textContent = n + " of " + A.length + " assets edited";
  }

  // slip (kit bet slip): amount + chips, legs, confirm + ✕
  var slipIn;
  function renderSlip() {
    var list = editedList().sort(function (a, b) { return Math.abs(log10(est(b)) - log10(b.y)) - Math.abs(log10(est(a)) - log10(a.y)); });
    var market = A.reduce(function (acc, a) { return acc * (1 - a.y); }, 1), yours = A.reduce(function (acc, a) { return acc * (1 - est(a)); }, 1);
    var focusAmt = document.activeElement === slipIn;
    S.clear(slip);
    slip.appendChild(el("div", { class: "s-panel__head" }, el("span", { class: "s-row", style: { "--gap": "8px" } }, el("span", { html: S.glyph("risk"), style: { color: "var(--violet-2)", display: "inline-flex" } }), el("span", { class: "t-meta", text: F.usd(MKT.volume) + " Vol." })), el("span", { class: "t-meta", text: "#" + MKT.id })));
    slip.appendChild(el("h3", { class: "t-title", text: "Q4 2026 · default board" }));
    slip.appendChild(el("div", { class: "s-pricetiles" },
      el("div", { class: "s-pricetile rk-tile" }, el("small", { text: "No to All · market" }), el("b", { text: pdF(market) })),
      el("div", { class: "s-pricetile rk-tile rk-tile--on" }, el("small", { text: "No to All · yours" }), el("b", { text: pdF(yours) }))));
    slipIn = el("input", { attrs: { type: "text", inputmode: "decimal", placeholder: "$0", "aria-label": "Amount in sDAI" } });
    slipIn.value = st.slipAmt ? "$" + F.num(st.slipAmt, 2) : "";
    slipIn.addEventListener("input", function () { st.slipAmt = Math.min(1e7, parseFloat(slipIn.value.replace(/[^0-9.]/g, "")) || 0); renderSlipRows(); });
    slipIn.addEventListener("blur", function () { slipIn.value = st.slipAmt ? "$" + F.num(st.slipAmt, 2) : ""; });
    var chips = el("div", { class: "s-amountchips" }, [10, 50, 100, 500].map(function (c) { var b = el("button", { attrs: { type: "button" }, text: "+$" + c }); b.addEventListener("click", function () { st.slipAmt = Math.min(1e7, st.slipAmt + c); slipIn.value = "$" + F.num(st.slipAmt, 2); renderSlipRows(); }); return b; }));
    var rows = el("div", { class: "s-ticket__rows", attrs: { id: "rk-slip-rows" } });
    var conf = el("button", { class: "s-btn s-btn--lg", attrs: { type: "button" }, text: list.length ? "Predict " + list.length + (list.length === 1 ? " estimate" : " estimates") : "Predict all estimates" });
    conf.addEventListener("click", function () {
      if (!editedList().length) { S.toast("Set at least one estimate first.", "alert"); return; }
      if (!st.slipAmt) { S.toast("Enter an amount first.", "alert"); return; }
      S.toast("Sample only: no transaction sent (" + editedList().length + " estimates, " + F.tok(st.slipAmt, "sDAI") + ").", "info");
    });
    var clr = el("button", { class: "s-icon-btn", attrs: { type: "button", "aria-label": "Clear amount" }, html: S.icon("close", 20) });
    clr.addEventListener("click", function () { st.slipAmt = 0; slipIn.value = ""; renderSlipRows(); });
    slip.appendChild(el("div", { class: "s-panel s-panel--nested", style: { gap: "14px" } },
      el("div", { class: "s-amount" }, el("label", { text: "Amount" }), slipIn), chips, rows,
      el("div", { class: "s-ticket__confirm" }, conf, clr)));
    // legs
    var legs = el("div", { class: "rk-legs" });
    if (!list.length) legs.appendChild(el("p", { class: "t-meta rk-legs__empty", text: "Move a slider, type an estimate or upload a CSV. Each asset you change becomes one leg of a single batched trade." }));
    else {
      legs.appendChild(el("div", { class: "rk-legs__head" }, el("span", { class: "s-spec", text: "Legs" }), el("span", { class: "s-spec", text: "Token price, now → yours" })));
      list.slice(0, 6).forEach(function (a) {
        var buy = est(a) > a.y;
        legs.appendChild(el("div", { class: "rk-leg" }, el("span", { class: "s-tag s-tag--mono " + (buy ? "s-tag--violet" : "rk-tag-sell"), text: buy ? "Buy" : "Sell" }), el("b", { text: a.sym }), el("span", { class: "rk-leg__px", text: centsF(tokP(D.quarterly(a.y))) + " → " + centsF(tokP(D.quarterly(est(a)))) })));
      });
      if (list.length > 6) legs.appendChild(el("p", { class: "t-meta", text: "and " + (list.length - 6) + " more" }));
    }
    slip.appendChild(legs);
    slip.appendChild(el("p", { class: "t-meta", text: "Pay with sDAI on Ethereum. Sample prices; nothing is traded." }));
    renderSlipRows();
    if (focusAmt) { slipIn.focus(); var l = slipIn.value.length; try { slipIn.setSelectionRange(l, l); } catch (e) { } }
  }
  function renderSlipRows() {
    var rows = $("#rk-slip-rows"); if (!rows) return; S.clear(rows);
    var list = editedList(), buys = list.filter(function (a) { return est(a) > a.y; }).length;
    function line(k, v) { return el("div", {}, el("span", { text: k }), el("b", { text: v })); }
    rows.appendChild(line("Assets edited", list.length + " of " + A.length));
    rows.appendChild(line("Tokens to buy · sell", buys + " · " + (list.length - buys)));
    rows.appendChild(line("Capital", st.slipAmt ? F.tok(st.slipAmt, "sDAI") + ", shared by every leg" : "—"));
    rows.appendChild(line("Max slippage", "1.0%"));
  }

  // CSV upload (untrusted: size-limited, parsed in the browser, rendered as text)
  var MAXB = 64 * 1024;
  function readCSV(file) {
    if (!file) return;
    if (file.size > MAXB) { S.toast("That file is over 64 KB. Keep it to one row per asset.", "alert"); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var text = String(fr.result || "").slice(0, MAXB), lines = text.split(/\r?\n/).slice(0, 500), ok = 0, skip = 0;
      lines.forEach(function (ln, i) {
        ln = ln.trim(); if (!ln || ln.charAt(0) === "#") return;
        var c = ln.split(/[,;\t]/).map(function (x) { return x.trim().replace(/^"|"$/g, ""); });
        var a = find(c[0]); if (!a) { if (!(i === 0 && /symbol|asset/i.test(c[0]))) skip++; return; }
        var raw = c[1] || "", v = parseFloat(raw.replace(",", ".").replace(/[^0-9.]/g, ""));
        if (!isFinite(v) || v <= 0) { skip++; return; }
        var p = raw.indexOf("%") > -1 || v >= 1 ? v / 100 : v;
        if (p <= 0 || p >= 1) { skip++; return; }
        p = clamp(p, DOM_Y[0], .99); if (Math.abs(log10(p) - log10(a.y)) < .004) delete st.mine[a.id]; else st.mine[a.id] = p; ok++;
      });
      A.forEach(function (a) { updateRow(a.id); }); updateEdited(); renderSlip(); lateBoard();
      var name = file.name.length > 40 ? file.name.slice(0, 37) + "…" : file.name;
      S.toast(ok ? "Read " + ok + " estimates from " + name + (skip ? "; skipped " + skip + (skip === 1 ? " row." : " rows.") : ".") : "No matching rows in " + name + ". Use symbol,pd per line.", ok ? "check" : "alert");
    };
    fr.onerror = function () { S.toast("Couldn't read that file.", "alert"); };
    fr.readAsText(file);
  }
  $("#rk-file").addEventListener("change", function (e) { readCSV(e.target.files && e.target.files[0]); e.target.value = ""; });
  var estBox = $(".rk-est");
  estBox.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") > -1) { e.preventDefault(); estBox.classList.add("is-over"); } });
  estBox.addEventListener("dragleave", function (e) { if (!estBox.contains(e.relatedTarget)) estBox.classList.remove("is-over"); });
  estBox.addEventListener("drop", function (e) { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); estBox.classList.remove("is-over"); readCSV(e.dataTransfer.files[0]); });
  $("#rk-template").addEventListener("click", function () {
    download("seer-risk-2850-estimates-template.csv", "# Your yearly PD per asset, as a fraction (0.025) or a percent with the sign (2.5%). Prefilled with SAMPLE market estimates.\nsymbol,pd\n" + A.map(function (a) { return a.sym + "," + a.y.toFixed(4); }).join("\n") + "\n");
  });

  /* ======================= 6. method ======================= */
  function renderFormula() {
    var a = AM[st.active], box = $("#rk-formula"); if (!a || !box) return; var q = D.quarterly(a.y);
    S.clear(box);
    box.appendChild(el("div", { class: "rk-formula__head" }, el("span", { class: "s-spec", text: "Worked example" }), el("span", { class: "s-spec" }, el("b", { text: a.sym }), " · follows the board")));
    box.appendChild(el("div", { class: "rk-formula__row" }, el("span", { text: "Token price" }), el("code", { text: centsF(tokP(q)) }), el("span", { class: "t-meta", text: "= " + pdF(q) + " this quarter × " + F.num(SCALE, 2) + " (shared payout)" })));
    box.appendChild(el("div", { class: "rk-formula__row" }, el("span", { text: "Per year" }), el("code", { text: "1 − (1 − " + F.num(q, 4) + ")⁴" }), el("span", { class: "t-meta", text: "= " + pdF(a.y) })));
    box.appendChild(el("div", { class: "rk-formula__row" }, el("span", { text: "Back again" }), el("code", { text: "1 − (1 − " + F.num(a.y, 4) + ")^¼" }), el("span", { class: "t-meta", text: "= " + pdF(q) })));
  }
  (function () {
    var ul = $("#rk-bandlist");
    BANDS.forEach(function (b) {
      var n = A.filter(function (a) { return a.band === b.id; }).length;
      var range = b.max >= 1 ? "10% and up" : F.num(b.min * 100, 0) + "–" + F.num(b.max * 100, 0) + "%";
      var qr = b.max >= 1 ? "≥ " + pdF(D.quarterly(b.min)) : (b.min ? pdF(D.quarterly(b.min)) : "0") + "–" + pdF(D.quarterly(b.max));
      ul.appendChild(el("li", {}, bandChip(b.id), el("b", { text: range }), el("span", { class: "t-meta", text: qr + " / qtr" }), el("span", { class: "rk-bandlist__n t-meta", text: n + (n === 1 ? " asset" : " assets") })));
    });
    $("#rk-timeline").appendChild(S.ui.timeline([
      { label: "Created", done: true, time: BOARD.trading.opens },
      { label: "Trading", current: true, note: "to " + F.dayMon(CLOSES) },
      { label: "Reports open", time: MKT.openingDate || "2027-01-01T00:00:00Z" },
      { label: "Answer", note: "Reality.eth" },
      { label: "Dispute window", note: "Kleros" },
      { label: "Resolved", note: "sDAI split" },
      { label: "Redeem", note: "tokens → sDAI" }
    ]));
    var hl = AM.hlETH, qr = AM.qrETH;
    var rules = [
      ["Compare, don't threshold", "A 4% asset is neither safe nor unsafe. " + qr.sym + " at " + pdF(qr.y) + " is about " + F.num(qr.y / hl.y, 0) + " times as likely to default as " + hl.sym + " at " + pdF(hl.y) + ". That ratio is what the board is for."],
      ["Read the range", "A tight range means traders agree. A wide one means the price can move on little news, so read its band as provisional."],
      ["Read the trend", "Twelve weekly closes sit behind every estimate. A rising Low can matter more than a flat Moderate."],
      ["Mind the depth", "Thin outcomes move on small trades. Liquidity is listed for every asset, and the range widens where it is low."]
    ];
    var box = $("#rk-rules");
    rules.forEach(function (r, i) { box.appendChild(el("div", { class: "rk-rule" }, el("span", { class: "s-spec", text: "0" + (i + 1) }), el("b", { text: r[0] }), el("p", { class: "t-meta", text: r[1] }))); });
  })();

  /* ======================= drawer (asset detail) ======================= */
  var drawer = $("#rk-drawer"), panel = $("#rk-drawer-panel"), drawerId = null, lastFocus = null;
  function openDrawer(id) {
    var a = find(id); if (!a) return;
    if (!drawerId) lastFocus = document.activeElement;
    drawerId = a.id; st.active = a.id;
    drawer.classList.add("is-open"); drawer.setAttribute("aria-hidden", "false"); document.documentElement.classList.add("rk-noscroll");
    renderDrawer(a.id); drawPlot(); renderFormula();
    try { history.replaceState(null, "", "#" + a.id); } catch (e) { }
    var c = $(".rk-dr__close", panel); if (c) c.focus();
  }
  function closeDrawer() {
    if (!drawerId) return; drawerId = null;
    drawer.classList.remove("is-open"); drawer.setAttribute("aria-hidden", "true"); document.documentElement.classList.remove("rk-noscroll"); S.tip.hide();
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function renderDrawer(id) {
    var a = AM[id], h = st.h, q = D.quarterly(a.y), i = BYP.indexOf(a), prev = BYP[i - 1], next = BYP[i + 1], inCmp = st.cmp.indexOf(a.id) > -1;
    S.clear(panel); panel.scrollTop = 0;
    var nav = el("div", { class: "rk-dr__nav" },
      iconBtn("chevron-left", prev ? "Previous asset, " + prev.sym : "No lower estimate", prev ? function () { openDrawer(prev.id); } : null, "s-icon-btn--sm"),
      iconBtn("chevron-right", next ? "Next asset, " + next.sym : "No higher estimate", next ? function () { openDrawer(next.id); } : null, "s-icon-btn--sm"),
      iconBtn("close", "Close details", closeDrawer, "rk-dr__close"));
    if (!prev) $$("button", nav)[0].disabled = true; if (!next) $$("button", nav)[1].disabled = true;
    panel.appendChild(el("div", { class: "rk-dr__head" },
      el("div", { class: "rk-dr__id" }, S.ui.avatar("risk", "ink"), el("div", {}, el("h2", { class: "t-h3", attrs: { id: "rk-dr-title" }, text: a.sym }), el("p", { class: "t-meta", text: a.name + " · " + GLABEL[a.group] }))),
      nav));
    panel.appendChild(S.ui.specs([{ html: "Mkt <b>#" + MKT.id + "</b>" }, "Outcome " + (D.riskAssets.findIndex(function (x) { return x.id === a.id; }) + 1) + " of 34", "Ethereum · sDAI"]));
    var stats = el("div", { class: "s-stats", style: { "--cols": "3" } });
    stats.appendChild(S.ui.stat("Per year", pdF(a.y), { note: BAND[a.band].label + " band" }));
    stats.appendChild(S.ui.stat("Per quarter", pdF(q), { note: "Q4 2026" }));
    stats.appendChild(S.ui.stat("Token price", centsF(tokP(q)), { note: "1 sDAI, split if several default" }));
    panel.appendChild(stats);
    var dc = el("div", { class: "s-card s-card--pad rk-dr__card" }, el("div", { class: "rk-cardhead" }, el("b", { class: "t-title", text: "Traders' estimates" }), bandChip(a.band)));
    var dbox = el("div"); dc.appendChild(dbox);
    dc.appendChild(el("p", { class: "t-meta", text: "80% of traders' estimates (by size) sit between " + pdF(hv(a.p10, h)) + " and " + pdF(hv(a.p90, h)) + " " + hWord(h) + ". Agreement: " + a.agree.toLowerCase() + "." }));
    panel.appendChild(dc);
    var lc = el("div", { class: "s-card s-card--pad rk-dr__card" }, el("div", { class: "rk-cardhead" }, el("b", { class: "t-title", text: "Last 12 weeks" }), changeEl(a.change)));
    var lbox = el("div"); lc.appendChild(lbox); panel.appendChild(lc);
    panel.appendChild(S.ui.kv([
      ["Outcome token", S.ui.addr(a.token, { what: "token address" })],
      ["Market", el("a", { class: "s-link", href: "../app/#m=" + MKT.id, text: "#" + MKT.id + " on Seer App" })],
      ["Market contract", S.ui.addr(MKT.address, { what: "market address" })],
      ["Liquidity", F.tok(a.liquidity, "sDAI", 0)],
      ["Your estimate", edited(a) ? pdF(est(a)) + " per year" : "Not set"],
      ["Resolution", "Reality.eth, disputes to Kleros"]
    ]));
    var cmpBtn = el("button", { class: "s-btn s-btn--ghost", attrs: { type: "button" }, text: inCmp ? "Remove from compare" : "Add to compare" });
    cmpBtn.addEventListener("click", function () { toggleCmp(a.id); });
    var setBtn = el("button", { class: "s-btn", attrs: { type: "button" } }, el("span", { html: S.icon("sliders", 16), style: { display: "inline-flex" } }), "Set your estimate");
    setBtn.addEventListener("click", function () {
      var g = a.group; closeDrawer();
      if (!st.open[g]) { st.open[g] = true; var grp = $('.rk-acc__grp[data-g="' + g + '"]'); if (grp) { $(".rk-acc__head", grp).setAttribute("aria-expanded", "true"); $(".rk-acc__body", grp).hidden = false; } syncExpand(); }
      var r = refs[a.id]; if (r) { r.row.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); r.row.classList.add("is-flash"); setTimeout(function () { r.row.classList.remove("is-flash"); }, 1600); setTimeout(function () { r.range.focus({ preventScroll: true }); }, reduceMotion ? 0 : 420); }
    });
    panel.appendChild(el("div", { class: "rk-dr__actions" }, setBtn, cmpBtn, el("a", { class: "s-btn s-btn--quiet", href: "../app/#m=" + MKT.id, text: "Trade on Seer" })));
    panel.appendChild(el("p", { class: "t-meta", text: "Sample data. " + a.name + " is a fictional asset; this estimate is illustrative and not live." }));
    // charts after layout
    rkDist(dbox, { curves: [{ a: a, name: a.sym, short: a.sym, color: "var(--c1)" }], height: 190 });
    var vals = a.history.map(function (p) { return [p[0], log10(hv(p[1], h))]; }), ys = vals.map(function (p) { return p[1]; });
    var lo = Math.min.apply(null, ys) - .1, hi = Math.max.apply(null, ys) + .1;
    var tks = TICKS.filter(function (t) { var v = log10(t); return v >= lo && v <= hi; });
    if (tks.length < 2) { var mid = (lo + hi) / 2, near = TICKS.slice().sort(function (x, y) { return Math.abs(log10(x) - mid) - Math.abs(log10(y) - mid); }).slice(0, 2).sort(function (x, y) { return x - y; }); tks = near; lo = Math.min(lo, log10(near[0]) - .05); hi = Math.max(hi, log10(near[1]) + .05); }
    var tl = tks.map(log10), yf = tickFmt(tks, h);
    S.chart.line(lbox, { series: [{ name: a.sym + " " + hWord(h), short: a.sym, values: vals, color: "var(--c1)" }], y: { min: lo, max: hi, ticks: tl, format: yf }, x: { format: F.dayMon }, height: 200, area: true, ring: "var(--surface)", refs: edges(h).map(function (e) { return { y: log10(e) }; }).filter(function (r) { return r.y > lo + .02 && r.y < hi - .02; }), label: a.sym + " estimate over 12 weeks" });
  }
  drawer.addEventListener("click", function (e) { if (e.target.hasAttribute("data-close")) closeDrawer(); });
  document.addEventListener("keydown", function (e) {
    if (!drawerId) return;
    if (e.key === "Escape") { e.preventDefault(); closeDrawer(); return; }
    if (e.key === "Tab") { // keep focus inside the dialog
      var f = $$("button:not([disabled]), a[href], input, select, [tabindex='0']", panel).filter(function (x) { return x.offsetParent !== null; }); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  function fromHash() { var id = decodeURIComponent((location.hash || "").slice(1)); var a = find(id); if (a) openDrawer(a.id); }
  window.addEventListener("hashchange", fromHash);

  /* ======================= boot ======================= */
  function renderAll() { renderFacts(); drawPlot(); renderStats(); renderBoard(); renderCompare(); renderNTA(); renderFormula(); if (drawerId) renderDrawer(drawerId); }
  renderFacts(); renderStats(); renderBoard(); renderCompare(); renderNTA(); renderFormula();
  buildAcc(); renderSlip();
  drawPlot(); S.onResize(plot, drawPlot);
  S.onResize(ntaField, drawField);
  document.addEventListener("seer:theme", function () { drawPlot(); drawField(); });
  fromHash();
})();
