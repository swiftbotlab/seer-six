/* Seer homepage (seer.pm concept) — page script.
   Concept by Swift Bot Labs. Not affiliated with Seer. All figures are SAMPLE DATA
   from assets/sample-data.js except the rebrand result (source: "public").
   All text is inserted with textContent (Seer.el). No network, no storage. */
(function () {
  "use strict";
  var S = window.Seer, D = window.SEER_SAMPLE, el = S.el, f = S.fmt;
  var RM = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function $(id) { return document.getElementById(id); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function icon(name, size) { return el("span", { class: "hm-ico", html: S.icon(name, size || 16), attrs: { "aria-hidden": "true" } }); }
  function glyph(id) { return el("span", { html: S.glyph(id), attrs: { "aria-hidden": "true" }, style: { display: "inline-flex" } }); }
  // solid violet ramp for the wedges that are not in focus (kit posters use flat, opaque wedges)
  function ramp(k) {
    var a = [99, 64, 196], b = [52, 38, 99];
    return "rgb(" + a.map(function (v, j) { return Math.round(v + (b[j] - v) * k); }).join(",") + ")";
  }
  function pctSmart(p) { return f.pct(p, p < .1 ? 1 : 0); }
  var TYPE = { "categorical": "Categorical", "multi-categorical": "Multi-categorical", "scalar": "Scalar", "multi-scalar": "Multi-scalar" };
  function tname(m) { return S.ui.typeName ? S.ui.typeName(m) : TYPE[m.type]; }
  var APPS = S.apps.filter(function (a) { return a.id !== "home"; });
  function appLink(id, label) {
    var a = S.app(id);
    return el("a", { class: "hm-pill", href: "../" + a.path }, glyph(id), label || a.name);
  }

  /* ======================================================================
     1. HERO — converging wedges drawn from sample prices
     ====================================================================== */
  var HERO = [
    ["2832", "Categorical", 0, "Each band's width is an outcome's price. A full set of outcome tokens is always worth 1 sDAI, so the prices add up to 1 and every band meets in one point."],
    ["2843", "Yes / No", 0, "A yes/no question is a categorical market with two answers, plus Invalid in case the question cannot be answered as posed."],
    ["2842", "Multi-categorical", "P-07", "Eight proposals will be funded and split the payout, so each price is a share of 1 sDAI, not a chance: chance ≈ price × 8. 41 bands, one point."]
  ];
  function heroPrice() {
    var art = $("hm-price-art"), legend = $("hm-price-legend");
    var svg = S.svgEl("svg", { class: "hm-wedges", "aria-hidden": "true", focusable: "false" });
    var rv = el("b", { class: "hm-readout__v" }), rn = el("span", { class: "hm-readout__n" }), rp = el("span", { class: "hm-readout__p" });
    var read = el("div", { class: "hm-readout", attrs: { "aria-hidden": "true" } }, rv, rn, rp);
    art.appendChild(svg); art.appendChild(read);
    var st = { m: null, items: [], polys: [], texts: [], vp: null, entries: [], pin: 0, hover: null, t: 1, run: 0 };

    function setMarket(cfg, animate) {
      var m = D.market(cfg[0]);
      var outs = m.outcomes.filter(function (o) { return !o.invalid; }).sort(function (a, b) { return b.price - a.price; });
      var inv = m.outcomes.filter(function (o) { return o.invalid; });
      st.m = m; st.items = outs.concat(inv);
      // legend entries: <=5 outcomes -> all; otherwise top 3 + featured + Other + Invalid
      var E = [], n = outs.length;
      if (n <= 5) outs.forEach(function (o, i) { E.push({ label: o.name, rank: i + 1, idx: [i] }); });
      else {
        var feat = -1; outs.forEach(function (o, i) { if (o.proposal === cfg[2]) feat = i; });
        var keep = [0, 1, 2]; if (feat > 2) keep.push(feat); else keep.push(3);
        keep.forEach(function (i) { E.push({ label: outs[i].name, rank: i + 1, idx: [i] }); });
        var rest = []; for (var i = 0; i < n; i++) if (keep.indexOf(i) < 0) rest.push(i);
        E.push({ label: "Other (" + rest.length + ")", rank: null, idx: rest, other: true });
      }
      inv.forEach(function (o, k) { E.push({ label: "Invalid", rank: null, idx: [n + k], invalid: true }); });
      E.forEach(function (e) { e.value = e.idx.reduce(function (a, i) { return a + st.items[i].price; }, 0); });
      st.entries = E;
      st.pin = 0;
      if (typeof cfg[2] === "string") E.forEach(function (e, k) { if (e.idx.length === 1 && st.items[e.idx[0]].proposal === cfg[2]) st.pin = k; });
      st.hover = null;
      // spec line + question + caption
      var sp = $("hm-price-specs"); S.clear(sp);
      ["Mkt #" + m.id, tname(m), D.chain(m.chain).name].forEach(function (x, k) { sp.appendChild(el("span", { text: x, class: k >= 2 ? "s-hide-sm" : null })); });
      $("hm-price-q").textContent = m.question;
      var cap = $("hm-price-cap"); S.clear(cap);
      var sum = st.items.reduce(function (a, o) { return a + o.price; }, 0);
      cap.appendChild(document.createTextNode(cfg[3] + " Sum: " + f.num(sum * 100, 1) + "¢. "));
      cap.appendChild(el("a", { href: "../app/#m=" + m.id, text: "Inspect #" + m.id + " in the App" }));
      buildPolys(); buildLegend(); focus();
      if (animate) run(); else { st.t = 1; draw(); }
    }
    function buildPolys() {
      S.clear(svg); st.polys = []; st.texts = [];
      st.items.forEach(function (o, i) {
        var p = S.svgEl("polygon", {});
        var t = S.svgEl("title"); t.textContent = o.name + " · " + pctSmart(o.price); p.appendChild(t);
        p.addEventListener("pointerenter", function () { st.hover = { idx: [i], one: i }; focus(); });
        svg.appendChild(p); st.polys.push(p);
        var tx = S.svgEl("text", {}); svg.appendChild(tx); st.texts.push(tx);
      });
      st.vp = S.svgEl("g", {});
      st.vp.appendChild(S.svgEl("circle", { r: 13, fill: "none", stroke: "rgba(224,226,245,.35)", "stroke-width": 1 }));
      st.vp.appendChild(S.svgEl("rect", { x: -5, y: -5, width: 10, height: 10, rx: 1.5, fill: "#fff", transform: "rotate(45)" }));
      svg.appendChild(st.vp);
    }
    svg.addEventListener("pointerleave", function () { st.hover = null; focus(); });
    function buildLegend() {
      S.clear(legend);
      legend.classList.toggle("is-single", st.entries.length <= 3);
      st.entries.forEach(function (e, k) {
        var b = el("button", { class: "hm-lg", attrs: { type: "button", "aria-pressed": String(k === st.pin) } },
          el("span", { class: "hm-lg__r", text: e.rank ? pad2(e.rank) : "—" }),
          el("span", { class: "hm-lg__n", text: e.label, title: e.label }),
          el("span", { class: "hm-lg__v", text: st.m && st.m.type === "multi-categorical" ? f.num(e.value * 100, 1) + "¢" : pctSmart(e.value) }));
        b.addEventListener("click", function () { st.pin = k; st.hover = null; S.$$(".hm-lg", legend).forEach(function (x, j) { x.setAttribute("aria-pressed", String(j === k)); }); focus(); });
        b.addEventListener("pointerenter", function () { st.hover = { idx: e.idx, entry: k }; focus(); });
        b.addEventListener("pointerleave", function () { st.hover = null; focus(); });
        b.addEventListener("focus", function () { st.hover = { idx: e.idx, entry: k }; focus(); });
        b.addEventListener("blur", function () { st.hover = null; focus(); });
        legend.appendChild(b);
      });
    }
    function active() {
      if (st.hover) return st.hover;
      return { idx: st.entries[st.pin].idx, entry: st.pin };
    }
    function focus() {
      var a = active(), on = {}, n = st.items.length;
      a.idx.forEach(function (i) { on[i] = 1; });
      st.polys.forEach(function (p, i) {
        var o = st.items[i];
        p.style.fill = o.invalid ? (on[i] ? "#8B86A8" : "#4A4660") : on[i] ? "#8F55F7" : ramp(n > 1 ? i / (n - 1) : 0);
      });
      S.$$(".hm-lg", legend).forEach(function (b, k) { b.classList.toggle("is-on", a.entry === k || (a.one != null && st.entries[k].idx.indexOf(a.one) > -1)); });
      // readout
      var v, name, sub;
      if (a.one != null || a.idx.length === 1) {
        var i = a.one != null ? a.one : a.idx[0], o = st.items[i];
        v = o.price; name = o.name; sub = (o.invalid ? "Invalid" : "Rank " + pad2(i + 1)) + " · " + (o.chance != null && !o.invalid ? "≈" + f.pct0(o.chance) + " chance" : f.num(o.price * 100, 1) + "¢");
      } else {
        var e = st.entries[a.entry]; v = e.value; name = e.label; sub = e.idx.length + " outcomes";
      }
      rv.textContent = st.m && st.m.type === "multi-categorical" ? f.num(v * 100, 1) + "¢" : pctSmart(v); rn.textContent = name; rn.title = name; rp.textContent = sub;
    }
    function draw() {
      var W = art.clientWidth, H = art.clientHeight; if (!W || !H) return;
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      var n = st.items.length, gap = n > 20 ? 1.5 : n > 4 ? 9 : 14, padY = 2;
      var span = H - padY * 2 - gap * (n - 1), tot = st.items.reduce(function (a, o) { return a + o.price; }, 0) || 1;
      var hs = st.items.map(function (o) { return Math.max(1.2, o.price / tot * span); }), hsum = hs.reduce(function (a, b) { return a + b; }, 0);
      hs = hs.map(function (h) { return h * span / hsum; });
      var vx = Math.round(W * (W > 520 ? .7 : W > 400 ? .66 : .62)), vy = H / 2;
      var e = st.t < 1 ? 1 - Math.pow(1 - st.t, 3) : 1, y = padY;
      st.items.forEach(function (o, i) {
        var y0 = y, y1 = y + hs[i], r0 = y0 + (vy - y0) * e, r1 = y1 + (vy - y1) * e;
        st.polys[i].setAttribute("points", "0," + y0.toFixed(2) + " 0," + y1.toFixed(2) + " " + vx + "," + r1.toFixed(2) + " " + vx + "," + r0.toFixed(2));
        var tx = st.texts[i];
        if (hs[i] >= 17 && !o.invalid) { tx.setAttribute("x", 12); tx.setAttribute("y", (y0 + hs[i] / 2 + 3.5).toFixed(1)); tx.textContent = pad2(i + 1); }
        else tx.textContent = "";
        y += hs[i] + gap;
      });
      st.vp.setAttribute("transform", "translate(" + vx + " " + vy + ")");
      st.vp.style.opacity = String(Math.max(0, (e - .7) / .3));
      read.style.left = (vx + 22) + "px";
      read.style.maxWidth = Math.max(60, W - vx - 34) + "px";
      read.style.opacity = String(Math.max(0, (e - .5) / .5));
    }
    function run() {
      var me = ++st.run;
      if (RM || document.visibilityState === "hidden") { st.t = 1; draw(); return; }
      var t0 = null, dur = 950;
      st.t = 0; draw();
      function step(now) {
        if (me !== st.run) return;
        if (t0 == null) t0 = now;
        st.t = Math.min(1, (now - t0) / dur); draw();
        if (st.t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      setTimeout(function () { if (me === st.run && st.t < 1) { st.t = 1; draw(); } }, dur + 300); // rAF can stall in background tabs
    }
    var seg = S.ui.seg(HERO.map(function (h) { return [h[0], h[1]]; }), HERO[0][0], function (id) {
      HERO.forEach(function (h) { if (h[0] === id) setMarket(h, true); });
    }, "Example market");
    $("hm-price-seg").appendChild(seg);
    setMarket(HERO[0], true);
    S.onResize(art, draw);
  }

  /* ======================================================================
     2. ECOSYSTEM MAP — five apps above the building blocks they share
     ====================================================================== */
  var GROUPS = [["markets", "Market types"], ["tokens", "Outcome tokens"], ["truth", "Answers"], ["collateral", "Collateral"], ["chains", "Chains"]];
  var PRIMS = [
    ["markets", "categorical", "Categorical", "One outcome wins. Each outcome has a token, and the prices add up to 1."],
    ["markets", "multi-categorical", "Multi-categorical", "Several outcomes can be true at once. The payout is split between them."],
    ["markets", "scalar", "Scalar", "A number inside a range, traded as a pair of DOWN and UP tokens. Deep runs one per proposal: a score for every entry."],
    ["markets", "multi-scalar", "Multi-scalar", "One token per item, and each redeems its number's share of the total: a share per chain, a weight per dependency."],
    ["markets", "conditional", "Conditional markets", "A market collateralised by another market's outcome token, so it only pays out if that outcome happens. Futarchy is built from these."],
    ["tokens", "ctf", "Conditional Tokens", "Gnosis Conditional Tokens: every outcome is an ERC-1155 position, backed one to one by collateral."],
    ["tokens", "erc20", "ERC-20 wrapping", "Each position is wrapped as an ERC-20, so it trades on ordinary pools and shows up in any wallet."],
    ["truth", "reality", "Reality.eth", "Anyone can answer a market's question by posting a bond. A different answer has to double it."],
    ["truth", "kleros", "Kleros arbitration", "If an answer is contested, Kleros jurors rule on it and the ruling settles the question."],
    ["truth", "curate", "Kleros Curate", "Markets are listed for verification, and anyone can challenge a market that is badly posed."],
    ["collateral", "sDAI", "sDAI", "Savings DAI. Collateral keeps earning the DAI savings rate while it sits in a market."],
    ["collateral", "xDAI", "xDAI", "Gnosis Chain's native token, wrapped to sDAI when it is used as collateral."],
    ["collateral", "sUSDS", "sUSDS", "Savings USDS. It earns the Sky savings rate, which is why Deep uses it on OP Mainnet."],
    ["chains", "ethereum", "Ethereum", "Ethereum mainnet. Seer markets and their outcome tokens live on four chains."],
    ["chains", "optimism", "OP Mainnet", "OP Mainnet, where Deep's high-volume rounds run with low fees."],
    ["chains", "gnosis", "Gnosis", "Gnosis Chain, where Seer started. Most governance and grant markets live here."],
    ["chains", "base", "Base", "Base. The same contracts and the same market format as on the other three chains."]
  ];
  var ALL = PRIMS.map(function (p) { return p[1]; });
  var USES = {
    app: ALL,
    deep: ["scalar", "ctf", "erc20", "reality", "kleros", "sUSDS", "optimism"],
    futarchy: ["categorical", "scalar", "conditional", "ctf", "erc20", "reality", "kleros", "sDAI", "gnosis", "ethereum"],
    opportunity: ["multi-categorical", "ctf", "erc20", "reality", "kleros", "curate", "sDAI", "gnosis"],
    risk: ["multi-categorical", "ctf", "erc20", "reality", "kleros", "sDAI", "ethereum"]
  };
  var APP_LINE = {
    app: ["The explorer for every market", "Every market on every chain, in every type and state, with its contracts, answer, events and holders. A block explorer for questions.", "2832"],
    deep: ["Many outcomes, priced at once", "Rounds of scalar markets on OP Mainnet in sUSDS: one UP/DOWN pair per entry prices a score for every entry in a large field, so forecasting agents can trade hundreds of outcomes in one batch.", "2841"],
    futarchy: ["What a decision would do", "A decision market plus two conditional price markets: the token price if a proposal passes, and if it does not. The gap informs the DAO; the vote still decides.", "2843"],
    opportunity: ["Which entries will be selected", "Multi-categorical markets on which submissions a sponsor will pick. Prices become a triage signal for reviewers, who keep the final say.", "2842"],
    risk: ["Risk you can compare", "A multi-categorical market on which assets of a whole board default this quarter, plus No to All. One deposit prices every asset, so estimates can be compared side by side instead of read as one yes/no price.", "2850"]
  };
  function ecosystem() {
    var appsBox = $("hm-map-apps"), groupsBox = $("hm-layer-groups"), read = $("hm-layer-read");
    $("hm-layer-mark").innerHTML = S.logo("mark");
    var st = { app: "deep", prim: null, pApp: null, pPrim: null };
    var cards = {}, prims = {}, bus = $("hm-map-bus"), lines = {};
    APPS.forEach(function (a) {
      var sel = el("button", { class: "hm-app__sel", attrs: { type: "button", "aria-pressed": "false", "aria-label": a.name + ": show the building blocks it uses" } },
        el("span", { class: "hm-app__top" }, S.ui.avatar(a.id, "ink"), el("span", { class: "hm-app__n", text: a.n })),
        el("span", { class: "hm-app__txt" }, el("span", { class: "hm-app__name", text: a.name }), el("span", { class: "hm-app__blurb", text: a.blurb })));
      var open = el("a", { class: "hm-app__open", href: "../" + a.path, attrs: { "aria-label": "Open " + a.name } }, el("span", { text: "Open" }), el("span", { html: S.icon("arrow-right", 14), style: { display: "inline-flex" } }));
      var card = el("article", { class: "hm-app", data: { app: a.id } }, sel, el("div", { class: "hm-app__foot" }, el("span", { class: "hm-app__host", text: a.host }), open));
      sel.addEventListener("click", function () { st.app = a.id; st.prim = null; render(); reveal(); });
      card.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") { st.pApp = a.id; render(); } });
      card.addEventListener("pointerleave", function () { if (st.pApp) { st.pApp = null; render(); } });
      cards[a.id] = { card: card, sel: sel };
      lines[a.id] = el("i"); bus.appendChild(lines[a.id]);
      appsBox.appendChild(card);
    });
    GROUPS.forEach(function (g) {
      var box = el("div", { class: "hm-group" }, el("h3", { text: g[1] }));
      PRIMS.filter(function (p) { return p[0] === g[0]; }).forEach(function (p) {
        var b = el("button", { class: "hm-prim", attrs: { type: "button", "aria-pressed": "false" } }, el("i"), el("span", { text: p[2] }));
        b.addEventListener("click", function () { st.prim = p[1]; st.app = null; render(); });
        b.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") { st.pPrim = p[1]; render(); } });
        b.addEventListener("pointerleave", function () { if (st.pPrim) { st.pPrim = null; render(); } });
        prims[p[1]] = { btn: b, p: p };
        box.appendChild(b);
      });
      groupsBox.appendChild(box);
    });
    // phones stack the apps above the layer: bring the highlighted blocks into view after a tap
    function reveal() {
      if (!window.matchMedia || !window.matchMedia("(max-width: 960px)").matches) return;
      var layer = groupsBox.parentNode, r = layer.getBoundingClientRect();
      if (r.top > window.innerHeight * .55) layer.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" });
    }
    function render() {
      var appId = st.pApp || (st.pPrim ? null : st.app), primId = st.pApp ? null : (st.pPrim || st.prim);
      APPS.forEach(function (a) {
        var c = cards[a.id];
        c.sel.setAttribute("aria-pressed", String(st.app === a.id));
        c.card.classList.toggle("is-on", appId === a.id);
        c.card.classList.toggle("is-uses", !appId && !!primId && USES[a.id].indexOf(primId) > -1);
        c.card.classList.toggle("is-dim", !appId && !!primId && USES[a.id].indexOf(primId) < 0);
        lines[a.id].classList.toggle("is-on", appId ? appId === a.id : !!primId && USES[a.id].indexOf(primId) > -1);
      });
      ALL.forEach(function (id) {
        var b = prims[id].btn;
        b.setAttribute("aria-pressed", String(st.prim === id));
        b.classList.toggle("is-used", !!appId && USES[appId].indexOf(id) > -1);
        b.classList.toggle("is-dim", !!appId && USES[appId].indexOf(id) < 0);
      });
      S.clear(read);
      if (appId) {
        var a = S.app(appId), L = APP_LINE[appId], m = D.market(L[2]);
        read.appendChild(el("div", {}, el("span", { class: "s-spec", text: a.n + " · uses " + USES[appId].length + " of " + ALL.length + " building blocks" }), el("h3", { class: "u-mt-2", text: a.name + ": " + L[0] }), el("p", { text: L[1] })));
        read.appendChild(el("div", { class: "hm-layer__uses" }, el("span", { class: "s-spec", text: "Example market · sample" }),
          el("div", {}, el("a", { class: "hm-pill", href: "../app/#m=" + m.id }, el("span", { html: S.icon("search", 14), style: { display: "inline-flex" } }), "#" + m.id + " · " + (m.short || tname(m))), appLink(appId, "Open " + a.name))));
      } else if (primId) {
        var p = prims[primId].p, users = APPS.filter(function (x) { return USES[x.id].indexOf(primId) > -1; });
        read.appendChild(el("div", {}, el("span", { class: "s-spec", text: GROUPS.filter(function (g) { return g[0] === p[0]; })[0][1] }), el("h3", { class: "u-mt-2", text: p[2] }), el("p", { text: p[3] })));
        read.appendChild(el("div", { class: "hm-layer__uses" }, el("span", { class: "s-spec", text: "Used by " + users.length + " of 5 apps" }), el("div", {}, users.map(function (x) { return appLink(x.id, x.label === "App" ? "Seer App" : x.name); }))));
      }
    }
    render();
  }

  /* ======================================================================
     3. THREAD — one grant round across four apps
     ====================================================================== */
  function thread() {
    var P = D.proposal(D.featuredProposal), R = D.round4, F = D.futarchy[0];
    var byRank = D.proposals.slice().sort(function (a, b) { return a.deep.rank - b.deep.rank; });
    var cut = (byRank[R.slots - 1].deep.marketScore + byRank[R.slots].deep.marketScore) / 2;
    var impact = (F.yesTwap - F.noTwap) / F.noTwap;
    $("hm-thread-lede").textContent = R.org + " (fictional) has " + f.num(R.budget) + " " + R.collateral + " for " + R.slots + " grants and " + D.proposals.length +
      " proposals, scored 0–10 by " + R.panelSize + " human reviewers. Each app answers one part of the decision on the same markets. The example follows " + P.id + ", which sits exactly on the funding line.";
    var mDeep = D.market("2841"), mOpp = D.market("2842"), mFut = D.market("2843");
    function head(m, title, extra) {
      return el("div", { class: "hm-stage__head" },
        el("div", {}, S.ui.specs(["Mkt #" + m.id, tname(m), D.chain(m.chain).name]), el("h3", { class: "hm-stage__title", text: title })),
        el("div", { class: "s-row", style: { "--gap": "8px" } }, extra || null, S.ui.stateBadge(m.state)));
    }
    function foot(text, href, label) {
      return el("div", { class: "hm-stage__foot" }, el("p", { text: text }), el("a", { class: "s-btn", href: href }, label, el("span", { html: S.icon("arrow-right", 16), style: { display: "inline-flex" } })));
    }
    var STEPS = [
      { app: "deep", q: "How will the reviewers score it?", fig: f.num(P.deep.marketScore, 2) + " / 10",
        render: function (stage) {
          stage.appendChild(head(mDeep, P.id + " · " + P.title));
          var body = el("div", { class: "hm-stage__body" });
          body.appendChild(el("p", { class: "t-body", text: "Forecasting agents trade an UP/DOWN pair on every proposal's panel score. The curves are the market's forecast for " + P.id + " and its two neighbours on the ranking." }));
          var chartBox = el("div", { class: "hm-chart" }); body.appendChild(chartBox); stage.appendChild(body);
          var r7 = byRank[P.deep.rank - 2], r9 = byRank[P.deep.rank];
          S.chart.dist(chartBox, {
            curves: [
              { name: P.id + " · rank " + P.deep.rank, mean: P.deep.marketScore, sd: P.deep.consensusSd, color: "var(--c1)" },
              { name: r7.id + " · rank " + r7.deep.rank, mean: r7.deep.marketScore, sd: r7.deep.consensusSd, color: "var(--c-no)" },
              { name: r9.id + " · rank " + r9.deep.rank, mean: r9.deep.marketScore, sd: r9.deep.consensusSd, color: "var(--c5)" }
            ], domain: [5, 10], height: 200, xName: "Panel score", markers: [{ x: cut, label: "Funding line ≈ " + f.num(cut, 3) }], label: "Forecast distributions of panel scores"
          });
          var stats = el("div", { class: "s-stats" });
          stats.appendChild(S.ui.stat("Market score", f.num(P.deep.marketScore, 2), { unit: "/ 10" }));
          stats.appendChild(S.ui.stat("UP token", f.price(P.deep.up, 3), { unit: mDeep.collateral }));
          stats.appendChild(S.ui.stat("Rank", String(P.deep.rank), { unit: "of " + D.proposals.length }));
          stats.appendChild(S.ui.stat("Panel reveal", f.dayMon(R.panelReveal)));
          body.appendChild(stats);
          stage.appendChild(foot("The panel's real scores are revealed on " + f.date(R.panelReveal) + " and settle the market. Until then the price is the best guess.", "../deep/#" + P.id, "Open " + P.id + " in Deep"));
        } },
      { app: "opportunity", q: "Will it make the funded " + R.slots + "?", fig: f.pct0(P.opp.pSelect),
        render: function (stage) {
          stage.appendChild(head(mOpp, R.name + ": the funded shortlist"));
          var body = el("div", { class: "hm-stage__body" });
          body.appendChild(el("p", { class: "t-body", text: "Traders price which proposals the panel will fund. The ranking around the funding line, by chance of selection:" }));
          var rows = el("div", { class: "s-orows" });
          byRank.slice(R.slots - 4, R.slots + 3).forEach(function (p) {
            var r = S.ui.orow({ name: p.id + " · " + p.title, price: p.opp.pSelect }, { rank: p.deep.rank, actions: false });
            if (p.id === P.id) r.classList.add("is-selected");
            rows.appendChild(r);
            if (p.deep.rank === R.slots) rows.appendChild(el("div", { class: "hm-cut", attrs: { role: "separator" } }, el("span", { text: "Funding line · " + R.slots + " of " + D.proposals.length + " funded" })));
          });
          body.appendChild(rows);
          var stats = el("div", { class: "s-stats" });
          stats.appendChild(S.ui.stat("Chance of selection", f.pct0(P.opp.pSelect)));
          stats.appendChild(S.ui.stat("Outcome price", f.num(P.opp.price * 100, 1) + "¢"));
          stats.appendChild(S.ui.stat("Slots", String(R.slots), { unit: "of " + D.proposals.length }));
          stats.appendChild(S.ui.stat("Budget", f.compact(R.budget), { unit: R.collateral }));
          body.appendChild(stats);
          stage.appendChild(body);
          stage.appendChild(foot("The sponsor, " + R.org + ", makes the final selection. The price is a triage signal for its reviewers, not a ruling.", "../opportunity/#" + P.id, "Open the shortlist"));
        } },
      { app: "futarchy", q: "Should the round be funded at all?", fig: f.signed(impact, 2),
        render: function (stage) {
          stage.appendChild(head(mFut, F.id + " · " + F.title, el("span", { class: "s-tag s-tag--violet", text: "Futarchy" })));
          var body = el("div", { class: "hm-stage__body" });
          body.appendChild(el("p", { class: "t-body", text: "Two conditional markets price LAT if " + F.id + " is approved and if it is not. Only the branch that happens counts; the other unwinds." }));
          var chartBox = el("div", { class: "hm-chart" }); body.appendChild(chartBox); stage.appendChild(body);
          S.chart.line(chartBox, {
            series: [
              { name: "LAT if approved (YES)", short: "If approved", color: "var(--c-yes)", values: F.series.map(function (r) { return [r[0], r[1]]; }) },
              { name: "LAT if rejected (NO)", short: "If rejected", color: "var(--c-no)", values: F.series.map(function (r) { return [r[0], r[2]]; }) }
            ], height: 190, y: { format: function (v) { return f.price(v, 3); } }, label: "Conditional LAT prices, last 7 days"
          });
          body.appendChild(el("div", { class: "hm-pricepair" },
            el("div", { class: "hm-pp" }, el("small", {}, el("i", { style: { background: "var(--c-yes)" } }), "5-day TWAP so far · if approved"), el("b", {}, f.price(F.yesTwap, 4), el("small", { text: "YES_sDAI" }))),
            el("div", { class: "hm-pp" }, el("small", {}, el("i", { style: { background: "var(--c-no)" } }), "5-day TWAP so far · if rejected"), el("b", {}, f.price(F.noTwap, 4), el("small", { text: "NO_sDAI" })))));
          body.appendChild(el("div", { class: "hm-signal" }, el("span", { class: "hm-signal__v", text: f.signed(impact, 2) }),
            el("span", { class: "s-grow" }, el("b", { text: "Leaning approve, so far. " }), "Trailing 5 days, before the official window (" + f.dayMon(F.twapWindow.start) + "–" + f.dayMon(F.twapWindow.end) + ") opens. Information for the DAO, not the decision. The Snapshot vote runs " + f.dayMon(F.vote.opens) + "–" + f.dayMon(F.vote.closes) + ".")));
          stage.appendChild(foot("Signal band: compare the 5-day TWAPs (" + f.dayMon(F.twapWindow.start) + "–" + f.dayMon(F.twapWindow.end) + "). Above +1% leans approve, below −1% leans reject, otherwise neutral; the vote decides.", "../futarchy/#" + F.id, "Open " + F.id + " in Futarchy"));
        } },
      { app: "app", q: "What exactly is on-chain?", fig: "5 markets",
        render: function (stage) {
          var ids = ["2841", "2842", "2843", "2844", "2845"];
          stage.appendChild(el("div", { class: "hm-stage__head" }, el("div", {}, S.ui.specs(["Round " + R.id, ids.length + " markets", "2 chains"]), el("h3", { class: "hm-stage__title", text: "Every market in the thread, in one explorer" })), S.ui.sample()));
          var body = el("div", { class: "hm-stage__body hm-mini-table" });
          body.appendChild(el("p", { class: "t-body", text: "Each market is one contract on one chain, with a Reality.eth question, outcome tokens and a public history. Select a row to inspect it." }));
          stage.appendChild(body);
          S.ui.table(body, [
            { key: "id", label: "Market", render: function (m) { return el("div", { class: "hm-q" }, el("b", { text: "#" + m.id + " · " + (m.short || "") }), el("span", { text: S.app(m.appId).name })); }, class: "hm-q" },
            { key: "type", label: "Type", render: function (m) { return el("span", { class: "s-row", style: { "--gap": "4px" } }, S.ui.typeTag(m)); } },
            { key: "chain", label: "Chain", render: function (m) { return S.ui.chainBadge(m.chain); } },
            { key: "state", label: "State", render: function (m) { return S.ui.stateBadge(m.state); } },
            { key: "address", label: "Contract", render: function (m) { return S.ui.addr(m.address, { what: "market address" }); } }
          ], { rows: ids.map(D.market), compact: true, caption: "Markets in Lattice Builders Grants Round 4", onRow: function (m) { location.href = "../app/#m=" + m.id; } });
          stage.appendChild(foot("Every address on this page is sample data and starts with 0x5eed.", "../app/#m=2841", "Open the explorer"));
        } }
    ];
    var steps = $("hm-steps"), stage = $("hm-stage"), btns = [];
    STEPS.forEach(function (s, i) {
      var a = S.app(s.app);
      var b = el("button", { class: "hm-step", attrs: { type: "button", role: "tab", id: "hm-step-" + s.app, "aria-selected": "false", "aria-controls": "hm-stage", tabindex: "-1" } },
        el("span", { class: "hm-step__n", html: S.glyph(s.app) }),
        el("span", { class: "hm-step__app", text: pad2(i + 1) + " · " + a.label }),
        el("span", { class: "hm-step__fig", text: s.fig }),
        el("span", { class: "hm-step__q", text: s.q }));
      b.addEventListener("click", function () { select(i, false); });
      b.addEventListener("keydown", function (e) {
        var k = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!k) return; e.preventDefault(); select((i + k + STEPS.length) % STEPS.length, true);
      });
      btns.push(b); steps.appendChild(b);
    });
    steps.appendChild(el("p", { class: "hm-steps__note", text: "Same proposal ID, same market IDs and addresses on every page of this concept." }));
    function select(i, moveFocus) {
      btns.forEach(function (b, j) { b.setAttribute("aria-selected", String(i === j)); b.tabIndex = i === j ? 0 : -1; });
      stage.setAttribute("aria-labelledby", btns[i].id);
      S.clear(stage); S.tip.hide();
      STEPS[i].render(stage);
      if (moveFocus) btns[i].focus();
      if (btns[i].scrollIntoView && steps.scrollWidth > steps.clientWidth) steps.scrollTo({ left: btns[i].offsetLeft - 16, behavior: RM ? "auto" : "smooth" });
    }
    select(0, false);
  }

  /* ======================================================================
     4. MARKET TYPES — filter + kit market cards
     ====================================================================== */
  function types() {
    var TYPES = [
      { id: "categorical", label: "Categorical", text: "One outcome wins. Each outcome has its own token, and the prices of all tokens add up to 1 sDAI. A yes/no question is the two-answer case.", used: ["app", "futarchy"], cards: ["2832", "2835", "2831"] },
      { id: "multi-categorical", label: "Multi-categorical", text: "Several outcomes can be true at once, and the payout is split between them. Made for shortlists (which 8 of 40 proposals get funded) and for risk boards (which assets default, or No to All).", used: ["opportunity", "risk", "app"], cards: ["2842", "2850"], split: true },
      { id: "scalar", label: "Scalar", text: "A number inside a range, traded as two tokens, DOWN and UP. If the answer lands 37% of the way up the range, UP redeems for 0.37 and DOWN for 0.63. Deep runs a round of them, one per proposal.", used: ["deep", "app", "futarchy"], cards: ["2841", "2833", "2844"] },
      { id: "multi-scalar", label: "Multi-scalar", text: "One token per item, and each redeems its number's share of the answered total, so the tokens always add up to 1. Here: how Seer's new markets split across four chains.", used: ["app"], cards: ["2834"] },
      { id: "conditional", label: "Conditional", text: "Any outcome can be the collateral for a new market, so the new market only pays out if that outcome happens. Futarchy pairs two of them.", used: ["futarchy", "app"], cards: ["2836", "2844", "2845"], cond: true }
    ];
    var count = function (t) { return D.markets.filter(function (m) { return t.cond ? m.conditional : m.type === t.id; }).length; };
    var copy = $("hm-types-copy"), cardsBox = $("hm-types-cards");
    $("hm-types-bar").appendChild(S.ui.chipRow(TYPES.map(function (t) { return [t.id, t.label, count(t)]; }), TYPES[0].id, function (id) {
      TYPES.forEach(function (t) { if (t.id === id) show(t); });
    }));
    function show(t) {
      S.clear(copy); S.clear(cardsBox);
      var first = D.market(t.cards[0]);
      copy.appendChild(el("span", { class: "s-spec", text: count(t) + " sample markets of this type" }));
      copy.appendChild(el("h3", { text: t.label }));
      copy.appendChild(el("p", { text: t.text }));
      copy.appendChild(el("div", { class: "s-col", style: { "--gap": "8px" } }, el("span", { class: "s-spec", text: "Outcome tokens · #" + first.id }),
        el("div", { class: "hm-types__tokens" }, (first.set ? [].concat.apply([], first.outcomes.slice(0, 3).map(function (o) { return [o.symbol, o.downSymbol]; })).map(function (sym) { return el("span", { class: "s-tag s-tag--mono s-tag--violet", text: sym }); })
            : first.outcomes.slice(0, 7).map(function (o) { return el("span", { class: "s-tag s-tag--mono" + (o.invalid ? "" : " s-tag--violet"), text: o.symbol }); })),
          first.set ? el("span", { class: "s-tag s-tag--mono", text: "+" + (first.set * 2 - 6) }) : first.outcomes.length > 7 ? el("span", { class: "s-tag s-tag--mono", text: "+" + (first.outcomes.length - 7) }) : null)));
      if (t.split) {
        var P = D.proposal(D.featuredProposal), R = D.round4;
        copy.appendChild(el("div", { class: "hm-split" },
          el("div", { class: "hm-split__row" }, el("span", { text: "Proposals funded" }), el("b", { text: String(R.slots) })),
          el("div", { class: "hm-split__row" }, el("span", { text: "Each funded token redeems for" }), el("b", { text: "1/" + R.slots + " = " + f.price(1 / R.slots, 3) + " sDAI" })),
          el("div", { class: "hm-split__row" }, el("span", { text: P.id + " price today" }), el("b", { text: f.price(P.opp.price, 4) + " sDAI" }))));
      }
      copy.appendChild(el("div", { class: "hm-types__used" }, el("span", { class: "s-spec", text: "Used by" }),
        el("div", {}, t.used.map(function (id) { var a = S.app(id); return el("a", { class: "hm-chipapp", href: "../" + a.path }, glyph(id), a.name); }))));
      t.cards.forEach(function (id) {
        var m = D.market(id), card = S.ui.marketCard(m, { href: "../app/#m=" + m.id });
        if (m.conditional && m.parent) {
          var par = D.market(m.parent.id);
          card.insertBefore(el("p", { class: "hm-parent" }, el("span", { html: S.icon("link", 13), style: { display: "inline-flex" } }), "Only counts if ",
            el("a", { href: "../app/#m=" + par.id, text: "#" + par.id }), " resolves " + m.parent.outcome), card.children[1]);
        }
        cardsBox.appendChild(card);
      });
    }
    show(TYPES[0]);
  }

  /* ======================================================================
     5. RESOLUTION — six states, Reality.eth + Kleros
     ====================================================================== */
  function resolution() {
    var RES = [
      { id: "not-open", who: "Traders", ex: "2831", title: "Trading is open; answers are not yet", text: "A market trades from the moment it is created. Its question names an opening date, and until then the oracle does not accept answers.", act: "Trade, add liquidity, split or merge positions.", next: "On the opening date, reports open on Reality.eth." },
      { id: "open", who: "Anyone, with a bond", ex: "2839", title: "Anyone can post the answer", text: "The first answer is posted on Reality.eth with a bond. Anyone who disagrees can post a different answer by at least doubling that bond.", act: "Answer the question, or keep trading on what the answer will be.", next: "Once an answer is in, its challenge window starts." },
      { id: "waiting", who: "Challengers", ex: "2830", title: "An answer is in; its challenge window runs", text: "If nobody posts a different answer before the timeout, the last answer becomes final. Being right earns the bonds of those who were wrong.", act: "Challenge by doubling the bond, or keep trading.", next: "Timeout passes: pending execution. A challenge: dispute." },
      { id: "dispute", who: "Kleros jurors", ex: "2837", title: "Kleros is arbitrating", text: "Anyone can pay to send a contested question to Kleros. Randomly drawn jurors rule on it, and their ruling settles the question.", act: "Follow the case. The market keeps trading.", next: "The ruling becomes the final answer." },
      { id: "pending", who: "Anyone", ex: "2838", title: "The answer is final", text: "The answer can no longer change. One transaction, which anyone can send, reports it to the market's contract.", act: "Resolve the market.", next: "After that transaction, the market is closed." },
      { id: "closed", who: "Token holders", ex: "2829", title: "Resolved; winning tokens redeem", text: "Each winning token redeems for its share of the collateral. Scalar tokens redeem in proportion to where the answer fell in the range.", act: "Redeem winning tokens for collateral.", next: "Nothing else changes. The record stays public." }
    ];
    var track = $("hm-track"), detail = $("hm-res-detail"), btns = [];
    RES.forEach(function (r, i) {
      var s = D.state(r.id);
      var b = el("button", { class: "hm-tstep", attrs: { type: "button", role: "tab", id: "hm-ts-" + r.id, "aria-selected": "false", "aria-controls": "hm-res-detail", tabindex: "-1" } },
        el("span", { class: "hm-tstep__dot" }), el("span", { class: "hm-tstep__n", text: pad2(i + 1) }), el("span", { class: "hm-tstep__label", text: s.label }), el("span", { class: "hm-tstep__who", text: r.who }));
      b.addEventListener("click", function () { select(i); });
      b.addEventListener("keydown", function (e) {
        var k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!k) return; e.preventDefault(); var j = (i + k + RES.length) % RES.length; select(j); btns[j].focus();
      });
      btns.push(b); track.appendChild(b);
    });
    function select(i) {
      var r = RES[i], m = D.market(r.ex);
      btns.forEach(function (b, j) { b.setAttribute("aria-selected", String(i === j)); b.tabIndex = i === j ? 0 : -1; b.classList.toggle("is-past", j < i); });
      detail.setAttribute("aria-labelledby", btns[i].id);
      S.clear(detail);
      detail.appendChild(el("div", { class: "s-card s-card--pad hm-res__what" },
        el("div", { class: "s-row", style: { "--gap": "10px" } }, S.ui.stateBadge(r.id), el("span", { class: "s-spec", text: "State " + pad2(i + 1) + " of 06" })),
        el("h3", { text: r.title }), el("p", { text: r.text }),
        el("div", { class: "hm-res__rows" },
          el("div", {}, el("span", { class: "s-spec", text: "Who acts" }), el("b", { text: r.who })),
          el("div", {}, el("span", { class: "s-spec", text: "What you can do" }), el("b", { text: r.act })),
          el("div", { style: { gridColumn: "1 / -1" } }, el("span", { class: "s-spec", text: "Next" }), el("b", { text: r.next })))));
      var kv = [["Market", el("a", { class: "s-link", href: "../app/#m=" + m.id, text: "#" + m.id })], ["Reality.eth question", S.ui.addr(m.questionId, { what: "question ID", chars: 6 })], ["Arbitrator", el("span", { text: m.arbitrator })],
        [r.id === "not-open" ? "Reports open" : "Opened", el("span", { text: f.date(m.openingDate) })]];
      if (m.answer != null) kv.push(["Answer", el("span", { text: String(m.answer) + (m.range && m.range.unit ? " " + m.range.unit : "") })]);
      detail.appendChild(el("div", { class: "s-card s-card--pad hm-res__ex" },
        el("div", { class: "s-row s-row--between" }, el("span", { class: "s-spec", text: "Example in this state" })),
        el("a", { class: "s-card__title", href: "../app/#m=" + m.id, text: m.question }),
        el("div", { class: "hm-res__badges" }, S.ui.typeTag(m), S.ui.verifyBadge(m.verify), S.ui.chainBadge(m.chain)),
        S.ui.kv(kv)));
    }
    select(2);
    var TRUST = [
      ["vote", "Reality.eth answers", "Answers are crowd-sourced with escalating bonds. Being wrong costs the bond; being right earns the bonds of those who were wrong."],
      ["scale", "Kleros arbitration", "When an answer is contested, a decentralised court of randomly drawn jurors rules on it. Their ruling settles the question."],
      ["verified", "Kleros Curate", "Markets are submitted to a curated registry. A badly posed or misleading market can be challenged and lose its verified status."],
      ["info", "An Invalid outcome", "Every categorical market carries an Invalid outcome. If a question cannot be answered as posed, Invalid wins instead of a guess."]
    ];
    var trust = $("hm-trust");
    TRUST.forEach(function (t) {
      trust.appendChild(el("div", { class: "s-card s-card--pad hm-trust__card" }, el("span", { class: "hm-trust__icon", html: S.icon(t[0], 18) }), el("h3", { text: t[1] }), el("p", { text: t[2] })));
    });
  }

  /* ======================================================================
     6. BUILDERS — split / merge / redeem with sample prices
     ====================================================================== */
  function builders() {
    var links = $("hm-links");
    [["file", "Docs", "Create, trade and resolve markets", null], ["layers", "Contracts", "Factories, router and wrappers", null], ["link", "Data", "Subgraph and price history", null], ["bolt", "Design system", "The tokens and components on this page", "../system/"]].forEach(function (l) {
      var node = el(l[3] ? "a" : "button", { class: "hm-link", href: l[3] || null, attrs: l[3] ? null : { type: "button", "data-demo": l[1] + " links are not wired in this concept." } },
        el("span", { html: S.icon(l[0], 16), style: { display: "inline-flex", flex: "none" } }), el("span", {}, l[1], el("small", { text: l[2] })), el("span", { class: "hm-link__go", html: S.icon(l[3] ? "arrow-right" : "external", 16), style: { display: "inline-flex" } }));
      links.appendChild(node);
    });

    var m = D.market("2843"), outs = m.outcomes, col = m.collateral;
    var st = { mode: "split", amount: 100, win: 0 };
    var panel = el("section", { class: "s-panel hm-tok", attrs: { "aria-label": "Outcome token calculator" } });
    panel.appendChild(el("div", { class: "hm-tok__head" }, S.ui.specs(["Mkt #" + m.id, "LIP-31", D.chain(m.chain).name])));
    panel.appendChild(el("h3", { class: "t-title", text: m.question }));
    var modeSeg = S.ui.seg([["split", "Split"], ["merge", "Merge"], ["redeem", "Redeem"]], st.mode, function (v) { st.mode = v; calc(); }, "Action");
    var winBox = el("div", { class: "hm-tok__opts" }, el("span", { text: "If the final answer is" }),
      S.ui.seg([[0, "Yes"], [1, "No"]], 0, function (v) { st.win = v; calc(); }, "Final answer"));
    panel.appendChild(el("div", { class: "s-row s-row--between" }, modeSeg, winBox));
    var input = el("input", { attrs: { type: "text", inputmode: "decimal", value: "$100.00", "aria-label": "Amount in " + col } });
    var chips = el("div", { class: "s-amountchips" }, [10, 50, 100, 1000].map(function (c) {
      var b = el("button", { attrs: { type: "button" }, text: "+" + f.num(c) }); b.addEventListener("click", function () { st.amount = Math.min(1e7, st.amount + c); input.value = f.num(st.amount, 2); calc(); }); return b;
    }));
    input.value = f.num(st.amount, 2);
    input.addEventListener("input", function () { var v = parseFloat(input.value.replace(/[^0-9.]/g, "")); st.amount = isFinite(v) ? Math.min(1e7, Math.max(0, v)) : 0; calc(); });
    input.addEventListener("blur", function () { input.value = f.num(st.amount, 2); });
    var amountLabel = el("label", { text: "Collateral" });
    var flow = el("div", { class: "hm-tok__flow" });
    var note = el("p", { class: "hm-tok__note" });
    var go = el("button", { class: "s-btn s-btn--lg s-btn--block", attrs: { type: "button" } });
    go.addEventListener("click", function () { S.toast(st.amount ? "Sample only: no transaction is sent." : "Enter an amount first.", st.amount ? "info" : "alert"); });
    panel.appendChild(el("div", { class: "s-panel s-panel--nested hm-tok__amount" }, el("div", { class: "s-amount" }, amountLabel, input), chips, flow, note));
    panel.appendChild(go);
    $("hm-tokens").appendChild(panel);

    function row(sym, amt, sub, cls) {
      return el("div", { class: "hm-tokrow" + (cls ? " " + cls : "") }, el("span", {}, el("span", { class: "s-tag s-tag--mono" + (sym === col ? "" : " s-tag--violet"), text: sym })),
        el("span", { style: { flexDirection: "column", alignItems: "flex-end", gap: "1px" } }, el("b", { text: f.num(amt, 2) }), sub ? el("small", { text: sub }) : null));
    }
    function side(title, rows) { return el("div", { class: "hm-tok__side" }, el("span", { class: "s-spec", text: title }), rows); }
    function calc() {
      var a = st.amount, give, get;
      winBox.style.display = st.mode === "redeem" ? "" : "none";
      S.clear(flow);
      if (st.mode === "split") {
        amountLabel.textContent = "Split";
        give = [row(col, a, "collateral")];
        get = outs.map(function (o) { return row(o.symbol, a, "worth " + f.num(a * o.price, 2) + " at " + f.num(o.price * 100, 1) + "¢"); });
        note.textContent = "One full set of outcome tokens for every " + col + ". At sample prices the set is worth " + outs.map(function (o) { return f.num(o.price * 100, 1) + "¢"; }).join(" + ") + " = " + f.num(outs.reduce(function (s, o) { return s + o.price; }, 0) * 100, 1) + "¢. Sell the tokens you disagree with to take a position.";
        go.textContent = "Split " + f.num(a, 2) + " " + col;
      } else if (st.mode === "merge") {
        amountLabel.textContent = "Merge";
        give = outs.map(function (o) { return row(o.symbol, a, null); });
        get = [row(col, a, "back to collateral")];
        note.textContent = "A full set can be merged back into " + col + " at any time, before or after the answer. That is what holds the prices to a sum of 1.";
        go.textContent = "Merge " + f.num(a, 2) + " sets";
      } else {
        amountLabel.textContent = "Redeem";
        give = outs.filter(function (o) { return !o.invalid; }).map(function (o, i) { return row(o.symbol, a, i === st.win ? "winning outcome" : "losing outcome", i === st.win ? "is-win" : null); });
        get = outs.filter(function (o) { return !o.invalid; }).map(function (o, i) { return row(col, i === st.win ? a : 0, "for " + o.symbol, i === st.win ? null : "is-zero"); });
        note.textContent = "After the answer is final, each winning token redeems for 1 " + col + " and losing tokens for nothing. Scalar and multi-categorical markets pay a share instead.";
        go.textContent = "Redeem " + f.num(a, 2) + " " + outs[st.win].symbol;
      }
      flow.appendChild(side("You give", give));
      flow.appendChild(el("span", { class: "hm-tok__arrow", html: S.icon("arrow-right", 22) }));
      flow.appendChild(side("You get", get));
    }
    calc();
  }

  /* ======================================================================
     7. PROOF (public rebrand result) + closing poster
     ====================================================================== */
  var WORD = ["M311.8,117.3c-7.5,31.8-36.6,51.9-68.3,51.9s-71.7-34.1-71.7-76,28-75.7,71-75.7,69,34.5,69,75.5v10.5h-107.5c0,21.9,19.4,38.3,40.2,38.3s29.1-9.1,35.1-24.5h32.2ZM279.2,79.7c0-20-17.5-35-36.4-35s-38.3,14.7-38.3,35h74.7Z",
    "M464.3,117.3c-7.5,31.8-36.6,51.9-68.3,51.9s-71.7-34.1-71.7-76,28-75.7,71-75.7,69,34.5,69,75.5v10.5h-107.5c0,21.9,19.4,38.3,40.2,38.3s29.1-9.1,35.1-24.5h32.2ZM431.7,79.7c0-20-17.5-35-36.4-35s-38.3,14.7-38.3,35h74.7Z",
    "M572.1,21.4v32.8h-59.5v115h-32.8v-101.7c0-4.7.7-9.1,2-13.4.6-1.9,1.3-3.8,2.1-5.6,4.6-10.2,12.9-18.5,23.1-23.1,1.8-.8,3.7-1.5,5.6-2.1,4.2-1.3,8.7-2,13.4-2h46.1Z",
    "M92.2,17.5c31.4,0,66.1,12.7,66.1,49.4h-32.2c0-18.4-18.4-23.5-33.6-23.5s-32.5,1.4-32.5,18.1,31,18.4,43.3,20.5c24.9,4.1,56,11.7,56,42.7s-35.9,44.6-64.5,44.6-66.1-12.7-66.1-49.3h32.2c0,18.4,18.4,23.5,33.6,23.5s32.5-2.7,32.5-18.1-31-18.5-43.3-20.5c-24.8-4.1-55.9-11.7-55.9-42.6S63.7,17.5,92.2,17.5Z"];
  function proof() {
    var A = D.opportunity.archive[0], box = $("hm-rebrand");
    var top = A.top, other = 1 - top.reduce(function (s, t) { return s + t.share; }, 0);
    box.appendChild(el("div", { class: "s-col", style: { "--gap": "12px" } },
      el("div", { class: "s-row s-row--between" }, el("span", { class: "s-spec", text: "Public result · Opportunity archive" }), el("span", { class: "s-tag s-tag--outline", text: "Not sample data" })),
      el("h3", { text: "The identity on this page was picked with a market" }),
      el("p", { text: "Seer ran its own rebrand as an Opportunity Market. Traders priced which of " + A.entries + " entries the team would choose. Electric Foundation finished at " + f.pct(top[0].share, 1) + ", and it is the identity these six interfaces are built on." })));
    var rows = el("div", { class: "s-orows" });
    top.forEach(function (t) {
      var r = S.ui.orow({ name: t.name, price: t.share }, { actions: false, value: f.pct(t.share, 1) });
      if (t.winner) { r.classList.add("is-selected"); r.querySelector(".s-orow__label").appendChild(el("span", { class: "s-tag s-tag--solid", text: "Chosen" })); }
      rows.appendChild(r);
    });
    rows.appendChild(S.ui.orow({ name: "Other " + (A.entries - top.length) + " entries", price: other }, { actions: false, value: "0.5–1% each" }));
    box.appendChild(rows);
    box.appendChild(el("div", { class: "s-row s-row--between" }, S.ui.specs([A.entries + " entries", A.images + " images", "Finalised"]),
      el("a", { class: "s-btn s-btn--ghost s-btn--sm", href: "../opportunity/" }, "See the archive", el("span", { html: S.icon("arrow-right", 14), style: { display: "inline-flex" } }))));
    var word = $("hm-cta-word");
    word.innerHTML = '<svg viewBox="27 17 545 152" fill="currentColor" aria-hidden="true" focusable="false">' + WORD.map(function (d) { return '<path d="' + d + '"/>'; }).join("") + "</svg>";
  }

  /* ---------- boot (each block is independent; one failure must not blank the page) ---------- */
  [heroPrice, ecosystem, thread, types, resolution, builders, proof].forEach(function (fn) {
    try { fn(); } catch (e) { if (window.console) console.error("[home] " + (fn.name || "block") + " failed:", e); }
  });
})();
