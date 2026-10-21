/* Seer App · explorer (concept) — page script for /app/. Page classes use the .ap- prefix.
   Concept by Swift Bot Labs. Not affiliated with Seer.
   Everything comes from window.SEER_SAMPLE (sample data, not live). User text is only ever
   inserted with textContent (Seer.el), never innerHTML. Routes (hash):
     #m=<id>[&o=<outcome>][&side=1][&tab=details|activity|positions|resolution|related]  market record
     #a=<0x…>                                                                             address record
     #markets #activity #leaderboard #create #notes                                       sections */
(function () {
  "use strict";
  var D = window.SEER_SAMPLE, S = window.Seer, U = S.ui, F = S.fmt, el = S.el, $ = S.$, $$ = S.$$;
  if (!D || !S || !U) return;
  var NOW = D.now, HR = 36e5, DAY = 864e5;
  var PAL = S.chart.palette;
  var STAGE = { "not-open": 1, open: 2, waiting: 3, dispute: 4, pending: 5, closed: 6 };
  var SHORT_STATE = { "not-open": "reports not open yet", open: "reports open", waiting: "waiting for answer", dispute: "in dispute", pending: "pending execution", closed: "closed" };
  var TYPES = {}; D.marketTypes.forEach(function (t) { TYPES[t.id] = t; });
  var VERIFY = {}; D.verification.forEach(function (v) { VERIFY[v.id] = v; });
  var COLL = {}; D.collateral.forEach(function (c) { COLL[c.id] = c; });
  var MARKETS = D.markets.slice();
  var BASE_TITLE = document.title;
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ======================= helpers ======================= */
  function real(m) { return m.outcomes.filter(function (o) { return !o.invalid; }); }
  function isYesNo(m) { var r = real(m); return m.type === "categorical" && r.length === 2 && /^yes$/i.test(r[0].name) && /^no$/i.test(r[1].name); }
  function leader(m) { return real(m).filter(function (o) { return !o.noToAll; }).sort(function (a, b) { return b.price - a.price; })[0]; }
  // market kinds: one scalar pair, a round of scalar pairs (#2841, "Scalar × 40"), multi-winner categorical
  function sc(m) { return m.type === "scalar" && !m.set; }
  function isSet(m) { return !!m.set; }
  function multiCat(m) { return m.type === "multi-categorical"; }
  function isRisk(m) { return multiCat(m) && m.riskScale != null; }
  function cs(m) { return m.collSym || m.collateral; } // conditional markets are collateralised by their parent's outcome token
  function tname(m) { return U.typeName(m); }
  function invP(m) { var i = m.outcomes.filter(function (o) { return o.invalid; })[0]; return i ? i.price : 0; }
  function words(m, o) { return U.priceWords(m, o); }
  function wtext(m, o) { var w = words(m, o); return w.value + (w.sub && w.unit !== "share" ? (w.sub.charAt(0) === "/" ? "" : " · ") + w.sub : ""); }
  function shortName(o) { return o.proposal || (o.asset ? o.asset : o.name); }
  function leadLabel(m) { return isSet(m) ? "Top score" : isRisk(m) ? "Highest PD" : multiCat(m) ? "Most likely" : m.type === "multi-scalar" ? "Largest share" : sc(m) ? "Forecast" : "Leading"; }
  function stage(m) { return STAGE[m.state] || 1; }
  function chainName(id) { var c = D.chain(id); return c ? c.name : id; }
  function appOf(m) { return S.app(m.appId) || S.app("app"); }
  function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; }
  function tradable(m) { return m.state !== "pending" && m.state !== "closed"; }
  function scalarValue(m) { var r = m.range || { min: 0, max: 1 }; return m.value != null ? m.value : r.min + (r.max - r.min) * m.outcomes[1].price; }
  function fmtNum(v) { return Math.abs(v) >= 10000 ? F.compact(v, 1) : Number.isInteger(v) ? F.num(v, 0) : Math.abs(v) < 10 ? F.num(v, 4) : F.num(v, 1); }
  function fmtUnit(m, v) { var u = (m.range && m.range.unit) || ""; return fmtNum(v) + (u ? " " + u : ""); }
  function leadText(m) {
    if (sc(m)) return fmtUnit(m, scalarValue(m));
    var l = leader(m);
    if (isSet(m) || multiCat(m)) return shortName(l) + " " + wtext(m, l);
    return (isYesNo(m) ? l.name : clip(l.name, 26)) + " " + words(m, l).value;
  }
  function move24(m) {
    if (sc(m)) { var r = m.range, v1 = scalarValue(m), v0 = r.min + (r.max - r.min) * priceAgo(m, 1, DAY), dv = v1 - v0, wd = r.max - r.min;
      return { d: dv, text: (dv >= 0 ? "+" : "−") + (wd >= 10000 ? F.compact(Math.abs(dv), 1) : F.num(Math.abs(dv), wd >= 10 ? 1 : 3)) + (r.unit ? " " + r.unit : "") }; }
    var l = leader(m), uf = unitFn(m), du = uf.conv(l.price, l) - uf.conv(priceAgo(m, l.index, DAY), l);
    return { d: du, text: uf.delta(du) };
  }
  function deltaEl(mv, cls) { return el("span", { class: "s-delta " + (Math.abs(mv.d) < 5e-4 ? "s-delta--flat" : mv.d > 0 ? "s-delta--up" : "s-delta--down") + (cls ? " " + cls : ""), text: mv.text, title: "24h move of the leading outcome" }); }
  function sep() { return el("i", { text: "/", attrs: { "aria-hidden": "true" } }); }
  function avatarSm(m) { var ink = m.appId !== "app"; return el("span", { class: "s-avatar s-avatar--sm" + (ink ? " s-avatar--ink" : ""), html: S.glyph(ink ? m.appId : "grid"), attrs: { "aria-hidden": "true" } }); }
  function demoLink(label, msg, cls) { return el("button", { class: cls || "ap-lnk", text: label, attrs: { type: "button", "data-demo": msg } }); }
  function mlink(m, text) { return el("a", { href: "#m=" + m.id, text: text || "#" + m.id }); }
  function alink(a, text) { return el("a", { class: "s-link", href: "#a=" + a, text: text || F.addr(a, 4) }); }
  function go(h) { if (location.hash.slice(1) === h) route(); else location.hash = h; }
  function openMarket(id, sel) { go("m=" + id + (sel && sel.o != null ? "&o=" + sel.o + (sel.side ? "&side=1" : "") : "")); }
  function shareUrl(m) { return location.href.replace(/#.*$/, "") + "#m=" + m.id; }
  function specialistHref(m, oi) {
    var a = appOf(m), h = S.url(a.path), o = oi != null ? m.outcomes[oi] : null;
    if (a.id === "deep" || a.id === "opportunity") return h + "#" + ((o && o.proposal) || D.featuredProposal);
    if (a.id === "futarchy") return h + "#" + (m.proposal || "LIP-31");
    if (a.id === "risk") return h + (o && o.asset ? "#" + o.asset : "");
    return h;
  }

  /* price history: one hourly series per outcome over the market's whole life, sliced for 1D/1W/1M */
  var HC = {};
  function hist(m, k) {
    var key = m.id + ":" + k; if (HC[key]) return HC[key];
    if (m.branch && m.range) { // #2844/#2845: the same calibrated hourly series the Futarchy page draws
      var fp = D.futarchy.filter(function (f) { return f.id === m.proposal; })[0], col = m.branch === "yes" ? 1 : 2, span = m.range.max - m.range.min;
      if (fp) return (HC[key] = fp.series.map(function (x) { var up = (x[col] - m.range.min) / span; return [x[0], +(k === 1 ? up : 1 - up).toFixed(5)]; }));
    }
    return (HC[key] = D.series(m.id, k)); // the shared smoothed series: Deep and Opportunity read the same one
  }
  function priceAgo(m, k, ms) { var h = hist(m, k), t = NOW - ms; for (var i = h.length - 1; i >= 0; i--) if (h[i][0] <= t) return h[i][1]; return h[0][1]; }
  function delta24(m, k) { return m.outcomes[k].price - priceAgo(m, k, DAY); }

  /* ======================= address registry (positions, creators, agents, traders) ======================= */
  var ADDR = {};
  function reg(a) { var k = a.toLowerCase(); return ADDR[k] || (ADDR[k] = { address: a, positions: [], created: [], events: [] }); }
  D.agents.forEach(function (a) { reg(a.address).agent = a; });
  D.traders.forEach(function (t) { reg(t.address).trader = t; });
  MARKETS.forEach(function (m) {
    reg(m.creator).created.push(m);
    m._holders = D.holders(m.id, 10);
    m._holders.forEach(function (h, i) { var e = reg(h.address); e.positions.push({ m: m, outcome: h.outcome, share: h.share, balance: h.balance, rank: i + 1 }); if (h.label) e.label = h.label; });
    m._events = D.events(m.id, 24);
    m._events.forEach(function (ev) { reg(ev.from).events.push({ m: m, e: ev }); });
  });
  (function deriveTrails() { // every agent and trader on the leaderboard gets a deterministic (fictional) trail
    var r = D.rng("ap-positions"), deep = D.market("2841"), opp = D.market("2842");
    D.agents.forEach(function (a) {
      var e = reg(a.address), k, bal;
      if (!e.positions.some(function (p) { return p.m.id === "2841"; })) { k = Math.floor(r() * 40); bal = Math.round(200 + r() * 2400); e.positions.push({ m: deep, outcome: deep.outcomes[k].name, balance: bal, share: bal / deep.openInterest }); }
      if (r() > .45) { k = Math.floor(r() * 40); bal = Math.round(80 + r() * 900); e.positions.push({ m: opp, outcome: opp.outcomes[k].name, balance: bal, share: bal / opp.openInterest }); }
    });
    var pool = MARKETS.filter(function (m) { return m.state !== "closed" && m.openInterest > 0; });
    D.traders.forEach(function (t) {
      var e = reg(t.address), n = 3 + Math.floor(r() * 3), used = {};
      for (var j = 0; j < n; j++) {
        var m = pool[Math.floor(r() * pool.length)]; if (used[m.id]) continue; used[m.id] = 1;
        var outs = real(m), o = outs[Math.floor(r() * Math.min(outs.length, 4))], bal = Math.round(40 + r() * Math.min(4000, m.openInterest * .08));
        e.positions.push({ m: m, outcome: o.name, balance: bal, share: bal / m.openInterest });
      }
    });
  })();
  function addrKind(e) { return e.agent ? "Agent" : e.trader ? "Trader" : e.created.length ? "Market creator" : e.positions.length ? "Holder" : "Address"; }
  function addrLabel(e) { return e.agent ? e.agent.name : e.trader ? e.trader.handle : e.label || (e.created.length ? "Creator of " + e.created.length + " market" + (e.created.length > 1 ? "s" : "") : F.addr(e.address, 6)); }

  /* ======================= search index ======================= */
  MARKETS.forEach(function (m) {
    m._text = [m.id, "#" + m.id, m.question, m.short || "", m.category, tname(m), chainName(m.chain), cs(m),
      D.state(m.state).label, VERIFY[m.verify].label, appOf(m).name, m.conditional ? "conditional" : "", m.futarchy ? "futarchy" : ""]
      .concat(m.outcomes.map(function (o) { return o.name + " " + o.symbol + (o.downSymbol ? " " + o.downSymbol : ""); })).join(" · ").toLowerCase();
    m._addr = [m.address, m.conditionId, m.questionId, m.creator].concat(m.outcomes.map(function (o) { return o.token + " " + (o.down || "") + " " + (o.conditionId || ""); }), m._holders.map(function (h) { return h.address; })).join(" ").toLowerCase();
  });
  function has(v, q) { return v && v.toLowerCase().indexOf(q) > -1; }
  function mItem(m) { return { kind: "Market", label: m.question, sub: "#" + m.id + " · " + tname(m) + " · " + chainName(m.chain), val: leadText(m), href: "m=" + m.id }; }
  function aItem(e) { var n = e.positions.length; return { kind: addrKind(e), label: addrLabel(e), sub: n + " position" + (n === 1 ? "" : "s") + (e.agent ? " · " + e.agent.operator : ""), val: F.addr(e.address, 4), href: "a=" + e.address }; }
  function suggest(raw) {
    var q = String(raw || "").trim().toLowerCase().slice(0, 80), out = [], seen = {};
    function push(x) { var k = x.kind + "|" + x.href; if (!seen[k]) { seen[k] = 1; out.push(x); } }
    if (!q) return { items: [], total: 0 };
    var idq = q.replace(/^#/, "");
    if (/^\d{2,4}$/.test(idq)) MARKETS.forEach(function (m) { if (m.id.indexOf(idq) === 0) push(mItem(m)); });
    if (/^0x[0-9a-f]*$/.test(q)) {
      if (q.length < 3) return { items: [], total: 0 };
      MARKETS.forEach(function (m) { if (has(m.address, q)) push({ kind: "Market contract", label: m.question, sub: "#" + m.id, val: F.addr(m.address, 4), href: "m=" + m.id + "&tab=details" }); });
      MARKETS.forEach(function (m) {
        if (has(m.conditionId, q)) push({ kind: "Condition ID", label: m.question, sub: "#" + m.id + " · Conditional Tokens", val: F.addr(m.conditionId, 4), href: "m=" + m.id + "&tab=details" });
        if (has(m.questionId, q)) push({ kind: "Reality.eth", label: m.question, sub: "#" + m.id + " · question ID", val: F.addr(m.questionId, 4), href: "m=" + m.id + "&tab=resolution" });
      });
      MARKETS.forEach(function (m) { m.outcomes.forEach(function (o, k) {
        if (has(o.token, q)) push({ kind: "Outcome token", label: o.symbol + " · " + o.name, sub: "#" + m.id + " · ERC-20", val: F.addr(o.token, 4), href: "m=" + m.id + "&o=" + k + "&tab=details" });
        if (o.down && has(o.down, q)) push({ kind: "Outcome token", label: o.downSymbol + " · " + o.name, sub: "#" + m.id + " · ERC-20", val: F.addr(o.down, 4), href: "m=" + m.id + "&o=" + k + "&side=1&tab=details" });
        if (o.conditionId && has(o.conditionId, q)) push({ kind: "Condition ID", label: o.name, sub: "#" + m.id + " · Conditional Tokens", val: F.addr(o.conditionId, 4), href: "m=" + m.id + "&o=" + k + "&tab=details" });
      }); });
      var ents = Object.keys(ADDR).map(function (k) { return ADDR[k]; }).filter(function (e) { return has(e.address, q); });
      ents.sort(function (a, b) { return (b.agent || b.trader ? 1 : 0) - (a.agent || a.trader ? 1 : 0) || b.positions.length - a.positions.length; });
      ents.forEach(function (e) { push(aItem(e)); });
    } else {
      var qn = q.replace(/\s+/g, "");
      D.proposals.forEach(function (p, i) {
        if (p.id.toLowerCase() === qn || p.id.replace("-", "").toLowerCase() === qn || (q.length >= 3 && (has(p.title, q) || has(p.team, q))))
          push({ kind: "Proposal", label: p.id + " · " + p.title, sub: p.team + " · in #2841 and #2842", val: p.deep.marketScore.toFixed(2) + "/10", href: "m=2841&o=" + i });
      });
      MARKETS.forEach(function (m) { if (m._text.indexOf(q) > -1) push(mItem(m)); });
      if (q.length >= 2) MARKETS.forEach(function (m) {
        if (isYesNo(m) || sc(m) || m.id === "2841" || m.id === "2842") return;
        m.outcomes.forEach(function (o, k) { if (!o.invalid && has(o.name, q)) push({ kind: "Outcome", label: o.name, sub: "#" + m.id + " · " + clip(m.question, 52), val: words(m, o).value, href: "m=" + m.id + "&o=" + k }); });
      });
      D.agents.forEach(function (a) { if (has(a.name, q) || has(a.operator, q)) push(aItem(reg(a.address))); });
      D.traders.forEach(function (t) { if (has(t.handle, q)) push(aItem(reg(t.address))); });
    }
    return { items: out.slice(0, 8), total: out.length };
  }
  function matches(m, q) {
    if (!q) return true;
    if (/^0x[0-9a-f]*$/.test(q)) return q.length < 3 || m._addr.indexOf(q) > -1;
    var idq = q.replace(/^#/, "");
    if (/^\d{2,4}$/.test(idq)) return m.id.indexOf(idq) === 0;
    var qn = q.replace(/\s+/g, "");
    if (/^p-?\d{1,2}$/.test(qn)) return m.round === D.round4.id || m.proposal === "LIP-31";
    return m._text.indexOf(q) > -1;
  }

  /* ======================= views + routing ======================= */
  var home = $("#ap-home"), view = $("#ap-view"), mode = "home", homeScroll = 0;
  function parseHash() {
    var h = location.hash.replace(/^#/, ""), p = {};
    try { h = decodeURIComponent(h); } catch (e) { h = ""; }
    h = h.split("?")[0].slice(0, 200);
    if (/^(m|a)=/.test(h)) h.split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) p[kv.slice(0, i)] = kv.slice(i + 1); });
    else p.section = h;
    return p;
  }
  function route() {
    var p = parseHash();
    S.tip.hide(); closeSuggest();
    if (p.m && D.market(p.m)) return showMarket(D.market(p.m), p);
    if (p.a && /^0x[0-9a-fA-F]{6,64}$/.test(p.a)) return showAddress(p.a);
    showHome(p.section);
  }
  function enterView() {
    if (mode === "home") homeScroll = window.scrollY;
    mode = "view"; home.hidden = true; view.hidden = false; S.clear(view); window.scrollTo(0, 0);
  }
  function showHome(section) {
    var was = mode; mode = "home"; view.hidden = true; S.clear(view); home.hidden = false; document.title = BASE_TITLE;
    var t = section && /^[a-z-]+$/.test(section) ? document.getElementById(section) : null;
    if (t) t.scrollIntoView(); else if (was === "view") window.scrollTo(0, homeScroll);
  }
  window.addEventListener("hashchange", route);

  /* ======================= hero: search + lifecycle field ======================= */
  var qInput = $("#ap-q"), sugBox = $("#ap-suggest"), sugState = { items: [], i: -1 };
  var FIELD = MARKETS.slice().sort(function (a, b) { return stage(a) - stage(b) || b.volume - a.volume; });
  function drawField() {
    var box = $("#ap-field"); if (!box) return; var W = Math.round(box.clientWidth); if (!W) return;
    var n = FIELD.length, R = D.lifecycle.length, narrow = W < 540, labW = narrow ? 0 : 108, top = 4;
    var cell = Math.max(14, Math.min(42, (W - labW) / n)), gw = cell * n, ch = Math.min(cell, 27), ids = cell >= 40, H = Math.round(ch * R + top * 2 + (ids ? 18 : 0));
    var x0 = labW + Math.max(0, (W - labW - gw) / 2);
    var svg = S.svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "group", "aria-label": "Lifecycle field: " + n + " markets, each shown by how far it has moved from creation to redemption" });
    var band = S.svgEl("rect", { x: 0, y: 0, width: cell, height: H, rx: 4, fill: "rgba(143,85,247,.18)", visibility: "hidden" }); svg.appendChild(band);
    if (!narrow) D.lifecycle.forEach(function (lab, r) { var t = S.svgEl("text", { x: 0, y: top + (R - 1 - r) * ch + ch / 2 + 3.4 }); t.textContent = lab; svg.appendChild(t); });
    FIELD.forEach(function (m, c) {
      var idx = stage(m), cx = x0 + c * cell + cell / 2;
      for (var r = 0; r < R; r++) {
        var cy = top + (R - 1 - r) * ch + ch / 2;
        if (r < idx) { var a = Math.min(cell, ch) * .36; svg.appendChild(S.svgEl("path", { d: "M" + (cx - a).toFixed(1) + " " + cy.toFixed(1) + "H" + (cx + a).toFixed(1) + "M" + cx.toFixed(1) + " " + (cy - a).toFixed(1) + "V" + (cy + a).toFixed(1), stroke: "#8F55F7", "stroke-width": 1.3, fill: "none", "stroke-linecap": "round" })); }
        else if (r === idx) { svg.appendChild(S.svgEl("circle", { cx: cx, cy: cy, r: (Math.min(cell, ch) * .32).toFixed(1), fill: "none", stroke: "rgba(143,85,247,.55)", "stroke-width": 1 })); svg.appendChild(S.svgEl("circle", { cx: cx, cy: cy, r: Math.max(2.6, Math.min(cell, ch) * .14).toFixed(1), fill: "#B79BF7" })); }
        else svg.appendChild(S.svgEl("circle", { cx: cx, cy: cy, r: 1.4, fill: "#BFBFE6", opacity: .42 }));
      }
      if (ids) { var idt = S.svgEl("text", { x: cx, y: H - 4, "text-anchor": "middle", class: "ap-col__id" }); idt.textContent = m.id; svg.appendChild(idt); }
      var hit = S.svgEl("rect", { x: cx - cell / 2, y: 0, width: cell, height: H, fill: "transparent", class: "ap-col", tabindex: "0", role: "link", "aria-label": "#" + m.id + " " + m.question + ". " + D.state(m.state).label + "." });
      var show = function (e) {
        band.setAttribute("x", cx - cell / 2); band.setAttribute("visibility", "visible");
        var bb = hit.getBoundingClientRect();
        S.tip.show(e && e.clientX ? e.clientX : bb.right, e && e.clientY ? e.clientY : bb.top + 24, "#" + m.id + " · step " + (idx + 1) + " of " + R, [
          { label: clip(m.question, 58), value: "" }, { label: "State", value: D.state(m.state).label }, { label: leadLabel(m), value: leadText(m) }]);
      };
      var hide = function () { band.setAttribute("visibility", "hidden"); S.tip.hide(); };
      hit.addEventListener("pointermove", show); hit.addEventListener("focus", function () { show(); });
      hit.addEventListener("pointerleave", hide); hit.addEventListener("blur", hide);
      hit.addEventListener("click", function () { hide(); openMarket(m.id); });
      hit.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hide(); openMarket(m.id); } });
      svg.appendChild(hit);
    });
    S.clear(box).appendChild(svg);
  }
  function initHero() {
    var counts = {}; MARKETS.forEach(function (m) { counts[m.state] = (counts[m.state] || 0) + 1; });
    $("#ap-field-n").textContent = MARKETS.length + " markets";
    var at = $("#ap-field-at"); if (at) at.textContent = F.dateTime(NOW); // sample states, read at the real current time
    var cbox = $("#ap-field-counts");
    D.states.forEach(function (s) { if (counts[s.id]) cbox.appendChild(el("span", {}, el("b", { text: String(counts[s.id]) }), " " + SHORT_STATE[s.id])); });
    drawField(); S.onResize($("#ap-field"), drawField);
    // try chips
    var holderAgent = D.agents[0];
    var tries = [["#2841", "#2841"], ["P-07", "P-07"], ["Geth", "Geth"], ["In dispute", "dispute"], [holderAgent.address.slice(0, 12) + "…", holderAgent.address.slice(0, 12)]];
    var tb = $("#ap-try");
    tries.forEach(function (t) {
      var b = el("button", { class: "s-chip" + (/^0x/.test(t[0]) ? " t-mono" : ""), text: t[0], attrs: { type: "button", "aria-label": "Search for " + t[1] } });
      b.addEventListener("click", function () { setQuery(t[1]); qInput.focus(); openSuggest(); });
      tb.appendChild(b);
    });
    // typeahead
    qInput.addEventListener("input", function () { setQuery(qInput.value, true); openSuggest(); });
    qInput.addEventListener("focus", function () { if (qInput.value) openSuggest(); });
    qInput.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (sugBox.hidden) openSuggest();
        var n = sugState.items.length; if (!n) return; e.preventDefault();
        sugState.i = (sugState.i + (e.key === "ArrowDown" ? 1 : -1) + n) % n; paintSel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        var it = sugState.items[sugState.i >= 0 ? sugState.i : 0];
        if (it && !sugBox.hidden) pick(it);
        else { closeSuggest(); var t = $("#markets"); if (t) t.scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); }
      } else if (e.key === "Escape") { closeSuggest(); }
    });
    document.addEventListener("click", function (e) { if (!e.target.closest("#ap-search-wrap") && !e.target.closest("#ap-seek-read")) closeSuggest(); });
    // the information seeker's path under the search: focus it and say what a word search reads (real markets on Seer)
    var seek = $("#ap-seek-read");
    if (seek) seek.addEventListener("click", function () { qInput.focus(); if (qInput.value.trim()) openSuggest(); else hintSuggest(); });
  }
  // a suggestion row: a sample record (hash route), a real market on Seer (new tab), or a topic to search for
  function pick(it) {
    if (it.q) { setQuery(it.q); qInput.focus(); openSuggest(); return; }
    closeSuggest();
    if (it.ext) { window.open(it.ext, "_blank", "noopener,noreferrer"); return; }
    go(it.href);
  }
  function sugRow(it, i) {
    var row = el("div", { class: "ap-sug" + (it.live ? " ap-sug--live" : ""), attrs: { role: "option", id: "ap-sug-" + i, "aria-selected": String(i === sugState.i), title: it.title || null } },
      el("span", { class: "ap-sug__kind", text: it.kind }),
      el("span", { class: "ap-sug__main" }, el("span", { class: "ap-sug__label", text: it.label }), it.sub ? el("span", { class: "ap-sug__sub", text: it.sub }) : null),
      el("span", { class: "ap-sug__val", text: it.val || "" }));
    row.addEventListener("mousedown", function (e) { e.preventDefault(); });
    row.addEventListener("click", function () { pick(it); });
    return row;
  }
  var CREATE_URL = "https://app.seer.pm/create-market";   // Seer's own create flow (checked: it answers 200, unknown paths 404)
  function hintSuggest() {
    S.clear(sugBox);
    sugBox.appendChild(el("div", { class: "ap-suggest__empty", text: "Type a topic: words search Seer's real open markets, live. Market numbers, P-07 and 0x addresses search the sample explorer." }));
    var items = [{ kind: "Try a topic", label: "election", sub: "Real markets on Seer about elections", q: "election" },
      { kind: "Try a topic", label: "ethereum", sub: "Real markets on Seer about Ethereum", q: "ethereum" },
      { kind: "Ask on Seer", label: "Ask your own question on Seer", sub: "app.seer.pm/create-market · opens in a new tab", ext: CREATE_URL, live: true }];
    sugState = { items: items, i: 0 };
    items.forEach(function (it, i) { sugBox.appendChild(sugRow(it, i)); });
    sugBox.hidden = false; qInput.setAttribute("aria-expanded", "true");
    paintSel();
  }
  function openSuggest(refresh) {
    var res = suggest(qInput.value), keepI = refresh && !sugBox.hidden ? sugState.i : 0;
    // word queries also read Seer's real open markets (live.js); the rows arrive a moment later and re-render this box
    var live = window.AP_TOPIC && typeof window.AP_TOPIC.peek === "function"
      ? window.AP_TOPIC.peek(qInput.value, function () { if (!sugBox.hidden) openSuggest(true); }) : null;
    var items = res.items.slice(), nSample = items.length;
    if (live && live.state !== "loading") {
      if (live.state === "ok") live.rows.forEach(function (r) { items.push({ kind: "On Seer", label: r.label, title: r.title, sub: r.sub, val: r.val, ext: r.href, live: true }); });
      items.push({ kind: "Ask on Seer", label: live.state !== "ok" ? "Ask your own question on Seer" : live.rows.length ? "Not quite your question? Ask your own on Seer" : live.count ? "None priced yet: ask your own question about “" + live.q + "” on Seer" : "No market on it yet: ask your own question about “" + live.q + "” on Seer",
        sub: "app.seer.pm/create-market · opens in a new tab", ext: CREATE_URL, live: true });
    }
    sugState = { items: items, i: items.length ? Math.min(Math.max(keepI, 0), items.length - 1) : -1 };
    S.clear(sugBox);
    if (!qInput.value.trim()) { closeSuggest(); return; }
    if (!res.items.length) sugBox.appendChild(el("div", { class: "ap-suggest__empty", text: live ? "Nothing in the sample matches; real markets on Seer are below." : "Nothing in the sample matches. Try a market number, an outcome or an address that starts with 0x5eed." }));
    res.items.forEach(function (it, i) { sugBox.appendChild(sugRow(it, i)); });
    var qq = qInput.value.trim().toLowerCase();
    if (/^0x/.test(qq) && "0x5eed".indexOf(qq) === 0 || qq === "0x5eed") sugBox.appendChild(el("div", { class: "ap-suggest__foot", text: "Every sample address starts with 0x5eed · keep typing to narrow " + res.total + " matches" }));
    else if (res.total > res.items.length) sugBox.appendChild(el("div", { class: "ap-suggest__foot", text: "Showing " + res.items.length + " of " + res.total + " matches · press Enter for the first" }));
    else if (res.items.length) sugBox.appendChild(el("div", { class: "ap-suggest__foot", text: res.total + " match" + (res.total === 1 ? "" : "es") + " in the sample · ↑↓ to move · Enter to open" }));
    if (live) {
      var hd = el("div", { class: "ap-suggest__live" }, el("b", { text: "On Seer now · live" }),
        el("span", { text: live.state === "loading" ? "Reading Seer's open markets…" : live.state === "error" ? "Seer's API didn't answer just now"
          : live.rows.length ? F.num(live.count) + " open market" + (live.count === 1 ? "" : "s") + " mention “" + live.q + "”"
          : live.count ? F.num(live.count) + " open market" + (live.count === 1 ? "" : "s") + " mention “" + live.q + "”, none with prices to show" : "No open market on Seer mentions “" + live.q + "”" }));
      sugBox.appendChild(hd);
      items.slice(nSample).forEach(function (it, j) { sugBox.appendChild(sugRow(it, nSample + j)); });
    }
    sugBox.hidden = false; qInput.setAttribute("aria-expanded", "true");
    paintSel();
  }
  function paintSel() {
    $$(".ap-sug", sugBox).forEach(function (r, i) { r.setAttribute("aria-selected", String(i === sugState.i)); });
    if (sugState.i >= 0) { qInput.setAttribute("aria-activedescendant", "ap-sug-" + sugState.i); var r = $("#ap-sug-" + sugState.i); if (r && r.scrollIntoView) r.scrollIntoView({ block: "nearest" }); }
    else qInput.removeAttribute("aria-activedescendant");
  }
  function closeSuggest() { if (!sugBox) return; sugBox.hidden = true; qInput.setAttribute("aria-expanded", "false"); qInput.removeAttribute("aria-activedescendant"); }

  /* ======================= explorer ======================= */
  var FS = { q: "", cat: "all", type: "all", state: "all", chain: "all", verify: "all", coll: "all", sort: "volume", cond: false, fut: false, live: false, view: "cards", all: false };
  (function () { // the viewer's last choice wins; otherwise a wide screen opens on the dense table and a phone on cards
    var sv = null; try { sv = localStorage.getItem("ap-view"); } catch (e) { /* private mode: fine */ }
    FS.view = sv === "table" || sv === "cards" ? sv : (window.matchMedia && matchMedia("(min-width: 1200px)").matches ? "table" : "cards");
  })();
  var SORTS = [["volume", "Volume"], ["liquidity", "Liquidity"], ["openInterest", "Open interest"], ["opening", "Opening date"], ["created", "Creation date"], ["move", "24h move"]];
  var filterEls = {};
  function setQuery(q, fromHero) {
    FS.q = String(q || "").slice(0, 80);
    if (!fromHero) qInput.value = FS.q;
    var hs = $("[data-shell-search] input"); if (hs && hs.value !== FS.q && document.activeElement !== hs) hs.value = FS.q;
    renderExplorer();
  }
  function sortVal(m, k) {
    if (k === "opening") return -Date.parse(m.openingDate);
    if (k === "created") return Date.parse(m.created);
    if (k === "move") { var l = leader(m); return Math.abs(delta24(m, l.index)); }
    return m[k] || 0;
  }
  function filtered() {
    var q = FS.q.trim().toLowerCase();
    return MARKETS.filter(function (m) {
      if (FS.cat !== "all" && m.category !== FS.cat) return false;
      if (FS.type !== "all" && m.type !== FS.type) return false;
      if (FS.state !== "all" && m.state !== FS.state) return false;
      if (FS.chain !== "all" && m.chain !== FS.chain) return false;
      if (FS.verify !== "all" && m.verify !== FS.verify) return false;
      if (FS.coll !== "all" && m.collateral !== FS.coll) return false;
      if (FS.cond && !m.conditional) return false;
      if (FS.fut && !m.futarchy) return false;
      if (FS.live && !tradable(m)) return false;
      return matches(m, q);
    }).sort(function (a, b) { return sortVal(b, FS.sort) - sortVal(a, FS.sort); });
  }
  function fsel(key, label, opts) {
    var s = el("select", { class: "s-select", attrs: { "aria-label": label } });
    opts.forEach(function (o) { s.appendChild(el("option", { text: o[1], attrs: { value: o[0] } })); });
    s.value = FS[key];
    var w = el("label", { class: "ap-fsel" }, el("span", { text: label }), s);
    s.addEventListener("change", function () { FS[key] = s.value; w.classList.toggle("is-set", key !== "sort" && s.value !== "all"); renderExplorer(); });
    filterEls[key] = { sel: s, wrap: w };
    return w;
  }
  function fswitch(key, label) {
    var i = el("input", { attrs: { type: "checkbox" } }); i.checked = FS[key];
    i.addEventListener("change", function () { FS[key] = i.checked; renderExplorer(); });
    filterEls[key] = { input: i };
    return el("label", { class: "s-switch" }, i, label);
  }
  var catRow;
  function initExplorer() {
    var cats = {}; MARKETS.forEach(function (m) { cats[m.category] = (cats[m.category] || 0) + 1; });
    var items = [["all", "All", MARKETS.length]].concat(Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a] || a.localeCompare(b); }).map(function (c) { return [c, c, cats[c]]; }));
    catRow = U.chipRow(items, FS.cat, function (v) { FS.cat = v; renderExplorer(); });
    $("#ap-cats").appendChild(catRow);
    var body = $("#ap-fbody");
    body.appendChild(fsel("type", "Type", [["all", "All types"]].concat(D.marketTypes.map(function (t) { return [t.id, t.name]; }))));
    body.appendChild(fsel("state", "State", [["all", "Any state"]].concat(D.states.map(function (s) { return [s.id, s.label]; }))));
    body.appendChild(fsel("chain", "Chain", [["all", "All chains"]].concat(D.chains.map(function (c) { return [c.id, c.name]; }))));
    body.appendChild(fsel("verify", "Kleros Curate", [["all", "Any"]].concat(D.verification.map(function (v) { return [v.id, v.label]; }))));
    body.appendChild(fsel("coll", "Collateral", [["all", "Any"]].concat(D.collateral.map(function (c) { return [c.id, c.id]; }))));
    body.appendChild(fswitch("cond", "Conditional only"));
    body.appendChild(fswitch("fut", "Futarchy only"));
    body.appendChild(fswitch("live", "Hide resolved"));
    var end = $("#ap-fend");
    end.appendChild(fsel("sort", "Sort", SORTS));
    end.appendChild(U.seg([["cards", "Cards"], ["table", "Table"]], FS.view, function (v) { FS.view = v; try { localStorage.setItem("ap-view", v); } catch (e) { /* fine */ } renderExplorer(); }, "Results view"));
    var tg = $("#ap-ftoggle");
    tg.addEventListener("click", function () { var open = !body.classList.contains("is-open"); body.classList.toggle("is-open", open); tg.setAttribute("aria-expanded", String(open)); });
    document.addEventListener("seer:search", function (e) {
      var q = (e.detail && e.detail.q) || "";
      FS.q = q.slice(0, 80); qInput.value = FS.q; renderExplorer();
      if (mode !== "home") go("markets");
    });
    var hs = $("[data-shell-search] input");
    if (hs) hs.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return; e.preventDefault();
      var r = suggest(hs.value); if (r.items[0]) go(r.items[0].href); else go("markets");
    });
    renderExplorer();
  }
  function activeFilters() {
    var out = [];
    if (FS.q.trim()) out.push(["q", "Search: “" + clip(FS.q.trim(), 24) + "”"]);
    if (FS.cat !== "all") out.push(["cat", FS.cat]);
    if (FS.type !== "all") out.push(["type", TYPES[FS.type].name]);
    if (FS.state !== "all") out.push(["state", D.state(FS.state).label]);
    if (FS.chain !== "all") out.push(["chain", chainName(FS.chain)]);
    if (FS.verify !== "all") out.push(["verify", VERIFY[FS.verify].label]);
    if (FS.coll !== "all") out.push(["coll", FS.coll]);
    if (FS.cond) out.push(["cond", "Conditional only"]);
    if (FS.fut) out.push(["fut", "Futarchy only"]);
    if (FS.live) out.push(["live", "Hide resolved"]);
    return out;
  }
  function resetFilter(k) {
    if (k === "q") { FS.q = ""; qInput.value = ""; var hs = $("[data-shell-search] input"); if (hs) hs.value = ""; }
    else if (k === "cond" || k === "fut" || k === "live") { FS[k] = false; if (filterEls[k]) filterEls[k].input.checked = false; }
    else if (k === "cat") { FS.cat = "all"; $$(".s-chip", catRow).forEach(function (c, i) { c.setAttribute("aria-pressed", String(i === 0)); }); }
    else { FS[k] = "all"; if (filterEls[k]) { filterEls[k].sel.value = "all"; filterEls[k].wrap.classList.remove("is-set"); } }
  }
  function renderExplorer() {
    var list = filtered(), bar = $("#ap-resbar"), res = $("#ap-results"), act = activeFilters();
    S.clear(bar);
    bar.appendChild(el("span", { class: "ap-results__n" }, el("b", { text: String(list.length) }), " of " + MARKETS.length + " markets"));
    act.forEach(function (a) {
      var b = el("button", { class: "ap-pill", attrs: { type: "button", "aria-label": "Remove filter " + a[1] } }, a[1], el("span", { html: S.icon("close", 13), style: { display: "inline-flex" } }));
      b.addEventListener("click", function () { resetFilter(a[0]); renderExplorer(); });
      bar.appendChild(b);
    });
    if (act.length > 1) { var c = el("button", { class: "ap-clear", text: "Clear all", attrs: { type: "button" } }); c.addEventListener("click", clearAll); bar.appendChild(c); }
    var nf = act.filter(function (a) { return a[0] !== "q" && a[0] !== "cat"; }).length, tg = $("#ap-ftoggle");
    S.clear(tg); tg.insertAdjacentHTML("beforeend", S.icon("filter", 14)); tg.appendChild(document.createTextNode("Filters")); if (nf) tg.appendChild(el("span", { class: "s-count", text: String(nf) }));
    S.clear(res);
    if (!list.length) {
      res.appendChild(U.empty({ title: "No markets match", text: "Nothing in the sample fits these filters. Clear them, or search for a market number, an outcome or a 0x address." + (FS.q && window.AP_TOPIC && window.AP_TOPIC.ok(FS.q) ? " Real markets on Seer for “" + FS.q.trim().slice(0, 40) + "” are listed under the search box." : ""), action: { label: "Clear filters", onClick: clearAll }, motif: "dotgrid", motifOpts: { cols: 12, rows: 6, cell: 20, dissolve: .55 } }));
      return;
    }
    if (FS.view === "table") return renderTable(res, list);
    var g = el("div", { class: "s-grid s-grid--cards ap-cards" }), cut = !FS.all && !act.length && list.length > 8;
    (cut ? list.slice(0, 8) : list).forEach(function (m) { g.appendChild(card(m)); });
    res.appendChild(g);
    if (cut) {
      var more = el("button", { class: "s-btn s-btn--ghost ap-showall", attrs: { type: "button" } }, "Show all " + list.length + " markets", el("span", { html: S.icon("chevron-down", 16), style: { display: "inline-flex" } }));
      more.addEventListener("click", function () { FS.all = true; renderExplorer(); });
      res.appendChild(el("div", { class: "ap-showall-row" }, more));
    }
  }
  function clearAll() { ["q", "cat", "type", "state", "chain", "verify", "coll", "cond", "fut", "live"].forEach(resetFilter); renderExplorer(); }
  /* ---- card grammar (fix round 5): each market type draws its own shape in Cards view ----
     scalar: a range with tick marks and the estimate pinned on it (UP's price is the estimate's position);
     a scalar round (#2841): every proposal's expected score on one 0-10 strip, the funding line dashed, the leader kept as a row;
     several outcomes: one stacked bar, how a full set of outcome tokens (worth 1 collateral) is priced, top outcomes coloured. */
  var SEG = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];
  function pctTxt(p) { return p >= .1 ? F.pct0(p) : F.pct(p, 1); }
  // legend values speak the card's own unit: chances for one-winner markets and shares for multi-scalar (price = share of the set);
  // multi-winner prices are not chances (a funded share redeems 1/k), so those read in cents like their rows
  function legVal(m, o, sum) { return multiCat(m) ? F.cents1(o.price) : pctTxt(o.price / sum); }
  function rangeEl(m) {
    var r = m.range, v = scalarValue(m), p = Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min)));
    var tr = el("div", { class: "ap-rng", attrs: { role: "img", "aria-label": "Market forecast " + fmtUnit(m, v) + " on a range of " + fmtUnit(m, r.min) + " to " + fmtUnit(m, r.max) }, style: { "--p": p.toFixed(4) } },
      el("span", { class: "ap-rng__track" }, el("i")), el("span", { class: "ap-rng__ticks" }, [0, 1, 2, 3, 4].map(function () { return el("i"); })), el("span", { class: "ap-rng__pin" }));
    return el("div", { class: "ap-cvis ap-cvis--rng" },
      el("div", { class: "s-row s-row--between" }, el("span", { class: "t-meta", text: m.state === "pending" ? "Final answer" : "Market forecast" }), el("b", { class: "t-num ap-cvis__v", text: fmtUnit(m, v) })),
      tr, el("div", { class: "s-row s-row--between t-meta t-num" }, el("span", { text: fmtNum(r.min) }), el("span", { text: fmtNum(r.max) + (r.unit ? " " + r.unit : "") })));
  }
  function stripEl(m) {
    var r = m.range || { min: 0, max: 10 }, outs = real(m), k = (D.round4 && D.round4.slots) || 8;
    var vals = outs.map(function (o) { return o.value != null ? o.value : r.min + (r.max - r.min) * o.price; });
    var sorted = vals.slice().sort(function (a, b) { return b - a; }), line = sorted.length > k ? (sorted[k - 1] + sorted[k]) / 2 : null;
    var pos = function (v) { return (Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min))) * 100).toFixed(2) + "%"; };
    var strip = el("div", { class: "ap-strip", attrs: { role: "img", "aria-label": outs.length + " expected scores from " + F.num(sorted[sorted.length - 1], 2) + " to " + F.num(sorted[0], 2) + " out of " + trimNum(r.max) + (line != null ? "; the top " + k + " clear the funding line at " + F.num(line, 3) : "") } },
      el("span", { class: "ap-strip__base" }));
    vals.forEach(function (v) { strip.appendChild(el("i", { class: line != null && v > line ? "is-in" : "", style: { left: pos(v) } })); });
    if (line != null) strip.appendChild(el("span", { class: "ap-strip__line", style: { left: pos(line) } }));
    return el("div", { class: "ap-cvis ap-cvis--strip" },
      el("div", { class: "s-row s-row--between" }, el("span", { class: "t-meta", text: outs.length + " expected scores" }), line != null ? el("span", { class: "t-meta ap-cvis__k" }, el("i", { attrs: { "aria-hidden": "true" } }), "Funding line " + F.num(line, 3)) : null),
      strip, el("div", { class: "s-row s-row--between t-meta t-num" }, el("span", { text: trimNum(r.min) }), el("span", { text: trimNum(r.max) })));
  }
  function trimNum(v) { return Number.isInteger(v) ? String(v) : F.num(v, 2); }
  function stackEl(m, legendFrom) {
    var outs = real(m).slice().sort(function (a, b) { return b.price - a.price; }), sum = 0;
    outs.forEach(function (o) { sum += Math.max(0, o.price); });
    if (!(sum > 0)) return null;
    var top = outs.slice(0, SEG.length), rest = outs.slice(SEG.length), restP = 0;
    rest.forEach(function (o) { restP += Math.max(0, o.price); });
    var coll = cs(m), bar = el("div", { class: "ap-stack", attrs: { role: "img", "aria-label": "One full set of outcome tokens is worth 1 " + coll + ". Priced: " + top.map(function (o) { return shortName(o) + " " + F.cents1(o.price); }).join(", ") + (rest.length ? ", " + rest.length + " others " + F.cents1(restP) : "") } });
    top.forEach(function (o, i) { bar.appendChild(el("i", { style: { width: (o.price / sum * 100).toFixed(3) + "%", background: SEG[i] }, attrs: { title: shortName(o) + " · " + F.cents1(o.price) } })); });
    if (restP > 0) bar.appendChild(el("i", { class: "is-rest", style: { width: (restP / sum * 100).toFixed(3) + "%" }, attrs: { title: rest.length + " others · " + F.cents1(restP) } }));
    var leg = el("div", { class: "ap-stack__leg t-meta" });
    top.slice(legendFrom, legendFrom + 3).forEach(function (o, j) { var i = legendFrom + j; leg.appendChild(el("span", {}, el("i", { style: { background: SEG[i] }, attrs: { "aria-hidden": "true" } }), el("span", { class: "ap-stack__n", text: clip(shortName(o), 16) }), " " + legVal(m, o, sum))); });
    var more = outs.length - Math.min(outs.length, legendFrom + 3);
    if (more > 0) leg.appendChild(el("span", { class: "ap-stack__more", text: "+" + more + " more" }));
    return el("div", { class: "ap-cvis ap-cvis--stack" }, bar, leg.childNodes.length ? leg : null);
  }
  function cardGrammar(c, m) {
    var orows = $(".s-orows", c);
    if (!orows) return;
    if (sc(m) && m.range) {                         // single scalar: the range block replaces the plain bar
      var blk = $(".s-orow--nobar", orows); if (blk) orows.replaceChild(rangeEl(m), blk);
    } else if (isSet(m)) {                          // scalar round: the strip, then the leader's row with Up/Down
      var rows = $$(".s-orow", orows); rows.slice(1).forEach(function (x) { x.remove(); });
      orows.insertBefore(stripEl(m), orows.firstChild);
    } else if (!isYesNo(m) && real(m).length > 2) { // several outcomes: one stacked bar
      var three = $(".s-mcard__three", c);
      if (three) { var st3 = stackEl(m, 0); if (st3) orows.parentNode.replaceChild(st3, orows); return; }
      var st = stackEl(m, 2); if (!st) return;
      orows.insertBefore(st, orows.firstChild);
      $$(".s-orow", orows).forEach(function (x, i) { var lab = $(".s-orow__label", x); if (lab && i < 2) lab.insertBefore(el("i", { class: "s-dot ap-sw", style: { color: SEG[i] }, attrs: { "aria-hidden": "true" } }), lab.firstChild); });
    }
  }
  function card(m) {
    var c = U.marketCard(m, { onOpen: function () { openMarket(m.id); } });
    cardGrammar(c, m);
    var app = appOf(m), row = el("div", { class: "ap-crow" });
    if (m.state !== "not-open") row.appendChild(U.stateBadge(m.state));
    if (app.id !== "app") row.appendChild(el("span", { class: "s-tag s-tag--outline", html: S.glyph(app.id), title: "Lives in " + app.name }, app.label));
    if (m.conditional) row.appendChild(el("span", { class: "s-tag s-tag--violet", text: "Conditional" }));
    if (m.verify === "challenged" || m.verify === "verifying") row.appendChild(U.verifyBadge(m.verify));
    var spec = el("div", { class: "s-specs ap-cspec" }, el("span", { text: tname(m) }), el("span", { text: chainName(m.chain) }), el("span", { class: "ap-nc", text: cs(m) }));
    var foot = $(".s-card__foot", c), bot = el("div", { class: "ap-cbot" }), meta = $(".s-card__meta", c);
    if (meta) { meta.appendChild(deltaEl(move24(m))); meta.appendChild(el("span", { text: F.usd(m.liquidity) + " liq" })); }
    c.insertBefore(bot, foot);
    if (row.childNodes.length) bot.appendChild(row);
    bot.appendChild(spec); bot.appendChild(foot);
    // the kit's Yes/No/Up/Down buttons open the record with that side preselected in the ticket
    $$("button", c).forEach(function (b) { if (!b.closest(".s-card__icons")) b.removeAttribute("data-demo"); });
    if (!tradable(m)) { // resolved or awaiting execution: no trade buttons, the card just opens the record
      $$(".s-orow__actions", c).forEach(function (a) { a.remove(); });
      $$(".s-mcard__binary .s-btn, .s-mcard__three .s-btn, .s-pricetiles .s-btn", c).forEach(function (b) { b.setAttribute("aria-disabled", "true"); b.tabIndex = -1; });
    }
    c.addEventListener("click", function (e) {
      if (e.target.closest(".s-card__icons") || e.target.closest("a")) return;
      openMarket(m.id, pickFromButton(e.target.closest("button"), m));
    });
    return c;
  }
  function pickFromButton(b, m) {
    if (!b) return null;
    var row = b.closest(".s-orow");
    if (row) {
      var lab = $(".s-orow__label .u-clamp-1", row), name = lab ? lab.textContent : "", k = -1;
      m.outcomes.forEach(function (o, i) { if (o.name === name) k = i; });
      return k < 0 ? null : { o: k, side: b.classList.contains("s-btn--secondary") ? 1 : 0 };
    }
    var grp = b.parentElement, i = [].indexOf.call(grp.children, b);
    if (grp.classList.contains("s-mcard__binary") || grp.classList.contains("s-mcard__three")) return { o: i, side: 0 };
    if (grp.classList.contains("s-pricetiles")) return { o: i === 0 ? 0 : 1, side: 0 };
    return null;
  }
  function marketCell(m) {
    return el("span", { class: "ap-mcell" }, avatarSm(m),
      el("span", {}, el("b", { text: m.question }), el("small", { text: "#" + m.id + " · " + m.category + (m.conditional ? " · conditional" : "") })));
  }
  function renderTable(res, list) {
    var box = el("div", { class: "ap-table-tight" }); res.appendChild(box);
    var key = { volume: "volume", liquidity: "liquidity", openInterest: "openInterest", opening: "openingDate", move: "move" }[FS.sort] || null;
    U.table(box, [
      { key: "id", label: "Market", sort: function (m) { return m.question.toLowerCase(); }, class: "ap-wrap", render: marketCell },
      { key: "type", label: "Type", sort: function (m) { return tname(m); }, render: function (m) { return el("span", { class: "s-tag", text: tname(m) }); } },
      { key: "state", label: "State", sort: function (m) { return stage(m); }, render: function (m) { return U.stateBadge(m.state); } },
      { key: "chain", label: "Chain", sort: true, render: function (m) { return U.chainBadge(m.chain); } },
      { key: "lead", label: "Leading", render: function (m) { return leadText(m); } },
      { key: "move", label: "24H", num: true, class: "t-mono", sort: function (m) { return Math.abs(delta24(m, leader(m).index)); }, render: function (m) { return deltaEl(move24(m)); } },
      { key: "liquidity", label: "Liquidity", num: true, sort: true, render: function (m) { return F.usd(m.liquidity); } },
      { key: "volume", label: "Volume", num: true, sort: true, render: function (m) { return F.usd(m.volume); } },
      { key: "openInterest", label: "Open int.", num: true, sort: true, class: "col-xl", render: function (m) { return F.usd(m.openInterest); } },
      { key: "openingDate", label: "Reports open", num: true, sort: function (m) { return Date.parse(m.openingDate); }, render: function (m) { return F.date(m.openingDate); } }
    ], { rows: list, sortKey: key, sortDir: FS.sort === "opening" ? "asc" : "desc", onRow: function (m) { openMarket(m.id); }, caption: "Markets matching the current filters" });
  }

  /* ======================= activity (protocol index) ======================= */
  function initActivity() {
    var sum = function (k) { return MARKETS.reduce(function (a, m) { return a + (m[k] || 0); }, 0); };
    var inRes = MARKETS.filter(function (m) { return m.state === "open" || m.state === "waiting" || m.state === "dispute" || m.state === "pending"; }).length;
    var idx = $("#ap-index");
    idx.appendChild(U.stat("Markets", String(MARKETS.length), { note: "4 types · 4 chains" }));
    idx.appendChild(U.stat("Volume", F.usd(sum("volume")), { note: "all time" }));
    idx.appendChild(U.stat("Open interest", F.usd(sum("openInterest")), { note: "collateral locked" }));
    idx.appendChild(U.stat("Liquidity", F.usd(sum("liquidity")), { note: "in outcome pools" }));
    idx.appendChild(U.stat("Holders", F.num(sum("holders")), { note: "addresses with a position" }));
    idx.appendChild(U.stat("In resolution", String(inRes), { note: "reports open to pending" }));
    // volume mix
    var mix = $("#ap-mix");
    var byChain = D.chains.map(function (c, i) { return { label: c.name, value: MARKETS.filter(function (m) { return m.chain === c.id; }).reduce(function (a, m) { return a + m.volume; }, 0), color: PAL[i] }; });
    var byType = D.marketTypes.map(function (t, i) { return { label: t.name, value: MARKETS.filter(function (m) { return m.type === t.id; }).reduce(function (a, m) { return a + m.volume; }, 0), color: PAL[i] }; });
    [["Volume by chain", byChain], ["Volume by market type", byType]].forEach(function (x) {
      var cardEl = el("div", { class: "s-card s-card--pad" }, el("div", { class: "s-row s-row--between" }, el("span", { class: "s-spec", text: x[0] }), el("span", { class: "t-meta", text: F.usd(sum("volume")) + " total" })));
      mix.appendChild(cardEl); S.chart.stack(cardEl, x[1], { fold: 5, lg: true });
    });
    // latest transactions across the protocol
    var all = [];
    MARKETS.forEach(function (m) { m._events.slice(0, 6).forEach(function (e) { all.push({ e: e, m: m }); }); });
    all.sort(function (a, b) { return Date.parse(b.e.time) - Date.parse(a.e.time); });
    U.table($("#ap-tx"), [
      { key: "type", label: "Event", render: function (r) { return evTag(r.e.type); } },
      { key: "m", label: "Market", render: function (r) { return el("span", { class: "ap-who" }, mlink(r.m), el("span", { class: "t-meta", text: clip(r.e.outcome, 28) })); } },
      { key: "amount", label: "Amount", num: true, render: function (r) { return F.tok(r.e.amount, r.e.collateral); } },
      { key: "from", label: "From", render: function (r) { return U.addr(r.e.from, { href: "#a=" + r.e.from }); } },
      { key: "time", label: "Age", num: true, render: function (r) { return F.ago(r.e.time); } }
    ], { rows: all.slice(0, 9), compact: true, caption: "Latest transactions across all markets" });
    // resolution queue
    var q = $("#ap-queue");
    var items = MARKETS.filter(function (m) { return m.state === "open" || m.state === "waiting" || m.state === "dispute" || m.state === "pending" || m.verify === "challenged" || m.verify === "verifying"; })
      .sort(function (a, b) { return stage(b) - stage(a); });
    items.forEach(function (m) {
      var r = queueLine(m);
      q.appendChild(el("li", {},
        el("div", {}, el("div", { class: "ap-queue__top" }, U.stateBadge(m.state), m.verify !== "verified" ? U.verifyBadge(m.verify) : null, el("span", { class: "s-specs" }, el("span", { text: "#" + m.id }), el("span", { text: chainName(m.chain) }))),
          el("a", { class: "ap-q-title", href: "#m=" + m.id + "&tab=resolution", text: m.question }), el("p", { text: r.text })),
        r.action ? el("button", { class: "s-btn s-btn--sm " + (r.primary ? "" : "s-btn--secondary"), text: r.action, attrs: { type: "button", "data-demo": r.demo } }) : null));
    });
  }
  function evTag(t) {
    var cls = t === "Dispute" ? "s-tag s-tag--neg" : t === "Answer" ? "s-tag s-tag--warn" : t === "Redeem" ? "s-tag s-tag--violet" : "s-tag";
    return el("span", { class: cls + " s-tag--mono", text: t });
  }
  function answerOf(m) { return sc(m) ? fmtUnit(m, m.answer != null ? m.answer : scalarValue(m)) : (m.answer || leader(m).name); }
  function queueLine(m) {
    var ans = NOW - 26 * HR, final = ans + 84 * HR;
    if (m.state === "open") return { text: "Anyone can answer on Reality.eth by posting a bond of at least 10 xDAI." + (m.verify === "challenged" ? " Its Kleros Curate listing is also being challenged." : ""), action: "Submit answer", primary: true, demo: "Opens the Reality.eth answer form (not wired in this concept)." };
    if (m.state === "waiting") return { text: "“" + answerOf(m) + "” was answered " + F.ago(ans) + " with a 10 xDAI bond. It becomes final " + F.ago(final) + " unless someone answers differently with a 20 xDAI bond.", action: "Challenge", demo: "Posting a higher bond is not wired in this concept." };
    if (m.state === "dispute") return { text: "The answer was challenged " + F.ago(NOW - 5 * HR) + " and sent to Kleros. Trading continues until jurors rule.", action: "View case", demo: "The Kleros case page is not wired in this concept." };
    if (m.state === "pending") return { text: "Final answer: " + answerOf(m) + ". One transaction resolves the market, and anyone can send it.", action: "Resolve market", primary: true, demo: "Sample only: no transaction is sent." };
    return { text: VERIFY[m.verify].note + " Reports open " + F.date(m.openingDate) + ".", action: null };
  }

  /* ======================= leaderboard ======================= */
  function tierTag(t) { var c = { Elite: "s-tag s-tag--solid", Great: "s-tag s-tag--violet", Good: "s-tag s-tag--outline" }[t] || "s-tag"; return el("span", { class: c, text: t }); }
  function score(v) { return el("span", { class: "ap-score" }, el("span", { class: "s-pbar", style: { "--p": String(v / 100) } }, el("i")), el("b", { text: String(v) })); }
  function pnl(v) { return el("span", { class: v > 0 ? "t-pos" : v < 0 ? "t-neg" : "t-3", text: (v > 0 ? "+" : v < 0 ? "−" : "") + F.num(Math.abs(v), 0) + " sDAI" }); }
  function initLeaderboard() {
    var box = $("#ap-lb"), panel = el("div");
    var TR = D.traders.slice().sort(function (a, b) { return b.traderScore - a.traderScore; }), AG = D.agents.slice().sort(function (a, b) { return b.traderScore - a.traderScore; });
    var tabs = [{ id: "traders", label: "Traders", count: D.traders.length }, { id: "agents", label: "Agents", count: D.agents.length }];
    function draw(id) {
      S.clear(panel);
      if (id === "traders") {
        U.table(panel, [
          { key: "rank", label: "#", render: function (t) { return el("span", { class: "t-mono t-3", text: String(TR.indexOf(t) + 1).padStart(2, "0") }); } },
          { key: "handle", label: "Trader", sort: true, render: function (t) { return el("span", { class: "ap-who" }, el("a", { href: "#a=" + t.address }, el("b", { text: t.handle })), U.addr(t.address, { href: "#a=" + t.address })); } },
          { key: "traderScore", label: "Trader Score", num: true, sort: true, render: function (t) { return score(t.traderScore); } },
          { key: "tier", label: "Tier", render: function (t) { return tierTag(t.tier); } },
          { key: "pnl", label: "P&L", num: true, sort: true, render: function (t) { return pnl(t.pnl); } },
          { key: "volume", label: "Volume", num: true, sort: true, render: function (t) { return F.usd(t.volume); } },
          { key: "markets", label: "Markets", num: true, sort: true }
        ], { rows: TR, sortKey: "traderScore", sortDir: "desc", onRow: function (t) { go("a=" + t.address); }, caption: "Trader leaderboard" });
      } else {
        U.table(panel, [
          { key: "rank", label: "#", render: function (a) { return el("span", { class: "t-mono t-3", text: String(AG.indexOf(a) + 1).padStart(2, "0") }); } },
          { key: "name", label: "Agent", sort: true, render: function (a) { return el("span", { class: "ap-who" }, el("a", { href: "#a=" + a.address }, el("b", { text: a.name })), el("span", { class: "t-meta", text: a.operator })); } },
          { key: "traderScore", label: "Trader Score", num: true, sort: true, render: function (a) { return score(a.traderScore); } },
          { key: "tier", label: "Tier", render: function (a) { return tierTag(a.tier); } },
          { key: "pnl", label: "P&L", num: true, sort: true, render: function (a) { return pnl(a.pnl); } },
          { key: "trades", label: "Trades", num: true, sort: true, render: function (a) { return F.num(a.trades); } },
          { key: "brier", label: "Brier", num: true, sort: true, render: function (a) { return a.brier.toFixed(3); } },
          { key: "lastActive", label: "Last trade", num: true, render: function (a) { return F.ago(a.lastActive); } }
        ], { rows: AG, sortKey: "traderScore", sortDir: "desc", onRow: function (a) { go("a=" + a.address); }, caption: "Agent leaderboard" });
      }
    }
    U.tabs(box, tabs, function (t) { draw(t.id); }, 0);
    box.appendChild(panel); draw("traders");
    box.appendChild(el("p", { class: "t-meta ap-lb__note", text: "Trader Score blends calibration and P&L on resolved markets: Elite 85+, Great 70+, Good 55+, Average 40+, Weak below. Agents are automated traders, mostly in Deep. All names and figures are sample data." }));
  }

  /* ======================= create market (live preview) ======================= */
  var CF = { type: "categorical" };
  var TYPE_GLYPH = { categorical: "check", "multi-categorical": "layers", scalar: "sliders", "multi-scalar": "more" };
  function cleanText(s, n) { return String(s || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n); }
  function symOf(name) { return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase() || "OUT"; }
  function initCreate() {
    var tbox = $("#ap-types");
    D.marketTypes.forEach(function (t) {
      var b = el("button", { class: "ap-type", attrs: { type: "button", "aria-pressed": String(t.id === CF.type) }, html: S.icon(TYPE_GLYPH[t.id], 18) }, el("b", { text: t.name }), el("span", { text: t.note }));
      b.addEventListener("click", function () {
        CF.type = t.id; $$(".ap-type", tbox).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        var outs = $("#ap-f-outs");
        if (t.id === "multi-scalar" && /Rain/.test(outs.value)) outs.value = "Gnosis, Ethereum, OP Mainnet, Base";
        if (t.id !== "multi-scalar" && /^Gnosis, Ethereum/.test(outs.value)) outs.value = "Rain, Dry, Snow";
        drawCreate();
      });
      tbox.appendChild(b);
    });
    var cats = []; MARKETS.forEach(function (m) { if (cats.indexOf(m.category) < 0) cats.push(m.category); });
    cats.sort().forEach(function (c) { $("#ap-f-cat").appendChild(el("option", { text: c, attrs: { value: c } })); });
    $("#ap-f-cat").value = "Weather";
    D.chains.forEach(function (c) { $("#ap-f-chain").appendChild(el("option", { text: c.name, attrs: { value: c.id } })); });
    $("#ap-f-chain").value = "gnosis";
    $("#ap-f-date").min = new Date(NOW + DAY).toISOString().slice(0, 10); // reports open after today
    D.collateral.forEach(function (c) { $("#ap-f-coll").appendChild(el("option", { text: c.id + " · " + c.name, attrs: { value: c.id } })); });
    ["#ap-f-q", "#ap-f-outs", "#ap-f-min", "#ap-f-max", "#ap-f-unit", "#ap-f-cat", "#ap-f-chain", "#ap-f-coll", "#ap-f-date", "#ap-f-curate"].forEach(function (s) {
      $(s).addEventListener("input", drawCreate); $(s).addEventListener("change", drawCreate);
    });
    $("#ap-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = readCreate(), err = $("#ap-f-err");
      err.textContent = v.error || "";
      if (v.error) { S.toast(v.error, "alert"); return; }
      S.toast("Sample only: nothing was deployed. In the live app this is one transaction.", "info");
    });
    drawCreate();
  }
  function readCreate() {
    var q = cleanText($("#ap-f-q").value, 160), type = CF.type, outs = [], error = "";
    var min = parseFloat($("#ap-f-min").value), max = parseFloat($("#ap-f-max").value), unit = cleanText($("#ap-f-unit").value, 12);
    if (type === "scalar") {
      if (!isFinite(min) || !isFinite(max) || max <= min) error = "Set a lower bound below the upper bound.";
    } else {
      $("#ap-f-outs").value.split(/[,\n]/).forEach(function (s) { s = cleanText(s, 40); if (s && outs.indexOf(s) < 0 && outs.length < 12) outs.push(s); });
      if (outs.length < 2) error = "Add at least two outcomes, separated by commas.";
    }
    if (q.length < 12) error = "Write the question in full (at least 12 characters).";
    var date = $("#ap-f-date").value, t = Date.parse(date + "T00:00:00Z");
    if (!isFinite(t)) t = Date.parse("2026-12-31T00:00:00Z");
    if (t <= NOW) error = error || "Reports have to open after today (" + F.date(NOW) + ").";
    return { q: q, type: type, outs: outs, min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 1, unit: unit, cat: $("#ap-f-cat").value, chain: $("#ap-f-chain").value, coll: $("#ap-f-coll").value, opens: new Date(t).toISOString(), curate: $("#ap-f-curate").checked, error: error };
  }
  function drawCreate() {
    var v = readCreate(), sc = v.type === "scalar";
    $("#ap-f-range").hidden = !sc; $("#ap-f-outs-wrap").hidden = sc;
    $("#ap-f-outs-hint").textContent = v.type === "multi-scalar" ? "Comma-separated items; each token redeems its number's share of the total" : v.type === "multi-categorical" ? "Comma-separated; several can be true" : "Comma-separated, 2 to 12";
    var names = sc ? ["DOWN", "UP"] : (v.outs.length >= 2 ? v.outs : (v.outs.concat(["Yes", "No"])).slice(0, 2));
    var p = 1 / names.length;
    var m = { id: "new", appId: "app", type: v.type, question: v.q || "Your question appears here, in full, as traders will read it.", category: v.cat, state: "not-open", volume: 0, openingDate: v.opens,
      outcomes: names.map(function (n) { return { name: n, price: sc ? .5 : p }; }) };
    if (sc) { m.display = "scalar"; m.range = { min: v.min, max: Math.max(v.max, v.min + 1), unit: v.unit }; m.value = (m.range.min + m.range.max) / 2; }
    else if (v.type === "categorical" && names.length === 2 && /^yes$/i.test(names[0])) m.display = "binary";
    else if (v.type === "categorical" && names.length === 3) m.display = "three";
    var pc = $("#ap-prev-card"); S.clear(pc); pc.appendChild(U.marketCard(m));
    var toks = sc ? ["DOWN", "UP"] : names.map(symOf);
    var withInvalid = v.type === "categorical" || v.type === "multi-categorical";
    if (withInvalid) toks.push("INVALID");
    var tpl = { categorical: "single select", "multi-categorical": "multiple select", scalar: "number", "multi-scalar": "number, one question per item" }[v.type];
    var list = $("#ap-deploy"); S.clear(list);
    list.appendChild(el("li", {}, el("b", { text: "A Reality.eth question" }), " (" + tpl + ") that opens for answers on " + F.date(v.opens) + ", with Kleros as arbitrator."));
    list.appendChild(el("li", {}, el("b", { text: "A Conditional Tokens condition" }), " with " + toks.length + " outcome slots" + (withInvalid ? ", including Invalid." : ".")));
    list.appendChild(el("li", {}, el("b", { text: toks.length + " ERC-20 outcome tokens" }), " on " + chainName(v.chain) + ", backed by " + v.coll + ": ", el("span", { class: "t-mono", text: toks.join(" · ") })));
    if (v.curate) list.appendChild(el("li", {}, el("b", { text: "A Kleros Curate submission" }), ", so the market can show as Verified after its challenge period."));
    list.appendChild(el("li", {}, "Prices start equal. ", el("b", { text: "Add liquidity" }), " after creation so the market can trade."));
    if (!v.error) $("#ap-f-err").textContent = "";
    var dr = $("#ap-f-date-read"); if (dr) dr.textContent = F.date(v.opens) + " · 00:00 UTC";
  }

  /* ======================= market record (detail) ======================= */
  function defaultOutcome(m) { return sc(m) ? 1 : leader(m).index; }
  // a rail taller than the viewport scrolls with the page and holds at its bottom edge, so the pool-depth and position panels stay reachable
  var curRail = null;
  function railFit(rail) { var hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 72; rail.style.top = Math.min(hh + 16, window.innerHeight - rail.offsetHeight - 16) + "px"; }
  window.addEventListener("resize", function () { if (curRail && curRail.isConnected) railFit(curRail); });
  function showMarket(m, p) {
    enterView();
    var o = p.o != null && m.outcomes[+p.o] ? +p.o : defaultOutcome(m);
    var cur = { m: m, o: o, side: p.side === "1" ? 1 : 0 };
    var app = appOf(m), st = D.state(m.state);
    document.title = "#" + m.id + " · " + clip(m.question, 60) + " · Seer App (concept)";
    var wrap = el("div", { class: "s-container ap-detail" }); view.appendChild(wrap);

    // breadcrumb
    var catBtn = el("button", { text: m.category, attrs: { type: "button", "aria-label": "Show all " + m.category + " markets" } });
    catBtn.addEventListener("click", function () { clearAll(); FS.cat = m.category; $$(".s-chip", catRow).forEach(function (c) { c.setAttribute("aria-pressed", String(c.firstChild && c.firstChild.textContent === m.category)); }); renderExplorer(); go("markets"); });
    wrap.appendChild(el("nav", { class: "ap-crumbs", attrs: { "aria-label": "Breadcrumb" } },
      el("a", { class: "s-btn s-btn--ghost s-btn--sm", href: "#", html: S.icon("arrow-left", 14) }, "All markets"),
      el("a", { href: "#markets", text: "Markets" }), sep(), catBtn, sep(), el("span", { class: "t-mono", text: "#" + m.id, attrs: { "aria-current": "page" } })));

    var grid = el("div", { class: "ap-dgrid" }); wrap.appendChild(grid);
    var head = el("header", { class: "ap-dhead" }), A = el("div", { class: "ap-da" }), rail = el("aside", { class: "ap-rail", attrs: { "aria-label": "Trade" } }), B = el("div", { class: "ap-db" });
    grid.appendChild(head); grid.appendChild(A); grid.appendChild(rail); grid.appendChild(B);

    // ---- head
    var badges = el("div", { class: "ap-badges" }, U.stateBadge(m.state), U.verifyBadge(m.verify), U.typeTag(m), U.chainBadge(m.chain), el("span", { class: "s-tag", text: cs(m) }));
    if (app.id !== "app") badges.appendChild(el("a", { class: "s-tag s-tag--outline ap-apptag", href: specialistHref(m, cur.o), html: S.glyph(app.id) }, "Lives in " + app.name));
    var links = el("div", { class: "ap-dlinks" },
      el("button", { attrs: { type: "button", "data-demo": "Opens Reality.eth question " + F.addr(m.questionId, 6) + " (not wired in this concept)." }, html: S.icon("external", 14) }, "Answer on Reality.eth"),
      el("button", { attrs: { type: "button", "data-demo": "Opens the Kleros Curate entry (not wired in this concept)." }, html: S.icon("verified", 14) }, "Kleros Curate entry"));
    if (app.id !== "app") links.appendChild(el("a", { href: specialistHref(m, cur.o), html: S.glyph(app.id) }, "Open in " + app.name));
    head.appendChild(el("div", { class: "ap-dhead__top" },
      U.avatar(m.appId === "app" ? "grid" : m.appId, m.appId === "app" ? null : "ink"),
      el("div", { class: "ap-dhead__main" }, badges, el("h1", { class: "ap-dtitle", text: m.question }), links,
        U.specs(["Mkt #" + m.id, chainName(m.chain), (Date.parse(m.openingDate) > NOW ? "Reports open " : "Reports opened ") + F.date(m.openingDate)])),
      el("div", { class: "ap-dhead__actions" },
        el("button", { class: "s-icon-btn", attrs: { type: "button", "aria-label": "Copy link to this market", "data-copy": shareUrl(m) }, html: S.icon("link", 16) }),
        el("button", { class: "s-icon-btn", attrs: { type: "button", "aria-label": "Bookmark", "data-demo": "Bookmarks are not wired in this concept." }, html: S.icon("bookmark", 16) }))));
    if (m.parent) {
      var par = D.market(m.parent.id);
      head.appendChild(el("div", { class: "s-callout s-callout--violet" }, el("span", { html: S.icon("layers", 16), style: { display: "inline-flex" } }),
        el("span", {}, el("b", { text: "Conditional market. " }), "Its collateral is " + (m.collSym ? m.collSym + ", the “" + m.parent.outcome + "” token of " : "the “" + m.parent.outcome + "” token of "), mlink(par),
          m.collSym ? ". Split " + m.collateral + " on #" + par.id + " first (1 " + m.collateral + " → 1 YES_sDAI + 1 NO_sDAI). It pays out in " + m.collSym + ", which is void unless #" + par.id + " resolves " + m.parent.outcome + "."
            : ", so it only pays out if that market resolves " + m.parent.outcome + ".",
          m.futarchy ? " It settles on LAT's 30-day TWAP to 10 Dec, after the 7–10 Nov vote. Prices inform the DAO's vote; they don't decide it." : "")));
    } else if (m.futarchy) {
      head.appendChild(el("div", { class: "s-callout s-callout--violet" }, el("span", { html: S.glyph("futarchy"), style: { display: "inline-flex", color: "var(--violet-3)" } }),
        el("span", {}, el("b", { text: "Futarchy decision market. " }), "Its Yes and No tokens are YES_sDAI and NO_sDAI, the collateral of the two conditional markets that forecast LAT if " + m.proposal + " passes and if it doesn't. No Invalid outcome: an invalid answer counts as not approved. The result is information for Lattice DAO; the Snapshot vote decides.")));
    } else if (isSet(m)) {
      head.appendChild(el("div", { class: "s-callout s-callout--violet" }, el("span", { html: S.icon("sliders", 16), style: { display: "inline-flex" } }),
        el("span", {}, el("b", { text: "A round of " + m.set + " scalar markets. " }), "Each proposal has its own condition and its own UP/DOWN pair on a 0–10 scale. UP redeems the panel's score ÷ 10 and DOWN the rest, so the UP price is the expected score: P-07's UP at " + F.cents(m.outcomes[6].price) + " means 8.14/10.")));
    } else if (multiCat(m)) {
      head.appendChild(el("div", { class: "s-callout s-callout--violet" }, el("span", { html: S.icon("layers", 16), style: { display: "inline-flex" } }),
        el("span", {}, el("b", { text: "Several outcomes win. " }), isRisk(m) ? "1 sDAI is split equally between the assets that default this quarter, and No to All pays 1 sDAI if none do. A token trades a little under its quarterly default chance, because the payout is shared when several default."
          : "The panel funds " + m.slots + " proposals and each funded token redeems 1/" + m.slots + " sDAI, so a price is not a chance: chance ≈ price × " + m.slots + ". " + shortName(m.outcomes[6]) + " at " + F.cents1(m.outcomes[6].price) + " is about a " + F.pct0(m.outcomes[6].chance) + " chance.")));
    }

    // ---- A: stats, chart, outcomes
    var l = leader(m), uf = unitFn(m);
    var last;
    if (sc(m)) { var r = m.range, v0 = r.min + (r.max - r.min) * priceAgo(m, 1, DAY), v1 = scalarValue(m); var wd = r.max - r.min, dv = Math.abs(v1 - v0); last = U.stat("Forecast · 24h", fmtUnit(m, v1), { delta: v1 - v0, deltaText: (v1 >= v0 ? "+" : "−") + (wd >= 10000 ? F.compact(dv, 1) : F.num(dv, wd >= 10 ? 1 : 3)) + (r.unit ? " " + r.unit : "") }); }
    else { var du = uf.conv(l.price, l) - uf.conv(priceAgo(m, l.index, DAY), l); last = U.stat(leadLabel(m) + " · 24h", (isYesNo(m) ? l.name : clip(shortName(l), 10)) + " " + words(m, l).value + (isRisk(m) ? "/yr" : ""), { delta: du, deltaText: uf.delta(du) }); }
    A.appendChild(el("div", { class: "s-stats ap-dstats" },
      U.stat("Liquidity", F.usd(m.liquidity), { note: m.liquidity ? "in " + (isSet(m) ? m.set * 2 + " UP/DOWN" : real(m).length) + " pools" : "pools closed" }),
      U.stat("Volume", F.usd(m.volume), { note: "all time" }),
      U.stat("Open interest", F.usd(m.openInterest), { note: cs(m) + " locked" }),
      U.stat("Holders", F.num(m.holders), { note: "addresses" }), last));

    // scalar forecast block
    var chartCard = el("section", { class: "s-card s-card--pad ap-chartcard", attrs: { "aria-label": "Price history" } });
    if (sc(m)) {
      var rg = m.range, val = scalarValue(m), pos = (val - rg.min) / (rg.max - rg.min);
      chartCard.appendChild(el("div", { class: "ap-scalar" },
        el("div", { class: "ap-scalar__v" }, el("span", { class: "t-meta", text: m.state === "pending" ? "Final answer" : "Market forecast" }), el("b", { text: fmtUnit(m, val) })),
        el("div", { class: "ap-scalar__track", attrs: { role: "img", "aria-label": "Forecast " + fmtUnit(m, val) + " in a range of " + fmtUnit(m, rg.min) + " to " + fmtUnit(m, rg.max) } }, el("span", { class: "ap-scalar__mark", style: { left: (pos * 100).toFixed(2) + "%" } })),
        el("div", { class: "s-row s-row--between t-meta" }, el("span", { text: fmtUnit(m, rg.min) }), el("span", { text: "UP " + F.cents(m.outcomes[1].price) + " · DOWN " + F.cents(m.outcomes[0].price) }), el("span", { text: fmtUnit(m, rg.max) })),
        el("p", { class: "t-meta", text: "UP pays (answer − " + fmtNum(rg.min) + ") ÷ (" + fmtNum(rg.max) + " − " + fmtNum(rg.min) + ") per token, clamped to the range; DOWN pays the rest. Together they always redeem for 1 " + cs(m) + "." })));
    }
    var series = seriesFor(m, uf), range = "all";
    var segEl = U.seg([["1d", "1D"], ["1w", "1W"], ["1m", "1M"], ["all", "All"]], "all", function (vv) { range = vv; chart.update({ series: slice(series, range), x: { format: range === "1d" ? F.time : F.dayMon } }); }, "Chart range");
    var chartTitle = uf.title(series);
    chartCard.appendChild(el("div", { class: "ap-cardhead" }, el("div", {}, el("span", { class: "s-spec", text: uf.spec }), el("h2", { class: "t-h3", text: chartTitle })), segEl));
    var chartBox = el("div"); chartCard.appendChild(chartBox);
    chartCard.appendChild(el("p", { class: "t-meta ap-chartnote", text: uf.caption + (m.branch ? " Same hourly series as the Futarchy page (sample)." : " Sample history, generated to end at the snapshot price.") }));
    A.appendChild(chartCard);
    var span = m.range ? m.range.max - m.range.min : 1, dd = span <= 5 ? 2 : span <= 200 ? 1 : 0;
    var yf = sc(m) ? function (x) { return (dd ? F.num(x, dd) : F.compact(x, 1)) + (m.range.unit ? " " + m.range.unit : ""); } : uf.fmt;
    var allv = [].concat.apply([], series.map(function (s) { return s.values.map(function (q) { return q[1]; }); }));
    var maxv = Math.max.apply(null, allv), minv = Math.min.apply(null, allv);
    var yopt = sc(m) ? { format: yf } : isYesNo(m) ? { min: 0, max: 1, format: yf }
      : isSet(m) ? { min: Math.max(0, Math.floor(minv * 2 - .5) / 2), max: Math.min(10, Math.ceil(maxv * 2 + .5) / 2), format: yf }
      : { min: 0, max: Math.min(1, Math.ceil(maxv * 1.12 * 20) / 20), format: yf };
    var chart = S.chart.line(chartBox, { series: series, y: yopt, x: { format: F.dayMon }, height: 260, label: chartTitle, endLabels: true });

    // outcomes
    var colorOf = {}; if (!isYesNo(m) && !sc(m)) series.forEach(function (s) { colorOf[s.k] = s.color; });
    var outCard = el("section", { class: "s-card s-card--pad", attrs: { "aria-labelledby": "ap-outs-h" } });
    var many = m.outcomes.length > 10, showAll = false, oq = "";
    var ohead = el("div", { class: "ap-cardhead" }, el("div", {}, el("span", { class: "s-spec", text: tname(m) + (m.outcomes.some(function (x) { return x.invalid; }) ? " · incl. Invalid" : "") }),
      el("h2", { id: "ap-outs-h", class: "t-h3", text: isSet(m) ? "Proposals · " + m.set + " UP/DOWN pairs" : "Outcomes · " + m.outcomes.length })));
    if (many) {
      var oin = el("input", { attrs: { type: "search", placeholder: "Filter outcomes", "aria-label": "Filter outcomes", maxlength: "40" } });
      oin.addEventListener("input", function () { oq = oin.value.slice(0, 40); drawOuts(); });
      ohead.appendChild(el("label", { class: "s-search s-search--sm ap-oq", html: S.icon("search", 15) }, oin));
    }
    outCard.appendChild(ohead);
    var outBox = el("div", { class: "ap-outs" }); outCard.appendChild(outBox);
    var moreBtn = el("button", { class: "s-btn s-btn--ghost s-btn--sm ap-more", attrs: { type: "button" } });
    moreBtn.addEventListener("click", function () { showAll = !showAll; drawOuts(); });
    if (many) outCard.appendChild(moreBtn);
    A.appendChild(outCard);
    var ranked = m.outcomes.slice().sort(function (a, b) { return (a.invalid ? 1 : 0) - (b.invalid ? 1 : 0) || (a.noToAll ? 1 : 0) - (b.noToAll ? 1 : 0) || b.price - a.price; });
    var rankOf = {}; ranked.forEach(function (x, i) { rankOf[x.index] = i + 1; });
    var multi = !isYesNo(m) && !sc(m);
    function drawOuts() {
      var list = ranked, q = oq.trim().toLowerCase();
      if (q) list = list.filter(function (x) { return (x.name + " " + x.symbol + " " + (x.downSymbol || "")).toLowerCase().indexOf(q) > -1; });
      var total = list.length; if (many && !showAll && !q) list = list.slice(0, 8);
      S.clear(outBox);
      if (!list.length) outBox.appendChild(el("p", { class: "t-meta", text: "No outcome matches “" + clip(oq, 30) + "”." }));
      list.forEach(function (x) {
        var w = words(m, x), d = x.invalid || sc(m) ? null : uf.conv(x.price, x) - uf.conv(priceAgo(m, x.index, DAY), x);
        var row = U.orow(x, { rank: x.invalid || x.noToAll ? null : rankOf[x.index], delta: x.invalid ? null : sc(m) ? delta24(m, x.index) : d, deltaText: d == null ? null : uf.delta(d),
          value: sc(m) ? F.cents(x.price) : w.value, sub: sc(m) ? null : w.sub, p: w.p,
          actions: multi && tradable(m), yes: w.yes || "Yes", no: w.no || "No", swatch: colorOf[x.index],
          onYes: function () { select(x.index, 0, true); }, onNo: function () { select(x.index, 1, true); } });
        if (x.index === cur.o) row.classList.add("is-selected");
        row.dataset.k = String(x.index);
        if (!x.invalid) row.addEventListener("click", function () { select(x.index, cur.side, false); });
        var meta = el("div", { class: "ap-out__meta" }, el("span", { class: "t-mono", text: x.symbol }), U.addr(x.token, { what: x.symbol + " token address" }));
        if (x.down) { meta.appendChild(el("span", { class: "t-mono", text: x.downSymbol })); meta.appendChild(U.addr(x.down, { what: x.downSymbol + " token address" })); }
        if (x.invalid) meta.appendChild(el("span", { text: "Redeems at 1 if Reality.eth answers Invalid." }));
        else if (tradable(m)) {
          meta.appendChild(demoLink("Add liquidity", "Adds liquidity to the " + x.symbol + "/" + cs(m) + " pool (not wired in this concept)."));
          meta.appendChild(demoLink("View pool", "Opens the " + x.symbol + "/" + cs(m) + " pool (not wired in this concept)."));
          meta.appendChild(demoLink("New conditional market", "Starts a market whose collateral is the " + x.symbol + " token, so it pays out only if “" + clip(x.name, 40) + "” " + (isSet(m) ? "scores high" : "wins") + " (not wired in this concept)."));
        }
        outBox.appendChild(el("div", { class: "ap-out" }, row, meta));
      });
      moreBtn.textContent = showAll ? "Show top 8" : "Show all " + total + " outcomes";
      moreBtn.hidden = !many || !!q;
    }
    drawOuts();
    if (many && cur.o != null && rankOf[cur.o] > 8) { showAll = true; drawOuts(); }

    // ---- rail: ticket, mint/merge/redeem, specialist app
    var tbox = el("div"); rail.appendChild(tbox);
    function drawTicket() {
      S.clear(tbox);
      if (!tradable(m)) { tbox.appendChild(resolvedPanel(m)); return; }
      tradeTicket(tbox, m, cur);
    }
    var mmr = mmrPanel(m, cur);
    function select(k, side, fromButton) {
      if (m.outcomes[k].invalid) return;
      cur.o = k; cur.side = side;
      $$(".ap-out .s-orow", outBox).forEach(function (r) { r.classList.toggle("is-selected", r.dataset.k === String(k)); });
      drawTicket(); mmr.redraw();
      try { history.replaceState(null, "", "#m=" + m.id + "&o=" + k + (side ? "&side=1" : "")); } catch (e) { /* file:// fine */ }
      if (fromButton && window.innerWidth <= 960) tbox.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
    drawTicket();
    rail.appendChild(mmr.el);
    curRail = rail; if (window.ResizeObserver) new ResizeObserver(function () { railFit(rail); }).observe(rail); railFit(rail);
    if (app.id !== "app") {
      rail.appendChild(el("section", { class: "s-card s-card--pad ap-spec-card" },
        el("div", { class: "s-row" }, U.avatar(app.id, "ink"), el("div", {}, el("span", { class: "s-spec", text: "Specialist app" }), el("b", { text: app.name }))),
        el("p", { class: "t-meta", style: { color: "var(--text-2)", lineHeight: "1.5" }, text: app.blurb + " The same market, address and tokens; a view built for this kind of question." }),
        el("a", { class: "s-btn s-btn--secondary s-btn--block", href: specialistHref(m, cur.o) }, "Open in " + app.name, el("span", { html: S.icon("arrow-right", 16), style: { display: "inline-flex" } }))));
    }

    // ---- B: lifecycle + record tabs
    var steps = D.lifecycleOf(m).map(function (s, i) {
      var t = s.time;
      if (i === 3 && (m.state === "waiting" || m.state === "dispute" || m.state === "pending")) t = new Date(NOW - 26 * HR).toISOString();
      if (i === 3 && m.state === "closed") t = new Date(Date.parse(m.openingDate) + DAY).toISOString();
      if (i === 4 && m.state === "dispute") t = new Date(NOW - 5 * HR).toISOString();
      return { label: s.label, done: s.done, current: s.current, time: t };
    });
    B.appendChild(el("section", { class: "s-card s-card--pad ap-lc", attrs: { "aria-label": "Lifecycle" } },
      el("div", { class: "ap-cardhead" }, el("div", {}, el("span", { class: "s-spec", text: "Lifecycle · step " + (stage(m) + 1) + " of 7" }), el("h2", { class: "t-h3", text: st.label })), U.stateBadge(m.state)),
      U.timeline(steps), el("p", { class: "t-meta ap-tnote", text: st.note + " " + nextStep(m) })));

    var ev = m._events, rel = related(m);
    var TABS = [{ id: "details", label: "Contract" }, { id: "activity", label: "Activity", count: ev.length }, { id: "positions", label: "Positions", count: m._holders.length }, { id: "resolution", label: "Resolution" }, { id: "related", label: "Related", count: rel.length }, { id: "json", label: "JSON" }];
    var ai = 0; TABS.forEach(function (t, i) { if (t.id === p.tab) ai = i; });
    var tabsCard = el("section", { class: "s-card ap-tabscard", attrs: { "aria-label": "Market record" } });
    var panel = el("div", { class: "ap-tabpanel", attrs: { role: "tabpanel" } });
    U.tabs(tabsCard, TABS, function (t) { drawTab(t.id); try { history.replaceState(null, "", "#m=" + m.id + "&o=" + cur.o + "&tab=" + t.id); } catch (e) { /* fine */ } }, ai);
    tabsCard.appendChild(panel); B.appendChild(tabsCard);
    function drawTab(id) {
      S.clear(panel);
      if (id === "details") return tabDetails(panel, m, cur);
      if (id === "activity") return tabActivity(panel, m, ev);
      if (id === "positions") return tabPositions(panel, m);
      if (id === "resolution") return tabResolution(panel, m);
      if (id === "json") return tabJson(panel, m, cur);
      return tabRelated(panel, m, rel);
    }
    drawTab(TABS[ai].id);
    if (p.tab) setTimeout(function () { tabsCard.scrollIntoView({ block: "start" }); }, 0);
  }
  /* units: what a price means for each market type (charts, 24h moves, the LEADING stat) */
  // price -> chance for multi-winner outcomes: shift in log-odds so the series ends exactly on the outcome's chance
  // (the mapping Opportunity uses, so both pages show the same history and 24h moves)
  function lg(p) { p = Math.min(.9999, Math.max(1e-4, p)); return Math.log(p / (1 - p)); }
  function toChance(p, o) { return o && o.chance != null ? 1 / (1 + Math.exp(-(lg(p) + lg(o.chance) - lg(o.price)))) : p; }
  function pts(d) { return (d > 0 ? "+" : d < 0 ? "−" : "±") + F.num(Math.abs(d * 100), 1) + " pts"; }
  function unitFn(m) {
    var top = function (series, of, what) { return what + " · top " + series.length + " of " + of; };
    if (sc(m)) { var r0 = m.range; return { conv: function (p) { return r0.min + (r0.max - r0.min) * p; }, fmt: function (v) { return fmtUnit(m, v); }, delta: function (d) { return F.signedNum(d, 2); },
      spec: "Forecast history", title: function () { return "Implied " + (m.range.unit || "value"); }, caption: "The forecast is the UP price mapped onto the range." }; }
    if (isSet(m)) { var r = m.range; return { conv: function (p) { return r.min + (r.max - r.min) * p; }, fmt: function (v) { return F.num(v, 2); }, delta: function (d) { return F.signedNum(d, 2); },
      spec: "Score history", title: function (s) { return top(s, m.set, "Expected panel score"); },
      caption: "UP price = expected score ÷ 10; UP + DOWN = 1 " + m.collateral + "." }; }
    if (isRisk(m)) { var k = m.riskScale; return { conv: function (p, o) { return o && o.noToAll ? p : 1 - Math.pow(1 - toChance(p, o), 4); }, fmt: function (v) { return F.pct(v, 1); }, delta: pts,
      spec: "Default chance history", title: function (s) { return top(s, real(m).length - 1, "Default chance per year"); },
      caption: "1 sDAI is split between the assets that default, so a token trades a little under its quarterly default chance (here × " + F.num(k, 2) + "). Per year = 1 − (1 − quarterly)⁴." }; }
    if (multiCat(m)) { var n = m.slots || 1, inv = invP(m), f = m.outcomes[6] || leader(m);
      return { conv: function (p, o) { return toChance(p, o); }, fmt: F.pct0, delta: pts,
        spec: "Chance history", title: function (s) { return top(s, real(m).length, "Chance of selection"); },
        caption: "A funded share redeems 1/" + n + " sDAI, so chance ≈ price × " + n + ": " + shortName(f) + " at " + F.cents1(f.price) + " is about " + F.pct0(f.chance) + "." }; }
    if (m.type === "multi-scalar") return { conv: function (p) { return p; }, fmt: F.pct0, delta: pts, spec: "Price history",
      title: function (s) { return "Expected share · " + (s.length < real(m).length ? "top " + s.length + " of " : "all ") + real(m).length; },
      caption: "Each token redeems its item's share of the answered total, so a price is the expected share." };
    return { conv: function (p) { return p; }, fmt: F.pct0, delta: function (d) { return F.signed(d, 1); }, spec: "Price history",
      title: function (s) { return isYesNo(m) ? "Chance of Yes" : "Top " + s.length + " of " + real(m).length + " outcomes"; },
      caption: "A price is the market's probability for that outcome." };
  }
  function seriesFor(m, uf) {
    uf = uf || unitFn(m);
    if (isYesNo(m)) return [{ name: "Yes", values: hist(m, 0), color: "var(--c-yes)", k: 0 }];
    if (sc(m)) { var r = m.range; return [{ name: "Forecast", values: hist(m, 1).map(function (q) { return [q[0], r.min + (r.max - r.min) * q[1]]; }), color: "var(--c1)", k: 1 }]; }
    return real(m).filter(function (o) { return !o.noToAll; }).sort(function (a, b) { return b.price - a.price; }).slice(0, 4).map(function (o, i) {
      return { name: clip(o.name, 34), short: o.proposal || o.symbol, values: hist(m, o.index).map(function (q) { return [q[0], +uf.conv(q[1], o).toFixed(5)]; }), color: PAL[i], k: o.index };
    });
  }
  function slice(series, range) {
    var ms = { "1d": DAY, "1w": 7 * DAY, "1m": 30 * DAY }[range]; if (!ms) return series;
    return series.map(function (s) { var v = s.values.filter(function (q) { return q[0] >= NOW - ms; }); return { name: s.name, short: s.short, color: s.color, k: s.k, values: v.length > 1 ? v : s.values.slice(-2) }; });
  }
  function nextStep(m) {
    if (m.state === "not-open") return "Reports open " + F.date(m.openingDate) + " (" + F.ago(m.openingDate) + ").";
    if (m.state === "open") return "The first answer starts a 3.5-day challenge window.";
    if (m.state === "waiting") return "If nobody answers differently, it becomes final " + F.ago(NOW + 58 * HR) + ".";
    if (m.state === "dispute") return "Kleros jurors rule; the market resolves to their answer.";
    if (m.state === "pending") return "Anyone can send the resolve transaction.";
    return "";
  }
  function resolvedPanel(m) {
    var p = el("section", { class: "s-panel ap-resolved", attrs: { "aria-label": "Resolution" } });
    p.appendChild(el("div", { class: "s-panel__head" }, U.stateBadge(m.state), el("span", { class: "t-meta", text: "#" + m.id })));
    if (m.state === "closed") {
      var w = leader(m);
      p.appendChild(el("div", {}, el("span", { class: "s-spec", text: "Resolved answer" }), el("div", { class: "t-amount u-mt-2", text: answerOf(m) })));
      p.appendChild(el("p", { class: "t-meta", style: { color: "var(--text-2)", lineHeight: "1.5" }, text: w.symbol + " redeems 1:1 for " + m.collateral + ". Every other outcome token is now worth 0." }));
      p.appendChild(el("button", { class: "s-btn s-btn--lg s-btn--block", text: "Redeem " + w.symbol, attrs: { type: "button", "data-demo": "Sample only: no transaction is sent." } }));
    } else {
      var r = m.range, a = m.answer != null ? m.answer : scalarValue(m), up = r ? Math.max(0, Math.min(1, (a - r.min) / (r.max - r.min))) : null;
      p.appendChild(el("div", {}, el("span", { class: "s-spec", text: "Final answer on Reality.eth" }), el("div", { class: "t-amount u-mt-2", text: answerOf(m) })));
      p.appendChild(el("p", { class: "t-meta", style: { color: "var(--text-2)", lineHeight: "1.5" }, text: "Trading has ended. One transaction resolves the market and anyone can send it." + (up != null ? " Then UP redeems at " + F.num(up, 3) + " and DOWN at " + F.num(1 - up, 3) + " " + m.collateral + " per token." : "") }));
      p.appendChild(el("button", { class: "s-btn s-btn--lg s-btn--block", text: "Resolve market", attrs: { type: "button", "data-demo": "Sample only: no transaction is sent." } }));
    }
    return p;
  }
  /* ======================= trade ticket (payout follows the market type) ======================= */
  // binary/categorical: a share redeems 1 · scalar: UP redeems the answer's position in the range ·
  // multi-categorical: 1/k (k = slots, or the number of assets that default) · multi-scalar: the item's share
  function tradeTicket(host, m, cur) {
    var o = m.outcomes[cur.o], coll = cs(m), SLIP = .01, amount = 0;
    var kind = isYesNo(m) ? "binary" : sc(m) ? "scalar" : isSet(m) ? "set" : multiCat(m) ? "multi" : m.type === "multi-scalar" ? "mscalar" : "cat";
    var tiles, side = cur.side ? 1 : 0, title = o.name, r = m.range;
    if (kind === "binary") { tiles = [{ label: "Yes", price: m.outcomes[0].price, k: 0 }, { label: "No", price: m.outcomes[1].price, k: 1 }]; side = cur.o === 1 ? 1 : 0; title = m.question; }
    else if (kind === "scalar") { tiles = [{ label: "UP", price: m.outcomes[1].price, k: 1 }, { label: "DOWN", price: m.outcomes[0].price, k: 0 }]; side = cur.o === 0 ? 1 : 0; title = m.question; }
    else if (kind === "set") tiles = [{ label: "UP · " + o.proposal, price: o.price }, { label: "DOWN · " + o.proposal, price: o.downPrice }];
    else if (kind === "cat") tiles = [{ label: "Yes · " + clip(o.name, 12), price: o.price }, { label: "No · " + clip(o.name, 12), price: Math.max(.001, 1 - o.price - invP(m)) }];
    else tiles = [{ label: "Buy · ask", price: o.price }, { label: "Sell · bid", price: o.price * (1 - .012) }];
    var sellMode = function () { return (kind === "multi" || kind === "mscalar") && side === 1; };
    var panel = el("section", { class: "s-panel s-ticket", attrs: { "aria-label": "Trade ticket" } });
    panel.appendChild(el("div", { class: "s-panel__head" }, el("span", { class: "s-row", style: { "--gap": "8px" } }, el("span", { html: S.glyph(m.appId === "app" ? "grid" : m.appId), style: { color: "var(--violet-2)", display: "inline-flex" } }), el("span", { class: "t-meta", text: F.usd(m.volume) + " Vol." })), el("span", { class: "t-meta", text: "#" + m.id + (kind === "set" || kind === "multi" || kind === "mscalar" || kind === "cat" ? " · outcome " + String(o.index + 1).padStart(2, "0") : "") })));
    panel.appendChild(el("h3", { class: "t-title", text: title }));
    var tbox = el("div", { class: "s-pricetiles" }), tEls = tiles.map(function (t, i) {
      var b = el("button", { class: "s-pricetile", attrs: { type: "button", "aria-pressed": String(i === side) } }, el("small", { text: t.label }), el("b", { text: F.cents1(t.price) }));
      b.addEventListener("click", function () { side = i; tEls.forEach(function (x, j) { x.setAttribute("aria-pressed", String(j === i)); }); calc(); });
      tbox.appendChild(b); return b;
    });
    panel.appendChild(tbox);
    var input = el("input", { attrs: { type: "text", inputmode: "decimal", placeholder: "$0", "aria-label": "Amount in " + coll, maxlength: "12" } });
    var chips = el("div", { class: "s-amountchips" }, [1, 5, 20, 100].map(function (c) {
      var b = el("button", { attrs: { type: "button" }, text: "+$" + c });
      b.addEventListener("click", function () { amount = Math.min(1e6, Math.round((amount + c) * 100) / 100); input.value = "$" + F.num(amount, 2); calc(); });
      return b;
    }));
    var rows = el("div", { class: "s-ticket__rows" }), warn = el("div", { class: "s-callout s-callout--warn ap-twarn", attrs: { hidden: true } });
    var conf = el("button", { class: "s-btn s-btn--lg", attrs: { type: "button" }, text: "Confirm" });
    var reset = el("button", { class: "s-icon-btn", attrs: { type: "button", "aria-label": "Clear amount" }, html: S.icon("close", 20) });
    input.addEventListener("input", function () { var v = parseFloat(input.value.replace(/[^0-9.]/g, "")); amount = isFinite(v) ? Math.min(1e6, v) : 0; calc(); });
    input.addEventListener("blur", function () { input.value = amount ? "$" + F.num(amount, 2) : ""; });
    reset.addEventListener("click", function () { amount = 0; input.value = ""; calc(); input.focus(); });
    conf.addEventListener("click", function () { S.toast(amount ? "Sample only: no transaction sent (" + conf.textContent.toLowerCase() + ", " + F.tok(amount, coll) + ")." : "Enter an amount first.", amount ? "info" : "alert"); });
    function line(k, v) { return el("div", {}, el("span", { text: k }), el("b", { text: v })); }
    function ret(pay) { var x = pay / amount - 1; return F.tok(pay, coll) + " (" + (Math.abs(x) < .005 ? "±0%" : F.signed(x, 0)) + ")"; }
    function calc() {
      var t = tiles[side], raw = amount / Math.max(m.liquidity, 1) * .25, imp = Math.min(raw, SLIP), sell = sellMode();
      var avg = sell ? t.price * (1 - imp) : Math.min(.999, t.price * (1 + imp)), sh = amount ? amount / avg : 0, a = !!amount;
      S.clear(rows);
      rows.appendChild(line("Average price", F.cents1(avg)));
      rows.appendChild(line(sell ? "Shares to sell" : "Shares", a ? F.num(sh, 2) : "—"));
      var L = [];
      if (sell) L.push(["You receive", F.tok(amount, coll)]);
      else if (kind === "binary") L.push(["If " + t.label, ret(sh)], ["Otherwise", "0 " + coll]);
      else if (kind === "cat") L.push([side ? "If " + clip(o.name, 14) + " loses" : "If " + clip(o.name, 14) + " wins", ret(sh)], ["Otherwise", "0 " + coll]);
      else if (kind === "scalar" || kind === "set") {
        var up = kind === "set" ? side === 0 : t.k === 1, fv = kind === "set" ? o.value : scalarValue(m), pos = (fv - r.min) / (r.max - r.min), step = (r.max - r.min) / 10;
        L.push(["At the forecast (" + (kind === "set" ? F.num(fv, 2) + "/10" : fmtUnit(m, fv)) + ")", a ? ret(sh * (up ? pos : 1 - pos)) : "—"]);
        var stepTxt = (Math.abs(step) >= 10000 ? F.compact(step, 1) : String(+step.toPrecision(3))) + (r.unit ? " " + r.unit : "");
        L.push([kind === "set" ? "Each panel point " + (up ? "up" : "down") : "Each " + (up ? "+" : "−") + stepTxt, a ? "+" + F.tok(sh / 10, coll) : "—"]);
        L.push(["Max (at " + (kind === "set" ? (up ? "10" : "0") + "/10" : fmtUnit(m, up ? r.max : r.min)) + ")", a ? F.tok(sh, coll) : "—"]);
        if (m.collSym) L.push(["If " + m.proposal + " is " + (m.parent.outcome === "Yes" ? "rejected" : "approved"), "void (" + coll + " = 0)"]);
      } else if (kind === "multi" && isRisk(m)) {
        if (o.noToAll) L.push(["If no asset defaults", ret(sh)], ["If any asset defaults", "0 " + coll]);
        else L.push(["If only " + o.asset + " defaults", ret(sh)], ["If 2 assets default", a ? F.tok(sh / 2, coll) : "—"], ["If it doesn't default", "0 " + coll]);
      } else if (kind === "multi") L.push(["If funded (1/" + m.slots + " each)", ret(sh / m.slots)], ["If not funded", "0 " + coll]);
      else if (kind === "mscalar") L.push(["At the expected share (" + F.pct0(o.price) + ")", ret(sh * o.price)], ["Max (all of the total)", a ? F.tok(sh, coll) : "—"]);
      L.forEach(function (x) { rows.appendChild(line(x[0], a ? x[1] : "—")); });
      rows.appendChild(line("Max slippage", F.pct(SLIP, 1)));
      var over = raw > SLIP; warn.hidden = !over; S.clear(warn);
      if (over) { warn.appendChild(el("span", { html: S.icon("alert", 16), style: { display: "inline-flex" } })); warn.appendChild(el("span", {}, el("b", { text: "Thin pool. " }), "Estimated price impact " + F.pct(raw, 1) + " is above your " + F.pct(SLIP, 1) + " slippage, so this order would revert. Lower the amount.")); }
      conf.disabled = over;
      conf.textContent = over ? "Lower the amount" : !a ? "Confirm" : sell ? "Sell " + shortName(o) : kind === "multi" || kind === "mscalar" ? "Buy " + shortName(o) : "Buy " + t.label;
      if (pool) pool.update(t, amount, sell);
    }
    panel.appendChild(el("div", { class: "s-panel s-panel--nested", style: { gap: "14px" } }, el("div", { class: "s-amount" }, el("label", { text: "Amount" }), input), chips, rows, warn, el("div", { class: "s-ticket__confirm" }, conf, reset)));
    var note = kind === "binary" ? "Yes and No add up to 100¢. Buying swaps " + coll + " for the outcome token in its pool."
      : kind === "cat" ? "Yes buys " + o.symbol + ". No buys every other outcome as one basket, so it pays 1 " + coll + " if this outcome loses."
      : kind === "set" ? "UP redeems the panel's score ÷ 10 and DOWN the rest; together 1 " + coll + ". See the payout at any score in Deep."
      : kind === "scalar" ? "UP gains as the answer rises toward " + fmtUnit(m, r.max) + "; DOWN gains as it falls. Together they redeem for 1 " + coll + "."
      : kind === "multi" && isRisk(m) ? "1 sDAI is split equally between the assets that default this quarter; No to All pays 1 sDAI if none do."
      : kind === "multi" ? "A funded share redeems 1/" + m.slots + " sDAI, because the payout is split across the " + m.slots + " funded proposals."
      : "Each token redeems its item's share of the answered total.";
    if (m.collSym) note = "Pay with " + coll + ": split sDAI on #" + m.parent.id + " first (1 sDAI → 1 YES_sDAI + 1 NO_sDAI). " + note;
    panel.appendChild(el("p", { class: "t-meta", text: note + " Sample prices; nothing is traded." }));
    if (kind === "set") panel.appendChild(el("a", { class: "s-link t-meta ap-tlink", href: specialistHref(m, cur.o) + "-payout" }, "Payout at any score, in Deep", el("span", { html: S.icon("arrow-right", 13), style: { display: "inline-flex" } })));
    var pool = poolPanel(m, coll);
    calc(); host.appendChild(panel); host.appendChild(pool.el);
  }
  /* pool depth: the selected token's constant-product pool (x · y = k), sized from the market's liquidity figure.
     Seer trades outcome tokens in AMM pools, so depth is a curve, not a ladder of resting orders. Sample figures. */
  function poolPanel(m, coll) {
    var L = Math.max(1, m.liquidity || 0), SIZES = [10, 50, 100, 500, 1000], CAP = .99; // the market's liquidity figure, read as this token's pool
    var p = el("section", { class: "s-panel ap-pool", attrs: { "aria-label": "Pool depth" } });
    var title = el("h3", { class: "t-title ap-pool__t" });
    p.appendChild(el("div", { class: "s-panel__head" }, el("div", {}, el("span", { class: "s-spec", text: "Pool depth" }), title), el("span", { class: "t-meta ap-pool__n", text: F.usd(L) + " liquidity" })));
    var bar = el("div", { class: "ap-pool__bar", attrs: { role: "img" } }), legend = el("div", { class: "ap-pool__legend" });
    var tbl = el("table", { class: "ap-pool__rows" }), hdr = el("tr"), tb = el("tbody");
    ["Buy", "Avg price", "Price after", "Impact"].forEach(function (h) { hdr.appendChild(el("th", { text: h, attrs: { scope: "col" } })); });
    tbl.appendChild(el("thead", {}, hdr)); tbl.appendChild(tb);
    p.appendChild(bar); p.appendChild(legend); p.appendChild(tbl);
    p.appendChild(el("p", { class: "t-meta", text: "Constant-product pool (sample): " + coll + " reserve × token reserve = k, so each trade moves the price along the curve. Reserves are sized from this market's liquidity figure; the +$ chips in the slip pick a row. No token costs more than $1: past $0.99 the rest fills by minting full sets (· mint)." }));
    function px(v) { return v >= 1 ? "≥ $1.00" : F.cents1(v); }
    function update(tile, amount, sell) {
      var price = Math.min(.999, Math.max(.001, tile.price)), x = L / 2, y = x / price, k = x * y; // at the spot price the pool holds equal value on each side
      var tok = String(tile.label).split(" · ")[0];
      title.textContent = tok + " · " + F.cents1(price) + " spot";
      bar.style.setProperty("--p", String(y / (x + y)));
      bar.setAttribute("aria-label", F.num(y, 0) + " " + tok + " tokens against " + F.tok(x, coll, 0) + " in the pool");
      S.clear(legend);
      legend.appendChild(el("span", {}, el("i", { class: "ap-pool__sw ap-pool__sw--tok" }), F.num(y, 0) + " " + tok));
      legend.appendChild(el("span", {}, el("i", { class: "ap-pool__sw" }), F.tok(x, coll, 0)));
      hdr.firstChild.textContent = sell ? "Sell" : "Buy";
      S.clear(tb);
      SIZES.forEach(function (a) {
        var avg, after, imp, minted = false;
        if (sell) { var tin = a / price, y1 = y + tin, x1 = k / y1; avg = (x - x1) / tin; after = x1 / y1; imp = after / price - 1; }
        else {
          // arbitrage bound: once the pool price reaches CAP, minting a full set for $1 is cheaper, so the rest of the order fills by minting
          var xc = Math.sqrt(CAP * k), room = Math.max(0, xc - x), viaPool = Math.min(a, room), x2 = x + viaPool, y2 = k / x2;
          var out = (y - y2) + (a - viaPool); minted = a > room;
          avg = a / out; after = minted ? CAP : x2 / y2; imp = after / price - 1;
        }
        var mag = Math.abs(imp);
        tb.appendChild(el("tr", { class: amount === a ? "is-selected" : "", attrs: amount === a ? { "aria-current": "true" } : null },
          el("td", { text: "$" + F.num(a, 0) }), el("td", { text: px(avg) }), el("td", { text: px(after) + (minted ? " · mint" : "") }),
          el("td", { class: mag > .05 ? "t-neg" : mag > .01 ? "t-warn" : "", text: (imp < 0 ? "−" : "+") + F.pct(mag, mag < .1 ? 1 : 0) })));
      });
    }
    return { el: p, update: update };
  }
  function mmrPanel(m, cur) {
    var mode = m.state === "closed" ? "redeem" : "mint", amt = 100, c = cs(m);
    var p = el("section", { class: "s-panel ap-mmr", attrs: { "aria-label": "Mint, merge or redeem" } });
    var input = el("input", { attrs: { type: "text", inputmode: "decimal", value: "100", "aria-label": "Amount in " + c, maxlength: "12" } });
    var body = el("div", { class: "ap-mmr__lines" }), btn = el("button", { class: "s-btn s-btn--block", attrs: { type: "button" } });
    input.addEventListener("input", function () { amt = Math.min(1e9, parseFloat(input.value.replace(/[^0-9.]/g, "")) || 0); draw(); });
    input.addEventListener("blur", function () { input.value = amt ? F.num(amt, 2) : ""; });
    btn.addEventListener("click", function () { S.toast(amt ? "Sample only: no transaction sent (" + btn.textContent.toLowerCase() + ")." : "Enter an amount first.", amt ? "info" : "alert"); });
    p.appendChild(el("div", { class: "s-panel__head" }, el("span", { class: "s-spec", text: isSet(m) ? "Positions · " + m.outcomes[cur.o].proposal : "Positions" }), U.seg([["mint", "Mint"], ["merge", "Merge"], ["redeem", "Redeem"]], mode, function (v) { mode = v; draw(); }, "Position action")));
    p.appendChild(el("div", { class: "s-amount" }, el("label", { text: mode === "mint" ? "Deposit" : "Sets" }), input));
    p.appendChild(body); p.appendChild(btn);
    function line(k, v) { return el("div", {}, el("span", { text: k }), el("b", { text: v })); }
    function draw() {
      // a scalar round mints per proposal: 1 sUSDS -> 1 UP_Pxx + 1 DOWN_Pxx; everything else mints one of every outcome token
      var o = m.outcomes[cur.o], toks = isSet(m) ? [o.symbol, o.downSymbol] : m.outcomes.map(function (x) { return x.symbol; }), n = toks.length;
      S.clear(body); btn.disabled = false;
      var hs = p.querySelector(".s-panel__head .s-spec"); if (hs && isSet(m)) hs.textContent = "Positions · " + o.proposal;
      p.querySelector(".s-amount label").textContent = mode === "mint" ? "Deposit" : mode === "merge" ? "Full sets" : "Tokens";
      if (mode === "mint") {
        body.appendChild(line("You deposit", F.tok(amt, c)));
        body.appendChild(line("You receive", isSet(m) || n === 2 ? F.num(amt, 0) + " " + toks[0] + " + " + F.num(amt, 0) + " " + toks[1] : F.num(amt, 2) + " of each of " + n + " tokens"));
        body.appendChild(el("div", { class: "ap-toks" }, toks.slice(0, 10).map(function (s) { return el("span", { class: "s-tag", text: s }); }), n > 10 ? el("span", { class: "s-tag", text: "+" + (n - 10) }) : null));
        body.appendChild(el("p", { class: "t-meta", text: (isSet(m) ? "Each proposal is its own condition, so a set is one UP and one DOWN, worth 1 " + c + " together. " : "A full set is always worth 1 " + c + ", so minting never moves a price. ")
          + (m.collSym ? "Get " + c + " by splitting sDAI on #" + m.parent.id + " first." : "") }));
        btn.textContent = "Mint " + F.num(amt, 0) + " sets";
      } else if (mode === "merge") {
        body.appendChild(line("You return", F.num(amt, 2) + " × " + n + " tokens")); body.appendChild(line("You receive", F.tok(amt, c)));
        body.appendChild(el("p", { class: "t-meta", text: "Merging needs one of every outcome token" + (isSet(m) ? " of " + o.proposal + " (" + toks.join(" + ") + ")." : m.outcomes.some(function (x) { return x.invalid; }) ? ", INVALID included." : ".") }));
        btn.textContent = "Merge " + F.num(amt, 0) + " sets";
      } else {
        if (m.state === "closed") { var w = leader(m); body.appendChild(line("You redeem", F.num(amt, 2) + " " + w.symbol)); body.appendChild(line("You receive", F.tok(amt, c))); btn.textContent = "Redeem " + w.symbol; }
        else { body.appendChild(el("p", { class: "t-meta", text: "Redeem opens once the market resolves. " + nextStep(m) })); btn.textContent = "Redeem"; btn.disabled = true; }
      }
    }
    draw();
    return { el: p, redraw: draw };
  }
  function tabDetails(panel, m, cur) {
    var c = D.chain(m.chain), so = m.outcomes[cur.o];
    var nTok = isSet(m) ? m.set * 2 : m.outcomes.length;
    panel.appendChild(U.kv([
      ["Market", el("span", {}, "#" + m.id + " · " + tname(m) + " · " + (isSet(m) ? m.set + " proposals, " + nTok + " outcome tokens" : m.outcomes.length + " outcomes"))],
      ["Market contract", U.addr(m.address, { chars: 6, what: "market contract address" })],
      isSet(m) ? ["Condition ID · " + so.proposal, el("span", { class: "s-row", style: { "--gap": "8px" } }, U.addr(so.conditionId, { chars: 6, what: "condition ID" }), el("span", { class: "t-meta", text: "one per proposal" }))]
        : ["Condition ID", U.addr(m.conditionId, { chars: 6, what: "condition ID" })],
      isSet(m) ? ["Reality.eth question · " + so.proposal, U.addr(so.questionId, { chars: 6, what: "question ID" })] : ["Reality.eth question", U.addr(m.questionId, { chars: 6, what: "question ID" })],
      ["Oracle", "Reality.eth, with Kleros as arbitrator"],
      ["Collateral", m.collSym ? el("span", {}, m.collSym + " · the “" + m.parent.outcome + "” token of ", mlink(D.market(m.parent.id)), " (backed by " + m.collateral + ")") : m.collateral + " · " + COLL[m.collateral].name],
      ["Chain", el("span", { class: "s-row", style: { "--gap": "8px" } }, U.chainBadge(m.chain), el("span", { class: "t-meta", text: "chain ID " + c.chainId }))],
      ["Token standard", m.wrapper],
      ["Creator", U.addr(m.creator, { chars: 6, href: "#a=" + m.creator })],
      ["Created", F.dateTime(m.created)],
      ["Reports open", F.dateTime(m.openingDate) + " · " + F.ago(m.openingDate)],
      m.parent ? ["Parent market", el("span", {}, mlink(D.market(m.parent.id)), " · pays out if “" + m.parent.outcome + "”")] : null,
      ["Kleros Curate", el("span", { class: "s-row", style: { "--gap": "8px" } }, U.verifyBadge(m.verify), el("span", { class: "t-meta", text: VERIFY[m.verify].note }))]
    ]));
    panel.appendChild(el("h3", { class: "ap-sub", text: "Outcome tokens · ERC-20" + (isSet(m) ? " · " + nTok + " (an UP and a DOWN per proposal)" : "") }));
    var cols = isSet(m) ? [
      { key: "index", label: "#", render: function (o) { return el("span", { class: "t-mono t-3", text: String(o.index + 1).padStart(2, "0") }); } },
      { key: "name", label: "Proposal", class: "ap-wrap", render: function (o) { return clip(o.name, 40); } },
      { key: "token", label: "UP token", render: function (o) { return el("span", { class: "ap-tokcell" }, el("span", { class: "t-mono", text: o.symbol }), U.addr(o.token, { chars: 4, what: o.symbol + " token address" })); } },
      { key: "down", label: "DOWN token", render: function (o) { return el("span", { class: "ap-tokcell" }, el("span", { class: "t-mono", text: o.downSymbol }), U.addr(o.down, { chars: 4, what: o.downSymbol + " token address" })); } },
      { key: "price", label: "UP · score", num: true, sort: true, render: function (o) { return F.cents(o.price) + " · " + F.num(o.value, 2); } }
    ] : [
      { key: "index", label: "#", render: function (o) { return el("span", { class: "t-mono t-3", text: String(o.index) }); } },
      { key: "name", label: "Outcome", class: "ap-wrap", render: function (o) { return clip(o.name, 48); } },
      { key: "symbol", label: "Symbol", render: function (o) { return el("span", { class: "t-mono", text: o.symbol }); } },
      { key: "token", label: "Token address", render: function (o) { return U.addr(o.token, { chars: 6, what: o.symbol + " token address" }); } },
      { key: "price", label: sc(m) ? "Price" : multiCat(m) && !isRisk(m) ? "Chance · price" : multiCat(m) ? "Price" : "Price · chance", num: true, sort: true, render: function (o) { return sc(m) ? F.cents(o.price) : multiCat(m) && !isRisk(m) ? (o.invalid ? words(m, o).value : words(m, o).value + " · " + words(m, o).sub) : multiCat(m) ? F.cents1(o.price) + " · " + words(m, o).value + (!o.noToAll && !o.invalid ? "/yr" : "") : words(m, o).value; } }
    ];
    var t = U.table(panel, cols, { rows: isSet(m) ? real(m) : m.outcomes, compact: true, caption: "Outcome tokens" });
    var rows = $$("tbody tr", t.table); if (rows[cur.o]) rows[cur.o].classList.add("is-selected");
  }
  function tabJson(panel, m, cur) {
    var o = m.outcomes[cur.o];
    var obj = { sample: true, id: +m.id, type: m.type, markets: m.set || undefined, question: m.question, chain: { name: chainName(m.chain), chainId: D.chain(m.chain).chainId },
      collateral: cs(m), parent: m.parent ? { market: +m.parent.id, outcome: m.parent.outcome } : undefined, state: m.state, reportsOpen: m.openingDate,
      address: m.address, conditionId: isSet(m) ? undefined : m.conditionId, questionId: isSet(m) ? undefined : m.questionId, oracle: "Reality.eth", arbitrator: "Kleros",
      range: m.range ? [m.range.min, m.range.max] : undefined, slots: m.slots || undefined,
      outcomes: real(m).slice(0, isSet(m) || m.outcomes.length > 12 ? 3 : 12).map(function (x) {
        return isSet(m) ? { proposal: x.proposal, conditionId: x.conditionId, up: { token: x.token, symbol: x.symbol, price: x.price }, down: { token: x.down, symbol: x.downSymbol, price: x.downPrice }, expectedScore: x.value }
          : { index: x.index, name: x.name, token: x.token, symbol: x.symbol, price: x.price, chance: x.chance != null ? +x.chance.toFixed(4) : undefined };
      }) };
    var txt = JSON.stringify(obj, null, 2), more = real(m).length - obj.outcomes.length;
    panel.appendChild(el("div", { class: "s-row s-row--between" }, el("span", { class: "t-meta", text: "Read-only market record for scripts and agents. Same fields as this page" + (more > 0 ? "; " + more + " more outcomes in the full export." : ".") }),
      el("span", { class: "s-row", style: { "--gap": "8px" } }, el("button", { class: "s-btn s-btn--ghost s-btn--sm", attrs: { type: "button", "data-copy": txt }, html: S.icon("copy", 14) }, "Copy JSON"))));
    panel.appendChild(el("pre", { class: "ap-json", text: txt, attrs: { tabindex: "0", "aria-label": "Market record as JSON" } }));
  }
  function tabActivity(panel, m, ev) {
    var kinds = [["all", "All"], ["trade", "Trades"], ["liq", "Liquidity"], ["set", "Mint and merge"], ["oracle", "Oracle"]];
    var KIND = { Swap: "trade", "Add liquidity": "liq", Split: "set", Merge: "set", Redeem: "set", Answer: "oracle", Dispute: "oracle" };
    var box = el("div"), tbl;
    panel.appendChild(el("div", { class: "s-row s-row--between" }, U.seg(kinds, "all", function (v) { tbl.update(v === "all" ? ev : ev.filter(function (e) { return KIND[e.type] === v; })); }, "Event type")));
    panel.appendChild(box);
    tbl = U.table(box, [
      { key: "type", label: "Event", render: function (e) { return evTag(e.type === "Split" ? "Split" : e.type); } },
      { key: "outcome", label: "Outcome", render: function (e) { return clip(e.outcome, 30); } },
      { key: "side", label: "Side", render: function (e) { return e.type === "Swap" ? (e.side === "buy" ? "Buy" : "Sell") : "—"; } },
      { key: "amount", label: "Amount", num: true, sort: true, render: function (e) { return F.tok(e.amount, e.collateral); } },
      { key: "price", label: "Price", num: true, render: function (e) { return e.price != null ? F.cents(e.price) : "—"; } },
      { key: "from", label: "From", render: function (e) { return U.addr(e.from, { href: "#a=" + e.from }); } },
      { key: "tx", label: "Tx hash", render: function (e) { return U.addr(e.tx, { chars: 6, what: "transaction hash" }); } },
      { key: "block", label: "Block", num: true, render: function (e) { return F.num(e.block); } },
      { key: "time", label: "Age", num: true, sort: function (e) { return Date.parse(e.time); }, render: function (e) { return F.ago(e.time); } }
    ], { rows: ev, compact: true, caption: "Event log", empty: { title: "No events of this kind", text: "Try another event type." } });
    panel.appendChild(el("p", { class: "t-meta", text: "Swaps, splits, merges and redemptions come from the market's pools and the Conditional Tokens contract; answers and disputes from Reality.eth and Kleros." }));
  }
  function tabPositions(panel, m) {
    var hs = m._holders;
    panel.appendChild(el("div", { class: "s-callout" }, el("span", { html: S.icon("wallet", 16), style: { display: "inline-flex" } }),
      el("span", {}, el("b", { text: "Your positions. " }), "Connect a wallet to see your balances in this market, including tokens held outside the pools. ", demoLink("Connect wallet", "Wallet connection is not wired in this concept."))));
    U.table(panel, [
      { key: "rank", label: "#", render: function (h) { return el("span", { class: "t-mono t-3", text: String(hs.indexOf(h) + 1).padStart(2, "0") }); } },
      { key: "address", label: "Holder", render: function (h) { return el("span", { class: "ap-who" }, h.label ? el("b", { text: h.label }) : null, U.addr(h.address, { href: "#a=" + h.address })); } },
      { key: "outcome", label: "Outcome", render: function (h) { return clip(h.outcome, 34); } },
      { key: "share", label: "Share of open interest", num: true, sort: true, render: function (h) { return el("span", { class: "ap-share" }, el("span", { class: "s-pbar s-pbar--thin", style: { "--p": String(Math.min(1, h.share / .4)) } }, el("i")), F.pct(h.share, 1)); } },
      { key: "balance", label: "Balance", num: true, sort: true, render: function (h) { return F.tok(h.balance, m.collateral, 0); } }
    ], { rows: hs, compact: true, sortKey: "balance", sortDir: "desc", onRow: function (h) { go("a=" + h.address); }, caption: "Top holders" });
    panel.appendChild(el("p", { class: "t-meta", text: "Top 10 addresses by position size, in collateral terms. Agents are labelled where their operators registered a name." }));
  }
  function tabResolution(panel, m) {
    var tpl = isSet(m) ? "Number (uint), one question per proposal (" + m.set + ")" : { categorical: "Single select", "multi-categorical": "Multiple select", scalar: "Number (uint)", "multi-scalar": "Number, one question per item" }[m.type];
    var r = queueLine(m), act = r.action && STAGE[m.state] >= 2 && m.state !== "closed";
    var status = m.state === "not-open" ? "No answers yet. " + nextStep(m) : m.state === "closed" ? "Resolved: " + answerOf(m) + ". Winning tokens redeem 1:1 for " + m.collateral + "." : r.text;
    panel.appendChild(el("div", { class: "s-callout s-callout--violet ap-status" }, el("span", { html: S.icon(m.state === "dispute" ? "scale" : "clock", 16), style: { display: "inline-flex" } }),
      el("span", { class: "s-grow" }, el("b", { text: D.state(m.state).label + ". " }), status),
      act ? el("button", { class: "s-btn s-btn--sm" + (r.primary ? "" : " s-btn--secondary"), text: r.action, attrs: { type: "button", "data-demo": r.demo } }) : null));
    var rows = [
      ["Resolution source", el("span", { class: "s-row", style: { "--gap": "8px" } }, "Reality.eth", U.addr(m.questionId, { chars: 6, what: "question ID" }))],
      ["Question template", tpl],
      ["Reports open", F.dateTime(m.openingDate)],
      ["Answer timeout", "3.5 days after each answer"],
      ["Minimum bond", "10 xDAI; each new answer must at least double the last bond"],
      ["Arbitrator", "Kleros, if anyone pays for arbitration before the timeout"],
      ["Payout", isSet(m) ? "Per proposal: UP redeems the panel's score ÷ 10 (0–10, clamped) and DOWN the rest, so a pair is always worth 1 " + m.collateral
        : sc(m) ? "UP and DOWN split 1 " + cs(m) + " by where the answer falls in " + fmtUnit(m, m.range.min) + " to " + fmtUnit(m, m.range.max) + (m.collSym ? ". " + m.collSym + " is void unless #" + m.parent.id + " resolves " + m.parent.outcome : "")
        : isRisk(m) ? "1 " + m.collateral + " split equally between the assets that default in the quarter; No to All redeems 1 if none do"
        : multiCat(m) ? "1 " + m.collateral + " split equally between the outcomes answered true" + (m.slots ? ": 1/" + m.slots + " each for the " + m.slots + " funded proposals" : "")
        : m.type === "multi-scalar" ? "Each token redeems its answered number ÷ the sum of all answers, so the tokens always add up to 1 " + m.collateral
        : "The winning token redeems 1:1 for " + m.collateral + (m.futarchy && m.noInvalid ? ". No Invalid token: an invalid answer resolves as not approved" : "")]
    ];
    if (m.type === "categorical" || m.type === "multi-categorical") rows.push(["Invalid", "If the question can't be answered as written, INVALID redeems at 1"]);
    if (m.state === "waiting" || m.state === "dispute" || m.state === "pending" || m.state === "closed") rows.splice(1, 0, ["Current answer", el("b", { text: answerOf(m) })]);
    panel.appendChild(U.kv(rows));
    panel.appendChild(el("p", { class: "t-meta", text: "Timeout, bond and court are sample values for this concept." }));
  }
  function related(m) {
    var out = [], seen = {};
    function add(x, why) { if (x && x !== m && !seen[x.id]) { seen[x.id] = 1; out.push({ m: x, why: why }); } }
    if (m.parent) add(D.market(m.parent.id), "Parent market · this one pays out only if it resolves " + m.parent.outcome);
    MARKETS.forEach(function (x) { if (x.parent && x.parent.id === m.id) add(x, "Conditional on “" + x.parent.outcome + "”"); });
    if (m.parent) MARKETS.forEach(function (x) { if (x.parent && x.parent.id === m.parent.id) add(x, "The other branch of " + "#" + m.parent.id); });
    if (m.round) MARKETS.forEach(function (x) { if (x.round === m.round) add(x, "Same grant round · " + D.round4.name); });
    if (m.round) add(D.market("2843"), "Lattice DAO's decision on this round's budget (LIP-31)");
    if (m.proposal === "LIP-31") { add(D.market("2841"), "Forecasts the round this budget would fund"); add(D.market("2842"), "Forecasts which proposals the round would fund"); }
    if (!out.length) MARKETS.filter(function (x) { return x.category === m.category; }).slice(0, 4).forEach(function (x) { add(x, "Same category · " + m.category); });
    return out;
  }
  function tabRelated(panel, m, rel) {
    if (!rel.length) { panel.appendChild(U.empty({ title: "No related markets", text: "Nothing in the sample links to this market yet.", motif: "dotgrid", motifOpts: { cols: 12, rows: 6, cell: 20, dissolve: .55 } })); return; }
    var list = el("div", { class: "ap-related" });
    rel.forEach(function (x) {
      list.appendChild(el("a", { class: "ap-rel", href: "#m=" + x.m.id }, avatarSm(x.m),
        el("span", { style: { minWidth: "0" } }, el("b", { text: x.m.question }), el("small", { text: "#" + x.m.id + " · " + x.why })),
        el("span", { class: "ap-rel__end" }, U.stateBadge(x.m.state), el("span", { text: leadText(x.m) }))));
    });
    panel.appendChild(list);
  }

  /* ======================= address record ======================= */
  function showAddress(a) {
    var lc = a.toLowerCase();
    for (var i = 0; i < MARKETS.length; i++) {
      var m = MARKETS[i];
      if (m.address.toLowerCase() === lc) { location.replace("#m=" + m.id + "&tab=details"); return; }
      for (var k = 0; k < m.outcomes.length; k++) if (m.outcomes[k].token.toLowerCase() === lc) { location.replace("#m=" + m.id + "&o=" + k + "&tab=details"); return; }
    }
    enterView();
    var e = ADDR[lc];
    document.title = "Address " + F.addr(a, 4) + " · Seer App (concept)";
    var wrap = el("div", { class: "s-container ap-detail" }); view.appendChild(wrap);
    wrap.appendChild(el("nav", { class: "ap-crumbs", attrs: { "aria-label": "Breadcrumb" } },
      el("a", { class: "s-btn s-btn--ghost s-btn--sm", href: "#", html: S.icon("arrow-left", 14) }, "All markets"),
      el("a", { href: "#markets", text: "Markets" }), sep(), el("span", { text: "Address" }), sep(), el("span", { class: "t-mono", text: F.addr(a, 4), attrs: { "aria-current": "page" } })));
    var col = el("div", { class: "s-col", style: { "--gap": "16px", marginTop: "18px" } }); wrap.appendChild(col);
    var kind = e ? addrKind(e) : "Address", label = e ? addrLabel(e) : "Unknown address";
    var av = el("span", { class: "s-avatar ap-avatar-user", html: S.icon(e && e.agent ? "agent" : "user", 24), attrs: { "aria-hidden": "true" } });
    col.appendChild(el("header", { class: "ap-dhead" }, el("div", { class: "ap-dhead__top" }, av,
      el("div", { class: "ap-dhead__main" },
        el("div", { class: "ap-badges" }, el("span", { class: "s-tag s-tag--violet", text: kind }), e && e.agent ? el("span", { class: "s-tag s-tag--outline", html: S.glyph("deep") }, "Trades in Deep") : null),
        el("h1", { class: "ap-dtitle", text: label }),
        el("div", { class: "s-row", style: { "--gap": "6px" } }, el("span", { class: "ap-addr-full", text: a }), el("button", { class: "s-addr__copy", attrs: { type: "button", "aria-label": "Copy address", "data-copy": a }, html: S.icon("copy", 13) })),
        e && e.agent ? U.specs(["Operator " + e.agent.operator, e.agent.trades + " trades", "Brier " + e.agent.brier.toFixed(3)]) : e && e.trader ? U.specs([e.trader.markets + " markets traded", "Volume " + F.usd(e.trader.volume)]) : null))));
    if (!e) {
      col.appendChild(U.empty({ title: "No activity for this address", text: "It holds no positions and created no markets in the sample. Addresses in this concept start with 0x5eed.", action: { label: "Back to markets", href: "#markets" }, motif: "dotgrid", motifOpts: { cols: 12, rows: 6, cell: 20, dissolve: .55 } }));
      return;
    }
    var val = e.positions.reduce(function (s, p) { return s + p.balance; }, 0), who = e.agent || e.trader;
    col.appendChild(el("div", { class: "s-stats", style: { "--cols": "4" } },
      U.stat("Positions", String(e.positions.length), { note: "across " + uniq(e.positions.map(function (p) { return p.m.id; })).length + " markets" }),
      U.stat("Position value", "≈ " + F.usd(val), { note: "collateral terms, sample" }),
      U.stat("Markets created", String(e.created.length), { note: e.created.length ? "as creator" : "none" }),
      U.stat("Trader Score", who ? String(who.traderScore) : "—", { note: who ? who.tier + " tier" : "not ranked" })));
    var posCard = !e.positions.length && e.events.length ? null : el("section", { class: "s-card s-card--pad", attrs: { "aria-labelledby": "ap-pos-h" } }, el("div", { class: "ap-cardhead" }, el("div", {}, el("span", { class: "s-spec", text: "Open positions" }), el("h2", { id: "ap-pos-h", class: "t-h3", text: "Positions" }))));
    if (posCard) col.appendChild(posCard);
    if (!posCard) { /* activity-only address: the activity table below carries it */ }
    else if (!e.positions.length) posCard.appendChild(el("p", { class: "t-meta", text: "No positions in the sample." }));
    else U.table(posCard, [
      { key: "m", label: "Market", class: "ap-wrap", render: function (p) { return marketCell(p.m); } },
      { key: "outcome", label: "Outcome", render: function (p) { return clip(p.outcome, 32); } },
      { key: "state", label: "State", render: function (p) { return U.stateBadge(p.m.state); } },
      { key: "balance", label: "Balance", num: true, sort: true, render: function (p) { return F.tok(p.balance, p.m.collateral, 0); } },
      { key: "share", label: "Share of OI", num: true, sort: true, render: function (p) { return F.pct(p.share, 1); } }
    ], { rows: e.positions, compact: true, sortKey: "balance", sortDir: "desc", onRow: function (p) { var k = -1; p.m.outcomes.forEach(function (o, i) { if (o.name === p.outcome) k = i; }); openMarket(p.m.id, k >= 0 ? { o: k, side: 0 } : null); }, caption: "Positions held by this address" });
    if (e.events.length) {
      var ec = el("section", { class: "s-card s-card--pad" }, el("div", {}, el("span", { class: "s-spec", text: "Sent from this address" }), el("h2", { class: "t-h3", text: "Activity · " + e.events.length })));
      col.appendChild(ec);
      U.table(ec, [
        { key: "type", label: "Event", render: function (r) { return evTag(r.e.type); } },
        { key: "m", label: "Market", class: "ap-wrap", render: function (r) { return marketCell(r.m); } },
        { key: "outcome", label: "Outcome", render: function (r) { return clip(r.e.outcome, 28) + (r.e.type === "Swap" ? " · " + (r.e.side === "buy" ? "buy" : "sell") : ""); } },
        { key: "amount", label: "Amount", num: true, render: function (r) { return F.tok(r.e.amount, r.e.collateral); } },
        { key: "tx", label: "Tx hash", render: function (r) { return U.addr(r.e.tx, { chars: 6, what: "transaction hash" }); } },
        { key: "time", label: "Age", num: true, render: function (r) { return F.ago(r.e.time); } }
      ], { rows: e.events, compact: true, onRow: function (r) { go("m=" + r.m.id + "&tab=activity"); }, caption: "Transactions sent from this address" });
    }
    if (e.created.length) {
      var cc = el("section", { class: "s-card s-card--pad" }, el("div", {}, el("span", { class: "s-spec", text: "Created by this address" }), el("h2", { class: "t-h3", text: "Markets created" })));
      col.appendChild(cc);
      U.table(cc, [
        { key: "m", label: "Market", class: "ap-wrap", render: marketCell },
        { key: "state", label: "State", render: function (m) { return U.stateBadge(m.state); } },
        { key: "volume", label: "Volume", num: true, render: function (m) { return F.usd(m.volume); } },
        { key: "created", label: "Created", num: true, render: function (m) { return F.date(m.created); } }
      ], { rows: e.created, compact: true, onRow: function (m) { openMarket(m.id); }, caption: "Markets created by this address" });
    }
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  /* ======================= boot ======================= */
  var ni = $("#ap-notes-icon"); if (ni) ni.outerHTML = S.icon("info", 16);
  initHero(); initExplorer(); initActivity(); initLeaderboard(); initCreate();
  (function oneSearch() { // two search fields on one screen read as a mistake: hide the header pill while the hero search is visible
    var hs = $("[data-shell-search]"), hero = $("#ap-search-wrap");
    if (!hs || !hero) return;
    var hb = hero.getBoundingClientRect(); // first paint: tuck at once, with no fade, so the pill never shows as a ghost mid-transition
    if (mode === "home" && hb.bottom > 80 && hb.top < window.innerHeight) hs.classList.add("is-tucked");
    requestAnimationFrame(function () { requestAnimationFrame(function () { hs.classList.add("ap-anim"); }); });
    if (!("IntersectionObserver" in window)) return;
    new IntersectionObserver(function (en) { hs.classList.toggle("is-tucked", en[0].isIntersecting && mode === "home"); }, { rootMargin: "-80px 0px 0px 0px" }).observe(hero);
    window.addEventListener("hashchange", function () { if (mode !== "home") hs.classList.remove("is-tucked"); });
  })();
  route();
})();
