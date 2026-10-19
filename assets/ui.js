/* Seer · shared components, charts and motifs (vanilla JS, no dependencies).
   Concept by Swift Bot Labs. Not affiliated with Seer.
   Load after shell.js (needs Seer.icon / Seer.glyph). All text goes in via textContent. */
(function () {
  "use strict";
  var S = (window.Seer = window.Seer || {});
  var SVGNS = "http://www.w3.org/2000/svg";
  var DATA = function () { return window.SEER_SAMPLE || {}; };

  /* ======================= DOM helpers ======================= */
  // Seer.el("div", {class, text, html (TRUSTED strings only), style:{}, data:{}, attrs:{}, on:{click}}, ...children)
  function el(tag, o) {
    var n = document.createElement(tag); o = o || {};
    apply(n, o);
    for (var i = 2; i < arguments.length; i++) add(n, arguments[i]);
    return n;
  }
  function sv(tag, attrs) { var n = document.createElementNS(SVGNS, tag); for (var k in attrs || {}) if (attrs[k] != null) n.setAttribute(k, attrs[k]); return n; }
  function apply(n, o) {
    if (o.class) n.className = o.class;
    if (o.text != null) n.textContent = o.text;
    if (o.html != null) n.innerHTML = o.html;
    if (o.style) for (var s in o.style) { if (s.indexOf("--") === 0) n.style.setProperty(s, o.style[s]); else n.style[s] = o.style[s]; }
    if (o.data) for (var d in o.data) n.dataset[d] = o.data[d];
    if (o.attrs) for (var a in o.attrs) if (o.attrs[a] != null && o.attrs[a] !== false) n.setAttribute(a, o.attrs[a] === true ? "" : o.attrs[a]);
    if (o.href) n.setAttribute("href", o.href);
    if (o.title) n.setAttribute("title", o.title);
    if (o.on) for (var e in o.on) n.addEventListener(e, o.on[e]);
  }
  function add(n, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(n, x); }); return; }
    n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  function svgFrom(str) { var t = document.createElement("template"); t.innerHTML = str.trim(); return t.content.firstChild; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
  S.el = el; S.svgEl = sv; S.svgFrom = svgFrom; S.clear = clear; S.$ = $; S.$$ = $$;
  S.css = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };
  // run fn on resize of el (rAF-debounced); returns disconnect()
  S.onResize = function (node, fn) {
    var w = -1; // ResizeObserver already runs once per frame before paint; no rAF (rAF stalls in background tabs)
    var ro = new ResizeObserver(function (en) { var nw = Math.round(en[0].contentRect.width); if (nw === w || nw === 0) return; w = nw; fn(); });
    ro.observe(node); return function () { ro.disconnect(); };
  };

  /* ======================= formatters ======================= */
  var nf = function (d) { return new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var fmt = S.fmt = {
    num: function (n, d) { return nf(d || 0).format(n); },
    compact: function (n, d) {
      var a = Math.abs(n), s = n < 0 ? "-" : "";
      if (a >= 1e9) return s + trim(a / 1e9, d) + "B"; if (a >= 1e6) return s + trim(a / 1e6, d) + "M"; if (a >= 1e3) return s + trim(a / 1e3, d) + "K";
      return s + trim(a, a < 10 ? (d == null ? 2 : d) : 0);
    },
    usd: function (n, full) { return (n < 0 ? "-$" : "$") + (full ? nf(full === true ? 0 : full).format(Math.abs(n)) : fmt.compact(Math.abs(n), 1)); },
    tok: function (n, sym, d) { return nf(d == null ? 2 : d).format(n) + (sym ? " " + sym : ""); },
    pct: function (p, d) { if (p == null || isNaN(p)) return "—"; if (p > 0 && p < .001 && !d) return "<0.1%"; return nf(d == null ? 1 : d).format(p * 100) + "%"; },
    pct0: function (p) { if (p > 0 && p < .01) return "<1%"; if (p < 1 && p > .99) return ">99%"; return Math.round(p * 100) + "%"; },
    signed: function (p, d) { var v = nf(d == null ? 2 : d).format(Math.abs(p * 100)); return (p > 0 ? "+" : p < 0 ? "−" : "±") + v + "%"; },
    signedNum: function (n, d) { return (n > 0 ? "+" : n < 0 ? "−" : "") + nf(d == null ? 2 : d).format(Math.abs(n)); },
    cents: function (p) { var c = p * 100; return (c < 1 && c > 0 ? nf(1).format(c) : Math.round(c)) + "¢"; },
    cents1: function (p) { var c = p * 100; return (c < 10 ? nf(1).format(c) : Math.round(c)) + "¢"; },
    price: function (p, d) { return nf(d == null ? 4 : d).format(p); },
    addr: function (a, n) { if (!a) return ""; n = n || 4; return a.slice(0, 2 + n) + "…" + a.slice(-n); },
    date: function (t) { var d = new Date(typeof t === "number" ? t : Date.parse(t)); return d.getUTCDate() + " " + MON[d.getUTCMonth()] + " " + d.getUTCFullYear(); },
    dayMon: function (t) { var d = new Date(typeof t === "number" ? t : Date.parse(t)); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; },
    time: function (t) { var d = new Date(typeof t === "number" ? t : Date.parse(t)); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); },
    dateTime: function (t) { return fmt.date(t) + " · " + fmt.time(t) + " UTC"; },
    ago: function (t, now) {
      now = now || DATA().now || Date.now(); var s = Math.round((now - (typeof t === "number" ? t : Date.parse(t))) / 1000), fut = s < 0; s = Math.abs(s);
      var v = s < 60 ? s + "s" : s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d";
      return fut ? "in " + v : v + " ago";
    },
    until: function (t, now) { return fmt.ago(t, now); }
  };
  function trim(x, d) { var s = x.toFixed(d == null ? 1 : d); return s.indexOf(".") > -1 ? s.replace(/\.?0+$/, "") : s; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ======================= small components ======================= */
  var ui = S.ui = {};
  var TYPE_LABEL = { "categorical": "Categorical", "multi-categorical": "Multi-categorical", "scalar": "Scalar", "multi-scalar": "Multi-scalar" };
  ui.stateBadge = function (state) {
    var s = DATA().state ? DATA().state(state) : null;
    return el("span", { class: "s-state", data: { state: state }, text: s ? s.label : state, title: s ? s.note : null });
  };
  ui.verifyBadge = function (v) {
    var map = { verified: ["verified", "Verified"], verifying: ["clock", "Verifying"], challenged: ["alert", "Challenged"], none: ["info", "Not verified"] };
    var m = map[v] || map.none;
    var n = el("span", { class: "s-verify", data: { verify: v || "none" }, html: S.icon(m[0], 14), title: "Kleros Curate: " + m[1] });
    n.appendChild(document.createTextNode(m[1])); return n;
  };
  ui.chainBadge = function (id) {
    var c = DATA().chain ? DATA().chain(id) : null;
    return el("span", { class: "s-chain" }, el("i", { text: c ? c.mono : "?" }), c ? c.name : id);
  };
  ui.typeName = function (m) { return m.set ? "Scalar × " + m.set : TYPE_LABEL[m.type] || m.type; };
  // Type-correct wording for one outcome's price. Returns {value, sub, yes, no, unit}:
  //   scalar round (#2841)       8.83/10 · 88¢    Up / Down   (UP redeems score ÷ 10)
  //   multi-categorical + slots  81% · 10¢        Buy / Sell  (a funded share redeems 1/slots)
  //   multi-categorical risk     13.8% /yr · 3.2¢ Buy / Sell  (1 sDAI split between the assets that default)
  //   multi-scalar               41% · 41¢        Buy / Sell  (each token redeems its share of the total)
  //   categorical                64%              Yes / No    (price = probability)
  ui.priceWords = function (m, o) {
    if (o.invalid) return { value: fmt.cents1(o.price), unit: "price" };
    if (m.set) { var r = m.range || { min: 0, max: 10 }; var v = o.value != null ? o.value : r.min + (r.max - r.min) * o.price;
      return { value: fmt.num(v, 2) + "/" + trim(r.max, 0), sub: "UP " + fmt.cents(o.price), yes: "Up", no: "Down", unit: "score" }; }
    if (m.type === "multi-categorical" && o.noToAll) return { value: fmt.pct(o.chance != null ? o.chance : o.price, 1), sub: fmt.cents1(o.price), yes: "Buy", no: "Sell", unit: "chance none default", p: o.price };
    if (m.type === "multi-categorical" && o.pdAnnual != null) return { value: fmt.pct(o.pdAnnual, 1), sub: "/yr · " + fmt.cents1(o.price), yes: "Buy", no: "Sell", unit: "PD", p: o.pdAnnual };
    if (m.type === "multi-categorical") { var ch = o.chance != null ? o.chance : Math.min(1, o.price * (m.slots || 1));
      return { value: fmt.pct0(ch), sub: fmt.cents1(o.price), yes: "Buy", no: "Sell", unit: "chance", p: ch }; }
    if (m.type === "multi-scalar") return { value: fmt.pct0(o.price), sub: "share", yes: "Buy", no: "Sell", unit: "share" };
    return { value: fmt.pct0(o.price), unit: "chance" };
  };
  ui.typeTag = function (m) {
    var t = el("span", { class: "s-tag", text: ui.typeName(m) });
    if (!m.conditional && !m.futarchy) return t;
    var f = document.createDocumentFragment(); f.appendChild(t);
    if (m.conditional) f.appendChild(el("span", { class: "s-tag s-tag--violet", text: "Conditional" }));
    if (m.futarchy) f.appendChild(el("span", { class: "s-tag s-tag--violet", text: "Futarchy" }));
    return f;
  };
  // address / hash with copy button; opt: {chars, href, label}
  ui.addr = function (a, opt) {
    opt = opt || {};
    var w = el("span", { class: "s-addr", title: a });
    var txt = opt.label || fmt.addr(a, opt.chars || 4);
    w.appendChild(opt.href ? el("a", { href: opt.href, text: txt }) : el("span", { text: txt }));
    w.appendChild(el("button", { class: "s-addr__copy", attrs: { type: "button", "aria-label": "Copy " + (opt.what || "address"), "data-copy": a }, html: S.icon("copy", 13) }));
    return w;
  };
  ui.specs = function (items) { return el("div", { class: "s-specs" }, items.map(function (x) { return el("span", typeof x === "string" ? { text: x } : x); })); };
  ui.sample = function () { return el("span", { class: "s-sample", text: "Sample data" }); };
  ui.avatar = function (key, variant) { return el("span", { class: "s-avatar" + (variant ? " s-avatar--" + variant : ""), html: S.glyph(key), attrs: { "aria-hidden": "true" } }); };
  ui.empty = function (o) {
    o = o || {};
    var art = el("div", { class: "s-empty__art" });
    var box = el("div", { class: "s-empty" }, art, el("p", { class: "s-empty__title", text: o.title || "Nothing here yet" }), o.text ? el("p", { class: "s-empty__text", text: o.text }) : null);
    if (o.action) box.appendChild(el(o.action.href ? "a" : "button", { class: "s-btn s-btn--secondary", href: o.action.href, text: o.action.label, attrs: { type: o.action.href ? null : "button" }, on: o.action.onClick ? { click: o.action.onClick } : null }));
    (S.motif[o.motif || "barcode"] || S.motif.barcode)(art, o.motifOpts || { values: [.9, .55, .75, .35, .62, .2], highlight: [0] });
    return box;
  };
  ui.skeleton = function (kind, n) {
    var w = el("div", { class: "s-col", style: { "--gap": "10px" } });
    for (var i = 0; i < (n || 3); i++) w.appendChild(el("div", { class: "s-skel s-skel--" + (kind || "row"), style: kind === "line" ? { width: (92 - i * 17) + "%" } : null }));
    w.setAttribute("aria-busy", "true"); w.setAttribute("aria-label", "Loading");
    return w;
  };
  ui.stat = function (label, value, o) {
    o = o || {};
    var v = el("div", { class: "s-stat__value" }, value); if (o.unit) v.appendChild(el("small", { text: o.unit }));
    var n = el("div", { class: "s-stat" }, el("div", { class: "s-stat__label", text: label }), v);
    if (o.delta != null) n.appendChild(el("div", { class: "s-stat__delta " + (o.delta > 0 ? "t-pos" : o.delta < 0 ? "t-neg" : "t-3"), text: (o.deltaText || fmt.signed(o.delta)) + (o.deltaNote ? " " + o.deltaNote : "") }));
    if (o.note) n.appendChild(el("div", { class: "t-meta", text: o.note }));
    return n;
  };
  ui.timeline = function (steps) {
    return el("ol", { class: "s-timeline" }, steps.map(function (s) {
      return el("li", { class: s.done ? "is-done" : s.current ? "is-current" : "" }, el("b", { text: s.label }), s.time ? el("span", { text: fmt.dayMon(s.time) }) : (s.note ? el("span", { text: s.note }) : null));
    }));
  };
  ui.kv = function (rows) {
    var dl = el("dl", { class: "s-kv" });
    rows.forEach(function (r) { if (!r) return; dl.appendChild(el("dt", { text: r[0] })); dl.appendChild(el("dd", {}, r[1])); });
    return dl;
  };
  ui.tabs = function (container, tabs, onChange, active) {
    var bar = el("div", { class: "s-tabs", attrs: { role: "tablist" } });
    tabs.forEach(function (t, i) {
      var b = el("button", { attrs: { type: "button", role: "tab", "aria-selected": String((active || 0) === i) } }, t.label, t.count != null ? el("span", { class: "s-count", text: String(t.count) }) : null);
      b.addEventListener("click", function () { $$("[role=tab]", bar).forEach(function (x) { x.setAttribute("aria-selected", "false"); }); b.setAttribute("aria-selected", "true"); onChange && onChange(t, i); });
      bar.appendChild(b);
    });
    container.appendChild(bar); return bar;
  };
  // segmented control: items [[value,label]], returns node; onChange(value)
  ui.seg = function (items, value, onChange, label) {
    var w = el("div", { class: "s-seg", attrs: { role: "group", "aria-label": label || null } });
    items.forEach(function (it) {
      var b = el("button", { text: it[1], attrs: { type: "button", "aria-pressed": String(it[0] === value) } });
      b.addEventListener("click", function () { $$("button", w).forEach(function (x) { x.setAttribute("aria-pressed", "false"); }); b.setAttribute("aria-pressed", "true"); onChange && onChange(it[0]); });
      w.appendChild(b);
    });
    return w;
  };
  // chip row with arrows [kit]; items [[value,label,count?]]
  ui.chipRow = function (items, value, onChange) {
    var track = el("div", { class: "s-chiprow__track", attrs: { role: "group" } });
    items.forEach(function (it) {
      var b = el("button", { class: "s-chip", attrs: { type: "button", "aria-pressed": String(it[0] === value) } }, it[1], it[2] != null ? el("span", { class: "s-chip__n", text: String(it[2]) }) : null);
      b.addEventListener("click", function () { $$(".s-chip", track).forEach(function (x) { x.setAttribute("aria-pressed", "false"); }); b.setAttribute("aria-pressed", "true"); onChange && onChange(it[0]); });
      track.appendChild(b);
    });
    var left = el("button", { class: "s-icon-btn", attrs: { type: "button", "aria-label": "Scroll categories left" }, html: S.icon("chevron-left", 16) });
    var right = el("button", { class: "s-icon-btn", attrs: { type: "button", "aria-label": "Scroll categories right" }, html: S.icon("chevron-right", 16) });
    left.onclick = function () { track.scrollBy({ left: -240 }); }; right.onclick = function () { track.scrollBy({ left: 240 }); };
    return el("div", { class: "s-chiprow" }, left, track, right);
  };

  /* ---- outcome row [kit]: label · % · [Yes][No] with a probability wash ---- */
  // o: {name, price, invalid}; opt: {actions:true|false, rank, delta, bar:true, onYes, onNo, button:true}
  ui.orow = function (o, opt) {
    opt = opt || {};
    var row = el(opt.button ? "button" : "div", { class: "s-orow" + (o.invalid ? " is-invalid" : "") + (opt.bar === false ? " s-orow--nobar" : "") + (opt.lg ? " s-orow--lg" : ""), style: { "--p": String(Math.max(0, Math.min(1, opt.p != null ? opt.p : o.price))) }, attrs: opt.button ? { type: "button" } : null });
    var lab = el("span", { class: "s-orow__label" });
    if (opt.rank != null) lab.appendChild(el("span", { class: "s-rank", text: String(opt.rank).padStart(2, "0") }));
    if (opt.swatch) lab.appendChild(el("i", { class: "s-dot", style: { color: opt.swatch } }));
    lab.appendChild(el("span", { class: "u-clamp-1", text: o.name }));
    row.appendChild(lab);
    if (opt.delta != null) row.appendChild(el("span", { class: "s-orow__delta " + (opt.delta > 0 ? "t-pos" : opt.delta < 0 ? "t-neg" : "t-3"), text: opt.deltaText || fmt.signed(opt.delta, 1) }));
    row.appendChild(el("span", { class: "s-orow__pct" }, opt.value || fmt.pct0(o.price), opt.sub ? el("small", { class: "s-orow__sub", text: opt.sub }) : null));
    if (opt.actions !== false && !o.invalid) {
      var y = el("button", { class: "s-btn s-btn--xs", text: opt.yes || "Yes", attrs: { type: "button", "aria-label": (opt.yes || "Yes") + " on " + o.name } });
      var n = el("button", { class: "s-btn s-btn--xs s-btn--secondary", text: opt.no || "No", attrs: { type: "button", "aria-label": (opt.no || "No") + " on " + o.name } });
      if (opt.onYes) y.addEventListener("click", function (e) { e.stopPropagation(); opt.onYes(o); }); else y.setAttribute("data-demo", "");
      if (opt.onNo) n.addEventListener("click", function (e) { e.stopPropagation(); opt.onNo(o); }); else n.setAttribute("data-demo", "");
      row.appendChild(el("span", { class: "s-orow__actions" }, y, n));
    }
    return row;
  };

  /* ---- market card [kit 328x210] ---- */
  // m: a SEER_SAMPLE market. opt: {href, onOpen(m)}
  ui.marketCard = function (m, opt) {
    opt = opt || {};
    var card = el("article", { class: "s-card s-mcard", data: { market: m.id } });
    var title = el(opt.href || opt.onOpen ? "a" : "h3", { class: "s-card__title", text: m.question, href: opt.href || (opt.onOpen ? "#m=" + m.id : null) });
    if (opt.onOpen) title.addEventListener("click", function (e) { e.preventDefault(); opt.onOpen(m); });
    card.appendChild(el("div", { class: "s-card__head" }, ui.avatar(m.appId === "app" ? "grid" : m.appId, m.appId === "app" ? null : "ink"), title));
    var outs = m.outcomes.filter(function (o) { return !o.invalid; });
    // every two-outcome Yes/No market gets the kit's binary card (full-width Yes¢ / No¢), whatever its display flag
    var disp = m.display || (m.type === "scalar" && !m.set ? "scalar" : outs.length === 2 && /^yes$/i.test(outs[0].name) && /^no$/i.test(outs[1].name) ? "binary" : "rows");
    if (disp === "binary") {
      card.appendChild(el("div", { class: "s-mcard__binary" },
        el("button", { class: "s-btn", attrs: { type: "button", "data-demo": "" } }, outs[0].name + " " + fmt.cents(outs[0].price)),
        el("button", { class: "s-btn s-btn--secondary", attrs: { type: "button", "data-demo": "" } }, outs[1].name + " " + fmt.cents(outs[1].price))));
    } else if (disp === "three") {
      card.appendChild(el("div", { class: "s-orows" }, outs.slice(0, 2).map(function (o) { return ui.orow(o, { actions: false }); })));
      card.appendChild(el("div", { class: "s-mcard__three" }, outs.slice(0, 3).map(function (o, i) {
        return el("button", { class: "s-btn" + (i === 0 ? "" : i === 1 ? " s-btn--ghost" : " s-btn--secondary"), text: o.name, attrs: { type: "button", "data-demo": "" } });
      })));
    } else if (disp === "scalar") {
      var r = m.range || { min: 0, max: 1 }, v = m.value != null ? m.value : r.min + (r.max - r.min) * outs[1].price, p = (v - r.min) / (r.max - r.min);
      card.appendChild(el("div", { class: "s-orows" },
        el("div", { class: "s-orow s-orow--nobar", style: { flexDirection: "column", alignItems: "stretch", gap: "10px", padding: "12px" } },
          el("div", { class: "s-row s-row--between" }, el("span", { class: "t-meta", text: "Market forecast" }), el("b", { class: "t-num", style: { fontWeight: 600 }, text: fmt.compact(v, 1) + " " + (r.unit || "") })),
          el("div", { class: "s-pbar", style: { "--p": String(p) } }, el("i")),
          el("div", { class: "s-row s-row--between t-meta" }, el("span", { text: fmt.compact(r.min) }), el("span", { text: fmt.compact(r.max) }))),
        el("div", { class: "s-pricetiles" },
          el("button", { class: "s-btn s-btn--secondary", attrs: { type: "button", "data-demo": "" }, text: "Down " + fmt.cents(outs[0].price) }),
          el("button", { class: "s-btn", attrs: { type: "button", "data-demo": "" }, text: "Up " + fmt.cents(outs[1].price) }))));
    } else {
      var top = outs.slice().sort(function (a, b) { return b.price - a.price; }).slice(0, 2);
      card.appendChild(el("div", { class: "s-orows" }, top.map(function (o) { var w = ui.priceWords(m, o); return ui.orow(o, { value: w.value, sub: w.sub, yes: w.yes, no: w.no, p: w.p }); })));
    }
    var meta = el("div", { class: "s-card__meta" }, el("span", { text: fmt.usd(m.volume) + " Vol." }));
    if (m.state === "dispute" || m.state === "open" || m.state === "waiting") meta.appendChild(el("span", { text: DATA().state(m.state).label }));
    else meta.appendChild(el("span", { text: fmt.dayMon(m.openingDate) }));
    meta.appendChild(el("span", { text: m.category }));
    card.appendChild(el("div", { class: "s-card__foot" }, meta, el("div", { class: "s-card__icons" },
      el("button", { attrs: { type: "button", "aria-label": "Rewards", "data-demo": "Liquidity rewards are not wired in this concept." }, html: S.icon("gift", 15) }),
      el("button", { attrs: { type: "button", "aria-label": "Bookmark", "data-demo": "Bookmarks are not wired in this concept." }, html: S.icon("bookmark", 15) }))));
    return card;
  };

  /* ---- sortable table ---- */
  // columns: [{key, label, num:true, sort:true|fn, render(row)->Node|string, width, class}]
  // opt: {rows, sortKey, sortDir:'desc', onRow(row, tr), compact, caption, empty:{title,text}}
  ui.table = function (container, columns, opt) {
    opt = opt || {};
    var state = { rows: opt.rows || [], key: opt.sortKey || null, dir: opt.sortDir || "desc" };
    var wrap = el("div", { class: "s-table-wrap" });
    var table = el("table", { class: "s-table" + (opt.compact ? " s-table--compact" : "") });
    if (opt.caption) table.appendChild(el("caption", { class: "s-sr", text: opt.caption }));
    var thead = el("thead"), tr = el("tr"), tbody = el("tbody");
    columns.forEach(function (c) {
      var th = el("th", { class: (c.num ? "num " : "") + (c.class || ""), style: c.width ? { width: c.width } : null, attrs: { scope: "col" } });
      if (c.sort) {
        var b = el("button", { text: c.label, attrs: { type: "button" } });
        b.addEventListener("click", function () { if (state.key === c.key) state.dir = state.dir === "desc" ? "asc" : "desc"; else { state.key = c.key; state.dir = c.num ? "desc" : "asc"; } render(); });
        th.appendChild(b);
      } else th.textContent = c.label;
      c._th = th; tr.appendChild(th);
    });
    thead.appendChild(tr); table.appendChild(thead); table.appendChild(tbody); wrap.appendChild(table); container.appendChild(wrap);
    if (S.clipWatch) S.clipWatch(wrap); // right-edge fade while the table is wider than its box
    function val(row, c) { return typeof c.sort === "function" ? c.sort(row) : row[c.key]; }
    function render() {
      columns.forEach(function (c) { if (c.sort) { if (c.key === state.key) c._th.setAttribute("aria-sort", state.dir === "asc" ? "ascending" : "descending"); else c._th.removeAttribute("aria-sort"); } });
      var rows = state.rows.slice();
      var col = columns.filter(function (c) { return c.key === state.key; })[0];
      if (col) rows.sort(function (a, b) { var x = val(a, col), y = val(b, col); var r = x < y ? -1 : x > y ? 1 : 0; return state.dir === "asc" ? r : -r; });
      clear(tbody);
      if (!rows.length) {
        var td = el("td", { attrs: { colspan: String(columns.length) } }); td.appendChild(ui.empty(opt.empty || { title: "No results", text: "Try a different filter." })); tbody.appendChild(el("tr", {}, td)); return;
      }
      rows.forEach(function (row) {
        var r = el("tr");
        columns.forEach(function (c) {
          var td = el("td", { class: (c.num ? "num " : "") + (c.class || "") });
          var v = c.render ? c.render(row) : row[c.key];
          if (v != null) add(td, v);
          r.appendChild(td);
        });
        if (opt.onRow) { r.tabIndex = 0; r.dataset.href = "1"; r.addEventListener("click", function (e) { if (e.target.closest("a,button")) return; opt.onRow(row, r); }); r.addEventListener("keydown", function (e) { if (e.key === "Enter") opt.onRow(row, r); }); }
        tbody.appendChild(r);
      });
    }
    render();
    return { update: function (rows) { state.rows = rows; render(); }, el: wrap, table: table };
  };

  /* ---- trade ticket / bet slip [kit] ---- */
  // opt: {market, outcomes:[i,j] (two tiles), selected:0, chips:[1,5,20,100], slippage:.01, side:'buy',
  //       payout(o, shares, amount, outcomeIndex) -> [[label, value]] (replaces "Potential return"; use it when a share
  //       does not redeem for exactly 1, e.g. scalar UP/DOWN or a multi-winner market), note: footnote text}
  ui.ticket = function (container, opt) {
    var m = opt.market, idx = opt.outcomes || [0, 1], sel = opt.selected || 0, amount = opt.amount || 0;
    var chips = opt.chips || [1, 5, 20, 100], slip = opt.slippage == null ? .01 : opt.slippage, coll = m.collateral || "sDAI";
    var panel = el("section", { class: "s-panel s-ticket", attrs: { "aria-label": "Trade ticket" } });
    var head = el("div", { class: "s-panel__head" }, el("span", { class: "s-row", style: { "--gap": "8px" } }, el("span", { html: S.glyph(m.appId === "app" ? "grid" : m.appId), style: { color: "var(--violet-2)", display: "inline-flex" } }), el("span", { class: "t-meta", text: fmt.usd(m.volume) + " Vol." })), el("span", { class: "t-meta", text: "#" + m.id }));
    var q = el("h3", { class: "t-title", text: opt.title || m.question });
    var tiles = el("div", { class: "s-pricetiles" });
    var rows = el("div", { class: "s-ticket__rows" });
    var input = el("input", { attrs: { type: "text", inputmode: "decimal", placeholder: "$0", "aria-label": "Amount in " + coll } });
    if (amount) input.value = "$" + fmt.num(amount, 2); // a seeded amount shows as "$100.00" (the kit writes "$100,00")
    var conf = el("button", { class: "s-btn s-btn--lg", attrs: { type: "button" }, text: "Confirm" });
    var reset = el("button", { class: "s-icon-btn", attrs: { type: "button", "aria-label": "Clear amount" }, html: S.icon("close", 20) });
    idx.forEach(function (oi, k) {
      var o = m.outcomes[oi];
      var t = el("button", { class: "s-pricetile", attrs: { type: "button", "aria-pressed": String(k === sel) } }, el("small", { text: o.name }), el("b", { text: fmt.cents1(o.price) }));
      t.addEventListener("click", function () { sel = k; $$(".s-pricetile", tiles).forEach(function (x, j) { x.setAttribute("aria-pressed", String(j === k)); }); calc(); });
      tiles.appendChild(t);
    });
    var chipBox = el("div", { class: "s-amountchips" }, chips.map(function (c) {
      var b = el("button", { attrs: { type: "button" }, text: "+$" + c }); b.addEventListener("click", function () { amount = Math.round((amount + c) * 100) / 100; input.value = "$" + fmt.num(amount, 2); calc(); }); return b;
    }));
    input.addEventListener("input", function () { amount = parseFloat(input.value.replace(/[^0-9.]/g, "")) || 0; calc(); });
    input.addEventListener("blur", function () { input.value = amount ? "$" + fmt.num(amount, 2) : ""; });
    reset.addEventListener("click", function () { amount = 0; input.value = ""; calc(); });
    conf.addEventListener("click", function () { S.toast(amount ? "Sample only: no transaction sent (" + fmt.tok(amount, coll) + " on " + m.outcomes[idx[sel]].name + ")." : "Enter an amount first.", amount ? "info" : "alert"); });
    function line(k, v) { return el("div", {}, el("span", { text: k }), el("b", { text: v })); }
    function calc() {
      var o = m.outcomes[idx[sel]], p = o.price, avg = Math.min(.999, p * (1 + Math.min(slip, amount / Math.max(m.liquidity || 1, 1) * .5)));
      var shares = amount ? amount / avg : 0;
      clear(rows);
      rows.appendChild(line("Average price", fmt.cents1(avg)));
      rows.appendChild(line("Shares", amount ? fmt.num(shares, 2) : "—"));
      if (opt.payout) opt.payout(o, shares, amount, idx[sel]).forEach(function (r) { rows.appendChild(line(r[0], amount ? r[1] : "—")); });
      else rows.appendChild(line("Potential return", amount ? fmt.tok(shares, coll) + " (" + fmt.signed(shares / amount - 1, 0) + ")" : "—"));
      rows.appendChild(line("Max slippage", fmt.pct(slip, 1)));
      conf.textContent = amount ? "Buy " + o.name : "Confirm";
    }
    var amountBox = el("div", { class: "s-panel s-panel--nested", style: { gap: "14px" } },
      el("div", { class: "s-amount" }, el("label", { text: "Amount" }), input), chipBox, rows,
      el("div", { class: "s-ticket__confirm" }, conf, reset));
    panel.appendChild(head); panel.appendChild(q); panel.appendChild(tiles); panel.appendChild(amountBox);
    panel.appendChild(el("p", { class: "t-meta", text: opt.note || "Pay with " + coll + ". Sample prices; nothing is traded." }));
    calc(); container.appendChild(panel); return panel;
  };

  /* ======================= tooltip singleton ======================= */
  var tipEl;
  S.tip = {
    show: function (x, y, head, rows) {
      if (!tipEl) { tipEl = el("div", { class: "s-tip", attrs: { role: "tooltip" } }); document.body.appendChild(tipEl); }
      clear(tipEl);
      if (head) tipEl.appendChild(el("div", { class: "s-tip__head", text: head }));
      (rows || []).forEach(function (r) { tipEl.appendChild(el("div", { class: "s-tip__row" }, r.color ? el("i", { style: { background: r.color } }) : null, el("span", { text: r.label }), el("b", { text: r.value }))); });
      var w = tipEl.offsetWidth || 160, h = tipEl.offsetHeight || 60, vw = window.innerWidth;
      var left = x + 14 + w > vw - 8 ? x - w - 14 : x + 14, top = Math.max(8, y - h - 12);
      tipEl.style.left = Math.max(8, left) + "px"; tipEl.style.top = top + "px"; tipEl.classList.add("is-on");
    },
    hide: function () { if (tipEl) tipEl.classList.remove("is-on"); }
  };

  /* ======================= charts ======================= */
  var chart = S.chart = {};
  var PAL = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];
  chart.palette = PAL;
  function niceTicks(min, max, n) {
    var span = max - min || 1, step = Math.pow(10, Math.floor(Math.log10(span / (n || 4)))), err = (n || 4) / span * step;
    if (err <= .15) step *= 10; else if (err <= .35) step *= 5; else if (err <= .75) step *= 2;
    var out = [], t = Math.ceil(min / step) * step; for (; t <= max + step * 1e-9; t += step) out.push(Math.round(t / step) * step);
    return out;
  }
  chart.niceTicks = niceTicks;
  function legend(series, kind) {
    return el("div", { class: "s-legend" }, series.map(function (s, i) { return el("span", {}, el("i", { class: kind === "line" ? "is-line" : "", style: { background: s.color || PAL[i] } }), s.name); }));
  }
  chart.legend = legend;

  // Line / area chart with crosshair + tooltip (+ keyboard).
  // opt: {series:[{name, values:[[t,v]], color}], height:240, y:{min,max,ticks,format}, x:{format}, area, endLabels, refs:[{y,label}], ring, legend}
  chart.line = function (container, opt) {
    var root = el("div", { class: "s-chart" }); container.appendChild(root);
    if (opt.ring) root.style.setProperty("--ring", opt.ring);
    var holder = el("div"); root.appendChild(holder);
    var multi = opt.series.length > 1;
    if (multi && opt.legend !== false) root.appendChild(el("div", { class: "u-mt-2" }, legend(opt.series, "line")));
    var idx = -1, geom = null;
    function draw() {
      if (!root.clientWidth) return; // not laid out yet; the ResizeObserver draws once it is
      var W = Math.max(240, root.clientWidth), Hh = opt.height || 240;
      var series = opt.series, yf = (opt.y && opt.y.format) || fmt.pct0, xf = (opt.x && opt.x.format) || fmt.dayMon;
      var all = [].concat.apply([], series.map(function (s) { return s.values; }));
      var tmin = Math.min.apply(null, all.map(function (p) { return p[0]; })), tmax = Math.max.apply(null, all.map(function (p) { return p[0]; }));
      var vmin = opt.y && opt.y.min != null ? opt.y.min : Math.min.apply(null, all.map(function (p) { return p[1]; }));
      var vmax = opt.y && opt.y.max != null ? opt.y.max : Math.max.apply(null, all.map(function (p) { return p[1]; }));
      if (!(opt.y && opt.y.min != null)) { var pad = (vmax - vmin) * .12 || .01; vmin -= pad; vmax += pad; }
      var ticks = (opt.y && opt.y.ticks) || niceTicks(vmin, vmax, 4);
      if (!(opt.y && opt.y.min != null)) { vmin = Math.min(vmin, ticks[0]); vmax = Math.max(vmax, ticks[ticks.length - 1]); }
      var endLab = opt.endLabels !== false && series.length <= 4;
      var ml = 0, mr = endLab ? (multi ? 92 : 52) : 8, mt = 14, mb = 26, pw = W - ml - mr, ph = Hh - mt - mb;
      var X = function (t) { return ml + (tmax === tmin ? pw / 2 : (t - tmin) / (tmax - tmin) * pw); };
      var Y = function (v) { return mt + ph - (v - vmin) / (vmax - vmin || 1) * ph; };
      var svg = sv("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", "aria-label": opt.label || "Price chart", tabindex: "0" });
      var g = sv("g", { class: "grid" });
      ticks.forEach(function (t) {
        var y = Math.round(Y(t)) + .5; g.appendChild(sv("line", { x1: ml, x2: ml + pw, y1: y, y2: y }));
        var tx = sv("text", { x: ml, y: y - 5 }); tx.textContent = yf(t); svg.appendChild(tx);
      });
      svg.insertBefore(g, svg.firstChild);
      var nx = Math.max(2, Math.min(6, Math.floor(pw / 110)));
      for (var i = 0; i <= nx; i++) { var tt = tmin + (tmax - tmin) * i / nx, lx = X(tt); var t2 = sv("text", { x: lx, y: Hh - 6, "text-anchor": i === 0 ? "start" : i === nx ? "end" : "middle" }); t2.textContent = xf(tt); svg.appendChild(t2); }
      (opt.refs || []).forEach(function (r) { var y = Y(r.y); svg.appendChild(sv("line", { class: "ref", x1: ml, x2: ml + pw, y1: y, y2: y })); if (r.label) { var t3 = sv("text", { x: ml + 4, y: y - 5, class: "lbl" }); t3.textContent = r.label; svg.appendChild(t3); } });
      var ends = [];
      series.forEach(function (s, si) {
        var col = s.color || PAL[si], gS = sv("g", { class: "series" });
        var d = s.values.map(function (p, k) { return (k ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join("");
        if (opt.area || (!multi && opt.area !== false)) { var a = sv("path", { class: "area", d: d + "L" + X(s.values[s.values.length - 1][0]).toFixed(1) + " " + (mt + ph) + "L" + X(s.values[0][0]).toFixed(1) + " " + (mt + ph) + "Z" }); a.style.fill = col; gS.appendChild(a); }
        var ln = sv("path", { class: "line", d: d }); ln.style.stroke = col; if (s.dash) ln.setAttribute("stroke-dasharray", "4 4"); gS.appendChild(ln);
        var last = s.values[s.values.length - 1], dot = sv("circle", { class: "dot", cx: X(last[0]), cy: Y(last[1]), r: 4 }); dot.style.fill = col; gS.appendChild(dot);
        svg.appendChild(gS); ends.push({ y: Y(last[1]), v: last[1], s: s });
      });
      if (endLab) {
        var sorted = ends.slice().sort(function (a, b) { return a.y - b.y; }), clash = false;
        for (var k = 1; k < sorted.length; k++) if (sorted[k].y - sorted[k - 1].y < 26) clash = true;
        if (!clash) ends.forEach(function (e) {
          var tv = sv("text", { x: ml + pw + 10, y: e.y + (multi ? -1 : 4), class: "lbl-strong" }); tv.textContent = yf(e.v); svg.appendChild(tv);
          if (multi) { var nm = e.s.short || e.s.name, tn = sv("text", { x: ml + pw + 10, y: e.y + 12, class: "lbl" }); tn.textContent = nm.length > 13 ? nm.slice(0, 12) + "…" : nm; svg.appendChild(tn); }
        });
      }
      var xh = sv("line", { class: "xhair", y1: mt, y2: mt + ph, x1: 0, x2: 0, visibility: "hidden" }); svg.appendChild(xh);
      var hdots = series.map(function (s, si) { var c = sv("circle", { class: "dot", r: 4, cx: 0, cy: 0, visibility: "hidden" }); c.style.fill = s.color || PAL[si]; svg.appendChild(c); return c; });
      var hit = sv("rect", { class: "hit", x: ml, y: mt, width: pw, height: ph }); svg.appendChild(hit);
      geom = { X: X, Y: Y, series: series, xh: xh, hdots: hdots, svg: svg, yf: yf, tmin: tmin, tmax: tmax, ml: ml, pw: pw };
      function nearest(s, t) { var v = s.values, lo = 0, hi = v.length - 1; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (v[mid][0] < t) lo = mid; else hi = mid; } return Math.abs(v[lo][0] - t) < Math.abs(v[hi][0] - t) ? v[lo] : v[hi]; }
      function showAt(t, cx, cy) {
        var base = nearest(series[0], t), x = X(base[0]);
        xh.setAttribute("x1", x); xh.setAttribute("x2", x); xh.setAttribute("visibility", "visible");
        var rows = series.map(function (s, si) { var p = nearest(s, base[0]); hdots[si].setAttribute("cx", X(p[0])); hdots[si].setAttribute("cy", Y(p[1])); hdots[si].setAttribute("visibility", "visible"); return { label: s.name, value: yf(p[1]), color: s.color || PAL[si] }; });
        var bb = svg.getBoundingClientRect();
        S.tip.show(cx != null ? cx : bb.left + x * bb.width / W, cy != null ? cy : bb.top + 20, fmt.dateTime(base[0]), rows);
      }
      function hide() { xh.setAttribute("visibility", "hidden"); hdots.forEach(function (d) { d.setAttribute("visibility", "hidden"); }); S.tip.hide(); }
      hit.addEventListener("pointermove", function (e) { var bb = svg.getBoundingClientRect(), px = (e.clientX - bb.left) * W / bb.width; showAt(tmin + (px - ml) / pw * (tmax - tmin), e.clientX, e.clientY); });
      hit.addEventListener("pointerleave", hide);
      svg.addEventListener("blur", hide);
      svg.addEventListener("keydown", function (e) {
        var v = series[0].values; if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault();
        idx = idx < 0 ? v.length - 1 : Math.max(0, Math.min(v.length - 1, idx + (e.key === "ArrowRight" ? 1 : -1) * Math.max(1, Math.round(v.length / 40))));
        showAt(v[idx][0]);
      });
      clear(holder).appendChild(svg);
    }
    draw(); S.onResize(root, draw);
    return { el: root, update: function (o) { for (var k in o) opt[k] = o[k]; draw(); } };
  };

  // Sparkline -> SVG element. values: number[]
  chart.spark = function (values, o) {
    o = o || {}; var w = o.w || 96, h = o.h || 28, min = Math.min.apply(null, values), max = Math.max.apply(null, values), r = max - min || 1;
    var d = values.map(function (v, i) { return (i ? "L" : "M") + (2 + i / (values.length - 1) * (w - 6)).toFixed(1) + " " + (3 + (1 - (v - min) / r) * (h - 6)).toFixed(1); }).join("");
    var svg = sv("svg", { viewBox: "0 0 " + w + " " + h, width: w, height: h, "aria-hidden": "true", class: "s-spark" });
    var p = sv("path", { d: d, fill: "none", "stroke-width": 1.75, "stroke-linecap": "round", "stroke-linejoin": "round" }); p.style.stroke = o.color || "var(--c1)"; svg.appendChild(p);
    var lx = w - 4, ly = 3 + (1 - (values[values.length - 1] - min) / r) * (h - 6), c = sv("circle", { cx: lx, cy: ly, r: 2.6 }); c.style.fill = o.color || "var(--c1)"; svg.appendChild(c);
    return svg;
  };

  // Horizontal bar list (HTML). items [{label, value, color, note, muted}]; opt {max, format, labelWidth}
  chart.bars = function (container, items, opt) {
    opt = opt || {}; var max = opt.max || Math.max.apply(null, items.map(function (i) { return i.value; })) || 1, f = opt.format || fmt.pct0;
    var box = el("div", { class: "s-bars" });
    items.forEach(function (it) {
      var bar = el("i", { class: "s-bars__bar", style: { width: "calc(" + (it.value / max * 100).toFixed(2) + "% - 48px)", "--bar": it.color || "var(--c1)" } });
      var row = el("div", { class: "s-bars__row" + (it.muted ? " is-muted" : ""), attrs: { tabindex: "0" } }, el("span", { class: "s-bars__label", text: it.label, title: it.label }), el("span", { class: "s-bars__track" }, bar, el("span", { class: "s-bars__value", text: f(it.value) })));
      if (opt.labelWidth) row.style.gridTemplateColumns = opt.labelWidth + " minmax(0,1fr)";
      var show = function (e) { var bb = row.getBoundingClientRect(); S.tip.show(e && e.clientX || bb.left + bb.width / 2, e && e.clientY || bb.top, it.label, [{ label: it.note || "Value", value: f(it.value), color: it.color || "var(--c1)" }]); };
      row.addEventListener("pointermove", show); row.addEventListener("focus", function () { show(); }); row.addEventListener("pointerleave", S.tip.hide); row.addEventListener("blur", S.tip.hide);
      box.appendChild(row);
    });
    container.appendChild(box); return box;
  };

  // 100% stacked bar with 2px gaps + legend. items [{label, value, color}]; opt {fold:5, format, lg}
  chart.stack = function (container, items, opt) {
    opt = opt || {}; var f = opt.format || fmt.pct0, fold = opt.fold || 5, list = items.slice().sort(function (a, b) { return b.value - a.value; });
    if (list.length > fold + 1) { var rest = list.slice(fold).reduce(function (a, b) { return a + b.value; }, 0); list = list.slice(0, fold).concat([{ label: "Other (" + (items.length - fold) + ")", value: rest, color: "var(--c-other)" }]); }
    var tot = list.reduce(function (a, b) { return a + b.value; }, 0) || 1;
    var bar = el("div", { class: "s-stackbar" + (opt.lg ? " s-stackbar--lg" : ""), attrs: { role: "img", "aria-label": list.map(function (i) { return i.label + " " + f(i.value / tot); }).join(", ") } });
    list.forEach(function (it, i) {
      if (!it.color) it.color = PAL[i] || "var(--c-other)";
      var seg = el("i", { style: { flex: "0 0 calc(" + (it.value / tot * 100).toFixed(3) + "% - 2px)", "--seg": it.color }, attrs: { tabindex: "0" } });
      var show = function (e) { var bb = seg.getBoundingClientRect(); S.tip.show(e && e.clientX || bb.left, e && e.clientY || bb.top, it.label, [{ label: "Share", value: f(it.value / tot), color: it.color }]); };
      seg.addEventListener("pointermove", show); seg.addEventListener("focus", function () { show(); }); seg.addEventListener("pointerleave", S.tip.hide); seg.addEventListener("blur", S.tip.hide);
      bar.appendChild(seg);
    });
    var lg = el("div", { class: "s-legend u-mt-2" }, list.map(function (it) { return el("span", {}, el("i", { style: { background: it.color } }), it.label + " " + f(it.value / tot)); }));
    var w = el("div", {}, bar, lg); container.appendChild(w); return w;
  };

  // Forecast distribution as EF stacked bell curves ("waves").
  // opt: {curves:[{name, mean, sd, color}], domain:[0,10], height:200, markers:[{x,label}], xFormat, threshold}
  function erf(x) { var s = x < 0 ? -1 : 1; x = Math.abs(x); var t = 1 / (1 + .3275911 * x); var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x); return s * y; }
  function cdf(x, m, s) { return .5 * (1 + erf((x - m) / (s * Math.SQRT2))); }
  chart.cdf = cdf;
  chart.dist = function (container, opt) {
    var root = el("div", { class: "s-chart" }); container.appendChild(root);
    if (opt.ring) root.style.setProperty("--ring", opt.ring);
    var holder = el("div"); root.appendChild(holder);
    if (opt.curves.length > 1 && opt.legend !== false) root.appendChild(el("div", { class: "u-mt-2" }, legend(opt.curves, "line")));
    function draw() {
      if (!root.clientWidth) return;
      var W = Math.max(240, root.clientWidth), Hh = opt.height || 200, dom = opt.domain || [0, 10], xf = opt.xFormat || function (v) { return fmt.num(v, 1); };
      var ml = 4, mr = 4, mt = 14, mb = 24, pw = W - ml - mr, ph = Hh - mt - mb, N = 120;
      var X = function (v) { return ml + (v - dom[0]) / (dom[1] - dom[0]) * pw; };
      var peak = Math.max.apply(null, opt.curves.map(function (c) { return 1 / (c.sd * Math.sqrt(2 * Math.PI)); }));
      var Y = function (d) { return mt + ph - d / peak * ph * .92; };
      var svg = sv("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", "aria-label": opt.label || "Forecast distribution" });
      svg.appendChild(sv("line", { class: "xhair", x1: ml, x2: ml + pw, y1: mt + ph + .5, y2: mt + ph + .5, style: "opacity:1;stroke:var(--axis)" }));
      niceTicks(dom[0], dom[1], Math.max(3, Math.min(10, Math.floor(pw / 70)))).forEach(function (t) { var tx = sv("text", { x: X(t), y: Hh - 6, "text-anchor": "middle" }); tx.textContent = xf(t); svg.appendChild(tx); });
      opt.curves.forEach(function (c, ci) {
        var col = c.color || PAL[ci], pts = [];
        for (var i = 0; i <= N; i++) { var v = dom[0] + (dom[1] - dom[0]) * i / N, d = Math.exp(-.5 * Math.pow((v - c.mean) / c.sd, 2)) / (c.sd * Math.sqrt(2 * Math.PI)); pts.push(X(v).toFixed(1) + " " + Y(d).toFixed(1)); }
        var dd = "M" + pts.join("L"), gS = sv("g", { class: "series" });
        var a = sv("path", { class: "area", d: dd + "L" + X(dom[1]) + " " + (mt + ph) + "L" + X(dom[0]) + " " + (mt + ph) + "Z" }); a.style.fill = col; gS.appendChild(a);
        var ln = sv("path", { class: "line", d: dd }); ln.style.stroke = col; gS.appendChild(ln);
        svg.appendChild(gS);
      });
      (opt.markers || []).forEach(function (mk) { var x = X(mk.x); svg.appendChild(sv("line", { class: "ref", x1: x, x2: x, y1: mt, y2: mt + ph })); if (mk.label) { var t = sv("text", { x: x + 5, y: mt + 2, class: "lbl" }); t.textContent = mk.label; svg.appendChild(t); } });
      var xh = sv("line", { class: "xhair", y1: mt, y2: mt + ph, x1: 0, x2: 0, visibility: "hidden" }); svg.appendChild(xh);
      var hit = sv("rect", { class: "hit", x: ml, y: mt, width: pw, height: ph }); svg.appendChild(hit);
      hit.addEventListener("pointermove", function (e) {
        var bb = svg.getBoundingClientRect(), px = (e.clientX - bb.left) * W / bb.width, v = dom[0] + (px - ml) / pw * (dom[1] - dom[0]);
        xh.setAttribute("x1", px); xh.setAttribute("x2", px); xh.setAttribute("visibility", "visible");
        S.tip.show(e.clientX, e.clientY, (opt.xName || "Score") + " ≥ " + xf(v), opt.curves.map(function (c, ci) { return { label: c.name, value: fmt.pct0(1 - cdf(v, c.mean, c.sd)), color: c.color || PAL[ci] }; }));
      });
      hit.addEventListener("pointerleave", function () { xh.setAttribute("visibility", "hidden"); S.tip.hide(); });
      clear(holder).appendChild(svg);
    }
    draw(); S.onResize(root, draw);
    return { el: root, update: function (o) { for (var k in o) opt[k] = o[k]; draw(); } };
  };

  /* ======================= EF motifs (data-carrying) ======================= */
  var motif = S.motif = {};
  function frame(container, w, h, par) {
    var svg = sv("svg", { viewBox: "0 0 " + w + " " + h, preserveAspectRatio: par || "xMidYMid slice", "aria-hidden": "true", class: "s-motif-svg" });
    svg.style.width = "100%"; svg.style.height = "100%";
    clear(container).appendChild(svg); return svg;
  }
  // Converging wedges: weights -> wedge widths on the open edge, all meeting at one vanishing point (= one price).
  // opt: {weights:[...], colors:[...], gap:6, from:"left", focus:index, vp:[x,y] in 0..1, w, h}
  motif.wedges = function (container, opt) {
    opt = opt || {}; var w = opt.w || 1000, h = opt.h || 640, svg = frame(container, w, h, opt.par);
    var ws = opt.weights || [.18, .1, .14, .08, .2, .06, .12, .12], tot = ws.reduce(function (a, b) { return a + b; }, 0);
    var gap = opt.gap == null ? 10 : opt.gap, span = h - gap * (ws.length - 1), y = 0;
    var vp = opt.vp || [1, .5], vx = vp[0] * w, vy = vp[1] * h, x0 = opt.from === "right" ? w : 0;
    ws.forEach(function (v, i) {
      var hh = v / tot * span, poly = sv("polygon", { points: x0 + "," + y.toFixed(1) + " " + x0 + "," + (y + hh).toFixed(1) + " " + vx + "," + vy });
      poly.style.fill = (opt.colors && opt.colors[i]) || "currentColor";
      if (opt.focus != null) poly.style.opacity = i === opt.focus ? 1 : .32; else if (opt.fade) poly.style.opacity = String(1 - i / ws.length * .6);
      if (opt.titles && opt.titles[i]) { var t = sv("title"); t.textContent = opt.titles[i]; poly.appendChild(t); }
      svg.appendChild(poly); y += hh + gap;
    });
    return svg;
  };
  // Stacked bell waves (poster): count curves fading downward. opt {count:5, stroke:28, w, h, peak:.5}
  motif.waves = function (container, opt) {
    opt = opt || {}; var w = opt.w || 1000, h = opt.h || 700, svg = frame(container, w, h, opt.par), n = opt.count || 5, sw = opt.stroke || 30;
    for (var i = 0; i < n; i++) {
      var base = h * .42 + i * h * .14, amp = h * (.3 - i * .035), cx = w * (opt.peak || .5), spread = w * (.17 + i * .012), d = "";
      for (var k = 0; k <= 80; k++) { var x = -40 + (w + 80) * k / 80, yy = base - amp * Math.exp(-.5 * Math.pow((x - cx) / spread, 2)); d += (k ? "L" : "M") + x.toFixed(1) + " " + yy.toFixed(1); }
      var p = sv("path", { d: d, fill: "none", "stroke-width": sw, "stroke-linecap": "round" }); p.style.stroke = "currentColor"; p.style.opacity = String(1 - i * (.8 / n));
      svg.appendChild(p);
    }
    return svg;
  };
  // Dot grid dissolving into a cross-hair line grid (uncertainty -> structure). opt {cols:24, rows:10, dissolve:.62, cell:40}
  motif.dotgrid = function (container, opt) {
    opt = opt || {}; var c = opt.cell || 40, cols = opt.cols || 26, rows = opt.rows || 10, w = cols * c, h = rows * c, svg = frame(container, w, h, opt.par || "xMidYMid slice");
    var start = Math.floor(cols * (opt.dissolve || .62));
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
      var x = i * c + c / 2, y = j * c + c / 2;
      if (i < start) { var d = sv("circle", { cx: x, cy: y, r: 1.3 }); d.style.fill = "currentColor"; d.style.opacity = ".35"; svg.appendChild(d); }
      else {
        var k = (i - start) / Math.max(1, cols - start), op = (.25 + .75 * k) * (1 - j / rows * .55), len = c * (.25 + .5 * k);
        var p = sv("path", { d: "M" + (x - len) + " " + y + "H" + (x + len) + "M" + x + " " + (y - len) + "V" + (y + len), "stroke-width": 1.2, fill: "none" });
        p.style.stroke = j < rows * .45 ? "var(--violet-2)" : "currentColor"; p.style.opacity = String(op.toFixed(2)); svg.appendChild(p);
      }
    }
    return svg;
  };
  // 45° fork: one stem splitting into two branches (pass / fail). opt {split:.38, a:"YES", b:"NO", wa:3, wb:3, values:[ya, yb]}
  motif.fork = function (container, opt) {
    opt = opt || {}; var w = opt.w || 1000, h = opt.h || 600, svg = frame(container, w, h, opt.par || "xMidYMid meet");
    var sx = w * (opt.split || .38), sy = h / 2, ex = w - 40, dy = ex - sx;
    var grid = sv("g", { fill: "none", "stroke-width": 1 }); grid.style.stroke = "currentColor"; grid.style.opacity = ".22";
    for (var k = -6; k <= 12; k++) { grid.appendChild(sv("path", { d: "M" + (k * 90) + " 0 L" + (k * 90 + h) + " " + h })); grid.appendChild(sv("path", { d: "M" + (k * 90) + " " + h + " L" + (k * 90 + h) + " 0" })); }
    grid.appendChild(sv("circle", { cx: sx, cy: sy, r: 70 })); grid.appendChild(sv("circle", { cx: sx, cy: sy, r: 140 }));
    svg.appendChild(grid);
    var ya = Math.max(20, sy - dy), yb = Math.min(h - 20, sy + dy);
    var stem = sv("path", { d: "M0 " + sy + "H" + sx, fill: "none", "stroke-width": opt.ws || 6, "stroke-linecap": "round" }); stem.style.stroke = "currentColor"; svg.appendChild(stem);
    var A = sv("path", { d: "M" + sx + " " + sy + "L" + (sx + (sy - ya)) + " " + ya + "H" + ex, fill: "none", "stroke-width": opt.wa || 6, "stroke-linecap": "round", "stroke-linejoin": "round" }); A.style.stroke = opt.colorA || "var(--c-yes)"; svg.appendChild(A);
    var B = sv("path", { d: "M" + sx + " " + sy + "L" + (sx + (yb - sy)) + " " + yb + "H" + ex, fill: "none", "stroke-width": opt.wb || 6, "stroke-linecap": "round", "stroke-linejoin": "round" }); B.style.stroke = opt.colorB || "var(--c-no)"; svg.appendChild(B);
    [[ex, ya, opt.colorA || "var(--c-yes)"], [ex, yb, opt.colorB || "var(--c-no)"], [sx, sy, "currentColor"]].forEach(function (p) { var c = sv("circle", { cx: p[0], cy: p[1], r: 11 }); c.style.fill = p[2]; svg.appendChild(c); });
    return svg;
  };
  // Data barcode: horizontal bars of varying length (a field of entries). opt {values:[0..1], highlight:[i], gap:6, bar:14}
  motif.barcode = function (container, opt) {
    opt = opt || {}; var vals = opt.values || [], n = vals.length || 1, bh = opt.bar || 14, gap = opt.gap == null ? 6 : opt.gap, w = opt.w || 400, h = n * (bh + gap) - gap;
    var svg = frame(container, w, h, opt.par || "none"), hl = opt.highlight || [];
    vals.forEach(function (v, i) {
      var r = sv("rect", { x: 0, y: i * (bh + gap), width: Math.max(4, v * w), height: bh, rx: 2 });
      r.style.fill = hl.indexOf(i) > -1 ? "var(--violet-2)" : "var(--c-other)";
      if (opt.titles && opt.titles[i]) { var t = sv("title"); t.textContent = opt.titles[i]; r.appendChild(t); }
      svg.appendChild(r);
    });
    return svg;
  };
  // 45° parallel line field. opt {gap:28, width:2, w, h}
  motif.stripes = function (container, opt) {
    opt = opt || {}; var w = opt.w || 800, h = opt.h || 500, svg = frame(container, w, h, opt.par), gap = opt.gap || 28;
    var g = sv("g", { fill: "none", "stroke-width": opt.width || 2, "stroke-linecap": "round" }); g.style.stroke = "currentColor";
    for (var x = -h; x < w + h; x += gap) g.appendChild(sv("path", { d: "M" + x + " " + h + " L" + (x + h) + " 0" }));
    if (opt.opacity) g.style.opacity = opt.opacity;
    svg.appendChild(g); return svg;
  };
})();
