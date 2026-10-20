/* Deep (deep.seer.pm) — page script. Concept by Swift Bot Labs. Not affiliated with Seer.
   All data is SEER_SAMPLE (fictional, deterministic). Anything derived here is seeded with
   SEER_SAMPLE.rng("dp…") so screenshots are stable. User CSVs are parsed in the browser,
   size-limited, and rendered with textContent only (Seer.el). */
(function () {
  "use strict";
  var D = window.SEER_SAMPLE, S = window.Seer, F = S.fmt, el = S.el, $ = S.$;
  var R = D.round4, M = D.market("2841");
  var DAY = 864e5;

  /* ---------------- data prep ---------------- */
  var props = D.proposals;
  var ranked = props.slice().sort(function (a, b) { return a.deep.rank - b.deep.rank; });
  var CUT = (ranked[R.slots - 1].deep.marketScore + ranked[R.slots].deep.marketScore) / 2; // between rank 8 and 9
  var agentById = {}; D.agents.forEach(function (a) { agentById[a.id] = a; });
  var outcomeOf = {}; M.outcomes.forEach(function (o) { outcomeOf[o.proposal] = o; });
  var fut = D.futarchy.filter(function (x) { return x.id === "LIP-31"; })[0];
  var minSd = Math.min.apply(null, props.map(function (p) { return p.deep.consensusSd; }));

  function gauss(r) { var u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function rnd(x, d) { var m = Math.pow(10, d || 0); return Math.round(x * m) / m; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function pAbove(p, t) { return 1 - S.chart.cdf(t, p.deep.marketScore, p.deep.consensusSd); }
  function sc(v) { return F.num(v, 2); }

  (function derive() {
    var wsum = 0;
    props.forEach(function (p) {
      var r = D.rng("dp:" + p.id);
      r();                                                       // (slot kept so the seeded weights below stay the same)
      var oi = M.outcomes.indexOf(outcomeOf[p.id]);              // 24h move of the forecast, in score points, from the
      p._chg = rnd((outcomeOf[p.id].price - D.priceAgo(M.id, oi, DAY)) * 10, 2); // same series the App record reads
      p._w = .4 + r() + p.deep.up;                                // liquidity / volume weight
      wsum += p._w;
      p._up = outcomeOf[p.id].token;
      p._down = D.addr("down-token:2841:" + p.id);
      p._clear = pAbove(p, CUT);
    });
    props.forEach(function (p) { p._liq = Math.round(M.liquidity * p._w / wsum); p._vol = Math.round(M.volume * p._w / wsum); });
  })();

  function defaultCompare(p) {
    var best = null, bd = -1;
    p.deep.forecasts.forEach(function (f) { var a = agentById[f.agent], d = Math.abs(f.mean - p.deep.marketScore); if (a.traderScore >= 55 && d > bd) { bd = d; best = f.agent; } });
    return best || p.deep.forecasts[0].agent;
  }
  var state = { sel: D.featuredProposal, compareUser: false, fieldAll: false, cat: "all", q: "", contested: false, view: "people", compare: null, chart: "dist",
    side: 0, thr: 8.135, sigSort: "likely", sigAll: false, lb: 0, step: 0, preds: null, predSrc: "", predErr: [], budget: 500, minEdge: .25, pay: 8.6 };
  state.compare = defaultCompare(D.proposal(state.sel));

  /* ---------------- 1. hero ---------------- */
  (function heroFacts() {
    var dl = $("#dp-hero-facts");
    [["Outcomes", "40", "proposals"], ["Agents", String(D.agents.length), "trading"], ["Funding", "8", "slots"], ["Panel reveal", F.dayMon(R.panelReveal), F.ago(R.panelReveal)]].forEach(function (f) {
      dl.appendChild(el("div", {}, el("dt", { text: f[0] }), el("dd", {}, f[1], el("small", { text: f[2] }))));
    });
  })();

  var ridge = { rows: ranked.slice(), groups: [], cur: -1, overlay: null, svg: null };
  function drawRidge() {
    var box = $("#dp-ridge"), W = box.clientWidth, H = box.clientHeight;
    if (!W || !H) return;
    var rows = ridge.rows, n = rows.length, sv = S.svgEl;
    var gut = W < 440 ? 34 : 46, axisH = 22, top = 30, dom = [2, 10];
    var X = function (v) { return gut + (v - dom[0]) / (dom[1] - dom[0]) * (W - gut - 6); };
    var ampMax = (H - axisH - top) * (W < 440 ? .22 : .26), amp0 = ampMax * minSd / rows[0].deep.consensusSd;
    // the funded 8 are the point of the poster: they get 2.2x the row spacing (and a gap at the line); 9-40 stay compressed
    var FUND = 2.2, GAP = 1.8, units = function (i) { var k = Math.min(i, R.slots - 1); return k * FUND + (i >= R.slots ? GAP + (i - R.slots) : 0); };
    var step = (H - axisH - top - amp0) / units(n - 1), base0 = top + amp0;
    var base = function (i) { return base0 + units(i) * step; };
    ridge.baseOf = base;
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true" });
    ridge.groups = []; ridge.base0 = base0; ridge.step = step;
    rows.forEach(function (p, i) {
      var b = base(i), m = p.deep.marketScore, sd = p.deep.consensusSd, amp = ampMax * minSd / sd, N = 120, d = "";
      for (var k = 0; k <= N; k++) {
        var v = dom[0] + (dom[1] - dom[0]) * k / N, y = b - amp * Math.exp(-.5 * Math.pow((v - m) / sd, 2));
        d += (k ? "L" : "M") + X(v).toFixed(1) + " " + y.toFixed(1);
      }
      var area = d + "L" + X(dom[1]).toFixed(1) + " " + (b + 1).toFixed(1) + "L" + X(dom[0]).toFixed(1) + " " + (b + 1).toFixed(1) + "Z";
      var g = sv("g", { class: "dp-w" });
      g.appendChild(sv("path", { class: "dp-w__fill", d: area }));
      g.appendChild(sv("path", { class: "dp-w__wash", d: area }));
      var ln = sv("path", { class: "dp-w__line", d: d });
      ln.style.stroke = i < R.slots ? "rgba(143,85,247," + (1 - i * .03).toFixed(2) + ")" : "rgba(191,191,230," + (.52 - (i - R.slots) / (n - R.slots) * .36).toFixed(2) + ")";
      g.appendChild(ln);
      var py = b - amp - 7, t = sv("text", { class: "dp-w__lbl dp-w__peak", x: clamp(X(m), gut + 24, W - 30), y: py, "text-anchor": "middle" }); t.textContent = p.id + "  " + sc(m);
      g.appendChild(t);
      svg.appendChild(g); ridge.groups.push(g);
    });
    var ov = sv("g", {}); ridge.overlay = ov;
    var cx = X(CUT);
    ov.appendChild(sv("line", { class: "dp-r-cut", x1: cx, x2: cx, y1: top - 10, y2: base(n - 1) + 2 }));
    var cl = sv("text", { class: "dp-r-cutlbl", x: cx - 8, y: top - 14, "text-anchor": "end" }); cl.textContent = "FUNDING LINE " + F.num(CUT, 3); ov.appendChild(cl);
    var cr = sv("text", { class: "dp-r-cutlbl", x: cx + 8, y: top - 14 }); cr.textContent = R.slots + " SLOTS →"; ov.appendChild(cr);
    // rank bracket in the gutter: top 8 (violet) vs the rest
    var b8 = base(R.slots - 1), b9 = base(R.slots);
    ov.appendChild(sv("line", { class: "dp-r-brk dp-r-brk--top", x1: 3, x2: 3, y1: base(0) - step * 1.5, y2: b8 }));
    ov.appendChild(sv("line", { class: "dp-r-brk", x1: 3, x2: 3, y1: b9, y2: base(n - 1) }));
    [[base(0), "01"], [b8, pad2(R.slots)], [base(n - 1), String(n)]].forEach(function (lb) { var tt = sv("text", { class: "dp-r-rank", x: 10, y: lb[0] + 3 }); tt.textContent = lb[1]; ov.appendChild(tt); });
    for (var tk = W < 480 ? 6 : 4; tk <= 10; tk += 2) { var tx = sv("text", { class: "dp-r-axis", x: X(tk), y: H - 4, "text-anchor": tk === 10 ? "end" : "middle" }); tx.textContent = tk.toFixed(1); ov.appendChild(tx); }
    var al = sv("text", { class: "dp-r-axis", x: gut, y: H - 4 }); al.textContent = "PANEL SCORE →"; ov.appendChild(al);
    svg.appendChild(ov);
    S.clear(box).appendChild(svg); ridge.svg = svg;
    var keep = ridge.cur; ridge.cur = -1;
    ridgeOn(keep >= 0 ? keep : ridgeDefault());
  }
  function ridgeDefault() { for (var i = 0; i < ridge.rows.length; i++) if (ridge.rows[i].id === state.sel) return i; return R.slots - 1; }
  function ridgeOn(i) {
    if (!ridge.svg || i === ridge.cur) return;
    var g = ridge.groups;
    if (ridge.cur >= 0) { g[ridge.cur].classList.remove("is-on"); ridge.svg.insertBefore(g[ridge.cur], g[ridge.cur + 1] || ridge.overlay); }
    ridge.cur = i; ridge.svg.insertBefore(g[i], ridge.overlay); g[i].classList.add("is-on");
    var p = ridge.rows[i], cap = S.clear($("#dp-ridge-cap"));
    cap.appendChild(el("div", { style: { minWidth: "0" } }, el("b", { text: p.id + " · " + p.title }),
      el("span", { text: "Rank " + p.deep.rank + " of 40 · spread ± " + sc(p.deep.consensusSd) + " · " + F.pct0(p._clear) + " to clear the line" })));
    cap.appendChild(el("div", { class: "dp-cap-num" }, sc(p.deep.marketScore), el("small", { text: "Forecast / 10" })));
  }
  (function ridgeEvents() {
    var box = $("#dp-ridge");
    function idxAt(e) {
      if (!ridge.svg) return ridgeDefault(); var bb = box.getBoundingClientRect(), y = e.clientY - bb.top;
      for (var i = 0; i < ridge.rows.length; i++) if (ridge.baseOf(i) >= y - ridge.step * .15) return i; // first wave whose baseline is below the pointer
      return ridge.rows.length - 1;
    }
    box.addEventListener("pointermove", function (e) { if (ridge.svg) ridgeOn(idxAt(e)); });
    box.addEventListener("pointerleave", function () { ridgeOn(ridgeDefault()); });
    box.addEventListener("click", function (e) { var i = idxAt(e); select(ridge.rows[i].id, { scroll: true, hash: true }); });
    box.addEventListener("keydown", function (e) {
      if (!ridge.svg) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); ridgeOn(clamp(ridge.cur + (e.key === "ArrowDown" ? 1 : -1), 0, ridge.rows.length - 1)); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(ridge.rows[ridge.cur].id, { scroll: true, hash: true }); }
    });
    S.onResize(box, drawRidge);
    drawRidge(); // draw now too: ResizeObserver waits for a painted frame, which background tabs skip
  })();

  /* ---------------- 2. round ---------------- */
  var STEPS = [
    ["Connect your wallet", "OP Mainnet is the only network Deep rounds run on.", "Connect wallet"],
    ["Create a trade wallet", "A contract you own that batches hundreds of trades into one transaction.", "Create trade wallet"],
    ["Add sUSDS", "Every Deep market settles in sUSDS, which earns the Sky savings rate while you hold it.", "Add sUSDS"]
  ];
  function renderSteps() {
    var ol = S.clear($("#dp-steps"));
    STEPS.forEach(function (s, i) {
      var done = i < state.step, cur = i === state.step;
      var li = el("li", { class: "dp-step" + (done ? " is-done" : cur ? " is-current" : "") },
        el("span", { class: "dp-step__n", html: done ? S.icon("check", 14) : null, text: done ? null : String(i + 1) }),
        el("b", { text: s[0] }), el("p", { text: s[1] }));
      if (cur) li.appendChild(el("button", { class: "s-btn s-btn--sm", text: s[2], attrs: { type: "button" }, on: { click: function () {
        state.step++; renderSteps(); S.toast("Sample only: nothing was signed. Step " + (i + 1) + " of 3 marked done.", "check");
        var nb = $("#dp-steps .is-current .s-btn"); if (nb) nb.focus();
      } } }));
      if (done) li.appendChild(el("span", { class: "dp-step__ok", text: "Done in this demo" }));
      ol.appendChild(li);
    });
  }
  renderSteps();
  $("#dp-round-specs").appendChild(S.ui.specs(["Mkt #2841", "Scalar × 40", D.state(M.state).label]));
  $("#dp-round-q").textContent = "Round 4 at a glance: scores from 0 to 10, eight funded";
  (function roundStats() {
    var box = $("#dp-round-stats");
    box.appendChild(S.ui.stat("Outcomes", "40", { note: "One per proposal" }));
    box.appendChild(S.ui.stat("Funding", "250K", { unit: "sDAI", note: "8 slots · Lattice DAO" }));
    box.appendChild(S.ui.stat("Volume", F.usd(M.volume), { note: "Since " + F.dayMon(M.created) }));
    box.appendChild(S.ui.stat("Liquidity", F.usd(M.liquidity), { note: "Across 80 UP/DOWN pools" }));
    box.appendChild(S.ui.stat("Trading closes", F.dayMon(R.closes), { note: F.ago(R.closes) }));
    box.appendChild(S.ui.stat("Panel reveal", F.dayMon(R.panelReveal), { note: F.ago(R.panelReveal) + " · 5 reviewers" }));
  })();

  /* ---------------- 3. field ---------------- */
  var CATS = ["Infra", "Tooling", "Research", "Data", "Security", "Education", "Community"];
  (function cats() {
    var items = [["all", "All", props.length]].concat(CATS.map(function (c) { return [c, c, props.filter(function (p) { return p.category === c; }).length]; }));
    $("#dp-cats").appendChild(S.ui.chipRow(items, "all", function (v) { state.cat = v; renderField(); }));
  })();
  $("#dp-view").appendChild(S.ui.seg([["people", "People"], ["agents", "Agents"]], "people", function (v) { state.view = v; renderField(); }, "Reader"));
  $("#dp-contested").addEventListener("change", function (e) { state.contested = e.target.checked; renderField(); });
  $("#dp-q").addEventListener("input", function (e) { state.q = e.target.value; renderField(); renderLb(); });
  document.addEventListener("seer:search", function (e) {
    state.q = (e.detail && e.detail.q) || ""; $("#dp-q").value = state.q; renderField(); renderLb();
    if (state.q && window.scrollY < $("#field").offsetTop - 200) $("#field").scrollIntoView({ behavior: "smooth" });
  });

  function matches(p) {
    if (state.cat !== "all" && p.category !== state.cat) return false;
    if (state.contested && (p._clear < .2 || p._clear > .8)) return false;
    var q = state.q.trim().toLowerCase();
    if (q && (p.id + " " + p.title + " " + p.team + " " + p.category).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }
  function filtered() { return ranked.filter(matches); }

  function mini(p) {
    var w = 132, h = 30, sv = S.svgEl, N = 48, m = p.deep.marketScore, sd = p.deep.consensusSd, amp = (h - 5) * minSd / sd, d = "";
    var X = function (v) { return 1 + v / 10 * (w - 2); };
    for (var k = 0; k <= N; k++) { var v = 10 * k / N, y = h - 1 - amp * Math.exp(-.5 * Math.pow((v - m) / sd, 2)); d += (k ? "L" : "M") + X(v).toFixed(1) + " " + y.toFixed(1); }
    var svg = sv("svg", { class: "dp-mini", viewBox: "0 0 " + w + " " + h, width: w, height: h, role: "img", "aria-label": "Forecast " + sc(m) + ", spread " + sc(sd) });
    svg.appendChild(sv("path", { class: "a", d: d + "L" + X(10) + " " + (h - 1) + "L" + X(0) + " " + (h - 1) + "Z" }));
    svg.appendChild(sv("line", { class: "b", x1: 0, x2: w, y1: h - .5, y2: h - .5 }));
    svg.appendChild(sv("line", { class: "c", x1: X(CUT), x2: X(CUT), y1: 1, y2: h - 1 }));
    svg.appendChild(sv("path", { class: "l", d: d }));
    return svg;
  }
  function signedPts(v) { return el("span", { class: v > 0 ? "t-pos" : v < 0 ? "t-neg" : "t-3", text: F.signedNum(v, 2) }); }
  function tradeBtns(p) {
    return el("span", { class: "dp-trade" },
      el("button", { class: "s-btn s-btn--xs", text: "Up " + F.cents(p.deep.up), attrs: { type: "button", "aria-label": "Buy UP on " + p.id + " at " + F.cents(p.deep.up) }, on: { click: function (e) { e.stopPropagation(); state.side = 0; select(p.id, { scroll: true, hash: true, ticket: true }); } } }),
      el("button", { class: "s-btn s-btn--xs s-btn--secondary", text: "Down " + F.cents(p.deep.down), attrs: { type: "button", "aria-label": "Buy DOWN on " + p.id + " at " + F.cents(p.deep.down) }, on: { click: function (e) { e.stopPropagation(); state.side = 1; select(p.id, { scroll: true, hash: true, ticket: true }); } } }));
  }
  var peopleCols = [
    { key: "rank", label: "#", class: "dp-c-rank", sort: function (r) { return r.deep.rank; }, width: "44px", render: function (r) { return el("span", { class: "dp-rank", text: pad2(r.deep.rank) }); } },
    { key: "title", label: "Proposal", class: "dp-c-title", sort: function (r) { return r.title; }, render: function (r) { return el("div", { class: "dp-ptitle-cell", data: { pid: r.id, rank: String(r.deep.rank) } }, el("b", { text: r.title }), el("span", { text: r.id + " · " + r.team + " · " + r.category })); } },
    { key: "score", label: "Forecast", num: true, class: "dp-c-score", sort: function (r) { return r.deep.marketScore; }, render: function (r) { return el("span", { class: "dp-score" }, el("b", { text: sc(r.deep.marketScore) }), el("span", { text: "± " + sc(r.deep.consensusSd) })); } },
    { key: "dist", label: "Distribution 0–10", class: "s-hide-sm", render: mini },
    { key: "chg", label: "24h", num: true, class: "s-hide-sm", sort: function (r) { return r._chg; }, render: function (r) { return signedPts(r._chg); } },
    { key: "fund", label: "P(funded)", num: true, class: "s-hide-sm", sort: function (r) { return r.opp.pSelect; }, render: function (r) { return el("a", { class: "dp-pfund", href: "../opportunity/#" + r.id, text: F.pct0(r.opp.pSelect), title: "Opportunity market #2842" }); } },
    { key: "ask", label: "Grant ask", num: true, class: "s-hide-sm", sort: function (r) { return r.ask; }, render: function (r) { return el("span", { class: "t-2", text: F.compact(r.ask, 1) + " sDAI" }); } },
    { key: "liq", label: "Depth", num: true, class: "s-hide-sm", sort: function (r) { return r._liq; }, render: function (r) { return el("span", { class: "t-2", title: "Liquidity in this proposal's UP/DOWN pool", text: F.compact(r._liq, 1) + " " + M.collateral }); } },
    { key: "trade", label: "Trade", class: "dp-c-trade", render: tradeBtns }
  ];
  var agentCols = [
    { key: "id", label: "Outcome", sort: function (r) { return r.deep.rank; }, render: function (r) { return el("span", { text: r.id }); } },
    { key: "up", label: "UP", num: true, sort: function (r) { return r.deep.up; }, render: function (r) { return F.price(r.deep.up, 4); } },
    { key: "down", label: "DOWN", num: true, sort: function (r) { return r.deep.down; }, render: function (r) { return F.price(r.deep.down, 4); } },
    { key: "sd", label: "σ", num: true, sort: function (r) { return r.deep.consensusSd; }, render: function (r) { return sc(r.deep.consensusSd); } },
    { key: "liq", label: "Liquidity", num: true, class: "s-hide-sm", sort: function (r) { return r._liq; }, render: function (r) { return F.num(r._liq); } },
    { key: "uptok", label: "UP token", class: "s-hide-sm", render: function (r) { return S.ui.addr(r._up, { what: "UP token address" }); } },
    { key: "downtok", label: "DOWN token", class: "s-hide-sm", render: function (r) { return S.ui.addr(r._down, { what: "DOWN token address" }); } }
  ];
  var tPeople = S.ui.table($("#dp-field-people"), peopleCols, { rows: ranked, sortKey: "rank", sortDir: "asc", compact: true, caption: "Round 4 proposals with forecast panel scores",
    onRow: function (r) { select(r.id, { scroll: true, hash: true }); }, empty: { title: "No proposals match", text: "Clear the search or pick another category." } });
  tPeople.table.querySelector("thead").addEventListener("click", function () { decorate(); });

  var agentBox = el("div", { class: "dp-agents" });
  var agentTableBox = el("div"), agentSide = el("div", { class: "s-col", style: { "--gap": "12px" } });
  agentBox.appendChild(agentTableBox); agentBox.appendChild(agentSide); $("#dp-field-agents").appendChild(agentBox);
  var tAgents = S.ui.table(agentTableBox, agentCols, { rows: ranked, sortKey: "id", sortDir: "asc", compact: true, caption: "Round 4 outcomes, machine-readable",
    onRow: function (r) { select(r.id, { scroll: true, hash: true }); }, empty: { title: "No outcomes match", text: "Clear the search or pick another category." } });

  function decorate() {
    var rows = [].slice.call(tPeople.table.querySelectorAll("tbody tr"));
    [].slice.call(tPeople.table.querySelectorAll(".dp-line-row")).forEach(function (r) { r.remove(); });
    var th = peopleCols[0]._th, th2 = peopleCols[2]._th, byRank = th.hasAttribute("aria-sort") || th2.hasAttribute("aria-sort");
    var prev = null, lim = state.fieldAll ? 1e9 : FIELD_LIM, k = 0;
    rows.forEach(function (tr) {
      var c = tr.querySelector(".dp-ptitle-cell"); if (!c) return;
      tr.hidden = k++ >= lim; if (tr.hidden) return;
      tr.classList.toggle("is-selected", c.dataset.pid === state.sel);
      var rk = +c.dataset.rank;
      if (byRank && prev != null && (prev <= R.slots) !== (rk <= R.slots)) {
        var td = el("td", { attrs: { colspan: String(peopleCols.length) } }, el("div", { class: "dp-linemark", text: "Funding line · " + R.slots + " slots · " + F.num(CUT, 3) }));
        tr.parentNode.insertBefore(el("tr", { class: "dp-line-row", attrs: { "aria-hidden": "true" } }, td), tr);
      }
      prev = rk;
    });
  }

  var FIELD_LIM = matchMedia("(max-width: 640px)").matches ? 10 : 12; // desktop: the 8 funded ranks + the 4 closest below the line
  function limitRows(table) {
    var lim = state.fieldAll ? 1e9 : FIELD_LIM;
    [].slice.call(table.querySelectorAll("tbody tr")).forEach(function (tr, i) { if (tr.querySelector(".s-empty")) return; tr.hidden = i >= lim; });
  }
  function fieldMore(n) {
    var b = $("#dp-field-more");
    b.hidden = n <= FIELD_LIM;
    b.textContent = state.fieldAll ? "Show the top " + FIELD_LIM : "Show all " + n + " outcomes";
  }
  $("#dp-field-more").addEventListener("click", function () { state.fieldAll = !state.fieldAll; renderField(); if (!state.fieldAll) $("#field").scrollIntoView({ block: "start" }); });
  tAgents.table.querySelector("thead").addEventListener("click", function () { limitRows(tAgents.table); });

  function manifest(rows) {
    var shown = rows.slice(0, 3);
    var obj = {
      market: M.address, id: 2841, chain: { name: "OP Mainnet", chainId: 10 }, type: "scalar", markets: 40, collateral: "sUSDS",
      question: M.question, range: [0, 10], payout: "UP = score / 10; DOWN = 1 - UP",
      tradingCloses: R.closes, panelReveal: R.panelReveal, oracle: "Reality.eth", arbitrator: "Kleros",
      outcomes: shown.map(function (p) { return { id: p.id, up: F.addr(p._up, 4), down: F.addr(p._down, 4), upPrice: p.deep.up, sd: p.deep.consensusSd }; })
    };
    var pre = el("pre", { class: "dp-code", attrs: { tabindex: "0", "aria-label": "Market manifest" } });
    function t(s, cls) { pre.appendChild(cls ? el("span", { class: cls, text: s }) : document.createTextNode(s)); }
    function walk(v, ind, inline) {
      if (Array.isArray(v)) {
        if (inline || v.every(function (x) { return typeof x !== "object"; })) { t("["); v.forEach(function (x, i) { walk(x, ind, true); if (i < v.length - 1) t(", "); }); t("]"); return; }
        t("[");
        v.forEach(function (x, i) { t("\n" + ind + "  "); walk(x, ind + "  ", true); if (i < v.length - 1 || rows.length > shown.length) t(","); });
        if (rows.length > shown.length) { t("\n" + ind + "  "); t("// … " + (rows.length - shown.length) + " more outcomes", "c"); }
        t("\n" + ind + "]"); return;
      }
      if (v && typeof v === "object") {
        var ks = Object.keys(v); t(inline ? "{ " : "{");
        ks.forEach(function (k, i) { if (!inline) t("\n" + ind + "  "); t('"' + k + '"', "k"); t(": "); walk(v[k], ind + "  ", inline); if (i < ks.length - 1) t(inline ? ", " : ","); });
        t(inline ? " }" : "\n" + ind + "}"); return;
      }
      if (typeof v === "number") t(String(v), "n"); else t('"' + String(v) + '"', "s");
    }
    walk(obj, "", false);
    var full = JSON.stringify({ market: M.address, chainId: 10, collateral: "sUSDS", sample: true, outcomes: rows.map(function (p) { return { id: p.id, up: p._up, down: p._down, upPrice: p.deep.up }; }) });
    return { pre: pre, full: full };
  }
  function renderAgentsSide(rows) {
    S.clear(agentSide);
    var mf = manifest(rows);
    agentSide.appendChild(el("div", { class: "dp-codehead" }, el("div", {}, el("h3", { class: "t-title", text: "Market manifest" }), el("p", { class: "t-meta", text: "Illustrative schema. Agents read the same market people do; there is no private feed." })),
      el("button", { class: "s-btn s-btn--sm s-btn--ghost", attrs: { type: "button", "data-copy": mf.full }, html: S.icon("copy", 14) + "<span>Copy JSON</span>" })));
    agentSide.appendChild(mf.pre);
    var csv = "id,score\n" + rows.slice(0, 4).map(function (p) { return p.id + "," + sc(p.deep.marketScore); }).join("\n") + (rows.length > 4 ? "\n…" : "");
    agentSide.appendChild(el("div", { class: "dp-codehead" }, el("div", {}, el("h3", { class: "t-title", text: "Predictions CSV" }), el("p", { class: "t-meta", text: "What an agent uploads before it executes a strategy." }))));
    agentSide.appendChild(el("pre", { class: "dp-code", text: csv }));
  }

  function renderField() {
    var rows = filtered(), agents = state.view === "agents";
    $("#dp-field-people").hidden = agents; $("#dp-field-agents").hidden = !agents;
    if (agents) { tAgents.update(rows); limitRows(tAgents.table); renderAgentsSide(rows); } else { tPeople.update(rows); decorate(); }
    fieldMore(rows.length);
    $("#dp-field-note").textContent = (rows.length > FIELD_LIM && !state.fieldAll ? "Top " + FIELD_LIM + " of " + rows.length + " shown. " : "Showing " + rows.length + " of 40. ") + (agents
      ? "Prices are per token in sUSDS; UP + DOWN always redeem for 1. σ is the spread across forecasters."
      : "Forecast = the market's expected panel score (UP price × 10). ± is the spread across forecasters. P(funded) comes from the Opportunity shortlist market #2842.");
  }

  /* ---------------- 4. proposal ---------------- */
  function hist(p) {
    var r = D.rng("dp-h:" + p.id), n = 90, out = [], end = p.deep.marketScore, x = clamp(end + (r() - .5) * 1.8, 0, 10);
    for (var i = 0; i < n; i++) { var left = n - 1 - i; x += (end - x) * (left ? 1 / (left + 8) : 1) + (left ? gauss(r) * .07 : 0); out.push([D.now - left * (30 * DAY / (n - 1)), rnd(clamp(x, 0, 10), 3)]); }
    out[n - 1][1] = end; return out;
  }
  function domFor(p) {
    var c = p.deep.forecasts.reduce(function (lo, f) { return Math.min(lo, f.mean - 2.6 * f.sd); }, p.deep.marketScore - 3 * p.deep.consensusSd);
    return [Math.max(0, Math.floor(Math.min(c, CUT - 1.2))), 10];
  }
  (function chartSeg() { $("#dp-p-seg").appendChild(S.ui.seg([["dist", "Distribution"], ["time", "Over time"]], "dist", function (v) { state.chart = v; renderChart(); }, "Chart view")); })();
  function selP() { return D.proposal(state.sel); }
  function renderChart() {
    var p = selP(), box = S.clear($("#dp-p-chart")), dom = domFor(p);
    var f = p.deep.forecasts.filter(function (x) { return x.agent === state.compare; })[0] || p.deep.forecasts[0], a = agentById[f.agent];
    if (state.chart === "dist") {
      $("#dp-p-chartnote").textContent = "Market consensus against " + a.name + ". Move across the chart to read the chance the panel scores at least x.";
      S.chart.dist(box, { curves: [{ name: "Market", mean: p.deep.marketScore, sd: p.deep.consensusSd, color: "var(--c1)" }, { name: a.name, mean: f.mean, sd: f.sd, color: "var(--c2)" }],
        domain: dom, height: 220, markers: [{ x: CUT, label: "Funding line" }], xName: "Panel score", label: "Forecast distribution for " + p.id, xFormat: function (v) { return F.num(v, 1); } });
    } else {
      var h = hist(p), vs = h.map(function (x) { return x[1]; }).concat([CUT]), lo = Math.min.apply(null, vs) - .3, hi = Math.max.apply(null, vs) + .3;
      $("#dp-p-chartnote").textContent = "Market forecast (UP price × 10) over the last 30 days.";
      S.chart.line(box, { series: [{ name: "Market forecast", values: h, color: "var(--c1)" }], height: 220, y: { min: lo, max: hi, format: function (v) { return F.num(v, 1); } },
        refs: [{ y: CUT, label: "Funding line" }], label: "Forecast history for " + p.id });
    }
  }
  function renderForest() {
    var p = selP(), dom = domFor(p), box = S.clear($("#dp-forest"));
    var pos = function (v) { return ((clamp(v, dom[0], dom[1]) - dom[0]) / (dom[1] - dom[0]) * 100).toFixed(2) + "%"; };
    var fs = p.deep.forecasts.slice().sort(function (a, b) { return b.mean - a.mean; });
    fs.forEach(function (f) {
      var a = agentById[f.agent], diff = f.mean - p.deep.marketScore;
      var row = el("button", { class: "dp-frow", attrs: { type: "button", "aria-pressed": String(f.agent === state.compare), "aria-label": a.name + ": " + sc(f.mean) + " ± " + sc(f.sd) + ", compare in chart" } },
        el("span", { class: "dp-frow__who" }, S.ui.avatar("deep", "sm"), el("span", { text: a.name }), el("span", { class: "s-tag", text: a.tier })),
        el("span", { class: "dp-frow__track", attrs: { "aria-hidden": "true" } },
          el("i", { class: "dp-frow__iv", style: { left: pos(f.mean - f.sd), width: "calc(" + pos(f.mean + f.sd) + " - " + pos(f.mean - f.sd) + ")" } }),
          el("i", { class: "dp-frow__mkt", style: { left: pos(p.deep.marketScore) } }),
          el("i", { class: "dp-frow__dot", style: { left: pos(f.mean) } })),
        el("span", { class: "dp-frow__v", text: sc(f.mean) }),
        el("span", { class: "dp-frow__d " + (diff > 0 ? "t-pos" : diff < 0 ? "t-neg" : "t-3"), text: F.signedNum(diff, 2) }));
      row.addEventListener("click", function () { state.compare = f.agent; state.compareUser = true; state.chart = "dist"; S.$$("#dp-p-seg button").forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === 0)); }); renderForest(); renderChart(); });
      box.appendChild(row);
    });
    var ax = el("div", { class: "dp-faxis", attrs: { "aria-hidden": "true" } }, el("span", { class: "t-meta", text: "Score" }));
    var t = el("div", { class: "dp-faxis__t" });
    for (var v = Math.ceil(dom[0]); v <= dom[1]; v++) t.appendChild(el("span", { text: String(v), style: { left: pos(v) } }));
    ax.appendChild(t); ax.appendChild(el("span")); ax.appendChild(el("span"));
    box.appendChild(ax);
  }
  function renderDetail(opt) {
    var p = selP(), above = p.deep.rank <= R.slots, near = Math.abs(p.deep.marketScore - CUT) < .1;
    $("#dp-p-spec").textContent = "Outcome " + p.id + " · rank " + p.deep.rank + " of 40";
    $("#dp-p-title").textContent = p.title;
    $("#dp-p-meta").textContent = p.team + " · " + p.category + " · asks " + F.num(p.ask) + " sDAI";
    var tags = S.clear($("#dp-p-tags"));
    tags.appendChild(el("span", { class: "s-tag " + (above ? "s-tag--violet" : "s-tag--outline"), text: near ? "On the funding line" : above ? "Above the funding line" : "Below the funding line" }));
    tags.appendChild(S.ui.stateBadge(M.state));
    tags.appendChild(S.ui.verifyBadge(M.verify));
    var st = S.clear($("#dp-p-stats"));
    st.appendChild(S.ui.stat("Forecast", sc(p.deep.marketScore), { unit: "/ 10", delta: p._chg, deltaText: F.signedNum(p._chg, 2), deltaNote: "24h" }));
    st.appendChild(S.ui.stat("Spread", "± " + sc(p.deep.consensusSd), { note: p.deep.forecasts.length + " agents with positions" }));
    st.appendChild(S.ui.stat("Clears the line", F.pct0(p._clear), { note: "Line at " + F.num(CUT, 3) }));
    st.appendChild(S.ui.stat("UP price", F.cents(p.deep.up), { note: "DOWN " + F.cents(p.deep.down) }));
    renderChart(); renderForest();
    var links = S.clear($("#dp-links"));
    function link(app, label, big, note, go, href) {
      return el("a", { class: "dp-link", href: href }, el("span", { class: "dp-link__app", html: S.glyph(app) }, el("span", { text: label })), el("b", { text: big }), el("span", { class: "t-meta", text: note }),
        el("span", { class: "dp-link__go" }, go, el("span", { html: S.icon("arrow-right", 13) })));
    }
    links.appendChild(link("opportunity", "Opportunity · #2842", F.pct0(p.opp.pSelect), "Chance the panel funds " + p.id, "Open the shortlist", "../opportunity/#" + p.id));
    links.appendChild(link("futarchy", "Futarchy · " + fut.id, F.signed(fut.impact), "Forecast LAT price effect if the Round 4 budget passes", "Open the decision", "../futarchy/#" + fut.id));
    links.appendChild(link("app", "App · #2841", F.usd(M.volume) + " Vol.", "Contract, event log and holders for this market", "Open in the explorer", "../app/#m=2841"));
    var kv = S.clear($("#dp-kv"));
    kv.appendChild(S.ui.kv([
      ["Market", S.ui.addr(M.address, { href: "../app/#m=2841", what: "market address" })],
      ["UP token · " + p.id, S.ui.addr(p._up, { what: "UP token address" })],
      ["DOWN token · " + p.id, S.ui.addr(p._down, { what: "DOWN token address" })],
      ["Condition ID", S.ui.addr(M.conditionId, { chars: 6, what: "condition ID" })],
      ["Reality.eth question", S.ui.addr(M.questionId, { chars: 6, what: "question ID" })],
      ["Oracle · arbitrator", "Reality.eth · Kleros"],
      ["Chain · collateral", el("span", { class: "s-row", style: { "--gap": "10px" } }, S.ui.chainBadge(M.chain), el("span", { text: "sUSDS" }))],
      ["Positions", "ERC-1155 wrapped as ERC-20"]
    ]));
    renderTicket();
    renderPayout();
    if (opt && opt.ticket) { var t = $("#dp-ticket input"); if (t) setTimeout(function () { t.focus({ preventScroll: true }); }, 450); }
  }
  function renderTicket() {
    var p = selP(), box = S.clear($("#dp-ticket"));
    var pm = { id: "2841", appId: "deep", collateral: "sUSDS", volume: p._vol, liquidity: p._liq, question: p.title,
      outcomes: [{ name: "UP · " + p.id, price: p.deep.up }, { name: "DOWN · " + p.id, price: p.deep.down }] };
    var fv = p.deep.marketScore;
    S.ui.ticket(box, { market: pm, outcomes: [0, 1], selected: state.side, chips: [1, 5, 20, 100], slippage: .01, title: p.id + " panel score: " + p.title,
      payout: function (o, sh, amt, k) { // a scalar share redeems score ÷ 10, so show the payout at the forecast, per point, and at the top
        var up = k === 0, at = sh * (up ? fv / 10 : 1 - fv / 10);
        var x = at / amt - 1;
        return [["At the forecast (" + F.num(fv, 2) + ")", F.tok(at, "sUSDS") + " (" + (Math.abs(x) < .005 ? "±0%" : F.signed(x, 0)) + ")"], ["Each panel point " + (up ? "up" : "down"), "+" + F.tok(sh / 10, "sUSDS")], ["Max (at " + (up ? "10" : "0") + ")", F.tok(sh, "sUSDS")]];
      },
      note: "Pay with sUSDS on OP Mainnet. UP redeems the score ÷ 10, DOWN the rest. Sample prices; nothing is traded." });
    var go = el("a", { class: "s-link t-meta dp-tlink", href: "#resolve" }, "Payout at any score");
    go.addEventListener("click", function (e) { e.preventDefault(); $("#resolve").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); });
    box.appendChild(go);
  }
  function select(id, opt) {
    opt = opt || {};
    if (!D.proposal(id)) return;
    state.sel = id;
    if (!state.compareUser) state.compare = defaultCompare(D.proposal(id));
    renderDetail(opt); decorate();
    var i = -1; ridge.rows.forEach(function (p, k) { if (p.id === id) i = k; }); if (i >= 0) ridgeOn(i);
    if (opt.hash) try { history.replaceState(null, "", "#" + id); } catch (e) { /* file:// in some browsers */ }
    if (opt.scroll) $("#proposal").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  /* ---------------- 5. funding signal ---------------- */
  (function sigSeg() { $("#dp-sig-seg").appendChild(S.ui.seg([["likely", "Most likely"], ["contested", "Contested first"]], "likely", function (v) { state.sigSort = v; renderSignal(); }, "Sort")); })();
  var SIG = [["Likely", "80%+", "var(--c1)"], ["Contested", "20–80%", "var(--seq-3)"], ["Unlikely", "under 20%", "var(--c-other)"]];
  (function sigLegend() { var lg = $("#dp-sig-legend"); SIG.forEach(function (s) { lg.appendChild(el("span", {}, el("i", { style: { background: s[2] } }), s[0] + " " + s[1])); }); })();
  var thr = $("#dp-thr");
  function thrFill() { thr.style.setProperty("--v", ((state.thr - 6) / 3.5 * 100).toFixed(1) + "%"); }
  thr.addEventListener("input", function () { state.thr = +thr.value; renderSignal(); });
  $("#dp-sig-more").addEventListener("click", function () { state.sigAll = !state.sigAll; renderSignal(); });
  function renderSignal() {
    var T = state.thr; thrFill();
    var Tt = Math.abs(T - CUT) < .003 ? F.num(CUT, 3) : F.num(T, 2);
    $("#dp-thr-val").textContent = Tt + (Math.abs(T - CUT) < .003 ? " · funding line" : "");
    $("#dp-sig-title").textContent = "Chance of scoring " + Tt + " or more";
    var rows = props.map(function (p) { return { p: p, v: pAbove(p, T) }; });
    var exp = rows.reduce(function (a, r) { return a + r.v; }, 0);
    var likely = rows.filter(function (r) { return r.v >= .8; }), cont = rows.filter(function (r) { return r.v >= .2 && r.v < .8; });
    var ask50 = rows.filter(function (r) { return r.v >= .5; }).reduce(function (a, r) { return a + r.p.ask; }, 0), n50 = rows.filter(function (r) { return r.v >= .5; }).length;
    var st = S.clear($("#dp-sig-stats"));
    st.appendChild(S.ui.stat("Expected to reach it", F.num(exp, 1), { unit: "of 40" }));
    st.appendChild(S.ui.stat("Likely · 80%+", String(likely.length), { note: likely.length > R.slots ? "More than 8 slots" : "Within 8 slots" }));
    st.appendChild(S.ui.stat("Contested · 20–80%", String(cont.length), { note: "Worth a second read" }));
    var over = ask50 - R.budget;
    st.appendChild(S.ui.stat("Grant asks at 50%+", F.compact(ask50, 1), { unit: "sDAI", note: n50 + " proposals · " + (over > 0 ? F.compact(over, 1) + " over budget" : F.compact(-over, 1) + " under budget") }));
    if (state.sigSort === "likely") rows.sort(function (a, b) { return b.v - a.v; });
    else rows.sort(function (a, b) { return Math.abs(a.v - .5) - Math.abs(b.v - .5); });
    var show = state.sigAll ? rows : rows.slice(0, 12);
    var box = S.clear($("#dp-sig-bars"));
    var bars = S.chart.bars(box, show.map(function (r) {
      return { label: r.p.id + " · " + r.p.title, value: r.v, color: r.v >= .8 ? SIG[0][2] : r.v >= .2 ? SIG[1][2] : SIG[2][2], note: "P(score ≥ " + Tt + ")" };
    }), { max: 1, format: F.pct0 });
    [].slice.call(bars.children).forEach(function (row, i) {
      var id = show[i].p.id; row.setAttribute("role", "button"); row.setAttribute("aria-label", show[i].p.id + " " + F.pct0(show[i].v) + ", open proposal");
      row.style.cursor = "pointer";
      row.addEventListener("click", function () { select(id, { scroll: true, hash: true }); });
      row.addEventListener("keydown", function (e) { if (e.key === "Enter") select(id, { scroll: true, hash: true }); });
    });
    $("#dp-sig-more").textContent = state.sigAll ? "Show top 12" : "Show all 40";
  }

  /* ---------------- 6. strategy ---------------- */
  $("#dp-edge").appendChild(S.ui.seg([[.1, "0.10 pts"], [.25, "0.25 pts"], [.5, "0.50 pts"]], .25, function (v) { state.minEdge = v; renderStrategy(); }, "Minimum edge"));
  $("#dp-budget").addEventListener("input", function (e) { state.budget = clamp(parseFloat(String(e.target.value).replace(/[^0-9.]/g, "")) || 0, 0, 1e7); renderStrategy(); });
  $("#dp-sample-preds").addEventListener("click", function () {
    var r = D.rng("dp-sample-preds"), preds = {};
    props.forEach(function (p) { preds[p.id] = rnd(clamp(p.deep.marketScore + gauss(r) * .45, 0, 10), 2); });
    state.preds = preds; state.predSrc = "Sample predictions · 40 rows"; state.predErr = []; renderStrategy();
    S.toast("Loaded 40 sample predictions.", "check");
  });
  function normId(s) { var m = /^\s*"?P\s*-?\s*0*(\d{1,2})"?\s*$/i.exec(s); if (!m) return null; var n = +m[1]; return n >= 1 && n <= 40 ? "P-" + pad2(n) : null; }
  function parseCsv(text, name) {
    if (/\u0000/.test(text)) return { err: "That file is not plain text." };
    var lines = text.split(/\r?\n/), preds = {}, errs = [], n = 0, dup = 0;
    if (lines.length > 600) return { err: "Too many rows (600 max)." };
    lines.forEach(function (ln, i) {
      if (!ln.trim()) return;
      var cells = ln.split(/[,;\t]/);
      if (i === 0 && isNaN(parseFloat(cells[1]))) return; // header
      var id = normId(cells[0] || ""), v = parseFloat(String(cells[1] || "").replace(/"/g, ""));
      if (!id) { errs.push("line " + (i + 1) + ": unknown id"); return; }
      if (!isFinite(v) || v < 0 || v > 10) { errs.push("line " + (i + 1) + ": score must be 0 to 10"); return; }
      if (preds[id] != null) dup++;
      preds[id] = rnd(v, 3); n++;
    });
    if (!n) return { err: "No valid rows. Expected two columns: id,score." };
    var uniq = Object.keys(preds).length;
    return { preds: preds, errs: errs, src: String(name || "predictions.csv").slice(0, 60) + " · " + uniq + " predictions" + (dup ? " (" + dup + " repeated id" + (dup > 1 ? "s" : "") + ", last value kept)" : "") };
  }
  function loadFile(file) {
    if (!file) return;
    if (file.size > 64 * 1024) { S.toast("That file is over 64 KB. A Round 4 CSV is about 1 KB.", "alert"); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var res = parseCsv(String(fr.result || ""), file.name);
      if (res.err) { S.toast(res.err, "alert"); return; }
      state.preds = res.preds; state.predSrc = res.src; state.predErr = res.errs; renderStrategy();
      S.toast("Read " + Object.keys(res.preds).length + " predictions in your browser.", "check");
    };
    fr.onerror = function () { S.toast("Could not read that file.", "alert"); };
    fr.readAsText(file);
  }
  (function dropzone() {
    var dz = $("#dp-drop"), fi = $("#dp-file");
    fi.addEventListener("change", function () { loadFile(fi.files && fi.files[0]); fi.value = ""; });
    ["dragenter", "dragover"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("is-over"); }); });
    dz.addEventListener("drop", function (e) { loadFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  })();
  function csvCell(s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function download(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    var a = el("a", { href: url, attrs: { download: name } }); document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
    S.toast("Downloaded " + name, "download");
  }
  $("#dp-template").addEventListener("click", function () { download("deep-2841-predictions-template.csv", "id,score\n" + props.map(function (p) { return p.id + ","; }).join("\n") + "\n"); });
  $("#dp-export").addEventListener("click", function () {
    var tot = props.reduce(function (a, p) { return a + p.deep.marketScore; }, 0);
    var out = "id,title,forecast,up,down,weight,p_funded,sample\n" + ranked.map(function (p) {
      return [p.id, csvCell(p.title), p.deep.marketScore, p.deep.up, p.deep.down, rnd(p.deep.marketScore / tot, 5), p.opp.pSelect, "true"].join(",");
    }).join("\n") + "\n";
    download("deep-2841-market-weights-SAMPLE.csv", out);
  });
  var stratCols = [
    { key: "id", label: "Outcome", sort: function (r) { return r.p.deep.rank; }, render: function (r) { return el("div", { class: "dp-ptitle-cell" }, el("b", { text: r.p.id }), el("span", { class: "u-clamp-1", text: r.p.title })); } },
    { key: "yours", label: "Yours", num: true, sort: function (r) { return r.yours; }, render: function (r) { return sc(r.yours); } },
    { key: "mkt", label: "Market", num: true, class: "s-hide-sm", sort: function (r) { return r.p.deep.marketScore; }, render: function (r) { return el("span", { class: "t-2", text: sc(r.p.deep.marketScore) }); } },
    { key: "edge", label: "Edge", num: true, sort: function (r) { return Math.abs(r.edge); }, render: function (r) { return signedPts(r.edge); } },
    { key: "side", label: "Order", render: function (r) { return el("span", { class: "s-tag dp-side dp-side--" + (r.up ? "up" : "down"), text: r.up ? "Buy UP" : "Buy DOWN" }); } },
    { key: "px", label: "Avg price", num: true, class: "s-hide-sm", render: function (r) { return F.cents(r.avg); } },
    { key: "size", label: "Size", num: true, sort: function (r) { return r.size; }, render: function (r) { return F.num(r.size, 2); } }
  ];
  var stratTable = null, POOL_CAP = .2;
  function renderStrategy() {
    var st = S.clear($("#dp-strat-stats")), box = $("#dp-strat-table"), exec = $("#dp-exec");
    var src = S.clear($("#dp-strat-src"));
    if (!state.preds) {
      src.textContent = "No predictions loaded.";
      st.appendChild(S.ui.stat("Orders", "—")); st.appendChild(S.ui.stat("Spend", "—")); st.appendChild(S.ui.stat("Average edge", "—")); st.appendChild(S.ui.stat("Expected P&L", "—"));
      S.clear(box).appendChild(S.ui.empty({ title: "Nothing to preview yet", text: "Drop a CSV of your scores, or use the sample set, to see the batch your trade wallet would send.", motif: "waves", motifOpts: { count: 4, stroke: 46 } }));
      stratTable = null; exec.disabled = true; return;
    }
    src.appendChild(document.createTextNode(state.predSrc));
    if (state.predErr.length) src.appendChild(el("span", { class: "dp-errs", text: " · " + state.predErr.length + " skipped (" + state.predErr.slice(0, 3).join("; ") + (state.predErr.length > 3 ? "; …" : "") + ")" }));
    var all = Object.keys(state.preds).map(function (id) {
      var p = D.proposal(id), y = state.preds[id], edge = rnd(y - p.deep.marketScore, 3);
      return { p: p, yours: y, edge: edge, up: edge > 0, price: edge > 0 ? p.deep.up : p.deep.down };
    });
    var trades = all.filter(function (r) { return Math.abs(r.edge) >= state.minEdge - 1e-9; });
    var tot = trades.reduce(function (a, r) { return a + Math.abs(r.edge); }, 0) || 1, pnl = 0, spend = 0, capped = 0;
    trades.forEach(function (r) {
      var want = state.budget * Math.abs(r.edge) / tot, cap = r.p._liq * POOL_CAP;
      if (want > cap) capped++;
      r.size = rnd(Math.min(want, cap), 2); spend += r.size;
      r.avg = Math.min(.995, r.price * (1 + .5 * r.size / Math.max(1, r.p._liq))); // illustrative price impact
      var ev = r.up ? r.yours / 10 : 1 - r.yours / 10; pnl += r.size / r.avg * ev - r.size;
    });
    var avg = trades.length ? trades.reduce(function (a, r) { return a + Math.abs(r.edge); }, 0) / trades.length : 0;
    st.appendChild(S.ui.stat("Orders", String(trades.length), { note: "of " + all.length + " predictions" }));
    st.appendChild(S.ui.stat("Spend", F.num(spend, 0), { unit: "sUSDS", note: capped ? capped + " capped at " + Math.round(POOL_CAP * 100) + "% of pool" : "of " + F.num(state.budget, 0) + " budget" }));
    st.appendChild(S.ui.stat("Average edge", F.num(avg, 2), { unit: "pts" }));
    st.appendChild(el("div", { class: "s-stat" }, el("div", { class: "s-stat__label", text: "Expected P&L" }), el("div", { class: "s-stat__value " + (pnl >= 0 ? "t-pos" : "t-neg") }, F.signedNum(pnl, 2), el("small", { text: "sUSDS" })), el("div", { class: "t-meta", text: "If your scores are right" })));
    if (!stratTable) { S.clear(box); stratTable = S.ui.table(box, stratCols, { rows: trades, sortKey: "edge", sortDir: "desc", compact: true, caption: "Orders in this batch", empty: { title: "No orders at this edge", text: "Lower the minimum edge to trade more of the field." } }); }
    else stratTable.update(trades);
    state.orders = trades.length;
    exec.disabled = !trades.length || !state.budget;
  }
  $("#dp-exec").addEventListener("click", function () {
    S.toast("Sample only: " + state.orders + " orders would go out as one batch from your trade wallet. Nothing was sent.", "info");
  });

  /* ---------------- 7. leaderboard ---------------- */
  function tierTag(t) { return el("span", { class: "s-tag" + (t === "Elite" ? " s-tag--solid" : t === "Great" ? " s-tag--violet" : ""), text: t }); }
  function scoreCell(s) { return el("span", { class: "dp-scorecell" }, el("span", { class: "s-pbar", style: { "--p": String(s / 100) } }, el("i")), el("b", { class: "t-num", text: String(s) })); }
  function pnlCell(v) { return el("span", { class: v > 0 ? "t-pos" : v < 0 ? "t-neg" : "t-3", text: F.signedNum(v, 0) }); }
  var lbCols = [
    [
      { key: "rank", label: "#", width: "44px", render: function (r) { return el("span", { class: "dp-rank", text: pad2(r._rank) }); } },
      { key: "name", label: "Agent", sort: function (r) { return r.name; }, render: function (r) { return el("span", { class: "dp-lbname" }, el("b", { text: r.name }), el("span", { text: r.operator })); } },
      { key: "traderScore", label: "Trader Score", num: true, sort: true, render: function (r) { return scoreCell(r.traderScore); } },
      { key: "tier", label: "Tier", class: "s-hide-sm", render: function (r) { return tierTag(r.tier); } },
      { key: "brier", label: "Brier", num: true, sort: true, class: "s-hide-sm", render: function (r) { return F.num(r.brier, 3); } },
      { key: "trades", label: "Trades", num: true, sort: true, class: "s-hide-sm", render: function (r) { return F.num(r.trades); } },
      { key: "pnl", label: "P&L", num: true, sort: true, render: function (r) { return pnlCell(r.pnl); } },
      { key: "lastActive", label: "Active", num: true, class: "s-hide-sm", render: function (r) { return el("span", { class: "t-3", text: F.ago(r.lastActive) }); } }
    ],
    [
      { key: "rank", label: "#", width: "44px", render: function (r) { return el("span", { class: "dp-rank", text: pad2(r._rank) }); } },
      { key: "handle", label: "Trader", sort: function (r) { return r.handle; }, render: function (r) { return el("span", { class: "dp-lbname" }, el("b", { text: r.handle }), el("span", { text: F.addr(r.address, 4) })); } },
      { key: "traderScore", label: "Trader Score", num: true, sort: true, render: function (r) { return scoreCell(r.traderScore); } },
      { key: "tier", label: "Tier", class: "s-hide-sm", render: function (r) { return tierTag(r.tier); } },
      { key: "volume", label: "Volume", num: true, sort: true, class: "s-hide-sm", render: function (r) { return F.usd(r.volume); } },
      { key: "markets", label: "Markets", num: true, sort: true, class: "s-hide-sm", render: function (r) { return String(r.markets); } },
      { key: "pnl", label: "P&L", num: true, sort: true, render: function (r) { return pnlCell(r.pnl); } }
    ]
  ];
  var lbData = [D.agents.slice(), D.traders.slice()];
  lbData.forEach(function (list) { list.sort(function (a, b) { return b.traderScore - a.traderScore; }).forEach(function (r, i) { r._rank = i + 1; }); });
  var lbTable = null;
  S.ui.tabs($("#dp-lb-tabs"), [{ label: "Agents", count: D.agents.length }, { label: "People", count: D.traders.length }], function (t, i) { state.lb = i; lbTable = null; renderLb(); }, 0);
  function renderLb() {
    var q = state.q.trim().toLowerCase(), list = lbData[state.lb].filter(function (r) { return !q || ((r.name || r.handle) + " " + (r.operator || "")).toLowerCase().indexOf(q) > -1; });
    if (!lbTable) { var box = S.clear($("#dp-lb")); lbTable = S.ui.table(box, lbCols[state.lb], { rows: list, sortKey: "traderScore", sortDir: "desc", compact: true, caption: state.lb ? "People leaderboard" : "Agent leaderboard", empty: { title: "No one matches", text: "Clear the search to see the full leaderboard." } }); }
    else lbTable.update(list);
  }

  /* ---------------- 8. resolution ---------------- */
  $("#dp-timeline").appendChild(S.ui.timeline([
    { label: "Market created", done: true, time: M.created },
    { label: "Trading", current: true, note: "Now" },
    { label: "Trading closes", time: R.closes },
    { label: "Panel publishes", time: R.panelReveal },
    { label: "Answer on Reality.eth", note: "Bonded" },
    { label: "Dispute window", note: "Kleros" },
    { label: "Redeem", note: "UP = score ÷ 10" }
  ]));
  (function how() {
    var box = $("#dp-how");
    [["01", "What is forecast", "The mean of five reviewers' scores for each proposal, from 0 to 10. Each proposal is one outcome with an UP and a DOWN token, and one UP plus one DOWN always redeem for 1 sUSDS."],
     ["02", "Who reports the answer", "When the panel publishes on " + F.dayMon(R.panelReveal) + ", anyone can post the scores to Reality.eth with a bond. A wrong answer can be challenged with a higher bond, and Kleros jurors settle disputes."],
     ["03", "If it cannot resolve", "If the panel never publishes, reporters can answer the question as invalid. The market then settles under its invalid rule instead of on a guessed score."]
    ].forEach(function (h) { box.appendChild(el("div", { class: "s-card s-card--pad dp-how" }, el("span", { class: "dp-how__n", text: h[0] }), el("h3", { class: "t-title", text: h[1] }), el("p", { text: h[2] }))); });
  })();
  var payBox = $("#dp-payout"), payRange, payVal, payOut, payHead;
  (function payoutInit() {
    payHead = el("div", { class: "s-row s-row--between" }, el("h3", { class: "t-title", text: "Try a payout" }));
    payVal = el("b", { class: "t-amount t-num" });
    payRange = el("input", { class: "s-range", attrs: { type: "range", min: "0", max: "10", step: "0.05", value: String(state.pay), "aria-label": "Panel score" } });
    payRange.addEventListener("input", function () { state.pay = +payRange.value; renderPayout(); });
    payOut = el("div", { class: "s-col", style: { "--gap": "14px" } });
    payBox.appendChild(payHead);
    payBox.appendChild(el("div", { class: "s-row s-row--between" }, el("label", { class: "t-ui t-2", attrs: { for: "dp-pay-range", id: "dp-pay-label" } }), payVal));
    payRange.id = "dp-pay-range";
    payBox.appendChild(payRange); payBox.appendChild(payOut);
  })();
  function renderPayout() {
    var p = selP(), s = state.pay, upV = s / 10, dnV = 1 - upV, stake = 100;
    $("#dp-pay-label").textContent = "If the panel scores " + p.id + " at";
    payVal.textContent = F.num(s, 2);
    payRange.style.setProperty("--v", (s * 10).toFixed(1) + "%");
    var upN = stake / p.deep.up, dnN = stake / p.deep.down, upRet = upN * upV, dnRet = dnN * dnV, res = upRet - stake;
    S.clear(payOut);
    payOut.appendChild(el("div", { class: "dp-payout__res" },
      el("div", { class: "s-pricetile", attrs: { "aria-pressed": "true" } }, el("small", { text: "UP redeems for" }), el("b", { text: F.num(upV, 3) + " sUSDS" })),
      el("div", { class: "s-pricetile" }, el("small", { text: "DOWN redeems for" }), el("b", { text: F.num(dnV, 3) + " sUSDS" }))));
    function line(k, v, cls) { return el("div", { class: "dp-payout__line" }, el("span", { text: k }), el("b", { class: cls || null, text: v })); }
    var lines = el("div", { class: "s-panel s-panel--nested", style: { gap: "10px" } },
      line("Buy 100 sUSDS of UP at", F.cents(p.deep.up)),
      line("UP tokens", F.num(upN, 2)),
      line("Redeemed at " + F.num(s, 2), F.num(upRet, 2) + " sUSDS"),
      line("Result", F.signedNum(res, 2) + " sUSDS (" + F.signed(res / stake, 1) + ")", res >= 0 ? "t-pos" : "t-neg"));
    payOut.appendChild(lines);
    payOut.appendChild(el("p", { class: "t-meta", text: "The same 100 sUSDS on DOWN at " + F.cents(p.deep.down) + " would redeem for " + F.num(dnRet, 2) + " sUSDS. Ignores slippage and fees." }));
  }

  /* ---------------- boot ---------------- */
  renderField(); renderDetail(); renderSignal(); renderStrategy(); renderLb();
  function fromHash(scroll) {
    var m = /^#(P-\d{2})(-payout)?$/i.exec(location.hash || "");
    if (m && D.proposal(m[1].toUpperCase())) {
      select(m[1].toUpperCase(), { scroll: scroll && !m[2] });
      if (m[2]) setTimeout(function () { $("#resolve").scrollIntoView({ block: "start" }); }, 80);
      return true;
    }
    return false;
  }
  if (fromHash(false)) setTimeout(function () { $("#proposal").scrollIntoView({ block: "start" }); }, 60);
  window.addEventListener("hashchange", function () { fromHash(true); });
})();
